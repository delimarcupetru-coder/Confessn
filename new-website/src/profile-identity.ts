type ProfileIdentity = { name: string; email: string }
type AuthIdentity = { email?: string; user_metadata: { username?: unknown } }

export function profileFormIdentity(account: ProfileIdentity, user: AuthIdentity | null) {
  const name = typeof user?.user_metadata.username === 'string' ? user.user_metadata.username : account.name
  const email = user?.email ?? (account.email === 'hello@virtualartframingstudio.com' ? '' : account.email)
  return { name: name === 'Guest customer' ? '' : name, email }
}

export function profileEmailChanged(email: string, user: AuthIdentity) {
  return email.trim().toLowerCase() !== user.email?.toLowerCase()
}
