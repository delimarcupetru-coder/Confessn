import {
  generateRegistrationOptions,
  generateAuthenticationOptions,
  verifyRegistrationResponse,
  verifyAuthenticationResponse,
  type RegistrationResponseJSON,
  type AuthenticationResponseJSON,
  type AuthenticatorTransportFuture,
} from 'npm:@simplewebauthn/server@13'

type PasskeyRecord = { credential_id: string; public_key: string; sign_count: number; transports: AuthenticatorTransportFuture[] }
class BankError extends Error {
  constructor(message: string, public status = 400, public code?: string) { super(message) }
}
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const encode = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
const decode = (text: string) => Uint8Array.from(atob(text.replace(/-/g, '+').replace(/_/g, '/')), (character) => character.charCodeAt(0))

const handleBankPasskeys = async (request: Request): Promise<Response> => {
  const origin = request.headers.get('Origin') ?? ''
  let location: URL
  try { location = new URL(origin) } catch { return new Response('Forbidden', { status: 403 }) }
  const allowed = ['https://confessn.com', 'https://www.confessn.com', 'https://delimarcupetru-coder.github.io'].includes(origin)
    || (location.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(location.hostname))
  if (!allowed) return new Response('Forbidden', { status: 403 })
  const headers = {
    'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS', Vary: 'Origin',
  }
  const respond = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers })
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers })
  if (request.method !== 'POST') return respond({ error: 'Method not allowed.' }, 405)
  try {
    const authorization = request.headers.get('Authorization') ?? ''
    if (!authorization.startsWith('Bearer ')) throw new BankError('Sign in to FRAME first.', 401)
    const url = Deno.env.get('SUPABASE_URL')
    const publicKey = Deno.env.get('SUPABASE_ANON_KEY')
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!url || !publicKey || !serviceKey) throw new BankError('Bank passkeys are temporarily unavailable.', 503)
    const userResponse = await fetch(`${url}/auth/v1/user`, { headers: { apikey: publicKey, Authorization: authorization } })
    if (!userResponse.ok) throw new BankError('Your FRAME session has expired. Please sign in again.', 401)
    const user = await userResponse.json()
    let claims: { sub?: string; session_id?: string; aal?: string }
    try { claims = JSON.parse(atob(authorization.slice(7).split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))) }
    catch { throw new BankError('Invalid FRAME session.', 401) }
    if (!user.id || user.is_anonymous || claims.sub !== user.id || !claims.session_id || !uuidPattern.test(claims.session_id)) {
      throw new BankError('A registered FRAME account is required.', 403)
    }
    const text = await request.text()
    if (text.length > 32768) throw new BankError('Request too large.', 413)
    let body: { action?: string; password?: string; request_id?: string; response?: RegistrationResponseJSON | AuthenticationResponseJSON }
    try { body = JSON.parse(text) } catch { throw new BankError('Invalid request.') }
    if (!body || !['status', 'registration-options', 'authentication-options', 'verify'].includes(body.action ?? '')) throw new BankError('Invalid request.')
    const rpID = location.hostname
    const database = async (resource: string, options: RequestInit = {}) => {
      const response = await fetch(`${url}/rest/v1/${resource}`, {
        ...options,
        headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json', ...options.headers },
      })
      if (!response.ok) {
        const error = await response.json().catch(() => ({}))
        if (['P0001', '28000', '22023'].includes(error.code)) throw new BankError(error.message, error.code === 'P0001' ? 429 : 400)
        if (error.code === '23505') throw new BankError('A passkey is already registered or this request was already used. Please unlock with your existing passkey.')
        throw new BankError('Bank passkeys are temporarily unavailable. Please try again later.', 503)
      }
      return response.json()
    }
    const rpc = (name: string, values: Record<string, unknown>) => database(`rpc/${name}`, { method: 'POST', body: JSON.stringify(values) })
    const credentials: PasskeyRecord[] = await database(`frame_bank_passkeys?select=credential_id,public_key,sign_count,transports&user_id=eq.${encodeURIComponent(user.id)}&rp_id=eq.${encodeURIComponent(rpID)}`)
    const needsMfa = Array.isArray(user.factors) && user.factors.some((factor: { status?: string }) => factor.status === 'verified') && claims.aal !== 'aal2'
    if (body.action === 'status') return respond({ registered: credentials.length > 0, requires_mfa_approval: credentials.length === 0 && needsMfa })

    if (body.action === 'registration-options') {
      if (credentials.length) throw new BankError('Use the passkey already registered for this bank account.')
      if (needsMfa) throw new BankError('Verify your existing authenticator once before adding a passkey.', 403, 'MFA_REQUIRED')
      if (typeof body.password !== 'string' || !body.password || body.password.length > 1024 || !user.email) throw new BankError('Enter your current FRAME password to register a passkey.')
      const passwordResponse = await fetch(`${url}/auth/v1/token?grant_type=password`, {
        method: 'POST', headers: { apikey: publicKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: user.email, password: body.password }),
      })
      if (!passwordResponse.ok) throw new BankError('The FRAME password could not be verified. Please try again.', 403)
      const passwordSession = await passwordResponse.json()
      if (passwordSession.user?.id !== user.id) throw new BankError('Account verification failed.', 403)
      if (passwordSession.access_token) {
        await fetch(`${url}/auth/v1/logout?scope=local`, { method: 'POST', headers: { apikey: publicKey, Authorization: `Bearer ${passwordSession.access_token}` } }).catch(() => undefined)
      }
      const options = await generateRegistrationOptions({
        rpName: 'Tzol Bank', rpID, userName: user.email, userID: new TextEncoder().encode(user.id),
        userDisplayName: String(user.user_metadata?.username ?? 'FRAME member').slice(0, 128),
        attestationType: 'none', authenticatorSelection: { residentKey: 'preferred', userVerification: 'required' },
      })
      const requestId = await rpc('begin_frame_bank_passkey', { p_user_id: user.id, p_session_id: claims.session_id, p_rp_id: rpID, p_ceremony: 'registration', p_challenge: options.challenge })
      return respond({ request_id: requestId, options, ceremony: 'registration' })
    }
    if (body.action === 'authentication-options') {
      if (!credentials.length) throw new BankError('Register a passkey for this bank account first.')
      const options = await generateAuthenticationOptions({ rpID, userVerification: 'required', allowCredentials: credentials.map((credential) => ({ id: credential.credential_id, transports: credential.transports })) })
      const requestId = await rpc('begin_frame_bank_passkey', { p_user_id: user.id, p_session_id: claims.session_id, p_rp_id: rpID, p_ceremony: 'authentication', p_challenge: options.challenge })
      return respond({ request_id: requestId, options, ceremony: 'authentication' })
    }
    if (typeof body.request_id !== 'string' || !uuidPattern.test(body.request_id) || !body.response || typeof body.response !== 'object') throw new BankError('Invalid passkey response.')
    const challenge = await rpc('attempt_frame_bank_passkey', { p_user_id: user.id, p_session_id: claims.session_id, p_request_id: body.request_id, p_rp_id: rpID })
    let verifiedCredential: { id: string; public_key: string; counter: number; transports: AuthenticatorTransportFuture[] }
    let expectedCounter: number | null = null
    try {
      if (challenge.ceremony === 'registration') {
        if (credentials.length) throw new Error('Already registered')
        const result = await verifyRegistrationResponse({ response: body.response as RegistrationResponseJSON, expectedChallenge: challenge.challenge, expectedOrigin: origin, expectedRPID: rpID, requireUserVerification: true })
        if (!result.verified || !result.registrationInfo) throw new Error('Registration failed')
        const credential = result.registrationInfo.credential
        verifiedCredential = { id: credential.id, public_key: encode(credential.publicKey), counter: credential.counter, transports: credential.transports ?? [] }
      } else if (challenge.ceremony === 'authentication') {
        const credential = credentials.find((item) => item.credential_id === body.response?.id)
        if (!credential) throw new Error('Unknown credential')
        expectedCounter = Number(credential.sign_count)
        const result = await verifyAuthenticationResponse({
          response: body.response as AuthenticationResponseJSON, expectedChallenge: challenge.challenge, expectedOrigin: origin, expectedRPID: rpID,
          credential: { id: credential.credential_id, publicKey: decode(credential.public_key), counter: expectedCounter, transports: credential.transports }, requireUserVerification: true,
        })
        if (!result.verified) throw new Error('Authentication failed')
        verifiedCredential = { id: credential.credential_id, public_key: credential.public_key, counter: result.authenticationInfo.newCounter, transports: credential.transports }
      } else throw new Error('Invalid ceremony')
    } catch { throw new BankError('Passkey verification failed. Please try again with your registered device.', 403) }
    const unlockToken = Array.from(crypto.getRandomValues(new Uint8Array(32)), (value) => value.toString(16).padStart(2, '0')).join('')
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(unlockToken))
    const tokenHash = Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, '0')).join('')
    const access = await rpc('complete_frame_bank_passkey', {
      p_user_id: user.id, p_session_id: claims.session_id, p_request_id: body.request_id, p_rp_id: rpID,
      p_credential: verifiedCredential, p_token_hash: tokenHash, p_expected_counter: expectedCounter,
    })
    return respond({ unlock_token: unlockToken, expires_at: access.expires_at })
  } catch (error) {
    if (error instanceof BankError) return respond({ error: error.message, code: error.code }, error.status)
    return respond({ error: 'Bank passkeys are temporarily unavailable. Please try again later.' }, 503)
  }
}

Deno.serve(handleBankPasskeys)