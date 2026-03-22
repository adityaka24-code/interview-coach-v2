import Anthropic from '@anthropic-ai/sdk'
import { getDb } from '@/lib/db'
import { NextResponse } from 'next/server'
const anthropic = new Anthropic()
// Normalize raw question_type from pm_questions to app taxonomy
function normalizeType(raw) {
  if (!raw) return 'OTHER'
  const t = raw.toLowerCase()
  if (t.includes('behav') || t.includes('leadership')) return 'BEHAVIOURAL'
  if (t.includes('estimat') || t.includes('guesstim')) return 'ESTIMATION'
  if (t.includes('analytic') || t.includes('metric')) return 'METRIC'
  if (t.includes('execution') || t.includes('delivery') || t.includes('prioriti')) return 'EXECUTION'
  if (t.includes('strategy')) return 'STRATEGY'
  if (t.includes('case')) return 'CASE STUDY'
  if (t.includes('technical') || t.includes('system design')) return 'TECHNICAL'
  if (t.includes('design')) return 'PRODUCT REDESIGN'
  if (t.includes('improvement') || t.includes('improve')) return 'PRODUCT IMPROVEMENT'
  if (t.includes('sense') || t.includes('product')) return 'PRODUCT SENSE'
  return 'OTHER'
}
// Normalize interview_type to round type
function normalizeRound(raw) {
  if (!raw) return 'screening'
  const t = raw.toLowerCase()
  if (t.includes('first') || t.includes('phone') || t.includes('video')) return 'screening'
  if (t.includes('on-site') || t.includes('onsite') || t.includes('in-person') || t.includes('panel')) return 'loop'
  return 'screening'
}
const PREDICT_TOOL = {
  name: 'submit_prediction',
  description: 'Submit predicted interview questions and gap analysis',
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
              type: 'array',
              minItems: 3,
              maxItems: 3,
              items: {
                type: 'object',
                properties: {
                  question: { type: 'string' },
                  probability: { type: 'string', enum: ['high', 'medium', 'low'] },
                  rationale: { type: 'string' }
                },
                required: ['question', 'probability', 'rationale']
              }
            }
          },
          required: ['questionType', 'questions']
        }
      },
      gapAnalysis: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            jdRequires: { type: 'string' },
            cvSignal: { type: 'string' },
            probeRisk: { type: 'string', enum: ['high', 'medium', 'low'] },
            prepAdvice: {
              type: 'object',
              properties: {
                cvImprovement: { type: 'string', description: 'Concrete change to make to the CV to address this gap before applying' },
                interviewTip:  { type: 'string', description: 'What to say or demonstrate in the interview room to handle this probe' },
                other:         { type: 'string', description: 'Any other prep — reading, courses, portfolio work, etc.' }
              },
              required: ['cvImprovement', 'interviewTip', 'other']
            }
          },
          required: ['jdRequires', 'cvSignal', 'probeRisk', 'prepAdvice']
        }
      }
    },
    required: ['predictedQuestions', 'gapAnalysis']
  }
}
export async function POST(request) {
  try {
    const { jdText, cvText, roleLevel, roundType, company } = await request.json()
    if (!jdText || !cvText) {
      return NextResponse.json({ error: 'jdText and cvText are required' }, { status: 400 })
    }
    const jd = jdText.slice(0, 4000)
    const cv = cvText.slice(0, 6000)
    // Fetch ~40 relevant questions from pm_questions as few-shot context
    // Prefer questions matching the target company, fall back to all
    const db = getDb()
    let seedRows = []
    if (company) {
      const companyRes = await db.execute({
        sql: `SELECT question, question_type, interview_type FROM pm_questions
              WHERE company LIKE ? AND question != ''
              ORDER BY RANDOM() LIMIT 20`,
        args: [`%${company}%`]
      })
      seedRows = companyRes.rows
    }
    // Top up to 40 with random questions regardless of company
    const remaining = 40 - seedRows.length
    const generalRes = await db.execute({
      sql: `SELECT question, question_type, interview_type FROM pm_questions
            WHERE question != ''
            ORDER BY RANDOM() LIMIT ?`,
      args: [remaining]
    })
    seedRows = [...seedRows, ...generalRes.rows]
    // Normalize and format seed questions for prompt
    const seedContext = seedRows
      .map(r => `[${normalizeType(r.question_type)} / ${normalizeRound(r.interview_type)}] ${r.question}`)
      .join('\n')
    const systemPrompt = `You are a world-class PM interview coach. Given a job description and candidate CV, predict the most likely interview questions and identify CV gaps the interviewer will probe.
ROUND TYPE: ${roundType}
ROLE LEVEL: ${roleLevel}
COMPANY: ${company || 'not specified'}
QUESTION TYPES TO PREDICT (top 3 questions each):
For a screening round: cover BEHAVIOURAL, PRODUCT SENSE, METRIC — max 4 types.
For a loop: cover PRODUCT SENSE, BEHAVIOURAL, METRIC, EXECUTION, STRATEGY — 5-6 types.
For a panel: cover all relevant types — 6-8 types.
Only include a type if the JD genuinely signals it. Do not include every type for every JD.
GAP ANALYSIS RULES:
- Compare JD requirements against CV evidence line by line
- Flag only real gaps — skills the JD explicitly requires that the CV does not demonstrate
- For each gap: state what JD requires, what CV shows (or does not), probe risk (high/medium/low), one concrete prep action
- Maximum 5 gaps, ordered by probe risk descending
REAL QUESTIONS ASKED AT TOP COMPANIES (use as calibration — do not repeat verbatim, use as style and difficulty reference):
${seedContext}
JOB DESCRIPTION:
${jd}
CANDIDATE CV:
${cv}`
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 4000,
      tools: [PREDICT_TOOL],
      tool_choice: { type: 'tool', name: 'submit_prediction' },
      messages: [{ role: 'user', content: systemPrompt }]
    })
    const toolBlock = message.content.find(b => b.type === 'tool_use' && b.name === 'submit_prediction')
    if (!toolBlock?.input) {
      return NextResponse.json({ error: 'No prediction returned' }, { status: 500 })
    }
    return NextResponse.json(toolBlock.input)
  } catch (err) {
    console.error('Predict error:', err)
    if (err?.status === 401) return NextResponse.json({ error: 'Invalid Anthropic API key' }, { status: 401 })
    if (err?.status === 429) return NextResponse.json({ error: 'Rate limit — please wait a moment' }, { status: 429 })
    return NextResponse.json({ error: err?.message || 'Prediction failed' }, { status: 500 })
  }
}
