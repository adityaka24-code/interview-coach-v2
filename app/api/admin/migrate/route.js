import { NextResponse } from 'next/server'
import { runCompanyNormalisationMigration } from '@/lib/db'

// One-time migration endpoint — normalises company names across all tables,
// deduplicates predictions, and creates the unique index.
// Protected by a shared secret set in ADMIN_MIGRATE_SECRET env var.
// Hit once: GET /api/admin/migrate?secret=<ADMIN_MIGRATE_SECRET>
// Safe to call multiple times — fully idempotent.

export async function GET(request) {
  const secret = process.env.ADMIN_MIGRATE_SECRET
  if (!secret) {
    return NextResponse.json(
      { error: 'ADMIN_MIGRATE_SECRET env var not set — refusing to run.' },
      { status: 500 }
    )
  }

  const { searchParams } = new URL(request.url)
  if (searchParams.get('secret') !== secret) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const results = await runCompanyNormalisationMigration()
    return NextResponse.json({ ok: true, results })
  } catch (err) {
    console.error('[migrate] company normalisation failed:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
