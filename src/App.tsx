import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import { Home } from './pages/Home'
import { Login } from './pages/Login'
import { SketchStudio } from './pages/SketchStudio'
import { Account } from './pages/Account'

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/account" element={<Account />} />
        <Route path="/sketch" element={<SketchStudio />} />
      </Routes>
    </Router>
  )
}

export default App
