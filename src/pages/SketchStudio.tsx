import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import './Studio.css'

type ToolId = 'pen' | 'line' | 'arrow' | 'doubleArrow' | 'circle' | 'rectangle' | 'parallelogram' | 'pentagram' | 'hexagram' | 'octagram'
type Point = { x: number; y: number }
type PenShape = { id: number; type: 'pen'; points: Point[] }
type LineShape = { id: number; type: 'line' | 'arrow' | 'doubleArrow'; x1: number; y1: number; x2: number; y2: number }
type BoxShape = { id: number; type: 'rectangle' | 'parallelogram'; x1: number; y1: number; x2: number; y2: number }
type RadialShape = { id: number; type: 'circle' | 'pentagram' | 'hexagram' | 'octagram'; cx: number; cy: number; r: number }
type Shape = PenShape | LineShape | BoxShape | RadialShape
type Handle = { key: 'start' | 'end' | 'radius'; x: number; y: number }

const TOOLS: { id: ToolId; label: string }[] = [
  { id: 'pen', label: 'Pen' },
  { id: 'line', label: 'Ruler' },
  { id: 'arrow', label: 'Arrow' },
  { id: 'doubleArrow', label: 'Double arrow' },
  { id: 'circle', label: 'Circle' },
  { id: 'rectangle', label: 'Square' },
  { id: 'parallelogram', label: 'Parallelogram' },
  { id: 'pentagram', label: 'Pentagram' },
  { id: 'hexagram', label: 'Hexagram' },
  { id: 'octagram', label: 'Octagram' },
]

function starPoints(cx: number, cy: number, outerR: number, innerR: number, points: number) {
  const coords: Point[] = []
  for (let i = 0; i < points * 2; i++) {
    const radius = i % 2 === 0 ? outerR : innerR
    const angle = (Math.PI / points) * i - Math.PI / 2
    coords.push({ x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) })
  }
  return coords
}

