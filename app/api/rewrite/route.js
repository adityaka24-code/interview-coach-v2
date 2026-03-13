import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const REWRITE_TOOL = {
  name: 'submit_rewritten_answer',
  description: 'Submit a rewritten version of the candidate answer.',
  input_schema: {
    type: 'object',
    properties: {
      rewrittenAnswer: {
        type: 'string',
        description: 'The rewritten answer in candidate voice, 150-220 words, with paragraph breaks as \\n\\n. End with WHY: one line explaining what makes this better.',
      },
    },
    required: ['rewrittenAnswer'],
  },
}

export async function POST(request) {
  try {
    const { question, questionType, yourAnswer, whatMissed, principleViolations, company, role, experienceYears } = await request.json()

    if (!question || !yourAnswer) {
      return NextResponse.json({ error: 'question and yourAnswer are required' }, { status: 400 })
    }

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

    const TYPE_RULES = {
      'GUESSTIMATE':        'Define population scope (geography/demographic/time) first. Break into logical layers: Population -> Eligible -> Active -> Frequency. Always sanity-check the final number against real-world signals.',
      'ESTIMATION':         'Define population scope first. Use layered decomposition. Sanity-check the output.',
      'MARKET ESTIMATION':  'Define whether estimating TAM/SAM/SOM. Use bottom-up (Users x Orders x Value), not top-down GDP. Reality-check against known market signals.',
      'PRODUCT REDESIGN':   'Clarify the product goal (engagement/conversion/retention) before redesigning. Map the existing user journey and identify pain points. Pick ONE core problem and go deep, not a breadth of features.',
      'DESIGN':             'Anchor on the user Job-To-Be-Done, not a technology feature. Identify real-world constraints (connectivity, safety, time). Focus on the core workflow, not edge cases.',
      'PRODUCT IMPROVEMENT':'Target a specific user segment (not everyone). Identify the biggest pain point first, then solutions. Connect improvements to measurable metrics (conversion, frequency, retention).',
      'PRODUCT SENSE':      'Clarify scope. Define a specific user with their JTBD. Frame the problem before jumping to solutions. Use a structured framework. Define metrics.',
      'CASE STUDY':         'Use a diagnostic framing structure first. Generate and evaluate hypotheses. Make a focused 1-2 move recommendation with clear WHY, HOW, and expected impact.',
      'STRATEGY':           'Use a diagnostic framing structure first. Generate and evaluate hypotheses. Make a focused 1-2 move recommendation with clear WHY, HOW, and expected impact.',
      'BEHAVIOURAL':        'Follow STAR exactly: Situation (context) -> Task (YOUR specific role) -> Action (what YOU personally did, not the team) -> Quantified Result -> Lesson learned.',
      'METRIC':             'Form a hypothesis first. Justify metric selection. Show segmentation thinking. Demonstrate causal vs correlational reasoning.',
      'EXECUTION':          'Prioritise under constraints explicitly. Show stakeholder management thinking. Acknowledge risks.',
      'TECHNICAL':          'Focus on technical clarity and accuracy. Structure the explanation logically, use precise terminology, and ensure correctness of reasoning.',
      'OTHER':              'Structure the answer clearly with a logical flow. Lead with the key point, support with reasoning, and communicate concisely.',
    }
    const typeRule = TYPE_RULES[questionType] || 'Follow: User -> Problem -> Solution -> Trade-offs -> Metrics.'

    const prompt = `You are a PM interview coach. Rewrite the candidate answer using best-practice PM thinking for this question type.

Question type: ${questionType || 'PM'}
Company: ${company || 'not specified'}
Role: ${role || 'PM'}
Experience level: ${experienceYears || 'mid-level'} years

Question-type rule to follow:
${typeRule}

Question: ${question}

Candidate original answer: ${yourAnswer}

Key gaps to fix: ${whatMissed || 'none specified'}

Write the rewrite in the candidate's voice. 150-220 words. Use \\n\\n for paragraph breaks. End with a one-line WHY explaining what makes this version stronger.`

    let message
    try {
      message = await anthropic.messages.create({
        model: 'claude-sonnet-4-5',
        max_tokens: 1000,
        tools: [REWRITE_TOOL],
        tool_choice: { type: 'tool', name: 'submit_rewritten_answer' },
        messages: [{ role: 'user', content: prompt }],
      })
    } catch (err) {
      if (err?.status === 401) return NextResponse.json({ error: 'Invalid Anthropic API key' }, { status: 401 })
      if (err?.status === 429) return NextResponse.json({ error: 'Rate limit - please wait a moment' }, { status: 429 })
      return NextResponse.json({ error: err?.message || 'API call failed' }, { status: 500 })
    }

    const toolBlock = message?.content?.find(b => b.type === 'tool_use' && b.name === 'submit_rewritten_answer')
    if (!toolBlock?.input?.rewrittenAnswer) {
      return NextResponse.json({ error: 'No rewrite returned' }, { status: 500 })
    }

    return NextResponse.json({ rewrittenAnswer: toolBlock.input.rewrittenAnswer })
  } catch (err) {
    console.error('Rewrite error:', err)
    return NextResponse.json({ error: err.message || 'Rewrite failed' }, { status: 500 })
  }
}