'use client'
import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'

const labelStyle = {
  fontSize: 11,
  color: 'var(--text-muted)',
  letterSpacing: '1px',
  textTransform: 'uppercase',
  marginBottom: 6,
  display: 'block',
  fontFamily: 'DM Mono',
}

const pillStyle = (prob) => {
  if (prob === 'high') return { background: 'rgba(104,211,145,0.15)', color: '#68d391' }
  if (prob === 'medium') return { background: 'rgba(251,191,36,0.15)', color: '#f6ad55' }
  return { background: 'rgba(160,174,192,0.15)', color: 'var(--text-muted)' }
}

const badgeBase = {
  fontSize: 11,
  fontFamily: 'DM Mono',
  padding: '2px 8px',
  borderRadius: 20,
  display: 'inline-block',
  flexShrink: 0,
}

function riskBadgeStyle(risk) {
  if (risk === 'high') return {
    background: 'rgba(252,129,129,0.15)',
    color: '#fc8181',
    border: '1px solid rgba(252,129,129,0.3)',
    fontSize: 11,
    fontFamily: 'DM Mono',
    padding: '2px 10px',
    borderRadius: 20,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    fontWeight: 600,
    whiteSpace: 'nowrap',
  }
  if (risk === 'medium') return {
    background: 'rgba(251,191,36,0.15)',
    color: '#f6ad55',
    border: '1px solid rgba(251,191,36,0.3)',
    fontSize: 11,
    fontFamily: 'DM Mono',
    padding: '2px 10px',
    borderRadius: 20,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    fontWeight: 600,
    whiteSpace: 'nowrap',
  }
  return {
    background: 'rgba(104,211,145,0.15)',
    color: '#68d391',
    border: '1px solid rgba(104,211,145,0.3)',
    fontSize: 11,
    fontFamily: 'DM Mono',
    padding: '2px 10px',
    borderRadius: 20,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    fontWeight: 600,
    whiteSpace: 'nowrap',
  }
}

const riskOrder = { high: 0, medium: 1, low: 2 }

