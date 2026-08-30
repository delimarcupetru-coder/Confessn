import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Chessboard } from 'react-chessboard'
import { Chess, Square } from 'chess.js'
import './ChessGame.css'

const CB = Chessboard as any

export function SelfPlay() {
  const navigate = useNavigate()
  const [game, setGame] = useState(new Chess())
  const [moveSquares, setMoveSquares] = useState<Record<string, { background: string }>>({})
  const [gameHistory, setGameHistory] = useState<string[]>(['White to move'])

  function onDrop(sourceSquare: string, targetSquare: string) {
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
      setGameHistory(prev => [...prev, `${gameCopy.turn() === 'w' ? 'Black' : 'White'} played: ${result.san}`])

      return true
    }

    return false
  }

  function onSquareClick(square: string) {
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
    setGameHistory(['White to move'])
  }

  function flipBoard() {
    // This would flip the board perspective
    window.location.reload()
  }

  const currentPlayer = game.turn() === 'w' ? '♔ White' : '♚ Black'

  return (
    <div className="chess-game-page">
      <header className="chess-header">
        <button className="back-button" onClick={() => navigate('/')}>
          ← Back to Home
        </button>
        <h1>♟️ Self Play Chess</h1>
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
            />
          </div>
        </div>

        <aside className="chess-sidebar">
          <div className="game-info">
            <h2>Game Status</h2>
            <div className="status-box">
              <p className="status-text">
                {game.isCheckmate()
                  ? `♔ ${game.turn() === 'b' ? 'White' : 'Black'} won by checkmate!`
                  : game.isCheck()
                    ? `${currentPlayer} is in check!`
                    : game.isStalemate()
                      ? '🤝 Stalemate - Draw!'
                      : `${currentPlayer}'s turn`}
              </p>
            </div>

            <div className="game-stats">
              <div className="stat">
                <span>Total Moves:</span>
                <strong>{Math.floor(game.moves().length / 2)}</strong>
              </div>
              <div className="stat">
                <span>Current Turn:</span>
                <strong>{currentPlayer}</strong>
              </div>
            </div>

            <button 
              className="reset-button" 
              onClick={resetGame}
            >
              🔄 New Game
            </button>

            <div className="rules">
              <h3>How to Play:</h3>
              <ul>
                <li>Take turns playing as <strong>White & Black</strong></li>
                <li>Click a piece to see legal moves</li>
                <li>Drag to move or click destination</li>
                <li>Perfect for practice & analysis</li>
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
