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

      {/* Header */}
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

      {/* Callback probability card */}
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

      {/* Section: Predicted questions */}
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

      {/* Section: Gap analysis */}
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

export default function PredictLoadingPage() {
  const router = useRouter()
  const [count, setCount] = useState(10)
  const [phase, setPhase] = useState('countdown')  // 'countdown' | 'skeleton'
  const [error, setError] = useState('')
  const reportUrlRef = useRef(null)
  const phaseRef = useRef('countdown')
  const startedRef = useRef(false)

  // Fire API calls immediately, store result when ready
  useEffect(() => {
    if (startedRef.current) return
    startedRef.current = true

    const raw = sessionStorage.getItem('predict-params')
    if (!raw) { router.replace('/'); return }
    const { company, roleLevel, roundType, jdText, cvText } = JSON.parse(raw)

    async function run() {
      try {
        const [predictRes, cbRes] = await Promise.allSettled([
          fetch('/api/predict', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jdText, cvText, roleLevel, roundType, company }),
          }).then(r => r.json()),
          fetch('/api/callback-probability', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cvText, jobDescription: jdText, company, role: roleLevel }),
          }).then(r => r.json()),
        ])

        if (predictRes.status === 'rejected' || predictRes.value?.error) {
          setError(predictRes.value?.error || 'Prediction failed. Please try again.')
          return
        }

        const result = {
          ...predictRes.value,
          callbackProbability: cbRes.status === 'fulfilled' ? cbRes.value : null,
        }

        const saveRes = await fetch('/api/predictions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ company, roleLevel, roundType, jdText, cvText, result }),
        })
        const saveData = await saveRes.json()
        if (!saveRes.ok) { setError(saveData.error || 'Failed to save prediction'); return }

        sessionStorage.removeItem('predict-params')
        reportUrlRef.current = `/predict/report/${saveData.id}`

        // If countdown already done, navigate now
        if (phaseRef.current === 'skeleton') {
          router.replace(reportUrlRef.current)
        }
      } catch (err) {
        setError(err.message || 'Something went wrong')
      }
    }

    run()
  }, [router])

  // Countdown tick: 10 → 0 then switch to skeleton
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

  // Poll for API result once in skeleton phase
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

  if (error) {
    return (
      <div style={{ minHeight: 'calc(100vh - 52px)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 40 }}>
        <p style={{ fontSize: 32, marginBottom: 16 }}>⚠</p>
        <p style={{ fontFamily: 'Montserrat', fontSize: 20, fontWeight: 700, color: 'var(--danger)', marginBottom: 10 }}>Something went wrong</p>
        <p style={{ fontFamily: 'DM Mono', fontSize: 13, color: 'var(--text-muted)', marginBottom: 24, lineHeight: 1.6, textAlign: 'center', maxWidth: 400 }}>{error}</p>
        <button onClick={() => router.back()} style={{ padding: '11px 28px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 10, color: 'var(--text)', fontFamily: 'DM Mono', fontSize: 13, cursor: 'pointer' }}>
          ← Go back
        </button>
      </div>
    )
  }

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes shimmer { 0%{transform:translateX(-100%)} 100%{transform:translateX(100%)} }
        @keyframes fadeUp { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
        @keyframes countPop { 0%{transform:scale(1.3);opacity:0} 100%{transform:scale(1);opacity:1} }
      `}} />

      {phase === 'countdown' && (
        <div style={{
          minHeight: 'calc(100vh - 52px)',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          gap: 20, padding: 40, background: 'var(--bg)',
        }}>
          {/* Countdown number */}
          <div key={count} style={{
            fontFamily: 'Montserrat', fontSize: 140, fontWeight: 800,
            color: 'var(--accent)', lineHeight: 1,
            animation: 'countPop 0.35s cubic-bezier(0.34,1.56,0.64,1)',
            textShadow: '0 0 60px var(--accent)',
            fontVariantNumeric: 'tabular-nums',
          }}>
            {count}
          </div>

          <p style={{ fontFamily: 'Montserrat', fontSize: 22, fontWeight: 700, color: 'var(--text)', margin: 0 }}>
            Building your prediction…
          </p>
          <p style={{ fontFamily: 'DM Mono', fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>
            Your report will appear when the countdown hits zero.
          </p>

          {/* Context chips */}
          <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
            {[params.company, params.roleLevel, params.roundType].filter(Boolean).map(v => (
              <span key={v} style={{
                fontFamily: 'DM Mono', fontSize: 12, color: 'var(--text)',
                background: 'var(--surface)', border: '1px solid var(--border)',
                borderRadius: 20, padding: '5px 14px',
              }}>{v}</span>
            ))}
          </div>
        </div>
      )}

      {phase === 'skeleton' && <ReportSkeleton />}
    </>
  )
}
