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
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
      <span style={{ fontSize: 11, color: 'var(--text-muted)', width: 130, flexShrink: 0 }}>{label}</span>
      <div style={{ flex: 1, height: 4, background: 'rgba(255,255,255,0.05)', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ width: `${(value/max)*100}%`, height: '100%', background: color, borderRadius: 2, transition: 'width 1s ease' }} />
      </div>
      <span style={{ fontSize: 11, color, width: 24, textAlign: 'right' }}>{value}/{max}</span>
    </div>
  )
}

function AnswerCard({ answer, index }) {
  const [expanded, setExpanded] = useState(false)
  const c = answer.score >= 7 ? '#68d391' : answer.score >= 5 ? '#f6ad55' : '#fc8181'
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', marginBottom: 10 }}>
      <div style={{ padding: '14px 18px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 14, borderBottom: expanded ? '1px solid var(--border)' : 'none' }} onClick={() => setExpanded(!expanded)}>
        <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--surface2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 'bold', color: c, flexShrink: 0 }}>{answer.score}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, color: 'var(--text)', fontFamily: 'DM Serif Display', marginBottom: 3 }}>Q{index+1}: {answer.question}</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{answer.yourAnswer}</div>
        </div>
        <span style={{ fontSize: 16, color: 'var(--text-muted)' }}>{expanded ? '↑' : '↓'}</span>
      </div>
      {expanded && (
        <div style={{ padding: 18 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
            <div style={{ background: 'rgba(104,211,145,0.05)', border: '1px solid rgba(104,211,145,0.15)', borderRadius: 8, padding: 12 }}>
              <div style={{ fontSize: 10, color: '#68d391', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: 6 }}>✓ Worked</div>
              <div style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.6 }}>{answer.whatWorked}</div>
            </div>
            <div style={{ background: 'rgba(252,129,129,0.05)', border: '1px solid rgba(252,129,129,0.15)', borderRadius: 8, padding: 12 }}>
              <div style={{ fontSize: 10, color: '#fc8181', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: 6 }}>✗ Missed</div>
              <div style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.6 }}>{answer.whatMissed}</div>
            </div>
          </div>
          {answer.pmSignals && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: 10 }}>PM Signals</div>
              <SignalBar label="STAR Structure" value={answer.pmSignals.starStructure} />
              <SignalBar label="Data & Metrics" value={answer.pmSignals.dataMetrics} />
              <SignalBar label="Customer Empathy" value={answer.pmSignals.customerEmpathy} />
              <SignalBar label="Tradeoffs" value={answer.pmSignals.tradeoffs} />
              <SignalBar label="Impact" value={answer.pmSignals.impact} />
            </div>
          )}
          <div>
            <div style={{ fontSize: 10, color: 'var(--accent)', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: 10 }}>✦ Rewritten Answer</div>
            <div style={{ background: 'rgba(99,179,237,0.04)', border: '1px solid rgba(99,179,237,0.15)', borderRadius: 8, padding: 14, fontSize: 13, lineHeight: 1.8, color: 'var(--text)', fontFamily: 'DM Serif Display', fontStyle: 'italic' }}>{answer.rewrittenAnswer}</div>
          </div>
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

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '32px 24px' }}>
      <Link href="/history" style={{ color: 'var(--text-muted)', textDecoration: 'none', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 24 }}>← Back to History</Link>

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: '24px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 20 }}>
        <div style={{ width: 60, height: 60, borderRadius: 12, background: 'var(--surface2)', border: `2px solid ${sc}33`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 'bold', color: sc, fontFamily: 'DM Mono', flexShrink: 0 }}>{a.overallScore}/10</div>
        <div>
          <div style={{ fontFamily: 'Montserrat', fontSize: 20, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>{data.company} — {data.role}</div>
          <div style={{ marginBottom: 8 }}><RoundBadge type={data.round_type} /></div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            {data.location && `📍 ${data.location}  `}{data.experience_years && `⏱ ${data.experience_years} yrs  `}
            {new Date(data.date).toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' })}
          </div>
          <div style={{ fontSize: 13, color: 'var(--text)', marginTop: 8, fontStyle: 'italic', fontFamily: 'DM Serif Display' }}>"{a.overallSummary}"</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
        <div style={{ background: 'var(--surface)', border: '1px solid rgba(104,211,145,0.15)', borderRadius: 12, padding: 16 }}>
          <div style={{ fontSize: 10, color: '#68d391', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: 12 }}>Strengths</div>
          {a.topStrengths?.map((s,i) => <div key={i} style={{ fontSize: 13, color: 'var(--text)', marginBottom: 8, display: 'flex', gap: 8 }}><span style={{ color: '#68d391' }}>→</span>{s}</div>)}
        </div>
        <div style={{ background: 'var(--surface)', border: '1px solid rgba(252,129,129,0.15)', borderRadius: 12, padding: 16 }}>
          <div style={{ fontSize: 10, color: '#fc8181', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: 12 }}>Critical Gaps</div>
          {a.criticalGaps?.map((g,i) => <div key={i} style={{ fontSize: 13, color: 'var(--text)', marginBottom: 8, display: 'flex', gap: 8 }}><span style={{ color: '#fc8181' }}>→</span>{g}</div>)}
        </div>
      </div>

      {a.topPriorityFix && (
        <div style={{ background: 'rgba(246,173,85,0.05)', border: '1px solid rgba(246,173,85,0.2)', borderRadius: 12, padding: '14px 18px', marginBottom: 20, display: 'flex', gap: 12 }}>
          <span style={{ fontSize: 18 }}>🗺️</span>
          <div>
            <div style={{ fontSize: 10, color: 'var(--warning)', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: 4 }}>#1 Priority Fix</div>
            <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.6 }}>{a.topPriorityFix}</div>
          </div>
        </div>
      )}

      <div style={{ marginBottom: 8 }}>
        <div style={{ fontSize: 10, color: 'var(--text-muted)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 14 }}>Answer Breakdown</div>
        {a.answers?.map((ans,i) => <AnswerCard key={i} answer={ans} index={i} />)}
      </div>
    </div>
  )
}
