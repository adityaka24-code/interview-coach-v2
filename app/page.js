'use client'
import { useState, useRef, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import FileDropZone from './components/FileDropZone'
import { useTheme } from './context/ThemeContext'
import { useAuth } from '@clerk/nextjs'

// ─── Shared styles ────────────────────────────────────────────────────────────
const S = {
  input: { width:'100%', background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:'var(--radius)', padding:'11px 14px', color:'var(--text)', fontFamily:'DM Mono', fontSize:'var(--font-size-base)', boxSizing:'border-box', transition:'border-color 0.15s' },
  label: { fontSize:12, color:'var(--text)', letterSpacing:'1px', fontWeight:600, textTransform:'uppercase', display:'block', marginBottom:6, fontFamily:'DM Mono' },
  card: { background:'var(--surface)', border:'1px solid var(--border)', borderRadius:14, padding:22, marginBottom:14 },
  section: { fontSize:12, color:'var(--text)', letterSpacing:'1px', fontWeight:700, textTransform:'uppercase', marginBottom:14, fontFamily:'DM Mono' },
}

const CURRENCIES = ['USD','INR','GBP','EUR','SGD','AUD','CAD']
const CURRENCY_SYM = { USD:'$', INR:'₹', GBP:'£', EUR:'€', SGD:'S$', AUD:'A$', CAD:'C$' }
const EXP_OPTS = [
  {v:'', l:'Years of experience'},
  {v:'0-2', l:'0–2 years (Junior / APM)'},
  {v:'2-5', l:'2–5 years (PM)'},
  {v:'5-8', l:'5–8 years (Senior PM)'},
  {v:'8-12', l:'8–12 years (Principal / Staff PM)'},
  {v:'12+', l:'12+ years (Director+)'},
]

// ─── Sub-components ────────────────────────────────────────────────────────────
function ScoreRing({ score, size=90 }) {
  const r=(size/2)-8, circ=2*Math.PI*r, fill=(score/10)*circ
  const color=score>=7?'#68d391':score>=5?'#f6ad55':'#fc8181'
  return (
    <svg width={size} height={size} style={{transform:'rotate(-90deg)'}} aria-label={`Score: ${score} out of 10`}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(128,128,128,0.1)" strokeWidth={6}/>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={6}
        strokeDasharray={`${fill} ${circ}`} strokeLinecap="round"
        style={{transition:'stroke-dasharray 1s ease', filter:`drop-shadow(0 0 5px ${color})`}}/>
      <text x={size/2} y={size/2} textAnchor="middle" dominantBaseline="central"
        fill={color} fontSize={size*0.22} fontWeight="bold" fontFamily="DM Mono" className="score-ring-val"
        style={{transform:`rotate(90deg)`,transformOrigin:`${size/2}px ${size/2}px`}}>
        {score}/10
      </text>
    </svg>
  )
}

function SignalBar({ label, value, max=5 }) {
  const color=value>=4?'#68d391':value>=3?'#f6ad55':'#fc8181'
  return (
    <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:8}}>
      <span style={{fontSize:'var(--font-size-xs)',color:'var(--text-muted)',width:130,flexShrink:0}}>{label}</span>
      <div style={{flex:1,height:4,background:'rgba(128,128,128,0.1)',borderRadius:2,overflow:'hidden'}}
        role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={max} aria-label={`${label}: ${value} out of ${max}`}>
        <div style={{width:`${(value/max)*100}%`,height:'100%',background:color,borderRadius:2,transition:'width 1s ease'}}/>
      </div>
      <span style={{fontSize:'var(--font-size-xs)',color,width:24,textAlign:'right'}}>{value}/{max}</span>
    </div>
  )
}

// Normalise rewrite text: convert literal \n sequences → real newlines, render **bold**
function renderRewrite(raw) {
  const text = raw.replace(/\\n/g, '\n').replace(/\\t/g, ' ')
  return text.split(/\n\n+/).map((para, pi) => {
    if (!para.trim()) return null
    const parts = para.split(/\*\*(.*?)\*\*/g)
    return (
      <p key={pi} style={{margin: pi === 0 ? 0 : '10px 0 0', lineHeight: 1.8}}>
        {parts.map((part, i) => i % 2 === 1 ? <strong key={i}>{part}</strong> : part)}
      </p>
    )
  })
}

function AnswerCard({ answer, index, metadata }) {
  const [open, setOpen] = useState(false)
  const [rewrite, setRewrite] = useState(answer.rewrittenAnswer || null)
  const [rewriteLoading, setRewriteLoading] = useState(false)
  const [rewriteError, setRewriteError] = useState(null)
  const [copied, setCopied] = useState(false)

  function copyRewrite() {
    if (!rewrite) return
    navigator.clipboard.writeText(rewrite).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  async function fetchRewrite() {
    setRewriteLoading(true)
    setRewriteError(null)
    try {
      const res = await fetch('/api/rewrite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: answer.question,
          questionType: answer.questionType,
          yourAnswer: answer.yourAnswer,
          whatMissed: answer.whatMissed,
          principleViolations: answer.principleViolations,
          company: metadata?.company,
          role: metadata?.role,
          experienceYears: metadata?.experienceYears,
        }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Rewrite failed')
      setRewrite(d.rewrittenAnswer)
    } catch (e) {
      setRewriteError(e.message)
    } finally {
      setRewriteLoading(false)
    }
  }
  const sc=answer.score>=7?'#68d391':answer.score>=5?'#f6ad55':'#fc8181'
  return (
    <article style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:'var(--radius)',overflow:'hidden',marginBottom:10}}>
      <button onClick={()=>setOpen(!open)} aria-expanded={open}
        style={{width:'100%',padding:'14px 18px',cursor:'pointer',display:'flex',alignItems:'center',gap:14,background:'none',border:'none',borderBottom:open?'1px solid var(--border)':'none',textAlign:'left'}}>
        <div style={{width:34,height:34,borderRadius:8,background:'var(--surface2)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'var(--font-size-sm)',fontWeight:'bold',color:sc,flexShrink:0}}>
          {answer.score}
        </div>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:'var(--font-size-base)',color:'var(--text)',marginBottom:5,fontFamily:'Open Sans, sans-serif',fontWeight:600,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
            Q{index+1}: {answer.question}
          </div>
          <div style={{display:'flex',alignItems:'center',gap:8,minWidth:0}}>
            {answer.questionType&&(
              <span style={{flexShrink:0,padding:'2px 8px',borderRadius:20,fontSize:10,fontFamily:'DM Mono',letterSpacing:'0.5px',whiteSpace:'nowrap',textTransform:'uppercase',background:'rgba(160,118,249,0.12)',border:'1px solid rgba(160,118,249,0.3)',color:'#a78bfa'}}>
                {answer.questionType}
              </span>
            )}
            <span style={{fontSize:'var(--font-size-xs)',color:'var(--text-muted)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{answer.yourAnswer}</span>
          </div>
        </div>
        <span style={{fontSize:17,color:'var(--text-muted)',flexShrink:0}} aria-hidden>{open?'↑':'↓'}</span>
      </button>
      {open&&(
        <div style={{padding:'18px'}}>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:16}}>
            <div style={{background:'rgba(104,211,145,0.05)',border:'1px solid rgba(104,211,145,0.15)',borderRadius:8,padding:12}}>
              <div style={{fontSize:'var(--font-size-xs)',color:'#68d391',letterSpacing:'1.5px',textTransform:'uppercase',marginBottom:6}}>✓ Worked</div>
              <div style={{fontSize:'var(--font-size-sm)',color:'var(--text)',lineHeight:1.6}}>{answer.whatWorked}</div>
            </div>
            <div style={{background:'rgba(252,129,129,0.05)',border:'1px solid rgba(252,129,129,0.15)',borderRadius:8,padding:12}}>
              <div style={{fontSize:'var(--font-size-xs)',color:'#fc8181',letterSpacing:'1.5px',textTransform:'uppercase',marginBottom:6}}>✗ Missed</div>
              <div style={{fontSize:'var(--font-size-sm)',color:'var(--text)',lineHeight:1.6}}>{answer.whatMissed}</div>
            </div>
          </div>
          {(answer.cvOpportunity||answer.jdRelevance)&&(
            <div style={{display:'grid',gridTemplateColumns:answer.cvOpportunity&&answer.jdRelevance?'1fr 1fr':'1fr',gap:10,marginBottom:16}}>
              {answer.cvOpportunity&&(
                <div style={{background:'rgba(167,139,250,0.05)',border:'1px solid rgba(167,139,250,0.2)',borderRadius:8,padding:12}}>
                  <div style={{fontSize:'var(--font-size-xs)',color:'#a78bfa',letterSpacing:'1.5px',textTransform:'uppercase',marginBottom:6}}>📌 From your CV</div>
                  <div style={{fontSize:'var(--font-size-sm)',color:'var(--text)',lineHeight:1.6}}>{answer.cvOpportunity}</div>
                </div>
              )}
              {answer.jdRelevance&&(
                <div style={{background:'rgba(99,179,237,0.05)',border:'1px solid rgba(99,179,237,0.15)',borderRadius:8,padding:12}}>
                  <div style={{fontSize:'var(--font-size-xs)',color:'var(--accent)',letterSpacing:'1.5px',textTransform:'uppercase',marginBottom:6}}>🎯 JD alignment</div>
                  <div style={{fontSize:'var(--font-size-sm)',color:'var(--text)',lineHeight:1.6}}>{answer.jdRelevance}</div>
                </div>
              )}
            </div>
          )}
          <div style={{marginBottom:16}}>
            <div style={{...S.section,marginBottom:10}}>PM signals</div>
            {Object.entries(answer.pmSignals||{}).map(([label, value])=>(
              <SignalBar key={label} label={label} value={value||0}/>
            ))}
          </div>
          <div>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10}}>
              <div style={{...S.section,color:'var(--accent)'}}>✦ Rewritten answer</div>
              <div style={{display:'flex',gap:6}}>
                {rewrite&&(
                  <button onClick={copyRewrite} aria-label="Copy rewritten answer"
                    style={{padding:'5px 12px',borderRadius:8,border:'1px solid rgba(104,211,145,0.3)',
                      background: copied?'rgba(104,211,145,0.12)':'rgba(104,211,145,0.06)',
                      color: copied?'#68d391':'var(--text-muted)',fontFamily:'DM Mono',
                      fontSize:'var(--font-size-xs)',cursor:'pointer',transition:'all 0.15s'}}>
                    {copied ? '✓ Copied' : '⎘ Copy'}
                  </button>
                )}
                {!rewrite&&!rewriteLoading&&(
                  <button onClick={fetchRewrite}
                    style={{padding:'5px 14px',borderRadius:8,border:'1px solid rgba(99,179,237,0.3)',
                      background:'rgba(99,179,237,0.06)',color:'var(--accent)',fontFamily:'DM Mono',
                      fontSize:'var(--font-size-xs)',cursor:'pointer',transition:'all 0.15s'}}
                    onMouseEnter={e=>{e.currentTarget.style.background='rgba(99,179,237,0.12)'}}
                    onMouseLeave={e=>{e.currentTarget.style.background='rgba(99,179,237,0.06)'}}>
                    Generate →
                  </button>
                )}
              </div>
            </div>
            {rewriteLoading&&(
              <div style={{padding:'12px 14px',background:'rgba(99,179,237,0.03)',border:'1px solid rgba(99,179,237,0.1)',borderRadius:8,fontSize:'var(--font-size-xs)',color:'var(--accent)',fontFamily:'DM Mono'}}>
                ⏳ Rewriting with Claude...
              </div>
            )}
            {rewriteError&&(
              <div style={{padding:'10px 14px',background:'rgba(252,129,129,0.05)',border:'1px solid rgba(252,129,129,0.2)',borderRadius:8,fontSize:'var(--font-size-xs)',color:'var(--danger)',marginBottom:8}}>
                ⚠ {rewriteError} — <button onClick={fetchRewrite} style={{background:'none',border:'none',color:'var(--accent)',cursor:'pointer',fontFamily:'DM Mono',fontSize:'var(--font-size-xs)',padding:0}}>retry</button>
              </div>
            )}
            {rewrite&&(
              <blockquote style={{background:'rgba(99,179,237,0.04)',border:'1px solid rgba(99,179,237,0.15)',borderRadius:8,padding:14,fontSize:'var(--font-size-sm)',color:'var(--text)',fontFamily:'Montserrat',fontStyle:'italic',margin:0}}>
                {renderRewrite(rewrite)}
              </blockquote>
            )}
            {!rewrite&&!rewriteLoading&&!rewriteError&&(
              <div style={{padding:'10px 14px',background:'var(--surface2)',borderRadius:8,fontSize:'var(--font-size-xs)',color:'var(--text-muted)',fontFamily:'DM Mono',opacity:0.7}}>
                Click "Generate" to see how a top PM would answer this question.
              </div>
            )}
          </div>
        </div>
      )}
    </article>
  )
}

function CountdownScreen() {
  const [count, setCount] = useState(45)
  const RADIUS = 54
  const CIRC = 2 * Math.PI * RADIUS

  useEffect(() => {
    if (count <= 0) return
    const t = setTimeout(() => setCount(c => c - 1), 1000)
    return () => clearTimeout(t)
  }, [count])

  const pct = (45 - count) / 45

  return (
    <div style={{textAlign:'center',animation:'fadeUp 0.5s ease',paddingTop:72,paddingBottom:40,maxWidth:380,margin:'0 auto'}} aria-live="polite">
      {/* Ring + countdown */}
      <div style={{position:'relative',width:160,height:160,margin:'0 auto 40px'}}>
        <svg width="160" height="160" style={{transform:'rotate(-90deg)'}}>
          <circle cx="80" cy="80" r={RADIUS} fill="none" stroke="var(--surface2)" strokeWidth="6"/>
          <circle cx="80" cy="80" r={RADIUS} fill="none"
            stroke="var(--accent)" strokeWidth="6" strokeLinecap="round"
            strokeDasharray={CIRC}
            strokeDashoffset={CIRC * (1 - pct)}
            style={{transition:'stroke-dashoffset 1s linear'}}
          />
        </svg>
        <div style={{position:'absolute',inset:0,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center'}}>
          <span style={{fontFamily:'DM Mono',fontSize:52,fontWeight:'bold',color:'var(--text)',lineHeight:1,fontVariantNumeric:'tabular-nums'}}>
            {count > 0 ? count : '✓'}
          </span>
          <span style={{fontFamily:'DM Mono',fontSize:11,color:'var(--text-muted)',letterSpacing:'1px',marginTop:4}}>
            {count > 0 ? 'seconds' : 'done'}
          </span>
        </div>
      </div>
      <h2 style={{fontFamily:'Montserrat',fontSize:26,fontWeight:600,color:'var(--text)',marginBottom:10,letterSpacing:'-0.3px'}}>
        Building your report
      </h2>
      <p style={{color:'var(--text-muted)',fontSize:'var(--font-size-sm)',lineHeight:1.7}}>
        Analysing your answers in parallel — your report will appear momentarily.
      </p>
    </div>
  )
}

function CompletionToast({ onDismiss }) {
  const DURATION = 5000
  const [width, setWidth] = useState(100)

  useEffect(() => {
    const start = Date.now()
    const raf = () => {
      const elapsed = Date.now() - start
      const remaining = Math.max(0, 100 - (elapsed / DURATION) * 100)
      setWidth(remaining)
      if (elapsed < DURATION) requestAnimationFrame(raf)
      else onDismiss()
    }
    const id = requestAnimationFrame(raf)
    return () => cancelAnimationFrame(id)
  }, [])

  return (
    <div style={{
      position:'fixed', bottom:24, right:24, zIndex:1000,
      background:'var(--card-bg)', border:'1px solid rgba(104,211,145,0.35)',
      borderRadius:12, padding:'14px 18px', minWidth:260,
      boxShadow:'0 8px 32px rgba(0,0,0,0.35)', animation:'fadeUp 0.35s ease',
    }} role="status" aria-live="polite">
      <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:6}}>
        <span style={{fontSize:16,color:'#68d391'}}>✓</span>
        <span style={{fontFamily:'Montserrat',fontWeight:600,fontSize:14,color:'#68d391'}}>Report ready</span>
      </div>
      <p style={{fontSize:12,color:'var(--text-muted)',margin:'0 0 10px',lineHeight:1.5}}>Your interview analysis is complete.</p>
      <div style={{height:2,background:'rgba(104,211,145,0.12)',borderRadius:1}}>
        <div style={{height:'100%',width:`${width}%`,background:'#68d391',borderRadius:1}}/>
      </div>
    </div>
  )
}


function Waveform({ paused }) {
  return (
    <div style={{display:'flex',alignItems:'center',gap:3,height:28}} aria-hidden>
      {[...Array(12)].map((_,i)=>(
        <div key={i} style={{
          width:3, height:'100%',
          background: paused?'var(--text-muted)':'var(--recording)',
          borderRadius:2,
          animation: paused ? 'none' : `waveform ${0.6+Math.random()*0.8}s ease-in-out infinite`,
          animationDelay: `${i*0.08}s`,
          transform: paused ? 'scaleY(0.3)' : undefined,
        }}/>
      ))}
    </div>
  )
}

// ─── Main page ─────────────────────────────────────────────────────────────────


// ── Live Ticker ───────────────────────────────────────────────────────────────
const CURRENCY_SYM_T = { USD:'$', INR:'₹', GBP:'£', EUR:'€', SGD:'S$', AUD:'A$', CAD:'C$' }

function timeAgoShort(dateStr) {
  if (!dateStr) return ''
  const diff = Math.floor((Date.now() - new Date(dateStr)) / 1000)
  if (diff < 60)   return 'just now'
  if (diff < 3600) return `${Math.floor(diff/60)}m ago`
  if (diff < 86400) return `${Math.floor(diff/3600)}h ago`
  if (diff < 604800) return `${Math.floor(diff/86400)}d ago`
  return new Date(dateStr).toLocaleDateString('en-GB',{day:'numeric',month:'short'})
}

