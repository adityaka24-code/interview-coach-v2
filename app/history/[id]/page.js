'use client'
import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
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

function SignalBar({ label, value, max = 5 }) {
  const color = value >= 4 ? '#68d391' : value >= 3 ? '#f6ad55' : '#fc8181'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
      <span style={{ fontSize: 13, color: 'var(--text-muted)', width: 160, flexShrink: 0 }}>{label}</span>
      <div style={{ flex: 1, height: 5, background: 'rgba(255,255,255,0.05)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${(value/max)*100}%`, height: '100%', background: color, borderRadius: 3, transition: 'width 1s ease' }} />
      </div>
      <span style={{ fontSize: 13, color, width: 28, textAlign: 'right', fontFamily: 'DM Mono' }}>{value}/{max}</span>
    </div>
  )
}

function AnswerCard({ answer, index }) {
  const [expanded, setExpanded] = useState(false)
  const c = answer.score >= 7 ? '#68d391' : answer.score >= 5 ? '#f6ad55' : '#fc8181'
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', marginBottom: 12 }}>
      <div style={{ padding: '16px 22px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 16, borderBottom: expanded ? '1px solid var(--border)' : 'none' }} onClick={() => setExpanded(!expanded)}>
        <div style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--surface2)', border: `1px solid ${c}44`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 'bold', color: c, fontFamily: 'DM Mono', flexShrink: 0 }}>{answer.score}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, color: 'var(--text)', fontFamily: 'DM Serif Display', marginBottom: 4 }}>Q{index+1}: {answer.question}</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{answer.yourAnswer}</div>
        </div>
        <span style={{ fontSize: 16, color: 'var(--text-muted)', flexShrink: 0 }}>{expanded ? '↑' : '↓'}</span>
      </div>
      {expanded && (
        <div style={{ padding: '20px 22px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 18 }}>
            <div style={{ background: 'rgba(104,211,145,0.05)', border: '1px solid rgba(104,211,145,0.15)', borderRadius: 10, padding: '14px 16px' }}>
              <div style={{ fontSize: 11, color: '#68d391', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: 8, fontFamily: 'DM Mono' }}>✓ Worked</div>
              <div style={{ fontSize: 14, color: 'var(--text)', lineHeight: 1.65 }}>{answer.whatWorked}</div>
            </div>
            <div style={{ background: 'rgba(252,129,129,0.05)', border: '1px solid rgba(252,129,129,0.15)', borderRadius: 10, padding: '14px 16px' }}>
              <div style={{ fontSize: 11, color: '#fc8181', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: 8, fontFamily: 'DM Mono' }}>✗ Missed</div>
              <div style={{ fontSize: 14, color: 'var(--text)', lineHeight: 1.65 }}>{answer.whatMissed}</div>
            </div>
          </div>
          {answer.pmSignals && Object.keys(answer.pmSignals).length > 0 && (
            <div style={{ marginBottom: 18 }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: 12, fontFamily: 'DM Mono' }}>PM Signals</div>
              {Object.entries(answer.pmSignals).map(([k,v]) => <SignalBar key={k} label={k} value={v} />)}
            </div>
          )}
          {answer.rewrittenAnswer && (
            <div>
              <div style={{ fontSize: 11, color: 'var(--accent)', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: 10, fontFamily: 'DM Mono' }}>✦ Rewritten Answer</div>
              <div style={{ background: 'rgba(99,179,237,0.04)', border: '1px solid rgba(99,179,237,0.15)', borderRadius: 10, padding: '16px 18px', fontSize: 14, lineHeight: 1.8, color: 'var(--text)', fontFamily: 'DM Serif Display', fontStyle: 'italic' }}>{answer.rewrittenAnswer}</div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function InterviewDetail() {
  const { id } = useParams()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/interviews?id=${id}`).then(r => r.json()).then(d => {
      setData(d.interview)
      setLoading(false)
    })
  }, [id])

  if (loading) return <div style={{ textAlign: 'center', padding: 80, color: 'var(--text-muted)' }}>Loading...</div>
  if (!data) return <div style={{ textAlign: 'center', padding: 80, color: 'var(--text-muted)' }}>Not found</div>

  const a = data.analysis
  const sc = a.overallScore >= 7 ? '#68d391' : a.overallScore >= 5 ? '#f6ad55' : '#fc8181'

  const CURRENCY_SYM = { USD:'$', GBP:'£', EUR:'€', INR:'₹', CAD:'CA$', AUD:'A$', SGD:'S$' }
  const cur = CURRENCY_SYM[data.salary_currency] || data.salary_currency || '$'
  const salaryRange = data.salary_min && data.salary_max
    ? `${cur}${Number(data.salary_min).toLocaleString()} – ${cur}${Number(data.salary_max).toLocaleString()}`
    : data.salary_min ? `${cur}${Number(data.salary_min).toLocaleString()}+`
    : data.salary_max ? `Up to ${cur}${Number(data.salary_max).toLocaleString()}`
    : null

  return (
    <div style={{ maxWidth: '100%', padding: '28px 32px' }}>
      <Link href="/history" style={{ color: 'var(--text-muted)', textDecoration: 'none', fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 24, fontFamily: 'DM Mono' }}>← Back to History</Link>

      {/* ── Header card ── */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: '28px 32px', marginBottom: 20 }}>
        {/* Top row: score + title + badge */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 24, marginBottom: 20 }}>
          <div style={{ width: 76, height: 76, borderRadius: 14, background: 'var(--surface2)', border: `2px solid ${sc}44`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <span style={{ fontSize: 26, fontWeight: 800, color: sc, fontFamily: 'DM Mono', lineHeight: 1 }}>{a.overallScore}</span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'DM Mono' }}>/10</span>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: 'Montserrat', fontSize: 28, fontWeight: 800, color: 'var(--text)', marginBottom: 8, lineHeight: 1.2 }}>
              {data.company}{data.role ? ` — ${data.role}` : ''}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 16px', alignItems: 'center' }}>
              <RoundBadge type={data.round_type} />
              {data.experience_years && (
                <span style={{ fontSize: 13, color: 'var(--text-muted)', fontFamily: 'DM Mono' }}>
                  ⏱ {data.experience_years} yrs exp
                </span>
              )}
              {data.location && (
                <span style={{ fontSize: 13, color: 'var(--text-muted)', fontFamily: 'DM Mono' }}>
                  📍 {data.location}
                </span>
              )}
              {salaryRange && (
                <span style={{ fontSize: 13, color: 'var(--text-muted)', fontFamily: 'DM Mono' }}>
                  💰 {salaryRange}
                </span>
              )}
              <span style={{ fontSize: 13, color: 'var(--text-muted)', fontFamily: 'DM Mono' }}>
                🗓 {new Date(data.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
              </span>
            </div>
          </div>
        </div>

        {/* Summary quote */}
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 18 }}>
          <div style={{ fontSize: 15, color: 'var(--text)', lineHeight: 1.75, fontStyle: 'italic', fontFamily: 'DM Serif Display' }}>
            "{a.overallSummary}"
          </div>
        </div>
      </div>

      {/* ── Strengths + Gaps ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 }}>
        <div style={{ background: 'var(--surface)', border: '1px solid rgba(104,211,145,0.15)', borderRadius: 12, padding: '18px 20px' }}>
          <div style={{ fontSize: 11, color: '#68d391', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: 14, fontFamily: 'DM Mono' }}>Strengths</div>
          {a.topStrengths?.map((s,i) => (
            <div key={i} style={{ fontSize: 14, color: 'var(--text)', marginBottom: 10, display: 'flex', gap: 10, lineHeight: 1.55 }}>
              <span style={{ color: '#68d391', flexShrink: 0 }}>→</span>{s}
            </div>
          ))}
        </div>
        <div style={{ background: 'var(--surface)', border: '1px solid rgba(252,129,129,0.15)', borderRadius: 12, padding: '18px 20px' }}>
          <div style={{ fontSize: 11, color: '#fc8181', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: 14, fontFamily: 'DM Mono' }}>Critical Gaps</div>
          {a.criticalGaps?.map((g,i) => (
            <div key={i} style={{ fontSize: 14, color: 'var(--text)', marginBottom: 10, display: 'flex', gap: 10, lineHeight: 1.55 }}>
              <span style={{ color: '#fc8181', flexShrink: 0 }}>→</span>{g}
            </div>
          ))}
        </div>
      </div>

      {/* ── Priority fix ── */}
      {a.topPriorityFix && (
        <div style={{ background: 'rgba(246,173,85,0.05)', border: '1px solid rgba(246,173,85,0.2)', borderRadius: 12, padding: '16px 22px', marginBottom: 20, display: 'flex', gap: 14 }}>
          <span style={{ fontSize: 20, flexShrink: 0 }}>🗺️</span>
          <div>
            <div style={{ fontSize: 11, color: 'var(--warning)', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: 6, fontFamily: 'DM Mono' }}>#1 Priority Fix</div>
            <div style={{ fontSize: 15, color: 'var(--text)', lineHeight: 1.65 }}>{a.topPriorityFix}</div>
          </div>
        </div>
      )}

      {/* ── Answer breakdown ── */}
      <div style={{ marginBottom: 8 }}>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 14, fontFamily: 'DM Mono' }}>Answer Breakdown</div>
        {a.answers?.map((ans,i) => <AnswerCard key={i} answer={ans} index={i} />)}
      </div>
    </div>
  )
}
