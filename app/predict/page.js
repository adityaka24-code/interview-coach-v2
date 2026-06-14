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
  const [company, setCompany]               = useState('')
  const [roleLevel, setRoleLevel]           = useState('PM')
  const [roundType, setRoundType]           = useState('loop')
  const [jdText, setJdText]                 = useState('')
  // jdMode: 'empty' | 'url-confirm' | 'url-loading' | 'review' | 'confirmed'
  //       | 'url-error' | 'hint' | 'inferring' | 'hint-error' | 'full'
  const [jdMode, setJdMode]                 = useState('empty')
  const [jdPendingUrl, setJdPendingUrl]     = useState('')
  const [jdReviewText, setJdReviewText]     = useState('')
  const [jdReviewSource, setJdReviewSource] = useState('')   // 'url' | 'inferred'
  const [jdResolved, setJdResolved]         = useState('')
  const [jdIsInferred, setJdIsInferred]     = useState(false)
  const [cvText, setCvText]                 = useState('')
  const [cvFileName, setCvFileName]         = useState('')
  const [loading, setLoading]               = useState(false)
  const [error, setError]                   = useState('')
  const debounceRef = useRef(null)
  const prevHintKey = useRef('')

  const cvWords     = cvText.trim().split(/\s+/).filter(Boolean).length
  const cvTooLong   = cvWords > 1000
  const busy        = ['url-loading', 'inferring'].includes(jdMode)
  const needsReview = ['url-confirm', 'review'].includes(jdMode)
  const canSubmit   = !loading && !busy && !needsReview && company.trim() && cvText.trim() && !cvTooLong

  useEffect(() => {
    clearTimeout(debounceRef.current)
    const rawMode = detectRawMode(jdText)

    if (rawMode === 'empty') {
      setJdMode('empty'); setJdResolved(''); setJdReviewText(''); setJdPendingUrl('')
      prevHintKey.current = ''; return
    }
    if (rawMode === 'full') {
      setJdMode('full'); setJdResolved(jdText.trim()); setJdReviewText(''); setJdIsInferred(false); return
    }
    if (rawMode === 'url') {
      setJdPendingUrl(jdText.trim())
      setJdMode('url-confirm')
      return
    }
    // Short description — debounce then infer
    debounceRef.current = setTimeout(async () => {
      const hintKey = `${company}|${roleLevel}|${jdText.trim()}`
      if (hintKey === prevHintKey.current) return
      prevHintKey.current = hintKey

      setJdMode('inferring'); setJdResolved(''); setJdReviewText('')
      try {
        const res  = await fetch('/api/infer-jd', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ company, roleLevel, roleHint: jdText.trim() }),
        })
        const data = await res.json()
        if (data.error) throw new Error(data.error)
        setJdReviewText(data.jdText)
        setJdReviewSource('inferred')
        setJdMode('review')
      } catch {
        setJdMode('hint-error'); setJdResolved(jdText.trim())
      }
    }, 900)

    return () => clearTimeout(debounceRef.current)
  }, [jdText, company, roleLevel])

  async function handleFetchUrl() {
    setJdMode('url-loading')
    try {
      const fetchRes  = await fetch('/api/fetch-url', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: jdPendingUrl }),
      })
      const fetchData = await fetchRes.json()
      if (fetchData.error) throw new Error(fetchData.error)

      // Extract only job-relevant content from the raw page text
      const extractRes  = await fetch('/api/extract-jd', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rawText: fetchData.text }),
      })
      const extractData = await extractRes.json()
      const jd = extractData.extracted !== false && extractData.jdText
        ? extractData.jdText
        : fetchData.text.slice(0, 3500)   // fallback to raw if extraction failed

      setJdReviewText(jd)
      setJdReviewSource('url')
      setJdMode('review')
    } catch {
      setJdMode('url-error')
    }
  }

  function handleConfirmJd() {
    setJdResolved(jdReviewText)
    setJdIsInferred(jdReviewSource === 'inferred')
    setJdMode('confirmed')
  }

  function handleClearJd() {
    setJdText(''); setJdMode('empty'); setJdResolved('')
    setJdReviewText(''); setJdPendingUrl('')
    prevHintKey.current = ''
  }

  function handleJdTextChange(e) {
    setJdText(e.target.value)
    if (['confirmed', 'review', 'url-confirm'].includes(jdMode)) {
      setJdMode('empty'); setJdResolved(''); setJdReviewText(''); setJdPendingUrl('')
      prevHintKey.current = ''
    }
  }

  function handleSubmit() {
    if (!canSubmit) return
    setError('')
    setLoading(true)
    const jdFinal = jdMode === 'confirmed' ? jdResolved : jdMode === 'full' ? jdText : ''
    try {
      sessionStorage.setItem('predict-params', JSON.stringify({
        company, roleLevel, roundType, jdText: jdFinal, jdIsInferred, cvText,
      }))
      router.push('/predict/loading')
    } catch {
      setError('Could not save params — please enable sessionStorage and try again.')
      setLoading(false)
    }
  }

  const urlDisplay = jdPendingUrl.length > 65
    ? jdPendingUrl.slice(0, 62) + '…'
    : jdPendingUrl

  return (
    <main style={{ maxWidth: 800, margin: '0 auto', padding: 24 }}>

      {/* ── URL confirmation modal ─────────────────────────────── */}
      {jdMode === 'url-confirm' && (
        <div
          role="dialog" aria-modal="true" aria-label="Confirm job link"
          style={{
            position: 'fixed', inset: 0, zIndex: 300,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
          }}
        >
          <div style={{
            background: 'var(--surface2)', border: '1px solid var(--border)',
            borderRadius: 14, padding: '28px 30px', maxWidth: 480, width: '92%',
            boxShadow: '0 24px 64px rgba(0,0,0,0.45)',
          }}>
            <p style={{
              fontFamily: 'DM Mono', fontSize: 10, color: 'var(--text-muted)',
              letterSpacing: '1.5px', textTransform: 'uppercase', margin: '0 0 8px',
            }}>
              Job link detected
            </p>
            <h3 style={{
              fontFamily: 'Montserrat', fontSize: 19, color: 'var(--text)',
              margin: '0 0 14px', fontWeight: 600,
            }}>
              Fetch JD from this link?
            </h3>
            <div style={{
              fontFamily: 'DM Mono', fontSize: 12, color: 'var(--accent)',
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: 7, padding: '8px 12px', margin: '0 0 14px',
              wordBreak: 'break-all', lineHeight: 1.6,
            }}>
              {urlDisplay}
            </div>
            <p style={{
              fontFamily: 'Open Sans', fontSize: 13, color: 'var(--text-muted)',
              margin: '0 0 22px', lineHeight: 1.65,
            }}>
              We'll scrape the page and let you review the extracted JD before running the analysis. Some career sites block automated access — if it fails, paste the text directly.
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={handleFetchUrl}
                style={{
                  flex: 1, padding: '11px 0',
                  background: 'linear-gradient(135deg,#1d4ed8,#2563eb)',
                  color: '#fff', border: 'none', borderRadius: 8,
                  fontFamily: 'DM Mono', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                }}
              >
                Fetch JD
              </button>
              <button
                onClick={handleClearJd}
                style={{
                  flex: 1, padding: '11px 0',
                  background: 'var(--surface)', color: 'var(--text)',
                  border: '1px solid var(--border)', borderRadius: 8,
                  fontFamily: 'DM Mono', fontSize: 13, cursor: 'pointer',
                }}
              >
                Enter JD manually
              </button>
            </div>
          </div>
        </div>
      )}

      <h1 style={{
        fontFamily: 'Montserrat', fontWeight: 'normal', fontSize: 28,
        color: 'var(--text)', marginBottom: 6, marginTop: 0,
      }}>
        Interview predictor
      </h1>
      <p style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 28, marginTop: 0 }}>
        Enter your CV to get predicted questions, gap analysis and callback probability. Add a JD for sharper results.
      </p>

      <div style={{
        background: 'var(--surface2)', border: '1px solid var(--border)',
        borderRadius: 12, padding: 24, marginBottom: 20,
      }}>

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

        {/* ── JD field ─────────────────────────────────────────── */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
            <label style={{ ...labelStyle, marginBottom: 0 }}>
              Paste JD · job link · org / role name{' '}
              <span style={{ color: 'var(--text-muted)', fontSize: 10, fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>
                (optional)
              </span>
            </label>
            {jdMode === 'confirmed' && (
              <button
                onClick={handleClearJd}
                style={{
                  fontFamily: 'DM Mono', fontSize: 10, color: 'var(--text-muted)',
                  background: 'none', border: 'none', cursor: 'pointer',
                  textDecoration: 'underline', padding: 0,
                }}
              >
                Change JD
              </button>
            )}
          </div>

          <textarea
            rows={jdMode === 'confirmed' ? 2 : 4}
            placeholder={'Paste the full JD, a job link (https://…), or just type a brief role — e.g. "Inventory planning PM at Amazon"'}
            value={jdText}
            onChange={handleJdTextChange}
            readOnly={jdMode === 'confirmed'}
            style={{
              ...inputStyle, resize: 'vertical',
              borderColor:
                (jdMode === 'url-error' || jdMode === 'hint-error') ? 'rgba(252,129,129,0.5)'
                : jdMode === 'confirmed' ? 'rgba(104,211,145,0.35)'
                : jdMode === 'review'    ? 'var(--accent)'
                : undefined,
              opacity: jdMode === 'confirmed' ? 0.55 : 1,
            }}
            aria-label="Job description, job link, or role name"
          />

          {/* Status line */}
          <div style={{ fontFamily: 'DM Mono', fontSize: 11, marginTop: 5, minHeight: 16 }}>
            {jdMode === 'empty'     && <span style={{ color: 'var(--text-muted)' }}>Optional — leave blank to predict from company + role context only</span>}
            {jdMode === 'url-loading' && <span style={{ color: 'var(--text-muted)' }}>⟳ Fetching job description from link…</span>}
            {jdMode === 'url-error' && <span style={{ color: '#fc8181' }}>Could not fetch — paste the JD text directly, or <button onClick={handleClearJd} style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'DM Mono', fontSize: 11, color: '#fc8181', textDecoration: 'underline', padding: 0 }}>clear</button></span>}
            {jdMode === 'inferring' && <span style={{ color: 'var(--text-muted)' }}>⟳ Synthesizing full JD from role description…</span>}
            {jdMode === 'hint-error'&& <span style={{ color: '#fc8181' }}>Synthesis failed — predicting from brief description as-is</span>}
            {jdMode === 'full'      && <span style={{ color: '#68d391' }}>{jdText.length.toLocaleString()} chars</span>}
            {jdMode === 'confirmed' && <span style={{ color: '#68d391' }}>✓ JD confirmed · {jdResolved.length.toLocaleString()} chars{jdIsInferred ? ' · synthesized' : jdReviewSource === 'url' ? ' · fetched from link' : ''}</span>}
          </div>

          {/* JD review card */}
          {jdMode === 'review' && (
            <div style={{
              marginTop: 10, border: '1px solid var(--accent)', borderRadius: 10, overflow: 'hidden',
              boxShadow: '0 0 0 3px rgba(99,179,237,0.1)',
            }}>
              <div style={{
                padding: '9px 14px', background: 'rgba(99,179,237,0.07)',
                borderBottom: '1px solid rgba(99,179,237,0.2)',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}>
                <span style={{ fontFamily: 'DM Mono', fontSize: 11, color: 'var(--accent)' }}>
                  {jdReviewSource === 'url' ? '✦ JD fetched from link' : '✦ JD synthesized from role description'} — review &amp; confirm
                </span>
                <span style={{ fontFamily: 'DM Mono', fontSize: 10, color: 'var(--text-muted)' }}>
                  {jdReviewText.length} chars · editable
                </span>
              </div>
              <textarea
                rows={8}
                value={jdReviewText}
                onChange={e => setJdReviewText(e.target.value)}
                style={{
                  ...inputStyle, resize: 'vertical', border: 'none', borderRadius: 0,
                  borderBottom: '1px solid var(--border)', fontSize: 13, lineHeight: 1.65,
                }}
                aria-label="Review and edit the job description before confirming"
              />
              <div style={{ display: 'flex', gap: 10, padding: '12px 14px', background: 'var(--surface)' }}>
                <button
                  onClick={handleConfirmJd}
                  style={{
                    flex: 1, padding: '9px 0',
                    background: 'linear-gradient(135deg,#1d4ed8,#2563eb)',
                    color: '#fff', border: 'none', borderRadius: 7,
                    fontFamily: 'DM Mono', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                  }}
                >
                  Use this JD ✓
                </button>
                <button
                  onClick={handleClearJd}
                  style={{
                    flex: 1, padding: '9px 0', background: 'transparent',
                    color: 'var(--text-muted)', border: '1px solid var(--border)', borderRadius: 7,
                    fontFamily: 'DM Mono', fontSize: 13, cursor: 'pointer',
                  }}
                >
                  Clear, I'll type it
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── CV field — FileDropZone above textarea ────────────── */}
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
              onText={text => setCvText(text)}
              label="Upload CV (PDF / DOCX)"
            />
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
        {loading      ? 'Starting…'
          : busy        ? 'Preparing JD…'
          : needsReview ? 'Confirm JD above first ↑'
          : '✦ Predict my questions + callback probability →'}
      </button>

      {error && (
        <p style={{ color: 'var(--danger)', fontFamily: 'DM Mono', fontSize: 13, marginTop: 12 }}>{error}</p>
      )}
    </main>
  )
}