function Ticker() {
  const [items, setItems] = useState([])
  const trackRef = useRef(null)
  const animRef  = useRef(null)
  const posRef   = useRef(0)
  const pausedRef = useRef(false)

  useEffect(() => {
    fetch('/api/ticker')
      .then(r => r.json())
      .then(d => {
        const list = (d.items || []).slice(0, 20)
        setItems(list)
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    const track = trackRef.current
    if (!track || items.length === 0) return

    let last = null
    const speed = 0.6 // px per frame

    const step = (ts) => {
      if (!last) last = ts
      const dt = ts - last
      last = ts

      if (!pausedRef.current) {
        posRef.current -= speed * (dt / 16.67)
        const half = track.scrollWidth / 2
        if (posRef.current <= -half) posRef.current += half
        track.style.transform = `translateX(${posRef.current}px)`
      }
      animRef.current = requestAnimationFrame(step)
    }

    animRef.current = requestAnimationFrame(step)
    return () => cancelAnimationFrame(animRef.current)
  }, [items])

  if (items.length === 0) return null

  const renderItem = (iv, i) => {
    const sym = CURRENCY_SYM_T[iv.salary_currency] || ''
    const sal = iv.salary_max
      ? `${sym}${Number(iv.salary_max).toLocaleString()}`
      : iv.salary_min
        ? `${sym}${Number(iv.salary_min).toLocaleString()}`
        : null

    return (
      <span key={i} style={{
        display: 'inline-flex', alignItems: 'center', gap: 10,
        padding: '0 28px', borderRight: '1px solid var(--border)',
        whiteSpace: 'nowrap', fontSize: 12, fontFamily: 'DM Mono',
      }}>
        <span style={{ color: 'var(--text)', fontWeight: 600 }}>{iv.company || '—'}</span>
        {iv.role && <span style={{ color: 'var(--text-muted)' }}>{iv.role}</span>}
        {sal && (
          <span style={{ color: '#68d391', background: 'rgba(104,211,145,0.08)', border: '1px solid rgba(104,211,145,0.15)', borderRadius: 10, padding: '1px 8px' }}>
            {sal}
          </span>
        )}
        <span style={{ color: 'var(--text-muted)', fontSize: 10, opacity: 0.7 }}>{timeAgoShort(iv.date)}</span>
      </span>
    )
  }

  return (
    <div style={{
      position: 'fixed', bottom: 48, left: 0, right: 0, zIndex: 50,
      borderTop: '1px solid var(--border)',
      background: 'var(--nav-bg)', backdropFilter: 'blur(12px)',
      height: 36, overflow: 'hidden', display: 'flex', alignItems: 'center',
    }}
      onMouseEnter={() => { pausedRef.current = true }}
      onMouseLeave={() => { pausedRef.current = false }}
    >
      {/* Label */}
      <div style={{
        flexShrink: 0, padding: '0 14px 0 16px',
        fontSize: 9, letterSpacing: '1.5px', textTransform: 'uppercase',
        color: 'var(--accent)', fontFamily: 'DM Mono',
        borderRight: '1px solid var(--border)', height: '100%',
        display: 'flex', alignItems: 'center', background: 'var(--nav-bg)',
        zIndex: 2,
      }}>
        Live
      </div>

      {/* Scrolling track */}
      <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
        <div ref={trackRef} style={{ display: 'inline-flex', alignItems: 'center', height: 36 }}>
          {items.map((iv, i) => renderItem(iv, i))}
          {items.map((iv, i) => renderItem(iv, `dup-${i}`))}
        </div>
      </div>
    </div>
  )
}


// ── MiniRing — must live outside ReportTeaser so React sees a stable component
// type across renders. If defined inside, every `ready` state change creates a
// new function reference → React unmounts+remounts the element → CSS transition
// on stroke-dasharray never fires (starts at final value immediately).
const SC_COLORS = {
  good:    { text:'#7ee8a2', bg:'rgba(126,232,162,0.09)', border:'rgba(126,232,162,0.22)', track:'rgba(126,232,162,0.15)' },
  improve: { text:'#fbc26a', bg:'rgba(251,194,106,0.09)', border:'rgba(251,194,106,0.22)', track:'rgba(251,194,106,0.15)' },
  bad:     { text:'#ff8f8f', bg:'rgba(255,143,143,0.09)', border:'rgba(255,143,143,0.22)', track:'rgba(255,143,143,0.15)' },
}
function MiniRing({ score, signal, size=48, ready, colors=SC_COLORS }) {
  const c = colors[signal], r = (size/2)-5, circ = 2*Math.PI*r, pct = score/10
  return (
    <div style={{ position:'relative', width:size, height:size, flexShrink:0 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--surface2)" strokeWidth="4"/>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={c.text} strokeWidth="4"
          strokeDasharray={`${ready ? circ*pct : 0} ${circ}`}
          strokeLinecap="round" transform={`rotate(-90 ${size/2} ${size/2})`}
          style={{ transition:'stroke-dasharray 1.5s cubic-bezier(0.4,0,0.2,1)' }}/>
      </svg>
      <span style={{ position:'absolute', inset:0, display:'flex', alignItems:'center',
        justifyContent:'center', fontSize:size>52?18:12, fontWeight:800,
        color:c.text, fontFamily:'Montserrat', lineHeight:1 }}>{score.toFixed(1)}</span>
    </div>
  )
}

// ── Report Teaser (marketing panel on record page) ────────────────────────
function ReportTeaser() {
  const [ready, setReady] = useState(false)
  useEffect(() => { const t = setTimeout(() => setReady(true), 80); return () => clearTimeout(t) }, [])
  const { theme } = useTheme()
  const isLight = theme === 'light'

  const MOCK = [
    { q:'Tell me about a product you launched', score:8.2, signal:'good',    type:'Product Sense', snippet:'Led payment links launch at Razorpay — drove 3× merchant adoption in Q2…',       tags:['Data-driven','Clear ownership'],
      bars:[{label:'Clarification',v:85},{label:'User Fit',v:70},{label:'Framework',v:90},{label:'Metrics',v:75}] },
    { q:'How do you prioritise your roadmap?',  score:6.1, signal:'improve', type:'Execution',     snippet:'I use impact vs effort… but missed connecting to user research signal…',         tags:['Framework used','Needs user insight'],
      bars:[{label:'Hypothesis',v:60},{label:'Metric Pick',v:55},{label:'Segmentation',v:65},{label:'Data Intuition',v:50}] },
    { q:'Describe a product failure',           score:4.4, signal:'bad',     type:'Behavioural',   snippet:'Launched a feature nobody used — could be stronger on metrics & recovery…',     tags:['No metrics cited','Weak recovery'],
      bars:[{label:'Situation',v:40},{label:'Ownership',v:35},{label:'Quantified',v:45},{label:'Lessons',v:30}] },
  ]

  const SC = isLight ? {
    good:    { text:'#16a34a', bg:'rgba(22,163,74,0.08)',  border:'rgba(22,163,74,0.3)',  track:'rgba(22,163,74,0.15)'  },
    improve: { text:'#b45309', bg:'rgba(180,83,9,0.07)',   border:'rgba(180,83,9,0.28)',  track:'rgba(180,83,9,0.13)'   },
    bad:     { text:'#dc2626', bg:'rgba(220,38,38,0.07)',  border:'rgba(220,38,38,0.28)', track:'rgba(220,38,38,0.13)'  },
  } : SC_COLORS

  return (
    <div style={{ background:'var(--surface)', border:'1px solid var(--border)',
      borderRadius:18, overflow:'hidden', boxShadow:'0 8px 32px rgba(0,0,0,0.25)' }}>

      {/* Header */}
      <div style={{ background:'linear-gradient(135deg,rgba(126,200,247,0.1),rgba(126,232,162,0.07))',
        borderBottom:'1px solid var(--border)', padding:'16px 20px',
        display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <div>
          <p style={{ fontSize:10, color:'var(--text-muted)', letterSpacing:'2px', textTransform:'uppercase', fontFamily:'DM Mono', marginBottom:3 }}>Your report looks like this</p>
          <p style={{ fontSize:17, color:'var(--text)', fontFamily:'Montserrat', fontWeight:700, margin:0 }}>PM Interview Report</p>
        </div>
        <div style={{ background:'rgba(126,232,162,0.12)', border:'1px solid rgba(126,232,162,0.3)',
          borderRadius:20, padding:'5px 12px', fontSize:11, color:'#7ee8a2',
          fontFamily:'DM Mono', fontWeight:'bold', display:'flex', alignItems:'center', gap:5 }}>
          <span style={{ animation:'blink 1.5s infinite', display:'inline-block', width:6, height:6, borderRadius:'50%', background:'#7ee8a2' }}/>
          ⚡ ~2 mins
        </div>
      </div>

      {/* ── Report Preview ── */}
      <div style={{ padding:'16px 18px' }}>

          {/* Overall score */}
          <div style={{ display:'flex', alignItems:'center', gap:16, marginBottom:16,
            padding:'12px 16px', background:'var(--surface2)', borderRadius:12, border:'1px solid var(--border)' }}>
            <MiniRing score={7.1} signal="improve" size={60} ready={ready} colors={SC}/>
            <div style={{ flex:1, minWidth:0 }}>
              <p style={{ fontSize:13, color:'var(--text)', fontFamily:'Open Sans, sans-serif',
                margin:'0 0 6px', fontStyle:'italic', lineHeight:1.5 }}>
                "Strong product intuition — sharper metric framing will close the gap."
              </p>
              <span style={{ fontSize:9, fontFamily:'DM Mono', color:'var(--accent)', letterSpacing:'1px',
                background:'rgba(126,200,247,0.1)', border:'1px solid rgba(126,200,247,0.2)',
                borderRadius:6, padding:'2px 7px' }}>INTERVIEW READY — WITH PRACTICE</span>
            </div>
          </div>

          <p style={{ fontSize:9, color:'var(--text-muted)', letterSpacing:'2px', textTransform:'uppercase', fontFamily:'DM Mono', marginBottom:10 }}>Answer Breakdown</p>
          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
            {MOCK.map((a,i) => {
              const c = SC[a.signal]
              return (
                <div key={i} style={{ background:c.bg, border:`1px solid ${c.border}`, borderRadius:12, padding:'12px 14px' }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:6 }}>
                    <div style={{ flex:1, marginRight:10 }}>
                      <span style={{ fontSize:9, fontFamily:'DM Mono', letterSpacing:'1px',
                        color: isLight ? '#6d28d9' : '#a78bfa',
                        background: isLight ? 'rgba(109,40,217,0.08)' : 'rgba(167,139,250,0.12)',
                        border: `1px solid ${isLight ? 'rgba(109,40,217,0.25)' : 'rgba(167,139,250,0.25)'}`,
                        borderRadius:6, padding:'2px 7px', display:'inline-block', marginBottom:5 }}>{a.type}</span>
                      <p style={{ fontSize:13, color:'var(--text)', fontFamily:'Montserrat', fontWeight:600, margin:0, lineHeight:1.4 }}>{a.q}</p>
                    </div>
                    <MiniRing score={a.score} signal={a.signal} size={48} ready={ready} colors={SC}/>
                  </div>
                  <p style={{ fontSize:11, color:'var(--text-muted)', fontFamily:'Open Sans, sans-serif', margin:'0 0 8px', lineHeight:1.6, fontStyle:'italic' }}>{a.snippet}</p>
                  <div style={{ display:'grid', gridTemplateColumns:`repeat(${a.bars.length},1fr)`, gap:5, marginBottom:8 }}>
                    {a.bars.map(({label,v},bi) => (
                      <div key={bi}>
                        <div style={{ height:4, background:c.track, borderRadius:2, overflow:'hidden' }}>
                          <div style={{ height:'100%', width: ready ? `${v}%` : '0%', background:c.text, borderRadius:2,
                            transition:`width 1.5s cubic-bezier(0.4,0,0.2,1) ${(i*4+bi)*60}ms` }}/>
                        </div>
                        <p style={{ fontSize:8, color:'var(--text-muted)', fontFamily:'DM Mono', margin:'2px 0 0', textAlign:'center' }}>{label}</p>
                      </div>
                    ))}
                  </div>
                  <div style={{ display:'flex', gap:5, flexWrap:'wrap' }}>
                    {a.tags.map(t=>(
                      <span key={t} style={{ fontSize:10, fontFamily:'DM Mono', color:c.text, background:`${c.text}12`, border:`1px solid ${c.text}30`, borderRadius:6, padding:'3px 8px' }}>{t}</span>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>

          <div style={{ marginTop:12, background:'rgba(126,200,247,0.06)', border:'1px solid rgba(126,200,247,0.18)', borderRadius:12, padding:'12px 14px' }}>
            <p style={{ fontSize:9, color:'var(--accent)', letterSpacing:'1.5px', textTransform:'uppercase', fontFamily:'DM Mono', marginBottom:6 }}>✦ AI answer rewrite — one click</p>
            <p style={{ fontSize:11, color:'var(--text-body)', fontFamily:'Open Sans, sans-serif', lineHeight:1.7, margin:0, fontStyle:'italic' }}>
              "Led payment links launch targeting 200K+ SMB merchants — achieved 3× adoption in 8 weeks by shifting activation metric from signups to first transaction."
            </p>
          </div>
        </div>
    </div>
  )
}


// ── Classifying Loader ────────────────────────────────────────────────────────
const CLASSIFY_STEPS = [
  'Identifying questions',
  'Identifying responses',
  'Linking responses to questions',
]

function ClassifyingLoader() {
  const [step, setStep] = useState(0)
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    const cycle = () => {
      // fade out, advance step, fade in
      setVisible(false)
      setTimeout(() => {
        setStep(s => (s + 1) % CLASSIFY_STEPS.length)
        setVisible(true)
      }, 350)
    }
    const id = setInterval(cycle, 3000)
    return () => clearInterval(id)
  }, [])

  return (
    <div style={{ textAlign:'center', padding:'60px 0' }}>
      <div style={{ width:36, height:36, border:'2px solid var(--border)', borderTopColor:'var(--accent)',
        borderRadius:'50%', animation:'spin 0.8s linear infinite', margin:'0 auto 20px' }}/>
      <p style={{
        fontFamily:'DM Mono', fontSize:'var(--font-size-sm)', color:'var(--accent)',
        transition:'opacity 0.35s ease', opacity: visible ? 1 : 0,
        minHeight:'1.4em', margin:'0 0 10px',
      }}>
        {CLASSIFY_STEPS[step]}
      </p>
      <p style={{ fontFamily:'DM Mono', fontSize:'var(--font-size-xs)', color:'var(--text-muted)', margin:0 }}>
        This usually takes less than 20 seconds
      </p>
    </div>
  )
}

// ── Transcript Review Component ───────────────────────────────────────────────
function TranscriptReview({ segments, setSegments, classifying, classifyError, onContinue, onBack }) {
  const [editingId, setEditingId] = useState(null)
  const [editText,  setEditText]  = useState('')
  // tooltip: { segId, charOffset, x, y } — fixed viewport coords
  const [tooltip,   setTooltip]   = useState(null)
  // addingAfter: { segId, charOffset } — the answer being split
  const [addingAfter, setAddingAfter] = useState(null)
  const [newQText, setNewQText]   = useState('')
  const leftPanelRef = useRef(null)

  const qCount   = segments.filter(s => s.type === 'question').length
  const infCount = segments.filter(s => s.type === 'inferred_question').length

  // Dismiss tooltip when clicking outside the tooltip portal or an answer textarea
  useEffect(() => {
    if (!tooltip) return
    function onDoc(e) {
      const portal = document.getElementById('tr-tooltip-portal')
      if (portal && portal.contains(e.target)) return   // click inside tooltip = keep it
      if (e.target.tagName === 'TEXTAREA') return        // click inside any textarea = let mouseUp re-set it
      setTooltip(null)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [tooltip])

  // ── Textarea mouseUp: cursor has landed, show floating "Add question" button ──
  function handleAnswerMouseUp(e, seg) {
    if (addingAfter?.segId === seg.id) return // already in add-mode for this answer
    const ta = e.currentTarget           // the textarea itself
    const charOffset = ta.selectionStart ?? null
    const x = Math.min(e.clientX, window.innerWidth - 240)
    const y = e.clientY - 50            // just above the cursor
    setTooltip({ segId: seg.id, charOffset, x, y })
  }

  // ── "Add question here" clicked in tooltip ──
  function startAddQuestion(e) {
    e.stopPropagation()
    if (!tooltip) return
    setAddingAfter({ segId: tooltip.segId, charOffset: tooltip.charOffset })
    setNewQText('')
    setTooltip(null)
  }

  // ── Commit: split answer + insert new question ──
  function addQuestion() {
    if (!addingAfter || newQText.trim().length < 3) return
    const { segId, charOffset } = addingAfter
    setSegments(segs => {
      const idx = segs.findIndex(s => s.id === segId)
      if (idx === -1) return segs
      const ans  = segs[idx]
      const full = ans.text
      const at   = (charOffset != null && charOffset > 0 && charOffset < full.length)
                    ? charOffset
                    : Math.floor(full.length / 2)
      const above = full.slice(0, at).trimEnd()
      const below = full.slice(at).trimStart()
      const t = Date.now()
      const parts = [
        ...(above ? [{ ...ans, text: above }] : []),
        { id: `seg-q-${t}`,   type: 'question', text: newQText.trim() },
        { id: `seg-a-${t+1}`, type: 'answer',   text: below },
      ]
      const next = [...segs]
      next.splice(idx, 1, ...parts)
      return next.filter(s => !(s.type === 'answer' && s.text.trim() === ''))
    })
    setNewQText('')
    setAddingAfter(null)
  }

  // ── Edit question text ──
  function startEdit(seg) {
    setEditingId(seg.id); setEditText(seg.text); setTooltip(null)
  }
  function saveEdit(id) {
    if (editText.trim().length < 3) return
    setSegments(segs => segs.map(s => s.id === id ? { ...s, text: editText.trim() } : s))
    setEditingId(null)
  }

  // ── Delete question → append its answer to previous answer ──
  function deleteQuestion(id) {
    setSegments(segs => {
      const idx = segs.findIndex(s => s.id === id)
      if (idx === -1) return segs
      const next = [...segs]
      const hasAnswer = next[idx+1]?.type === 'answer'
      if (hasAnswer) {
        let prevAnsIdx = -1
        for (let i = idx - 1; i >= 0; i--) {
          if (next[i].type === 'answer') { prevAnsIdx = i; break }
        }
        if (prevAnsIdx !== -1) {
          const appended = next[idx+1].text.trim()
          if (appended) next[prevAnsIdx] = { ...next[prevAnsIdx], text: next[prevAnsIdx].text + '\n\n' + appended }
        }
        next.splice(idx, 2)
      } else {
        next.splice(idx, 1)
      }
      return next
    })
  }

  function editAnswer(id, val) {
    setSegments(segs => segs.map(s => s.id === id ? { ...s, text: val } : s))
  }

  function addQuestionAtEnd() {
    if (newQText.trim().length < 3) return
    const t = Date.now()
    setSegments(segs => [
      ...segs,
      { id: `seg-q-${t}`,   type: 'question', text: newQText.trim() },
      { id: `seg-a-${t+1}`, type: 'answer',   text: '' },
    ])
    setNewQText(''); setAddingAfter(null)
  }

  const C = {
    q:  { color:'#7ee8a2', bg:'rgba(126,232,162,0.07)', border:'rgba(126,232,162,0.18)', label:'Q' },
    iq: { color:'#fbc26a', bg:'rgba(251,194,106,0.07)', border:'rgba(251,194,106,0.18)', label:'?' },
    a:  { color:'var(--text-muted)', bg:'transparent', border:'transparent', label:'A' },
  }
  function cFor(type) { return type === 'question' ? C.q : type === 'inferred_question' ? C.iq : C.a }

  return (
    <div style={{ display:'flex', gap:0, height:'calc(100vh - 52px)', overflow:'hidden',
      animation:'fadeUp 0.3s ease',
      marginLeft:'calc((min(1400px, 92vw) - 100vw + 56px) / 2)',
      marginRight:'calc((min(1400px, 92vw) - 100vw + 56px) / 2)',
      width:'calc(100vw - 56px)' }}>

      {/* ── Tooltip portal — fixed, outside scroll container ── */}
      {tooltip && (
        <div id="tr-tooltip-portal"
          style={{ position:'fixed', top:tooltip.y, left:tooltip.x, zIndex:1000,
            display:'flex', alignItems:'center', gap:6,
            background:'var(--surface)', border:'1px solid var(--accent)',
            borderRadius:8, padding:'5px 8px',
            boxShadow:'0 4px 20px rgba(0,0,0,0.4)',
            animation:'fadeUp 0.12s ease', pointerEvents:'all' }}>
          <button onMouseDown={startAddQuestion}
            style={{ background:'var(--accent)', border:'none', borderRadius:6, padding:'5px 12px',
              color:'#0a0a0f', fontFamily:'DM Mono', fontSize:12, fontWeight:'bold',
              cursor:'pointer', whiteSpace:'nowrap', display:'flex', alignItems:'center', gap:5 }}>
            <span>+</span> Add question here
          </button>
          <button onMouseDown={e => { e.stopPropagation(); setTooltip(null) }}
            style={{ background:'none', border:'none', color:'var(--text-muted)', cursor:'pointer',
              fontSize:16, lineHeight:1, padding:'2px 4px' }}>×</button>
        </div>
      )}

      {/* ── LEFT panel ── */}
      <div ref={leftPanelRef}
        style={{ flex:1, overflowY:'auto', padding:'28px 32px',
          borderRight:'1px solid var(--border)', position:'relative' }}>

        <div style={{ marginBottom:20 }}>
          <p style={{ fontSize:'var(--font-size-xs)', color:'var(--text-muted)', letterSpacing:'2px',
            textTransform:'uppercase', marginBottom:6, fontFamily:'DM Mono' }}>Transcript Review</p>
          <h2 style={{ fontFamily:'Montserrat', fontSize:24, fontWeight:700, color:'var(--text)', margin:0 }}>
            Review &amp; edit before analysis
          </h2>
          <p style={{ fontSize:'var(--font-size-xs)', color:'var(--text-muted)', marginTop:6, fontFamily:'DM Mono' }}>
            Click any answer to edit it or insert a question mid-answer
          </p>
        </div>

        {/* Legend */}
        <div style={{ display:'flex', gap:14, marginBottom:20, flexWrap:'wrap' }}>
          {[['Q','#7ee8a2','Identified question'],['?','#fbc26a','Inferred question'],['A','var(--text-muted)','Your answer']].map(([label,color,desc])=>(
            <div key={label} style={{ display:'flex', alignItems:'center', gap:6, fontSize:'var(--font-size-xs)', color:'var(--text-muted)' }}>
              <span style={{ width:20, height:20, borderRadius:4, background:`${color}25`,
                border:`1px solid ${color}`, display:'flex', alignItems:'center', justifyContent:'center',
                fontSize:11, color, fontWeight:'bold', flexShrink:0, fontFamily:'DM Mono' }}>{label}</span>
              {desc}
            </div>
          ))}
        </div>

        {classifying && <ClassifyingLoader />}

        {classifyError && (
          <div style={{ background:'rgba(255,143,143,0.05)', border:'1px solid rgba(255,143,143,0.2)',
            borderRadius:8, padding:'12px 16px', marginBottom:16, fontSize:'var(--font-size-sm)', color:'var(--danger)' }}>
            {classifyError} — <button onClick={onBack} style={{ background:'none', border:'none',
              color:'var(--accent)', cursor:'pointer', fontFamily:'DM Mono', fontSize:'var(--font-size-xs)' }}>Go back</button>
          </div>
        )}

        {!classifying && segments.map((seg) => {
          const c = cFor(seg.type)
          const isAnswer = seg.type === 'answer'
          const isAddingHere = addingAfter?.segId === seg.id
          return (
            <div key={seg.id}>
              {/* Inline add-question form (appears below this answer) */}
              {isAddingHere && (
                <div style={{ margin:'8px 0 12px', display:'flex', gap:8, alignItems:'flex-start',
                  background:'rgba(126,200,247,0.06)', border:'1px solid var(--accent)',
                  borderRadius:10, padding:'12px' }}>
                  <div style={{ flex:1 }}>
                    <p style={{ fontFamily:'DM Mono', fontSize:'var(--font-size-xs)',
                      color:'var(--accent)', marginBottom:6 }}>New question (will split answer at cursor)</p>
                    <textarea autoFocus value={newQText}
                      onChange={e => setNewQText(e.target.value)}
                      onKeyDown={e => { if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();addQuestion()} if(e.key==='Escape')setAddingAfter(null) }}
                      placeholder="Type the question… Enter to save, Esc to cancel"
                      style={{ width:'100%', background:'var(--surface2)', border:'1px solid var(--border)',
                        borderRadius:8, padding:'8px 12px', color:'var(--text)', fontFamily:'DM Mono',
                        fontSize:'var(--font-size-sm)', resize:'none', height:64, lineHeight:1.6 }}/>
                  </div>
                  <div style={{ display:'flex', flexDirection:'column', gap:6, paddingTop:22 }}>
                    <button onClick={addQuestion} disabled={newQText.trim().length < 3}
                      style={{ padding:'7px 14px', borderRadius:7, border:'none',
                        background:newQText.trim().length>=3?'var(--accent)':'var(--surface2)',
                        color:newQText.trim().length>=3?'#0a0a0f':'var(--text-muted)',
                        fontFamily:'DM Mono', fontSize:'var(--font-size-xs)',
                        cursor:newQText.trim().length>=3?'pointer':'not-allowed', fontWeight:'bold' }}>Save</button>
                    <button onClick={() => setAddingAfter(null)}
                      style={{ padding:'7px 14px', borderRadius:7, border:'1px solid var(--border)',
                        background:'transparent', color:'var(--text-muted)', fontFamily:'DM Mono',
                        fontSize:'var(--font-size-xs)', cursor:'pointer' }}>Cancel</button>
                  </div>
                </div>
              )}

              {/* Segment card */}
              <div
                style={{ marginBottom: isAnswer ? 14 : 4, padding:'10px 14px', borderRadius:10,
                  background: c.bg, border:`1px solid ${c.border}`, position:'relative',
                  cursor: isAnswer ? 'text' : 'default' }}>
                <div style={{ display:'flex', gap:10, alignItems:'flex-start' }}>
                  {/* Badge */}
                  <span style={{ flexShrink:0, width:22, height:22, borderRadius:5,
                    background:`${c.color}20`, border:`1px solid ${c.color}`,
                    display:'flex', alignItems:'center', justifyContent:'center',
                    fontSize:11, fontWeight:'bold', color:c.color, fontFamily:'DM Mono', marginTop:2 }}>
                    {c.label}
                  </span>

                  <div style={{ flex:1, minWidth:0 }}>
                    {editingId === seg.id ? (
                      <div style={{ display:'flex', gap:8, alignItems:'flex-start' }}>
                        <textarea autoFocus value={editText} onChange={e => setEditText(e.target.value)}
                          onKeyDown={e => { if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();saveEdit(seg.id)} if(e.key==='Escape')setEditingId(null) }}
                          style={{ flex:1, background:'var(--surface2)', border:'1px solid var(--accent)',
                            borderRadius:6, padding:'6px 10px', color:'var(--text)', fontFamily:'DM Mono',
                            fontSize:'var(--font-size-sm)', resize:'vertical', minHeight:60, lineHeight:1.6 }}/>
                        <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
                          <button onClick={() => saveEdit(seg.id)} disabled={editText.trim().length < 3}
                            style={{ padding:'5px 10px', borderRadius:6, border:'none', background:'var(--accent)',
                              color:'#0a0a0f', fontFamily:'DM Mono', fontSize:12, cursor:'pointer' }}>Save</button>
                          <button onClick={() => setEditingId(null)}
                            style={{ padding:'5px 10px', borderRadius:6, border:'1px solid var(--border)',
                              background:'transparent', color:'var(--text-muted)', fontFamily:'DM Mono',
                              fontSize:12, cursor:'pointer' }}>Cancel</button>
                        </div>
                      </div>
                    ) : isAnswer ? (
                      <textarea value={seg.text} onChange={e => editAnswer(seg.id, e.target.value)}
                        onMouseUp={e => handleAnswerMouseUp(e, seg)}
                        style={{ width:'100%', background:'transparent', border:'none', outline:'none',
                          color:'var(--text-body)', fontFamily:'Open Sans, sans-serif',
                          fontSize:'var(--font-size-base)', lineHeight:1.75, resize:'none',
                          cursor:'text', padding:0, minHeight:40,
                          height:`${Math.max(60, (Math.ceil(seg.text.length / 130) + seg.text.split('\n').length - 1) * 28)}px` }}/>
                    ) : (
                      <p style={{ fontSize:'var(--font-size-sm)', color:'var(--text)', lineHeight:1.65, margin:0 }}>
                        {seg.type === 'inferred_question' && (
                          <span style={{ fontSize:10, color:'#fbc26a', fontFamily:'DM Mono',
                            letterSpacing:'0.5px', marginRight:6, opacity:0.85 }}>INFERRED</span>
                        )}
                        {seg.text}
                      </p>
                    )}
                  </div>

                  {/* Q action buttons */}
                  {!isAnswer && editingId !== seg.id && (
                    <div style={{ display:'flex', gap:4, flexShrink:0 }}>
                      <button onMouseDown={e => { e.stopPropagation(); startEdit(seg) }}
                        style={{ padding:'4px 10px', borderRadius:6, border:'1px solid var(--border)',
                          background:'transparent', color:'var(--text-muted)', fontFamily:'DM Mono',
                          fontSize:12, cursor:'pointer' }}>Edit</button>
                      <button onMouseDown={e => { e.stopPropagation(); deleteQuestion(seg.id) }}
                        style={{ padding:'4px 10px', borderRadius:6, border:'1px solid rgba(255,143,143,0.25)',
                          background:'transparent', color:'var(--danger)', fontFamily:'DM Mono',
                          fontSize:12, cursor:'pointer' }}>Del</button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )
        })}

        {/* Add at end */}
        {!classifying && segments.length > 0 && addingAfter?.segId !== 'end' && (
          <div style={{ textAlign:'center', marginTop:10 }}>
            <button onMouseDown={() => { setAddingAfter({ segId:'end' }); setNewQText('') }}
              style={{ background:'none', border:'1px dashed var(--border)', borderRadius:6,
                padding:'5px 16px', color:'var(--text-muted)', fontSize:'var(--font-size-xs)',
                cursor:'pointer', fontFamily:'DM Mono' }}>
              + add question at end
            </button>
          </div>
        )}
        {addingAfter?.segId === 'end' && (
          <div style={{ marginTop:10, display:'flex', gap:8 }}>
            <textarea autoFocus value={newQText} onChange={e => setNewQText(e.target.value)}
              onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();addQuestionAtEnd()}if(e.key==='Escape')setAddingAfter(null)}}
              placeholder="Type question…"
              style={{ flex:1, background:'rgba(126,200,247,0.06)', border:'1px solid var(--accent)',
                borderRadius:8, padding:'8px 12px', color:'var(--text)', fontFamily:'DM Mono',
                fontSize:'var(--font-size-sm)', resize:'none', height:56 }}/>
            <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
              <button onClick={addQuestionAtEnd} disabled={newQText.trim().length<3}
                style={{ padding:'7px 12px', borderRadius:7, border:'none',
                  background:newQText.trim().length>=3?'var(--accent)':'var(--surface2)',
                  color:newQText.trim().length>=3?'#0a0a0f':'var(--text-muted)',
                  fontFamily:'DM Mono', fontSize:'var(--font-size-xs)', cursor:'pointer' }}>Add</button>
              <button onClick={()=>setAddingAfter(null)}
                style={{ padding:'7px 12px', borderRadius:7, border:'1px solid var(--border)',
                  background:'transparent', color:'var(--text-muted)', fontFamily:'DM Mono',
                  fontSize:'var(--font-size-xs)', cursor:'pointer' }}>Cancel</button>
            </div>
          </div>
        )}
      </div>

      {/* ── RIGHT panel ── */}
      <div style={{ width:260, flexShrink:0, padding:'28px 20px', display:'flex', flexDirection:'column', gap:16 }}>
        <div>
          <p style={{ fontSize:'var(--font-size-xs)', color:'var(--text-muted)', letterSpacing:'2px',
            textTransform:'uppercase', marginBottom:12, fontFamily:'DM Mono' }}>Summary</p>
          {[
            { label:'Questions found',   value:qCount,            color:'#7ee8a2' },
            { label:'Questions inferred', value:infCount,          color:'#fbc26a' },
            { label:'Total segments',    value:segments.length,   color:'var(--text-muted)' },
          ].map(({label,value,color})=>(
            <div key={label} style={{ display:'flex', justifyContent:'space-between', alignItems:'center',
              padding:'9px 12px', background:'var(--surface)', borderRadius:8, border:'1px solid var(--border)',
              marginBottom:6 }}>
              <span style={{ fontSize:'var(--font-size-xs)', color:'var(--text-muted)', fontFamily:'DM Mono' }}>{label}</span>
              <span style={{ fontSize:'var(--font-size-sm)', fontWeight:'bold', color, fontFamily:'DM Mono' }}>
                {classifying ? '–' : value}
              </span>
            </div>
          ))}
        </div>

        <div style={{ background:'rgba(126,200,247,0.06)', border:'1px solid rgba(126,200,247,0.15)',
          borderRadius:10, padding:14 }}>
          <p style={{ fontSize:'var(--font-size-xs)', color:'var(--accent)', letterSpacing:'1.5px',
            textTransform:'uppercase', marginBottom:8, fontFamily:'DM Mono' }}>How to edit</p>
          <ul style={{ margin:0, paddingLeft:16, fontSize:'var(--font-size-xs)', color:'var(--text-muted)',
            lineHeight:2.1, fontFamily:'DM Mono' }}>
            <li><strong style={{color:'var(--text)'}}>Click any answer</strong> → "Add question here" button appears near cursor</li>
            <li>Answers are directly editable — just type</li>
            <li>Edit / Del on question cards</li>
            <li>Del merges that answer to the previous one</li>
          </ul>
        </div>

        <div style={{
          marginTop: 24,
          position: 'sticky', bottom: 96,
          display: 'flex', flexDirection: 'column', gap: 8,
          background: 'var(--bg)',
          paddingTop: 12,
          borderTop: '1px solid var(--border)',
          zIndex: 10,
        }}>
          <button onClick={onContinue}
            disabled={classifying || segments.filter(s=>s.type!=='answer').length===0}
            style={{ width:'100%', padding:'13px', borderRadius:10, border:'none',
              background:(!classifying&&segments.filter(s=>s.type!=='answer').length>0)
                ?'linear-gradient(135deg,#1d4ed8,#2563eb)':'var(--surface2)',
              color:'#fff',
              fontFamily:'Montserrat', fontSize:'var(--font-size-sm)', fontWeight:700,
              cursor:(!classifying&&segments.filter(s=>s.type!=='answer').length>0)?'pointer':'not-allowed',
              opacity:(!classifying&&segments.filter(s=>s.type!=='answer').length>0)?1:0.45,
              boxShadow:(!classifying&&segments.filter(s=>s.type!=='answer').length>0)?'0 0 18px rgba(37,99,235,0.35)':'none',
              transition:'all 0.2s' }}>
            {classifying ? 'Classifying…' : 'Continue to Details →'}
          </button>
          <button onClick={onBack}
            style={{ width:'100%', padding:'10px', borderRadius:10, border:'1px solid var(--border)',
              background:'transparent', color:'var(--text-muted)', fontFamily:'DM Mono',
              fontSize:'var(--font-size-xs)', cursor:'pointer' }}>
            ← Back
          </button>
        </div>
      </div>
    </div>
  )
}

// ── PredictTeaser ─────────────────────────────────────────────────────────────
const PROB_TARGET = 72
const PROB_SLOW_AT = 65

function PredictTeaser() {
  const [displayProb, setDisplayProb] = useState(0)

  useEffect(() => {
    let raf
    // Phase 1: 0 → PROB_SLOW_AT in 1500ms (fast)
    // Phase 2: PROB_SLOW_AT → PROB_TARGET in 1000ms (slow)
    const phase1Duration = 1500
    const phase2Duration = 1000
    const startTime = performance.now()

    function tick(now) {
      const elapsed = now - startTime
      let val

      if (elapsed < phase1Duration) {
        // ease-out cubic for phase 1
        const t = elapsed / phase1Duration
        const eased = 1 - Math.pow(1 - t, 3)
        val = Math.round(eased * PROB_SLOW_AT)
      } else {
        const t = Math.min((elapsed - phase1Duration) / phase2Duration, 1)
        // ease-in-out for phase 2 (slower, more deliberate)
        const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2
        val = Math.round(PROB_SLOW_AT + eased * (PROB_TARGET - PROB_SLOW_AT))
      }

      setDisplayProb(val)
      if (elapsed < phase1Duration + phase2Duration) {
        raf = requestAnimationFrame(tick)
      } else {
        setDisplayProb(PROB_TARGET)
      }
    }

    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  const MOCK_QUESTIONS = [
    { type: 'PRODUCT SENSE',  prob: 'high',   q: 'Design a feature to improve retention for first-time users.' },
    { type: 'BEHAVIOURAL',    prob: 'high',   q: 'Tell me about a time you had to prioritise ruthlessly under pressure.' },
    { type: 'ESTIMATION',     prob: 'medium', q: 'How many Stripe payment links are created per day globally?' },
    { type: 'STRATEGY',       prob: 'medium', q: "How would you grow Stripe's share in the SMB segment?" },
    { type: 'METRIC',         prob: 'low',    q: 'What metrics would you use to measure success of a new checkout flow?' },
  ]

  // Streaming typewriter: each question streams over 1.5s, staggered 250ms apart
  const STREAM_DURATION = 1500
  const STAGGER = 250
  const [revealed, setRevealed] = useState(MOCK_QUESTIONS.map(() => 0))

  useEffect(() => {
    const rafIds = MOCK_QUESTIONS.map((q, qi) => {
      const delay = qi * STAGGER
      let id
      const startRef = { t: null }
      function tick(now) {
        if (startRef.t === null) startRef.t = now
        const elapsed = now - startRef.t - delay
        if (elapsed < 0) { id = requestAnimationFrame(tick); return }
        const pct = Math.min(elapsed / STREAM_DURATION, 1)
        const chars = Math.round(pct * q.q.length)
        setRevealed(prev => { const n = [...prev]; n[qi] = chars; return n })
        if (pct < 1) id = requestAnimationFrame(tick)
      }
      id = requestAnimationFrame(tick)
      return () => cancelAnimationFrame(id)
    })
    return () => rafIds.forEach(fn => fn())
  }, [])
  const MOCK_GAPS = [
    { risk: 'high',   gap: 'Enterprise go-to-market experience',   signal: 'CV shows consumer product focus only; JD requires 3+ yrs enterprise sales collaboration' },
    { risk: 'high',   gap: 'Technical depth for Stripe APIs',       signal: 'Payments infra role requires system design fluency — no eng background mentioned' },
    { risk: 'medium', gap: 'Cross-functional leadership at scale',  signal: 'JD asks for leading 10+ person XFN teams; examples in CV cap at ~4 stakeholders' },
    { risk: 'low',    gap: 'Regulatory & compliance awareness',     signal: 'Strong fintech signal from Razorpay; could strengthen PCI-DSS / AML familiarity' },
  ]

  // Count-up for callback probability — starts after gaps finish
  const MOCK_CB_WITHOUT = 72
  const MOCK_CB_WITH = 84
  const [cbCount, setCbCount] = useState(0)
  useEffect(() => {
    const CB_DELAY = MOCK_QUESTIONS.length * STAGGER + MOCK_GAPS.length * STAGGER + STREAM_DURATION
    let id
    const startRef = { t: null }
    function tick(now) {
      if (startRef.t === null) startRef.t = now
      const elapsed = now - startRef.t - CB_DELAY
      if (elapsed < 0) { id = requestAnimationFrame(tick); return }
      const pct = Math.min(elapsed / 900, 1)
      setCbCount(Math.round(pct * MOCK_CB_WITHOUT))
      if (pct < 1) id = requestAnimationFrame(tick)
    }
    id = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(id)
  }, [])

  // Typewriter for gap titles — stagger starts after all questions have begun
  const GAP_STAGGER_OFFSET = MOCK_QUESTIONS.length * STAGGER   // 5 * 250 = 1250ms head-start
  const [revealedGaps, setRevealedGaps] = useState(MOCK_GAPS.map(() => 0))
  useEffect(() => {
    const rafIds = MOCK_GAPS.map((g, gi) => {
      const delay = GAP_STAGGER_OFFSET + gi * STAGGER
      let id
      const startRef = { t: null }
      function tick(now) {
        if (startRef.t === null) startRef.t = now
        const elapsed = now - startRef.t - delay
        if (elapsed < 0) { id = requestAnimationFrame(tick); return }
        const pct = Math.min(elapsed / STREAM_DURATION, 1)
        const chars = Math.round(pct * g.gap.length)
        setRevealedGaps(prev => { const n = [...prev]; n[gi] = chars; return n })
        if (pct < 1) id = requestAnimationFrame(tick)
      }
      id = requestAnimationFrame(tick)
      return () => cancelAnimationFrame(id)
    })
    return () => rafIds.forEach(fn => fn())
  }, [])

  const probStyle = (p) => p === 'high'
    ? { color: '#3fb950', bg: 'rgba(63,185,80,0.12)', border: 'rgba(63,185,80,0.3)' }
    : p === 'medium'
    ? { color: '#d29922', bg: 'rgba(210,153,34,0.12)', border: 'rgba(210,153,34,0.3)' }
    : { color: 'var(--text-muted)', bg: 'var(--surface2)', border: 'var(--border)' }
  const riskStyle = (r) => r === 'high'
    ? { color: '#f85149', bg: 'rgba(248,81,73,0.1)', border: 'rgba(248,81,73,0.25)' }
    : r === 'medium'
    ? { color: '#d29922', bg: 'rgba(210,153,34,0.1)', border: 'rgba(210,153,34,0.25)' }
    : { color: '#58a6ff', bg: 'rgba(88,166,255,0.07)', border: 'rgba(88,166,255,0.2)' }

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 18, overflow: 'hidden', boxShadow: '0 8px 32px rgba(0,0,0,0.25)' }}>

      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg,rgba(88,166,255,0.1),rgba(63,185,80,0.07))', borderBottom: '1px solid var(--border)', padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <p style={{ fontSize: 9, color: 'var(--text-muted)', letterSpacing: '2px', textTransform: 'uppercase', fontFamily: 'DM Mono', marginBottom: 3 }}>Your report looks like this</p>
          <p style={{ fontSize: 16, color: 'var(--text)', fontFamily: 'Montserrat', fontWeight: 700, margin: 0 }}>Prediction Report</p>
        </div>
        <div style={{ background: 'rgba(88,166,255,0.12)', border: '1px solid rgba(88,166,255,0.3)', borderRadius: 20, padding: '4px 12px', fontSize: 10, color: 'var(--accent)', fontFamily: 'DM Mono', fontWeight: 'bold' }}>
          ⚡ ~1 min
        </div>
      </div>

      {/* Callback probability */}
      <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 16 }}>
        <div style={{ textAlign: 'center', flexShrink: 0 }}>
          <div style={{ fontSize: 28, fontWeight: 800, color: '#3fb950', fontFamily: 'DM Mono', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
            {cbCount}%
          </div>
          <div style={{ fontSize: 8, color: 'var(--text-muted)', fontFamily: 'DM Mono', marginTop: 2, letterSpacing: '0.8px', textTransform: 'uppercase' }}>without referral</div>
        </div>
        <div style={{ width: 1, height: 32, background: 'rgba(63,185,80,0.2)', flexShrink: 0 }} />
        <div style={{ textAlign: 'center', flexShrink: 0, opacity: cbCount >= MOCK_CB_WITHOUT ? 1 : 0, transition: 'opacity 0.5s ease' }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: '#3fb950', fontFamily: 'DM Mono', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
            {MOCK_CB_WITH}% <span style={{ fontSize: 11 }}>+{MOCK_CB_WITH - MOCK_CB_WITHOUT}</span>
          </div>
          <div style={{ fontSize: 8, color: 'var(--text-muted)', fontFamily: 'DM Mono', marginTop: 2, letterSpacing: '0.8px', textTransform: 'uppercase' }}>with referral</div>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: 'DM Mono', letterSpacing: '1px', textTransform: 'uppercase', margin: '0 0 3px' }}>Callback probability</p>
          <p style={{ fontSize: 10, color: 'var(--text-muted)', margin: 0, lineHeight: 1.5, fontFamily: 'Open Sans, sans-serif', opacity: cbCount >= MOCK_CB_WITHOUT ? 1 : 0, transition: 'opacity 0.5s ease' }}>
            Competitive fit — strong product signals, enterprise gap is the key risk.
          </p>
        </div>
      </div>

      {/* Predicted questions */}
      <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)' }}>
        <p style={{ fontSize: 9, color: 'var(--text-muted)', letterSpacing: '1.5px', textTransform: 'uppercase', fontFamily: 'DM Mono', marginBottom: 10 }}>Predicted questions</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          {MOCK_QUESTIONS.map((q, i) => {
            const ps = probStyle(q.prob)
            return (
              <div key={i} style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 9, padding: '9px 12px', display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 10px', alignItems: 'center' }}>
                <span style={{ fontSize: 9, fontFamily: 'DM Mono', fontWeight: 700, borderRadius: 8, padding: '2px 7px', background: ps.bg, color: ps.color, border: `1px solid ${ps.border}`, whiteSpace: 'nowrap', gridRow: '1 / 3', alignSelf: 'center' }}>{q.prob}</span>
                <span style={{ fontSize: 9, color: 'var(--accent)', fontFamily: 'DM Mono', letterSpacing: '0.5px' }}>{q.type}</span>
                <p style={{ fontSize: 11, color: 'var(--text)', fontFamily: 'Montserrat', fontWeight: 600, margin: 0, lineHeight: 1.45, minHeight: '1.45em' }}>
                  {q.q.slice(0, revealed[i])}
                  {revealed[i] < q.q.length && <span style={{ animation: 'blink 0.7s step-end infinite', borderRight: '2px solid var(--accent)', marginLeft: 1 }}/>}
                </p>
              </div>
            )
          })}
        </div>
      </div>

      {/* Gap analysis */}
      <div style={{ padding: '14px 18px' }}>
        <p style={{ fontSize: 9, color: 'var(--text-muted)', letterSpacing: '1.5px', textTransform: 'uppercase', fontFamily: 'DM Mono', marginBottom: 10 }}>Gap analysis</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          {MOCK_GAPS.map((g, i) => {
            const rs = riskStyle(g.risk)
            const gapDone = revealedGaps[i] >= g.gap.length
            return (
              <div key={i} style={{ border: `1px solid ${rs.border}`, borderRadius: 9, overflow: 'hidden' }}>
                <div style={{ background: rs.bg, padding: '7px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 9, fontFamily: 'DM Mono', fontWeight: 700, color: rs.color, textTransform: 'uppercase', letterSpacing: '0.5px', flexShrink: 0 }}>{g.risk} risk</span>
                  <span style={{ fontSize: 11, color: 'var(--text)', fontFamily: 'Montserrat', fontWeight: 600, minHeight: '1.4em' }}>
                    {g.gap.slice(0, revealedGaps[i])}
                    {!gapDone && <span style={{ animation: 'blink 0.7s step-end infinite', borderRight: '2px solid ' + rs.color, marginLeft: 1 }}/>}
                  </span>
                </div>
                <div style={{ padding: '6px 12px', background: 'var(--surface2)', transition: 'opacity 0.4s ease', opacity: gapDone ? 1 : 0 }}>
                  <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'Open Sans, sans-serif', fontStyle: 'italic' }}>{g.signal}</span>
                </div>
              </div>
            )
          })}
        </div>
        <div style={{ marginTop: 10, padding: '8px 12px', background: 'rgba(88,166,255,0.05)', border: '1px solid rgba(88,166,255,0.15)', borderRadius: 8 }}>
          <p style={{ fontSize: 9, color: 'var(--accent)', fontFamily: 'DM Mono', letterSpacing: '1px', textTransform: 'uppercase', margin: '0 0 3px' }}>Also included</p>
          <p style={{ fontSize: 10, color: 'var(--text-muted)', margin: 0, lineHeight: 1.6 }}>CV improvement tips · Interview prep advice · PDF download · "Was this asked?" tracking</p>
        </div>
      </div>
    </div>
  )
}

// ── PredictPanel ──────────────────────────────────────────────────────────────
function PredictPanel() {
  const router = useRouter()
  const [company, setCompany] = useState('')
  const [roleLevel, setRoleLevel] = useState('PM')
  const [roundType, setRoundType] = useState('loop')
  const [jdText, setJdText] = useState('')
  const [cvText, setCvText] = useState('')
  const [error, setError] = useState('')

  // Auto-load CV from profile on mount
  useEffect(() => {
    fetch('/api/profile')
      .then(r => r.json())
      .then(d => { if (d.cv_text) setCvText(d.cv_text) })
      .catch(() => {})
  }, [])

  const jdLen = jdText.trim().length
  const cvWords = cvText.trim() ? cvText.trim().split(/\s+/).length : 0
  const jdTooShort = jdLen < 50
  const cvTooLong = cvWords > 1000

  function handleSubmit() {
    if (!company.trim() || !roleLevel.trim() || !roundType.trim()) {
      setError('Company, role level and round type are required.')
      return
    }
    if (jdTooShort) { setError('Job description must be at least 50 characters.'); return }
    if (cvTooLong) { setError(`CV is too long — remove ${cvWords - 1000} words (${cvWords}/1000).`); return }
    sessionStorage.setItem('predict-params', JSON.stringify({ company, roleLevel, roundType, jdText, cvText }))
    router.push('/predict/loading')
  }

  const pInput = {
    background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8,
    padding: '10px 12px', color: 'var(--text)', fontSize: 14, fontFamily: 'Open Sans, sans-serif',
    width: '100%', boxSizing: 'border-box', outline: 'none',
  }
  const pLabel = {
    fontSize: 12, color: 'var(--text)', letterSpacing: '1px', fontWeight: 600,
    textTransform: 'uppercase', display: 'block', marginBottom: 6, fontFamily: 'DM Mono',
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32, alignItems: 'stretch', animation: 'fadeUp 0.3s ease' }}>

      {/* LEFT — form card */}
      <div className="transcript-glow" style={{ background: 'var(--surface)', border: '1px solid rgba(99,179,237,0.35)', borderRadius: 16, overflow: 'hidden', display: 'flex', flexDirection: 'column', transform: 'translateY(-1px)' }}>

        {/* Header */}
        <div style={{ background: 'linear-gradient(135deg,rgba(88,166,255,0.08),rgba(63,185,80,0.06))', borderBottom: '1px solid var(--border)', padding: '18px 24px' }}>
          <p style={{ fontSize: 11, color: 'var(--accent)', letterSpacing: '2px', textTransform: 'uppercase', fontFamily: 'DM Mono', marginBottom: 6, fontWeight: 700 }}>Interview Predictor</p>
          <p style={{ fontSize: 18, color: 'var(--text)', fontFamily: 'Montserrat', fontWeight: 700, margin: 0 }}>
            Know what's coming before you walk in.
          </p>
        </div>

        {/* Form */}
        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', flex: 1 }}>

          {/* Row 1: Company / Role / Round */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 16 }}>
            <div>
              <label style={pLabel}>Company *</label>
              <input value={company} onChange={e => setCompany(e.target.value)} placeholder="e.g. Stripe" style={pInput} />
            </div>
            <div>
              <label style={pLabel}>Role level *</label>
              <select value={roleLevel} onChange={e => setRoleLevel(e.target.value)} style={pInput}>
                <option value="APM">APM</option>
                <option value="PM">PM</option>
                <option value="Senior PM">Senior PM</option>
                <option value="Staff PM">Staff PM</option>
                <option value="Principal PM">Principal PM</option>
                <option value="Director of PM">Director of PM</option>
                <option value="VP of Product">VP of Product</option>
                <option value="CPO">CPO</option>
              </select>
            </div>
            <div>
              <label style={pLabel}>Round type *</label>
              <select value={roundType} onChange={e => setRoundType(e.target.value)} style={pInput}>
                <option value="screening">Phone Screening</option>
                <option value="loop">Full Loop</option>
                <option value="panel">Panel</option>
                <option value="final">Final Round</option>
                <option value="take-home">Take-Home</option>
                <option value="other">Other</option>
              </select>
            </div>
          </div>

          {/* Equal-height pair — grid rows guarantee both get identical height */}
          <div style={{ flex: 1, display: 'grid', gridTemplateRows: '1fr 1fr', gap: 14, marginBottom: 10, minHeight: 0 }}>

            {/* JD text */}
            <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
                <label style={{ ...pLabel, margin:0 }}>Job description (paste text) <span style={{ color:'var(--danger)', fontWeight:400 }}>*</span></label>
                <span style={{ fontSize:11, fontFamily:'DM Mono', color: jdTooShort ? 'var(--danger)' : 'var(--success)' }}>
                  {jdLen} / 50 min chars{jdLen >= 50 ? ' ✓' : ''}
                </span>
              </div>
              <textarea value={jdText} onChange={e => setJdText(e.target.value)}
                placeholder="Paste the JD here — the more detail, the sharper the prediction."
                style={{ ...pInput, resize: 'none', lineHeight: 1.6, flex: 1, minHeight: 0,
                  borderColor: jdTooShort && jdLen > 0 ? 'var(--danger)' : undefined }} />
            </div>

            {/* CV text */}
            <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
                <label style={{ ...pLabel, margin: 0 }}>Your CV / résumé</label>
                <span style={{ fontSize:11, fontFamily:'DM Mono', color: cvTooLong ? 'var(--danger)' : cvWords > 0 ? 'var(--success)' : 'var(--text-muted)' }}>
                  {cvWords} / 1000 words{cvTooLong ? ' — too long' : cvWords > 0 ? ' ✓' : ''}
                </span>
              </div>
              <textarea value={cvText} onChange={e => setCvText(e.target.value)}
                placeholder="Paste your CV text — used to surface gaps between your background and the role."
                style={{ ...pInput, resize: 'none', lineHeight: 1.6, flex: 1, minHeight: 0,
                  borderColor: cvTooLong ? 'var(--danger)' : undefined }} />
            </div>

          </div>

          {/* File drop — fixed height, outside the growing area so it doesn't steal from textareas */}
          <div style={{ marginBottom: 10 }}>
            <FileDropZone onText={text => setCvText(text)} label="or drop CV / PDF / DOCX here" />
          </div>

          {error && (
            <p role="alert" style={{ padding: '10px 14px', background: 'rgba(248,81,73,0.06)', border: '1px solid rgba(248,81,73,0.2)', borderRadius: 8, fontSize: 13, color: 'var(--danger)', marginBottom: 14 }}>
              ⚠ {error}
            </p>
          )}
          <button onClick={handleSubmit}
            style={{
              width: '100%', padding: '15px 20px',
              background: 'linear-gradient(135deg, #1d4ed8 0%, #2563eb 50%, #3b82f6 100%)',
              border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: 12,
              color: '#ffffff',
              fontSize: 15, fontFamily: 'DM Mono', fontWeight: 800,
              letterSpacing: '0.3px',
              cursor: 'pointer',
              boxShadow: '0 4px 24px rgba(37,99,235,0.5), 0 1px 0 rgba(255,255,255,0.15) inset',
              transition: 'transform 0.12s ease, box-shadow 0.12s ease',
              textShadow: '0 1px 2px rgba(0,0,0,0.3)',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.transform = 'translateY(-1px)'
              e.currentTarget.style.boxShadow = '0 8px 32px rgba(37,99,235,0.65), 0 1px 0 rgba(255,255,255,0.15) inset'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.transform = 'translateY(0)'
              e.currentTarget.style.boxShadow = '0 4px 24px rgba(37,99,235,0.5), 0 1px 0 rgba(255,255,255,0.15) inset'
            }}
            onMouseDown={e => { e.currentTarget.style.transform = 'translateY(1px)' }}
            onMouseUp={e => { e.currentTarget.style.transform = 'translateY(-1px)' }}
          >
            ✦ Predict my questions + callback probability →
          </button>
        </div>
      </div>

      {/* RIGHT — prediction report teaser */}
      <PredictTeaser />

    </div>
  )
}

function AuthGate({ onClose }) {
  return (
    <div style={{
      position:'fixed', inset:0, zIndex:1000,
      display:'flex', alignItems:'center', justifyContent:'center',
      backdropFilter:'blur(12px)', WebkitBackdropFilter:'blur(12px)',
      background:'rgba(10,10,15,0.65)',
      animation:'fadeUp 0.25s ease',
    }}>
      <div style={{
        background:'var(--surface)', border:'1px solid var(--border)',
        borderRadius:18, padding:'36px 40px', maxWidth:420, width:'90%',
        textAlign:'center', boxShadow:'0 24px 80px rgba(0,0,0,0.5)',
      }}>
        <div style={{ fontSize:36, marginBottom:12 }}>🔒</div>
        <h2 style={{ fontFamily:'Montserrat', fontSize:20, fontWeight:700,
          color:'var(--text)', marginBottom:8 }}>
          Your report is ready
        </h2>
        <p style={{ fontFamily:'DM Mono', fontSize:13, color:'var(--text-muted)',
          lineHeight:1.7, marginBottom:24 }}>
          Sign in to unlock and secure your report. It will be saved to your
          account automatically.
        </p>
        <a
          href="/sign-in"
          onClick={() => {
            // Both ic_pending_report and ic_pending_interview_id are already
            // written by analyze() — nothing to do here.
          }}
          style={{
            display:'block', width:'100%', boxSizing:'border-box',
            padding:'12px 24px', borderRadius:10,
            background:'linear-gradient(135deg,#1d4ed8,#2563eb)',
            color:'#fff', fontFamily:'DM Mono', fontSize:14, fontWeight:700,
            textDecoration:'none', marginBottom:10, transition:'opacity 0.15s',
          }}
          onMouseEnter={e => e.currentTarget.style.opacity = '0.85'}
          onMouseLeave={e => e.currentTarget.style.opacity = '1'}>
          Sign in / Sign up with Google
        </a>
        <button onClick={onClose} style={{
          background:'none', border:'none', color:'var(--text-muted)',
          fontFamily:'DM Mono', fontSize:12, cursor:'pointer', padding:'4px 8px',
        }}>
          Maybe later
        </button>
      </div>
    </div>
  )
}

export default function Home() {
  const [stage, setStage] = useState('record')
  const [homeMode, setHomeMode] = useState('predict')
  const [authPrompt, setAuthPrompt] = useState(false)
  const { theme } = useTheme()
  const isLight = theme === 'light'
  const { isSignedIn } = useAuth()
  const isSignedInRef = useRef(false)
  useEffect(() => { isSignedInRef.current = !!isSignedIn }, [isSignedIn])

  // Restore report on mount — fires immediately after OAuth redirect returns to /
  // Keep sessionStorage intact so onClose can also read it if analysis state was lost
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('ic_pending_report')
      if (!raw) return
      const saved = JSON.parse(raw)
      if (!saved?.analysis) return
      // Clear immediately so navigating back to home doesn't re-trigger this
      sessionStorage.removeItem('ic_pending_report')
      setAnalysis(saved.analysis)
      setInterviewId(saved.interviewId)
      setSubmittedMetadata(saved.metadata)
      setFailedQuestions(saved.failedQuestions || [])
      setStage('report')
      setHomeMode('analyse')
      setTimeout(() => { setReportReady(true); setReportComplete(true) }, 200)
    } catch(_) {}
  }, []) // mount only — runs before isSignedIn even resolves

  // Once signed in, associate the interview with the user account
  useEffect(() => {
    if (!isSignedIn) return
    try {
      const id = sessionStorage.getItem('ic_pending_interview_id')
      if (!id) return
      sessionStorage.removeItem('ic_pending_interview_id')
      fetch('/api/save-interview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ interviewId: id }),
      }).catch(() => {})
    } catch(_) {}
  }, [isSignedIn])

  // Expose stage to BugReportButton via window
  useEffect(() => { if (typeof window !== 'undefined') window.__appStage = stage }, [stage])
  const [inputMode, setInputMode] = useState('paste')
  // recState: 'idle' | 'recording' | 'paused'
  const [recState, setRecState] = useState('idle')
  const [recTime, setRecTime] = useState(0)
  const [procStep, setProcStep] = useState('')
  const [analysis, setAnalysis] = useState(null)
  const [submittedMetadata, setSubmittedMetadata] = useState(null)
  const [transcript, setTranscript] = useState('')
  const [pasted, setPasted] = useState('')
  const [error, setError] = useState('')
  const [audioBlob, setAudioBlob] = useState(null)
  const [interviewId, setInterviewId] = useState(null)
  const [fetchingUrl, setFetchingUrl] = useState(false)
  const [showCVOverride, setShowCVOverride] = useState(false)
  const [jobInputMode, setJobInputMode] = useState('paste')
  const [segments, setSegments] = useState([])
  const [classifying, setClassifying] = useState(false)
  const [classifyError, setClassifyError] = useState('')
  const [reportReady, setReportReady] = useState(false)
  const [reportComplete, setReportComplete] = useState(false)
  const [showCompletionToast, setShowCompletionToast] = useState(false)
  const [failedQuestions, setFailedQuestions] = useState([])
  const countdownTimerRef = useRef(null)
  const reportRef = useRef(null)

  const [meta, setMeta] = useState({
    company:'', role:'', location:'', experienceYears:'2-5', roundType:'',
    salaryMin:'', salaryMax:'', salaryCurrency:'USD',
    jobDescription:'', jobUrl:'', cvText:'', portfolioText:'',
  })

  // Refs — avoid stale closures in callbacks
  const mediaRef = useRef(null)
  const streamRef = useRef(null)
  const chunksRef = useRef([])
  const recStateRef = useRef('idle')
  const timerRef = useRef(null)
  const fileRef = useRef(null)

  // Timer ticks only when actively recording
  useEffect(() => {
    if (recState === 'recording') {
      timerRef.current = setInterval(() => setRecTime(t => t+1), 1000)
    } else {
      clearInterval(timerRef.current)
    }
    return () => clearInterval(timerRef.current)
  }, [recState])

  const fmtTime = s => `${Math.floor(s/60).toString().padStart(2,'0')}:${(s%60).toString().padStart(2,'0')}`
  const setM = (k,v) => setMeta(m=>({...m,[k]:v}))

  // ── Recording controls ────────────────────────────────────────────────────
  const startRec = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      chunksRef.current = []

      // Pick a supported MIME type
      const mimeType = ['audio/webm;codecs=opus','audio/webm','audio/ogg'].find(t => MediaRecorder.isTypeSupported(t)) || ''
      const mr = new MediaRecorder(stream, mimeType ? { mimeType } : {})
      mediaRef.current = mr

      mr.ondataavailable = e => { if (e.data && e.data.size > 0) chunksRef.current.push(e.data) }
      mr.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType || 'audio/webm' })
        setAudioBlob(blob)
        streamRef.current?.getTracks().forEach(t => t.stop())
        streamRef.current = null
      }

      mr.start(250) // collect chunks every 250ms
      recStateRef.current = 'recording'
      setRecState('recording')
      setRecTime(0)
      setError('')
    } catch(e) {
      setError('Microphone access denied. Allow mic access in your browser settings.')
    }
  }

  const stopRec = useCallback(() => {
    const mr = mediaRef.current
    if (!mr) return
    // MediaRecorder must not be in 'paused' state when calling stop()
    if (mr.state === 'paused') {
      mr.resume()
    }
    if (mr.state === 'recording' || mr.state === 'paused') {
      mr.stop()
    }
    recStateRef.current = 'idle'
    setRecState('idle')
  }, [])

  const pauseRec = useCallback(() => {
    const mr = mediaRef.current
    if (!mr || mr.state !== 'recording') return
    mr.pause()
    recStateRef.current = 'paused'
    setRecState('paused')
  }, [])

  const resumeRec = useCallback(() => {
    const mr = mediaRef.current
    if (!mr || mr.state !== 'paused') return
    mr.resume()
    recStateRef.current = 'recording'
    setRecState('recording')
  }, [])

  const discardRec = () => {
    stopRec()
    setAudioBlob(null)
    setRecTime(0)
    chunksRef.current = []
    setInputMode('paste')
  }

  const goTranscript = async (blob=null) => {
    if (blob)     setError('')

    // For audio: transcribe first, then classify
    if (blob) {
      setClassifying(true)
      setStage('transcript')
      setClassifyError('')
      try {
        const fd = new FormData(); fd.append('audio', blob, 'recording.webm')
        const r = await fetch('/api/transcribe', { method:'POST', body:fd })
        const d = await r.json()
        if (d.error) throw new Error(d.error)
        const rawText = d.transcript
        setPasted(rawText)
        const cr = await fetch('/api/classify-transcript', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ transcript: rawText }) })
        const cd = await cr.json()
        if (cd.error) throw new Error(cd.error)
        setSegments(cd.segments)
      } catch(e) {
        setClassifyError(e.message)
      } finally {
        setClassifying(false)
      }
    } else {
      // For paste: classify immediately then show
      setClassifying(true)
      setStage('transcript')
      setClassifyError('')
      try {
        const cr = await fetch('/api/classify-transcript', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ transcript: pasted }) })
        const cd = await cr.json()
        if (cd.error) throw new Error(cd.error)
        setSegments(cd.segments)
      } catch(e) {
        setClassifyError(e.message)
      } finally {
        setClassifying(false)
      }
    }
  }

  // kept for back-compat
  const goDetails = (blob=null) => {
    goTranscript(blob)
  }

  const fetchJobUrl = async () => {
    if (!meta.jobUrl.trim()) return
    setFetchingUrl(true)
    try {
      const res = await fetch('/api/fetch-url',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:meta.jobUrl})})
      const d = await res.json()
      if (d.error) throw new Error(d.error)
      setM('jobDescription', d.text)
      setJobInputMode('paste')
    } catch(e) { setError(`Couldn't fetch URL: ${e.message}`) }
    finally { setFetchingUrl(false) }
  }

  const analyze = async () => {
    if (!meta.company||!meta.role||!meta.experienceYears) { setError('Company, role, and experience are required'); return }
    setError('')
    setReportReady(false)
    setReportComplete(false)
    setShowCompletionToast(false)
    setAnalysis(null)
    setStage('countdown')
    try { sessionStorage.removeItem('ic_pending_report') } catch(_) {}

    const metadata = {
      company:meta.company, role:meta.role, location:meta.location, experienceYears:meta.experienceYears, roundType:meta.roundType||'unknown',
      salaryMin:meta.salaryMin?parseInt(meta.salaryMin):null,
      salaryMax:meta.salaryMax?parseInt(meta.salaryMax):null,
      salaryCurrency:meta.salaryCurrency,
      jobDescription:meta.jobDescription, jobUrl:meta.jobUrl,
      cvText:meta.cvText, portfolioText:meta.portfolioText,
    }
    try {
      // Reconstruct transcript from reviewed segments if available
      let finalTranscript = segments.length > 0
        ? segments.map(s => {
            if (s.type === 'question') return `Interviewer: ${s.text}`
            if (s.type === 'inferred_question') return `Interviewer: ${s.text}`
            return `Me: ${s.text}`
          }).join('\n\n')
        : pasted
      setTranscript(finalTranscript)
      const r = await fetch('/api/analyze',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
        transcript: finalTranscript,
        segments: segments.length > 0 ? segments : undefined,
        metadata,
      })})
      const d = await r.json()
      if (d.error) throw new Error(d.error)

      setAnalysis(d.analysis); setInterviewId(d.interviewId); setSubmittedMetadata(metadata)
      setFailedQuestions(d.failedQuestions || [])
      // Persist to sessionStorage so report survives the OAuth redirect.
      // Exclude transcript — it can be very large and cause QuotaExceededError.
      try {
        sessionStorage.setItem('ic_pending_report', JSON.stringify({
          analysis: d.analysis,
          interviewId: d.interviewId,
          metadata,
          failedQuestions: d.failedQuestions || [],
        }))
        // Also stash interviewId separately here — not in AuthGate onClick,
        // because the click handler may not fire reliably on mobile/fast taps.
        sessionStorage.setItem('ic_pending_interview_id', d.interviewId || '')
      } catch(_) {}

      // Ensure we're on the report screen (cancels countdown timer if still running)
      clearTimeout(countdownTimerRef.current)
      setStage('report')

      // Small pause then trigger staggered section reveals.
      // Always mark complete once the API returns — report is done regardless of
      // per-answer failures (those show their own warning). Never stay on "Completing…".
      setTimeout(() => {
        setReportReady(true)
        setReportComplete(true)
        if (!isSignedInRef.current) {
          setTimeout(() => setAuthPrompt(true), 1500)
        } else if (d.allAnswersComplete) {
          setTimeout(() => setShowCompletionToast(true), 2000)
        }
      }, 200)
    } catch(e) {
      clearTimeout(countdownTimerRef.current)
      setError(`${e.message} — Your transcript is safe, just hit "Analyze Interview" again.`); setStage('details')
    }
  }

  const reset = () => {
    clearTimeout(countdownTimerRef.current)
    setStage('record'); setAnalysis(null); setAudioBlob(null)
    setRecTime(0); setPasted(''); setInputMode('paste'); setInterviewId(null); setError('')
    setRecState('idle'); setSegments([]); setClassifyError('')
    setReportReady(false); setReportComplete(false); setShowCompletionToast(false); setFailedQuestions([])
    setTooltip(null); setAddingAfter(null); setNewQText('')
    setMeta({company:'',role:'',location:'',experienceYears:'2-5',roundType:'',salaryMin:'',salaryMax:'',salaryCurrency:'USD',jobDescription:'',jobUrl:'',cvText:'',portfolioText:''})
  }

