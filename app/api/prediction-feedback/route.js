import { NextResponse } from 'next/server'
import { savePredictionFeedback } from '@/lib/db'

export async function POST(request) {
  let body
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { predictionId, questionText, wasAsked, interviewId } = body

  if (!predictionId || typeof predictionId !== 'string' ||
      !questionText  || typeof questionText  !== 'string') {
    return NextResponse.json({ error: 'predictionId and questionText are required' }, { status: 400 })
  }

  try {
    await savePredictionFeedback({
      predictionId,
      questionText,
      wasAsked: !!wasAsked,
      interviewId: interviewId || null,
    })
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[prediction-feedback] error:', e.message)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
