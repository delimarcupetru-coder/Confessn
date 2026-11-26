import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { createHash } from 'node:crypto'
import sharp from 'sharp'

const platformSizes = {
  facebook: { width: 1200, height: 630 },
  linkedin: { width: 1200, height: 675 },
}

export async function createShareImage(source, platform) {
  const size = platformSizes[platform]
  if (!size) throw new Error('Unsupported sharing platform.')
  return sharp(source).rotate().resize({
    ...size, fit: 'contain', position: 'centre', background: '#f7f4ed',
  }).flatten({ background: '#f7f4ed' }).jpeg({ quality: 92 }).toBuffer()
}

const escapeHtml = value => String(value).replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[character])

export function renderSharePreview(post, siteUrl, storageUrl, { platform = 'facebook', imageFilename = 'share-facebook.jpg', dedicated = false } = {}) {
  const size = platformSizes[platform]
  if (!size) throw new Error('Unsupported sharing platform.')
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(post.id)) throw new Error('Invalid public publication ID.')
  if (typeof post.title !== 'string' || !post.title.trim()) throw new Error('Public publication has no title.')
  if (typeof post.image_path !== 'string' || post.image_path.split('/').some(part => !part || part === '.' || part === '..')) throw new Error('Public publication has an invalid image path.')
  const site = new URL(siteUrl)
  const storage = new URL(storageUrl)
  if (site.protocol !== 'https:' || storage.protocol !== 'https:') throw new Error('Preview URLs must use HTTPS.')
  const previewUrl = new URL(`/publication/${post.id}/${dedicated ? `${platform}/` : ''}`, site.origin).href
  const projectUrl = new URL(`/?publication=${post.id}`, site.origin).href
  const imageUrl = new URL(`/storage/v1/object/public/community-media/${post.image_path.split('/').map(encodeURIComponent).join('/')}`, storage.origin).href
  const author = post.community_members?.username ?? 'Member'
  const description = `${post.kind === 'art' ? 'Virtually framed' : 'Event'} - by ${author}`
  const title = escapeHtml(post.title)
  const subtitle = escapeHtml(description)
  const image = escapeHtml(imageUrl)
  const shareImage = escapeHtml(new URL(`/publication/${post.id}/${imageFilename}`, site.origin).href)
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title} - Confessn</title>
  <meta name="description" content="${subtitle}">
  <link rel="canonical" href="${escapeHtml(previewUrl)}">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="Confessn">
  <meta property="og:url" content="${escapeHtml(previewUrl)}">
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${subtitle}">
  <meta property="og:image" content="${shareImage}">
  <meta property="og:image:type" content="image/jpeg">
  <meta property="og:image:width" content="${size.width}">
  <meta property="og:image:height" content="${size.height}">
  <meta property="og:image:alt" content="${title}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${title}">
  <meta name="twitter:description" content="${subtitle}">
  <meta name="twitter:image" content="${shareImage}">
  <meta name="twitter:image:alt" content="${title}">
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; padding: 24px 16px; background: #f0f2f5; color: #202124; font: 16px/1.45 Arial, sans-serif; }
    main { max-width: 520px; margin: 0 auto; }
    a { display: block; overflow: hidden; background: #fff; border: 1px solid #dce0e5; border-radius: 8px; color: inherit; text-decoration: none; }
    img { display: block; width: 100%; height: auto; background: #e8efec; }
    .details { padding: 12px 16px 16px; background: #f5f6f7; border-top: 1px solid #e4e6e9; }
    .domain { color: #687078; font-size: 12px; text-transform: uppercase; letter-spacing: .4px; }
    h1 { margin: 3px 0; font-size: 21px; line-height: 1.3; }
    p { margin: 0; color: #525b65; font-size: 14px; }
    a:focus-visible { outline: 3px solid #1967d2; outline-offset: -3px; }
  </style>
</head>
<body>
  <main>
    <a href="${escapeHtml(projectUrl)}" aria-label="View ${title} on Confessn">
      <img src="${image}" alt="${title}">
      <div class="details">
        <div class="domain">${escapeHtml(site.hostname)}</div>
        <h1>${title}</h1>
        <p>${subtitle}</p>
      </div>
    </a>
  </main>
  <script>location.replace(${JSON.stringify(projectUrl).replace(/</g, '\\u003c')})</script>
</body>
</html>
`
}

async function fetchPublicImage(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(15000) })
  if (!response.ok) throw new Error(`Could not load public preview image: HTTP ${response.status}.`)
  return Buffer.from(await response.arrayBuffer())
}

export async function generateSharePreviews(client, outputDirectory, siteUrl, storageUrl, loadImage = fetchPublicImage) {
  const posts = []
  const pageSize = 100
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await client.from('community_posts')
      .select('id,title,kind,image_path,community_members:community_members!community_posts_author_id_fkey(username)')
      .order('created_at', { ascending: true }).order('id', { ascending: true })
      .range(offset, offset + pageSize - 1)
    if (error) throw new Error(`Could not load public publications: ${error.message}`)
    if (!Array.isArray(data)) throw new Error('Invalid public publication response.')
    posts.push(...data)
    if (data.length < pageSize) break
  }
  for (const post of posts) renderSharePreview(post, siteUrl, storageUrl)
  const imageCache = new Map()
  for (const post of posts) {
    let images = imageCache.get(post.image_path)
    if (!images) {
      const imageUrl = new URL(`/storage/v1/object/public/community-media/${post.image_path.split('/').map(encodeURIComponent).join('/')}`, storageUrl).href
      const source = await loadImage(imageUrl)
      const fingerprint = createHash('sha256').update(source).digest('hex').slice(0, 12)
      images = {}
      for (const platform of Object.keys(platformSizes)) {
        images[platform] = { filename: `share-${platform}-${fingerprint}.jpg`, buffer: await createShareImage(source, platform) }
      }
      imageCache.set(post.image_path, images)
    }
    const directory = resolve(outputDirectory, 'publication', post.id)
    await mkdir(directory, { recursive: true })
    for (const platform of Object.keys(platformSizes)) {
      const image = images[platform]
      await writeFile(resolve(directory, image.filename), image.buffer)
      const platformDirectory = resolve(directory, platform)
      await mkdir(platformDirectory, { recursive: true })
      await writeFile(resolve(platformDirectory, 'index.html'), renderSharePreview(post, siteUrl, storageUrl, {
        platform, imageFilename: image.filename, dedicated: true,
      }), 'utf8')
    }
    await writeFile(resolve(directory, 'index.html'), renderSharePreview(post, siteUrl, storageUrl, {
      imageFilename: images.facebook.filename,
    }), 'utf8')
  }
  return posts.length
}

async function main() {
  const storageUrl = process.env.VITE_SUPABASE_URL ?? 'https://yxqjzyvlvwzzwdvljnrd.supabase.co'
  const publicKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? 'sb_publishable_eD_GG4K8x6-srUAdDpiqdw_3eJ86Zr8'
  if (!publicKey.startsWith('sb_publishable_')) throw new Error('Share preview generation requires a publishable key, not privileged credentials.')
  const client = createClient(storageUrl, publicKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const count = await generateSharePreviews(client, resolve('dist'), 'https://confessn.com', storageUrl)
  console.log(`Generated ${count} public publication previews.`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
}
