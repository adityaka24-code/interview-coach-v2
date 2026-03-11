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

const CURRENCIES = { USD:'$', INR:'₹', GBP:'£', EUR:'€', SGD:'S$', AUD:'A$', CAD:'C$' }
const EXP_LABELS = { '':'All experience', '0-2':'0–2 yrs', '2-5':'2–5 yrs', '5-8':'5–8 yrs', '8-12':'8–12 yrs', '12+':'12+ yrs' }

function formatSalary(n, currency) {
  if (!n) return '–'
  const sym = CURRENCIES[currency] || currency || '$'
  if (currency === 'INR') return n >= 100000 ? `${sym}${(n/100000).toFixed(1)}L` : `${sym}${(n/1000).toFixed(0)}K`
  return n >= 1000 ? `${sym}${(n/1000).toFixed(0)}K` : `${sym}${n}`
}

function GrowthBadge({ value, label }) {
  const up = value > 0, flat = value === 0
  const color = up ? '#68d391' : flat ? 'var(--text-muted)' : '#fc8181'
  const bg = up ? 'rgba(104,211,145,0.1)' : flat ? 'rgba(255,255,255,0.04)' : 'rgba(252,129,129,0.1)'
  const arrow = up ? '↑' : flat ? '–' : '↓'
  return (
    <span style={{ display:'inline-flex', alignItems:'center', gap:3, fontSize:12, color, background:bg, padding:'2px 7px', borderRadius:20, fontFamily:'DM Mono', border:`1px solid ${color}22` }}>
      {arrow} {Math.abs(value)}% {label}
    </span>
  )
}

function SalaryChart({ data, currency, activeFilters }) {
  if (!data || data.length === 0) return null
  const hasData = data.some(d => d.median)
  if (!hasData) return (
    <div style={{ textAlign:'center', padding:'32px 0', color:'var(--text-muted)', fontSize:14 }}>
      No salary data yet — add salary ranges when logging interviews.
    </div>
  )

  const vals = data.map(d => d.median).filter(Boolean)
  const max = Math.max(...vals)
  const min = Math.min(...vals)
  const range = max - min || 1
  const W = 600, H = 120, pad = { l:60, r:20, t:16, b:32 }
  const chartW = W - pad.l - pad.r
  const chartH = H - pad.t - pad.b

  const pts = data.map((d, i) => ({
    x: pad.l + (i / Math.max(data.length - 1, 1)) * chartW,
    y: d.median ? pad.t + chartH - ((d.median - min) / range) * chartH : null,
    d,
  }))

  const pathD = pts.reduce((acc, p, i) => {
    if (!p.y) return acc
    const cmd = !acc ? `M${p.x},${p.y}` : `L${p.x},${p.y}`
    return acc + cmd
  }, '')

  const sym = CURRENCIES[currency] || '$'
  const fmt = (n) => n >= 100000 ? `${sym}${(n/100000).toFixed(1)}L` : n >= 1000 ? `${sym}${(n/1000).toFixed(0)}K` : `${sym}${n}`

  return (
    <div style={{ overflowX:'auto' }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width:'100%', minWidth:360, height:H }}>
        {/* Grid lines */}
        {[0, 0.5, 1].map(t => {
          const y = pad.t + t * chartH
          const v = max - t * range
          return (
            <g key={t}>
              <line x1={pad.l} y1={y} x2={W - pad.r} y2={y} stroke='rgba(255,255,255,0.04)' strokeWidth={1}/>
              <text x={pad.l - 6} y={y + 4} textAnchor='end' fontSize={9} fill='rgba(255,255,255,0.3)' fontFamily='DM Mono'>{fmt(v)}</text>
            </g>
          )
        })}
        {/* Line */}
        {pathD && <path d={pathD} fill='none' stroke='#63b3ed' strokeWidth={2} strokeLinecap='round' strokeLinejoin='round'/>}
        {/* Dots + tooltip areas */}
        {pts.map((p, i) => p.y ? (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r={4} fill='#63b3ed' stroke='var(--bg)' strokeWidth={2}/>
            {/* X labels — show every other to avoid overlap */}
            {i % Math.max(1, Math.floor(data.length / 5)) === 0 && (
              <text x={p.x} y={H - 4} textAnchor='middle' fontSize={9} fill='rgba(255,255,255,0.3)' fontFamily='DM Mono'>{p.d.month}</text>
            )}
          </g>
        ) : null)}
      </svg>
    </div>
  )
}

