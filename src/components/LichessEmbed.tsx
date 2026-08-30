export function LichessEmbed() {
  return (
    <div style={{ textAlign: 'center', padding: '2rem' }}>
      <h3>Play on Lichess</h3>
      <p style={{ fontSize: '0.9rem', color: '#666' }}>
        Powered by Lichess.org - The free, open-source chess platform
      </p>
      <div style={{ maxWidth: '600px', margin: '1rem auto', height: '600px' }}>
        <iframe
          title="Lichess Chess Board"
          src="https://lichess.org/embed/auto?bg=light"
          style={{
            width: '100%',
            height: '100%',
            borderRadius: '8px',
            border: 'none',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
          }}
          allowFullScreen
        ></iframe>
      </div>
      <p style={{ fontSize: '0.85rem', color: '#999', marginTop: '1rem' }}>
        Play unlimited chess games against the computer or other players at{' '}
        <a href="https://lichess.org" target="_blank" rel="noopener noreferrer" style={{ color: '#6366f1' }}>
          Lichess.org
        </a>
      </p>
    </div>
  )
}
