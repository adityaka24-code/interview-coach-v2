'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'

const ROUND_COLORS = {
  'Screen':                { bg:'rgba(126,200,247,0.1)', border:'rgba(126,200,247,0.3)', color:'#7ec8f7' },
  'HR':                    { bg:'rgba(251,194,106,0.1)', border:'rgba(251,194,106,0.3)', color:'#fbc26a' },
  'Hiring Manager':        { bg:'rgba(160,118,249,0.1)', border:'rgba(160,118,249,0.3)', color:'#a78bfa' },
  'Senior Product Leader': { bg:'rgba(126,232,162,0.1)', border:'rgba(126,232,162,0.3)', color:'#7ee8a2' },
  'CPO/CXO':               { bg:'rgba(252,129,129,0.12)',border:'rgba(252,129,129,0.35)',color:'#ff8f8f' },
  'Other':                 { bg:'rgba(148,163,184,0.1)', border:'rgba(148,163,184,0.25)',color:'#94a3b8' },
}
function RoundBadge({ type }) {
  if (!type || type === 'unknown') return null
  const s = ROUND_COLORS[type] || ROUND_COLORS['Other']
  return (
    <span style={{ fontSize:11, fontFamily:'DM Mono', padding:'2px 8px', borderRadius:20,
      background:s.bg, border:`1px solid ${s.border}`, color:s.color, whiteSpace:'nowrap', letterSpacing:'0.3px' }}>
      {type}
    </span>
  )
}

const EXPERIENCE_LABELS = { '0-2':'0–2 yrs','2-5':'2–5 yrs','5-8':'5–8 yrs','8-12':'8–12 yrs','12+':'12+ yrs' }
const CURRENCIES = { USD:'$', INR:'₹', GBP:'£', EUR:'€', SGD:'S$', AUD:'A$', CAD:'C$' }

function scoreColor(s) { return s >= 7 ? '#68d391' : s >= 5 ? '#f6ad55' : '#fc8181' }

function formatSalary(min, max, currency) {
  if (!min) return null
  const sym = CURRENCIES[currency] || currency
  const fmt = (n) => currency === 'INR'
    ? n >= 100000 ? `${(n/100000).toFixed(1)}L` : `${(n/1000).toFixed(0)}K`
    : n >= 1000 ? `${(n/1000).toFixed(0)}K` : n
  return `${sym}${fmt(min)}${max ? `–${fmt(max)}` : '+'}`
}



export default function HistoryPage() {
  const [interviews, setInterviews] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/interviews').then(r => r.json()).then(d => {
      setInterviews(d.interviews || [])
      setLoading(false)
    })
  }, [])

  return (
    <div style={{ maxWidth: 860, margin: '0 auto', padding: '40px 24px' }}>
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontFamily: 'DM Serif Display', fontSize: 28, fontWeight: 'normal', color: 'var(--text)', marginBottom: 6 }}>
          Interview History
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>
          {interviews.length} interview{interviews.length !== 1 ? 's' : ''} logged
        </p>
      </div>

      {loading && (
        <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 60, fontSize: 14 }}>Loading...</div>
      )}

      {!loading && interviews.length === 0 && (
        <div style={{
          textAlign: 'center', padding: 60,
          background: 'var(--surface)', borderRadius: 16, border: '1px solid var(--border)',
        }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>🗂️</div>
          <div style={{ color: 'var(--text)', fontSize: 16, fontFamily: 'DM Serif Display', marginBottom: 8 }}>No interviews yet</div>
          <div style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 20 }}>Record or paste your first interview to get started</div>
          <Link href="/" style={{
            display: 'inline-block', padding: '10px 24px',
            background: 'linear-gradient(135deg, #63b3ed, #4299e1)',
            color: '#0a0a0f', borderRadius: 10, textDecoration: 'none',
            fontFamily: 'DM Mono', fontSize: 13, fontWeight: 'bold',
          }}>Start Recording →</Link>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {interviews.map((iv, i) => (
          <Link key={iv.id} href={`/history/${iv.id}`} style={{ textDecoration: 'none' }}>
            <div style={{
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: 14, padding: '18px 22px',
              display: 'flex', alignItems: 'center', gap: 20,
              transition: 'border-color 0.15s, background 0.15s',
              animation: `fadeUp 0.3s ease ${i * 0.05}s both`,
              cursor: 'pointer',
            }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(99,179,237,0.3)'; e.currentTarget.style.background = 'var(--surface2)' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'var(--surface)' }}
            >
              {/* Score */}
              <div style={{
                width: 48, height: 48, borderRadius: 10, flexShrink: 0,
                background: 'var(--surface2)', border: `2px solid ${scoreColor(iv.overall_score)}33`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 15, fontWeight: 'bold', color: scoreColor(iv.overall_score),
                fontFamily: 'DM Mono',
              }}>
                {iv.overall_score || '–'}
              </div>

              {/* Main info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                  <span style={{ fontSize: 15, color: 'var(--text)', fontFamily: 'DM Serif Display' }}>{iv.company}</span>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)', background: 'var(--surface2)', padding: '2px 8px', borderRadius: 20 }}>{iv.role}</span>
                  <RoundBadge type={iv.round_type} />
                </div>
                <div style={{ display: 'flex', gap: 14, fontSize: 12, color: 'var(--text-muted)' }}>
                  {iv.location && <span>📍 {iv.location}</span>}
                  {iv.experience_years && <span>⏱ {EXPERIENCE_LABELS[iv.experience_years] || iv.experience_years}</span>}
                  {iv.salary_min && <span style={{ color: '#68d391' }}>💰 {formatSalary(iv.salary_min, iv.salary_max, iv.salary_currency)}</span>}
                </div>
              </div>

              {/* Date */}
              <div style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0, textAlign: 'right' }}>
                {new Date(iv.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                <div style={{ marginTop: 4, color: 'var(--accent)', fontSize: 11 }}>View report →</div>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
