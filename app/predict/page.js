'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import FileDropZone from '@/app/components/FileDropZone'

const labelStyle = {
  fontSize: 11,
  color: 'var(--text-muted)',
  letterSpacing: '1px',
  textTransform: 'uppercase',
  marginBottom: 6,
  display: 'block',
  fontFamily: 'DM Mono',
}

const inputStyle = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  padding: '10px 12px',
  color: 'var(--text)',
  fontSize: 14,
  fontFamily: 'Open Sans',
  width: '100%',
  boxSizing: 'border-box',
  outline: 'none',
}

export default function PredictPage() {
  const router = useRouter()
  const [company, setCompany] = useState('')
  const [roleLevel, setRoleLevel] = useState('PM')
  const [roundType, setRoundType] = useState('loop')
  const [jdText, setJdText] = useState('')
  const [cvText, setCvText] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [cvFileName, setCvFileName] = useState('')

  async function handleSubmit() {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/predict', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jdText, cvText, roleLevel, roundType, company })
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Something went wrong')
        return
      }
      // Save to DB and navigate to report
      const saveRes = await fetch('/api/predictions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ company, roleLevel, roundType, jdText, cvText, result: data })
      })
      const saveData = await saveRes.json()
      if (!saveRes.ok) {
        setError(saveData.error || 'Failed to save prediction')
        return
      }
      router.push(`/predict/report/${saveData.id}`)
    } catch (err) {
      setError(err.message || 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main style={{ maxWidth: 800, margin: '0 auto', padding: 24 }}>
      <h1 style={{
        fontFamily: 'Montserrat',
        fontWeight: 'normal',
        fontSize: 28,
        color: 'var(--text)',
        marginBottom: 6,
        marginTop: 0,
      }}>
        Interview predictor
      </h1>
      <p style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 28, marginTop: 0 }}>
        Enter a job description and your CV to get predicted questions and gap analysis.
      </p>

      <div style={{
        background: 'var(--surface2)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        padding: 24,
        marginBottom: 20,
      }}>
        {/* Row 1: Company, Role level, Round type */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 16 }}>
          <div>
            <label style={labelStyle}>Company *</label>
            <input
              type="text"
              placeholder="e.g. Meta"
              value={company}
              onChange={e => setCompany(e.target.value)}
              style={inputStyle}
              aria-label="Company"
            />
          </div>
          <div>
            <label style={labelStyle}>Role level *</label>
            <select
              value={roleLevel}
              onChange={e => setRoleLevel(e.target.value)}
              style={inputStyle}
              aria-label="Role level"
            >
              <option value="APM">APM</option>
              <option value="PM">PM</option>
              <option value="Senior PM">Senior PM</option>
              <option value="Staff+">Staff+</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>Round type *</label>
            <select
              value={roundType}
              onChange={e => setRoundType(e.target.value)}
              style={inputStyle}
              aria-label="Round type"
            >
              <option value="screening">Screening</option>
              <option value="loop">Loop</option>
              <option value="panel">Panel</option>
              <option value="other">Other</option>
            </select>
          </div>
        </div>

        {/* Row 2: Job description */}
        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Job description *</label>
          <textarea
            rows={7}
            placeholder="Paste the full job description here"
            value={jdText}
            onChange={e => setJdText(e.target.value)}
            style={{ ...inputStyle, resize: 'vertical' }}
            aria-label="Job description"
          />
        </div>

        {/* Row 3: CV text */}
        <div style={{ marginBottom: 8 }}>
          <label style={labelStyle}>Your CV *</label>
          <textarea
            rows={5}
            placeholder="Paste your CV text here"
            value={cvText}
            onChange={e => setCvText(e.target.value)}
            style={{ ...inputStyle, resize: 'vertical' }}
            aria-label="Your CV"
          />
          <div style={{marginTop: 8}}>
            <FileDropZone
              onFile={async (file) => {
                const formData = new FormData()
                formData.append('file', file)
                const res = await fetch('/api/parse-file', { method: 'POST', body: formData })
                const data = await res.json()
                if (data.text) {
                  setCvText(data.text)
                  setCvFileName(file.name)
                }
              }}
              accept=".pdf,.doc,.docx"
              label="Or upload CV (PDF / DOCX)"
            />
            {cvFileName && (
              <div style={{fontSize:12, color:'var(--success)', marginTop:6, fontFamily:'DM Mono'}}>
                ✓ Extracted from {cvFileName}
              </div>
            )}
          </div>
        </div>
      </div>

      <button
        onClick={handleSubmit}
        disabled={loading || !company.trim() || !jdText.trim() || !cvText.trim()}
        style={{
          width: '100%',
          background: 'var(--accent)',
          color: 'white',
          border: 'none',
          borderRadius: 8,
          padding: '10px 24px',
          fontSize: 14,
          fontFamily: 'DM Mono',
          cursor: loading || !company.trim() || !jdText.trim() || !cvText.trim() ? 'not-allowed' : 'pointer',
          opacity: loading || !company.trim() || !jdText.trim() || !cvText.trim() ? 0.6 : 1,
        }}
        aria-label="Predict questions"
      >
        {loading ? 'Analysing...' : 'Predict questions'}
      </button>

      {loading && (
        <div style={{
          marginTop: 16,
          padding: '12px 16px',
          background: 'rgba(99,179,237,0.06)',
          border: '1px solid rgba(99,179,237,0.15)',
          borderRadius: 8,
          fontSize: 13,
          color: 'var(--text-muted)',
          fontFamily: 'DM Mono',
          lineHeight: 1.6
        }}>
          ⏳ Analysing your JD and CV against 6,000+ real interview questions...<br/>
          <span style={{fontSize: 12, opacity: 0.7}}>This usually takes 20–30 seconds.</span>
        </div>
      )}

      {error && (
        <p style={{ color: 'var(--danger)', fontSize: 13, marginTop: 12 }}>{error}</p>
      )}
    </main>
  )
}
