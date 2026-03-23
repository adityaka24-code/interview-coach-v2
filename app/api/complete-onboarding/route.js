import { auth, currentUser, clerkClient } from '@clerk/nextjs/server'
import { getOrCreateUser, getUser, upsertUser } from '@/lib/db'
import { NextResponse } from 'next/server'

const COOKIE_NAME = 'ic_onboarded'
const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  maxAge: 60 * 60 * 24 * 365, // 1 year
  path: '/',
}

// GET — called on onboarding page mount to recover state for returning users
// who lost their cookie (different device / cleared cookies / first-time after migration)
export async function GET() {
  try {
    const { userId } = await auth()
    if (!userId) return NextResponse.json({ complete: false })

    const user = await getUser(userId)
    const complete = !!(user?.onboarding_complete)

    const res = NextResponse.json({ complete })
    if (complete) {
      // Re-set cookie so middleware allows them through from now on
      res.cookies.set(COOKIE_NAME, '1', COOKIE_OPTS)
    }
    return res
  } catch (err) {
    console.error('[onboarding-check]', err.message)
    return NextResponse.json({ complete: false })
  }
}

// POST — called when user submits the onboarding form
export async function POST(request) {
  const steps = []
  try {
    const { userId } = await auth()
    steps.push('auth:ok')
    if (!userId) return NextResponse.json({ error: 'Unauthorized', steps }, { status: 401 })

    const data = await request.json()
    steps.push('body:ok')

    const clerkUser = await currentUser()
    steps.push('clerkUser:ok')
    const email = clerkUser?.emailAddresses[0]?.emailAddress || ''
    const clerkName = clerkUser?.fullName || clerkUser?.firstName || 'Me'

    await getOrCreateUser(userId, email, clerkName)
    steps.push('db:getOrCreate:ok')

    await upsertUser(userId, {
      name: data.name || clerkName,
      email,
      title: data.title || '',
      org: data.org || '',
      age: data.age || null,
      cv_text: '',
      portfolio_text: '',
      onboarding_complete: 1,
    })
    steps.push('db:upsert:ok')

    // Best-effort Clerk metadata update (non-fatal)
    try {
      const client = await clerkClient()
      await client.users.updateUserMetadata(userId, {
        publicMetadata: { onboardingComplete: true },
      })
      steps.push('clerk:metadata:ok')
    } catch (clerkErr) {
      console.error('[complete-onboarding] Clerk metadata failed:', clerkErr.message)
      steps.push('clerk:metadata:skipped')
    }

    console.log('[complete-onboarding] steps:', steps)

    const res = NextResponse.json({ ok: true, steps })
    res.cookies.set(COOKIE_NAME, '1', COOKIE_OPTS)
    return res
  } catch (err) {
    console.error('[complete-onboarding] FAILED after', steps, err.message)
    return NextResponse.json({ error: err.message, steps }, { status: 500 })
  }
}
