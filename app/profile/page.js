'use client'
import { useState, useEffect } from 'react'
import FileDropZone from '../components/FileDropZone'

const S = {
  label: { fontSize:'var(--font-size-xs)', color:'var(--text-muted)', letterSpacing:'1.5px', textTransform:'uppercase', display:'block', marginBottom:6 },
  input: { width:'100%', background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:'var(--radius)', padding:'11px 14px', color:'var(--text)', fontFamily:'DM Mono', fontSize:'var(--font-size-base)', boxSizing:'border-box', transition:'border-color 0.15s' },
  card: { background:'var(--surface)', border:'1px solid var(--border)', borderRadius:14, padding:22, marginBottom:16 },
  h2: { fontFamily:'Montserrat', fontSize:18, fontWeight:700, color:'var(--text)', marginBottom:4 },
  hint: { fontSize:'var(--font-size-xs)', color:'var(--text-muted)', lineHeight:1.6, marginBottom:14 },
}

export default function ProfilePage() {
  const [form, setForm] = useState({ name:'', email:'', age:'', title:'', org:'', cv_text:'', portfolio_text:'' })
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(true)
  const [portfolioUrl, setPortfolioUrl] = useState('')
  const [fetchingUrl, setFetchingUrl] = useState(false)

  useEffect(() => {
    fetch('/api/profile').then(r=>r.json()).then(d => {
      if (d.user) setForm({
        name: d.user.name||'', email: d.user.email||'', age: d.user.age||'',
        title: d.user.title||'', org: d.user.org||'', cv_text: d.user.cv_text||'',
        portfolio_text: d.user.portfolio_text||'',
      })
      setLoading(false)
    })
  }, [])

  const setF = (k, v) => setForm(f => ({...f, [k]: v}))

  const fetchPortfolioUrl = async () => {
    if (!portfolioUrl.trim()) return
    setFetchingUrl(true)
    try {
      const res = await fetch('/api/fetch-url', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ url: portfolioUrl }) })
      const d = await res.json()
      if (d.error) throw new Error(d.error)
      setF('portfolio_text', d.text)
      setPortfolioMode('text')
    } catch(e) { alert('Could not fetch URL: ' + e.message) }
    finally { setFetchingUrl(false) }
  }

  const save = async () => {
    await fetch('/api/profile', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(form) })
    setSaved(true); setTimeout(()=>setSaved(false), 2500)
  }

  if (loading) return <div style={{ textAlign:'center', padding:80, color:'var(--text-muted)' }}>Loading...</div>

  return (
    <div style={{ maxWidth:1100, margin:'0 auto', padding:'36px 32px' }}>
      <h1 style={{ fontFamily:'Montserrat', fontSize:28, fontWeight:700, color:'var(--text)', marginBottom:4 }}>Profile</h1>
      <p style={{ color:'var(--text-muted)', fontSize:'var(--font-size-sm)', marginBottom:28 }}>
        CV and portfolio saved here are used for all interviews unless overridden per-interview.
      </p>

      {/* Basic info — wafer-thin single row */}
      <div style={{ ...S.card, marginBottom:20, padding:'16px 22px' }}>
        <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:12 }}>
          <h2 style={{ ...S.h2, marginBottom:0 }}>About you</h2>
          <span style={{ fontSize:'var(--font-size-xs)', color:'var(--text-muted)', fontFamily:'DM Mono' }}>— personalises coaching tone &amp; reports</span>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12, marginBottom:12 }}>
          <div><label style={S.label} htmlFor="name">Name</label><input id="name" value={form.name} onChange={e=>setF('name',e.target.value)} placeholder="Your name" style={S.input}/></div>
          <div><label style={S.label} htmlFor="email">Email</label><input id="email" value={form.email} onChange={e=>setF('email',e.target.value)} placeholder="you@email.com" style={S.input}/></div>
          <div><label style={S.label} htmlFor="age">Age <span style={{textTransform:'none',letterSpacing:0,opacity:0.6}}>(optional)</span></label><input id="age" type="number" min="16" max="80" value={form.age} onChange={e=>setF('age',e.target.value)} placeholder="e.g. 28" style={S.input}/></div>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
          <div><label style={S.label} htmlFor="title">Current role</label><input id="title" value={form.title} onChange={e=>setF('title',e.target.value)} placeholder="e.g. Senior Product Manager" style={S.input}/></div>
          <div><label style={S.label} htmlFor="org">Current org <span style={{textTransform:'none',letterSpacing:0,opacity:0.6}}>(optional)</span></label><input id="org" value={form.org} onChange={e=>setF('org',e.target.value)} placeholder="e.g. Maersk" style={S.input}/></div>
        </div>
      </div>

      {/* CV + Portfolio — equal side-by-side */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, alignItems:'start', marginBottom:0 }}>

        {/* CV */}
        <div style={S.card}>
          <h2 style={S.h2}>CV / Résumé</h2>
          <p style={S.hint}>Upload a file or paste text. Claude uses this to suggest stronger examples you could have cited in answers.</p>
          <FileDropZone
            label="Drop CV here — PDF, DOCX, or PPTX"
            onText={t => setF('cv_text', t)}
          />
          <div style={{ margin:'10px 0 6px', fontSize:'var(--font-size-xs)', color:'var(--text-muted)', textAlign:'center' }}>or type / paste below</div>
          <textarea
            value={form.cv_text}
            onChange={e=>setF('cv_text',e.target.value)}
            aria-label="CV text"
            placeholder={"Senior PM @ Stripe (2021–2024)\n- Launched Stripe Tax in 8 markets, reducing merchant setup time by 60%\n- Led cross-functional team of 12 engineers and 3 designers\n\nPM @ Razorpay (2018–2021)\n- Built payment links product used by 50K+ merchants..."}
            style={{ ...S.input, height:220, resize:'vertical', lineHeight:1.7 }}
          />
          <div style={{ fontSize:'var(--font-size-xs)', color:'var(--text-muted)', marginTop:6 }}>{form.cv_text.length} characters</div>
        </div>

        {/* Portfolio */}
        <div style={S.card}>
          <h2 style={S.h2}>Portfolio / Key Achievements</h2>
          <p style={S.hint}>Notable projects, case studies, or measurable wins. Upload a PPTX, fetch from a URL, or paste text.</p>
          <FileDropZone
            label="Drop portfolio here — PDF, DOCX, or PPTX"
            onText={t => setF('portfolio_text', t)}
          />
          <div style={{ margin:'10px 0 6px', fontSize:'var(--font-size-xs)', color:'var(--text-muted)', textAlign:'center' }}>or type / paste below</div>
          <textarea
            value={form.portfolio_text}
            onChange={e=>setF('portfolio_text',e.target.value)}
            aria-label="Portfolio text"
            placeholder={"Key achievements:\n\n• Redesigned checkout → 23% conversion increase, $4M ARR impact\n• Built internal PM tooling used by 200+ PMs across APAC\n• 0→1 mobile app launch with 500K downloads in 6 months"}
            style={{ ...S.input, height:220, resize:'vertical', lineHeight:1.7 }}
          />
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:6 }}>
            <span style={{ fontSize:'var(--font-size-xs)', color:'var(--text-muted)' }}>{form.portfolio_text.length} characters</span>
            <div style={{ display:'flex', alignItems:'center', gap:6 }}>
              {!fetchingUrl && (
                <input value={portfolioUrl} onChange={e=>setPortfolioUrl(e.target.value)}
                  placeholder="Or fetch from URL…"
                  style={{ ...S.input, width:200, padding:'5px 10px', fontSize:'var(--font-size-xs)' }} aria-label="Portfolio URL"/>
              )}
              {portfolioUrl.trim() && !fetchingUrl && (
                <button onClick={fetchPortfolioUrl}
                  style={{ padding:'5px 12px', background:'var(--accent)', border:'none',
                    borderRadius:'var(--radius)', color:'#0a0a0f',
                    fontFamily:'DM Mono', fontSize:'var(--font-size-xs)', cursor:'pointer', flexShrink:0 }}>
                  Fetch
                </button>
              )}
              {fetchingUrl && (
                <span style={{ fontSize:'var(--font-size-xs)', color:'var(--accent)', fontFamily:'DM Mono' }}>Fetching…</span>
              )}
            </div>
          </div>
        </div>
      </div>

      <button onClick={save} style={{
        width:'100%', padding:'13px',
        background:'linear-gradient(135deg, var(--accent), #4299e1)',
        border:'none', borderRadius:'var(--radius)', color:'var(--text)',
        fontSize:'var(--font-size-base)', fontFamily:'DM Mono', fontWeight:'bold',
        cursor:'pointer', transition:'opacity 0.2s',
      }}>
        {saved ? '✓ Saved' : 'Save Profile'}
      </button>
    </div>
  )
}