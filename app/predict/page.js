'use client'
import { useState } from 'react'
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

export default function PredictPage() {
  const router = useRouter()
  const [company, setCompany]       = useState('')
  const [roleLevel, setRoleLevel]   = useState('PM')
  const [roundType, setRoundType]   = useState('loop')
  const [jdText, setJdText]         = useState('')
  const [cvText, setCvText]         = useState('')
  const [cvFileName, setCvFileName] = useState('')
  const [loading, setLoading]       = useState(false)
  const [error, setError]           = useState('')

  const cvWords    = cvText.trim().split(/\s+/).filter(Boolean).length
  const jdTooShort = jdText.trim().length > 0 && jdText.trim().length < 50
  const cvTooLong  = cvWords > 1000
  const canSubmit  = !loading && company.trim() && jdText.trim().length >= 50 && cvText.trim() && !cvTooLong

  function handleSubmit() {
    if (!canSubmit) return
    setError('')
    setLoading(true)
    try {
      sessionStorage.setItem('predict-params', JSON.stringify({
        company, roleLevel, roundType, jdText, cvText,
      }))
      router.push('/predict/loading')
    } catch (e) {
      setError('Could not save params — please enable sessionStorage and try again.')
      setLoading(false)
    }
  }

  return (
    <main style={{ maxWidth: 800, margin: '0 auto', padding: 24 }}>
      <h1 style={{ fontFamily: 'Montserrat', fontWeight: 'normal', fontSize: 28, color: 'var(--text)', marginBottom: 6, marginTop: 0 }}>
        Interview predictor
      </h1>
      <p style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 28, marginTop: 0 }}>
        Enter a job description and your CV to get predicted questions, gap analysis and callback probability.
      </p>

      <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 12, padding: 24, marginBottom: 20 }}>

        {/* Row 1: Company · Role level · Round type */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 16 }}>
          <div>
            <label style={labelStyle}>Company *</label>
            <input type="text" placeholder="e.g. Meta" value={company}
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
              <option value="loop">Loop</option>
              <option value="panel">Panel</option>
              <option value="other">Other</option>
            </select>
          </div>
        </div>

        {/* Job description */}
        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>
            Job description *
            {jdText.length > 0 && (
              <span style={{ marginLeft: 8, color: jdTooShort ? '#fc8181' : '#68d391', fontWeight: 600 }}>
                {jdText.length} chars
              </span>
            )}
          </label>
          <textarea rows={7}
            placeholder="Paste the full job description here — minimum 50 characters for accurate predictions"
            value={jdText} onChange={e => setJdText(e.target.value)}
            style={{ ...inputStyle, resize: 'vertical', borderColor: jdTooShort ? 'rgba(252,129,129,0.5)' : undefined }}
            aria-label="Job description"
          />
          {jdTooShort && (
            <p style={{ fontFamily: 'DM Mono', fontSize: 11, color: '#fc8181', margin: '4px 0 0' }}>
              Minimum 50 characters — more detail = sharper predictions
            </p>
          )}
        </div>

        {/* CV */}
        <div style={{ marginBottom: 8 }}>
          <label style={labelStyle}>
            Your CV *
            {cvWords > 0 && (
              <span style={{ marginLeft: 8, color: cvTooLong ? '#fc8181' : '#68d391', fontWeight: 600 }}>
                {cvWords.toLocaleString()} / 1,000 words
              </span>
            )}
          </label>
          <textarea rows={5}
            placeholder="Paste your CV text here (max 1,000 words)"
            value={cvText} onChange={e => setCvText(e.target.value)}
            style={{ ...inputStyle, resize: 'vertical', borderColor: cvTooLong ? 'rgba(252,129,129,0.5)' : undefined }}
            aria-label="Your CV"
          />
          {cvTooLong && (
            <p style={{ fontFamily: 'DM Mono', fontSize: 11, color: '#fc8181', margin: '4px 0 4px' }}>
              CV exceeds 1,000 words — please trim to the most relevant experience
            </p>
          )}
          <div style={{ marginTop: 8 }}>
            <FileDropZone
              onFile={async (file) => {
                const formData = new FormData()
                formData.append('file', file)
                const res = await fetch('/api/parse-file', { method: 'POST', body: formData })
                const data = await res.json()
                if (data.text) { setCvText(data.text); setCvFileName(file.name) }
              }}
              accept=".pdf,.doc,.docx"
              label="Or upload CV (PDF / DOCX)"
            />
            {cvFileName && (
              <div style={{ fontSize: 12, color: 'var(--success)', marginTop: 6, fontFamily: 'DM Mono' }}>
                ✓ Extracted from {cvFileName}
              </div>
            )}
          </div>
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
        {loading ? 'Starting…' : '✦ Predict my questions + callback probability →'}
      </button>

      {error && (
        <p style={{ color: 'var(--danger)', fontFamily: 'DM Mono', fontSize: 13, marginTop: 12 }}>{error}</p>
      )}
    </main>
  )
}
