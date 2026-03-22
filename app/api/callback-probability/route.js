import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic()

export async function POST(request) {
  try {
    const { cvText, jobDescription, company, role } = await request.json()

    if (!cvText && !jobDescription) {
      return NextResponse.json({ error: 'Provide CV text or job description for an estimate' }, { status: 400 })
    }

    const cvSection = cvText?.trim()
      ? `\n\nCANDIDATE CV:\n${cvText.slice(0, 3000)}`
      : '\n\nCANDIDATE CV: Not provided'

    const jdSection = jobDescription?.trim()
      ? `\n\nJOB DESCRIPTION:\n${jobDescription.slice(0, 2000)}`
      : '\n\nJOB DESCRIPTION: Not provided'

    const prompt = `You are a senior recruiter and PM hiring expert with 15 years screening candidates. Estimate the callback probability (0–100) for this specific candidate applying to ${company || 'this company'} for a ${role || 'PM'} role.

IMPORTANT: Your estimate MUST be grounded in specific evidence from the documents below. Do not give generic scores — analyse this exact candidate's actual experience, skills, and gaps against this exact role. The probability will vary significantly based on what you find.

Calibration guide:
- 0–20%: Major mismatches, wrong domain, insufficient seniority
- 20–40%: Partial fit, notable gaps in required skills or domain
- 40–60%: Decent fit, some gaps, borderline candidate
- 60–75%: Strong fit, minor gaps, competitive candidate
- 75–90%: Excellent fit, strong signals, high callback likelihood
- 90–100%: Near-perfect match, rare${cvSection}${jdSection}

Return ONLY a JSON object (no markdown, no preamble) with:
{
  "probability": <integer 0-100>,
  "reasoning": "<2-3 sentences citing SPECIFIC evidence from the CV and JD above>",
  "signals": {
    "strong": ["<specific strength from CV>", "<specific strength from CV>"],
    "weak": ["<specific gap vs JD>", "<specific gap vs JD>"]
  }
}

Be precise and specific — reference actual company names, roles, metrics, or skills from the documents.`

    const msg = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 700,
      temperature: 1,
      messages: [{ role: 'user', content: prompt }],
    })

    const raw = msg.content[0]?.text || '{}'
    let parsed
    try {
      const clean = raw.replace(/^```[a-z]*\n?/i, '').replace(/```$/, '').trim()
      parsed = JSON.parse(clean)
    } catch {
      parsed = { probability: 50, reasoning: 'Could not parse estimate.', signals: { strong: [], weak: [] } }
    }

    return NextResponse.json(parsed)
  } catch (err) {
    console.error('callback-probability error:', err)
    return NextResponse.json({ error: err.message || 'Failed to estimate callback probability' }, { status: 500 })
  }
}