function computeCallbackProb(analysis, metadata) {
  if (!analysis) return { withReferral: null, withoutReferral: null }
  const sc = analysis.overallScore || 5
  let base = Math.round(10 + (sc / 10) * 65)
  const hasJD = !!(metadata?.jobDescription?.trim())
  const hasCV = !!(metadata?.cvText?.trim())
  if (hasJD) base += 5
  if (hasCV) base += 3
  const readiness = analysis.interviewReadiness || ''
  if (readiness === 'Strong candidate') base += 8
  else if (readiness === 'Ready') base += 4
  else if (readiness === 'Almost there') base += 0
  else base -= 5
  const withoutReferral = Math.min(Math.max(base, 1), 85)
  const withReferral    = Math.min(withoutReferral + Math.round((1 - withoutReferral / 100) * 28), 95)
  return { withReferral, withoutReferral }
}

  const downloadPDF = () => {
    if (!analysis) return
    const company  = submittedMetadata?.company || 'Interview'
    const role     = submittedMetadata?.role    || 'Report'
    const date     = new Date().toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' })

    const esc = (s='') => String(s)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')

    const scoreColor = (n) => n >= 8 ? '#16a34a' : n >= 6 ? '#d97706' : '#dc2626'

    const { withReferral: cbWith, withoutReferral: cbWithout } = computeCallbackProb(analysis, submittedMetadata)
    const cbDiff = cbWith - cbWithout
    const cbCol = cbWith >= 65 ? '#16a34a' : cbWith >= 40 ? '#d97706' : '#dc2626'

    const answersHtml = (analysis.answers || []).map((a, i) => `
      <div class="answer-card">
        <div class="answer-header">
          <span class="score" style="color:${scoreColor(a.score)}">${a.score}/10</span>
          <span class="q-type">${esc(a.questionType)}</span>
          <span class="q-text">${esc(a.question)}</span>
        </div>
        <p class="your-answer"><em>Your answer:</em> ${esc(a.yourAnswer)}</p>
        <div class="two-col">
          <div class="worked">
            <div class="label green">✓ Worked</div>
            <p>${esc(a.whatWorked)}</p>
          </div>
          <div class="missed">
            <div class="label red">✗ Missed</div>
            <p>${esc(a.whatMissed)}</p>
          </div>
        </div>
        ${a.cvOpportunity ? `<p class="cv-note"><strong>CV opportunity:</strong> ${esc(a.cvOpportunity)}</p>` : ''}
        ${a.jdRelevance   ? `<p class="jd-note"><strong>JD relevance:</strong>  ${esc(a.jdRelevance)}</p>`   : ''}
        ${a.principleViolations?.length ? `<p class="violations"><strong>Principle violations:</strong> ${a.principleViolations.map(esc).join(' · ')}</p>` : ''}
        ${Object.keys(a.pmSignals||{}).length ? `
          <div class="signals">
            <div class="label">PM Signals</div>
            ${Object.entries(a.pmSignals).map(([k,v])=>`
              <div class="signal-row">
                <span class="signal-name">${esc(k)}</span>
                <span class="signal-bar"><span style="width:${(v/5)*100}%;background:${scoreColor(v*2)}"></span></span>
                <span class="signal-val">${v}/5</span>
              </div>`).join('')}
          </div>` : ''}
        ${a.rewrittenAnswer ? `
          <div class="rewrite">
            <div class="label blue">✦ Rewritten answer</div>
            <p>${esc(a.rewrittenAnswer).replace(/\n\n/g,'</p><p>').replace(/\*\*(.*?)\*\*/g,'<strong>$1</strong>')}</p>
          </div>` : ''}
      </div>`).join('')

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${esc(company)} · ${esc(role)} · Interview Report</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Georgia, serif; font-size: 13px; color: #111; background: #fff; padding: 32px 40px; max-width: 860px; margin: 0 auto; }
  h1 { font-size: 22px; font-weight: bold; margin-bottom: 4px; }
  h2 { font-size: 15px; font-weight: bold; margin: 24px 0 8px; border-bottom: 2px solid #111; padding-bottom: 4px; }
  h3 { font-size: 13px; font-weight: bold; margin: 0 0 6px; }
  p  { margin: 4px 0; line-height: 1.6; }
  .meta    { color: #555; font-size: 12px; margin-bottom: 24px; }
  .summary { background: #f9f9f9; border-left: 4px solid #555; padding: 12px 16px; margin: 0 0 20px; font-style: italic; line-height: 1.7; }
  .score-big { font-size: 40px; font-weight: bold; }
  .readiness { display: inline-block; border: 1px solid #333; padding: 2px 10px; font-size: 11px; font-variant: small-caps; margin-left: 12px; vertical-align: middle; }
  .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin: 10px 0; }
  .label      { font-size: 10px; font-weight: bold; letter-spacing: 1px; text-transform: uppercase; margin-bottom: 4px; }
  .label.green { color: #16a34a; }
  .label.red   { color: #dc2626; }
  .label.blue  { color: #1d4ed8; }
  .list-items  { margin: 0 0 16px 0; padding: 0; }
  .list-items li { list-style: none; padding: 3px 0 3px 16px; border-left: 2px solid #ccc; margin-bottom: 4px; line-height: 1.5; }
  .priority { background: #fffbeb; border: 1px solid #d97706; padding: 10px 14px; margin: 0 0 16px; }
  .pattern  { background: #f5f3ff; border: 1px solid #7c3aed; padding: 10px 14px; margin: 0 0 16px; }
  .answer-card { border: 1px solid #ddd; padding: 14px 16px; margin: 0 0 14px; page-break-inside: avoid; }
  .answer-header { display: flex; align-items: baseline; gap: 10px; margin-bottom: 8px; }
  .score    { font-size: 20px; font-weight: bold; font-family: monospace; min-width: 42px; }
  .q-type   { font-size: 10px; font-weight: bold; letter-spacing: 1px; background: #eee; padding: 2px 7px; text-transform: uppercase; }
  .q-text   { font-weight: bold; font-size: 13px; }
  .your-answer { color: #555; margin-bottom: 8px; }
  .worked   { background: #f0fdf4; border: 1px solid #86efac; padding: 8px 10px; }
  .missed   { background: #fff1f2; border: 1px solid #fca5a5; padding: 8px 10px; }
  .cv-note  { margin-top: 6px; font-size: 12px; color: #374151; }
  .jd-note  { margin-top: 4px; font-size: 12px; color: #374151; }
  .violations { margin-top: 6px; font-size: 12px; color: #7c3aed; }
  .signals  { margin-top: 10px; }
  .signal-row { display: flex; align-items: center; gap: 8px; margin: 3px 0; font-size: 11px; }
  .signal-name { width: 160px; flex-shrink: 0; }
  .signal-bar  { flex: 1; height: 6px; background: #e5e7eb; border-radius: 3px; overflow: hidden; }
  .signal-bar span { display: block; height: 100%; border-radius: 3px; }
  .signal-val  { width: 28px; text-align: right; font-weight: bold; }
  .rewrite { margin-top: 12px; background: #eff6ff; border: 1px solid #93c5fd; padding: 10px 14px; }
  .practice li { margin-bottom: 4px; }
  @media print {
    body { padding: 0; }
    .answer-card { page-break-inside: avoid; }
  }
</style>
</head>
<body>
  <h1>${esc(company)} · ${esc(role)}</h1>
  <p class="meta">Interview Report · ${date}${submittedMetadata?.location ? ' · ' + esc(submittedMetadata.location) : ''}${submittedMetadata?.roundType && submittedMetadata.roundType !== 'unknown' ? ' · ' + esc(submittedMetadata.roundType) : ''}</p>

  <div class="summary">${esc(analysis.overallSummary)}</div>

  <div style="margin-bottom:20px">
    <span class="score-big" style="color:${scoreColor(analysis.overallScore)}">${analysis.overallScore}/10</span>
    <span class="readiness">${esc(analysis.interviewReadiness)}</span>
  </div>

  <div class="two-col" style="margin-bottom:20px">
    <div>
      <h3 style="color:#16a34a">✓ Strengths</h3>
      <ul class="list-items">${(analysis.topStrengths||[]).map(s=>`<li>${esc(s)}</li>`).join('')}</ul>
    </div>
    <div>
      <h3 style="color:#dc2626">✗ Critical Gaps</h3>
      <ul class="list-items">${(analysis.criticalGaps||[]).map(g=>`<li>${esc(g)}</li>`).join('')}</ul>
    </div>
  </div>

  ${analysis.topPriorityFix ? `<div class="priority"><strong>#1 Fix:</strong> ${esc(analysis.topPriorityFix)}</div>` : ''}
  ${analysis.recurringPattern ? `<div class="pattern"><strong>Pattern:</strong> ${esc(analysis.recurringPattern)}</div>` : ''}

  <h2>Answer Breakdown</h2>
  ${answersHtml}

  ${(analysis.practiceplan||[]).length ? `
  <h2>Practice Plan</h2>
  <ul class="practice">${analysis.practiceplan.map(p=>`<li>${esc(p)}</li>`).join('')}</ul>` : ''}

  ${(analysis.fillerWords||[]).length ? `
  <h2>Filler Words</h2>
  <p>${analysis.fillerWords.map(esc).join(', ')}</p>` : ''}

</body>
</html>`

    const filename = [company, role, 'Interview', 'Report', date]
      .join('_')
      .replace(/\s+/g, '_')
      .replace(/[^a-zA-Z0-9_\-]/g, '') + '.html'

    const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{minHeight:'calc(100vh - 52px)',paddingBottom:60}}>
      <style>{`
        @keyframes waveform{0%,100%{transform:scaleY(0.3)}50%{transform:scaleY(1)}}
        @keyframes pulse-ring{0%{transform:scale(1);opacity:0.8}100%{transform:scale(2.4);opacity:0}}
        @keyframes blink{0%,100%{opacity:1}50%{opacity:0.3}}
        @keyframes fadeUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
        @keyframes glow-pulse{
          0%,100%{box-shadow:0 0 0 2px rgba(99,179,237,0.3),0 0 20px rgba(99,179,237,0.22),0 8px 40px rgba(99,179,237,0.1)}
          50%{box-shadow:0 0 0 2px rgba(99,179,237,0.6),0 0 40px rgba(99,179,237,0.42),0 12px 56px rgba(99,179,237,0.2)}
        }
        @keyframes glow-pulse-light{
          0%,100%{box-shadow:0 0 0 2px rgba(37,99,235,0.3),0 0 18px rgba(37,99,235,0.25),0 8px 36px rgba(37,99,235,0.18)}
          50%{box-shadow:0 0 0 2px rgba(37,99,235,0.55),0 0 32px rgba(37,99,235,0.42),0 12px 52px rgba(37,99,235,0.28)}
        }
        .transcript-glow{animation:glow-pulse 2.8s ease-in-out infinite!important}
        [data-theme="light"] .transcript-glow{border-color:rgba(37,99,235,0.55)!important;animation:glow-pulse-light 2.8s ease-in-out infinite!important}
        @keyframes spin{to{transform:rotate(360deg)}}
        input:focus,select:focus,textarea:focus{outline:2px solid var(--border-focus)!important;outline-offset:0}
        input::placeholder,textarea::placeholder{color:var(--text-muted);opacity:0.5}
      `}</style>

      <div style={{maxWidth:'min(1400px, 92vw)',margin:'0 auto',padding:'36px 28px'}}>

        {/* ── RECORD STAGE ─────────────────────────────────────────────────── */}
        {stage==='record'&&(
          <div style={{animation:'fadeUp 0.4s ease'}}>

            {/* ── Hero ─────────────────────────────────────────────────────── */}
            <div id="predict" style={{textAlign:'center',marginBottom:36,paddingTop:12}}>
              <h1 style={{fontFamily:'Montserrat',fontSize:'clamp(28px,3.5vw,46px)',fontWeight:800,marginBottom:10,letterSpacing:'-0.5px',lineHeight:1.2,whiteSpace:'nowrap'}}>
                <span style={{color:'var(--text)'}}>Crack the code.</span>{' '}
                <span style={{color:'var(--accent)'}}>Land your PM role.</span>
              </h1>
              <p style={{color:'var(--text)',fontSize:20,fontWeight:600,lineHeight:1.4,maxWidth:700,margin:'0 auto 10px',fontFamily:'Open Sans, sans-serif',whiteSpace:'nowrap'}}>
                🔮 Predict questions before you walk in — 📊 analyse answers after.
              </p>
              <div style={{display:'flex',flexWrap:'nowrap',justifyContent:'center',gap:8,margin:'0 auto 22px',maxWidth:'100%',overflowX:'auto'}}>
                {[
                  '📚 6,000+ real PM questions',
                  '🏢 Google · Meta · Stripe · Airbnb',
                  '🎯 Matched to your role & JD',
                  '📊 Calibrated callback probability',
                ].map(t => (
                  <span key={t} style={{
                    padding:'5px 13px', borderRadius:20,
                    background:'var(--surface2)', border:'1px solid var(--border)',
                    color:'var(--text-muted)', fontFamily:'DM Mono', fontSize:12,
                    letterSpacing:'0.01em',
                  }}>{t}</span>
                ))}
              </div>
              {/* Predict / Analyse pill toggle */}
              <div style={{
                display:'inline-flex', padding:5, gap:5, borderRadius:18,
                background:'var(--surface)',
                border:'1px solid var(--border)',
                boxShadow:'0 0 0 4px rgba(99,179,237,0.08), 0 8px 32px rgba(0,0,0,0.35)',
              }}>
                <button onClick={()=>{ setHomeMode('predict'); setAuthPrompt(false) }}
                  style={{
                    display:'flex', alignItems:'center', gap:10,
                    padding:'14px 28px', borderRadius:13, border:'none', cursor:'pointer',
                    fontFamily:'DM Mono', fontSize:14, fontWeight:700, letterSpacing:'0.3px',
                    transition:'all 0.2s cubic-bezier(0.4,0,0.2,1)',
                    background: homeMode==='predict' ? (isLight ? 'linear-gradient(135deg,#1d4ed8,#2563eb)' : 'linear-gradient(135deg,var(--accent),#4299e1)') : 'transparent',
                    color: homeMode==='predict' ? '#fff' : 'var(--text-muted)',
                    boxShadow: homeMode==='predict' ? (isLight ? '0 4px 20px rgba(29,78,216,0.4)' : '0 4px 18px rgba(99,179,237,0.45)') : 'none',
                  }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/><path d="M11 8v6M8 11h6"/>
                  </svg>
                  Predict interview questions
                </button>
                <button onClick={()=>{ setHomeMode('analyse'); setAuthPrompt(false) }}
                  style={{
                    display:'flex', alignItems:'center', gap:10,
                    padding:'14px 28px', borderRadius:13, border:'none', cursor:'pointer',
                    fontFamily:'DM Mono', fontSize:14, fontWeight:700, letterSpacing:'0.3px',
                    transition:'all 0.2s cubic-bezier(0.4,0,0.2,1)',
                    background: homeMode==='analyse' ? (isLight ? 'linear-gradient(135deg,#1d4ed8,#2563eb)' : 'linear-gradient(135deg,var(--accent),#4299e1)') : 'transparent',
                    color: homeMode==='analyse' ? '#fff' : 'var(--text-muted)',
                    boxShadow: homeMode==='analyse' ? (isLight ? '0 4px 20px rgba(29,78,216,0.4)' : '0 4px 18px rgba(99,179,237,0.45)') : 'none',
                  }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/>
                  </svg>
                  Analyse interview transcript
                </button>
              </div>
            </div>


            {/* ── Predict mode ──────────────────────────────────────────────── */}
            {homeMode==='predict'&&<PredictPanel />}

            {/* ── Two-column layout (analyse mode) ──────────────────────────── */}
            {homeMode==='analyse'&&<div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:32,alignItems:'stretch'}}>

              {/* LEFT: Input controls */}
              <div style={{display:'flex',flexDirection:'column'}}>
                {/* ── Unified glow card: toggle + transcript ── */}
                <div className="transcript-glow" style={{border:'1px solid rgba(99,179,237,0.35)',borderRadius:14,overflow:'hidden',marginBottom:12,display:'flex',flexDirection:'column',transform:'translateY(-1px)'}}>

                {/* Mode toggle tabs */}
                <div style={{display:'flex',gap:4,padding:4,borderBottom:'1px solid rgba(99,179,237,0.18)',background:'rgba(99,179,237,0.04)'}}>
                  <button
                    onClick={()=>{if(recState==='idle')setInputMode('paste')}}
                    aria-pressed={inputMode==='paste'}
                    style={{
                      flex:1, padding:'13px 8px', borderRadius:8, border:'none',
                      cursor: recState!=='idle'&&'paste'!==inputMode ? 'not-allowed' : 'pointer',
                      background: inputMode==='paste' ? 'rgba(126,200,247,0.18)' : 'transparent',
                      color: inputMode==='paste' ? 'var(--text)' : 'var(--text-muted)',
                      fontFamily:'DM Mono', fontSize:14, fontWeight: 700, letterSpacing:'0.3px',
                      transition:'all 0.18s', display:'flex', alignItems:'center', justifyContent:'center', gap:8,
                      outline: inputMode==='paste' ? '1px solid rgba(126,200,247,0.3)' : 'none',
                      opacity: recState!=='idle'&&'paste'!==inputMode ? 0.4 : 1,
                    }}>
                    <span style={{fontSize:16}}>📝</span> Paste transcript
                  </button>
                  <button
                    style={{
                      flex: 1,
                      padding: '13px 16px',
                      borderRadius: 8,
                      border: '1px solid var(--border)',
                      background: 'transparent',
                      color: 'var(--text-muted)',
                      fontSize: 14,
                      fontWeight: 700,
                      letterSpacing: '0.3px',
                      fontFamily: 'DM Mono',
                      cursor: 'not-allowed',
                      position: 'relative',
                      filter: 'blur(0.4px)',
                      opacity: 0.55,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8,
                    }}
                    disabled
                    title="Pro feature — coming soon"
                  >
                    🔒 Record / Upload
                    <span style={{
                      fontSize: 10,
                      background: 'var(--surface2)',
                      border: '1px solid var(--border)',
                      borderRadius: 4,
                      padding: '1px 6px',
                      color: 'var(--text-muted)',
                      fontFamily: 'DM Mono',
                      marginLeft: 4,
                    }}>
                      Pro · coming soon
                    </span>
                  </button>
                </div>

                {/* ── PASTE TAB ── */}
                {inputMode==='paste'&&(
                  <>
                    <div style={{background:'var(--surface)',overflow:'hidden'}}>
                      <div style={{padding:'10px 14px',borderBottom:'1px solid rgba(99,179,237,0.2)',fontSize:12,fontWeight:700,color:'var(--accent)',letterSpacing:'1.5px',textTransform:'uppercase',display:'flex',justifyContent:'space-between',alignItems:'center',fontFamily:'DM Mono',background:'rgba(99,179,237,0.05)'}}>
                        <span>Transcript</span>
                        {(()=>{const wc=pasted.trim().split(/\s+/).filter(Boolean).length;return(
                        <span style={{color:wc>25000?'var(--danger)':wc>100?'var(--accent2)':'var(--text-muted)',fontVariantNumeric:'tabular-nums'}}>
                          {wc.toLocaleString()} / 25,000 words
                        </span>)})()}
                      </div>
                      <textarea value={pasted} onChange={e=>setPasted(e.target.value)} aria-label="Interview transcript"
                        placeholder={"Interviewer: Tell me about a product you launched.\n\nMe: At Razorpay I led the launch of payment links...\n\nInterviewer: How do you prioritise your roadmap?\n\nMe: I use a combination of impact vs effort..."}
                        style={{...S.input,height:260,resize:'vertical',border:'none',borderRadius:0,lineHeight:1.75,padding:16,fontFamily:'Open Sans, sans-serif',fontSize:'var(--font-size-base)',background:'rgba(99,179,237,0.03)'}}/>
                    </div>
                    {(()=>{const wc=pasted.trim().split(/\s+/).filter(Boolean).length;const tooLong=wc>25000;const tooShort=pasted.trim().length<50;return(
                    <button onClick={()=>goDetails(null)} disabled={tooShort||tooLong}
                      style={{width:'100%',padding:'15px 20px',
                        background:(!tooShort&&!tooLong)?'linear-gradient(135deg,#1d4ed8 0%,#2563eb 50%,#3b82f6 100%)':'var(--surface2)',
                        border:(!tooShort&&!tooLong)?'1px solid rgba(255,255,255,0.15)':'1px solid var(--border)',
                        borderRadius:12,
                        color:(!tooShort&&!tooLong)?'#ffffff':'var(--text-muted)',
                        fontSize:15,fontFamily:'DM Mono',fontWeight:800,letterSpacing:'0.3px',
                        cursor:(!tooShort&&!tooLong)?'pointer':'not-allowed',
                        boxShadow:(!tooShort&&!tooLong)?'0 4px 24px rgba(37,99,235,0.5),0 1px 0 rgba(255,255,255,0.15) inset':'none',
                        textShadow:(!tooShort&&!tooLong)?'0 1px 2px rgba(0,0,0,0.3)':'none',
                        transition:'transform 0.12s ease,box-shadow 0.12s ease'}}
                      onMouseEnter={e=>{if(!tooShort&&!tooLong){e.currentTarget.style.transform='translateY(-1px)';e.currentTarget.style.boxShadow='0 8px 32px rgba(37,99,235,0.65),0 1px 0 rgba(255,255,255,0.15) inset'}}}
                      onMouseLeave={e=>{e.currentTarget.style.transform='translateY(0)';e.currentTarget.style.boxShadow=(!tooShort&&!tooLong)?'0 4px 24px rgba(37,99,235,0.5),0 1px 0 rgba(255,255,255,0.15) inset':'none'}}
                      onMouseDown={e=>{if(!tooShort&&!tooLong)e.currentTarget.style.transform='translateY(1px)'}}
                      onMouseUp={e=>{if(!tooShort&&!tooLong)e.currentTarget.style.transform='translateY(-1px)'}}>
                      {tooLong?`Over limit — remove ${(wc-25000).toLocaleString()} words`:tooShort?`Need ${Math.max(0,50-pasted.trim().length)} more chars...`:'Analyse Interview →'}
                    </button>
                    )})()}
                  </>
                )}

                {/* ── RECORD / UPLOAD TAB ── */}
                {inputMode==='record'&&(
                  <div style={{animation:'fadeUp 0.2s ease',padding:'12px'}}>
                    <input ref={fileRef} type="file" accept="audio/*" onChange={e=>{if(e.target.files[0])goDetails(e.target.files[0])}} style={{display:'none'}} aria-hidden/>

                    {/* Idle — show record + upload options */}
                    {recState==='idle'&&!audioBlob&&(
                      <>
                        {/* Record live card */}
                        <div style={{background:'var(--surface)',border:'1px solid rgba(126,200,247,0.2)',borderRadius:14,padding:'22px 20px',marginBottom:10,display:'flex',alignItems:'center',gap:18}}>
                          <button onClick={startRec} aria-label="Start recording"
                            style={{width:56,height:56,borderRadius:'50%',background:'linear-gradient(135deg,var(--accent),#4299e1)',border:'none',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',fontSize:24,boxShadow:'0 0 20px rgba(99,179,237,0.25)',flexShrink:0,transition:'transform 0.15s'}}>
                            🎙️
                          </button>
                          <div>
                            <p style={{fontSize:'var(--font-size-sm)',color:'var(--text)',fontWeight:700,margin:'0 0 3px',fontFamily:'Montserrat'}}>Record live</p>
                            <p style={{fontSize:'var(--font-size-xs)',color:'var(--text-muted)',margin:0,lineHeight:1.5}}>Your mic only — no consent issues.<br/>Works mid-interview too.</p>
                          </div>
                        </div>

                        {/* Divider */}
                        <div style={{display:'flex',alignItems:'center',gap:10,margin:'12px 0'}}>
                          <div style={{flex:1,height:1,background:'var(--border)'}}/>
                          <span style={{fontSize:'var(--font-size-xs)',color:'var(--text-muted)',fontFamily:'DM Mono',letterSpacing:'1px'}}>OR</span>
                          <div style={{flex:1,height:1,background:'var(--border)'}}/>
                        </div>

                        {/* Upload card */}
                        <button onClick={()=>fileRef.current?.click()}
                          style={{width:'100%',background:'var(--surface)',border:'1px dashed var(--border)',borderRadius:14,padding:'20px',cursor:'pointer',textAlign:'center',transition:'border-color 0.2s,background 0.2s'}}
                          onMouseEnter={e=>{e.currentTarget.style.borderColor='var(--accent)';e.currentTarget.style.background='rgba(126,200,247,0.04)'}}
                          onMouseLeave={e=>{e.currentTarget.style.borderColor='var(--border)';e.currentTarget.style.background='var(--surface)'}}>
                          <div style={{fontSize:28,marginBottom:8}}>↑</div>
                          <p style={{fontFamily:'DM Mono',fontSize:'var(--font-size-sm)',color:'var(--text)',fontWeight:600,margin:'0 0 4px'}}>Upload audio file</p>
                          <p style={{fontFamily:'DM Mono',fontSize:'var(--font-size-xs)',color:'var(--text-muted)',margin:0}}>MP3 · M4A · WAV · MP4 · WebM · OGG</p>
                        </button>
                      </>
                    )}

                    {/* Recording / paused */}
                    {recState!=='idle'&&(
                      <div style={{background:'var(--surface)',border:'1px solid rgba(252,77,109,0.35)',borderRadius:14,padding:'20px',position:'relative',overflow:'hidden'}}>
                        <div style={{position:'absolute',inset:0,pointerEvents:'none',background:'radial-gradient(circle at center, rgba(252,77,109,0.03) 0%, transparent 70%)'}} aria-hidden/>
                        <div style={{display:'flex',alignItems:'center',gap:14,marginBottom:16}}>
                          <Waveform paused={recState==='paused'}/>
                          <div style={{fontSize:26,fontWeight:'bold',color:recState==='paused'?'var(--text-muted)':'var(--recording)',fontFamily:'DM Mono'}} aria-live="polite">
                            {fmtTime(recTime)}
                          </div>
                          <span style={{fontSize:'var(--font-size-xs)',color:'var(--text-muted)',flex:1,fontFamily:'DM Mono',animation:recState==='paused'?'none':'blink 1.5s infinite'}}>
                            {recState==='paused'?'⏸ Paused':'● Recording'}
                          </span>
                        </div>
                        <div style={{display:'flex',gap:8}}>
                          <button onClick={recState==='paused'?resumeRec:pauseRec}
                            style={{flex:1,padding:'9px',borderRadius:8,border:'1px solid var(--border)',background:'var(--surface2)',color:'var(--text)',fontFamily:'DM Mono',fontSize:'var(--font-size-xs)',cursor:'pointer'}}>
                            {recState==='paused'?'▶ Resume':'⏸ Pause'}
                          </button>
                          <button onClick={stopRec}
                            style={{flex:1,padding:'9px',borderRadius:8,border:'none',background:'linear-gradient(135deg,var(--recording),#e03050)',color:'#fff',fontFamily:'DM Mono',fontSize:'var(--font-size-xs)',fontWeight:'bold',cursor:'pointer'}}>
                            ⬛ Stop recording
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Recording finished — ready to analyse */}
                    {recState==='idle'&&audioBlob&&(
                      <>
                        <div style={{background:'var(--surface)',border:'1px solid rgba(104,211,145,0.3)',borderRadius:14,padding:'16px 20px',marginBottom:12,display:'flex',alignItems:'center',gap:12}}>
                          <span style={{fontSize:22,color:'var(--accent2)',flexShrink:0}}>✓</span>
                          <p style={{fontSize:'var(--font-size-sm)',color:'var(--accent2)',margin:0,flex:1,fontFamily:'DM Mono'}}>
                            Recording ready · {fmtTime(recTime)}
                          </p>
                          <button onClick={discardRec}
                            style={{padding:'6px 12px',borderRadius:8,border:'1px solid var(--border)',background:'transparent',color:'var(--text-muted)',fontFamily:'DM Mono',fontSize:'var(--font-size-xs)',cursor:'pointer'}}>
                            Discard
                          </button>
                        </div>
                        <button onClick={()=>goDetails(audioBlob)}
                          style={{width:'100%',padding:'15px 20px',
                          background:'linear-gradient(135deg,#1d4ed8 0%,#2563eb 50%,#3b82f6 100%)',
                          border:'1px solid rgba(255,255,255,0.15)',borderRadius:12,
                          color:'#ffffff',fontSize:15,fontFamily:'DM Mono',fontWeight:800,letterSpacing:'0.3px',
                          cursor:'pointer',
                          boxShadow:'0 4px 24px rgba(37,99,235,0.5),0 1px 0 rgba(255,255,255,0.15) inset',
                          textShadow:'0 1px 2px rgba(0,0,0,0.3)',
                          transition:'transform 0.12s ease,box-shadow 0.12s ease'}}
                        onMouseEnter={e=>{e.currentTarget.style.transform='translateY(-1px)';e.currentTarget.style.boxShadow='0 8px 32px rgba(37,99,235,0.65),0 1px 0 rgba(255,255,255,0.15) inset'}}
                        onMouseLeave={e=>{e.currentTarget.style.transform='translateY(0)';e.currentTarget.style.boxShadow='0 4px 24px rgba(37,99,235,0.5),0 1px 0 rgba(255,255,255,0.15) inset'}}
                        onMouseDown={e=>{e.currentTarget.style.transform='translateY(1px)'}}
                        onMouseUp={e=>{e.currentTarget.style.transform='translateY(-1px)'}}>
                          Analyse Interview →
                        </button>
                      </>
                    )}

                    {/* Disabled analyse placeholder when nothing recorded yet */}
                    {recState==='idle'&&!audioBlob&&(
                      <button disabled style={{width:'100%',padding:'13px',marginTop:10,background:'var(--surface2)',border:'none',borderRadius:'var(--radius)',color:'var(--text-muted)',fontSize:'var(--font-size-base)',fontFamily:'DM Mono',fontWeight:'bold',cursor:'not-allowed'}}>
                        Record or upload to continue
                      </button>
                    )}
                  </div>
                )}


                </div>{/* end unified glow card */}

                {error&&<p role="alert" style={{marginTop:14,padding:'10px 14px',background:'rgba(252,129,129,0.05)',border:'1px solid rgba(252,129,129,0.2)',borderRadius:8,fontSize:'var(--font-size-sm)',color:'var(--danger)'}}>⚠ {error}</p>}

                {/* What you get — fills remaining height */}
                <div style={{flex:1,marginTop:20,display:'flex',flexDirection:'column',gap:8}}>
                  {[
                    { icon:'🎯', color:'#7ec8f7', title:'Scores on every answer',   desc:'Each response scored 0–10. Know exactly which answers are interview-ready.' },
                    { icon:'📊', color:'#7ee8a2', title:'PM signal bars',            desc:'Customer Empathy · Data · Execution · Strategy · Communication — per question.' },
                    { icon:'✦',  color:'#a78bfa', title:'AI answer rewrite',         desc:'One click shows how a top PM would have answered.' },
                    { icon:'📋', color:'#fbc26a', title:'Targeted practice plan',    desc:'3 custom drills based on your lowest-scoring answers.' },
                    { icon:'⬇️', color:'#7ec8f7', title:'PDF report download',       desc:'Save it, share with a coach, or pull it up before your next round.' },
                  ].map(({icon,color,title,desc})=>(
                    <div key={title} style={{display:'flex',gap:10,alignItems:'flex-start',padding:'9px 11px',background:'var(--surface)',borderRadius:10,border:'1px solid var(--border)'}}>
                      <div style={{width:30,height:30,borderRadius:8,flexShrink:0,background:`${color}15`,border:`1px solid ${color}30`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:15}}>{icon}</div>
                      <div>
                        <p style={{fontSize:12,color:'var(--text)',fontFamily:'Montserrat',fontWeight:700,margin:'0 0 2px'}}>{title}</p>
                        <p style={{fontSize:11,color:'var(--text-muted)',fontFamily:'Open Sans, sans-serif',lineHeight:1.55,margin:0}}>{desc}</p>
                      </div>
                    </div>
                  ))}
                  <div style={{marginTop:4,padding:'8px 12px',background:isLight?'rgba(22,163,74,0.07)':'rgba(104,211,145,0.06)',border:isLight?'1px solid rgba(22,163,74,0.3)':'1px solid rgba(104,211,145,0.18)',borderRadius:10,display:'flex',alignItems:'center',gap:10}}>
                    <span style={{fontSize:18}}>🔒</span>
                    <p style={{fontSize:11,color:isLight?'#15803d':'#7ee8a2',fontFamily:'Open Sans, sans-serif',margin:0,lineHeight:1.5}}><strong>Your data stays yours.</strong> Transcript and report never leave your account.</p>
                  </div>
                </div>
              </div>{/* /LEFT */}

              {/* RIGHT: Report teaser */}
              <ReportTeaser/>

            </div>}{/* /two-column analyse */}
          </div>
        )}

        {stage==='record'&&<Ticker/>}

        {/* ── TRANSCRIPT REVIEW STAGE ──────────────────────────────────────── */}
        {stage==='transcript'&&(
          <TranscriptReview
            segments={segments}
            setSegments={setSegments}
            classifying={classifying}
            classifyError={classifyError}
            onContinue={()=>setStage('details')}
            onBack={()=>{setStage('record');setSegments([]);setClassifyError('')}}
          />
        )}

                {/* ── DETAILS STAGE ────────────────────────────────────────────────── */}
        {stage==='details'&&(
          <div style={{animation:'fadeUp 0.4s ease',maxWidth:600,margin:'0 auto'}}>
            <button onClick={()=>setStage(segments.length>0?'transcript':'record')}
              style={{background:'none',border:'none',color:'var(--text-muted)',fontSize:'var(--font-size-sm)',cursor:'pointer',fontFamily:'DM Mono',marginBottom:20,display:'flex',alignItems:'center',gap:6}}>
              ← Back
            </button>
            {error&&<p role="alert" style={{padding:'10px 14px',background:'rgba(252,129,129,0.05)',border:'1px solid rgba(252,129,129,0.2)',borderRadius:8,fontSize:'var(--font-size-sm)',color:'var(--danger)',marginBottom:20}}>⚠ {error}</p>}
            <h2 style={{fontFamily:'Montserrat',fontSize:26,fontWeight:'normal',color:'var(--text)',marginBottom:4}}>About this interview</h2>
            <p style={{color:'var(--text-muted)',fontSize:'var(--font-size-sm)',marginBottom:24}}>
              Helps calibrate your coaching and builds the questions + salary database.
            </p>

            {/* Role info */}
            <div style={S.card}>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:12}}>
                <div><label style={S.label} htmlFor="company">Company *</label><input id="company" value={meta.company} onChange={e=>setM('company',e.target.value)} placeholder="e.g. Stripe" style={S.input}/></div>
                <div><label style={S.label} htmlFor="role">Role *</label><input id="role" value={meta.role} onChange={e=>setM('role',e.target.value)} placeholder="e.g. Senior PM" style={S.input}/></div>
              </div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:12}}>
                <div><label style={S.label} htmlFor="location">Location</label><input id="location" value={meta.location} onChange={e=>setM('location',e.target.value)} placeholder="e.g. Bangalore" style={S.input}/></div>
                <div>
                  <label style={S.label} htmlFor="exp">Experience *</label>
                  <select id="exp" value={meta.experienceYears} onChange={e=>setM('experienceYears',e.target.value)} style={S.input}>
                    {EXP_OPTS.map(o=><option key={o.v} value={o.v}>{o.l}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label style={S.label} htmlFor="roundType">Round type <span style={{textTransform:'none',letterSpacing:0,opacity:0.6}}>(optional)</span></label>
                <select id="roundType" value={meta.roundType} onChange={e=>setM('roundType',e.target.value)} style={S.input}>
                  <option value="">— Unknown</option>
                  {['Screen','HR','Hiring Manager','Senior Product Leader','CPO/CXO','Other'].map(r=><option key={r} value={r}>{r}</option>)}
                </select>
              </div>
            </div>

            {/* Salary */}
            <div style={S.card}>
              <label style={S.label}>Salary range <span style={{textTransform:'none',letterSpacing:0,opacity:0.6}}>(optional)</span></label>
              <div style={{display:'grid',gridTemplateColumns:'90px 1fr auto 1fr',gap:8,alignItems:'center'}}>
                <select value={meta.salaryCurrency} onChange={e=>setM('salaryCurrency',e.target.value)} style={{...S.input,padding:'11px 8px'}} aria-label="Currency">
                  {CURRENCIES.map(c=><option key={c} value={c}>{CURRENCY_SYM[c]} {c}</option>)}
                </select>
                <input type="number" value={meta.salaryMin} onChange={e=>setM('salaryMin',e.target.value)} placeholder="Min" style={S.input} aria-label="Minimum salary"/>
                <span style={{color:'var(--text-muted)',fontSize:'var(--font-size-sm)',padding:'0 4px'}}>–</span>
                <input type="number" value={meta.salaryMax} onChange={e=>setM('salaryMax',e.target.value)} placeholder="Max" style={S.input} aria-label="Maximum salary"/>
              </div>
              <p style={{fontSize:'var(--font-size-xs)',color:'var(--text-muted)',marginTop:6}}>
                {meta.salaryCurrency==='INR'?'In rupees e.g. 2500000 for ₹25L':`In ${meta.salaryCurrency} e.g. 150000 for ${CURRENCY_SYM[meta.salaryCurrency]}150K`}
              </p>
            </div>

            {/* Job posting */}
            <div style={S.card}>
              <label style={S.label}>Job posting <span style={{textTransform:'none',letterSpacing:0,opacity:0.6}}>(optional — makes feedback more targeted)</span></label>
              <div style={{display:'flex',gap:4,marginBottom:10}}>
                {[{id:'paste',l:'Paste text'},{id:'url',l:'Fetch from URL'}].map(({id,l})=>(
                  <button key={id} onClick={()=>setJobInputMode(id)}
                    style={{padding:'5px 12px',borderRadius:6,border:'1px solid var(--border)',
                      background:jobInputMode===id?'var(--surface2)':'transparent',
                      color:jobInputMode===id?'var(--text)':'var(--text-muted)',
                      fontFamily:'DM Mono',fontSize:'var(--font-size-xs)',cursor:'pointer'}}>
                    {l}
                  </button>
                ))}
              </div>
              {jobInputMode==='url'&&(
                <div style={{display:'flex',gap:8,marginBottom:10}}>
                  <input value={meta.jobUrl} onChange={e=>setM('jobUrl',e.target.value)} placeholder="https://jobs.stripe.com/..." style={{...S.input,flex:1}} aria-label="Job posting URL"/>
                  <button onClick={fetchJobUrl} disabled={fetchingUrl||!meta.jobUrl.trim()}
                    style={{padding:'0 16px',background:meta.jobUrl.trim()?'var(--accent)':'var(--surface2)',border:'none',borderRadius:'var(--radius)',color:meta.jobUrl.trim()?'#0a0a0f':'var(--text-muted)',fontFamily:'DM Mono',fontSize:'var(--font-size-xs)',cursor:meta.jobUrl.trim()?'pointer':'not-allowed',flexShrink:0,whiteSpace:'nowrap'}}>
                    {fetchingUrl?'Fetching...':'Fetch'}
                  </button>
                </div>
              )}
              <textarea value={meta.jobDescription} onChange={e=>setM('jobDescription',e.target.value)}
                aria-label="Job description"
                placeholder={"We're looking for a Senior PM to lead payments...\n- 5+ years PM experience\n- B2B SaaS background\n- Strong data analysis skills..."}
                style={{...S.input,height:130,resize:'vertical',lineHeight:1.7}}/>
              <p style={{fontSize:'var(--font-size-xs)',color:'var(--text-muted)',marginTop:6}}>{meta.jobDescription.length} chars</p>
            </div>

            {/* CV override */}
            <div style={S.card}>
              <button onClick={()=>setShowCVOverride(!showCVOverride)}
                style={{width:'100%',background:'none',border:'none',cursor:'pointer',display:'flex',justifyContent:'space-between',alignItems:'center',padding:0,color:'var(--text)',fontFamily:'DM Mono',fontSize:'var(--font-size-sm)',textAlign:'left'}}>
                <span>📄 CV / portfolio <span style={{color:'var(--text-muted)',fontSize:'var(--font-size-xs)'}}>— optional, overrides your profile for this interview</span></span>
                <span style={{color:'var(--text-muted)',fontSize:15}} aria-hidden>{showCVOverride?'↑':'↓'}</span>
              </button>
              {showCVOverride&&(
                <div style={{marginTop:16}}>
                  <p style={{fontSize:'var(--font-size-xs)',color:'var(--text-muted)',marginBottom:14,lineHeight:1.6}}>
                    Leave empty to use your profile CV. Fill in to override for this interview only.
                  </p>
                  <div style={{marginBottom:12}}>
                    <label style={{...S.label,marginBottom:8}} htmlFor="cvText">CV — upload file or paste text</label>
                    <FileDropZone label="Drop CV — PDF, DOCX, or PPTX" onText={t=>setM('cvText',t)} compact/>
                    <div style={{marginTop:8}}>
                      <textarea id="cvText" value={meta.cvText} onChange={e=>setM('cvText',e.target.value)}
                        placeholder="Or paste CV text here..."
                        style={{...S.input,height:100,resize:'vertical',lineHeight:1.7}} aria-label="CV text for this interview"/>
                    </div>
                  </div>
                  <div>
                    <label style={{...S.label,marginBottom:8}} htmlFor="portText">Portfolio / achievements — upload or paste</label>
                    <FileDropZone label="Drop portfolio PPTX or PDF" onText={t=>setM('portfolioText',t)} compact/>
                    <div style={{marginTop:8}}>
                      <textarea id="portText" value={meta.portfolioText} onChange={e=>setM('portfolioText',e.target.value)}
                        placeholder="Or paste key achievements..."
                        style={{...S.input,height:80,resize:'vertical',lineHeight:1.7}} aria-label="Portfolio for this interview"/>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <button onClick={analyze} disabled={!meta.company||!meta.role}
              style={{width:'100%',padding:'13px',
                background:meta.company&&meta.role?'linear-gradient(135deg,#1d4ed8,#2563eb)':'var(--surface2)',
                border:'none',borderRadius:'var(--radius)',
                color:'#fff',
                fontSize:'var(--font-size-base)',fontFamily:'DM Mono',fontWeight:'bold',
                cursor:meta.company&&meta.role?'pointer':'not-allowed',
                opacity:meta.company&&meta.role?1:0.45,
                boxShadow:meta.company&&meta.role?'0 0 20px rgba(37,99,235,0.35)':'none',
                transition:'all 0.2s'}}>
              Analyze Interview →
            </button>
          </div>
        )}

        {/* ── COUNTDOWN ───────────────────────────────────────────────────── */}
        {stage==='countdown'&&<CountdownScreen/>}

        {/* ── REPORT ─────────────────────────────────────────────────────── */}
        {stage==='report'&&(
          <div ref={reportRef} style={{animation:'fadeUp 0.4s ease'}}>
          {/* Waiting for API while already past countdown */}
          {!analysis&&(
            <div style={{textAlign:'center',padding:'80px 0',color:'var(--text-muted)'}}>
              <div style={{fontSize:28,marginBottom:14,animation:'pulse-ring 1.5s ease-out infinite',display:'inline-block'}}>◌</div>
              <p style={{fontFamily:'DM Mono',fontSize:'var(--font-size-sm)',letterSpacing:'0.5px'}}>Finalizing your report…</p>
            </div>
          )}
          {analysis&&(<div style={{animation:'fadeUp 0.4s ease'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:18}}>
              <h2 style={{fontFamily:'Montserrat',fontSize:22,fontWeight:'normal',color:'var(--text)',margin:0}}>Interview Report</h2>
              <div style={{display:'flex',gap:8,alignItems:'center'}}>
                {!reportComplete&&(
                  <span style={{fontFamily:'DM Mono',fontSize:'var(--font-size-xs)',color:'var(--text-muted)',display:'flex',alignItems:'center',gap:6}}>
                    <span style={{animation:'blink 1.2s infinite',display:'inline-block',width:6,height:6,borderRadius:'50%',background:'var(--accent)'}}/>
                    Completing…
                  </span>
                )}
                {interviewId&&<Link href={`/history/${interviewId}`} style={{background:'transparent',border:'1px solid var(--border)',color:'var(--text-muted)',padding:'7px 14px',borderRadius:20,fontSize:'var(--font-size-xs)',fontFamily:'DM Mono',textDecoration:'none'}}>History</Link>}
                <button
                  onClick={reportComplete && isSignedIn ? downloadPDF : isSignedIn ? undefined : () => setAuthPrompt(true)}
                  disabled={!reportComplete}
                  title={!isSignedIn ? 'Sign in to download PDF' : reportComplete ? 'Download PDF' : 'Waiting for all answers to complete…'}
                  style={{
                    background: reportComplete && isSignedIn ? 'rgba(104,211,145,0.12)' : 'rgba(104,211,145,0.04)',
                    border: `1px solid ${reportComplete && isSignedIn ? 'rgba(104,211,145,0.4)' : 'rgba(104,211,145,0.15)'}`,
                    color: reportComplete && isSignedIn ? '#68d391' : 'rgba(104,211,145,0.35)',
                    padding:'7px 16px',borderRadius:20,fontSize:'var(--font-size-xs)',
                    cursor: !reportComplete ? 'not-allowed' : isSignedIn ? 'pointer' : 'pointer',
                    fontFamily:'DM Mono',fontWeight:'bold',transition:'all 0.3s',
                  }}
                  onMouseEnter={e=>{ if(reportComplete && isSignedIn) e.currentTarget.style.background='rgba(104,211,145,0.22)' }}
                  onMouseLeave={e=>{ if(reportComplete && isSignedIn) e.currentTarget.style.background='rgba(104,211,145,0.04)' }}>
                  {reportComplete ? '↓ PDF' : '⌛ PDF'}
                </button>
                <button onClick={reset} style={{background:'transparent',border:'1px solid var(--border)',color:'var(--text-muted)',padding:'7px 14px',borderRadius:20,fontSize:'var(--font-size-xs)',cursor:'pointer',fontFamily:'DM Mono'}}>← New</button>
              </div>
            </div>

            {/* Helper: fade+slide up with staggered delay based on section index */}
            {(()=>{
              const rev = (i) => ({
                opacity: reportReady ? 1 : 0,
                transform: reportReady ? 'translateY(0)' : 'translateY(18px)',
                transition: `opacity 0.55s ease ${i*140}ms, transform 0.55s ease ${i*140}ms`,
              })
              const sc=analysis.overallScore
              const col=sc>=7?'#68d391':sc>=5?'#f6ad55':'#fc8181'
              const label=sc>=7?'Strong candidate':sc>=5?'Almost there':'Needs work'
              const m = submittedMetadata || {}
              return (
                <div id="report-pdf-root">
                {/* Section 0 — Interview metadata */}
                <div style={rev(0)}>
                  <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:12,padding:'14px 18px',marginBottom:14,display:'flex',flexWrap:'wrap',gap:'10px 24px',alignItems:'center'}}>
                    {m.company&&<span style={{fontFamily:'Montserrat',fontWeight:700,fontSize:15,color:'var(--text)'}}>{m.company}</span>}
                    {m.role&&<span style={{fontSize:'var(--font-size-sm)',color:'var(--text-secondary)'}}>{m.role}</span>}
                    {m.roundType&&<span style={{fontSize:'var(--font-size-xs)',color:'var(--text-muted)',background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:20,padding:'2px 10px'}}>{m.roundType}</span>}
                    {m.experienceYears&&<span style={{fontSize:'var(--font-size-xs)',color:'var(--text-muted)'}}>{m.experienceYears} yrs exp</span>}
                    {m.location&&<span style={{fontSize:'var(--font-size-xs)',color:'var(--text-muted)'}}>📍 {m.location}</span>}
                    {(m.salaryMin||m.salaryMax)&&(
                      <span style={{fontSize:'var(--font-size-xs)',color:'var(--text-muted)'}}>
                        💰 {m.salaryCurrency||'USD'} {m.salaryMin&&m.salaryMax ? `${m.salaryMin}–${m.salaryMax}` : m.salaryMin||m.salaryMax}
                      </span>
                    )}
                  </div>
                </div>

                {/* Section 1 — Score */}
                <div style={rev(1)}>
                  <div style={{background:'var(--surface)',border:`2px solid ${col}30`,borderRadius:14,padding:'22px',marginBottom:14,display:'flex',gap:24,alignItems:'flex-start'}}>
                    <div style={{flexShrink:0,textAlign:'center',minWidth:90}}>
                      <div style={{fontSize:56,fontWeight:800,fontFamily:'Montserrat',color:col,lineHeight:1}}>{sc}<span style={{fontSize:22,fontWeight:500,color:'var(--text-muted)'}}>/10</span></div>
                      <div style={{marginTop:6,fontSize:11,fontWeight:700,letterSpacing:'1.5px',textTransform:'uppercase',color:col,background:`${col}18`,border:`1px solid ${col}40`,borderRadius:20,padding:'3px 10px',display:'inline-block'}}>{label}</div>
                    </div>
                    <blockquote style={{fontSize:15,color:'var(--text-body)',lineHeight:1.8,fontFamily:'Open Sans, sans-serif',fontStyle:'italic',fontWeight:500,margin:0,borderLeft:`3px solid ${col}50`,paddingLeft:16}}>
                      "{analysis.overallSummary}"
                    </blockquote>
                  </div>
                </div>

                {/* Section 2 — Strengths + Gaps */}
                <div style={rev(2)}>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:14}}>
                    <div style={{background:'var(--surface)',border:'1px solid rgba(104,211,145,0.15)',borderRadius:'var(--radius)',padding:16}}>
                      <p style={{fontSize:'var(--font-size-xs)',color:'#68d391',letterSpacing:'1.5px',textTransform:'uppercase',marginBottom:10}}>✦ Strengths</p>
                      {analysis.topStrengths?.map((s,i)=><p key={i} style={{display:'flex',gap:8,marginBottom:8,fontSize:'var(--font-size-sm)',color:'var(--text)',lineHeight:1.5}}><span style={{color:'#68d391',flexShrink:0}}>→</span>{s}</p>)}
                    </div>
                    <div style={{background:'var(--surface)',border:'1px solid rgba(252,129,129,0.15)',borderRadius:'var(--radius)',padding:16}}>
                      <p style={{fontSize:'var(--font-size-xs)',color:'#fc8181',letterSpacing:'1.5px',textTransform:'uppercase',marginBottom:10}}>✗ Critical Gaps</p>
                      {analysis.criticalGaps?.map((g,i)=><p key={i} style={{display:'flex',gap:8,marginBottom:8,fontSize:'var(--font-size-sm)',color:'var(--text)',lineHeight:1.5}}><span style={{color:'#fc8181',flexShrink:0}}>→</span>{g}</p>)}
                    </div>
                  </div>
                </div>

                {/* Section 3 — Priority Fix */}
                {analysis.topPriorityFix&&(
                  <div style={rev(3)}>
                    <div style={{background:'rgba(246,173,85,0.05)',border:'1px solid rgba(246,173,85,0.15)',borderRadius:'var(--radius)',padding:'12px 16px',marginBottom:14,display:'flex',gap:10,alignItems:'flex-start'}}>
                      <span aria-hidden>⚡</span>
                      <div>
                        <p style={{fontSize:'var(--font-size-xs)',color:'var(--warning)',letterSpacing:'1.5px',textTransform:'uppercase',marginBottom:4}}>#1 Fix</p>
                        <p style={{fontSize:'var(--font-size-sm)',color:'var(--text)',lineHeight:1.6}}>{analysis.topPriorityFix}</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Section 4 — Recurring Pattern */}
                {analysis.recurringPattern&&(
                  <div style={rev(4)}>
                    <div style={{background:'rgba(167,139,250,0.05)',border:'1px solid rgba(167,139,250,0.15)',borderRadius:'var(--radius)',padding:'12px 16px',marginBottom:14,fontSize:'var(--font-size-sm)',color:'var(--text)',lineHeight:1.6}}>
                      <span style={{fontSize:'var(--font-size-xs)',color:'#a78bfa',letterSpacing:'1.5px',textTransform:'uppercase',display:'block',marginBottom:4}}>Pattern</span>
                      {analysis.recurringPattern}
                    </div>
                  </div>
                )}

                {/* Section 5+ — Answer cards (each staggered) */}
                <div style={rev(5)}>
                  <p style={{...S.section,marginBottom:12}}>Answer breakdown — click to expand</p>
                </div>
                {analysis.answers?.map((a,i)=>(
                  <div key={i} style={rev(6+i)}>
                    <AnswerCard answer={a} index={i} metadata={submittedMetadata}/>
                  </div>
                ))}


                {/* Failed questions notice */}
                {failedQuestions.length > 0 && (
                  <div style={{...rev(7+(analysis.answers?.length||0)), marginTop:24, padding:'16px 20px', background:'rgba(252,129,129,0.07)', border:'1px solid rgba(252,129,129,0.3)', borderRadius:10}}>
                    <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:10}}>
                      <span style={{fontSize:16}}>⚠</span>
                      <span style={{fontFamily:'Montserrat',fontWeight:700,fontSize:'var(--font-size-sm)',color:'#fc8181'}}>
                        {failedQuestions.length} question{failedQuestions.length>1?'s':''} could not be rated
                      </span>
                    </div>
                    <p style={{fontSize:'var(--font-size-xs)',color:'var(--text-muted)',margin:'0 0 10px'}}>
                      The following question{failedQuestions.length>1?'s':''} failed after 3 attempts and {failedQuestions.length>1?'were':'was'} excluded from the report. Try re-analysing if you need feedback on {failedQuestions.length>1?'them':'it'}.
                    </p>
                    <ol style={{margin:0,paddingLeft:18,display:'flex',flexDirection:'column',gap:6}}>
                      {failedQuestions.map(fq => (
                        <li key={fq.index} style={{fontSize:'var(--font-size-xs)',color:'var(--text-secondary)',lineHeight:1.5}}>
                          <span style={{fontFamily:'DM Mono',color:'#fc8181',marginRight:6}}>Q{fq.index}.</span>
                          {fq.question}
                        </li>
                      ))}
                    </ol>
                  </div>
                )}

                </div>
              )
            })()}
          </div>)}
          </div>
        )}

        {/* ── COMPLETION TOAST ─────────────────────────────────────────────── */}
        {showCompletionToast&&<CompletionToast onDismiss={()=>setShowCompletionToast(false)}/>}
      </div>
      {authPrompt && <AuthGate onClose={() => {
        setAuthPrompt(false)
        setStage('report')
        setHomeMode('analyse')
        // Clear pending report from sessionStorage — it's already in React state,
        // so we don't need it anymore. Prevents it from re-appearing on next Home mount.
        try { sessionStorage.removeItem('ic_pending_report') } catch(_) {}
        setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 100)
      }} />}
    </div>
  )
}