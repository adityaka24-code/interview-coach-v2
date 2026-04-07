import { getPredictionById, updatePredictionOutcome, updateQuestionFeedback, getDb } from '@/lib/db'
import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'

export async function GET(request, { params }) {
  try {
    const { id } = await params
    const { userId } = await auth().catch(() => ({ userId: null }))
    const raw = await getPredictionById(id, userId || null)
    if (!raw) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const prediction = {
      ...raw,
      lowConfidence:      !!raw.low_confidence,
      retrievedQuestions: raw.result?.retrievedQuestions || [],
      retrievalMode:      raw.result?.retrievalMode      || 'none',
    }
    return NextResponse.json({ prediction })
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function PATCH(request, { params }) {
  try {
    const { id } = await params
    const { userId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const body = await request.json()

    // Claim an anonymous prediction — only updates rows where user_id IS NULL
    // so we can never steal another user's prediction
    if (body.claim) {
      const db = getDb()
      await db.execute({
        sql:  'UPDATE predictions SET user_id=? WHERE id=? AND user_id IS NULL',
        args: [userId, id],
      })
      return NextResponse.json({ ok: true })
    }

    // All other mutations require verified ownership
    const existing = await getPredictionById(id, userId)
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (body.outcome !== undefined) {
      await updatePredictionOutcome(id, body.outcome)
    }
    if (body.questionIndex !== undefined) {
      await updateQuestionFeedback(id, body.questionIndex, body.typeIndex, body.wasAsked)

      if (body.wasAsked === 'yes') {
        const db = getDb()
        const pred = await db.execute({
          sql: 'SELECT result FROM predictions WHERE id = ?',
          args: [id],
        })
        if (pred.rows.length > 0) {
          let result = {}
          try { result = JSON.parse(pred.rows[0].result) } catch {}
          const confirmedQuestion = result.predictedQuestions?.[body.typeIndex]
            ?.questions?.[body.questionIndex]?.question
          if (confirmedQuestion) {
            await db.execute({
              sql: `UPDATE pm_questions
                    SET confirmation_count = confirmation_count + 1
                    WHERE LOWER(TRIM(question)) = LOWER(TRIM(?))`,
              args: [confirmedQuestion],
            })
          }
        }
      }
    }
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
