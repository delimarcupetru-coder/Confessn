import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import './Studio.css'

export function SketchStudio() {
  const navigate = useNavigate()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [prompt, setPrompt] = useState('Compact modular desk lamp with an adjustable arm')
  const [status, setStatus] = useState('Ready for direction')
  const [isDrawing, setIsDrawing] = useState(false)

  function startDrawing(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current
    if (!canvas) return
    const bounds = canvas.getBoundingClientRect()
    const context = canvas.getContext('2d')
    if (!context) return
    context.strokeStyle = '#161616'
    context.lineWidth = 2
    context.lineCap = 'round'
    context.beginPath()
    context.moveTo(event.clientX - bounds.left, event.clientY - bounds.top)
    setIsDrawing(true)
  }

  function draw(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!isDrawing) return
    const canvas = canvasRef.current
    if (!canvas) return
    const bounds = canvas.getBoundingClientRect()
    const context = canvas.getContext('2d')
    if (!context) return
    context.lineTo(event.clientX - bounds.left, event.clientY - bounds.top)
    context.stroke()
  }

  function clearCanvas() {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (canvas && context) context.clearRect(0, 0, canvas.width, canvas.height)
    setStatus('Canvas cleared')
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
          <button className="secondary-action" onClick={clearCanvas}>Clear canvas</button>
          <p className="sketch-status">● {status}</p>
          <div className="sketch-meta"><span>MODE</span><strong>High-level / loose</strong><span>OUTPUT</span><strong>Form + proportion</strong></div>
        </aside>
        <section className="canvas-panel"><div className="canvas-toolbar"><span>SKETCHBOOK / UNTITLED</span><span>01 — 01</span></div><div className="canvas-wrap"><canvas ref={canvasRef} width={800} height={620} onPointerDown={startDrawing} onPointerMove={draw} onPointerUp={() => setIsDrawing(false)} onPointerLeave={() => setIsDrawing(false)} /><span className="canvas-hint">Draw freely or generate a starting point</span></div></section>
      </main>
    </div>
  )
}