import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { saveInterview, upsertQuestion, getUser } from '@/lib/db'

// ---------------------------------------------------------------------------
// Sanitise user input before embedding into the prompt.
// Prevents user-supplied text from injecting characters that break Claude JSON.
// ---------------------------------------------------------------------------
function sanitiseInput(str) {
  if (!str || typeof str !== 'string') return ''
  return str
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\r/g, '')
    .replace(/\t/g, ' ')
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, '')
    .trim()
}

// ---------------------------------------------------------------------------
// extractJSON — robustly parse JSON from Claude's response.
// Handles 24 known failure modes across 3 repair passes.
// ---------------------------------------------------------------------------
function extractJSON(raw) {
  if (!raw || typeof raw !== 'string') throw new Error('Empty response from Claude')

  // 1. Strip BOM (byte order mark)
  let text = raw.replace(/^\uFEFF/, '')

  // 2. Strip markdown code fences
  text = text
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()

  // 3. Strip // line comments (common when Claude adds explanatory notes)
  text = text.replace(/^\s*\/\/.*$/gm, '')

  // 4. Extract outermost { ... } — strips preamble and postamble
  const start = text.indexOf('{')
  const end   = text.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('Truncated or missing JSON — Claude likely hit the token limit. Please try again.')
  }
  text = text.slice(start, end + 1)

  // 5. Fix trailing commas in objects and arrays
  text = text.replace(/,\s*}/g, '}').replace(/,\s*]/g, ']')

  // 6. Replace NaN / undefined / Infinity with null
  text = text.replace(/:\s*NaN\b/g, ': null')
  text = text.replace(/:\s*undefined\b/g, ': null')
  text = text.replace(/:\s*-?Infinity\b/g, ': null')

  // 7. Fix single-quoted keys: {'key': ...} -> {"key": ...}
  text = text.replace(/([{,]\s*)'([^']+)'\s*:/g, '$1"$2":')
  // Fix single-quoted string values: : 'value' -> : "value"
  text = text.replace(/:\s*'([^']*)'/g, ': "$1"')

  // Pass 1: try as-is after pre-processing
  try { return JSON.parse(text) } catch {}

  // Pass 2: state-machine character walk
  // Fixes: unescaped newlines, tabs, CRs, control chars, unescaped double quotes inside strings
  let pass2 = ''
  let inString = false
  let escaped = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    const code = text.charCodeAt(i)

    if (escaped) { pass2 += ch; escaped = false; continue }
    if (ch === '\\') { pass2 += ch; escaped = true; continue }

    if (ch === '"') {
      if (inString) {
        // Determine if this is a genuine closing quote by peeking ahead
        let j = i + 1
        while (j < text.length && text[j] === ' ') j++
        const next = text[j]
        if (next === ':' || next === ',' || next === '}' || next === ']' || next === '"' || j >= text.length) {
          inString = false
          pass2 += ch
        } else {
          // Unescaped quote in middle of string value — escape it
          pass2 += '\\"'
        }
      } else {
        inString = true
        pass2 += ch
      }
      continue
    }

    if (inString) {
      if (ch === '\n') { pass2 += '\\n'; continue }   // unescaped newline
      if (ch === '\r') { continue }                     // carriage return — strip
      if (ch === '\t') { pass2 += '\\t'; continue }    // unescaped tab
      if (code < 0x20) { continue }                     // other control chars — strip
    }

    pass2 += ch
  }
  try { return JSON.parse(pass2) } catch {}

  // Pass 3: brute-force Unicode normalisation
  const pass3 = pass2
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // remaining control chars
    .replace(/\u2014/g, '-')                              // em dash
    .replace(/\u2013/g, '-')                              // en dash
    .replace(/[\u2018\u2019]/g, "'")                      // curly single quotes
    .replace(/[\u201C\u201D]/g, '\\"')                    // curly double quotes
    .replace(/\u2026/g, '...')                            // ellipsis
    .replace(/\u00A0/g, ' ')                              // non-breaking space
    .replace(/[\u2028\u2029]/g, '\\n')                    // line/paragraph separators
  try { return JSON.parse(pass3) } catch (finalErr) {
    const pos = parseInt(finalErr.message.match(/position (\d+)/)?.[1] ?? '0')
    console.error('All repair passes failed at pos', pos, ':', pass3.slice(Math.max(0, pos - 120), pos + 120))
    throw new Error(`Claude returned invalid JSON: ${finalErr.message}`)
  }
}

