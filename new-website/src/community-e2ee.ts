type DeviceIdentity = {
  deviceId: string
  privateKey: CryptoKey
  publicKey: JsonWebKey
}
type StoredIdentity = { privateKey: CryptoKey; publicKey: JsonWebKey }

const databaseName = 'confessn-community-e2ee'
const storeName = 'device-keys'

const bytesToBase64 = (bytes: ArrayBuffer | Uint8Array) => {
  let binary = ''
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  for (const byte of view) binary += String.fromCharCode(byte)
  return btoa(binary)
}

const base64ToBytes = (value: string) => {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index)
  return bytes
}

const openDatabase = () => new Promise<IDBDatabase>((resolve, reject) => {
  const request = indexedDB.open(databaseName, 1)
  request.onupgradeneeded = () => {
    if (!request.result.objectStoreNames.contains(storeName)) request.result.createObjectStore(storeName)
  }
  request.onsuccess = () => resolve(request.result)
  request.onerror = () => reject(request.error ?? new Error('The encrypted chat key store could not be opened.'))
})

const readStoredIdentity = async (deviceId: string) => {
  const database = await openDatabase()
  try {
    return await new Promise<StoredIdentity | undefined>((resolve, reject) => {
      const request = database.transaction(storeName, 'readonly').objectStore(storeName).get(deviceId)
      request.onsuccess = () => resolve(request.result as StoredIdentity | undefined)
      request.onerror = () => reject(request.error ?? new Error('The encrypted chat key could not be read.'))
    })
  } finally {
    database.close()
  }
}

const writeStoredIdentity = async (deviceId: string, identity: StoredIdentity) => {
  const database = await openDatabase()
  try {
    await new Promise<void>((resolve, reject) => {
      const request = database.transaction(storeName, 'readwrite').objectStore(storeName).put(identity, deviceId)
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error ?? new Error('The encrypted chat key could not be saved.'))
    })
  } finally {
    database.close()
  }
}

export const getDeviceId = () => {
  const key = 'confessn-community-device-id'
  const saved = window.localStorage.getItem(key)
  if (saved) return saved
  const deviceId = crypto.randomUUID()
  window.localStorage.setItem(key, deviceId)
  return deviceId
}

export async function ensureDeviceIdentity(supabase: {
  from: (table: string) => any
}, userId: string): Promise<DeviceIdentity> {
  if (!crypto.subtle || typeof indexedDB === 'undefined') throw new Error('Encrypted chat requires a modern browser with secure HTTPS access.')
  const deviceId = getDeviceId()
  let stored = await readStoredIdentity(deviceId)
  let publicKey: JsonWebKey
  let privateKey: CryptoKey
  if (!stored) {
    const pair = await crypto.subtle.generateKey({
      name: 'RSA-OAEP',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    }, true, ['encrypt', 'decrypt']) as CryptoKeyPair
    privateKey = pair.privateKey
    publicKey = await crypto.subtle.exportKey('jwk', pair.publicKey)
    await writeStoredIdentity(deviceId, { privateKey, publicKey })
  } else {
    privateKey = stored.privateKey
    publicKey = stored.publicKey
  }
  const result = await supabase.from('community_device_keys').upsert({
    user_id: userId,
    device_id: deviceId,
    public_key: JSON.stringify(publicKey),
  }, { onConflict: 'user_id,device_id' })
  if (result.error) throw new Error(result.error.message)
  return { deviceId, privateKey, publicKey }
}

export async function unwrapConversationKey(
  supabase: { from: (table: string) => any },
  conversationId: string,
  userId: string,
  identity: DeviceIdentity,
): Promise<CryptoKey | null> {
  const result = await supabase.from('community_conversation_keys')
    .select('wrapped_key')
    .eq('conversation_id', conversationId)
    .eq('user_id', userId)
    .eq('device_id', identity.deviceId)
    .maybeSingle()
  if (result.error) throw new Error(result.error.message)
  if (!result.data?.wrapped_key) return null
  const wrapped = base64ToBytes(result.data.wrapped_key)
  const wrappedBuffer = wrapped.buffer.slice(wrapped.byteOffset, wrapped.byteOffset + wrapped.byteLength) as ArrayBuffer
  const raw = await crypto.subtle.decrypt(
    { name: 'RSA-OAEP' },
    identity.privateKey,
    wrappedBuffer,
  )
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt'])
}

