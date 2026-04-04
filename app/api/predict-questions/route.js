import { NextResponse } from 'next/server'
import { getQuestionsForRetrieval } from '@/lib/db'
import { preprocessQuery, embedText } from '@/lib/embeddings'

function cosineSimilarity(a, b) {
  let dot = 0, normA = 0, normB = 0
  for (let i = 0; i < a.length; i++) {
    dot   += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  if (normA === 0 || normB === 0) return 0
  return dot / (Math.sqrt(normA) * Math.sqrt(normB))
}

export async function POST(request) {
  let body
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { company, roleLevel, roundType, jdText, userId } = body

  if (!company || !roleLevel) {
    return NextResponse.json({ error: 'company and roleLevel are required' }, { status: 400 })
  }

  // Fetch candidate questions with embeddings
  let retrieval
  try {
    retrieval = await getQuestionsForRetrieval(company)
  } catch (err) {
    console.error('[predict-questions] getQuestionsForRetrieval error:', err.message)
    return NextResponse.json({ error: 'Failed to fetch candidate questions' }, { status: 500 })
  }

  const { questions: candidates, companyMatch } = retrieval

  if (candidates.length < 10) {
    return NextResponse.json({ fallback: true })
  }

  // Embed the JD query
  let jdVector
  try {
    const queryText = preprocessQuery(company, roleLevel, jdText || '')
    jdVector = await embedText(queryText)
  } catch (err) {
    console.error('[predict-questions] embedText error:', err.message)
    return NextResponse.json({ error: 'Failed to embed query' }, { status: 500 })
  }

  // Score each candidate
  const scored = []
  for (const row of candidates) {
    let vec
    try {
      vec = JSON.parse(row.embedding)
    } catch {
      continue
    }
    const score = cosineSimilarity(jdVector, vec)
    scored.push({
      question:      row.question,
      question_type: row.question_type,
      score:         Math.round(score * 10000) / 10000,
    })
  }

  scored.sort((a, b) => b.score - a.score)
  const top40 = scored.slice(0, 40)

  return NextResponse.json({ questions: top40, companyMatch })
}
