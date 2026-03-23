import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'

const isPublicRoute = createRouteMatcher([
  '/',
  '/sign-in(.*)',
  '/questions(.*)',
  '/salaries(.*)',
  '/api/questions(.*)',
  '/api/salaries(.*)',
  // Processing routes — safe for unauthenticated use (save with user_id='unknown')
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
])

export default clerkMiddleware(async (auth, req) => {
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

  // Onboarding gate only applies to page routes, not API calls
  if (!pathname.startsWith('/api/')) {
    const onboardingComplete = req.cookies.get('ic_onboarded')?.value === '1'

    if (!onboardingComplete && pathname !== '/onboarding') {
      return NextResponse.redirect(new URL('/onboarding', req.url))
    }
    if (onboardingComplete && pathname === '/onboarding') {
      return NextResponse.redirect(new URL('/', req.url))
    }
  }

  return NextResponse.next()
})

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
