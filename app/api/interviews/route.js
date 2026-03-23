import { NextResponse } from 'next/server'
import { getDb, listInterviews, getInterview } from '@/lib/db'
import { auth } from '@clerk/nextjs/server'

export async function DELETE(request) {
  try {
    const { userId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
    const db = getDb()
    await db.execute({ sql: 'DELETE FROM interviews WHERE id=? AND user_id=?', args: [id, userId] })
    return NextResponse.json({ success: true })
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function GET(request) {
  try {
    const { userId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    if (id) {
      const interview = await getInterview(id, userId)
      if (!interview) return NextResponse.json({ error: 'Not found' }, { status: 404 })
      return NextResponse.json({ interview })
    }
    return NextResponse.json({ interviews: await listInterviews(userId) })
  } catch (e) { return NextResponse.json({ error: e.message }, { status: 500 }) }
}
