'use client'
import { useState, useEffect, useCallback } from 'react'

const ROUND_COLORS = {
  'Screen':                { bg:'rgba(126,200,247,0.1)', border:'rgba(126,200,247,0.3)', color:'#7ec8f7' },
  'HR':                    { bg:'rgba(251,194,106,0.1)', border:'rgba(251,194,106,0.3)', color:'#fbc26a' },
  'Hiring Manager':        { bg:'rgba(160,118,249,0.1)', border:'rgba(160,118,249,0.3)', color:'#a78bfa' },
  'Senior Product Leader': { bg:'rgba(126,232,162,0.1)', border:'rgba(126,232,162,0.3)', color:'#7ee8a2' },
  'CPO/CXO':               { bg:'rgba(252,129,129,0.12)',border:'rgba(252,129,129,0.35)',color:'#ff8f8f' },
  'Other':                 { bg:'rgba(148,163,184,0.1)', border:'rgba(148,163,184,0.25)',color:'#94a3b8' },
}
function RoundBadge({ type }) {
  if (!type || type === 'unknown') return null
  const s = ROUND_COLORS[type] || ROUND_COLORS['Other']
  return (
    <span style={{ fontSize:11, fontFamily:'DM Mono', padding:'2px 8px', borderRadius:20,
      background:s.bg, border:`1px solid ${s.border}`, color:s.color, whiteSpace:'nowrap', letterSpacing:'0.3px' }}>
      {type}
    </span>
  )
}

const EXP_OPTS = [
  {v:'', l:'All experience'},
  {v:'0-2', l:'0–2 yrs'},
  {v:'2-5', l:'2–5 yrs'},
  {v:'5-8', l:'5–8 yrs'},
  {v:'8-12', l:'8–12 yrs'},
  {v:'12+', l:'12+ yrs'},
]

const SOURCE_LABELS = { user:'👤 Users', reddit:'🔴 Reddit', glassdoor:'🟢 Glassdoor', linkedin:'💼 LinkedIn' }
const SOURCE_COLORS = { user:'var(--accent)', reddit:'#ff4500', glassdoor:'#0caa41', linkedin:'#0077b5' }

