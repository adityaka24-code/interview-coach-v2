'use client'
import { useState, useEffect } from 'react'
import { useUser } from '@clerk/nextjs'
import { useRouter } from 'next/navigation'

export default function OnboardingPage() {
  const { user } = useUser()
  const router = useRouter()

  const [form, setForm] = useState({
    name: '',
    age: '',
    title: '',
    org: '',
  })
  const [checking, setChecking] = useState(true)

  // On mount: check DB — if user already completed onboarding (returning user
  // who lost their cookie), the API re-sets it and we redirect immediately.
  useEffect(() => {
    fetch('/api/complete-onboarding')
      .then(r => r.json())
      .then(({ complete }) => {
        if (complete) { window.location.href = '/'; return }
        setChecking(false)
      })
      .catch(() => setChecking(false))
  }, [])

  // Pre-fill name once Clerk user data hydrates
  useEffect(() => {
    if (user?.fullName && !form.name) {
      setForm(f => ({ ...f, name: user.fullName }))
    }
  }, [user?.fullName])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [debug, setDebug] = useState('')

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.name.trim()) { setError('Name is required'); return }
    setSaving(true)
    setError('')
    setDebug('')
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 15000)
      const res = await fetch('/api/complete-onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(),
          age: form.age ? parseInt(form.age) : null,
          title: form.title.trim(),
          org: form.org.trim(),
        }),
        signal: controller.signal,
      })
      clearTimeout(timeout)
      const json = await res.json().catch(() => ({}))
      setDebug(`Steps: ${(json.steps || []).join(' → ')}`)
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`)
      // Hard redirect so Clerk issues a fresh session token with updated metadata
      window.location.href = '/'
    } catch (err) {
      const msg = err.name === 'AbortError' ? 'Request timed out (>15s)' : (err.message || 'Something went wrong')
      setError(msg)
      setSaving(false)
    }
  }

  const inputStyle = {
    width: '100%', padding: '11px 14px', borderRadius: 8,
    border: '1px solid var(--border)', background: 'var(--input-bg)',
    color: 'var(--text)', fontFamily: 'Open Sans', fontSize: 15,
    outline: 'none', boxSizing: 'border-box',
  }

  const labelStyle = {
    fontFamily: 'DM Mono', fontSize: 12, color: 'var(--text-muted)',
    textTransform: 'uppercase', letterSpacing: '0.06em',
    display: 'block', marginBottom: 6,
  }

  if (checking) {
    return (
      <div style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:'70vh' }}>
        <span style={{ color:'var(--text-muted)', fontFamily:'DM Mono', fontSize:14 }}>Loading…</span>
      </div>
    )
  }

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      minHeight: '70vh', padding: '40px 24px',
    }}>
      <div style={{
        background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 16,
        padding: '48px 40px', maxWidth: 440, width: '100%',
        boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
      }}>
        <h1 style={{
          fontFamily: 'Montserrat', fontWeight: 800, fontSize: 22,
          color: 'var(--text)', margin: '0 0 6px',
        }}>
          Welcome! Quick setup
        </h1>
        <p style={{
          fontFamily: 'Open Sans', fontSize: 14, color: 'var(--text-muted)',
          margin: '0 0 32px',
        }}>
          Tell us a bit about yourself — this helps personalise your interview analysis.
        </p>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div>
            <label style={labelStyle}>Your name *</label>
            <input
              type="text"
              value={form.name}
              onChange={e => set('name', e.target.value)}
              placeholder="e.g. Alex Johnson"
              style={inputStyle}
              required
            />
          </div>

          <div>
            <label style={labelStyle}>Age <span style={{ opacity: 0.5 }}>(optional)</span></label>
            <input
              type="number"
              min="16" max="80"
              value={form.age}
              onChange={e => set('age', e.target.value)}
              placeholder="e.g. 28"
              style={inputStyle}
            />
          </div>

          <div>
            <label style={labelStyle}>Current role <span style={{ opacity: 0.5 }}>(optional)</span></label>
            <input
              type="text"
              value={form.title}
              onChange={e => set('title', e.target.value)}
              placeholder="e.g. Senior Product Manager"
              style={inputStyle}
            />
          </div>

          <div>
            <label style={labelStyle}>Company <span style={{ opacity: 0.5 }}>(optional)</span></label>
            <input
              type="text"
              value={form.org}
              onChange={e => set('org', e.target.value)}
              placeholder="e.g. Acme Corp"
              style={inputStyle}
            />
          </div>

          {error && (
            <p style={{ color: 'var(--danger)', fontFamily: 'DM Mono', fontSize: 13, margin: 0 }}>
              {error}
            </p>
          )}
          {debug && (
            <p style={{ color: 'var(--text-muted)', fontFamily: 'DM Mono', fontSize: 11, margin: 0, wordBreak: 'break-all' }}>
              {debug}
            </p>
          )}

          <button
            type="submit"
            disabled={saving}
            style={{
              padding: '13px 20px', borderRadius: 10, border: 'none',
              background: saving
                ? 'var(--surface2)'
                : 'linear-gradient(135deg, #1d4ed8, #2563eb)',
              color: saving ? 'var(--text-muted)' : '#fff',
              fontFamily: 'Montserrat', fontSize: 15, fontWeight: 700,
              cursor: saving ? 'default' : 'pointer',
              marginTop: 4,
              transition: 'all 0.15s',
              boxShadow: saving ? 'none' : '0 4px 14px rgba(37,99,235,0.35)',
            }}
          >
            {saving ? 'Saving…' : 'Get started →'}
          </button>
        </form>
      </div>
    </div>
  )
}
