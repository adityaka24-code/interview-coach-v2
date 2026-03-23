import { getPredictionById, updatePredictionOutcome, updateQuestionFeedback, getDb } from '@/lib/db'
import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'

export async function GET(request, { params }) {
  try {
    const { userId } = await auth().catch(() => ({ userId: null }))
    const prediction = await getPredictionById(params.id, userId || null)
    if (!prediction) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ prediction })
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function PATCH(request, { params }) {
  try {
    const { userId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const body = await request.json()

    // Claim an anonymous prediction — only updates rows where user_id IS NULL
    // so we can never steal another user's prediction
    if (body.claim) {
      const db = getDb()
      await db.execute({
        sql:  'UPDATE predictions SET user_id=? WHERE id=? AND user_id IS NULL',
        args: [userId, params.id],
      })
      return NextResponse.json({ ok: true })
    }

    // All other mutations require verified ownership
    const existing = await getPredictionById(params.id, userId)
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
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
