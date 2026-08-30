import { useState } from 'react'
import { Chessboard } from 'react-chessboard'
import { Chess, Square } from 'chess.js'

const CB = Chessboard as any

export function ChessBoard() {
  const [game, setGame] = useState(new Chess())
  const [moveSquares, setMoveSquares] = useState<Record<string, { background: string }>>({})

  function onDrop(sourceSquare: string, targetSquare: string) {
    const moves = game.moves({
      square: sourceSquare as Square,
      verbose: true,
    })

    // Check if the move is legal
    if (!moves.find((m: any) => m.to === targetSquare)) {
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
  }

  return (
    <div style={{ textAlign: 'center', padding: '2rem' }}>
      <h3>Interactive Chess Board</h3>
      <p style={{ fontSize: '0.9rem', color: '#666' }}>Click pieces and squares to make moves</p>
      <div style={{ maxWidth: '400px', margin: '1rem auto', width: '100%' }}>
        <CB
          position={game.fen()}
          onPieceDrop={onDrop}
          onSquareClick={onSquareClick}
          customSquareStyles={moveSquares}
          animationDuration={200}
        />
      </div>
      <div style={{ marginTop: '1rem' }}>
        <p style={{ fontSize: '0.9rem' }}>
          {game.isCheckmate()
            ? '♟️ Checkmate!'
            : game.isCheck()
              ? '⚠️ Check!'
              : game.isStalemate()
                ? '🤝 Stalemate'
                : `Moves: ${game.moves().length}`}
        </p>
        <button
          onClick={resetGame}
          style={{
            padding: '0.5rem 1rem',
            background: '#6366f1',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '0.9rem',
          }}
        >
          Reset Game
        </button>
      </div>
    </div>
  )
}
