import test from 'node:test'
import assert from 'node:assert/strict'
import { profileEmailChanged, profileFormIdentity } from '../src/profile-identity.ts'

test('authenticated identity takes precedence over stale cached placeholders', () => {
  const account = { name: 'Guest customer', email: 'hello@virtualartframingstudio.com' }
  const user = { email: 'member@example.test', user_metadata: { username: 'Member' } }
  assert.deepEqual(profileFormIdentity(account, user), { name: 'Member', email: 'member@example.test' })
  assert.equal(profileEmailChanged(' MEMBER@example.test ', user), false)
  assert.equal(profileEmailChanged('other@example.test', user), true)
  assert.deepEqual(account, { name: 'Guest customer', email: 'hello@virtualartframingstudio.com' })
})

test('legacy placeholders are not shown when authenticated identity is missing', () => {
  const user = { user_metadata: {} }
  assert.deepEqual(profileFormIdentity({ name: 'Guest customer', email: 'hello@virtualartframingstudio.com' }, user), { name: '', email: '' })
  assert.deepEqual(profileFormIdentity({ name: 'Member', email: 'member@example.test' }, user), { name: 'Member', email: 'member@example.test' })
  assert.equal(profileEmailChanged('member@example.test', user), true)
})

test('a genuine authenticated email is shown even if it matches the former placeholder', () => {
  const user = { email: 'hello@virtualartframingstudio.com', user_metadata: {} }
  assert.equal(profileFormIdentity({ name: '', email: '' }, user).email, user.email)
  assert.equal(profileEmailChanged(user.email, user), false)
})
