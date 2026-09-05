import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import './Studio.css'

export function Login() {
  const navigate = useNavigate()
  const [mode, setMode] = useState<'login' | 'create'>('login')

  return (
    <div className="auth-page">
      <header className="studio-header">
        <button className="wordmark" onClick={() => navigate('/')}>CONFESSN STUDIO</button>
        <p>Let&apos;s shape your idea together</p>
        <span className="header-login">{mode === 'login' ? 'LOG IN' : 'CREATE ACCOUNT'}</span>
      </header>
      <main className="auth-layout">
        <section className="auth-message">
          <p className="eyebrow">YOUR WORKSPACE</p>
          <h1>Good ideas deserve<br />a place to grow.</h1>
          <p>Save project notes, develop concepts, and return to your sketchbook whenever inspiration arrives.</p>
          <div className="auth-steps"><span>01</span><span>02</span><span>03</span></div>
        </section>
        <section className="auth-form-panel">
          <div className="auth-switch"><button className={mode === 'login' ? 'active' : ''} onClick={() => setMode('login')}>Log in</button><button className={mode === 'create' ? 'active' : ''} onClick={() => setMode('create')}>Create account</button></div>
          <form onSubmit={(event) => { event.preventDefault(); navigate('/account') }}>
            <label>Email<input type="email" placeholder="you@company.com" required /></label>
            <label>Password<input type="password" placeholder="Enter your password" required /></label>
            <button className="primary-action" type="submit">{mode === 'login' ? 'Log in' : 'Create account'} <span>↗</span></button>
          </form>
          {mode === 'login' && <button className="text-action">Forgot password</button>}
          <p className="form-note">By continuing, you agree to our Terms and Privacy Policy.</p>
        </section>
      </main>
      <footer className="studio-footer"><span>© CONFESSN STUDIO</span><nav><button onClick={() => navigate('/')}>Home</button><button>Privacy</button><button>Contact</button></nav></footer>
    </div>
  )
}