// ---------------------------------------------------------------------------
// System prompt builder
// ---------------------------------------------------------------------------
function buildSystemPrompt({ hasJD, hasCV, company, role, experienceYears }) {
  const seniority = {
    '0-2':  'junior / APM level - bar is potential, curiosity, and structured thinking over experience',
    '2-5':  'mid-level PM - bar is ownership, clear frameworks, and demonstrated impact',
    '5-8':  'senior PM - bar is strategic thinking, cross-functional leadership, and measurable business impact',
    '8-12': 'principal / staff PM - bar is org-level influence, roadmap ownership, and executive communication',
    '12+':  'director+ level - bar is vision-setting, business strategy, and leading through others',
  }[experienceYears] || 'mid-level PM'

  const companyCtx = company ? `The interview is for ${company}. Calibrate the bar to what ${company} specifically looks for.` : ''
  const jdCtx = hasJD ? `You have the JOB DESCRIPTION. For each answer, explicitly call out whether it addressed the specific skills in the JD.` : ''
  const cvCtx = hasCV ? `You have the CANDIDATE CV. Where the candidate missed citing a real achievement, name the specific project or metric from their CV they should have used.` : ''

  return `You are a world-class PM interview coach. You give brutally honest, specific, actionable feedback.

CONTEXT
- Role: ${role || 'Product Manager'}
- Seniority bar: ${seniority}
- ${companyCtx}
- ${jdCtx}
- ${cvCtx}

QUESTION-TYPE-SPECIFIC EVALUATION RULES:

GUESSTIMATE / ESTIMATION / MARKET ESTIMATION:
- Rule 1 (Population Scoped): Did they define the base population, geography, demographic, time period before calculating?
- Rule 2 (Layered Decomposition): Did they break the problem into logical layers (Population → Eligible → Active → Frequency) rather than jumping to the final number?
- Rule 3 (Sanity Check): Did they validate the output against real-world signals? No sanity check = weak analytical discipline.
- pmSignals keys MUST be exactly: "Population Scoped", "Layered Decomposition", "Assumption Transparency", "Sanity Check", "Reality Anchoring"

PRODUCT REDESIGN:
- Rule 1 (Goal Clarity): Did they clarify the product goal before redesigning (engagement, conversion, retention)? Without this, redesigns are random feature lists.
- Rule 2 (User Journey Mapped): Did they map the existing user journey and identify pain points, rather than jumping to features?
- Rule 3 (Depth over Breadth): Did they pick ONE core problem and go deep? Broad laundry lists are a red flag.
- pmSignals keys MUST be exactly: "Goal Clarity", "User Journey Mapped", "Pain Point Identified", "Depth over Breadth", "Metrics Tied"

DESIGN / DESIGN X FOR Y:
- Rule 1 (Job-To-Be-Done): Did they anchor on the user's primary task, not a technology feature?
- Rule 2 (Constraints Aware): Did they show awareness of real-world constraints (connectivity, device, safety, time pressure)?
- Rule 3 (Core Workflow Focus): Did they prioritise the main task flow over edge features?
- pmSignals keys MUST be exactly: "Job-To-Be-Done", "User Constraints", "Core Workflow Focus", "Design Clarity", "Trade-offs"

PRODUCT IMPROVEMENT:
- Rule 1 (User Segment Targeted): Did they pick a specific user segment, not "everyone"? Different segments = different problems.
- Rule 2 (Problem Before Solution): Did they identify the biggest pain point before proposing improvements?
- Rule 3 (Metric Tied): Did they connect improvements to measurable metrics (conversion, frequency, retention)?
- pmSignals keys MUST be exactly: "User Segment Targeted", "Problem Before Solution", "Improvement Depth", "Metrics Tied", "Prioritisation Reasoning"

PRODUCT SENSE:
- Evaluate on: clarification, specific user definition with JTBD, problem framing before solutions, structured framework, trade-offs, measurable success metrics.
- pmSignals keys MUST be exactly: "Clarification First", "User Specificity", "Problem Before Solution", "Structure and Framework", "Trade-offs", "Metrics Defined"

PRODUCT CASE STUDY / STRATEGY:
- Rule 1 (Problem Framed): Did they use a diagnostic structure (demand/supply/marketplace/technology) before jumping to solutions?
- Rule 2 (Hypotheses Generated): Did they generate and then evaluate structured hypotheses rather than stating opinions?
- Rule 3 (Focused Recommendation): Did they pick 1-2 high-impact moves with WHY, HOW, and expected impact? Strategy clarity > idea volume.
- pmSignals keys MUST be exactly: "Problem Framing", "Hypothesis Generation", "Strategic Focus", "Business Impact", "Recommendation Clarity"

BEHAVIOURAL:
- Evaluate on STAR: Situation (context), Task (their specific role), Action (what THEY did, not the team), Result (quantified outcome), Lessons learned.
- pmSignals keys MUST be exactly: "Situation Clarity", "Personal Ownership", "Quantified Result", "Lessons and Growth", "Conciseness"

METRIC / EXECUTION:
- Evaluate on: hypothesis formation, metric selection rationale, segmentation thinking, causal vs correlational reasoning, data intuition.
- pmSignals keys MUST be exactly: "Hypothesis Formation", "Metric Selection", "Segmentation Thinking", "Causal Reasoning", "Data Intuition"

META RULE (applies across ALL types) - strong answers follow this flow:
User → Problem → Solution → Trade-offs → Metrics
Rate how well the answer follows this flow as part of every evaluation.

SCORING (be honest - most real interviews score 4-7):
9-10: Textbook answer, would hire immediately. 7-8: Strong, minor gaps. 5-6: Competent but missing key elements. 3-4: Significant structural gaps. 1-2: Misunderstands the question type entirely.`
}

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Tool schema — forces Claude to return structured data with no text output.
// No JSON parsing or repair needed; the SDK gives us a plain JS object.
// ---------------------------------------------------------------------------
const ANALYSIS_TOOL = {
  name: 'submit_interview_analysis',
  description: 'Submit the complete structured analysis of a PM interview transcript.',
  input_schema: {
    type: 'object',
    properties: {
      overallScore: { type: 'integer', minimum: 1, maximum: 10 },
      overallSummary: { type: 'string' },
      interviewReadiness: { type: 'string', enum: ['Not ready', 'Almost there', 'Ready', 'Strong candidate'] },
      topStrengths: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 5 },
      criticalGaps: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 5 },
      answers: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            question:           { type: 'string' },
            questionType:       { type: 'string', enum: ['PRODUCT SENSE', 'PRODUCT IMPROVEMENT', 'PRODUCT REDESIGN', 'DESIGN', 'BEHAVIOURAL', 'METRIC', 'ESTIMATION', 'GUESSTIMATE', 'MARKET ESTIMATION', 'STRATEGY', 'CASE STUDY', 'EXECUTION'] },
            yourAnswer:         { type: 'string' },
            score:              { type: 'integer', minimum: 1, maximum: 10 },
            whatWorked:         { type: 'string' },
            whatMissed:         { type: 'string' },
            principleViolations:{ type: 'array', items: { type: 'string' } },
            cvOpportunity:      { type: 'string' },
            jdRelevance:        { type: 'string' },
            pmSignals:          { type: 'object', additionalProperties: { type: 'integer', minimum: 1, maximum: 5 } },
          },
          required: ['question', 'questionType', 'score', 'whatWorked', 'whatMissed', 'pmSignals'],
        },
      },
      topPriorityFix:  { type: 'string' },
      practiceplan:    { type: 'array', items: { type: 'string' } },
      fillerWords:     { type: 'array', items: { type: 'string' } },
      recurringPattern:{ type: 'string' },
      inferredQuestions:{ type: 'array', items: { type: 'string' } },
    },
    required: ['overallScore','overallSummary','interviewReadiness','topStrengths','criticalGaps','answers','topPriorityFix'],
  },
}

