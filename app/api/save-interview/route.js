import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getDb } from '@/lib/db'

export async function POST(request) {
  try {
    const { userId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    const { interviewId } = await request.json()
    if (!interviewId) return NextResponse.json({ error: 'interviewId required' }, { status: 400 })
    const db = getDb()
    await db.execute({
      sql: `UPDATE interviews SET user_id = ? WHERE id = ?`,
      args: [userId, interviewId],
    })
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('save-interview error:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
