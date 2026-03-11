import { NextResponse } from 'next/server'
import { getUser, upsertUser } from '@/lib/db'

export async function GET() {
  try { return NextResponse.json({ user: await getUser() }) }
  catch (e) { return NextResponse.json({ error: e.message }, { status: 500 }) }
}

export async function POST(request) {
  try {
    const data = await request.json()
    await upsertUser(data)
    return NextResponse.json({ ok: true })
  } catch (e) { return NextResponse.json({ error: e.message }, { status: 500 }) }
}