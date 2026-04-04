import dotenv from 'dotenv'
import { createClient } from '@libsql/client'
import { fileURLToPath } from 'url'
import { join, dirname } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: join(__dirname, '..', '.env.local') })

// Import embedText after env is loaded so VOYAGE_API_KEY is available
const { embedText } = await import('../lib/embeddings.js')

// ─── Config ───────────────────────────────────────────────────────────────────

const BATCH_SIZE      = 20
const BATCH_SLEEP_MS  = 1000
const EMBEDDING_MODEL = 'voyage-3-lite'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function embedWithBackoff(text) {
  const delays = [5000, 10000]
  let lastErr
  for (let attempt = 0; attempt <= delays.length; attempt++) {
    try {
      return await embedText(text)
    } catch (err) {
      lastErr = err
      if (err.status === 429 && attempt < delays.length) {
        console.warn(`  Rate limited — waiting ${delays[attempt] / 1000}s before retry ${attempt + 1}…`)
        await sleep(delays[attempt])
      } else if (err.status === 429) {
        console.error('Rate limit exceeded — re-run script to resume')
        process.exit(1)
      } else {
        throw err
      }
    }
  }
  throw lastErr
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const db = createClient({
  url:       process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
})

// Fetch rows that still need embeddings
const { rows: pending } = await db.execute({
  sql:  'SELECT timestamp, question, question_type, company FROM pm_questions WHERE embedding IS NULL',
  args: [],
})

const total = pending.length
console.log(`Total rows to embed: ${total}`)

if (total === 0) {
  console.log('Nothing to do — all rows already have embeddings.')
  process.exit(0)
}

// Count already-embedded rows for the final summary
const { rows: [{ already }] } = await db.execute({
  sql:  'SELECT COUNT(*) AS already FROM pm_questions WHERE embedding IS NOT NULL',
  args: [],
})
const alreadyCount = Number(already)

let succeeded = 0
let skipped   = 0

for (let i = 0; i < pending.length; i += BATCH_SIZE) {
  const batch = pending.slice(i, i + BATCH_SIZE)

  for (const row of batch) {
    try {
      const vector = await embedWithBackoff(row.question)
      await db.execute({
        sql:  `UPDATE pm_questions
               SET embedding = ?, embedding_model = ?
               WHERE timestamp = ?`,
        args: [JSON.stringify(vector), EMBEDDING_MODEL, row.timestamp],
      })
      succeeded++
    } catch (err) {
      console.error(`  Error embedding row (timestamp=${row.timestamp}): ${err.message}`)
      skipped++
    }
  }

  const done = Math.min(i + BATCH_SIZE, total)
  console.log(`Embedded ${done}/${total} rows`)

  if (done < total) await sleep(BATCH_SLEEP_MS)
}

console.log(`\nDone.`)
console.log(`  Succeeded : ${succeeded}`)
console.log(`  Skipped   : ${skipped}`)
console.log(`  Already had embeddings: ${alreadyCount}`)
