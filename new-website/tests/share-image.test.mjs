import assert from 'node:assert/strict'
import { test } from 'node:test'
import { prepareInstagramImage, preparePublicImage, sharePublicImage } from '../src/share-image.ts'

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

test('Instagram adds clearance to square frames but leaves other orientations unchanged', async context => {
  context.mock.method(globalThis, 'fetch', async () => new Response(new Blob(['image'], { type: 'image/png' })))
  let dimensions
  let draw
  let output = new Blob(['instagram'], { type: 'image/jpeg' })
  const revoke = context.mock.method(URL, 'revokeObjectURL')
  const canvas = {
    width: 0, height: 0,
    getContext: () => ({ fillRect() {}, drawImage: (...args) => { draw = args.slice(1) } }),
    toBlob: callback => callback(output),
  }
  const previousImage = globalThis.Image
  const previousDocument = globalThis.document
  globalThis.Image = class {
    get naturalWidth() { return dimensions[0] }
    get naturalHeight() { return dimensions[1] }
    set src(_source) { this.onload() }
  }
  globalThis.document = { createElement: () => canvas }
  context.after(() => {
    if (previousImage === undefined) delete globalThis.Image
    else globalThis.Image = previousImage
    if (previousDocument === undefined) delete globalThis.document
    else globalThis.document = previousDocument
  })
  for (dimensions of [[1200, 1200], [800, 1600], [1600, 800]]) {
    draw = undefined
    const file = await prepareInstagramImage('https://example.test/public.png', 'Artwork')
    if (dimensions[0] !== dimensions[1]) {
      assert.equal(file.name, 'Artwork.png')
      assert.equal(await file.text(), 'image')
      assert.equal(draw, undefined)
      continue
    }
    assert.equal(file.name, 'Artwork-instagram.jpg')
    assert.equal(file.type, 'image/jpeg')
    assert.equal(canvas.width, 1080)
    assert.equal(canvas.height, 1080)
    const [x, y, width, height] = draw
    assert.ok(x >= 54 && y >= 54)
    assert.ok(x + width <= 1026 && y + height <= 1026)
    assert.equal(width / height, dimensions[0] / dimensions[1])
  }
  dimensions = [1200, 1200]
  output = null
  await assert.rejects(prepareInstagramImage('https://example.test/public.png', 'Artwork'), /could not be prepared/)
  dimensions = [0, 0]
  await assert.rejects(prepareInstagramImage('https://example.test/public.png', 'Artwork'), /could not be loaded/)
  assert.equal(revoke.mock.callCount(), 5)
})