// POST /api/analyze
// ---------------------------------------------------------------------------
export async function POST(request) {
  try {
    // 1. Parse request body
    let body
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    const { transcript, metadata } = body
    if (!transcript || typeof transcript !== 'string' || transcript.trim().length < 10) {
      return NextResponse.json({ error: 'Transcript is missing or too short' }, { status: 400 })
    }

    // 2. Check API key
    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({ error: 'ANTHROPIC_API_KEY is not configured on the server' }, { status: 500 })
    }

    // 3. Load user profile (non-fatal if DB unavailable)
    let user = null
    try { user = await getUser() } catch (e) { console.error('DB user load failed:', e.message) }

    const cvText         = metadata?.cvText        || user?.cv_text        || ''
    const portfolioText  = metadata?.portfolioText || user?.portfolio_text || ''
    const jobDescription = metadata?.jobDescription || ''
    const company        = metadata?.company || ''
    const role           = metadata?.role || ''
    const hasJD = jobDescription.trim().length > 50
    const hasCV = (cvText + portfolioText).trim().length > 50

    // 4. Build prompt with sanitised inputs
    const safeTranscript = sanitiseInput(transcript).slice(0, 20000)
    const safeJD         = sanitiseInput(jobDescription).slice(0, 3000)
    const safeCV         = sanitiseInput(cvText).slice(0, 2000)
    const safePortfolio  = sanitiseInput(portfolioText).slice(0, 1500)

    let userContent = `Analyze this PM interview transcript and return your evaluation as JSON.\n\n---TRANSCRIPT---\n${safeTranscript}\n---END TRANSCRIPT---`
    if (hasJD) userContent += `\n\n---JOB DESCRIPTION---\n${safeJD}`
    if (hasCV) userContent += `\n\n---CANDIDATE CV---\n${safeCV}`
    if (safePortfolio.trim()) userContent += `\n\n---PORTFOLIO---\n${safePortfolio}`

    // 5. Call Claude
    const systemPrompt = buildSystemPrompt({ hasJD, hasCV, company, role, experienceYears: metadata?.experienceYears })
    console.log('[analyze] system prompt length:', systemPrompt.length)
    if (systemPrompt.length < 500) {
      console.error('[analyze] System prompt suspiciously short — possible template literal corruption')
      return NextResponse.json({ error: 'Server configuration error: system prompt malformed' }, { status: 500 })
    }
    console.log('[analyze] user content length:', userContent.length)
    console.log('[analyze] hasJD:', hasJD, '| hasCV:', hasCV, '| company:', company, '| role:', role)
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    let message
    try {
      message = await anthropic.messages.create({
        model: 'claude-sonnet-4-5',
        max_tokens: 4000,
        system: systemPrompt,
        tools: [ANALYSIS_TOOL],
        tool_choice: { type: 'tool', name: 'submit_interview_analysis' },
        messages: [{ role: 'user', content: userContent }],
      })
    } catch (err) {
      console.error('Anthropic API error:', err)
      if (err?.status === 401) return NextResponse.json({ error: 'Invalid Anthropic API key' }, { status: 401 })
      if (err?.status === 429) return NextResponse.json({ error: 'Rate limit hit - please wait a moment and try again' }, { status: 429 })
      if (err?.status === 529) return NextResponse.json({ error: 'Anthropic is overloaded - please try again shortly' }, { status: 503 })
      return NextResponse.json({ error: err?.message || 'Claude API call failed' }, { status: 500 })
    }

    // 6. Extract tool_use response
    console.log('[analyze] stop_reason:', message?.stop_reason)
    console.log('[analyze] content blocks:', message?.content?.map(b => b.type))
    const toolUseBlock = message?.content?.find(b => b.type === 'tool_use' && b.name === 'submit_interview_analysis')
    if (!toolUseBlock?.input) {
      const textBlock = message?.content?.find(b => b.type === 'text')
      console.error('[analyze] No tool_use block found. Text response:', textBlock?.text?.slice(0, 500))
      console.error('[analyze] Full message content:', JSON.stringify(message?.content, null, 2))
      return NextResponse.json({ error: 'Claude returned an empty response' }, { status: 500 })
    }
    const analysis = toolUseBlock.input
    console.log('[analyze] tool_use input keys:', Object.keys(analysis))
    console.log('[analyze] overallScore:', analysis.overallScore, '| answers count:', analysis.answers?.length)

    // 7. Check for unexpected text preamble (tool_choice should prevent this but guard anyway)
    const textBlock = message?.content?.find(b => b.type === 'text')
    if (textBlock?.text?.trim()) {
      console.warn('[analyze] Unexpected text block alongside tool_use:', textBlock.text.slice(0, 300))
    }

    // 8. Validate minimum shape
    const missingFields = []
    if (!analysis.overallScore) missingFields.push('overallScore')
    if (!Array.isArray(analysis.answers)) missingFields.push('answers (not array)')
    else if (analysis.answers.length === 0) missingFields.push('answers (empty array — transcript may lack clear Q&A structure)')
    if (missingFields.length > 0) {
      console.error('[analyze] Validation failed. Missing:', missingFields.join(', '))
      console.error('[analyze] Full analysis keys:', Object.keys(analysis))
      console.error('[analyze] Full analysis:', JSON.stringify(analysis, null, 2).slice(0, 2000))
      const isEmptyAnswers = Array.isArray(analysis.answers) && analysis.answers.length === 0
      return NextResponse.json({
        error: isEmptyAnswers
          ? 'No interview questions detected — make sure your transcript includes both questions and answers'
          : 'Claude response was missing required fields',
      }, { status: 500 })
    }

    // 8. Persist to DB (non-fatal — return analysis even if save fails)
    let interviewId = null
    if (metadata?.company && metadata?.role) {
      try {
        interviewId = await saveInterview({ ...metadata, roundType: metadata.roundType||'unknown', transcript, analysis, cvText, portfolioText, jobDescription })
        // D-04: loop answers so each question gets its questionType stored
        const answeredQs = analysis.answers || []
        for (const a of answeredQs) {
          if (a.question && typeof a.question === 'string' && a.question.length > 10) {
            await upsertQuestion(a.question, { ...metadata, source: 'user', questionType: a.questionType || '' })
          }
        }
        // Also upsert any inferred questions Claude surfaced (no type info available)
        const inferred = analysis.inferredQuestions || []
        for (const q of inferred) {
          if (q && typeof q === 'string' && q.length > 10) {
            const alreadySaved = answeredQs.some(a => a.question === q)
            if (!alreadySaved) await upsertQuestion(q, { ...metadata, source: 'user' })
          }
        }
      } catch (dbErr) { console.error('DB save error:', dbErr.message) }
    }

    return NextResponse.json({ analysis, interviewId })

  } catch (e) {
    console.error('Unexpected error in /api/analyze:', e)
    return NextResponse.json({ error: e.message || 'Unexpected server error' }, { status: 500 })
  }
}