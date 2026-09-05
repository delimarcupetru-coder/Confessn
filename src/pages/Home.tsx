import { useNavigate } from 'react-router-dom'
import './Studio.css'

export function Home() {
  const navigate = useNavigate()

  return (
    <div className="studio-page">
      <header className="studio-header">
        <button className="wordmark" onClick={() => navigate('/')}>CONFESSN STUDIO</button>
        <p>Let&apos;s shape your idea together</p>
        <button className="header-login" onClick={() => navigate('/login')}>LOG IN</button>
      </header>

      <main className="studio-home">
        <section className="studio-intro">
          <p className="eyebrow">PRODUCT DESIGN / ENGINEERING / PROTOTYPING</p>
          <h1>From concept to launch<br />we build products that matter.</h1>
          <p className="studio-path">Idea <span>→</span> Design <span>→</span> Prototype <span>→</span> Build <span>→</span> Launch</p>
          <button className="primary-action" onClick={() => navigate('/sketch')}>Start a new project <span>↗</span></button>
        </section>

        <section className="studio-preview" aria-label="Featured project">
          <div className="preview-grid"></div>
          <div className="preview-object object-one"></div>
          <div className="preview-object object-two"></div>
          <div className="preview-object object-three"></div>
          <span className="preview-label">01 / CONCEPT STUDY</span>
        </section>

        <section className="studio-services">
          <p className="eyebrow">WHAT WE DO</p>
          <div className="service-row"><span>01</span><h2>Product strategy</h2><p>Turn an early thought into a clear, buildable direction.</p></div>
          <div className="service-row"><span>02</span><h2>Industrial design</h2><p>Shape the object, the experience, and every meaningful detail.</p></div>
          <div className="service-row"><span>03</span><h2>Engineering &amp; prototyping</h2><p>Make the idea tangible through fast, thoughtful iteration.</p></div>
        </section>
      </main>

      <footer className="studio-footer">
        <span>© CONFESSN STUDIO</span>
        <nav><button onClick={() => navigate('/login')}>User</button><button>Privacy</button><button>Home</button><button>About</button><button>Terms</button><button>Contact</button></nav>
      </footer>
    </div>
  )
}
