import Anthropic from '@anthropic-ai/sdk'
import { getQuestionsForRetrieval, savePrediction, savePredictionFeedback } from '@/lib/db'
import { embedText, cosineSimilarity, preprocessQuery } from '@/lib/embeddings'
import { auth } from '@clerk/nextjs/server'

const anthropic = new Anthropic()


/**
 * Exponential-backoff retry.
 * With maxRetries=8 and p≤0.10 individual-call failure rate:
 *   P(all 9 attempts fail) = 0.10^9 = 1×10⁻⁹ < 1/10,000,000 ✓
 *
 * backoff schedule (ms): 400 → 800 → 1600 → 3200 → 6400 → 12800 → 25600 → 30000
 * each delay has ±30 % random jitter to prevent thundering herd
 */
async function withRetry(fn, maxRetries = 8, baseDelay = 400, maxDelay = 30_000) {
  let lastError
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastError = err
      if (attempt === maxRetries) break
      // Never retry auth errors, non-context 400s, or cases where retrying cannot help
      if (err?.noRetry) throw err
      if (err?.status === 401) throw err
      if (err?.status === 400 && !err?.message?.toLowerCase().includes('context')) throw err
      if (err?.status === 529) { // Anthropic overloaded — always retry
        // use longer base delay for overload
        const delay = Math.min(2000 * 2 ** attempt, maxDelay)
        const jitter = delay * 0.4 * Math.random()
        await new Promise(r => setTimeout(r, delay + jitter))
        continue
      }
      const expDelay = Math.min(baseDelay * 2 ** attempt, maxDelay)
      const jitter   = expDelay * 0.3 * Math.random()
      await new Promise(r => setTimeout(r, expDelay + jitter))
    }
  }
  throw lastError
}

/* ─── tool schemas (3 independent tools run in parallel) ─────── */

const QUESTIONS_TOOL = {
  name: 'submit_questions',
  description: 'Submit predicted interview questions grouped by type',
  input_schema: {
    type: 'object',
    properties: {
      predictedQuestions: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            questionType: { type: 'string' },
            questions: {
              type: 'array', minItems: 3, maxItems: 3,
              items: {
                type: 'object',
                properties: {
                  question:    { type: 'string' },
                  probability: { type: 'string', enum: ['high', 'medium', 'low'] },
                  rationale:   { type: 'string' },
                },
                required: ['question', 'probability', 'rationale'],
              },
            },
          },
          required: ['questionType', 'questions'],
        },
      },
    },
    required: ['predictedQuestions'],
  },
}

const GAPS_TOOL = {
  name: 'submit_gaps',
  description: 'Submit CV-vs-JD gap analysis',
  input_schema: {
    type: 'object',
    properties: {
      gapAnalysis: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            jdRequires:  { type: 'string' },
            cvSignal:    { type: 'string' },
            probeRisk:   { type: 'string', enum: ['high', 'medium', 'low'] },
            prepAdvice: {
              type: 'object',
              properties: {
                cvImprovement: { type: 'string' },
                interviewTip:  { type: 'string' },
                other:         { type: 'string' },
              },
              required: ['cvImprovement', 'interviewTip', 'other'],
            },
          },
          required: ['jdRequires', 'cvSignal', 'probeRisk', 'prepAdvice'],
        },
      },
    },
    required: ['gapAnalysis'],
  },
}

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

/* ─── individual Claude callers ──────────────────────────────── */

async function fetchQuestions({ systemBase, retrievalContext, jd, cv, roleLevel, roundType, company }) {
  const retrievalBlock = retrievalContext
    ? `\n${retrievalContext}\n\nGround your predictions in the provided real questions. Identify patterns across them.\n`
    : ''

  const prompt = `${systemBase}

TASK: Predict the most likely interview questions for this role.
Return predictions ordered by likelihood, most likely first. The first prediction should be the single most likely question to be asked.
ROUND TYPE: ${roundType}
ROLE LEVEL: ${roleLevel}
COMPANY: ${company || 'not specified'}

QUESTION TYPES TO PREDICT (3 questions each):
- Screening: BEHAVIOURAL, PRODUCT SENSE, METRIC (max 4 types)
- Loop:      PRODUCT SENSE, BEHAVIOURAL, METRIC, EXECUTION, STRATEGY (5-6 types)
- Panel:     all relevant types (6-8 types)
Only include a type if the JD genuinely signals it.
${retrievalBlock}
JOB DESCRIPTION:
${jd}

CANDIDATE CV:
${cv}`

  const msg = await anthropic.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 3000,
    tools: [QUESTIONS_TOOL],
    tool_choice: { type: 'tool', name: 'submit_questions' },
    messages: [{ role: 'user', content: prompt }],
  })
  const block = msg.content.find(b => b.type === 'tool_use' && b.name === 'submit_questions')
  if (!block?.input) throw new Error('No questions returned from Claude')
  return block.input
}

