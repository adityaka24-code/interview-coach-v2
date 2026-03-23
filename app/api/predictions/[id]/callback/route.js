import Anthropic from '@anthropic-ai/sdk'
import { getPredictionById } from '@/lib/db'
import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

const anthropic = new Anthropic()

const CALLBACK_TOOL = {
  name: 'submit_callback',
  description: 'Submit callback probability estimate',
  input_schema: {
    type: 'object',
    properties: {
      callbackProbability: {
        type: 'object',
        properties: {
          withoutReferral: { type: 'number', description: '0-100 percent' },
          withReferral:    { type: 'number', description: '0-100 percent' },
          verdict:         { type: 'string', enum: ['strong fit', 'competitive', 'longshot'] },
          reasoning:       { type: 'string' },
        },
        required: ['withoutReferral', 'withReferral', 'verdict', 'reasoning'],
      },
      signals: {
        type: 'object',
        properties: {
          strengths: { type: 'array', items: { type: 'string' }, maxItems: 3 },
          risks:     { type: 'array', items: { type: 'string' }, maxItems: 3 },
        },
        required: ['strengths', 'risks'],
      },
    },
    required: ['callbackProbability', 'signals'],
  },
}

// 3-attempt exponential backoff — never retries on 400/401 (bad input, not transient)
async function withRetry(fn, maxRetries = 2, baseDelay = 800) {
  let lastErr
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastErr = err
      if (attempt === maxRetries) break
      if (err?.status === 400 || err?.status === 401) throw err
      const delay = Math.min(baseDelay * 2 ** attempt, 12_000)
      const jitter = delay * 0.3 * Math.random()
      await new Promise(r => setTimeout(r, delay + jitter))
    }
  }
  throw lastErr
}

async function computeCallback({ jd, cv, roleLevel, company }) {
  const systemBase = 'You are a world-class PM interview coach. Given a job description and candidate CV, your job is to help the candidate prepare.'

  const prompt = `${systemBase}

TASK: Estimate the callback probability for this candidate applying for a ${roleLevel} role at ${company || 'this company'}.

STEP 1 — SCORE THE CV AGAINST THE JD ON FOUR DIMENSIONS:

A. Keyword and skills overlap (0–40 pts)
   Count how many distinct skills, tools, and domain terms in the JD also appear in the CV.
   0–10 pts: fewer than 25% of JD terms present in CV
   11–25 pts: 25–50% of JD terms present
   26–35 pts: 50–75% of JD terms present
   36–40 pts: more than 75% of JD terms present

B. Seniority match for ${roleLevel} (0–20 pts)
   Does the CV demonstrate ownership, scope, and impact at the right level?
   0–8 pts:  CV shows work well below ${roleLevel} expectations
   9–14 pts: CV shows partial match — some signals but gaps in scope or ownership
   15–18 pts: CV mostly matches ${roleLevel} expectations
   19–20 pts: CV clearly exceeds or exactly matches ${roleLevel} expectations

C. Hard requirement coverage (0–30 pts)
   Find every sentence in the JD containing "required", "must have", "essential", "minimum", or "mandatory".
   For each hard requirement found: does the CV provide clear evidence of meeting it?
   Score = (hard requirements met / total hard requirements found) × 30
   If no hard requirements are stated in the JD, award full 30 pts.

D. CV substance and specificity (0–10 pts)
   0–3 pts:  CV is vague, thin, or lacks metrics and outcomes
   4–6 pts:  CV has some specific achievements but is inconsistent
   7–8 pts:  CV is specific with quantified outcomes in most roles
   9–10 pts: CV is consistently specific, metric-driven, and compelling

STEP 2 — COMPUTE THE SCORE: total = A + B + C + D  (out of 100)
withoutReferral = round(10 + (total / 100) × 75), clamped between 1 and 85
withReferral = withoutReferral + round((1 - withoutReferral/100) × 28), clamped at 95 maximum

STEP 3 — ASSIGN VERDICT:
"strong fit"  if withoutReferral ≥ 65
"competitive" if withoutReferral 40–64
"longshot"    if withoutReferral < 40

STEP 4 — WRITE REASONING: One sentence stating total score and each dimension score (e.g. "Total: 67/100 — Skills: 28/40, Seniority: 16/20, Hard reqs: 18/30, CV substance: 5/10."). Then one sentence on the single biggest strength and one on the single biggest risk.

STEP 5 — IDENTIFY SIGNALS:
strengths: 2–3 specific things from the CV that directly match the JD
risks: 2–3 specific gaps where the JD requires something the CV does not demonstrate

JOB DESCRIPTION:
${jd}

CANDIDATE CV:
${cv}`

  const msg = await anthropic.messages.create({
    model: 'claude-sonnet-4-5',
    // 1500 tokens — generous headroom so reasoning never truncates
    max_tokens: 1500,
    temperature: 0,
    tools: [CALLBACK_TOOL],
    tool_choice: { type: 'tool', name: 'submit_callback' },
    messages: [{ role: 'user', content: prompt }],
  })

  const block = msg.content.find(b => b.type === 'tool_use' && b.name === 'submit_callback')
  if (!block?.input) throw new Error('No callback estimate returned from Claude')
  return block.input
}

export async function POST(request, { params }) {
  try {
    const { userId } = await auth().catch(() => ({ userId: null }))
    const prediction = await getPredictionById(params.id, userId)
    if (!prediction) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const jd = (prediction.jd_text || '').slice(0, 4000)
    const cv = (prediction.cv_text || '').slice(0, 6000)
    if (!jd || !cv) {
      return NextResponse.json({ error: 'JD or CV not stored for this prediction' }, { status: 422 })
    }

    const callbackResult = await withRetry(() =>
      computeCallback({
        jd,
        cv,
        roleLevel: prediction.role_level || 'PM',
        company:   prediction.company   || '',
      })
    )

    // Merge into the existing result and persist
    const updatedResult = {
      ...prediction.result,
      callbackProbability: callbackResult.callbackProbability,
      signals:             callbackResult.signals,
    }
    const db = getDb()
    await db.execute({
      sql:  'UPDATE predictions SET result=? WHERE id=?',
      args: [JSON.stringify(updatedResult), params.id],
    })

    return NextResponse.json({
      callbackProbability: callbackResult.callbackProbability,
      signals:             callbackResult.signals,
    })
  } catch (err) {
    console.error('[callback recompute]', err)
    return NextResponse.json({ error: err.message || 'Failed to compute' }, { status: 500 })
  }
}
