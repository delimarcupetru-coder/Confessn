import assert from 'node:assert/strict'
import test from 'node:test'
import { readStoredAccount, readStoredRecord, writeStoredAccount, writeStoredRecord } from '../src/account-storage.ts'

test('account caches are isolated and do not import the old shared cache', async () => {
  const records = new Map()
  globalThis.indexedDB = {
    open() {
      const request = {}
      const database = {
        close() {},
        transaction() {
          const transaction = {
            objectStore() {
              return {
                get(key) {
                  const result = { result: records.get(key) }
                  queueMicrotask(() => result.onsuccess())
                  return result
                },
                put(value, key) {
                  records.set(key, value)
                  queueMicrotask(() => transaction.oncomplete())
                },
              }
            },
          }
          return transaction
        },
      }
      request.result = database
      queueMicrotask(() => request.onsuccess())
      return request
    },
  }
  try {
    await writeStoredRecord('current', { projects: ['legacy'] })
    await writeStoredAccount('alice', { projects: ['alice'] })
    assert.equal(await readStoredAccount('bob'), undefined)
    await writeStoredAccount('bob', { projects: ['bob'] })
    assert.deepEqual(await readStoredAccount('alice'), { projects: ['alice'] })
    assert.deepEqual(await readStoredAccount('bob'), { projects: ['bob'] })
    assert.deepEqual(await readStoredRecord('current'), { projects: ['legacy'] })
    await writeStoredRecord('profile-avatar:alice', 'data:image/png;base64,test')
    assert.deepEqual(await readStoredAccount('alice'), { projects: ['alice'] })
    assert.equal(await readStoredRecord('profile-avatar:bob'), undefined)
    assert.equal(await readStoredRecord('profile-avatar:alice'), 'data:image/png;base64,test')
  } finally {
    delete globalThis.indexedDB
  }
})
