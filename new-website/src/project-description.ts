type ProjectDescriptionInput = {
  name: string
  style: string
  size: string
  frameEnabled?: boolean
  matEnabled?: boolean
  matColorId?: string
  bottomMatEnabled?: boolean
  bottomMatColorId?: string
  bottomMatBevelEnabled?: boolean
  bottomMatBevelColorId?: string
  stripEnabled?: boolean
  stripColorId?: string
  frameSizeIndex?: number
  frameOrientation?: 'horizontal' | 'vertical'
  artworkRatio?: number
  artWidthInches?: number
  artHeightInches?: number
  dimensionsConfirmed?: boolean
}

type DescriptionOptions = {
  frameTypes: { id: string; label: string }[]
  materials: { id: string; label: string }[]
  matColors: { id: string; name: string }[]
  bottomMatColors: { id: string; name: string }[]
  bevelColors: { id: string; name: string }[]
  stripColors: { id: string; name: string }[]
  frameSizes: { width: number; height: number }[]
  floatingFrameSize: { width: number; height: number }
}

export function describeProject(project: ProjectDescriptionInput, options: DescriptionOptions): string {
  const lines = [`Artwork: ${project.name.slice(0, 120)}`]
  const frameType = options.frameTypes.find(({ id }) =>
    project.style.startsWith(`${id}::`) || project.style.startsWith(`${id}-`),
  )

  if (project.frameEnabled !== false && frameType) {
    const separator = project.style.startsWith(`${frameType.id}::`) ? '::' : '-'
    const materialId = project.style.slice(frameType.id.length + separator.length)
    const material = options.materials.find(({ id }) => id === materialId)
    lines.push(`Frame: ${[frameType.label, material?.label].filter(Boolean).join(', ')}`)

    const size = frameType.id === 'floating'
      ? options.floatingFrameSize
      : project.frameSizeIndex === undefined ? undefined : options.frameSizes[project.frameSizeIndex]
    if (size) {
      const horizontal = (project.frameOrientation ?? ((project.artworkRatio ?? 4 / 5) >= 1 ? 'horizontal' : 'vertical')) === 'horizontal'
      lines.push(`Frame size: ${horizontal ? size.height : size.width} x ${horizontal ? size.width : size.height} in`)
    }
  }

  if (project.matEnabled !== false) {
    const color = options.matColors.find(({ id }) => id === project.matColorId)
    const size = project.size === 'letter' || project.size === 'large' ? 'Letter' : project.size === 'standard' ? 'Standard' : ''
    const details = [color?.name, size].filter(Boolean)
    if (details.length) lines.push(`Top mat: ${details.join(', ')}`)
  }
  if (project.bottomMatEnabled) {
    const color = options.bottomMatColors.find(({ id }) => id === project.bottomMatColorId)
    if (color) lines.push(`Bottom mat: ${color.name}`)
    if (project.bottomMatBevelEnabled !== false) {
      const bevel = options.bevelColors.find(({ id }) => id === project.bottomMatBevelColorId)
      if (bevel) lines.push(`Bevel cut: ${bevel.name}`)
    }
  }
  if ((project.matEnabled !== false || project.bottomMatEnabled) && project.stripEnabled !== false) {
    const color = options.stripColors.find(({ id }) => id === project.stripColorId)
    if (color) lines.push(`Mat offcut: ${color.name}`)
  }

  const { artWidthInches, artHeightInches } = project
  if (artWidthInches !== undefined && artHeightInches !== undefined &&
      Number.isFinite(artWidthInches) && Number.isFinite(artHeightInches) &&
      artWidthInches > 0 && artHeightInches > 0) {
    lines.push(`Artwork size: ${artWidthInches.toFixed(1)} x ${artHeightInches.toFixed(1)} in (${project.dimensionsConfirmed ? 'measured' : 'estimate'})`)
  }
  return lines.join('\n')
}
