import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { generateSharePreviews, renderSharePreview } from '../scripts/generate-share-previews.mjs'

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
  assert.match(withoutScripts, /property="og:image" content="https:\/\/example.supabase.co\/storage\/v1\/object\/public\/community-media\/publisher\/art.png"/)
  assert.match(withoutScripts, /property="og:url" content="https:\/\/confessn.com\/publication\/3471fcd3-69b8-417d-a359-8f17ac80caa6\/"/)
  assert.match(withoutScripts, /name="twitter:card" content="summary_large_image"/)
  assert.match(withoutScripts, /<h1>Spell Orange<\/h1>/)
  assert.match(html, /location.replace\("https:\/\/confessn.com\/\?publication=3471fcd3-69b8-417d-a359-8f17ac80caa6"\)/)
  assert.doesNotMatch(withoutScripts, /Discover|FRAME|profile-avatar/)
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
  try {
    assert.equal(await generateSharePreviews(client, directory, site, storage), 101)
    assert.deepEqual(ranges, [[0, 99], [100, 199]])
    assert.ok(requestedColumns.every(columns => !columns.includes('description') && !columns.includes('user_profiles')))
    assert.match(await readFile(join(directory, 'publication', post.id, 'index.html'), 'utf8'), /Virtually framed - by PtDm/)
    failure = true
    await assert.rejects(generateSharePreviews(client, directory, site, storage), /Could not load public publications: Unavailable/)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
