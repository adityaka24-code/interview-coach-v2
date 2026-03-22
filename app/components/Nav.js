'use client'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { useTheme } from '../context/ThemeContext'
import BugReportButton from './BugReportButton'

const links = [
  { href:'/', label:'Home' },
  { href:'/history', label:'Activity' },
  { href:'/questions', label:'Questions' },
  { href:'/salaries', label:'Job Insights' },
  { href:'/profile', label:'Profile' },
]

export default function Nav() {
  const pathname = usePathname()
  const { theme, a11y, toggleTheme, toggleA11y } = useTheme()
  const isLight = theme === 'light'

  return (
    <header style={{
      height: 52,
      padding: '0 24px',
      borderBottom: '1px solid var(--border)',
      background: 'var(--nav-bg)',
      backdropFilter: 'blur(12px)',
      position: 'sticky', top: 0, zIndex: 100,
      display: 'flex', alignItems: 'center', gap: 0,
    }}>
      {/* Logo */}
      <Link href="/" style={{ textDecoration:'none', marginRight:28, flexShrink:0 }}>
        <span style={{
          fontFamily:'Montserrat', fontSize:17, letterSpacing:'-0.3px',
          color: 'var(--text)', opacity: 0.9,
        }}>
          Interview Coach
        </span>
      </Link>

      {/* Nav links */}
      <nav style={{ display:'flex', gap:2, flex:1 }} aria-label="Main navigation">
        {links.map(({ href, label }) => {
          const active = pathname === href
          return (
            <Link key={href} href={href} style={{
              textDecoration:'none', padding:'7px 15px', borderRadius:7,
              fontSize:15, fontFamily:'DM Mono',
              color: active ? 'var(--text)' : 'var(--text-muted)',
              background: active ? 'var(--surface2)' : 'transparent',
              borderBottom: active ? `2px solid var(--accent)` : '2px solid transparent',
              transition:'color 0.15s, background 0.15s',
            }}
              aria-current={active ? 'page' : undefined}
            >
              {label}
            </Link>
          )
        })}
      </nav>

      {/* Controls */}
      <div style={{ display:'flex', gap:10, alignItems:'center', flexShrink:0 }}>

        {/* Bug report */}
        <BugReportButton inline />

        {/* Divider */}
        <div style={{ width:1, height:22, background:'var(--border)' }} aria-hidden />

        {/* Accessibility toggle */}
        <button
          onClick={toggleA11y}
          title={a11y ? 'Disable accessibility mode' : 'Enable high-contrast accessibility mode'}
          aria-label={a11y ? 'Disable accessibility mode' : 'Enable accessibility mode'}
          aria-pressed={a11y}
          style={{
            padding:'6px 13px', borderRadius:7, border:'1px solid var(--border)',
            background: a11y ? 'var(--accent)' : 'transparent',
            color: a11y ? (isLight ? '#fff' : '#0a0a0f') : 'var(--text-muted)',
            fontFamily:'DM Mono', fontSize:14, cursor:'pointer',
            display:'flex', alignItems:'center', gap:6,
            transition:'all 0.15s',
          }}
          onMouseEnter={e => { if (!a11y) e.currentTarget.style.background='var(--surface2)' }}
          onMouseLeave={e => { if (!a11y) e.currentTarget.style.background='transparent' }}
        >
          <span aria-hidden style={{ fontSize:15 }}>♿</span>
          <span>A11Y</span>
        </button>

        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          title={isLight ? 'Switch to dark mode' : 'Switch to light mode'}
          aria-label={isLight ? 'Switch to dark mode' : 'Switch to light mode'}
          style={{
            width: 62, height: 34, borderRadius: 17,
            border: '1px solid var(--border)',
            background: isLight ? 'var(--surface2)' : 'var(--surface)',
            cursor:'pointer', position:'relative', flexShrink:0,
            transition:'background 0.2s',
          }}
        >
          <div style={{
            position:'absolute', top:4, left: isLight ? 30 : 4,
            width:24, height:24, borderRadius:'50%',
            background: isLight ? 'var(--warning)' : 'var(--text-muted)',
            transition:'left 0.2s, background 0.2s',
            display:'flex', alignItems:'center', justifyContent:'center',
            fontSize:14,
          }}>
            {isLight ? '☀' : '◐'}
          </div>
        </button>
      </div>
    </header>
  )
}