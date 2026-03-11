'use client'
export default function Footer() {
  return (
    <footer style={{
      borderTop: '1px solid var(--border)',
      background: 'var(--nav-bg)',
      backdropFilter: 'blur(12px)',
      padding: '0 32px',
      height: 48,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 'auto',
    }}>
      {/* Left: creator tag */}
      <p style={{
        fontFamily: 'DM Mono',
        fontSize: 12,
        color: 'var(--text-muted)',
        margin: 0,
      }}>
        Built by{' '}
        <span style={{ color: '#f97316', fontWeight: 500 }}>Aditya Kamath</span>
        {' '}— PM, building to learn AI.
      </p>

      {/* Right: links */}
      <div style={{ display: 'flex', gap: 24, alignItems: 'center' }}>
        {[
          { label: 'Portfolio', href: null },
          { label: 'GitHub',    href: 'https://github.com/adityaka24-code' },
          { label: 'LinkedIn',  href: 'https://www.linkedin.com/in/adityakamath1996/' },
        ].map(({ label, href }) => (
          href ? (
            <a key={label} href={href} target="_blank" rel="noopener noreferrer"
              style={{
                fontFamily: 'DM Mono', fontSize: 12,
                color: 'var(--text-muted)', textDecoration: 'none',
                transition: 'color 0.15s',
              }}
              onMouseEnter={e => e.currentTarget.style.color = 'var(--text)'}
              onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}
            >
              {label}
            </a>
          ) : (
            <span key={label} style={{
              fontFamily: 'DM Mono', fontSize: 12,
              color: 'var(--text-muted)', opacity: 0.4, cursor: 'default',
            }}>
              {label}
            </span>
          )
        ))}
      </div>
    </footer>
  )
}
