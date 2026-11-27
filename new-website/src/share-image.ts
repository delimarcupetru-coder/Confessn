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

export async function prepareInstagramImage(url: string, title: string) {
  const original = await preparePublicImage(url, title)
  const source = URL.createObjectURL(original)
  try {
    const image = new Image()
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve()
      image.onerror = () => reject(new Error('The public image could not be loaded for Instagram.'))
      image.src = source
    })
    if (!image.naturalWidth || !image.naturalHeight) throw new Error('The public image could not be loaded for Instagram.')
    if (image.naturalWidth !== image.naturalHeight) return original
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 1080
    const context = canvas.getContext('2d')
    if (!context) throw new Error('This browser could not prepare the Instagram image.')
    context.fillStyle = '#f7f4ed'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.drawImage(image, 54, 54, 972, 972)
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.92))
    if (!blob) throw new Error('The Instagram image could not be prepared.')
    return new File([blob], original.name.replace(/\.[^.]+$/, '-instagram.jpg'), { type: 'image/jpeg' })
  } finally {
    URL.revokeObjectURL(source)
  }
}

export function sharePublicImage(file: File) {
  const data = { files: [file] }
  if (typeof navigator.share !== 'function' || typeof navigator.canShare !== 'function' || !navigator.canShare(data)) {
    throw new Error('Image sharing is not available in this browser. Try a supported mobile browser with Instagram installed.')
  }
  return navigator.share(data)
}
