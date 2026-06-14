import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const TOOL = {
  name: 'submit_extracted_jd',
  description: 'Submit the extracted job description content',
  input_schema: {
    type: 'object',
    properties: {
      jdText: {
        type: 'string',
        description: 'The extracted job description — role summary, responsibilities, and requirements only. Max 2000 characters.',
      },
      extracted: {
        type: 'boolean',
        description: 'true if meaningful JD content was found, false if page had no recognisable job description',
      },
    },
    required: ['jdText', 'extracted'],
  },
}

export async function POST(request) {
  try {
    const { rawText } = await request.json()
    if (!rawText || rawText.trim().length < 100) {
      return NextResponse.json({ error: 'Raw text too short to extract from' }, { status: 400 })
    }

    const anthropic = new Anthropic()
    const msg = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 700,
      tools: [TOOL],
      tool_choice: { type: 'tool', name: 'submit_extracted_jd' },
      messages: [{
        role: 'user',
        content: `Extract ONLY the job description content from this scraped webpage text.

Include:
- Role / team overview (1–3 sentences)
- Key responsibilities (bullet points)
- Required qualifications / must-haves
- Preferred qualifications (if present)

Exclude everything else: navigation menus, site headers/footers, cookie banners, "similar jobs", social share links, company boilerplate, legal disclaimers, login prompts, or any text unrelated to this specific role.

Keep the output under 2000 characters. If the page does not contain a recognisable job description (e.g. it's a search results page or an error page), set extracted=false and jdText to a short explanation.

Scraped page text (first 6000 chars):
${rawText.slice(0, 6000)}`,
      }],
    })

    const block = msg.content.find(b => b.type === 'tool_use' && b.name === 'submit_extracted_jd')
    if (!block?.input) throw new Error('Extraction failed')

    return NextResponse.json({
      jdText: block.input.jdText.slice(0, 2200),
      extracted: block.input.extracted,
    })
  } catch (e) {
    console.error('[extract-jd]', e.message)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
