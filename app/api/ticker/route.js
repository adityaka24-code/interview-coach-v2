import { NextResponse } from 'next/server'
import { getDb, initSchema } from '@/lib/db'

// Public endpoint — returns anonymised salary/company data for the live ticker.
// No auth required. No personal data (no transcript, analysis, CV, user IDs).
export async function GET() {
  try {
    await initSchema()
    const db = getDb()
    const res = await db.execute({
      sql: `SELECT company, role, salary_min, salary_max, salary_currency, date
            FROM interviews
            WHERE (salary_min IS NOT NULL OR salary_max IS NOT NULL)
              AND company != ''
            ORDER BY date DESC
            LIMIT 30`,
      args: [],
    })
    return NextResponse.json({ items: res.rows })
  } catch (e) {
    console.error('[ticker]', e.message)
    return NextResponse.json({ items: [] })
  }
}
