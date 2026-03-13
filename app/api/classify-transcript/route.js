import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const TOOL = {
  name: 'submit_segments',
  description: 'Submit the parsed transcript segments',
  input_schema: {
    type: 'object',
    properties: {
      segments: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            type: { type: 'string', enum: ['question', 'answer', 'inferred_question'] },
            text: { type: 'string' },
          },
          required: ['type', 'text'],
        },
      },
    },
    required: ['segments'],
  },
}

export async function POST(request) {
  try {
    const { transcript } = await request.json()
    if (!transcript || transcript.trim().length < 10) {
      return NextResponse.json({ error: 'Transcript too short' }, { status: 400 })
    }
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 8192,
      tools: [TOOL],
      tool_choice: { type: 'tool', name: 'submit_segments' },
      messages: [{
        role: 'user',
        content: `Parse this PM interview transcript into segments. IMPORTANT: Process the COMPLETE transcript - do not stop early.

Rules:
- type="question": interviewer explicitly asked this (has "Interviewer:", "Q:", or is clearly a question from the other side)
- type="inferred_question": only the candidate answer is visible — infer a concise, realistic question they were likely answering (10-80 words)
- type="answer": the candidate's response verbatim

For inferred_question, write a clean question (not the answer text).
Return ALL segments in order. Every answer must be preceded by a question or inferred_question.
Do NOT truncate or stop before the end of the transcript.

Transcript:
${transcript.slice(0, 125000)}`
      }],
    })
    const block = message.content.find(b => b.type === 'tool_use' && b.name === 'submit_segments')
    if (!block?.input?.segments) return NextResponse.json({ error: 'Classification failed' }, { status: 500 })
    const segments = block.input.segments.map((s, i) => ({ ...s, id: `seg-${i}` }))
    return NextResponse.json({ segments })
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
