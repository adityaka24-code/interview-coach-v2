'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import FileDropZone from '@/app/components/FileDropZone'

const labelStyle = {
  fontSize: 11, color: 'var(--text-muted)', letterSpacing: '1px',
  textTransform: 'uppercase', marginBottom: 6, display: 'block', fontFamily: 'DM Mono',
}
const inputStyle = {
  background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8,
  padding: '10px 12px', color: 'var(--text)', fontSize: 14, fontFamily: 'Open Sans',
  width: '100%', boxSizing: 'border-box', outline: 'none',
}

const URL_RE = /^https?:\/\/\S{10,}$/i

function detectRawMode(text) {
  const t = text.trim()
  if (!t) return 'empty'
  if (URL_RE.test(t)) return 'url'
  if (t.length < 250) return 'hint'
  return 'full'
}

export default function PredictPage() {
  const router = useRouter()
  const [company, setCompany]       = useState('')
  const [roleLevel, setRoleLevel]   = useState('PM')
  const [roundType, setRoundType]   = useState('loop')
  const [jdText, setJdText]         = useState('')
  const [jdMode, setJdMode]         = useState('empty')
  // 'empty' | 'url' | 'url-loading' | 'url-done' | 'url-error' | 'hint' | 'inferring' | 'inferred' | 'hint-error' | 'full'
  const [jdResolved, setJdResolved] = useState('')   // final JD to send to API
  const [jdInferred, setJdInferred] = useState('')   // synthesized text shown to user
  const [jdExpanded, setJdExpanded] = useState(false)
  const [cvText, setCvText]         = useState('')
  const [cvFileName, setCvFileName] = useState('')
  const [loading, setLoading]       = useState(false)
  const [error, setError]           = useState('')
  const debounceRef  = useRef(null)
  const prevHintKey  = useRef('')

  const cvWords   = cvText.trim().split(/\s+/).filter(Boolean).length
  const cvTooLong = cvWords > 1000
  const busy      = ['url-loading', 'inferring'].includes(jdMode)
  const canSubmit = !loading && !busy && company.trim() && cvText.trim() && !cvTooLong

  // Process JD input: detect URL → scrape, short text → infer, full text → pass through
  useEffect(() => {
    clearTimeout(debounceRef.current)
    const rawMode = detectRawMode(jdText)

    if (rawMode === 'empty') {
      setJdMode('empty'); setJdResolved(''); setJdInferred(''); prevHintKey.current = ''; return
    }
    if (rawMode === 'full') {
      setJdMode('full'); setJdResolved(jdText.trim()); setJdInferred(''); return
    }

    debounceRef.current = setTimeout(async () => {
      if (rawMode === 'url') {
        setJdMode('url-loading'); setJdResolved(''); setJdInferred('')
        try {
          const res  = await fetch('/api/fetch-url', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: jdText.trim() }),
          })
          const data = await res.json()
          if (data.error) throw new Error(data.error)
          setJdResolved(data.text.slice(0, 3500))
          setJdMode('url-done')
        } catch {
          setJdMode('url-error'); setJdResolved('')
        }
        return
      }

      // hint: short role description → synthesize JD
      const hintKey = `${company}|${roleLevel}|${jdText.trim()}`
      if (hintKey === prevHintKey.current) return
      prevHintKey.current = hintKey

      setJdMode('inferring'); setJdResolved(''); setJdInferred('')
      try {
        const res  = await fetch('/api/infer-jd', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ company, roleLevel, roleHint: jdText.trim() }),
        })
        const data = await res.json()
        if (data.error) throw new Error(data.error)
        setJdInferred(data.jdText)
        setJdResolved(data.jdText)
        setJdMode('inferred')
        setJdExpanded(false)
      } catch {
        setJdMode('hint-error'); setJdResolved(jdText.trim())
      }
    }, rawMode === 'url' ? 400 : 900)

    return () => clearTimeout(debounceRef.current)
  }, [jdText, company, roleLevel])

  function handleSubmit() {
    if (!canSubmit) return
    setError('')
    setLoading(true)
    try {
      sessionStorage.setItem('predict-params', JSON.stringify({
        company, roleLevel, roundType,
        jdText:      jdResolved || jdText,
        jdIsInferred: jdMode === 'inferred',
        cvText,
      }))
      router.push('/predict/loading')
    } catch {
      setError('Could not save params — please enable sessionStorage and try again.')
      setLoading(false)
    }
  }

  function JdStatusBadge() {
    const base = { fontFamily: 'DM Mono', fontSize: 11, margin: '5px 0 0', display: 'block' }
    if (jdMode === 'empty')
      return <span style={{ ...base, color: 'var(--text-muted)' }}>Optional — leave blank to predict from company + role context only</span>
    if (jdMode === 'url-loading')
      return <span style={{ ...base, color: 'var(--text-muted)' }}>⟳ Fetching job description from link…</span>
    if (jdMode === 'url-done')
      return <span style={{ ...base, color: 'var(--success)' }}>✓ JD loaded from link · {jdResolved.length.toLocaleString()} chars</span>
    if (jdMode === 'url-error')
      return <span style={{ ...base, color: '#fc8181' }}>Could not fetch the URL — paste the JD text directly instead</span>
    if (jdMode === 'hint')
      return <span style={{ ...base, color: 'var(--text-muted)' }}>Short description detected — JD will be synthesized once you stop typing…</span>
    if (jdMode === 'inferring')
      return <span style={{ ...base, color: 'var(--text-muted)' }}>⟳ Synthesizing full JD from role description…</span>
    if (jdMode === 'hint-error')
      return <span style={{ ...base, color: '#fc8181' }}>Could not synthesize JD — predicting from brief description as-is</span>
    if (jdMode === 'full')
      return <span style={{ ...base, color: '#68d391' }}>{jdText.length.toLocaleString()} chars</span>
    return null
  }

  return (
    <main style={{ maxWidth: 800, margin: '0 auto', padding: 24 }}>
      <h1 style={{ fontFamily: 'Montserrat', fontWeight: 'normal', fontSize: 28, color: 'var(--text)', marginBottom: 6, marginTop: 0 }}>
        Interview predictor
      </h1>
      <p style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 28, marginTop: 0 }}>
        Enter your CV to get predicted questions, gap analysis and callback probability. Add a job description — or just paste a link or brief role title — for sharper results.
      </p>

      <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 12, padding: 24, marginBottom: 20 }}>

        {/* Row 1: Company · Role level · Round type */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 16 }}>
          <div>
            <label style={labelStyle}>Company *</label>
            <input type="text" placeholder="e.g. Stripe" value={company}
              onChange={e => setCompany(e.target.value)} style={inputStyle} aria-label="Company" />
          </div>
          <div>
            <label style={labelStyle}>Role level *</label>
            <select value={roleLevel} onChange={e => setRoleLevel(e.target.value)} style={inputStyle} aria-label="Role level">
              <option value="APM">APM</option>
              <option value="PM">PM</option>
              <option value="Senior PM">Senior PM</option>
              <option value="Staff+">Staff+</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>Round type *</label>
            <select value={roundType} onChange={e => setRoundType(e.target.value)} style={inputStyle} aria-label="Round type">
              <option value="screening">Screening</option>
              <option value="loop">Full Loop</option>
              <option value="panel">Panel</option>
              <option value="other">Other</option>
            </select>
          </div>
        </div>

        {/* Job description */}
        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>
            Job description{' '}
            <span style={{ color: 'var(--text-muted)', fontSize: 10, fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>
              (optional)
            </span>
          </label>
          <textarea
            rows={5}
            placeholder={
              'Paste the full JD, a job link (https://…), or just a brief description — e.g. "Inventory planning PM"\n\nLeave blank to predict from company + role context only.'
            }
            value={jdText}
            onChange={e => { setJdText(e.target.value); if (jdMode !== 'empty') setJdMode('hint') }}
            style={{
              ...inputStyle, resize: 'vertical',
              borderColor: jdMode === 'url-error' || jdMode === 'hint-error'
                ? 'rgba(252,129,129,0.5)' : undefined,
            }}
            aria-label="Job description"
          />
          <JdStatusBadge />

          {/* Inferred JD preview card */}
          {jdMode === 'inferred' && jdInferred && (
            <div style={{
              marginTop: 8, border: '1px solid rgba(251,191,36,0.35)', borderRadius: 8, overflow: 'hidden',
            }}>
              <button
                onClick={() => setJdExpanded(x => !x)}
                style={{
                  width: '100%', padding: '7px 12px',
                  background: 'rgba(251,191,36,0.07)', border: 'none', cursor: 'pointer',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  fontFamily: 'DM Mono', fontSize: 11, color: 'var(--warning)',
                }}
                aria-expanded={jdExpanded}
              >
                <span>✦ Synthesized JD · {jdInferred.length} chars — click to {jdExpanded ? 'collapse' : 'preview'}</span>
                <span style={{ fontSize: 10 }}>{jdExpanded ? '▲' : '▼'}</span>
              </button>
              {jdExpanded && (
                <div style={{
                  padding: '10px 12px', background: 'var(--surface)',
                  fontSize: 13, color: 'var(--text-muted)', fontFamily: 'Open Sans',
                  whiteSpace: 'pre-wrap', maxHeight: 200, overflowY: 'auto', lineHeight: 1.6,
                }}>
                  {jdInferred}
                </div>
              )}
            </div>
          )}
        </div>

        {/* CV — FileDropZone ABOVE the textarea */}
        <div style={{ marginBottom: 8 }}>
          <label style={labelStyle}>
            Your CV *
            {cvWords > 0 && (
              <span style={{ marginLeft: 8, color: cvTooLong ? '#fc8181' : '#68d391', fontWeight: 600 }}>
                {cvWords.toLocaleString()} / 1,000 words
              </span>
            )}
          </label>

          <div style={{ marginBottom: 8 }}>
            <FileDropZone
              onFile={async (file) => {
                const formData = new FormData()
                formData.append('file', file)
                const res  = await fetch('/api/parse-file', { method: 'POST', body: formData })
                const data = await res.json()
                if (data.text) { setCvText(data.text); setCvFileName(file.name) }
              }}
              accept=".pdf,.doc,.docx"
              label="Upload CV (PDF / DOCX)"
            />
            {cvFileName && (
              <div style={{ fontSize: 12, color: 'var(--success)', marginTop: 6, fontFamily: 'DM Mono' }}>
                ✓ Extracted from {cvFileName}
              </div>
            )}
          </div>

          <textarea
            rows={5}
            placeholder="Or paste your CV text here (max 1,000 words)"
            value={cvText}
            onChange={e => setCvText(e.target.value)}
            style={{ ...inputStyle, resize: 'vertical', borderColor: cvTooLong ? 'rgba(252,129,129,0.5)' : undefined }}
            aria-label="Your CV"
          />
          {cvTooLong && (
            <p style={{ fontFamily: 'DM Mono', fontSize: 11, color: '#fc8181', margin: '4px 0 0' }}>
              CV exceeds 1,000 words — please trim to the most relevant experience
            </p>
          )}
        </div>
      </div>

      <button
        onClick={handleSubmit}
        disabled={!canSubmit}
        style={{
          width: '100%',
          background: canSubmit ? 'linear-gradient(135deg,#1d4ed8,#2563eb)' : 'var(--surface)',
          color: canSubmit ? '#fff' : 'var(--text-muted)',
          border: canSubmit ? 'none' : '1px solid var(--border)',
          borderRadius: 10, padding: '13px 24px', fontSize: 15,
          fontFamily: 'DM Mono', fontWeight: 700,
          cursor: canSubmit ? 'pointer' : 'not-allowed',
          transition: 'all 0.2s ease',
          boxShadow: canSubmit ? '0 0 20px rgba(37,99,235,0.35)' : 'none',
        }}
        aria-label="Predict questions"
      >
        {loading ? 'Starting…' : busy ? 'Preparing JD…' : '✦ Predict my questions + callback probability →'}
      </button>

      {error && (
        <p style={{ color: 'var(--danger)', fontFamily: 'DM Mono', fontSize: 13, marginTop: 12 }}>{error}</p>
      )}
    </main>
  )
}
