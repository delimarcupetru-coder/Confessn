import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import { Home } from './pages/Home'
import { ChessGame } from './pages/ChessGame'
import { SelfPlay } from './pages/SelfPlay'
import './App.css'

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/play" element={<ChessGame />} />
        <Route path="/selfplay" element={<SelfPlay />} />
      </Routes>
    </Router>
  )
}

export default App