function timeAgo(dateStr) {
  const d = new Date(dateStr), now = new Date()
  const diff = Math.floor((now - d) / 1000)
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff/60)}m ago`
  if (diff < 86400) return `${Math.floor(diff/3600)}h ago`
  if (diff < 2592000) return `${Math.floor(diff/86400)}d ago`
  return d.toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' })
}

const S = {
  input: { background:'var(--surface)', border:'1px solid var(--border)', borderRadius:8, padding:'8px 12px', color:'var(--text)', fontFamily:'DM Mono', fontSize:'var(--font-size-sm)', width:'100%', transition:'border-color 0.15s' },
}

const QUESTION_TYPES = [
  'Product Sense','Product Improvement','Product Redesign','Design',
  'Behavioural','Estimation','Guesstimate','Market Estimation',
  'Strategy','Case Study','Metric','Execution','Technical','Other',
]



export default function QuestionsPage() {
  const [questions, setQuestions] = useState([])
  const [filters, setFilters] = useState({ company:'', role:'', experienceYears:'', search:'', source:'', questionType:'', sortBy:'recency' })
  const [options, setOptions] = useState({ companies:[], roles:[], sources:[], qCompanies:[] })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/questions?filters=true').then(r=>r.json()).then(setOptions)
  }, [])

  const fetchQ = useCallback(() => {
    setLoading(true)
    const params = new URLSearchParams(Object.entries(filters).filter(([,v])=>v))
    fetch(`/api/questions?${params}`).then(r=>r.json()).then(d=>{
      setQuestions(d.questions||[])
      setLoading(false)
    })
  }, [filters])

  useEffect(() => { const t=setTimeout(fetchQ,250); return()=>clearTimeout(t) }, [fetchQ])

  const setF = (k,v) => setFilters(f=>({...f,[k]:v}))
  const allCompanies = [...new Set([...(options.companies||[]),...(options.qCompanies||[])])].sort()
  const allSources = [...new Set([...(options.sources||[])])].filter(Boolean)

  return (
    <div style={{ maxWidth:900, margin:'0 auto', padding:'36px 24px' }}>
      <div style={{ marginBottom:24 }}>
        <h1 style={{ fontFamily:'Montserrat', fontSize:28, fontWeight:700, color:'var(--text)', marginBottom:4 }}>Question Bank</h1>
        <p style={{ color:'var(--text-muted)', fontSize:'var(--font-size-sm)' }}>
          {loading ? 'Loading...' : `${questions.length} questions`}
        </p>
      </div>

      {/* Filters row 1 */}
      <div style={{ display:'grid', gridTemplateColumns:'2fr 1.5fr 1.5fr', gap:8, marginBottom:8 }}>
        <input value={filters.search} onChange={e=>setF('search',e.target.value)} placeholder="Search questions..." style={S.input} aria-label="Search questions"/>
        <select value={filters.company} onChange={e=>setF('company',e.target.value)} style={S.input} aria-label="Filter by company">
          <option value="">All companies</option>
          {allCompanies.map(c=><option key={c} value={c}>{c}</option>)}
        </select>
        <input value={filters.role} onChange={e=>setF('role',e.target.value)} placeholder="Filter by role..." style={S.input} aria-label="Filter by role"/>
      </div>

      {/* Filters row 2 */}
      <div style={{ display:'flex', gap:8, marginBottom:16, flexWrap:'wrap', alignItems:'center' }}>
        <select value={filters.experienceYears} onChange={e=>setF('experienceYears',e.target.value)} style={{ ...S.input, width:'auto', minWidth:140 }} aria-label="Filter by experience">
          {EXP_OPTS.map(o=><option key={o.v} value={o.v}>{o.l}</option>)}
        </select>

        {/* Source filter pills */}
        <div style={{ display:'flex', gap:6, flexWrap:'wrap' }} role="group" aria-label="Filter by source">
          <button onClick={()=>setF('source','')} style={{
            padding:'5px 12px', borderRadius:20, border:'1px solid var(--border)',
            background:!filters.source?'var(--surface2)':'transparent',
            color:!filters.source?'var(--text)':'var(--text-muted)',
            fontFamily:'DM Mono', fontSize:'var(--font-size-xs)', cursor:'pointer',
          }}>All sources</button>
          {allSources.map(s=>(
            <button key={s} onClick={()=>setF('source', filters.source===s?'':s)}
              aria-pressed={filters.source===s}
              style={{
                padding:'5px 12px', borderRadius:20,
                border:`1px solid ${filters.source===s?SOURCE_COLORS[s]||'var(--accent)':'var(--border)'}`,
                background:filters.source===s?`${SOURCE_COLORS[s]}18`:'transparent',
                color:filters.source===s?SOURCE_COLORS[s]||'var(--accent)':'var(--text-muted)',
                fontFamily:'DM Mono', fontSize:'var(--font-size-xs)', cursor:'pointer',
              }}>
              {SOURCE_LABELS[s]||s}
            </button>
          ))}
        </div>
      </div>

      {/* Question type filter */}
      <div style={{ display:'flex', gap:6, marginBottom:16, flexWrap:'wrap' }} role="group" aria-label="Filter by question type">
        <button onClick={()=>setF('questionType','')} style={{
          padding:'5px 12px', borderRadius:20, border:'1px solid var(--border)',
          background:!filters.questionType?'var(--accent)':'transparent',
          color:!filters.questionType?'#0a0a0f':'var(--text-muted)',
          fontFamily:'DM Mono', fontSize:'var(--font-size-xs)', cursor:'pointer',
        }}>All types</button>
        {QUESTION_TYPES.map(t=>(
          <button key={t} onClick={()=>setF('questionType', filters.questionType===t?'':t)}
            aria-pressed={filters.questionType===t}
            style={{
              padding:'5px 12px', borderRadius:20,
              border:`1px solid ${filters.questionType===t?'var(--accent)':'var(--border)'}`,
              background:filters.questionType===t?'rgba(99,179,237,0.12)':'transparent',
              color:filters.questionType===t?'var(--accent)':'var(--text-muted)',
              fontFamily:'DM Mono', fontSize:'var(--font-size-xs)', cursor:'pointer', whiteSpace:'nowrap',
            }}>{t}</button>
        ))}
      </div>

      {/* Filters row 3: sort — right aligned */}
      <div style={{ display:'flex', justifyContent:'flex-end', marginBottom:16 }}>
        {/* Sort */}
        <div style={{ display:'flex', gap:6 }} role="group" aria-label="Sort by">
          {[{v:'recency',l:'Recent'},{v:'frequency',l:'Frequent'}].map(o=>(
            <button key={o.v} onClick={()=>setF('sortBy',o.v)}
              aria-pressed={filters.sortBy===o.v}
              style={{
                padding:'5px 12px', borderRadius:20, border:'1px solid var(--border)',
                background:filters.sortBy===o.v?'var(--surface2)':'transparent',
                color:filters.sortBy===o.v?'var(--text)':'var(--text-muted)',
                fontFamily:'DM Mono', fontSize:'var(--font-size-xs)', cursor:'pointer',
              }}>
              {o.l}
            </button>
          ))}
        </div>

        {Object.values(filters).some(v=>v&&v!=='recency') && (
          <button onClick={()=>setFilters({company:'',role:'',experienceYears:'',search:'',source:'',questionType:'',sortBy:'recency'})}
            style={{ padding:'5px 12px', borderRadius:20, border:'1px solid var(--border)', background:'transparent', color:'var(--text-muted)', fontFamily:'DM Mono', fontSize:'var(--font-size-xs)', cursor:'pointer' }}>
            × Clear
          </button>
        )}
      </div>

      {/* List */}
      {loading && <div style={{ textAlign:'center', color:'var(--text-muted)', padding:40 }}>Loading...</div>}

      {!loading && questions.length === 0 && (
        <div style={{ textAlign:'center', padding:60, background:'var(--surface)', borderRadius:14, border:'1px solid var(--border)' }}>
          <div style={{ fontSize:36, marginBottom:12 }}>🔍</div>
          <div style={{ color:'var(--text)', fontFamily:'Montserrat', fontSize:17, marginBottom:6 }}>
            {Object.values(filters).some(v=>v&&v!=='recency') ? 'No matches' : 'No questions yet'}
          </div>
          <div style={{ color:'var(--text-muted)', fontSize:'var(--font-size-sm)' }}>Questions are extracted automatically from interview analyses</div>
        </div>
      )}

      <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
        {questions.map((q,i)=>{
          const srcColor = SOURCE_COLORS[q.source] || 'var(--text-muted)'
          return (
            <article key={q.id} style={{
              background:'var(--surface)', border:'1px solid var(--border)',
              borderRadius:'var(--radius)', padding:'13px 16px',
              display:'flex', alignItems:'flex-start', gap:14,
              animation:`fadeUp 0.2s ease ${Math.min(i,15)*0.02}s both`,
            }}>
              {/* Frequency */}
              <div style={{
                flexShrink:0, width:40, height:40, borderRadius:8,
                background: q.frequency>=5?'rgba(99,179,237,0.08)': q.frequency>=3?'rgba(246,173,85,0.08)':'var(--surface2)',
                display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
                border:`1px solid ${q.frequency>=5?'rgba(99,179,237,0.2)':q.frequency>=3?'rgba(246,173,85,0.15)':'var(--border)'}`,
              }} aria-label={`Asked ${q.frequency} time${q.frequency!==1?'s':''}`}>
                <span style={{ fontSize:15, fontWeight:'bold', color:q.frequency>=5?'var(--accent)':q.frequency>=3?'var(--warning)':'var(--text-muted)', fontFamily:'DM Mono', lineHeight:1 }}>{q.frequency}</span>
                <span style={{ fontSize:9, color:'var(--text-muted)' }}>asked</span>
              </div>

              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:'var(--font-size-base)', color:'var(--text)', lineHeight:1.55, marginBottom:8 }}>{q.text}</div>
                <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
                  {q.company && q.company.split(',').slice(0,3).map((c,j)=>(
                    <span key={j} style={{ fontSize:'var(--font-size-xs)', color:'var(--text-muted)', background:'var(--surface2)', padding:'2px 8px', borderRadius:20 }}>{c.trim()}</span>
                  ))}
                  {q.role && <span style={{ fontSize:'var(--font-size-xs)', color:'var(--accent)', background:'rgba(99,179,237,0.08)', padding:'2px 8px', borderRadius:20 }}>{q.role}</span>}
                  {q.question_type && <span style={{ fontSize:'var(--font-size-xs)', color:'var(--accent2)', background:'rgba(160,118,249,0.10)', padding:'2px 8px', borderRadius:20, fontWeight:500 }}>{q.question_type}</span>}
                  <RoundBadge type={q.round_type} />
                  {q.experience_years && <span style={{ fontSize:'var(--font-size-xs)', color:'var(--text-muted)' }}>{q.experience_years} yrs</span>}
                  {/* Source badge */}
                  <span style={{ fontSize:'var(--font-size-xs)', color:srcColor, background:`${srcColor}18`, padding:'2px 8px', borderRadius:20 }}>
                    {SOURCE_LABELS[q.source]||q.source||'user'}
                  </span>
                </div>
              </div>

              {/* Time */}
              <div style={{ flexShrink:0, textAlign:'right', fontSize:'var(--font-size-xs)', color:'var(--text-muted)' }}>
                <div title={new Date(q.last_seen).toLocaleString()}>{timeAgo(q.last_seen)}</div>
                {q.first_seen !== q.last_seen && (
                  <div style={{ marginTop:3, opacity:0.6 }}>first: {timeAgo(q.first_seen)}</div>
                )}
              </div>
            </article>
          )
        })}
      </div>
    </div>
  )
}