const inputSt = {
  background:'var(--surface2)', border:'1px solid var(--border)',
  borderRadius:8, padding:'8px 12px', color:'var(--text)',
  fontFamily:'DM Mono', fontSize:13, width:'100%',
}

export default function JobInsightsPage() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState({ role:'', company:'', location:'', experienceYears:'' })

  const activeFilterCount = Object.values(filters).filter(Boolean).length

  const fetch_ = useCallback(() => {
    setLoading(true)
    const params = new URLSearchParams(Object.entries(filters).filter(([,v]) => v))
    fetch(`/api/salaries?${params}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [filters])

  useEffect(() => { fetch_() }, [fetch_])

  const clearFilters = () => setFilters({ role:'', company:'', location:'', experienceYears:'' })
  const medCurrency = data?.salaries?.[0]?.salary_currency || 'USD'

  const activeFilterLabels = [
    filters.role && `Role: ${filters.role}`,
    filters.company && `Company: ${filters.company}`,
    filters.location && `Location: ${filters.location}`,
    filters.experienceYears && `Exp: ${EXP_LABELS[filters.experienceYears]}`,
  ].filter(Boolean)

  return (
    <div style={{ maxWidth:940, margin:'0 auto', padding:'40px 24px' }}>
      <style>{`
        @keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
        .ins-card{background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:20px 22px}
        input:focus,select:focus{outline:none;border-color:rgba(99,179,237,0.4)!important}
      `}</style>

      {/* Header */}
      <div style={{ marginBottom:28 }}>
        <h1 style={{ fontFamily:'Montserrat', fontSize:32, fontWeight:700, color:'var(--text)', marginBottom:4 }}>
          Job Insights
        </h1>
        <p style={{ color:'var(--text-muted)', fontSize:14 }}>
          {loading ? 'Loading…' : `${data?.total ?? 0} interview${data?.total !== 1 ? 's' : ''} logged${activeFilterCount > 0 ? ' · filtered' : ''}`}
        </p>
      </div>

      {/* ══ FILTER BAR ══ */}
      <div style={{
        background:'var(--surface)', border:'1px solid var(--border)',
        borderRadius:14, padding:'16px 18px', marginBottom:20,
        animation:'fadeUp 0.3s ease',
      }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <span style={{ fontSize:12, color:'var(--text-muted)', letterSpacing:'1.5px', textTransform:'uppercase' }}>Filters</span>
            {activeFilterCount > 0 && (
              <span style={{ background:'var(--accent)', color:'#0a0a0f', fontSize:11, fontFamily:'DM Mono', fontWeight:'bold', borderRadius:'50%', width:18, height:18, display:'flex', alignItems:'center', justifyContent:'center' }}>
                {activeFilterCount}
              </span>
            )}
          </div>
          {activeFilterCount > 0 && (
            <button onClick={clearFilters} style={{ background:'none', border:'none', color:'var(--text-muted)', fontSize:12, cursor:'pointer', fontFamily:'DM Mono', textDecoration:'underline' }}>
              Clear all
            </button>
          )}
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'2fr 2fr 2fr 1.5fr', gap:10 }}>
          <input
            value={filters.role} onChange={e => setFilters(f => ({...f, role:e.target.value}))}
            placeholder='Filter by role…' style={{...inputSt, borderColor: filters.role ? 'rgba(99,179,237,0.5)' : undefined}}
          />
          <select value={filters.company} onChange={e => setFilters(f => ({...f, company:e.target.value}))}
            style={{...inputSt, borderColor: filters.company ? 'rgba(99,179,237,0.5)' : undefined}}>
            <option value=''>All companies</option>
            {(data?.options?.companies || []).map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={filters.location} onChange={e => setFilters(f => ({...f, location:e.target.value}))}
            style={{...inputSt, borderColor: filters.location ? 'rgba(99,179,237,0.5)' : undefined}}>
            <option value=''>All locations</option>
            {(data?.options?.locations || []).map(l => <option key={l} value={l}>{l}</option>)}
          </select>
          <select value={filters.experienceYears} onChange={e => setFilters(f => ({...f, experienceYears:e.target.value}))}
            style={{...inputSt, borderColor: filters.experienceYears ? 'rgba(99,179,237,0.5)' : undefined}}>
            {Object.entries(EXP_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>

        {/* Active filter tags */}
        {activeFilterCount > 0 && (
          <div style={{ marginTop:12, display:'flex', flexWrap:'wrap', gap:6, alignItems:'center' }}>
            <span style={{ fontSize:11, color:'var(--text-muted)', letterSpacing:'1px', textTransform:'uppercase' }}>Showing:</span>
            {activeFilterLabels.map(l => (
              <span key={l} style={{ fontSize:12, color:'var(--accent)', background:'rgba(99,179,237,0.08)', border:'1px solid rgba(99,179,237,0.2)', borderRadius:20, padding:'2px 10px', fontFamily:'DM Mono' }}>
                {l}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Filter scope notice */}
      {activeFilterCount > 0 && (
        <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:16, padding:'8px 14px', background:'rgba(99,179,237,0.04)', border:'1px solid rgba(99,179,237,0.15)', borderRadius:8, fontSize:13, color:'var(--accent)' }}>
          <span>⬆</span>
          <span>Filters above apply to all stats, chart &amp; salary data below</span>
        </div>
      )}

      {/* ══ INTERVIEW STATS ══ */}
      <div style={{ marginBottom:8 }}>
        <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:12 }}>
          <span style={{ fontSize:11, color:'var(--text-muted)', letterSpacing:'2px', textTransform:'uppercase' }}>Interviews logged</span>
          {activeFilterCount > 0 && <span style={{ fontSize:9, color:'var(--accent)', letterSpacing:'1px', textTransform:'uppercase', background:'rgba(99,179,237,0.1)', padding:'1px 6px', borderRadius:4 }}>filtered</span>}
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12, marginBottom:20 }}>
          {[
            { label:'This week', key:'lastWeek', prev:'prevWeek', badge:'WOW', bKey:'wow' },
            { label:'This month', key:'lastMonth', prev:'prevMonth', badge:'MOM', bKey:'mom' },
            { label:'This quarter', key:'lastQuarter', prev:'prevQuarter', badge:'QOQ', bKey:'qoq' },
          ].map(({ label, key, badge, bKey }) => (
            <div key={key} className='ins-card' style={{ animation:'fadeUp 0.3s ease' }}>
              <div style={{ fontSize:12, color:'var(--text-muted)', marginBottom:8 }}>{label}</div>
              <div style={{ fontSize:36, fontWeight:'bold', color:'var(--text)', fontFamily:'DM Mono', marginBottom:8, lineHeight:1 }}>
                {loading ? '–' : (data?.counts?.[key] ?? 0)}
              </div>
              {!loading && data?.growth && (
                <GrowthBadge value={data.growth[bKey]} label={badge} />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ══ SALARY TREND CHART ══ */}
      <div className='ins-card' style={{ marginBottom:20, animation:'fadeUp 0.35s ease' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <span style={{ fontSize:11, color:'var(--text-muted)', letterSpacing:'2px', textTransform:'uppercase' }}>Median salary trend</span>
            {activeFilterCount > 0 && <span style={{ fontSize:9, color:'var(--accent)', letterSpacing:'1px', textTransform:'uppercase', background:'rgba(99,179,237,0.1)', padding:'1px 6px', borderRadius:4 }}>filtered</span>}
          </div>
          {data?.median && (
            <div style={{ fontSize:12, color:'#68d391', fontFamily:'DM Mono' }}>
              Overall median: <strong>{formatSalary(data.median, medCurrency)}</strong>
            </div>
          )}
        </div>
        {loading ? (
          <div style={{ textAlign:'center', padding:'32px 0', color:'var(--text-muted)', fontSize:14 }}>Loading…</div>
        ) : (
          <SalaryChart data={data?.monthlyMedians} currency={medCurrency} activeFilters={activeFilterCount > 0} />
        )}
      </div>

      {/* ══ SALARY LIST ══ */}
      {!loading && data?.salaries?.length > 0 && (
        <div style={{ animation:'fadeUp 0.4s ease' }}>
          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:12 }}>
            <span style={{ fontSize:11, color:'var(--text-muted)', letterSpacing:'2px', textTransform:'uppercase' }}>
              Top {data.salaries.length} most relevant
            </span>
            {activeFilterCount > 0 && <span style={{ fontSize:9, color:'var(--accent)', letterSpacing:'1px', textTransform:'uppercase', background:'rgba(99,179,237,0.1)', padding:'1px 6px', borderRadius:4 }}>filtered</span>}
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {data.salaries.map((s, i) => (
              <div key={i} className='ins-card' style={{ padding:'14px 18px', display:'flex', alignItems:'center', gap:16, animation:`fadeUp 0.2s ease ${i*0.04}s both` }}>
                <div style={{ flex:1 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:5 }}>
                    <span style={{ fontSize:15, color:'var(--text)', fontFamily:'Montserrat' }}>{s.company}</span>
                    <span style={{ fontSize:12, color:'var(--text-muted)', background:'var(--surface2)', padding:'2px 8px', borderRadius:20 }}>{s.role}</span>
                    <RoundBadge type={s.round_type} />
                  </div>
                  <div style={{ display:'flex', gap:12, fontSize:12, color:'var(--text-muted)' }}>
                    {s.location && <span>📍 {s.location}</span>}
                    {s.experience_years && <span>⏱ {EXP_LABELS[s.experience_years] || s.experience_years}</span>}
                    <span>{new Date(s.date).toLocaleDateString('en-GB', { month:'short', year:'numeric' })}</span>
                  </div>
                </div>
                <div style={{ textAlign:'right', flexShrink:0 }}>
                  <div style={{ fontSize:20, fontWeight:'bold', color:'#68d391', fontFamily:'DM Mono' }}>
                    {formatSalary(s.salary_min, s.salary_currency)}
                    {s.salary_max && ` – ${formatSalary(s.salary_max, s.salary_currency)}`}
                  </div>
                  <div style={{ fontSize:11, color:'var(--text-muted)', marginTop:2 }}>{s.salary_currency}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {!loading && data?.salaries?.length === 0 && data?.total === 0 && (
        <div style={{ textAlign:'center', padding:60, background:'var(--surface)', borderRadius:16, border:'1px solid var(--border)' }}>
          <div style={{ fontSize:40, marginBottom:12 }}>💰</div>
          <div style={{ color:'var(--text)', fontFamily:'Montserrat', fontSize:17, marginBottom:6 }}>No interviews logged yet</div>
          <div style={{ color:'var(--text-muted)', fontSize:14 }}>Add salary ranges when recording interviews to see insights here</div>
        </div>
      )}

      {!loading && data?.salaries?.length === 0 && data?.total > 0 && (
        <div style={{ textAlign:'center', padding:40, background:'var(--surface)', borderRadius:16, border:'1px solid var(--border)' }}>
          <div style={{ color:'var(--text-muted)', fontSize:14 }}>No salary data matches these filters — try removing some filters above</div>
        </div>
      )}
    </div>
  )
}
