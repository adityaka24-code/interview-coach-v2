import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const TOOL = {
  name: 'submit_inferred_jd',
  description: 'Submit a synthesized job description based on role context',
  input_schema: {
    type: 'object',
    properties: {
      jdText: {
        type: 'string',
        description: 'A concise, realistic job description, 400–800 characters',
      },
    },
    required: ['jdText'],
  },
}

export async function POST(request) {
  try {
    const { company, roleLevel, roleHint } = await request.json()
    if (!roleHint && !company) {
      return NextResponse.json({ error: 'roleHint or company is required' }, { status: 400 })
    }

    const anthropic = new Anthropic()
    const msg = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 600,
      tools: [TOOL],
      tool_choice: { type: 'tool', name: 'submit_inferred_jd' },
      messages: [{
        role: 'user',
        content: `Synthesize a concise, realistic job description for this role.

Company: ${company || 'not specified'}
Role Level: ${roleLevel || 'PM'}
Role Context: ${roleHint || `${roleLevel || 'PM'} at ${company || 'a tech company'}`}

Write a typical job description in 400–800 characters. Include:
- 1–2 sentence overview of what the team/role does
- 3–4 key responsibilities (short bullet points)
- 2–3 must-have qualifications

Be realistic and grounded in what ${company ? `${company} typically expects` : 'top tech companies typically expect'} for a ${roleLevel || 'PM'} hire. Do not invent specific unreleased products. Keep it under 800 characters.`,
      }],
    })

    const block = msg.content.find(b => b.type === 'tool_use' && b.name === 'submit_inferred_jd')
    if (!block?.input?.jdText) throw new Error('No JD generated')

    // Hard cap to keep inference results focused
    const jdText = block.input.jdText.slice(0, 900)
    return NextResponse.json({ jdText })
  } catch (e) {
    console.error('[infer-jd]', e.message)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
