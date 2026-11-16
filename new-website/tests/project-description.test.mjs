import assert from 'node:assert/strict'
import test from 'node:test'
import { describeProject } from '../src/project-description.ts'

const options = {
  frameTypes: [{ id: 'modern', label: 'Modern' }, { id: 'floating', label: 'Floating' }],
  materials: [{ id: 'blackwood', label: 'Black Wood' }, { id: 'honey-oak', label: 'Honey Oak' }],
  matColors: [{ id: 'white', name: 'White' }],
  bottomMatColors: [{ id: 'navy-blue', name: 'Navy Blue' }],
  bevelColors: [{ id: 'silver', name: 'Silver' }],
  stripColors: [{ id: 'red', name: 'Red' }],
  frameSizes: [{ width: 8, height: 10 }],
  floatingFrameSize: { width: 16, height: 20 },
}

test('describes the saved project without copying private notes', () => {
  const description = describeProject({
    name: 'Landscape',
    style: 'modern::blackwood',
    size: 'standard',
    notes: 'Private notes',
    matColorId: 'white',
    bottomMatEnabled: true,
    bottomMatColorId: 'navy-blue',
    bottomMatBevelColorId: 'silver',
    stripColorId: 'red',
    frameSizeIndex: 0,
    frameOrientation: 'horizontal',
    artWidthInches: 12,
    artHeightInches: 9,
    dimensionsConfirmed: true,
  }, options)
  assert.equal(description, [
    'Artwork: Landscape',
    'Frame: Modern, Black Wood',
    'Frame size: 10 x 8 in',
    'Top mat: White, Standard',
    'Bottom mat: Navy Blue',
    'Bevel cut: Silver',
    'Mat offcut: Red',
    'Artwork size: 12.0 x 9.0 in (measured)',
  ].join('\n'))
  assert.doesNotMatch(description, /Private notes/)
})

test('handles legacy styles, estimates, disabled layers and missing settings', () => {
  assert.equal(describeProject({
    name: 'Study',
    style: 'floating-honey-oak',
    size: 'large',
    matEnabled: false,
    stripEnabled: false,
    artworkRatio: 2,
    artWidthInches: 12,
    artHeightInches: 6,
  }, options), [
    'Artwork: Study',
    'Frame: Floating, Honey Oak',
    'Frame size: 20 x 16 in',
    'Artwork size: 12.0 x 6.0 in (estimate)',
  ].join('\n'))
  assert.equal(describeProject({
    name: 'Untitled',
    style: 'unknown',
    size: '',
    frameEnabled: false,
    matEnabled: false,
    stripColorId: 'red',
    artWidthInches: NaN,
    artHeightInches: 2,
  }, options), 'Artwork: Untitled')
  assert.equal(describeProject({
    name: 'A'.repeat(6000),
    style: 'unknown',
    size: '',
    frameEnabled: false,
    matEnabled: false,
  }, options), `Artwork: ${'A'.repeat(120)}`)
})
