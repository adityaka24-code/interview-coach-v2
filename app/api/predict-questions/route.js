import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { getDb } from '@/lib/db'

const client = new Anthropic()

export async function POST(request) {
  try {
    const { company, role, roundType } = await request.json()

    if (!company && !role) {
      return NextResponse.json({ error: 'company or role is required' }, { status: 400 })
    }

    // Fetch relevant questions from DB as few-shot context
    const db = await getDb()
    let questions = []
    try {
      const rows = await db.execute(
        'SELECT question_text, question_type, company FROM pm_questions WHERE company = ? LIMIT 20',
        [company]
      )
      questions = rows.rows
    } catch { /* table may not exist yet */ }

    if (questions.length < 10) {
      try {
        const rows = await db.execute(
          'SELECT question_text, question_type, company FROM pm_questions LIMIT 40'
        )
        // merge, deduplicate
        const seen = new Set(questions.map(q => q.question_text))
        for (const q of rows.rows) {
          if (!seen.has(q.question_text)) {
            questions.push(q)
            seen.add(q.question_text)
          }
        }
      } catch { /* ignore */ }
    }

    const fewShotLines = questions.length > 0
      ? '\n\nHere are real PM interview questions from the database for context:\n' +
        questions.slice(0, 30).map(q => `- [${q.question_type || 'UNKNOWN'}] ${q.question_text}`).join('\n')
      : ''

    const prompt = `You are an expert PM interview coach. Given a target role and round type, return a ranked list of 8–10 questions most likely to be asked.

Target company: ${company || 'Not specified'}
Target role: ${role || 'PM'}
Round type: ${roundType || 'loop'}${fewShotLines}

Return ONLY a JSON array (no markdown fences) where each element has:
- "text": the question text
- "type": question type (PRODUCT_SENSE, BEHAVIOURAL, ESTIMATION, METRIC, EXECUTION, STRATEGY, DESIGN, CASE_STUDY, or TECHNICAL)
- "likelihood": a number 1–5 (5 = very likely)
- "rationale": one sentence explaining why this is likely

Sort by likelihood descending. Return 8–10 questions.`

    const msg = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1500,
      messages: [{ role: 'user', content: prompt }],
    })

    const raw = msg.content[0]?.text || '[]'
    let parsed
    try {
      // strip markdown fences if present
      const clean = raw.replace(/^```[a-z]*\n?/i, '').replace(/```$/, '').trim()
      parsed = JSON.parse(clean)
    } catch {
      parsed = []
    }

    return NextResponse.json({ questions: parsed })
  } catch (err) {
    console.error('predict-questions error:', err)
    return NextResponse.json({ error: err.message || 'Failed to predict questions' }, { status: 500 })
  }
}