export async function wrapConversationKey(
  publicKey: JsonWebKey,
  conversationKey: CryptoKey,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    'jwk',
    publicKey,
    { name: 'RSA-OAEP', hash: 'SHA-256' },
    false,
    ['encrypt'],
  )
  const raw = await crypto.subtle.exportKey('raw', conversationKey)
  const wrapped = await crypto.subtle.encrypt({ name: 'RSA-OAEP' }, key, raw)
  return bytesToBase64(wrapped)
}

export async function encryptChatMessage(conversationKey: CryptoKey, text: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ivBuffer = iv.buffer.slice(iv.byteOffset, iv.byteOffset + iv.byteLength) as ArrayBuffer
  const plaintextBuffer = new TextEncoder().encode(text).buffer as ArrayBuffer
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: ivBuffer },
    conversationKey,
    plaintextBuffer,
  )
  return `${bytesToBase64(iv)}.${bytesToBase64(ciphertext)}`
}

export async function encryptChatAttachment(conversationKey: CryptoKey, file: File) {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ivBuffer = iv.buffer.slice(iv.byteOffset, iv.byteOffset + iv.byteLength) as ArrayBuffer
  const plaintext = await file.arrayBuffer()
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: ivBuffer }, conversationKey, plaintext)
  return {
    iv: bytesToBase64(iv),
    ciphertext: new Blob([ciphertext], { type: 'application/octet-stream' }),
  }
}

export async function decryptChatAttachment(conversationKey: CryptoKey, ciphertext: ArrayBuffer, ivBase64: string) {
  const iv = base64ToBytes(ivBase64)
  const ivBuffer = iv.buffer.slice(iv.byteOffset, iv.byteOffset + iv.byteLength) as ArrayBuffer
  return crypto.subtle.decrypt({ name: 'AES-GCM', iv: ivBuffer }, conversationKey, ciphertext)
}

export async function decryptChatMessage(conversationKey: CryptoKey, body: string) {
  const separator = body.indexOf('.')
  if (separator < 1) throw new Error('This message has an invalid encrypted format.')
  const iv = base64ToBytes(body.slice(0, separator))
  const ciphertext = base64ToBytes(body.slice(separator + 1))
  const ivBuffer = iv.buffer.slice(iv.byteOffset, iv.byteOffset + iv.byteLength) as ArrayBuffer
  const ciphertextBuffer = ciphertext.buffer.slice(ciphertext.byteOffset, ciphertext.byteOffset + ciphertext.byteLength) as ArrayBuffer
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: ivBuffer },
    conversationKey,
    ciphertextBuffer,
  )
  return new TextDecoder().decode(plaintext)
}

export function getConversationKeyError(error: unknown) {
  return error instanceof Error ? error.message : 'The encrypted chat key could not be prepared.'
}

export async function ensureConversationKey(
  supabase: { from: (table: string) => any },
  conversationId: string,
  userId: string,
  participantIds: string[],
  identity: DeviceIdentity,
): Promise<CryptoKey> {
  const existing = await unwrapConversationKey(supabase, conversationId, userId, identity)
  if (existing) return existing

  const conversationKey = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt'],
  ) as CryptoKey

  const devicesResult = await supabase.from('community_device_keys')
    .select('user_id,device_id,public_key')
    .in('user_id', participantIds)
  if (devicesResult.error) throw new Error(devicesResult.error.message)
  const devices = (devicesResult.data ?? []) as Array<{ user_id: string; device_id: string; public_key: string }>
  if (!devices.some(device => device.user_id === userId && device.device_id === identity.deviceId)) {
    throw new Error('This browser has no registered encrypted-chat key.')
  }

  const wraps = await Promise.all(devices.map(async device => ({
    conversation_id: conversationId,
    user_id: device.user_id,
    device_id: device.device_id,
    wrapped_key: await wrapConversationKey(JSON.parse(device.public_key) as JsonWebKey, conversationKey),
  })))
  const wrapResult = await supabase.from('community_conversation_keys').upsert(wraps, {
    onConflict: 'conversation_id,user_id,device_id',
  })
  if (wrapResult.error) throw new Error(wrapResult.error.message)
  return conversationKey
}