export default function PredictionReportPage() {
  const { id } = useParams()
  const router = useRouter()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [visibleSections, setVisibleSections] = useState(0)  // streams sections in one by one
  const [expandedIndex, setExpandedIndex] = useState(0)

  useEffect(() => {
    fetch(`/api/predictions/${id}`)
      .then(r => r.json())
      .then(json => {
        if (json.error) { setError(json.error); return }
        setData(json.prediction)
        // Stream sections in one by one with 150ms stagger
        const TOTAL = 6
        for (let i = 1; i <= TOTAL; i++) {
          setTimeout(() => setVisibleSections(i), i * 150)
        }
      })
      .catch(err => setError(err.message || 'Failed to load report'))
      .finally(() => setLoading(false))
  }, [id])

  async function handleWasAsked(typeIndex, questionIndex, value) {
    const cloned = JSON.parse(JSON.stringify(data))
    cloned.result.predictedQuestions[typeIndex].questions[questionIndex].wasAsked = value
    setData(cloned)
    await fetch(`/api/predictions/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ typeIndex, questionIndex, wasAsked: value }),
    })
  }

  if (loading) return (
    <div style={{ textAlign: 'center', padding: 80, color: 'var(--text-muted)', fontFamily: 'DM Mono', fontSize: 14 }}>
      Loading report...
    </div>
  )

  if (error) return (
    <div style={{ textAlign: 'center', padding: 80, color: 'var(--danger)', fontFamily: 'DM Mono', fontSize: 14 }}>
      {error}
    </div>
  )

  if (!data) return null

  const formattedDate = data.created_at
    ? new Date(data.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    : ''

  const metaParts = [
    data.company,
    data.role_level,
    data.round_type,
    formattedDate,
  ].filter(Boolean)

  const wasAskedButtonStyle = (q, value) => {
    const selected = q.wasAsked === value
    if (selected && value === 'yes') return { color: '#68d391', border: '1px solid #68d391', background: 'rgba(104,211,145,0.1)' }
    return { color: 'var(--text-muted)', border: '1px solid var(--border)', background: 'var(--surface)' }
  }

  const sortedGaps = [...(data.result?.gapAnalysis || [])].sort(
    (a, b) => (riskOrder[a.probeRisk] ?? 3) - (riskOrder[b.probeRisk] ?? 3)
  )

  const streamStyle = (n) => ({
    opacity: visibleSections >= n ? 1 : 0,
    transform: visibleSections >= n ? 'translateY(0)' : 'translateY(16px)',
    transition: 'opacity 0.45s ease, transform 0.45s ease',
  })

  return (
    <main style={{ maxWidth: '96vw', margin: '0 auto', padding: '24px 32px' }}>
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          header, nav, footer { display: none !important; }
          button { display: none !important; }
          body { background: white !important; color: black !important; }
          .no-print { display: none !important; }
        }
      `}} />

      {/* Header row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 32, ...streamStyle(1) }}>
        <div>
          <h1 style={{
            fontFamily: 'Montserrat',
            fontSize: 26,
            fontWeight: 'normal',
            color: 'var(--text)',
            marginBottom: 4,
            marginTop: 0,
          }}>
            Interview prediction report
          </h1>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', fontFamily: 'DM Mono', margin: 0 }}>
            {metaParts.join(' · ')}
          </p>
        </div>
        <div className="no-print" style={{ display: 'flex', gap: 10, flexShrink: 0, marginLeft: 24 }}>
          <button
            onClick={() => router.push('/predict')}
            style={{
              background: 'none',
              border: '1px solid var(--border)',
              borderRadius: 8,
              padding: '8px 14px',
              fontSize: 13,
              color: 'var(--text-muted)',
              cursor: 'pointer',
              fontFamily: 'DM Mono',
            }}
            aria-label="New prediction"
          >
            ← New prediction
          </button>
          <a
            href={`/api/predictions/${id}/pdf`}
            download
            style={{
              background: 'var(--accent)',
              border: 'none',
              borderRadius: 8,
              padding: '8px 16px',
              fontSize: 13,
              color: 'white',
              cursor: 'pointer',
              fontFamily: 'DM Mono',
              textDecoration: 'none',
              display: 'inline-block',
            }}
            aria-label="Download PDF"
          >
            Download PDF
          </a>
        </div>
      </div>

      {/* Callback probability banner */}
      <div style={streamStyle(2)}>
      {data.result?.callbackProbability && (() => {
        const cb = data.result.callbackProbability
        const prob = cb.probability ?? null
        if (prob == null) return null
        const col = prob >= 65 ? '#3fb950' : prob >= 40 ? '#d29922' : '#f85149'
        const colBg = prob >= 65 ? 'rgba(63,185,80,0.06)' : prob >= 40 ? 'rgba(210,153,34,0.06)' : 'rgba(248,81,73,0.05)'
        const colBorder = prob >= 65 ? 'rgba(63,185,80,0.25)' : prob >= 40 ? 'rgba(210,153,34,0.25)' : 'rgba(248,81,73,0.2)'
        const boost = Math.min(Math.round((100 - prob) * 0.35), 28)
        const boostedProb = Math.min(prob + boost, 99)
        const verdict = prob >= 65 ? 'Strong fit' : prob >= 40 ? 'Borderline' : 'Weak fit'
        return (
          <div style={{ background: 'var(--surface)', border: `1px solid ${colBorder}`, borderRadius: 14, marginBottom: 24, overflow: 'hidden' }}>

            {/* Top row: two numbers + verdict */}
            <div style={{ display: 'grid', gridTemplateColumns: 'auto auto 1fr', gap: 0, borderBottom: `1px solid ${colBorder}` }}>

              {/* Without referral */}
              <div style={{ padding: '20px 28px', textAlign: 'center', borderRight: `1px solid ${colBorder}` }}>
                <div style={{ fontSize: 48, fontWeight: 800, color: col, fontFamily: 'DM Mono', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{prob}%</div>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', fontFamily: 'DM Mono', letterSpacing: '1px', textTransform: 'uppercase', marginTop: 6 }}>Without referral</div>
              </div>

              {/* With referral */}
              <div style={{ padding: '20px 28px', textAlign: 'center', borderRight: `1px solid ${colBorder}`, background: 'rgba(63,185,80,0.04)' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 6 }}>
                  <div style={{ fontSize: 48, fontWeight: 800, color: '#3fb950', fontFamily: 'DM Mono', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{boostedProb}%</div>
                  <span style={{ fontSize: 14, fontWeight: 700, color: '#3fb950', fontFamily: 'DM Mono' }}>+{boost}</span>
                </div>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#3fb950', fontFamily: 'DM Mono', letterSpacing: '1px', textTransform: 'uppercase', marginTop: 6 }}>With referral</div>
              </div>

              {/* Verdict + reasoning */}
              <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: col, fontFamily: 'DM Mono', letterSpacing: '0.5px' }}>
                  {verdict}
                </span>
                {cb.reasoning && (
                  <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.65, margin: 0 }}>{cb.reasoning}</p>
                )}
              </div>
            </div>

            {/* Bottom row: signals */}
            {(cb.signals?.strong?.length > 0 || cb.signals?.weak?.length > 0) && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0 }}>
                <div style={{ padding: '14px 20px', borderRight: `1px solid ${colBorder}` }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#3fb950', fontFamily: 'DM Mono', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: 8 }}>✓ Strengths</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    {cb.signals.strong.map((s, i) => (
                      <span key={i} style={{ fontSize: 12, color: 'var(--text)', fontFamily: 'Open Sans, sans-serif', lineHeight: 1.5 }}>· {s}</span>
                    ))}
                  </div>
                </div>
                <div style={{ padding: '14px 20px' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#f85149', fontFamily: 'DM Mono', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: 8 }}>✗ Gaps to address</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    {cb.signals.weak.map((s, i) => (
                      <span key={i} style={{ fontSize: 12, color: 'var(--text)', fontFamily: 'Open Sans, sans-serif', lineHeight: 1.5 }}>· {s}</span>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )
      })()}
      </div>

      {/* Predicted questions */}
      <div style={streamStyle(3)}>
      <h2 style={{
        fontFamily: 'Montserrat',
        fontSize: 20,
        fontWeight: 'normal',
        color: 'var(--text)',
        marginBottom: 20,
        marginTop: 0,
      }}>
        Predicted questions
      </h2>

      {data.result?.predictedQuestions?.map((group, gi) => {
        const isExpanded = expandedIndex === gi
        return (
          <div key={gi} style={{
            background: 'var(--surface2)',
            border: '1px solid var(--border)',
            borderRadius: 12,
            marginBottom: 12,
            overflow: 'hidden',
          }}>
            <div
              onClick={() => setExpandedIndex(isExpanded ? -1 : gi)}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '14px 18px',
                cursor: 'pointer',
              }}
              role="button"
              aria-expanded={isExpanded}
            >
              <span style={{ fontFamily: 'DM Mono', fontSize: 13, color: 'var(--text)' }}>
                {group.questionType}
              </span>
              <span style={{ color: 'var(--text-muted)', fontSize: 14 }}>
                {isExpanded ? '▾' : '▸'}
              </span>
            </div>

            {isExpanded && (
              <div style={{ padding: '0 18px 16px' }}>
                {group.questions?.map((q, qi) => (
                  <div key={qi} style={{
                    marginBottom: qi < group.questions.length - 1 ? 16 : 0,
                    paddingBottom: qi < group.questions.length - 1 ? 16 : 0,
                    borderBottom: qi < group.questions.length - 1 ? '1px solid var(--border)' : 'none',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 0 }}>
                      <span style={{ ...badgeBase, ...pillStyle(q.probability) }}>{q.probability}</span>
                      <span style={{
                        fontSize: 14,
                        color: 'var(--text)',
                        fontWeight: 500,
                        marginBottom: 6,
                        marginLeft: 8,
                        lineHeight: 1.5,
                      }}>
                        {q.question}
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6, marginTop: 6 }}>
                      <span style={{ fontFamily: 'DM Mono' }}>Why: </span>
                      {q.rationale}
                    </div>
                    {/* Feedback row */}
                    <div className="no-print" style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'center' }}>
                      <span style={{ fontSize: 11, fontFamily: 'DM Mono', color: 'var(--text-muted)', marginRight: 4 }}>
                        Was this asked?
                      </span>
                      {[
                        { value: 'yes', label: 'Yes' },
                        { value: 'no', label: 'No' },
                        { value: 'not_yet', label: 'Not yet' },
                      ].map(({ value, label }) => (
                        <button
                          key={value}
                          onClick={() => handleWasAsked(gi, qi, value)}
                          style={{
                            padding: '3px 10px',
                            borderRadius: 20,
                            fontSize: 11,
                            fontFamily: 'DM Mono',
                            cursor: 'pointer',
                            ...wasAskedButtonStyle(q, value),
                          }}
                          aria-pressed={q.wasAsked === value}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}
      </div>

      {/* Gap analysis */}
      <div style={streamStyle(4)}>
      <h2 style={{
        fontFamily: 'Montserrat',
        fontSize: 20,
        fontWeight: 'normal',
        color: 'var(--text)',
        marginTop: 36,
        marginBottom: 6,
      }}>
        Gap analysis
      </h2>
      <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20, marginTop: 0 }}>
        Areas the interviewer will likely probe based on your CV vs this JD.
      </p>

      {sortedGaps.map((gap, i) => {
        const riskColor = gap.probeRisk === 'high' ? '#fc8181' : gap.probeRisk === 'medium' ? '#f6ad55' : '#68d391'
        const riskBg    = gap.probeRisk === 'high' ? 'rgba(252,129,129,0.06)' : gap.probeRisk === 'medium' ? 'rgba(251,191,36,0.06)' : 'rgba(104,211,145,0.06)'
        const riskBorder= gap.probeRisk === 'high' ? 'rgba(252,129,129,0.28)' : gap.probeRisk === 'medium' ? 'rgba(251,191,36,0.28)' : 'rgba(104,211,145,0.28)'
        return (
        <div key={i} style={{
          background: 'var(--surface)',
          border: `1px solid ${riskBorder}`,
          borderRadius: 14,
          marginBottom: 16,
          overflow: 'hidden',
        }}>
          {/* Header bar */}
          <div style={{ background: riskBg, borderBottom: `1px solid ${riskBorder}`, padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ ...riskBadgeStyle(gap.probeRisk), fontSize: 10, padding: '3px 10px' }}>{gap.probeRisk.toUpperCase()} RISK</span>
            <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', fontFamily: 'Montserrat', lineHeight: 1.4 }}>
              {gap.jdRequires}
            </span>
          </div>

          {/* JD vs CV two-column */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0 }}>
            <div style={{ padding: '16px 20px', borderRight: `1px solid ${riskBorder}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={riskColor} strokeWidth="2.5" strokeLinecap="round" aria-hidden>
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
                </svg>
                <span style={{ fontSize: 11, fontWeight: 700, color: riskColor, fontFamily: 'DM Mono', letterSpacing: '1px', textTransform: 'uppercase' }}>JD Requires</span>
              </div>
              <p style={{ fontSize: 13, color: 'var(--text)', margin: 0, lineHeight: 1.7 }}>{gap.jdRequires}</p>
            </div>
            <div style={{ padding: '16px 20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2.5" strokeLinecap="round" aria-hidden>
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
                </svg>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text)', fontFamily: 'DM Mono', letterSpacing: '1px', textTransform: 'uppercase' }}>Your CV Signal</span>
              </div>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0, lineHeight: 1.7 }}>{gap.cvSignal}</p>
            </div>
          </div>

          {/* Prep advice */}
          <div style={{ borderTop: `1px solid ${riskBorder}`, display: 'flex', flexDirection: 'column', gap: 0 }}>
            {[
              { key: 'cvImprovement', label: 'CV improvement', icon: '📄', color: '#68d391', bg: 'rgba(104,211,145,0.05)', border: 'rgba(104,211,145,0.15)' },
              { key: 'interviewTip',  label: 'Interview tip',  icon: '🎯', color: 'var(--accent)', bg: 'rgba(99,179,237,0.04)',  border: 'rgba(99,179,237,0.15)' },
              { key: 'other',         label: 'Study resource', icon: '📚', color: '#a78bfa', bg: 'rgba(167,139,250,0.04)', border: 'rgba(167,139,250,0.15)' },
            ].map(({ key, label, icon, color, bg, border }, ki) => {
              const text = gap.prepAdvice?.[key] || gap.prepAdvice
              if (!text || typeof text === 'object') return null
              return (
                <div key={key} style={{ display: 'flex', gap: 0, borderTop: ki > 0 ? `1px solid ${riskBorder}` : 'none' }}>
                  {/* Left label column */}
                  <div style={{ width: 140, flexShrink: 0, padding: '14px 16px', background: bg, borderRight: `1px solid ${border}`, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'flex-start', gap: 4 }}>
                    <span style={{ fontSize: 16 }}>{icon}</span>
                    <span style={{ fontSize: 10, fontWeight: 700, color, fontFamily: 'DM Mono', letterSpacing: '0.8px', textTransform: 'uppercase', lineHeight: 1.3 }}>{label}</span>
                  </div>
                  {/* Right text column */}
                  <div style={{ flex: 1, padding: '14px 18px' }}>
                    <p style={{ fontSize: 13, color: 'var(--text)', margin: 0, lineHeight: 1.75 }}>{text}</p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
        )
      })}
      </div>
    </main>
  )
}
