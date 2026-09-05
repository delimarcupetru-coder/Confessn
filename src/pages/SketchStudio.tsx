import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import './Studio.css'

export function SketchStudio() {
  const navigate = useNavigate()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [prompt, setPrompt] = useState('Compact modular desk lamp with an adjustable arm')
  const [status, setStatus] = useState('Ready for direction')
  const [isDrawing, setIsDrawing] = useState(false)
  const [isSaveDialogOpen, setIsSaveDialogOpen] = useState(false)
  const [projectNumber, setProjectNumber] = useState('001')
  const [projectRevision, setProjectRevision] = useState('Rev C01')
  const [projectName, setProjectName] = useState('SINGER DESK LAMP')

  function canvasPoint(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    const bounds = canvas.getBoundingClientRect()
    return {
      x: (event.clientX - bounds.left) * (canvas.width / bounds.width),
      y: (event.clientY - bounds.top) * (canvas.height / bounds.height),
    }
  }

  function startDrawing(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current
    if (!canvas) return
    event.preventDefault()
    canvas.setPointerCapture(event.pointerId)
    const context = canvas.getContext('2d')
    if (!context) return
    context.strokeStyle = '#161616'
    context.lineWidth = 2
    context.lineCap = 'round'
    context.beginPath()
    const point = canvasPoint(event)
    context.moveTo(point.x, point.y)
    setIsDrawing(true)
  }

  function draw(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!isDrawing) return
    event.preventDefault()
    const canvas = canvasRef.current
    if (!canvas) return
    const context = canvas.getContext('2d')
    if (!context) return
    const point = canvasPoint(event)
    context.lineTo(point.x, point.y)
    context.stroke()
  }

  function stopDrawing(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current
    if (canvas?.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId)
    setIsDrawing(false)
  }

  function clearCanvas() {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (canvas && context) context.clearRect(0, 0, canvas.width, canvas.height)
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
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) return
    context.clearRect(0, 0, canvas.width, canvas.height)
    context.strokeStyle = '#161616'
    context.lineWidth = 3
    context.strokeRect(240, 210, 300, 120)
    context.beginPath()
    context.moveTo(390, 210); context.lineTo(390, 115); context.lineTo(570, 115); context.lineTo(540, 210)
    context.moveTo(240, 330); context.lineTo(220, 380); context.moveTo(540, 330); context.lineTo(560, 380)
    context.stroke()
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
        <section className="canvas-panel"><div className="canvas-toolbar"><span>SKETCHBOOK / UNTITLED</span><div className="canvas-toolbar-actions"><span>01 — 01</span><button className="clear-canvas" onClick={clearCanvas}>CLEAR CANVAS</button></div></div><div className="canvas-wrap"><canvas ref={canvasRef} width={800} height={620} onPointerDown={startDrawing} onPointerMove={draw} onPointerUp={stopDrawing} onPointerCancel={stopDrawing} onPointerLeave={stopDrawing} /><span className="canvas-hint">Draw freely or generate a starting point</span></div></section>
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