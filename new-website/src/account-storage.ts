function openAccountDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('virtual-art-framing-studio-projects', 1)
    request.onupgradeneeded = () => request.result.createObjectStore('accounts')
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export async function readStoredRecord<RecordType>(key: string): Promise<RecordType | undefined> {
  const database = await openAccountDatabase()
  try {
    return await new Promise<RecordType | undefined>((resolve, reject) => {
      const request = database.transaction('accounts', 'readonly').objectStore('accounts').get(key)
      request.onsuccess = () => resolve(request.result as RecordType | undefined)
      request.onerror = () => reject(request.error)
    })
  } finally {
    database.close()
  }
}

export async function writeStoredRecord<RecordType>(key: string, record: RecordType) {
  const database = await openAccountDatabase()
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction('accounts', 'readwrite')
      transaction.objectStore('accounts').put(record, key)
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error)
      transaction.onabort = () => reject(transaction.error)
    })
  } finally {
    database.close()
  }
}

export function readStoredAccount<Account>(userId: string) {
  return readStoredRecord<Account>(`account:${userId}`)
}

export function writeStoredAccount<Account>(userId: string, account: Account) {
  return writeStoredRecord(`account:${userId}`, account)
}
