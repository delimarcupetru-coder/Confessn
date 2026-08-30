import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Chessboard } from 'react-chessboard'
import { Chess, Square } from 'chess.js'
import './ChessGame.css'

const CB = Chessboard as any

export function ChessGame() {
  const navigate = useNavigate()
  const [game, setGame] = useState(new Chess())
  const [moveSquares, setMoveSquares] = useState<Record<string, { background: string }>>({})
  const [isThinking, setIsThinking] = useState(false)
  const [gameStatus, setGameStatus] = useState('')
  const [gameHistory, setGameHistory] = useState<string[]>(['Started new game'])

  function makeAIMove() {
    setIsThinking(true)
    
    setTimeout(() => {
      const moves = game.moves({ verbose: true }) as any[]
      
      if (moves.length === 0) {
        if (game.isCheckmate()) {
          setGameStatus('♔ Checkmate! You won!')
          setGameHistory(prev => [...prev, 'You won by checkmate!'])
        } else if (game.isStalemate()) {
          setGameStatus('🤝 Draw - Stalemate!')
          setGameHistory(prev => [...prev, 'Game ended in stalemate'])
        }
        setIsThinking(false)
        return
      }

      // Simple strategy: prefer captures and checks
      const captureMoves = moves.filter((m) => game.get(m.to as Square))
      const bestMove = captureMoves.length > 0 
        ? captureMoves[Math.floor(Math.random() * captureMoves.length)]
        : moves[Math.floor(Math.random() * moves.length)]

      const gameCopy = new Chess(game.fen())
      gameCopy.move(bestMove)
      setGame(gameCopy)
      setMoveSquares({})
      setGameHistory(prev => [...prev, `AI played: ${bestMove.san}`])

      if (gameCopy.isCheckmate()) {
        setGameStatus('♚ Checkmate! You lost.')
        setGameHistory(prev => [...prev, 'Game over - AI won by checkmate'])
      } else if (gameCopy.isCheck()) {
        setGameStatus('⚠️ You are in check!')
      } else if (gameCopy.isStalemate()) {
        setGameStatus('🤝 Draw - Stalemate!')
        setGameHistory(prev => [...prev, 'Game ended in stalemate'])
      } else {
        setGameStatus('')
      }

      setIsThinking(false)
    }, 800)
  }

  function onDrop(sourceSquare: string, targetSquare: string) {
    if (isThinking) return false

    const move = game.moves({
      square: sourceSquare as Square,
      verbose: true,
    })

    if (!move.find((m: any) => m.to === targetSquare)) {
      return false
    }

    const gameCopy = new Chess(game.fen())
    const result = gameCopy.move({
      from: sourceSquare,
      to: targetSquare,
      promotion: 'q',
    })

    if (result) {
      setGame(gameCopy)
      setMoveSquares({})
      setGameHistory(prev => [...prev, `You played: ${result.san}`])

      if (gameCopy.isCheckmate()) {
        setGameStatus('♔ Checkmate! You won!')
        setGameHistory(prev => [...prev, 'Game over - You won!'])
        return true
      }

      if (gameCopy.isStalemate()) {
        setGameStatus('🤝 Draw - Stalemate!')
        setGameHistory(prev => [...prev, 'Game ended in stalemate'])
        return true
      }

      // AI makes move after a delay
      setTimeout(() => makeAIMove(), 500)
      return true
    }

    return false
  }

  function onSquareClick(square: string) {
    if (isThinking) return
    
    setMoveSquares({})

    const moves = game.moves({
      square: square as Square,
      verbose: true,
    })

    if (moves.length === 0) {
      return
    }

    const squaresToHighlight: Record<string, { background: string }> = {}
    moves.forEach((move: any) => {
      squaresToHighlight[move.to] = { background: 'rgba(255, 193, 7, 0.5)' }
    })
    squaresToHighlight[square] = { background: 'rgba(52, 168, 224, 0.5)' }

    setMoveSquares(squaresToHighlight)
  }

  function resetGame() {
    setGame(new Chess())
    setMoveSquares({})
    setGameStatus('')
    setIsThinking(false)
    setGameHistory(['Started new game'])
  }

  return (
    <div className="chess-game-page">
      <header className="chess-header">
        <button className="back-button" onClick={() => navigate('/')}>
          ← Back to Home
        </button>
        <h1>♟️ Chess vs AI</h1>
        <div className="header-spacer"></div>
      </header>

      <main className="chess-main">
        <div className="chess-board-container">
          <div className="board-wrapper">
            <CB
              position={game.fen()}
              onPieceDrop={onDrop}
              onSquareClick={onSquareClick}
              customSquareStyles={moveSquares}
              animationDuration={200}
              arePiecesDraggable={!isThinking}
            />
          </div>
        </div>

        <aside className="chess-sidebar">
          <div className="game-info">
            <h2>Game Status</h2>
            <div className="status-box">
              <p className="status-text">
                {isThinking 
                  ? '🤖 AI is thinking...' 
                  : gameStatus || '👤 Your turn to move'}
              </p>
            </div>

            <div className="game-stats">
              <div className="stat">
                <span>Moves Made:</span>
                <strong>{game.moves().length}</strong>
              </div>
              <div className="stat">
                <span>Game Turn:</span>
                <strong>{game.turn() === 'w' ? 'White (You)' : 'Black (AI)'}</strong>
              </div>
            </div>

            <button 
              className="reset-button" 
              onClick={resetGame}
              disabled={isThinking}
            >
              🔄 New Game
            </button>

            <div className="rules">
              <h3>How to Play:</h3>
              <ul>
                <li>You play as <strong>White</strong></li>
                <li>Click a piece to see legal moves</li>
                <li>Drag to move or click destination</li>
                <li>AI plays automatically after your move</li>
              </ul>
            </div>
          </div>

          <div className="game-history">
            <h2>Move History</h2>
            <div className="history-list">
              {gameHistory.map((move, idx) => (
                <div key={idx} className="history-item">
                  <span className="move-number">{idx + 1}.</span>
                  <span className="move-text">{move}</span>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </main>
    </div>
  )
}
