'use client'
import { useState, useEffect, useMemo } from 'react'

function StatusBadge({ status }) {
  if (!status) return null
  const isNew = status === 'New'
  return (
    <span style={{
      fontSize: 11, fontFamily: 'DM Mono', padding: '2px 8px', borderRadius: 20,
      background: isNew ? 'rgba(104,211,145,0.12)' : 'rgba(148,163,184,0.1)',
      border: `1px solid ${isNew ? 'rgba(104,211,145,0.4)' : 'rgba(148,163,184,0.25)'}`,
      color: isNew ? '#68d391' : 'var(--text-muted)',
      whiteSpace: 'nowrap', letterSpacing: '0.3px',
    }}>
      {status}
    </span>
  )
}

function fmt(dateStr) {
  if (!dateStr) return '–'
  // Already a short date string — just return it
  return dateStr
}

export default function OpenJobsPage() {
  const [jobs, setJobs] = useState([])
  const [updatedAt, setUpdatedAt] = useState(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('All')
  const [sort, setSort] = useState('rank')

  useEffect(() => {
    fetch('/api/open-jobs')
      .then(r => r.json())
      .then(d => {
        setJobs(d.jobs || [])
        setUpdatedAt(d.updatedAt || null)
      })
      .catch(err => console.error('[open-jobs] fetch error:', err))
      .finally(() => setLoading(false))
  }, [])

  const filtered = useMemo(() => {
    let out = jobs
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      out = out.filter(j =>
        j.company?.toLowerCase().includes(q) || j.title?.toLowerCase().includes(q)
      )
    }
    if (statusFilter !== 'All') {
      out = out.filter(j => j.status === statusFilter)
    }
    return [...out].sort((a, b) => {
      if (sort === 'rank') {
        const ra = a.rank ?? 9999, rb = b.rank ?? 9999
        return ra !== rb ? ra - rb : (a.company || '').localeCompare(b.company || '')
      }
      if (sort === 'company') return (a.company || '').localeCompare(b.company || '')
      if (sort === 'status') {
        // New first
        const sa = a.status === 'New' ? 0 : 1
        const sb = b.status === 'New' ? 0 : 1
        return sa - sb
      }
      return 0
    })
  }, [jobs, search, statusFilter, sort])

  const companyCount = useMemo(() => new Set(filtered.map(j => j.company)).size, [filtered])

  const fmtUpdated = updatedAt
    ? new Date(updatedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : null

  const inputStyle = {
    padding: '8px 13px', borderRadius: 8,
    border: '1px solid var(--border)', background: 'var(--input-bg)',
    color: 'var(--text)', fontFamily: 'DM Mono', fontSize: 13,
    outline: 'none',
  }

  return (
    <main style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 24px' }}>
      {/* Page title */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontFamily: 'Montserrat', fontSize: 24, fontWeight: 700, color: 'var(--text)', margin: 0 }}>
          Open Jobs
        </h1>
        {loading ? (
          <p style={{ fontFamily: 'DM Mono', fontSize: 13, color: 'var(--text-muted)', marginTop: 6 }}>
            Loading…
          </p>
        ) : jobs.length === 0 ? null : (
          <p style={{ fontFamily: 'DM Mono', fontSize: 13, color: 'var(--text-muted)', marginTop: 6 }}>
            {filtered.length} open {filtered.length === 1 ? 'role' : 'roles'} across {companyCount} {companyCount === 1 ? 'company' : 'companies'}
            {fmtUpdated && <> · Last updated: {fmtUpdated}</>}
          </p>
        )}
      </div>

      {/* Controls */}
      {jobs.length > 0 && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 20 }}>
          <input
            type="search"
            placeholder="Search company or role…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ ...inputStyle, minWidth: 220, flex: 1 }}
            aria-label="Search by company or role"
          />
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            style={{ ...inputStyle, cursor: 'pointer' }}
            aria-label="Filter by status"
          >
            <option value="All">All statuses</option>
            <option value="New">New</option>
            <option value="Open">Open</option>
          </select>
          <select
            value={sort}
            onChange={e => setSort(e.target.value)}
            style={{ ...inputStyle, cursor: 'pointer' }}
            aria-label="Sort order"
          >
            <option value="rank">Company rank</option>
            <option value="company">Company A–Z</option>
            <option value="status">New first</option>
          </select>
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-muted)', fontFamily: 'DM Mono', fontSize: 14 }}>
          Loading roles…
        </div>
      ) : jobs.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: '60px 0',
          color: 'var(--text-muted)', fontFamily: 'DM Mono', fontSize: 14,
          background: 'var(--card-bg)', borderRadius: 12, border: '1px solid var(--border)',
        }}>
          No open roles synced yet — check back after the next refresh.
        </div>
      ) : filtered.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: '40px 0',
          color: 'var(--text-muted)', fontFamily: 'DM Mono', fontSize: 14,
          background: 'var(--card-bg)', borderRadius: 12, border: '1px solid var(--border)',
        }}>
          No roles match your filters.
        </div>
      ) : (
        <div style={{ overflowX: 'auto', borderRadius: 12, border: '1px solid var(--border)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'DM Mono', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)' }}>
                {['Company', 'Rank', 'Role', 'Location', 'Status', 'First Seen', 'Date Posted', 'Link'].map(h => (
                  <th key={h} style={{
                    padding: '10px 14px', textAlign: 'left',
                    color: 'var(--text-muted)', fontWeight: 600, fontSize: 11,
                    letterSpacing: '0.5px', textTransform: 'uppercase', whiteSpace: 'nowrap',
                  }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((job, i) => {
                const isNew = job.status === 'New'
                return (
                  <tr key={job.id} style={{
                    background: isNew ? 'rgba(104,211,145,0.04)' : i % 2 === 0 ? 'var(--card-bg)' : 'var(--bg-secondary)',
                    borderBottom: '1px solid var(--border)',
                    transition: 'background 0.1s',
                  }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--surface2)'}
                    onMouseLeave={e => e.currentTarget.style.background = isNew ? 'rgba(104,211,145,0.04)' : i % 2 === 0 ? 'var(--card-bg)' : 'var(--bg-secondary)'}
                  >
                    <td style={{ padding: '10px 14px', color: 'var(--text)', fontWeight: 600 }}>{job.company}</td>
                    <td style={{ padding: '10px 14px', color: 'var(--text-muted)', textAlign: 'center' }}>
                      {job.rank ?? '–'}
                    </td>
                    <td style={{ padding: '10px 14px', color: 'var(--text)' }}>{job.title}</td>
                    <td style={{ padding: '10px 14px', color: 'var(--text-muted)' }}>{job.location || '–'}</td>
                    <td style={{ padding: '10px 14px' }}><StatusBadge status={job.status} /></td>
                    <td style={{ padding: '10px 14px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{fmt(job.first_seen)}</td>
                    <td style={{ padding: '10px 14px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{fmt(job.date_posted)}</td>
                    <td style={{ padding: '10px 14px' }}>
                      <a
                        href={job.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`Open listing for ${job.title} at ${job.company}`}
                        style={{ color: 'var(--accent)', textDecoration: 'none', fontFamily: 'DM Mono', fontSize: 12 }}
                      >
                        View →
                      </a>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  )
}
