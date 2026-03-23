import { NextResponse } from 'next/server'
import { getOrCreateUser, getUser, upsertUser } from '@/lib/db'
import { auth, currentUser } from '@clerk/nextjs/server'

export async function GET() {
  try {
    const { userId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    // Ensure user row exists (lazy creation)
    const clerkUser = await currentUser()
    await getOrCreateUser(
      userId,
      clerkUser?.emailAddresses[0]?.emailAddress || '',
      clerkUser?.fullName || clerkUser?.firstName || 'Me'
    )
    return NextResponse.json({ user: await getUser(userId) })
  } catch (e) { return NextResponse.json({ error: e.message }, { status: 500 }) }
}

export async function POST(request) {
  try {
    const { userId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const data = await request.json()
    // Always preserve onboarding_complete=1 — only onboarded users can reach profile
    await upsertUser(userId, { ...data, onboarding_complete: 1 })
    return NextResponse.json({ ok: true })
  } catch (e) { return NextResponse.json({ error: e.message }, { status: 500 }) }
}
