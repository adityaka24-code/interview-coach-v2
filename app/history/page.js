'use client'
import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

function ScoreRing({ score, size = 48 }) {
  const [ready, setReady] = useState(false)
  const mounted = useRef(false)
  useEffect(() => {
    if (mounted.current) return
    mounted.current = true
    requestAnimationFrame(() => requestAnimationFrame(() => setReady(true)))
  }, [])
  const strokeW = size >= 70 ? 5 : 3.5
  const r = (size / 2) - strokeW - 1
  const circ = 2 * Math.PI * r
  const fill = ready ? (score / 10) * circ : 0
  const c = score >= 7 ? '#68d391' : score >= 5 ? '#f6ad55' : '#fc8181'
  const fontSize = size >= 70 ? 24 : size >= 50 ? 15 : 12
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--surface2)" strokeWidth={strokeW}/>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={c} strokeWidth={strokeW}
          strokeDasharray={`${fill} ${circ}`}
          strokeLinecap="round" transform={`rotate(-90 ${size/2} ${size/2})`}
          style={{ transition: 'stroke-dasharray 1.2s cubic-bezier(0.4,0,0.2,1)', filter: `drop-shadow(0 0 4px ${c}88)` }}/>
      </svg>
      <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
        justifyContent: 'center', fontSize, fontWeight: 800,
        color: c, fontFamily: 'DM Mono', lineHeight: 1 }}>
        {Number.isInteger(score) ? score : score.toFixed(1)}
      </span>
    </div>
  )
}

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
  const router = useRouter()
  const [activeTab, setActiveTab] = useState('interviews')
  const [interviews, setInterviews] = useState([])
  const [loading, setLoading] = useState(true)
  const [predictions, setPredictions] = useState(null)
  const [predictionsCount, setPredictionsCount] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(null) // id of interview pending deletion, or null

  async function deleteInterview(id) {
    await fetch(`/api/interviews?id=${id}`, { method: 'DELETE' })
    setInterviews(prev => prev.filter(iv => iv.id !== id))
    setConfirmDelete(null)
  }

  useEffect(() => {
    if (!confirmDelete) return
    function handleClickOutside(e) {
      if (!e.target.closest('[data-confirm-popover]')) setConfirmDelete(null)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [confirmDelete])

  useEffect(() => {
    fetch('/api/interviews').then(r => r.json()).then(d => {
      setInterviews(d.interviews || [])
      setLoading(false)
    })
    // Fetch predictions count upfront for the header
    fetch('/api/predictions').then(r => r.json()).then(d => {
      const list = d.predictions || []
      setPredictionsCount(list.length)
      setPredictions(list)
    })
  }, [])

  const tabs = [
    { key: 'interviews', label: '🎙 Interviews', icon: null },
    { key: 'predictions', label: '🔮 Predictions', icon: null },
  ]

  return (
    <div style={{ maxWidth: 860, margin: '0 auto', padding: '40px 24px' }}>
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontFamily: 'Montserrat', fontSize: 28, fontWeight: 800, color: 'var(--text)', marginBottom: 8, letterSpacing: '-0.3px' }}>
          My Activity
        </h1>
        <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
          <span style={{ fontSize: 13, color: 'var(--text-muted)', fontFamily: 'DM Mono' }}>
            <span style={{ color: 'var(--text)', fontWeight: 600 }}>{interviews.length}</span> interview{interviews.length !== 1 ? 's' : ''} analysed
          </span>
          <span style={{ width: 1, height: 12, background: 'var(--border)' }} />
          <span style={{ fontSize: 13, color: 'var(--text-muted)', fontFamily: 'DM Mono' }}>
            <span style={{ color: 'var(--text)', fontWeight: 600 }}>{predictionsCount ?? '…'}</span> scenario{predictionsCount !== 1 ? 's' : ''} predicted
          </span>
        </div>
      </div>

      {/* Pill toggle — matches home page style */}
      <div style={{
        display: 'inline-flex', gap: 4, padding: 4,
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 14, marginBottom: 28,
      }}>
        {tabs.map(({ key, label }) => {
          const active = activeTab === key
          return (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              style={{
                padding: '10px 22px',
                borderRadius: 10,
                border: active ? '1px solid rgba(255,255,255,0.15)' : '1px solid transparent',
                background: active ? 'linear-gradient(135deg,#1d4ed8 0%,#2563eb 50%,#3b82f6 100%)' : 'transparent',
                color: active ? '#ffffff' : 'var(--text-muted)',
                fontSize: 14, fontFamily: 'DM Mono', fontWeight: active ? 700 : 400,
                letterSpacing: '0.2px',
                cursor: 'pointer',
                boxShadow: active ? '0 4px 18px rgba(37,99,235,0.45)' : 'none',
                textShadow: active ? '0 1px 2px rgba(0,0,0,0.3)' : 'none',
                transition: 'all 0.18s ease',
              }}
              aria-selected={active}
            >
              {label}
            </button>
          )
        })}
      </div>

      {/* Interview history tab */}
      {activeTab === 'interviews' && (
        <>
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
              <div key={iv.id} style={{ position: 'relative' }}>

                {/* Confirmation popover */}
                {confirmDelete === iv.id && (
                  <div data-confirm-popover style={{
                    position: 'absolute', bottom: 'calc(100% + 8px)', right: 22,
                    background: 'var(--surface)', border: '1px solid rgba(252,129,129,0.4)',
                    borderRadius: 10, padding: '12px 16px', zIndex: 50,
                    boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
                    display: 'flex', flexDirection: 'column', gap: 10, minWidth: 220,
                  }}>
                    <p style={{ margin: 0, fontSize: 13, color: 'var(--text)', fontFamily: 'Open Sans, sans-serif', lineHeight: 1.5 }}>
                      Are you sure you want to delete this report?
                    </p>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        onClick={() => deleteInterview(iv.id)}
                        style={{
                          flex: 1, padding: '7px 0', borderRadius: 7, border: 'none',
                          background: 'rgba(252,129,129,0.15)', color: '#fc8181',
                          fontFamily: 'DM Mono', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                        }}
                      >
                        Yes, delete
                      </button>
                      <button
                        onClick={() => setConfirmDelete(null)}
                        style={{
                          flex: 1, padding: '7px 0', borderRadius: 7,
                          border: '1px solid var(--border)', background: 'transparent',
                          color: 'var(--text-muted)', fontFamily: 'DM Mono', fontSize: 12, cursor: 'pointer',
                        }}
                      >
                        No
                      </button>
                    </div>
                  </div>
                )}

                {/* Card — clicking navigates to report */}
                <Link href={`/history/${iv.id}`} style={{ textDecoration: 'none' }}>
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
                    {iv.overall_score ? (
                      <ScoreRing score={iv.overall_score} size={48} />
                    ) : (
                      <div style={{
                        width: 48, height: 48, borderRadius: 10, flexShrink: 0,
                        background: 'var(--surface2)', border: '2px solid var(--border)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 15, color: 'var(--text-muted)', fontFamily: 'DM Mono',
                      }}>–</div>
                    )}

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

                {/* Delete button — right-aligned below the card */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4, paddingRight: 4 }}>
                  <button
                    onClick={e => {
                      e.stopPropagation()
                      setConfirmDelete(confirmDelete === iv.id ? null : iv.id)
                    }}
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer',
                      fontSize: 11, color: 'var(--text-muted)', fontFamily: 'DM Mono',
                      letterSpacing: '0.5px', padding: '4px 8px', borderRadius: 6,
                      transition: 'color 0.15s',
                    }}
                    onMouseEnter={e => e.currentTarget.style.color = '#fc8181'}
                    onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}
                  >
                    Delete report
                  </button>
                </div>

              </div>
            ))}
          </div>
        </>
      )}

      {/* Predictions tab */}
      {activeTab === 'predictions' && (
        <>
          {predictions === null && (
            <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 60, fontSize: 14, fontFamily: 'DM Mono' }}>
              Loading predictions...
            </div>
          )}

          {predictions !== null && predictions.length === 0 && (
            <div style={{
              textAlign: 'center', padding: 60,
              background: 'var(--surface)', borderRadius: 16, border: '1px solid var(--border)',
            }}>
              <div style={{ fontSize: 40, marginBottom: 16 }}>🔮</div>
              <div style={{ color: 'var(--text)', fontSize: 16, fontFamily: 'DM Serif Display', marginBottom: 8 }}>No predictions yet</div>
              <div style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 20 }}>Predict questions before your next interview</div>
              <Link href="/predict" style={{
                display: 'inline-block', padding: '10px 24px',
                background: 'linear-gradient(135deg, #63b3ed, #4299e1)',
                color: '#0a0a0f', borderRadius: 10, textDecoration: 'none',
                fontFamily: 'DM Mono', fontSize: 13, fontWeight: 'bold',
              }}>Predict questions →</Link>
            </div>
          )}

          {predictions && predictions.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {predictions.map((p, i) => {
                const cb = p.callbackProbability
                const prob = cb?.withoutReferral ?? null
                const boosted = cb?.withReferral ?? (prob != null ? Math.min(prob + Math.min(Math.round((100 - prob) * 0.35), 28), 99) : null)
                const boost = boosted != null && prob != null ? boosted - prob : 0
                const probColor = prob == null ? 'var(--text-muted)' : prob >= 65 ? '#3fb950' : prob >= 40 ? '#d29922' : '#f85149'
                return (
                <Link key={p.id} href={`/predict/report/${p.id}`} style={{ textDecoration: 'none' }}>
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
                    {/* Callback probability badge */}
                    <div style={{
                      width: 48, height: 48, borderRadius: 10, flexShrink: 0,
                      background: 'var(--surface2)', border: `2px solid ${probColor}33`,
                      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {boosted != null ? (
                        <>
                          <span style={{ fontSize: 13, fontWeight: 800, color: probColor, fontFamily: 'DM Mono', lineHeight: 1 }}>{boosted}%</span>
                          <span style={{ fontSize: 8, color: 'var(--text-muted)', fontFamily: 'DM Mono', marginTop: 1 }}>w/ ref</span>
                        </>
                      ) : (
                        <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'DM Mono' }}>—</span>
                      )}
                    </div>

                    {/* Main info */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                        <span style={{ fontSize: 15, color: 'var(--text)', fontFamily: 'DM Serif Display' }}>{p.company || 'Unknown company'}</span>
                        {p.role_level && <span style={{ fontSize: 12, color: 'var(--text-muted)', background: 'var(--surface2)', padding: '2px 8px', borderRadius: 20 }}>{p.role_level}</span>}
                        {p.round_type && <RoundBadge type={p.round_type} />}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'DM Mono' }}>
                        {prob != null && <span style={{ color: probColor, marginRight: 8 }}>{prob}% base · +{boost}% referral</span>}
                      </div>
                    </div>

                    {/* Date */}
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0, textAlign: 'right' }}>
                      {p.created_at ? new Date(p.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : ''}
                      <div style={{ marginTop: 4, color: 'var(--accent)', fontSize: 11 }}>View report →</div>
                    </div>
                  </div>
                </Link>
                )
              })}
            </div>
          )}
        </>
      )}
    </div>
  )
}
