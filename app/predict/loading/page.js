'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'

function Shimmer({ width = '100%', height = 16, radius = 6, style = {} }) {
  return (
    <div style={{
      width, height, borderRadius: radius,
      background: 'var(--surface2)',
      overflow: 'hidden',
      flexShrink: 0,
      ...style,
    }}>
      <div style={{
        width: '200%', height: '100%',
        background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.05) 50%, transparent 100%)',
        animation: 'shimmer 1.4s ease-in-out infinite',
      }} />
    </div>
  )
}

function ReportSkeleton() {
  return (
    <div style={{ maxWidth: '96vw', margin: '0 auto', padding: '32px 32px', animation: 'fadeUp 0.4s ease' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 32 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Shimmer width={280} height={28} radius={6} />
          <Shimmer width={180} height={14} radius={4} />
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Shimmer width={90} height={34} radius={8} />
          <Shimmer width={70} height={34} radius={8} />
        </div>
      </div>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '20px 24px', marginBottom: 24, display: 'flex', alignItems: 'center', gap: 24 }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <Shimmer width={72} height={44} radius={6} />
          <Shimmer width={100} height={10} radius={4} />
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Shimmer width="90%" height={14} radius={4} />
          <Shimmer width="75%" height={14} radius={4} />
          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            <Shimmer width={120} height={24} radius={20} />
            <Shimmer width={100} height={24} radius={20} />
            <Shimmer width={130} height={24} radius={20} />
          </div>
        </div>
      </div>
      <Shimmer width={200} height={22} radius={5} style={{ marginBottom: 16 }} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 32 }}>
        {[1,2,3,4,5].map(i => (
          <div key={i} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 18px', display: 'flex', gap: 14, alignItems: 'center' }}>
            <Shimmer width={44} height={22} radius={20} />
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <Shimmer width={`${70 + i * 4}%`} height={14} radius={4} />
              <Shimmer width="35%" height={10} radius={4} />
            </div>
          </div>
        ))}
      </div>
      <Shimmer width={160} height={22} radius={5} style={{ marginBottom: 16 }} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {[1,2,3].map(i => (
          <div key={i} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
            <div style={{ padding: '10px 16px', background: 'var(--surface2)', display: 'flex', gap: 12, alignItems: 'center' }}>
              <Shimmer width={70} height={18} radius={12} />
              <Shimmer width={`${40 + i * 10}%`} height={14} radius={4} />
            </div>
            <div style={{ padding: '10px 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
              <Shimmer width="80%" height={12} radius={4} />
              <Shimmer width="60%" height={12} radius={4} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// Section status pill shown during countdown
function SectionPill({ icon, label, status }) {
  const colors = {
    loading: { bg: 'rgba(99,179,237,0.1)',  border: 'rgba(99,179,237,0.3)',  text: '#63b3ed' },
    done:    { bg: 'rgba(104,211,145,0.1)', border: 'rgba(104,211,145,0.3)', text: '#68d391' },
    error:   { bg: 'rgba(252,129,129,0.1)', border: 'rgba(252,129,129,0.3)', text: '#fc8181' },
    waiting: { bg: 'var(--surface)',         border: 'var(--border)',          text: 'var(--text-muted)' },
  }
  const c = colors[status] || colors.waiting
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '7px 16px', borderRadius: 24,
      background: c.bg, border: `1px solid ${c.border}`,
      fontFamily: 'DM Mono', fontSize: 12, color: c.text,
      transition: 'all 0.4s ease',
    }}>
      <span>{icon}</span>
      <span>{label}</span>
      {status === 'loading' && <span style={{ opacity: 0.7, animation: 'pulse 1.2s infinite' }}>…</span>}
      {status === 'done'    && <span>✓</span>}
      {status === 'error'   && <span>✗</span>}
    </div>
  )
}

export default function PredictLoadingPage() {
  const router = useRouter()
  const [count, setCount]   = useState(45)
  const [phase, setPhase]   = useState('countdown') // 'countdown' | 'skeleton'
  const [error, setError]   = useState('')
  const [sections, setSections] = useState({
    questions: 'loading',
    gaps:      'loading',
    callback:  'loading',
  })

  const reportUrlRef  = useRef(null)
  const phaseRef      = useRef('countdown')
  const startedRef    = useRef(false)

  function setSection(key, status) {
    setSections(prev => ({ ...prev, [key]: status }))
  }

  // ── SSE stream ──────────────────────────────────────────────────
  useEffect(() => {
    if (startedRef.current) return
    startedRef.current = true

    // Try sessionStorage first (navigate-from-form flow)
    let params = null
    try {
      const raw = sessionStorage.getItem('predict-params')
      if (raw) params = JSON.parse(raw)
    } catch {}

    if (!params) {
      // No params — bounce back to predict form
      router.replace('/predict')
      return
    }

    const { company, roleLevel, roundType, jdText, cvText } = params

    async function run() {
      try {
        const res = await fetch('/api/predict', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jdText, cvText, roleLevel, roundType, company }),
        })

        if (!res.ok || !res.body) {
          const txt = await res.text().catch(() => '')
          setError(txt || `Server error ${res.status}`)
          return
        }

        const reader  = res.body.getReader()
        const decoder = new TextDecoder()
        let buffer    = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })

          const parts = buffer.split('\n\n')
          buffer = parts.pop()

          for (const chunk of parts) {
            const eventMatch = chunk.match(/^event:\s*(.+)$/m)
            const dataMatch  = chunk.match(/^data:\s*(.+)$/m)
            if (!eventMatch || !dataMatch) continue

            const event = eventMatch[1].trim()
            let data
            try { data = JSON.parse(dataMatch[1]) } catch { continue }

            switch (event) {
              case 'questions':     setSection('questions', 'done');    break
              case 'gaps':          setSection('gaps',      'done');    break
              case 'callback':      setSection('callback',  'done');    break
              case 'section_error': setSection(data.section, 'error'); break
              case 'fatal':
                setError(data.message || 'Prediction failed. Please try again.')
                return
              case 'complete':
                sessionStorage.removeItem('predict-params')
                reportUrlRef.current = `/predict/report/${data.id}`
                // If countdown already done, navigate immediately
                if (phaseRef.current === 'skeleton') {
                  router.replace(reportUrlRef.current)
                }
                break
            }
          }
        }
      } catch (err) {
        setError(err.message || 'Something went wrong. Please try again.')
      }
    }

    run()
  }, [router])

  // ── Countdown 10 → 0 ───────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'countdown') return
    if (count === 0) {
      phaseRef.current = 'skeleton'
      setPhase('skeleton')
      if (reportUrlRef.current) router.replace(reportUrlRef.current)
      return
    }
    const id = setTimeout(() => setCount(c => c - 1), 1000)
    return () => clearTimeout(id)
  }, [count, phase, router])

  // ── Poll for completion once in skeleton phase ──────────────────
  useEffect(() => {
    if (phase !== 'skeleton') return
    const id = setInterval(() => {
      if (reportUrlRef.current) {
        clearInterval(id)
        router.replace(reportUrlRef.current)
      }
    }, 250)
    return () => clearInterval(id)
  }, [phase, router])

  const params = (() => {
    try { return JSON.parse(sessionStorage.getItem('predict-params') || '{}') } catch { return {} }
  })()

  // ── Error state ─────────────────────────────────────────────────
  if (error) {
    return (
      <div style={{ minHeight: 'calc(100vh - 52px)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 40 }}>
        <p style={{ fontSize: 32, marginBottom: 16 }}>⚠</p>
        <p style={{ fontFamily: 'Montserrat', fontSize: 20, fontWeight: 700, color: 'var(--danger)', marginBottom: 10 }}>
          Something went wrong
        </p>
        <p style={{ fontFamily: 'DM Mono', fontSize: 13, color: 'var(--text-muted)', marginBottom: 8, lineHeight: 1.6, textAlign: 'center', maxWidth: 440 }}>
          {error}
        </p>
        <p style={{ fontFamily: 'Open Sans', fontSize: 13, color: 'var(--text-muted)', marginBottom: 24, lineHeight: 1.7, textAlign: 'center', maxWidth: 440 }}>
          <strong>Next steps:</strong> Check your internet connection and try again. If the AI service is busy, wait 30 seconds — the system retries automatically up to 9 times.
        </p>
        <div style={{ display: 'flex', gap: 12 }}>
          <button
            onClick={() => router.replace('/predict')}
            style={{ padding: '11px 28px', background: 'linear-gradient(135deg,#1d4ed8,#2563eb)', border: 'none', borderRadius: 10, color: '#fff', fontFamily: 'DM Mono', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
          >
            Try again
          </button>
          <button
            onClick={() => router.back()}
            style={{ padding: '11px 28px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 10, color: 'var(--text)', fontFamily: 'DM Mono', fontSize: 13, cursor: 'pointer' }}
          >
            ← Go back
          </button>
        </div>
      </div>
    )
  }

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes shimmer { 0%{transform:translateX(-100%)} 100%{transform:translateX(100%)} }
        @keyframes fadeUp  { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
        @keyframes pulse   { 0%,100%{opacity:1} 50%{opacity:0.4} }
      `}} />

      {phase === 'countdown' && (() => {
        const RADIUS = 54
        const CIRC = 2 * Math.PI * RADIUS
        const pct = (45 - count) / 45
        return (
          <div style={{
            minHeight: 'calc(100vh - 52px)',
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            gap: 20, padding: 40, background: 'var(--bg)',
            animation: 'fadeUp 0.5s ease',
          }}>
            {/* Ring + number */}
            <div style={{ position: 'relative', width: 160, height: 160, marginBottom: 20 }}>
              <svg width="160" height="160" style={{ transform: 'rotate(-90deg)' }}>
                <circle cx="80" cy="80" r={RADIUS} fill="none" stroke="var(--surface2)" strokeWidth="6"/>
                <circle cx="80" cy="80" r={RADIUS} fill="none"
                  stroke="var(--accent)" strokeWidth="6" strokeLinecap="round"
                  strokeDasharray={CIRC}
                  strokeDashoffset={CIRC * (1 - pct)}
                  style={{ transition: 'stroke-dashoffset 1s linear' }}
                />
              </svg>
              <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontFamily: 'DM Mono', fontSize: 52, fontWeight: 'bold', color: 'var(--text)', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
                  {count > 0 ? count : '✓'}
                </span>
                <span style={{ fontFamily: 'DM Mono', fontSize: 11, color: 'var(--text-muted)', letterSpacing: '1px', marginTop: 4 }}>
                  {count > 0 ? 'seconds' : 'done'}
                </span>
              </div>
            </div>

            <h2 style={{ fontFamily: 'Montserrat', fontSize: 26, fontWeight: 600, color: 'var(--text)', margin: 0, letterSpacing: '-0.3px' }}>
              Building your prediction
            </h2>
            <p style={{ fontFamily: 'DM Mono', fontSize: 13, color: 'var(--text-muted)', margin: 0, lineHeight: 1.7 }}>
              3 AI analyses running in parallel — results stream in as each completes.
            </p>

            {/* Live section status pills */}
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
              <SectionPill icon="❓" label="Questions"     status={sections.questions} />
              <SectionPill icon="🔍" label="Gap analysis"  status={sections.gaps} />
              <SectionPill icon="📊" label="Callback odds" status={sections.callback} />
            </div>

            {/* Context chips */}
            {(params.company || params.roleLevel) && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
                {[params.company, params.roleLevel, params.roundType].filter(Boolean).map(v => (
                  <span key={v} style={{
                    fontFamily: 'DM Mono', fontSize: 12, color: 'var(--text)',
                    background: 'var(--surface)', border: '1px solid var(--border)',
                    borderRadius: 20, padding: '5px 14px',
                  }}>{v}</span>
                ))}
              </div>
            )}
          </div>
        )
      })()}

      {phase === 'skeleton' && <ReportSkeleton />}
    </>
  )
}
