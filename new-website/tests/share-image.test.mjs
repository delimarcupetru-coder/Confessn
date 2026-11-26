import assert from 'node:assert/strict'
import { test } from 'node:test'
import { preparePublicImage, sharePublicImage } from '../src/share-image.ts'

test('prepares and shares the original image as a file, without saving it', async context => {
  const blob = new Blob(['image'], { type: 'image/png' })
  context.mock.method(globalThis, 'fetch', async () => new Response(blob))
  const file = await preparePublicImage('https://example.test/public.png', 'My / Artwork')
  assert.equal(file.name, 'My - Artwork.png')
  assert.equal(file.type, 'image/png')
  assert.equal(await file.text(), 'image')
  const canShare = context.mock.fn(data => data.files[0] === file)
  const share = context.mock.fn(async () => {})
  Object.defineProperties(navigator, { canShare: { value: canShare, configurable: true }, share: { value: share, configurable: true } })
  context.after(() => { delete navigator.canShare; delete navigator.share })
  await sharePublicImage(file)
  assert.equal(canShare.mock.callCount(), 1)
  assert.deepEqual(share.mock.calls[0].arguments[0], { files: [file] })
})

test('reports unavailable or unsupported images and browsers', async context => {
  const fetchMock = context.mock.method(globalThis, 'fetch', async () => new Response(null, { status: 404 }))
  await assert.rejects(preparePublicImage('https://example.test/missing', 'Artwork'), /Could not prepare/)
  fetchMock.mock.mockImplementation(async () => new Response('not an image', { headers: { 'Content-Type': 'text/html' } }))
  await assert.rejects(preparePublicImage('https://example.test/invalid', 'Artwork'), /format cannot be shared/)
  Object.defineProperties(navigator, { canShare: { value: () => false, configurable: true }, share: { value: async () => {}, configurable: true } })
  context.after(() => { delete navigator.canShare; delete navigator.share })
  assert.throws(() => sharePublicImage(new File(['image'], 'art.png', { type: 'image/png' })), /not available in this browser/)
})
