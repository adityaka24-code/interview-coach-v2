/**
 * test-retrieval.mjs
 *
 * Runs the full retrieval pipeline (embed → score → rank) against the live DB
 * using a realistic Google PM mock JD, then prints a ranked hit table.
 *
 * Usage:
 *   node scripts/test-retrieval.mjs
 */

import dotenv from 'dotenv'
import { createClient } from '@libsql/client'
import { fileURLToPath } from 'url'
import { join, dirname } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: join(__dirname, '..', '.env.local') })

const { embedText, cosineSimilarity, preprocessQuery } = await import('../lib/embeddings.js')

// ─── Mock inputs ──────────────────────────────────────────────────────────────

const MOCK_COMPANY    = 'YouTube'
const MOCK_ROLE_LEVEL = 'PM'

const MOCK_JD = `
Product Manager, YouTube Creator Support

Minimum qualifications:
Bachelor's degree or equivalent practical experience.
3 years of experience in product management, or a related technical role.

Preferred qualifications:
Experience in innovating and implementing large-scale product solutions to introduce workflow or cost efficiencies (e.g., through tooling or other product solutions).
Experience building and launching customer-facing Large Language Model (LLM) products, and understanding of product lifecycle management.
Ability to leverage customer/user support data to identify product opportunities and drive improvements in key metrics (e.g., escalation volume, cost per user, first-time resolution, TRT, AHT, CSAT).
Excellent communication skills, with the ability to build strong relationships with cross-functional partners and stakeholders.
Excellent problem-solving skills to generate actionable product insights from support data, identifying core issues, and prioritizing scalable solutions.

Responsibilities:
Redefine how YouTube provides support to its global community of creators. Lead a portfolio of high-impact initiatives that will shape the future of creator support powered by AI.
Be responsible for driving the Agentic strategy for YouTube support.
Develop tools for building AI agents on top of the latest and most modern Gemini agentic infrastructure to allow support teams with and without engineering knowledge to develop AI agents.
Develop tools to assist human agents in customer support centers.
Develop solutions and agents for the most critical support user journeys.
`

// ─── DB helpers (inline, mirrors getQuestionsForRetrieval logic) ──────────────

const PM_QUESTION_TYPES = [
  'PRODUCT SENSE', 'PRODUCT IMPROVEMENT', 'PRODUCT REDESIGN', 'DESIGN',
  'BEHAVIOURAL', 'METRIC', 'ESTIMATION', 'GUESSTIMATE',
  'MARKET ESTIMATION', 'STRATEGY', 'CASE STUDY', 'EXECUTION',
]

function normaliseCompany(str) {
  if (!str || typeof str !== 'string') return ''
  const suffixes = ['inc', 'ltd', 'corp', 'limited']
  const suffixPattern = new RegExp(`\\b(${suffixes.join('|')})\\b\\.?$`, 'i')
  return str.toLowerCase().trim().replace(suffixPattern, '').trim()
}

