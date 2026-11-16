import assert from 'node:assert/strict'
import { mock, test } from 'node:test'

let render
mock.module('html2canvas', { defaultExport: (...args) => render(...args) })
const { captureProject } = await import('../src/capture-project.ts')

test('captures the isolated project as a lossless PNG', async context => {
  const image = { currentSrc: 'data:image/png;base64,cHJvamVjdA==', naturalWidth: 100, naturalHeight: 100, decode: async () => {} }
  const capture = { querySelector: () => image, getBoundingClientRect: () => ({ width: 400, height: 500 }) }
  const clonedImage = { src: '', decode: async () => {} }
  const clonedCapture = { style: {}, querySelector: () => clonedImage }
  let appended
  const clonedDocument = { body: { append: element => { appended = element } } }
  globalThis.document = { fonts: { ready: Promise.resolve() } }
  context.after(() => { delete globalThis.document })
  render = async (target, options) => {
    assert.equal(target, capture)
    assert.equal(options.foreignObjectRendering, true)
    assert.deepEqual([options.x, options.y, options.width, options.height], [0, 0, 400, 500])
    await options.onclone(clonedDocument, clonedCapture)
    assert.equal(appended, clonedCapture)
    assert.equal(clonedCapture.style.position, 'fixed')
    assert.equal(clonedCapture.style.width, '400px')
    assert.equal(clonedCapture.style.height, '500px')
    assert.equal(clonedImage.src, image.currentSrc)
    return {
      width: 800, height: 1000,
      getContext: () => ({ getImageData: () => ({ data: [0, 0, 0, 255] }) }),
      toBlob: callback => callback(new Blob(['image'], { type: 'image/png' })),
    }
  }
  assert.equal((await captureProject(capture)).type, 'image/png')
})

test('rejects missing artwork and unsupported blank captures', async context => {
  await assert.rejects(captureProject({ querySelector: () => null }), /artwork is unavailable/)
  const image = { currentSrc: 'data:image/png;base64,cHJvamVjdA==', naturalWidth: 100, naturalHeight: 100, decode: async () => {} }
  const capture = { querySelector: () => image, getBoundingClientRect: () => ({ width: 100, height: 100 }) }
  globalThis.document = { fonts: { ready: Promise.resolve() } }
  context.after(() => { delete globalThis.document })
  render = async () => ({
    width: 100, height: 100,
    getContext: () => ({ getImageData: () => ({ data: [0, 0, 0, 0] }) }),
  })
  await assert.rejects(captureProject(capture), /could not capture the project accurately/)
})

test('rejects PNGs exceeding the publication limit', async context => {
  const image = { currentSrc: 'data:image/png;base64,cHJvamVjdA==', naturalWidth: 100, naturalHeight: 100, decode: async () => {} }
  const capture = { querySelector: () => image, getBoundingClientRect: () => ({ width: 100, height: 100 }) }
  globalThis.document = { fonts: { ready: Promise.resolve() } }
  context.after(() => { delete globalThis.document })
  render = async () => ({
    width: 100, height: 100,
    getContext: () => ({ getImageData: () => ({ data: [0, 0, 0, 255] }) }),
    toBlob: callback => callback(new Blob([new Uint8Array(5 * 1024 * 1024 + 1)], { type: 'image/png' })),
  })
  await assert.rejects(captureProject(capture), /exceeds the 5 MB publication limit/)
})
