export async function preparePublicImage(url: string, title: string) {
  const response = await fetch(url)
  if (!response.ok) throw new Error('Could not prepare the public image. Please try again.')
  const blob = await response.blob()
  const extension = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[blob.type]
  if (!extension) throw new Error('This public image format cannot be shared.')
  const filename = Array.from(title.trim(), character => character.charCodeAt(0) < 32 ? '-' : character).join('')
    .replace(/[\\/:*?"<>|]+/g, '-').slice(0, 100) || 'confessn-artwork'
  return new File([blob], `${filename}.${extension}`, { type: blob.type })
}

export function sharePublicImage(file: File) {
  const data = { files: [file] }
  if (typeof navigator.share !== 'function' || typeof navigator.canShare !== 'function' || !navigator.canShare(data)) {
    throw new Error('Image sharing is not available in this browser. Try a supported mobile browser with Instagram installed.')
  }
  return navigator.share(data)
}
