import { getPredictionById, updatePredictionOutcome, updateQuestionFeedback } from '@/lib/db'
import { NextResponse } from 'next/server'
export async function GET(request, { params }) {
  try {
    const prediction = await getPredictionById(params.id)
    if (!prediction) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ prediction })
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
export async function PATCH(request, { params }) {
  try {
    const body = await request.json()
    if (body.outcome !== undefined) {
      await updatePredictionOutcome(params.id, body.outcome)
    }
    if (body.questionIndex !== undefined) {
      await updateQuestionFeedback(params.id, body.questionIndex, body.typeIndex, body.wasAsked)
    }
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
