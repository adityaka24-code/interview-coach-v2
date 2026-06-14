import { NextResponse } from 'next/server'
import { getDb, initSchema } from '@/lib/db'

export async function GET() {
  try {
    await initSchema()
    const db = getDb()
    const res = await db.execute({
      sql: `SELECT id, company, company_rank AS rank, title, location, link, status, first_seen, date_posted, updated_at
            FROM open_jobs
            ORDER BY CASE WHEN company_rank IS NULL THEN 1 ELSE 0 END, company_rank ASC, company ASC`,
      args: [],
    })
    const jobs = res.rows.map(r => ({
      id: r.id,
      company: r.company,
      rank: r.rank,
      title: r.title,
      location: r.location,
      link: r.link,
      status: r.status,
      first_seen: r.first_seen,
      date_posted: r.date_posted,
    }))
    const updatedAt = res.rows.reduce((max, r) => {
      if (!r.updated_at) return max
      return !max || r.updated_at > max ? r.updated_at : max
    }, null)
    return NextResponse.json({ jobs, updatedAt })
  } catch (err) {
    console.error('[open-jobs] GET error:', err.message)
    return NextResponse.json({ error: 'Failed to fetch jobs' }, { status: 500 })
  }
}

export async function POST(request) {
  const secret = process.env.OPEN_JOBS_SYNC_SECRET
  const auth = request.headers.get('Authorization') || ''
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { jobs } = body
  if (!Array.isArray(jobs)) {
    return NextResponse.json({ error: 'Body must have a "jobs" array' }, { status: 400 })
  }

  for (let i = 0; i < jobs.length; i++) {
    const j = jobs[i]
    if (!j.company || !j.title || !j.link) {
      return NextResponse.json({
        error: `Row ${i} missing required field(s): company, title, link`,
        row: i,
      }, { status: 400 })
    }
  }

  try {
    await initSchema()
    const db = getDb()
    const now = new Date().toISOString()

    await db.execute({ sql: 'DELETE FROM open_jobs', args: [] })
    for (const j of jobs) {
      await db.execute({
        sql: `INSERT INTO open_jobs (company, company_rank, title, location, link, status, first_seen, date_posted, updated_at)
              VALUES (:company, :rank, :title, :location, :link, :status, :first_seen, :date_posted, :updated_at)`,
        args: {
          company: j.company,
          rank: j.rank ?? null,
          title: j.title,
          location: j.location ?? null,
          link: j.link,
          status: j.status ?? null,
          first_seen: j.first_seen ?? null,
          date_posted: j.date_posted ?? null,
          updated_at: now,
        },
      })
    }

    return NextResponse.json({ ok: true, count: jobs.length, updatedAt: now })
  } catch (err) {
    console.error('[open-jobs] POST sync error:', err.message)
    return NextResponse.json({ error: 'Sync failed', detail: err.message }, { status: 500 })
  }
}
