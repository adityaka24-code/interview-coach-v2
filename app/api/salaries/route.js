import { NextResponse } from 'next/server'
import { getDb, initSchema } from '@/lib/db'

function median(arr) {
  if (!arr.length) return null
  const s = [...arr].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2)
}

function relevanceScore(row, filters) {
  let score = 0
  if (filters.role && row.role?.toLowerCase().includes(filters.role.toLowerCase())) score += 4
  if (filters.company && row.company?.toLowerCase() === filters.company.toLowerCase()) score += 3
  if (filters.location && row.location?.toLowerCase().includes(filters.location.toLowerCase())) score += 2
  if (filters.experienceYears && row.experience_years === filters.experienceYears) score += 2
  return score
}

function buildWhereClause(filters) {
  const conditions = []
  const args = []
  if (filters.role) { conditions.push("LOWER(role) LIKE ?"); args.push(`%${filters.role.toLowerCase()}%`) }
  if (filters.company) { conditions.push("LOWER(company) = ?"); args.push(filters.company.toLowerCase()) }
  if (filters.location) { conditions.push("LOWER(location) LIKE ?"); args.push(`%${filters.location.toLowerCase()}%`) }
  if (filters.experienceYears) { conditions.push("experience_years = ?"); args.push(filters.experienceYears) }
  return { where: conditions.length ? `WHERE ${conditions.join(' AND ')}` : '', args }
}

function getPeriodBounds() {
  const now = new Date()
  const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate())

  const weekAgo = new Date(startOfDay(now)); weekAgo.setDate(weekAgo.getDate() - 7)
  const twoWeeksAgo = new Date(startOfDay(now)); twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14)

  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0)

  const quarterMonth = Math.floor(now.getMonth() / 3) * 3
  const quarterStart = new Date(now.getFullYear(), quarterMonth, 1)
  const prevQuarterStart = new Date(now.getFullYear(), quarterMonth - 3, 1)
  const prevQuarterEnd = new Date(now.getFullYear(), quarterMonth, 0)

  const fmt = (d) => d.toISOString().split('T')[0]
  return {
    weekAgo: fmt(weekAgo), twoWeeksAgo: fmt(twoWeeksAgo),
    monthStart: fmt(monthStart), prevMonthStart: fmt(prevMonthStart), prevMonthEnd: fmt(prevMonthEnd),
    quarterStart: fmt(quarterStart), prevQuarterStart: fmt(prevQuarterStart), prevQuarterEnd: fmt(prevQuarterEnd),
    today: fmt(now),
  }
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url)
    const filters = {
      role: searchParams.get('role') || '',
      company: searchParams.get('company') || '',
      location: searchParams.get('location') || '',
      experienceYears: searchParams.get('experienceYears') || '',
    }

    await initSchema() // D-01: ensures tables + migrations run before any query
    let db
    try { db = getDb() } catch {
      return NextResponse.json({
        salaries: [], median: null, total: 0,
        counts: { lastWeek: 0, prevWeek: 0, lastMonth: 0, prevMonth: 0, lastQuarter: 0, prevQuarter: 0 },
        growth: { wow: 0, mom: 0, qoq: 0 },
        monthlyMedians: [],
        options: { companies: [], roles: [], locations: [] },
        dbUnavailable: true,
      })
    }
    const { where, args } = buildWhereClause(filters)
    const p = getPeriodBounds()

    // === All filtered interviews ===
    const allRes = await db.execute({ sql: `SELECT * FROM interviews ${where} ORDER BY date DESC`, args })
    const all = allRes.rows

    // === Salary list (top 10 most relevant) ===
    const withSalary = all.filter(r => r.salary_min)
    const scored = withSalary
      .map(r => ({ ...r, _score: relevanceScore(r, filters) }))
      .sort((a, b) => b._score - a._score || new Date(b.date) - new Date(a.date))
      .slice(0, 10)

    const midpoints = scored.filter(r => r.salary_min && r.salary_max)
      .map(r => Math.round((r.salary_min + r.salary_max) / 2))

    // === Interview counts by period ===
    const inPeriod = (rows, from, to) =>
      rows.filter(r => r.date >= from && (!to || r.date <= to)).length

    const counts = {
      lastWeek:      inPeriod(all, p.weekAgo, p.today),
      prevWeek:      inPeriod(all, p.twoWeeksAgo, p.weekAgo),
      lastMonth:     inPeriod(all, p.monthStart, p.today),
      prevMonth:     inPeriod(all, p.prevMonthStart, p.prevMonthEnd),
      lastQuarter:   inPeriod(all, p.quarterStart, p.today),
      prevQuarter:   inPeriod(all, p.prevQuarterStart, p.prevQuarterEnd),
    }

    function growth(curr, prev) {
      if (prev === 0) return curr > 0 ? 100 : 0
      return Math.round(((curr - prev) / prev) * 100)
    }

    // === Monthly median salary chart ===
    // Get all months from Mar 2026 forward
    const startYear = 2026, startMonth = 2 // 0-indexed: March
    const now = new Date()
    const months = []
    let y = startYear, m = startMonth
    while (y < now.getFullYear() || (y === now.getFullYear() && m <= now.getMonth())) {
      const label = new Date(y, m, 1).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })
      const from = `${y}-${String(m + 1).padStart(2, '0')}-01`
      const to = new Date(y, m + 1, 0).toISOString().split('T')[0]
      const rowsInMonth = all.filter(r => r.salary_min && r.date >= from && r.date <= to)
      const mids = rowsInMonth.filter(r => r.salary_max)
        .map(r => Math.round((r.salary_min + r.salary_max) / 2))
      const medMid = median(mids.length ? mids : rowsInMonth.map(r => r.salary_min))
      months.push({ month: label, median: medMid, count: rowsInMonth.length })
      m++
      if (m > 11) { m = 0; y++ }
    }

    // === Filter options from all interviews (unfiltered) ===
    const allUnfilteredRes = await db.execute({ sql: 'SELECT DISTINCT company, role, location FROM interviews ORDER BY company', args: [] })
    const companies = [...new Set(allUnfilteredRes.rows.map(r => r.company).filter(Boolean))].sort()
    const roles = [...new Set(allUnfilteredRes.rows.map(r => r.role).filter(Boolean))].sort()
    const locations = [...new Set(allUnfilteredRes.rows.map(r => r.location).filter(Boolean))].sort()

    return NextResponse.json({
      salaries: scored,
      median: median(midpoints),
      total: all.length,
      counts,
      growth: {
        wow: growth(counts.lastWeek, counts.prevWeek),
        mom: growth(counts.lastMonth, counts.prevMonth),
        qoq: growth(counts.lastQuarter, counts.prevQuarter),
      },
      monthlyMedians: months,
      options: { companies, roles, locations },
    })
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
