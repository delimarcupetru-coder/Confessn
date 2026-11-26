import assert from 'node:assert/strict'
import { mock, test } from 'node:test'
import { downloadPublicImage } from '../src/share-image.ts'

test('downloads the original public image with a safe filename', async context => {
  const blob = new Blob(['image'], { type: 'image/png' })
  const link = { click: mock.fn(), remove: mock.fn() }
  context.mock.method(globalThis, 'fetch', async () => new Response(blob))
  context.mock.method(URL, 'createObjectURL', source => {
    assert.equal(source.type, 'image/png')
    return 'blob:public-image'
  })
  context.mock.method(URL, 'revokeObjectURL', () => {})
  globalThis.document = { createElement: () => link, body: { append: mock.fn() } }
  globalThis.window = { setTimeout: callback => callback() }
  context.after(() => { delete globalThis.document; delete globalThis.window })
  await downloadPublicImage('https://example.test/public.png', 'My / Artwork')
  assert.equal(link.href, 'blob:public-image')
  assert.equal(link.download, 'My - Artwork.png')
  assert.equal(link.click.mock.callCount(), 1)
  assert.equal(link.remove.mock.callCount(), 1)
  assert.equal(URL.revokeObjectURL.mock.callCount(), 1)
})

test('reports unavailable or unsupported images without starting a download', async context => {
  const fetchMock = context.mock.method(globalThis, 'fetch', async () => new Response(null, { status: 404 }))
  await assert.rejects(downloadPublicImage('https://example.test/missing', 'Artwork'), /Could not download/)
  fetchMock.mock.mockImplementation(async () => new Response('not an image', { headers: { 'Content-Type': 'text/html' } }))
  await assert.rejects(downloadPublicImage('https://example.test/invalid', 'Artwork'), /format cannot be downloaded/)
})
