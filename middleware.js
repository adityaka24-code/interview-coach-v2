import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'

const isPublicRoute = createRouteMatcher([
  '/',
  '/sign-in(.*)',
  '/questions(.*)',
  '/salaries(.*)',
  '/api/questions(.*)',
  '/api/salaries(.*)',
  '/api/parse-file(.*)',
  '/api/fetch-url(.*)',
  '/api/transcribe(.*)',
  '/api/classify-transcript(.*)',
  '/api/rewrite(.*)',
  '/api/bug-report(.*)',
  '/api/analyze(.*)',
  '/api/predict-questions(.*)',
  '/api/ticker(.*)',
  '/api/predict(.*)',
  '/predict(.*)',
  '/api/predictions(.*)',
  '/onboarding(.*)',
])

export default clerkMiddleware(async (auth, req) => {
  try {
    const pathname = req.nextUrl.pathname

    // Public routes — no auth needed
    if (isPublicRoute(req)) return NextResponse.next()

    // Require authentication
    const { userId } = await auth()
    if (!userId) {
      const signInUrl = new URL('/sign-in', req.url)
      signInUrl.searchParams.set('redirect_url', pathname)
      return NextResponse.redirect(signInUrl)
    }

    return NextResponse.next()
  } catch (err) {
    // If Clerk is misconfigured or throws, fail open so the app stays reachable
    console.error('[middleware] error:', err?.message ?? err)
    return NextResponse.next()
  }
})

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
