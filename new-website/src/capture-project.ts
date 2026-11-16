import html2canvas from 'html2canvas'

async function inlineArtwork(image: HTMLImageElement): Promise<string> {
  const source = image.currentSrc || image.src
  if (source.startsWith('data:')) return source
  const response = await fetch(source)
  if (!response.ok) throw new Error('The artwork could not be loaded for publication.')
  const blob = await response.blob()
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => typeof reader.result === 'string'
      ? resolve(reader.result)
      : reject(new Error('The artwork could not be prepared for publication.'))
    reader.onerror = () => reject(new Error('The artwork could not be prepared for publication.'))
    reader.readAsDataURL(blob)
  })
}

export async function captureProject(capture: HTMLElement): Promise<Blob> {
  const image = capture.querySelector<HTMLImageElement>('img.uploaded-artwork')
  if (!image) throw new Error('The project artwork is unavailable.')
  await image.decode()
  if (!image.naturalWidth || !image.naturalHeight) throw new Error('The artwork could not be loaded.')
  const source = await inlineArtwork(image)
  await document.fonts.ready

  const bounds = capture.getBoundingClientRect()
  if (!bounds.width || !bounds.height) throw new Error('The project preview is unavailable.')
  const canvas = await html2canvas(capture, {
    backgroundColor: null,
    scale: Math.min(2, 1600 / Math.max(bounds.width, bounds.height)),
    useCORS: true,
    foreignObjectRendering: true,
    logging: false,
    scrollX: 0,
    scrollY: 0,
    x: 0,
    y: 0,
    width: bounds.width,
    height: bounds.height,
    onclone: async (clonedDocument, clonedCapture) => {
      clonedDocument.body.append(clonedCapture)
      Object.assign(clonedCapture.style, {
        position: 'fixed',
        inset: 'auto',
        left: '0',
        top: '0',
        width: `${bounds.width}px`,
        height: `${bounds.height}px`,
        margin: '0',
        transform: 'none',
      })
      const clonedImage = clonedCapture.querySelector<HTMLImageElement>('img.uploaded-artwork')
      if (!clonedImage) throw new Error('The project artwork is unavailable.')
      clonedImage.src = source
      await clonedImage.decode()
    },
  })
  const context = canvas.getContext('2d')
  if (!context || context.getImageData(Math.floor(canvas.width / 2), Math.floor(canvas.height / 2), 1, 1).data[3] === 0) {
    throw new Error('This browser could not capture the project accurately. Please try another browser.')
  }
  const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'))
  if (!blob || blob.type !== 'image/png') throw new Error('The framed image could not be captured.')
  if (blob.size > 5 * 1024 * 1024) throw new Error('The framed image exceeds the 5 MB publication limit.')
  return blob
}