async function fetchStratified(db, withCompanyFilter, normCompany) {
  const results = await Promise.allSettled(
    PM_QUESTION_TYPES.map(type => {
      if (withCompanyFilter) {
        return db.execute({
          sql: `SELECT question, question_type, company, embedding, timestamp, confirmation_count, source, source_label
                FROM pm_questions
                WHERE LOWER(TRIM(REPLACE(REPLACE(REPLACE(REPLACE(company,' inc',''),' ltd',''),' corp',''),' limited',''))) = ?
                  AND UPPER(question_type) = ?
                  AND embedding IS NOT NULL
                ORDER BY timestamp DESC LIMIT 17`,
          args: [normCompany, type],
        })
      }
      return db.execute({
        sql: `SELECT question, question_type, company, embedding, timestamp, confirmation_count, source, source_label
              FROM pm_questions
              WHERE UPPER(question_type) = ?
                AND embedding IS NOT NULL
              ORDER BY timestamp DESC LIMIT 17`,
        args: [type],
      })
    })
  )
  const rows = []
  for (const r of results) {
    if (r.status === 'fulfilled') rows.push(...r.value.rows)
    else console.warn('  [warn] query failed:', r.reason?.message)
  }
  const seen = new Set()
  return rows.filter(row => {
    if (seen.has(row.question)) return false
    seen.add(row.question)
    return true
  })
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const db = createClient({
    url:       process.env.TURSO_DATABASE_URL,
    authToken: process.env.TURSO_AUTH_TOKEN,
  })

  console.log('\n══════════════════════════════════════════════════')
  console.log(' Retrieval pipeline test — Google PM mock JD')
  console.log('══════════════════════════════════════════════════\n')

  // 1. Embed the query
  console.log('① Embedding query text via Voyage AI…')
  const queryText = preprocessQuery(MOCK_COMPANY, MOCK_ROLE_LEVEL, MOCK_JD)
  console.log(`  query length: ${queryText.length} chars`)
  const queryVector = await embedText(queryText)
  console.log(`  vector dims:  ${queryVector.length}`)

  // 2. Fetch candidates — company-filtered first
  const normCompany = normaliseCompany(MOCK_COMPANY)
  console.log(`\n② Fetching candidates from DB (company="${normCompany}")…`)
  let candidates = await fetchStratified(db, true, normCompany)
  let companyMatch = candidates.length >= 8

  console.log(`  company-filtered rows: ${candidates.length}  →  companyMatch: ${companyMatch}`)

  if (!companyMatch) {
    console.log('  ↳ below threshold, falling back to role-pattern pool…')
    candidates = await fetchStratified(db, false, normCompany)
    console.log(`  role-fallback rows: ${candidates.length}`)
  }

  if (candidates.length === 0) {
    console.error('\n✗ No candidates with embeddings found in DB. Check that backfill has run.')
    process.exit(1)
  }

  // 3. Score and rank
  console.log('\n③ Scoring cosine similarity + age decay + confirmation boost…')
  const scored = candidates.flatMap(c => {
    let vec
    try { vec = JSON.parse(c.embedding) } catch { return [] }
    const ageInDays = (Date.now() - new Date(c.timestamp).getTime()) / 86400000
    const decay = Math.exp(-0.001 * ageInDays)
    const confirmBoost = 1 + (0.05 * Math.min(c.confirmation_count ?? 0, 10))
    return [{ ...c, _score: cosineSimilarity(queryVector, vec) * decay * confirmBoost }]
  })
  scored.sort((a, b) => b._score - a._score)
  const top25 = scored.slice(0, 25)
  const topScore = top25[0]?._score ?? 0

  // 4. Evaluate lowConfidence conditions
  const conditions = {
    'queryVector === null':   false,
    'top25.length < 8':       top25.length < 8,
    'companyMatch === false':  !companyMatch,
  }
  const lowConfidence = Object.values(conditions).some(Boolean)
  // topScore is informational only — no longer part of lowConfidence logic
  console.log(`  (topScore = ${topScore.toFixed(4)} — informational, not gating)`)

  console.log('\n④ lowConfidence conditions:')
  for (const [k, v] of Object.entries(conditions)) {
    console.log(`  ${v ? '✗' : '✓'}  ${k.padEnd(28)} = ${String(v)}`)
  }
  console.log(`\n  ➜  lowConfidence = ${lowConfidence}  ${lowConfidence ? '⚠ banner WILL show' : '✓ banner suppressed'}`)

  // 5. Print top-10 hits
  console.log('\n⑤ Top 10 hits:\n')
  const COL_W = 62
  console.log(
    '  #   score   type'.padEnd(30) + 'company'.padEnd(14) + 'question'
  )
  console.log('  ' + '─'.repeat(100))
  top25.slice(0, 10).forEach((q, i) => {
    const rank     = String(i + 1).padStart(2)
    const score    = q._score.toFixed(4)
    const type     = (q.question_type || '—').slice(0, 16).padEnd(17)
    const co       = (q.company || '—').slice(0, 12).padEnd(13)
    const question = (q.question || '').slice(0, COL_W)
    console.log(`  ${rank}  ${score}  ${type} ${co} ${question}`)
  })

  console.log('\n══════════════════════════════════════════════════')
  console.log(` total candidates scored: ${scored.length}`)
  console.log(` top score:               ${topScore.toFixed(4)}`)
  console.log(` top-25 count:            ${top25.length}`)
  console.log('══════════════════════════════════════════════════\n')

  await db.close()
}

main().catch(err => {
  console.error('\n✗ Test failed:', err.message)
  process.exit(1)
})