function starPathD(cx: number, cy: number, outerR: number, innerR: number, points: number) {
  return starPoints(cx, cy, outerR, innerR, points)
    .map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x.toFixed(2)},${point.y.toFixed(2)}`)
    .join(' ') + 'Z'
}

function getHandlePoints(shape: Shape): Handle[] {
  switch (shape.type) {
    case 'pen':
      return []
    case 'circle':
    case 'pentagram':
    case 'hexagram':
    case 'octagram':
      return [{ key: 'radius', x: shape.cx + shape.r, y: shape.cy }]
    default:
      return [{ key: 'start', x: shape.x1, y: shape.y1 }, { key: 'end', x: shape.x2, y: shape.y2 }]
  }
}

function findHandleAt(shape: Shape, point: Point) {
  return getHandlePoints(shape).find((handle) => Math.hypot(handle.x - point.x, handle.y - point.y) <= 14)?.key ?? null
}

function drawArrowhead(context: CanvasRenderingContext2D, fromX: number, fromY: number, toX: number, toY: number) {
  const angle = Math.atan2(toY - fromY, toX - fromX)
  const size = 14
  context.beginPath()
  context.moveTo(toX, toY)
  context.lineTo(toX - size * Math.cos(angle - Math.PI / 7), toY - size * Math.sin(angle - Math.PI / 7))
  context.moveTo(toX, toY)
  context.lineTo(toX - size * Math.cos(angle + Math.PI / 7), toY - size * Math.sin(angle + Math.PI / 7))
  context.stroke()
}

function drawShape(context: CanvasRenderingContext2D, shape: Shape) {
  context.strokeStyle = '#161616'
  context.lineWidth = shape.type === 'pen' ? 2 : 2.5
  context.lineCap = 'round'
  context.lineJoin = 'round'

  if (shape.type === 'pen') {
    if (shape.points.length < 2) return
    context.beginPath()
    context.moveTo(shape.points[0].x, shape.points[0].y)
    shape.points.slice(1).forEach((point) => context.lineTo(point.x, point.y))
    context.stroke()
    return
  }
  if (shape.type === 'line' || shape.type === 'arrow' || shape.type === 'doubleArrow') {
    context.beginPath()
    context.moveTo(shape.x1, shape.y1)
    context.lineTo(shape.x2, shape.y2)
    context.stroke()
    if (shape.type === 'arrow' || shape.type === 'doubleArrow') drawArrowhead(context, shape.x1, shape.y1, shape.x2, shape.y2)
    if (shape.type === 'doubleArrow') drawArrowhead(context, shape.x2, shape.y2, shape.x1, shape.y1)
    return
  }
  if (shape.type === 'rectangle') {
    context.strokeRect(Math.min(shape.x1, shape.x2), Math.min(shape.y1, shape.y2), Math.abs(shape.x2 - shape.x1), Math.abs(shape.y2 - shape.y1))
    return
  }
  if (shape.type === 'parallelogram') {
    const shift = (shape.y2 - shape.y1) * 0.35
    context.beginPath()
    context.moveTo(shape.x1 + shift, shape.y1)
    context.lineTo(shape.x2 + shift, shape.y1)
    context.lineTo(shape.x2, shape.y2)
    context.lineTo(shape.x1, shape.y2)
    context.closePath()
    context.stroke()
    return
  }
  if (shape.type === 'circle') {
    context.beginPath()
    context.arc(shape.cx, shape.cy, Math.max(shape.r, 1), 0, Math.PI * 2)
    context.stroke()
    return
  }
  const starShape = shape as RadialShape
  const pointsCount = starShape.type === 'pentagram' ? 5 : starShape.type === 'hexagram' ? 6 : 8
  const outerR = Math.max(starShape.r, 4)
  const path = starPoints(starShape.cx, starShape.cy, outerR, outerR * 0.42, pointsCount)
  context.beginPath()
  path.forEach((point, index) => (index === 0 ? context.moveTo(point.x, point.y) : context.lineTo(point.x, point.y)))
  context.closePath()
  context.stroke()
}

function drawHandles(context: CanvasRenderingContext2D, shape: Shape) {
  context.fillStyle = '#ff5d22'
  context.strokeStyle = '#171717'
  context.lineWidth = 1.5
  getHandlePoints(shape).forEach(({ x, y }) => {
    context.beginPath()
    context.rect(x - 6, y - 6, 12, 12)
    context.fill()
    context.stroke()
  })
}

function ToolIcon({ tool }: { tool: ToolId }) {
  const stroke = '#171717'
  switch (tool) {
    case 'pen':
      return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <path d="M4 20l1.4-5.6L16.6 3.2a2 2 0 0 1 2.8 0l1.4 1.4a2 2 0 0 1 0 2.8L9.6 18.6 4 20z" stroke={stroke} strokeWidth="1.6" strokeLinejoin="round" />
          <path d="M14.8 5.6l3.6 3.6" stroke={stroke} strokeWidth="1.6" />
        </svg>
      )
    case 'line':
      return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <line x1="3" y1="21" x2="21" y2="3" stroke={stroke} strokeWidth="1.8" />
          <line x1="7" y1="17" x2="9.4" y2="14.6" stroke={stroke} strokeWidth="1.4" />
          <line x1="11" y1="13" x2="13.4" y2="10.6" stroke={stroke} strokeWidth="1.4" />
          <line x1="15" y1="9" x2="17.4" y2="6.6" stroke={stroke} strokeWidth="1.4" />
        </svg>
      )
    case 'arrow':
      return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <line x1="3" y1="21" x2="19" y2="5" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" />
          <path d="M19 5l-6 1.4M19 5l-1.4 6" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      )
    case 'doubleArrow':
      return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <line x1="4" y1="20" x2="20" y2="4" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" />
          <path d="M20 4l-6 1.4M20 4l-1.4 6" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" />
          <path d="M4 20l6-1.4M4 20l1.4-6" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      )
    case 'circle':
      return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="8.5" fill="url(#hatch45)" stroke={stroke} strokeWidth="1.6" />
        </svg>
      )
    case 'rectangle':
      return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <rect x="4" y="5" width="16" height="14" fill="url(#hatch45)" stroke={stroke} strokeWidth="1.6" />
        </svg>
      )
    case 'parallelogram':
      return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <path d="M8 5h13l-5 14H3z" fill="url(#hatch45)" stroke={stroke} strokeWidth="1.6" strokeLinejoin="round" />
        </svg>
      )
    case 'pentagram':
      return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <path d={starPathD(12, 12, 9, 3.6, 5)} fill="url(#hatch45)" stroke={stroke} strokeWidth="1.4" strokeLinejoin="round" />
        </svg>
      )
    case 'hexagram':
      return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <path d={starPathD(12, 12, 9, 4.6, 6)} fill="url(#hatch45)" stroke={stroke} strokeWidth="1.4" strokeLinejoin="round" />
        </svg>
      )
    case 'octagram':
      return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <path d={starPathD(12, 12, 9, 5.6, 8)} fill="url(#hatch45)" stroke={stroke} strokeWidth="1.4" strokeLinejoin="round" />
        </svg>
      )
  }
}

export function SketchStudio() {
  const navigate = useNavigate()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [prompt, setPrompt] = useState('Compact modular desk lamp with an adjustable arm')
  const [status, setStatus] = useState('Ready for direction')
  const [isSaveDialogOpen, setIsSaveDialogOpen] = useState(false)
  const [projectNumber, setProjectNumber] = useState('001')
  const [projectRevision, setProjectRevision] = useState('Rev C01')
  const [projectName, setProjectName] = useState('SINGER DESK LAMP')
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [tool, setTool] = useState<ToolId>('pen')
  const [shapes, setShapes] = useState<Shape[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const gestureStart = useRef<{ distance: number; zoom: number; x: number; y: number } | null>(null)
  const nextId = useRef(1)
  const dragState = useRef<{ mode: 'draw' | 'handle'; shapeId: number; handle?: Handle['key'] } | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) return
    context.clearRect(0, 0, canvas.width, canvas.height)
    shapes.forEach((shape) => drawShape(context, shape))
    const selected = shapes.find((shape) => shape.id === selectedId)
    if (selected) drawHandles(context, selected)
  }, [shapes, selectedId])

  function canvasPoint(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    const bounds = canvas.getBoundingClientRect()
    return {
      x: (event.clientX - bounds.left) * (canvas.width / bounds.width),
      y: (event.clientY - bounds.top) * (canvas.height / bounds.height),
    }
  }

  function resetView() {
    setZoom(1)
    setPan({ x: 0, y: 0 })
    setStatus('Canvas view reset')
  }

  function beginInteraction(event: React.PointerEvent<HTMLCanvasElement>) {
    const point = canvasPoint(event)
    const selected = shapes.find((shape) => shape.id === selectedId)
    if (selected) {
      const handleKey = findHandleAt(selected, point)
      if (handleKey) {
        dragState.current = { mode: 'handle', shapeId: selected.id, handle: handleKey }
        return
      }
    }
    const id = nextId.current++
    let shape: Shape
    if (tool === 'pen') {
      shape = { id, type: 'pen', points: [point] }
    } else if (tool === 'line' || tool === 'arrow' || tool === 'doubleArrow') {
      shape = { id, type: tool, x1: point.x, y1: point.y, x2: point.x, y2: point.y }
    } else if (tool === 'rectangle' || tool === 'parallelogram') {
      shape = { id, type: tool, x1: point.x, y1: point.y, x2: point.x, y2: point.y }
    } else {
      shape = { id, type: tool, cx: point.x, cy: point.y, r: 0 }
    }
    setShapes((current) => [...current, shape])
    setSelectedId(id)
    dragState.current = { mode: 'draw', shapeId: id }
  }

  function continueInteraction(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!dragState.current) return
    const point = canvasPoint(event)
    const { shapeId, mode, handle } = dragState.current
    setShapes((current) => current.map((shape) => {
      if (shape.id !== shapeId) return shape
      if (shape.type === 'pen') {
        if (mode !== 'draw') return shape
        return { ...shape, points: [...shape.points, point] }
      }
      if (shape.type === 'circle' || shape.type === 'pentagram' || shape.type === 'hexagram' || shape.type === 'octagram') {
        return { ...shape, r: Math.hypot(point.x - shape.cx, point.y - shape.cy) }
      }
      if (mode === 'handle' && handle === 'start') return { ...shape, x1: point.x, y1: point.y }
      return { ...shape, x2: point.x, y2: point.y }
    }))
  }

  function endInteraction() {
    dragState.current = null
  }

  function startPointer(event: React.PointerEvent<HTMLCanvasElement>) {
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    if (pointers.current.size === 2) {
      const points = [...pointers.current.values()]
      const distance = Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y)
      gestureStart.current = { distance, zoom, x: pan.x, y: pan.y }
      dragState.current = null
      event.preventDefault()
      return
    }
    const canvas = canvasRef.current
    if (canvas) canvas.setPointerCapture(event.pointerId)
    event.preventDefault()
    beginInteraction(event)
  }

  function movePointer(event: React.PointerEvent<HTMLCanvasElement>) {
    const previous = pointers.current.get(event.pointerId)
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    if (pointers.current.size === 2 && gestureStart.current && previous) {
      const points = [...pointers.current.values()]
      const distance = Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y)
      const midpoint = { x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2 }
      const previousMidpoint = { x: (points[0].x + previous.x) / 2, y: (points[0].y + previous.y) / 2 }
      const nextZoom = Math.min(4, Math.max(.5, gestureStart.current.zoom * (distance / gestureStart.current.distance)))
      setZoom(nextZoom)
      setPan({ x: gestureStart.current.x + midpoint.x - previousMidpoint.x, y: gestureStart.current.y + midpoint.y - previousMidpoint.y })
      event.preventDefault()
      return
    }
    event.preventDefault()
    continueInteraction(event)
  }

  function endPointer(event: React.PointerEvent<HTMLCanvasElement>) {
    pointers.current.delete(event.pointerId)
    gestureStart.current = null
    const canvas = canvasRef.current
    if (canvas?.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId)
    endInteraction()
  }

  function clearCanvas() {
    setShapes([])
    setSelectedId(null)
    setStatus('Canvas cleared')
  }

  function saveProject() {
    const savedProjects = window.localStorage.getItem('confessn-projects')
    const projects = savedProjects ? JSON.parse(savedProjects) : []
    const project = {
      id: projectNumber.trim(),
      name: `${projectNumber.trim()}_${projectRevision.trim()}_${projectName.trim()}`,
      brief: prompt || 'New product concept',
      status: 'Saved draft',
    }
    window.localStorage.setItem('confessn-projects', JSON.stringify([...projects, project]))
    setIsSaveDialogOpen(false)
    setStatus('Project saved')
  }

  function assistSketch() {
    const id = nextId.current
    nextId.current = id + 4
    const generated: Shape[] = [
      { id, type: 'rectangle', x1: 240, y1: 210, x2: 540, y2: 330 },
      { id: id + 1, type: 'pen', points: [{ x: 390, y: 210 }, { x: 390, y: 115 }, { x: 570, y: 115 }, { x: 540, y: 210 }] },
      { id: id + 2, type: 'pen', points: [{ x: 240, y: 330 }, { x: 220, y: 380 }] },
      { id: id + 3, type: 'pen', points: [{ x: 540, y: 330 }, { x: 560, y: 380 }] },
    ]
    setShapes((current) => [...current, ...generated])
    setSelectedId(null)
    setStatus('High-level concept generated')
  }

  return (
    <div className="sketch-page">
      <header className="sketch-header"><button className="wordmark" onClick={() => navigate('/')}>CONFESSN STUDIO</button><span>PROJECT / 001</span><button className="close-button" onClick={() => navigate('/')}>Close ×</button></header>
      <main className="sketch-layout">
        <aside className="sketch-controls">
          <p className="eyebrow">AI ASSISTED SKETCH</p>
          <h1>Give the idea<br />a first shape.</h1>
          <p className="sketch-copy">Describe the object, part, or system in your head. We&apos;ll turn the direction into a high-level visual starting point.</p>
          <label className="prompt-label">YOUR IDEA<textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} rows={5} /></label>
          <button className="primary-action" onClick={assistSketch}>Generate concept <span>✦</span></button>
          <button className="save-project" onClick={() => setIsSaveDialogOpen(true)}>Save project <span>⌄</span></button>
          <p className="sketch-status">● {status}</p>
          <div className="sketch-meta"><span>MODE</span><strong>High-level / loose</strong><span>OUTPUT</span><strong>Form + proportion</strong></div>
        </aside>
        <section className="canvas-panel">
          <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
            <defs>
              <pattern id="hatch45" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <line x1="0" y1="0" x2="0" y2="6" stroke="#171717" strokeWidth="1.5" />
              </pattern>
            </defs>
          </svg>
          <div className="canvas-toolbar"><span>SKETCHBOOK / UNTITLED</span><div className="canvas-toolbar-actions"><span>{Math.round(zoom * 100)}%</span><button className="view-button" onClick={resetView}>RESET VIEW</button><button className="clear-canvas" onClick={clearCanvas}>CLEAR CANVAS</button></div></div>
          <div className="canvas-body">
            <div className="tool-rail">
              {TOOLS.map((toolItem) => (
                <button key={toolItem.id} type="button" className={`tool-button ${tool === toolItem.id ? 'active' : ''}`} title={toolItem.label} aria-label={toolItem.label} onClick={() => setTool(toolItem.id)}>
                  <ToolIcon tool={toolItem.id} />
                </button>
              ))}
            </div>
            <div className="canvas-wrap"><canvas ref={canvasRef} width={800} height={620} style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }} onPointerDown={startPointer} onPointerMove={movePointer} onPointerUp={endPointer} onPointerCancel={endPointer} onPointerLeave={endPointer} /><span className="canvas-hint">Draw with one finger · pinch to zoom · two fingers to pan</span></div>
          </div>
        </section>
      </main>
      {isSaveDialogOpen && (
        <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setIsSaveDialogOpen(false) }}>
          <section className="save-dialog" role="dialog" aria-modal="true" aria-labelledby="save-project-title">
            <div className="dialog-heading"><p className="eyebrow">PROJECT DETAILS</p><button className="dialog-close" onClick={() => setIsSaveDialogOpen(false)} aria-label="Close save dialog">×</button></div>
            <h2 id="save-project-title">Save project.</h2>
            <p className="dialog-copy">Give this concept its working identifiers before adding it to your saved projects.</p>
            <form onSubmit={(event) => { event.preventDefault(); saveProject() }}>
              <label className="dialog-field">PROJECT NUMBER<input value={projectNumber} onChange={(event) => setProjectNumber(event.target.value)} placeholder="001" required /></label>
              <label className="dialog-field">PROJECT REVISION<input value={projectRevision} onChange={(event) => setProjectRevision(event.target.value)} placeholder="Rev C01" required /></label>
              <label className="dialog-field">PROJECT NAME<input value={projectName} onChange={(event) => setProjectName(event.target.value)} placeholder="SINGER DESK LAMP" required /></label>
              <button className="primary-action dialog-save" type="submit">Save project <span>↗</span></button>
            </form>
          </section>
        </div>
      )}
    </div>
  )
}