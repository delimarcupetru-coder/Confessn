import { useState, useEffect } from 'react'
import { Chessboard } from 'react-chessboard'
import { Chess, Square } from 'chess.js'

const CB = Chessboard as any

export function ChessAI() {
  const [game, setGame] = useState(new Chess())
  const [moveSquares, setMoveSquares] = useState<Record<string, { background: string }>>({})
  const [isThinking, setIsThinking] = useState(false)
  const [gameStatus, setGameStatus] = useState('')

  // Simple AI that picks random legal moves (Stockfish integration would be complex)
  function makeAIMove() {
    setIsThinking(true)
    
    setTimeout(() => {
      const moves = game.moves({ verbose: true }) as any[]
      
      if (moves.length === 0) {
        if (game.isCheckmate()) {
          setGameStatus('You won! Checkmate!')
        } else if (game.isStalemate()) {
          setGameStatus('Draw - Stalemate!')
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

      if (gameCopy.isCheckmate()) {
        setGameStatus('Checkmate! You lost.')
      } else if (gameCopy.isCheck()) {
        setGameStatus('You are in check!')
      } else if (gameCopy.isStalemate()) {
        setGameStatus('Draw - Stalemate!')
      } else {
        setGameStatus('')
      }

      setIsThinking(false)
    }, 500)
  }

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

      if (gameCopy.isCheckmate()) {
        setGameStatus('You won! Checkmate!')
        return true
      }

      if (gameCopy.isStalemate()) {
        setGameStatus('Draw - Stalemate!')
        return true
      }

      // AI makes move after a short delay
      setTimeout(() => makeAIMove(), 300)
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
    setGameStatus('')
    setIsThinking(false)
  }

  return (
    <div style={{ textAlign: 'center', padding: '2rem' }}>
      <h3>Chess vs AI</h3>
      <p style={{ fontSize: '0.9rem', color: '#666' }}>
        Play against the computer (You are white)
      </p>
      <div style={{ maxWidth: '400px', margin: '1rem auto', width: '100%' }}>
        <CB
          position={game.fen()}
          onPieceDrop={onDrop}
          onSquareClick={onSquareClick}
          customSquareStyles={moveSquares}
          animationDuration={200}
          arePiecesDraggable={!isThinking}
        />
      </div>
      <div style={{ marginTop: '1rem' }}>
        <p style={{ fontSize: '0.9rem', minHeight: '20px' }}>
          {isThinking ? '🤖 AI is thinking...' : gameStatus || `Your turn to move`}
        </p>
        <button
          onClick={resetGame}
          disabled={isThinking}
          style={{
            padding: '0.5rem 1rem',
            background: isThinking ? '#ccc' : '#6366f1',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: isThinking ? 'not-allowed' : 'pointer',
            fontSize: '0.9rem',
          }}
        >
          {isThinking ? 'Thinking...' : 'New Game'}
        </button>
      </div>
    </div>
  )
}
