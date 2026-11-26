export async function downloadPublicImage(url: string, title: string) {
  const response = await fetch(url)
  if (!response.ok) throw new Error('Could not download the public image. Please try again.')
  const blob = await response.blob()
  const extension = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[blob.type]
  if (!extension) throw new Error('This public image format cannot be downloaded for Instagram.')
  const filename = Array.from(title.trim(), character => character.charCodeAt(0) < 32 ? '-' : character).join('')
    .replace(/[\\/:*?"<>|]+/g, '-').slice(0, 100) || 'confessn-artwork'
  const objectUrl = URL.createObjectURL(blob)
  try {
    const link = document.createElement('a')
    link.href = objectUrl
    link.download = `${filename}.${extension}`
    document.body.append(link)
    try {
      link.click()
    } finally {
      link.remove()
    }
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60000)
  }
}
