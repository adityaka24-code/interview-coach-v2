export const metadata = {
  title: 'Desktop Only — PM Interview Coach',
}

export default function MobileBlocked() {
  return (
    <>
      <head>
        <link
          rel="preconnect"
          href="https://fonts.googleapis.com"
        />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Montserrat:wght@600;700&family=DM+Mono&display=swap"
          rel="stylesheet"
        />
      </head>
      <main
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          background: '#0a0a0f',
          color: '#ffffff',
          textAlign: 'center',
          padding: '2rem',
          fontFamily: "'DM Mono', monospace",
        }}
      >
        <div
          style={{
            maxWidth: '480px',
          }}
        >
          <div
            style={{
              fontSize: '3rem',
              marginBottom: '1.5rem',
              color: '#7ec8f7',
            }}
          >
            🖥
          </div>
          <h1
            style={{
              fontFamily: "'Montserrat', sans-serif",
              fontSize: '1.5rem',
              fontWeight: 700,
              color: '#7ec8f7',
              marginBottom: '1rem',
              letterSpacing: '-0.02em',
            }}
          >
            Desktop only
          </h1>
          <p
            style={{
              fontSize: '1rem',
              lineHeight: 1.7,
              color: 'rgba(255,255,255,0.75)',
            }}
          >
            This app is built for larger screens. Please open it on your laptop
            or desktop.
          </p>
        </div>
      </main>
    </>
  )
}
