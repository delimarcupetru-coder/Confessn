import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import '../App.css'

export function Home() {
  const [email, setEmail] = useState('')
  const navigate = useNavigate()

  const handleSignUp = (e: React.FormEvent) => {
    e.preventDefault()
    alert(`Thanks for signing up with: ${email}`)
    setEmail('')
  }

  return (
    <div className="app">
      {/* Navigation */}
      <nav className="navbar">
        <div className="nav-container">
          <h1 className="logo">♟️ Confessn</h1>
          <ul className="nav-links">
            <li><a href="#features">Features</a></li>
            <li><a href="#games">Games</a></li>
            <li><a href="#about">About</a></li>
            <li><a href="#signup">Join Now</a></li>
          </ul>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="hero">
        <div className="hero-content">
          <h1>Stop Procrastinating. Start Playing Chess.</h1>
          <p>Connect with chess players worldwide. Create your account today and challenge friends in real-time chess games.</p>
          <button className="cta-button" onClick={() => navigate('/play')}>
            Play Chess Now
          </button>
        </div>
        <div className="hero-stats">
          <div className="stat">
            <h3>1000+</h3>
            <p>Active Players</p>
          </div>
          <div className="stat">
            <h3>50K+</h3>
            <p>Games Played</p>
          </div>
          <div className="stat">
            <h3>24/7</h3>
            <p>Available</p>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="features">
        <h2>Why Choose Confessn?</h2>
        <div className="features-grid">
          <div className="feature-card">
            <div className="feature-icon">🎮</div>
            <h3>Play Online Chess</h3>
            <p>Challenge players from around the world in real-time chess matches with instant notifications</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon">👥</div>
            <h3>Multiplayer Gaming</h3>
            <p>Play against friends or find new opponents. Build your gaming community on Confessn</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon">📊</div>
            <h3>Track Your Stats</h3>
            <p>Monitor your wins, losses, and rating. Improve your chess skills with detailed analytics</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon">🏆</div>
            <h3>Leaderboards</h3>
            <p>Compete for rankings and earn badges. Show your chess mastery to the community</p>
          </div>
        </div>
      </section>

      {/* About Section */}
      <section id="about" className="about">
        <h2>What is Confessn?</h2>
        <p>Confessn is a platform designed for procrastinators who want to turn idle time into productive fun. Start with chess – the game of strategy and thinking – and challenge yourself while connecting with players worldwide. More games coming soon!</p>
        <div className="game-preview">
          <h3>🎯 Featured Game: Chess</h3>
          <p>Play standard chess games with real opponents. Experience real-time gameplay with a clean, intuitive interface.</p>
        </div>
      </section>

      {/* Games Section */}
      <section id="games" className="games">
        <h2>Play Chess Now</h2>
        <div className="games-intro">
          <p>Try our interactive chess board, play against our AI, or challenge players on Lichess</p>
        </div>
        
        <div className="game-links">
          <button 
            className="game-link-card"
            onClick={() => navigate('/play')}
          >
            <div className="game-link-icon">🤖</div>
            <h3>Play vs AI</h3>
            <p>Challenge our intelligent chess AI opponent</p>
            <span className="play-now">Play Now →</span>
          </button>

          <button 
            className="game-link-card"
            onClick={() => navigate('/selfplay')}
          >
            <div className="game-link-icon">👥</div>
            <h3>Self Play</h3>
            <p>Play against a friend on the same board</p>
            <span className="play-now">Play Now →</span>
          </button>

          <a href="https://lichess.org" target="_blank" rel="noopener noreferrer" className="game-link-card">
            <div className="game-link-icon">♟️</div>
            <h3>Lichess.org</h3>
            <p>Play against thousands of online opponents</p>
            <span className="play-now">Visit Now →</span>
          </a>
        </div>
      </section>

      {/* Sign Up Section */}
      <section id="signup" className="signup">
        <h2>Ready to Play?</h2>
        <p>Join thousands of players enjoying chess on Confessn</p>
        <form className="signup-form" onSubmit={handleSignUp}>
          <input
            type="email"
            placeholder="Enter your email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <button type="submit" className="submit-button">Create Account</button>
        </form>
      </section>

      {/* Footer */}
      <footer className="footer">
        <div className="footer-content">
          <div className="footer-section">
            <h4>Confessn</h4>
            <p>Gaming for procrastinators</p>
          </div>
          <div className="footer-section">
            <h4>Quick Links</h4>
            <ul>
              <li><a href="#features">Features</a></li>
              <li><a href="#games">Games</a></li>
              <li><a href="#about">About</a></li>
              <li><a href="#signup">Sign Up</a></li>
            </ul>
          </div>
          <div className="footer-section">
            <h4>Follow Us</h4>
            <ul>
              <li><a href="#">Twitter</a></li>
              <li><a href="#">Discord</a></li>
              <li><a href="#">GitHub</a></li>
            </ul>
          </div>
        </div>
        <div className="footer-bottom">
          <p>&copy; 2026 Confessn. All rights reserved.</p>
        </div>
      </footer>
    </div>
  )
}
