import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { createShareImage, generateSharePreviews, renderSharePreview } from '../scripts/generate-share-previews.mjs'

const post = {
  id: '3471fcd3-69b8-417d-a359-8f17ac80caa6', title: 'Spell Orange', kind: 'art',
  image_path: 'publisher/art.png', community_members: { username: 'PtDm' },
}
const site = 'https://confessn.com'
const storage = 'https://example.supabase.co'

test('crawler HTML contains the approved image, title, byline and publication URL without JavaScript', () => {
  const html = renderSharePreview(post, site, storage)
  const withoutScripts = html.replace(/<script>[\s\S]*?<\/script>/g, '')
  assert.match(withoutScripts, /property="og:title" content="Spell Orange"/)
  assert.match(withoutScripts, /property="og:description" content="Virtually framed - by PtDm"/)
  assert.match(withoutScripts, /property="og:image" content="https:\/\/confessn.com\/publication\/3471fcd3-69b8-417d-a359-8f17ac80caa6\/share-facebook.jpg"/)
  assert.match(withoutScripts, /property="og:image:width" content="1200"/)
  assert.match(withoutScripts, /property="og:image:height" content="630"/)
  assert.match(withoutScripts, /<img src="https:\/\/example.supabase.co\/storage\/v1\/object\/public\/community-media\/publisher\/art.png"/)
  assert.match(withoutScripts, /property="og:url" content="https:\/\/confessn.com\/publication\/3471fcd3-69b8-417d-a359-8f17ac80caa6\/"/)
  assert.match(withoutScripts, /name="twitter:card" content="summary_large_image"/)
  assert.match(withoutScripts, /<h1>Spell Orange<\/h1>/)
  assert.match(html, /location.replace\("https:\/\/confessn.com\/\?publication=3471fcd3-69b8-417d-a359-8f17ac80caa6"\)/)
  assert.doesNotMatch(withoutScripts, /Discover|FRAME|profile-avatar/)
})

test('LinkedIn gets its own preview URL and dimensions', () => {
  const html = renderSharePreview(post, site, storage, { platform: 'linkedin', imageFilename: 'share-linkedin.jpg', dedicated: true })
  assert.match(html, /property="og:url" content="https:\/\/confessn.com\/publication\/3471fcd3-69b8-417d-a359-8f17ac80caa6\/linkedin\/"/)
  assert.match(html, /property="og:image:height" content="675"/)
  assert.match(html, /property="og:image" content="[^"]+\/share-linkedin.jpg"/)
})

test('sharing copies fit portrait and landscape artwork without crop or distortion', async () => {
  for (const [width, height] of [[300, 600], [600, 300]]) {
    const source = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="red"/></svg>`)
    const original = Buffer.from(source)
    for (const [platform, canvasHeight] of [['facebook', 630], ['linkedin', 675]]) {
      const output = await createShareImage(source, platform)
      const metadata = await sharp(output).metadata()
      assert.equal(metadata.format, 'jpeg')
      assert.deepEqual([metadata.width, metadata.height], [1200, canvasHeight])
      const { data, info } = await sharp(output).raw().toBuffer({ resolveWithObject: true })
      let left = info.width, right = -1, top = info.height, bottom = -1
      for (let y = 0; y < info.height; y++) {
        for (let x = 0; x < info.width; x++) {
          const offset = (y * info.width + x) * info.channels
          if (data[offset] > 200 && data[offset + 1] < 60 && data[offset + 2] < 60) {
            left = Math.min(left, x); right = Math.max(right, x)
            top = Math.min(top, y); bottom = Math.max(bottom, y)
          }
        }
      }
      const scale = Math.min(1200 / width, canvasHeight / height)
      assert.ok(Math.abs((right - left + 1) - width * scale) <= 3)
      assert.ok(Math.abs((bottom - top + 1) - height * scale) <= 3)
      assert.ok(Math.abs(left - (1200 - width * scale) / 2) <= 3)
      assert.ok(Math.abs(top - (canvasHeight - height * scale) / 2) <= 3)
      assert.deepEqual(source, original)
    }
  }
})

test('publication text is escaped and private description fields are never included', () => {
  const html = renderSharePreview({
    ...post, title: 'A"><script>alert(1)</script>&', description: 'PRIVATE NOTES',
    community_members: { username: '<img src=x onerror=alert(1)>' },
  }, site, storage)
  assert.match(html, /A&quot;&gt;&lt;script&gt;alert\(1\)&lt;\/script&gt;&amp;/)
  assert.match(html, /by &lt;img src=x onerror=alert\(1\)&gt;/)
  assert.doesNotMatch(html, /PRIVATE NOTES|<img src=x|<script>alert/)
  assert.throws(() => renderSharePreview({ ...post, id: '../escape' }, site, storage), /Invalid public publication ID/)
  assert.throws(() => renderSharePreview({ ...post, image_path: '../private.png' }, site, storage), /invalid image path/)
})

test('generation paginates public posts and fails explicitly on query errors', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'confessn-share-previews-'))
  const ranges = []
  const requestedColumns = []
  let failure = false
  const client = {
    from(table) {
      assert.equal(table, 'community_posts')
      return {
        select(columns) {
          requestedColumns.push(columns)
          return this
        },
        order() { return this },
        async range(start, end) {
          ranges.push([start, end])
          if (failure) return { data: null, error: { message: 'Unavailable' } }
          return { data: start === 0 ? Array.from({ length: 100 }, (_, index) => ({
            ...post, id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
          })) : [post], error: null }
        },
      }
    },
  }
  const source = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="20" height="40"><rect width="100%" height="100%" fill="red"/></svg>')
  const loadImage = async () => source
  try {
    assert.equal(await generateSharePreviews(client, directory, site, storage, loadImage), 101)
    assert.deepEqual(ranges, [[0, 99], [100, 199]])
    assert.ok(requestedColumns.every(columns => !columns.includes('description') && !columns.includes('user_profiles')))
    assert.match(await readFile(join(directory, 'publication', post.id, 'index.html'), 'utf8'), /Virtually framed - by PtDm/)
    const linkedInHtml = await readFile(join(directory, 'publication', post.id, 'linkedin', 'index.html'), 'utf8')
    const facebookHtml = await readFile(join(directory, 'publication', post.id, 'facebook', 'index.html'), 'utf8')
    for (const [html, height] of [[linkedInHtml, 675], [facebookHtml, 630]]) {
      const imageUrl = html.match(/property="og:image" content="([^"]+)"/)[1]
      const metadata = await sharp(await readFile(join(directory, new URL(imageUrl).pathname))).metadata()
      assert.deepEqual([metadata.width, metadata.height], [1200, height])
    }
    await assert.rejects(generateSharePreviews(client, directory, site, storage, async () => { throw new Error('Image unavailable') }), /Image unavailable/)
    failure = true
    await assert.rejects(generateSharePreviews(client, directory, site, storage, loadImage), /Could not load public publications: Unavailable/)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