async function fetchGaps({ systemBase, jd, cv }) {
  const prompt = `${systemBase}

TASK: Identify the most important gaps the interviewer will probe.
Return only high or medium probe-risk gaps. Maximum 3 gaps total.
Even if the CV is a strong match, always identify areas where the candidate could be
stronger or where the JD sets a higher bar than demonstrated.

GAP ANALYSIS RULES:
- Compare JD requirements against CV evidence line by line
- Only include gaps with probe risk "high" or "medium" — omit low-risk gaps entirely
- Ordered by probe risk descending (high first)
- prepAdvice must have all three fields: cvImprovement, interviewTip, other

JOB DESCRIPTION:
${jd}

CANDIDATE CV:
${cv}`

  let msg
  try {
    msg = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 1600,
      tools: [GAPS_TOOL],
      tool_choice: { type: 'tool', name: 'submit_gaps' },
      messages: [{ role: 'user', content: prompt }],
    })
  } catch (err) {
    console.error('[predict][gaps] status:', err?.status, 'message:', err?.message)
    throw err
  }
  if (msg.stop_reason === 'max_tokens') {
    console.error('[predict][gaps] truncated at max_tokens — response incomplete')
    const truncErr = new Error('[gaps] response truncated by max_tokens limit')
    truncErr.noRetry = true
    throw truncErr
  }
  const block = msg.content.find(b => b.type === 'tool_use' && b.name === 'submit_gaps')
  if (!block?.input) throw new Error('No gap analysis returned from Claude')
  return block.input
}

async function fetchCallback({ systemBase, jd, cv, roleLevel, company }) {
  const prompt = `${systemBase}

TASK: Estimate the callback probability for this candidate applying for a ${roleLevel} role at ${company || 'this company'}.

STEP 1 — SCORE THE CV AGAINST THE JD ON FIVE DIMENSIONS:

A. Keyword overlap (0–8 pts)
   Count how many distinct domain-specific buzzwords, tools, and technologies from the JD appear verbatim in the CV.
   0–2 pts:  fewer than 25% of JD keywords present
   3–5 pts:  25–60% of JD keywords present
   6–8 pts:  more than 60% of JD keywords present

B. Skills match (0–22 pts)
   Assess how well the candidate's demonstrated functional skills align with the skills the JD requires (beyond keyword matching — look at evidence of actually doing the work).
   0–7 pts:  fewer than a quarter of required skills evidenced in CV
   8–14 pts: roughly half of required skills evidenced with some depth
   15–19 pts: most required skills evidenced with concrete examples
   20–22 pts: all or nearly all required skills evidenced with strong, relevant examples

C. Seniority match for ${roleLevel} (0–28 pts)
   Does the CV demonstrate ownership, scope, and impact at the right level?
   0–9 pts:   CV shows work well below ${roleLevel} expectations
   10–18 pts: CV shows partial match — some signals but gaps in scope or ownership
   19–24 pts: CV mostly matches ${roleLevel} expectations
   25–28 pts: CV clearly exceeds or exactly matches ${roleLevel} expectations

D. Hard requirement coverage (0–25 pts)
   Find every sentence in the JD containing "required", "must have", "essential", "minimum", or "mandatory".
   For each hard requirement found: does the CV provide clear evidence of meeting it?
   Score = (hard requirements met / total hard requirements found) × 25
   If no hard requirements are stated in the JD, award full 25 pts.

E. CV substance and specificity (0–17 pts)
   0–4 pts:   CV is vague, thin, or lacks metrics and outcomes
   5–9 pts:   CV has some specific achievements but is inconsistent
   10–13 pts: CV is specific with quantified outcomes in most roles
   14–17 pts: CV is consistently specific, metric-driven, and compelling

STEP 2 — COMPUTE THE SCORE:
total = A + B + C + D + E  (out of 100)
withoutReferral = round(10 + (total / 100) × 75), clamped between 1 and 85

withReferral: use the lookup table below. Find the two rows that bracket withoutReferral
and interpolate linearly to get the boost, then add it to withoutReferral.

  base% |  boost%
  ------|---------
    0   |    0
   10   |    5
   25   |   10
   35   |   18
   50   |   25
   60   |   23
   70   |   18

For base ≥ 75: withReferral = 90 (hard cap — boost shrinks so total never exceeds 90).
For base 70–74: interpolate boost linearly from 18 down to 15 (i.e. boost = 18 − 0.6 × (base − 70)), then add to base, capped at 90.

Example: base = 50 → boost = 25 → withReferral = 75.
Example: base = 40 → interpolate between (35,18) and (50,25): boost = 18 + (7/15)×(40−35) = 20 → withReferral = 60.
Example: base = 65 → interpolate between (60,23) and (70,18): boost = 23 − 0.5×(65−60) = 21 → withReferral = 86, capped at 90.

STEP 3 — ASSIGN VERDICT:
"strong fit"  if withoutReferral ≥ 65
"competitive" if withoutReferral 40–64
"longshot"    if withoutReferral < 40

STEP 4 — WRITE REASONING:
One sentence stating total score and each dimension score (e.g. "Total: 67/100 — Keywords: 5/8, Skills: 16/22, Seniority: 20/28, Hard reqs: 15/25, CV substance: 11/17."). Then one sentence on the single biggest strength and one on the single biggest risk.

STEP 5 — IDENTIFY SIGNALS:
strengths: 2–3 specific things from the CV that directly match the JD
risks: 2–3 specific gaps where the JD requires something the CV does not demonstrate

JOB DESCRIPTION:
${jd}

CANDIDATE CV:
${cv}`

  const msg = await anthropic.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 800,
    temperature: 0,
    tools: [CALLBACK_TOOL],
    tool_choice: { type: 'tool', name: 'submit_callback' },
    messages: [{ role: 'user', content: prompt }],
  })
  const block = msg.content.find(b => b.type === 'tool_use' && b.name === 'submit_callback')
  if (!block?.input) throw new Error('No callback estimate returned from Claude')
  return block.input
}

