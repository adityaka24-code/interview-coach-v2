'use client'
import { useState, useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'

const ACTIVITY_MAP = {
  '/':          'Record / Home',
  '/history':   'History list',
  '/questions': 'Question Bank',
  '/salaries':  'Job Insights',
  '/profile':   'Profile',
}

export default function BugReportButton({ inline = false }) {
  const [open, setOpen]         = useState(false)
  const [text, setText]         = useState('')
  const [status, setStatus]     = useState(null)
  const [userName, setUserName] = useState('')
  const pathname  = usePathname()
  const textareaRef = useRef(null)
  const containerRef = useRef(null)

  useEffect(() => {
    fetch('/api/profile').then(r => r.ok ? r.json() : null).then(d => {
      if (d?.name && d.name !== 'Me') setUserName(d.name)
    }).catch(() => {})
  }, [])

  useEffect(() => {
    if (open && textareaRef.current) textareaRef.current.focus()
  }, [open])

  // Close on outside click
  useEffect(() => {
    if (!open) return
    function handle(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        close()
      }
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [open])

  const wordCount = text.trim().split(/\s+/).filter(Boolean).length
  const tooLong   = wordCount > 200
  const tooShort  = text.trim().length < 5
  const canSubmit = !tooShort && !tooLong && status !== 'sending'

  const pageLabel     = ACTIVITY_MAP[pathname] || pathname
  const stage         = typeof window !== 'undefined' ? window.__appStage : null
  const activityLabel = stage ? `${pageLabel} → ${stage}` : pageLabel

  async function submit() {
    if (!canSubmit) return
    setStatus('sending')
    try {
      const res = await fetch('/api/bug-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: text.trim(),
          page:        pathname,
          activity:    activityLabel,
          userAgent:   navigator.userAgent,
          screenSize:  `${window.innerWidth}x${window.innerHeight}`,
          userName,
        }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Failed')
      setStatus('sent')
      setText('')
      setTimeout(() => { setOpen(false); setStatus(null) }, 2000)
    } catch {
      setStatus('error')
    }
  }

  function close() { setOpen(false); setText(''); setStatus(null) }

  const popoverStyle = inline ? {
    // Drops down from nav bar
    position: 'absolute', top: 'calc(100% + 10px)', right: 0, zIndex: 400,
    background: 'var(--surface)', border: '1px solid var(--border)',
    borderRadius: 14, padding: 18, width: 320,
    boxShadow: '0 8px 40px rgba(0,0,0,0.35)',
    animation: 'fadeUp 0.15s ease',
  } : {
    // Legacy floating from bottom-right
    position: 'fixed', bottom: 62, right: 20, zIndex: 299,
    background: 'var(--surface)', border: '1px solid var(--border)',
    borderRadius: 14, padding: 18, width: 320,
    boxShadow: '0 8px 40px rgba(0,0,0,0.35)',
    animation: 'fadeUp 0.15s ease',
  }

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      {/* Trigger button */}
      <button
        onClick={() => setOpen(o => !o)}
        aria-label="Report a bug or give beta feedback"
        aria-expanded={open}
        title="Report a bug"
        style={{
          padding: '6px 13px',
          borderRadius: 7,
          border: `1px solid ${open ? 'rgba(252,129,129,0.5)' : 'var(--border)'}`,
          background: open ? 'rgba(252,129,129,0.1)' : 'transparent',
          color: open ? '#fc8181' : 'var(--text-muted)',
          fontFamily: 'DM Mono', fontSize: 13, cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 6,
          transition: 'all 0.15s',
        }}
        onMouseEnter={e => { if (!open) { e.currentTarget.style.borderColor='rgba(252,129,129,0.4)'; e.currentTarget.style.color='#fc8181'; e.currentTarget.style.background='rgba(252,129,129,0.07)' }}}
        onMouseLeave={e => { if (!open) { e.currentTarget.style.borderColor='var(--border)'; e.currentTarget.style.color='var(--text-muted)'; e.currentTarget.style.background='transparent' }}}
      >
        <span style={{ fontSize: 14 }}>🐛</span>
        <span>Report bug</span>
        <span style={{
          background: 'rgba(252,129,129,0.15)', border: '1px solid rgba(252,129,129,0.3)',
          color: '#fc8181', borderRadius: 6, padding: '1px 5px', fontSize: 9,
          letterSpacing: '0.5px',
        }}>BETA</span>
      </button>

      {/* Popover */}
      {open && (
        <div role="dialog" aria-label="Report a bug" style={popoverStyle}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
            <div>
              <span style={{ fontFamily:'DM Serif Display', fontSize:16, color:'var(--text)' }}>Report a bug</span>
              <span style={{ marginLeft:8, background:'rgba(252,129,129,0.1)', border:'1px solid rgba(252,129,129,0.2)', color:'#fc8181', borderRadius:8, padding:'1px 7px', fontSize:9, fontFamily:'DM Mono' }}>BETA</span>
            </div>
            <button onClick={close} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--text-muted)', fontSize:20, lineHeight:1, padding:'0 2px' }} aria-label="Close">×</button>
          </div>

          {status === 'sent' ? (
            <div style={{ textAlign:'center', padding:'20px 0' }}>
              <div style={{ fontSize:28, marginBottom:8 }}>✓</div>
              <p style={{ color:'#68d391', fontFamily:'DM Mono', fontSize:13, margin:0 }}>Sent — thanks!</p>
            </div>
          ) : (
            <>
              <textarea
                ref={textareaRef}
                value={text}
                onChange={e => { setText(e.target.value); setStatus(null) }}
                onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit() }}
                placeholder="Describe what went wrong — one line is fine. Cmd+Enter to send."
                style={{
                  width:'100%', height:86, resize:'none', padding:'9px 11px',
                  background:'var(--surface2)', border:`1px solid ${tooLong ? 'rgba(252,129,129,0.5)' : 'var(--border)'}`,
                  borderRadius:9, color:'var(--text)', fontFamily:'DM Mono',
                  fontSize:12, lineHeight:1.65, boxSizing:'border-box', outline:'none',
                }}
              />
              <div style={{ display:'flex', justifyContent:'space-between', marginTop:6, marginBottom:10 }}>
                <span style={{ fontSize:10, color:tooLong?'#fc8181':'var(--text-muted)', fontFamily:'DM Mono' }}>
                  {wordCount} / 200 words{tooLong ? ' — too long' : ''}
                </span>
                {status === 'error' && <span style={{ fontSize:10, color:'#fc8181', fontFamily:'DM Mono' }}>Failed — retry</span>}
              </div>

              {/* Context preview */}
              <div style={{ background:'var(--surface2)', borderRadius:8, padding:'7px 10px', marginBottom:12, fontSize:10, color:'var(--text-muted)', fontFamily:'DM Mono', lineHeight:1.8, border:'1px solid var(--border)' }}>
                <div><span style={{ opacity:0.5 }}>page</span>{'  '}{pathname}</div>
                <div><span style={{ opacity:0.5 }}>activity</span>{'  '}{activityLabel}</div>
                {userName && <div><span style={{ opacity:0.5 }}>user</span>{'  '}{userName}</div>}
              </div>

              <button
                onClick={submit}
                disabled={!canSubmit}
                style={{
                  width:'100%', padding:'9px', borderRadius:9, border:'none',
                  background: canSubmit ? 'linear-gradient(135deg,#fc8181,#f6ad55)' : 'var(--surface2)',
                  color: canSubmit ? '#0a0a0f' : 'var(--text-muted)',
                  fontFamily:'DM Mono', fontSize:13, fontWeight:'bold',
                  cursor: canSubmit ? 'pointer' : 'not-allowed', transition:'all 0.15s',
                }}
              >
                {status === 'sending' ? 'Sending…' : 'Send Report'}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
