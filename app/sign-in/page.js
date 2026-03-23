'use client'
import { Suspense } from 'react'
import { SignIn } from '@clerk/nextjs'
import { useSearchParams, useRouter } from 'next/navigation'

function SignInContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const redirectUrl = searchParams.get('redirect_url') || '/'
  const isPredictFlow = redirectUrl.startsWith('/predict/')

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '75vh',
      padding: '0 24px',
      gap: 20,
    }}>
      <div style={{ textAlign: 'center', maxWidth: 400 }}>
        <div style={{ fontSize: 28, marginBottom: 10 }}>🔒</div>
        <p style={{
          fontFamily: 'Montserrat', fontSize: 18, fontWeight: 700,
          color: 'var(--text)', margin: '0 0 6px',
        }}>
          Please log in / sign up to unlock
        </p>
        <p style={{
          fontFamily: 'DM Mono', fontSize: 13, color: 'var(--text-muted)',
          margin: 0, lineHeight: 1.6,
        }}>
          Your activity, predictions and profile are private to your account.
        </p>
      </div>
      <SignIn routing="hash" fallbackRedirectUrl={redirectUrl} forceRedirectUrl={redirectUrl} />
      {isPredictFlow && (
        <button
          onClick={() => router.push(redirectUrl)}
          style={{
            background: 'none', border: 'none',
            color: 'var(--text-muted)', fontFamily: 'DM Mono',
            fontSize: 13, cursor: 'pointer', padding: '4px 8px',
          }}
        >
          Maybe later — view without saving
        </button>
      )}
    </div>
  )
}

export default function SignInPage() {
  return (
    <Suspense>
      <SignInContent />
    </Suspense>
  )
}