/* ─── route handler ──────────────────────────────────────────── */

export async function POST(request) {
  let body
  try { body = await request.json() } catch {
    return new Response('{"error":"Invalid JSON"}', { status: 400, headers: { 'Content-Type': 'application/json' } })
  }
  const { jdText, cvText, roleLevel, roundType, company } = body
  if (!jdText || !cvText) {
    return new Response('{"error":"jdText and cvText are required"}', { status: 400, headers: { 'Content-Type': 'application/json' } })
  }

  const jd = jdText.slice(0, 4000)
  const cv = cvText.slice(0, 6000)

  // userId — optional (predictions work without auth)
  let userId = null
  try { const { userId: uid } = await auth(); userId = uid || null } catch {}

  // ── Retrieval pipeline ────────────────────────────────────────
  const queryText = preprocessQuery(company, roleLevel, jdText || '')

  let queryVector = null
  try {
    queryVector = await embedText(queryText)
  } catch (e) {
    console.error('[predict] embedText error:', e.message)
  }

  let top10 = []
  let topScore = 0
  let companyMatch = false
  try {
    const { questions: candidates, companyMatch: cm } = await getQuestionsForRetrieval(company)
    companyMatch = cm

    if (candidates.length > 0) {
      if (queryVector !== null) {
        const scored = candidates.flatMap(c => {
          let vec
          try { vec = JSON.parse(c.embedding) } catch { return [] }
          const ageInDays = (Date.now() - new Date(c.timestamp).getTime()) / 86400000
          const decay = Math.exp(-0.001 * ageInDays)
          const confirmations = c.confirmation_count ?? 0
          const confirmationBoost = 1 + (0.05 * Math.min(confirmations, 10))
          return [{ ...c, _score: cosineSimilarity(queryVector, vec) * decay * confirmationBoost }]
        })
        scored.sort((a, b) => b._score - a._score)
        top10 = scored.slice(0, 10)
        topScore = top10[0]?._score ?? 0
      } else {
        // Embedding failed — fall back to ranking by confirmation count + recency
        const sorted = [...candidates].sort((a, b) => {
          const confDiff = (b.confirmation_count ?? 0) - (a.confirmation_count ?? 0)
          if (confDiff !== 0) return confDiff
          return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        })
        top10 = sorted.slice(0, 10).map(c => ({ ...c, _score: 0 }))
      }
    }
  } catch (e) {
    console.error('[predict] retrieval error:', e.message)
  }

  const lowConfidence = (
    queryVector === null ||
    top10.length < 5 ||
    companyMatch === false
  )

  let retrievalContext = ''
  if (!lowConfidence) {
    retrievalContext =
      `Here are real questions asked at ${company} interviews:\n` +
      top10.map((q, i) => `${i + 1}. [${q.question_type}] ${q.question}`).join('\n')
  }

  const systemBase = `You are a world-class PM interview coach. Given a job description and candidate CV, your job is to help the candidate prepare.`

  const ctx = { systemBase, retrievalContext, jd, cv, roleLevel, roundType, company }

  /* ── SSE stream ─────────────────────────────────────────────── */
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event, data) => {
        try {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
          )
        } catch { /* controller already closed */ }
      }

      // Collected results
      let questionsResult = null
      let gapsResult      = null
      let callbackResult  = null
      const errors        = []

      send('status', { message: 'Running 3 analyses in parallel…' })

      // Fire all 3 in parallel; each streams its section the moment it resolves
      await Promise.allSettled([

        withRetry(() => fetchQuestions(ctx))
          .then(result => {
            questionsResult = result
            send('questions', result)
          })
          .catch(err => {
            errors.push({ section: 'questions', message: err.message })
            send('section_error', { section: 'questions', message: err.message })
          }),

        withRetry(() => fetchGaps(ctx))
          .then(result => {
            gapsResult = result
            send('gaps', result)
          })
          .catch(err => {
            errors.push({ section: 'gaps', message: err.message })
            send('section_error', { section: 'gaps', message: err.message })
          }),

        withRetry(() => fetchCallback(ctx))
          .then(result => {
            callbackResult = result
            send('callback', result)
          })
          .catch(err => {
            errors.push({ section: 'callback', message: err.message })
            send('section_error', { section: 'callback', message: err.message })
          }),

      ])

      // Require at least questions to save a meaningful report
      if (!questionsResult) {
        send('fatal', { message: 'Question prediction failed after 9 attempts. Please try again.' })
        controller.close()
        return
      }

      // Save to DB
      try {
        const result = {
          predictedQuestions:  questionsResult.predictedQuestions  || [],
          gapAnalysis:         gapsResult?.gapAnalysis             || [],
          callbackProbability: callbackResult?.callbackProbability || null,
          signals:             callbackResult?.signals             || null,
        }
        const retrievedQuestions = top10.map((q, i) => ({
          rank:          i + 1,
          question:      q.question,
          question_type: q.question_type,
          company:       q.company,
          source:        q.source        || 'lewis_lin',
          source_label:  q.source_label  || 'Lewis Lin PM Question Bank',
          source_url:    q.source_url    || null,
          score:         parseFloat(q._score.toFixed(4)),
        }))
        const retrievalMode =
          top10.length === 0 ? 'none'
          : !companyMatch    ? 'role_fallback'
          :                    'company_match'
        const id = await savePrediction({
          company, roleLevel, roundType, jdText, cvText,
          result, userId,
          lowConfidence,
          retrievedQuestions,
          retrievalMode,
        })
        send('complete', {
          id,
          lowConfidence,
          retrievalMode,
          topQuestion: questionsResult.predictedQuestions?.[0] || null,
        })

        // Fire-and-forget: record each retrieved question as a feedback seed
        if (retrievalContext) {
          ;(async () => {
            try {
              for (const q of top10) {
                await savePredictionFeedback({
                  predictionId: id,
                  questionText: q.question,
                  wasAsked: false,
                  interviewId: null,
                })
              }
            } catch (err) {
              console.error('[predict] savePredictionFeedback error:', err.message)
            }
          })()
        }
      } catch (err) {
        console.error('[predict] DB save error:', err)
        send('fatal', { message: 'Report generated but failed to save. Please try again.' })
      }

      controller.close()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type':     'text/event-stream',
      'Cache-Control':    'no-cache, no-transform',
      'X-Accel-Buffering':'no',
      'Connection':       'keep-alive',
    },
  })
}
