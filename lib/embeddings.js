// ─── Boilerplate patterns to strip from job descriptions ─────────────────────

const BOILERPLATE_PATTERNS = [
  // Compensation & benefits
  'competitive salary', 'competitive compensation', 'equity', 'stock options',
  '401k', 'health insurance', 'dental', 'vision', 'paid time off', '\\bpto\\b',
  'parental leave', 'wellness', '\\bgym\\b', 'commuter benefits', '\\bbonus\\b',
  // Generic culture
  'fast-paced environment', 'collaborative', 'passionate', 'dynamic team',
  'inclusive', 'diverse', 'equal opportunity', 'we are an equal', '\\bEOE\\b',
  'affirmative action', 'work hard play hard', 'wear many hats',
  // Legal & compliance
  'background check', 'authoris[e]d to work', 'authorized to work',
  'visa sponsorship', 'right to work', 'drug test', 'reasonable accommodation',
  'disability',
  // Generic apply
  'apply now', 'join our team', 'we look forward', 'submit your resume',
  'cover letter', 'we will contact', 'only shortlisted',
]

// Matches a sentence containing any boilerplate phrase.
// Sentences end at . ! ? or a newline/end-of-string.
const BOILERPLATE_RE = new RegExp(
  // bullet point lines
  `^[\\s]*[-•*\\u2022]?[\\s]*(?:[^\\n]*(?:${BOILERPLATE_PATTERNS.join('|')})[^\\n]*)$` +
  '|' +
  // inline sentences
  `[^.!?\\n]*(?:${BOILERPLATE_PATTERNS.join('|')})[^.!?\\n]*[.!?]?`,
  'gi'
)

// ─── High-signal section markers ─────────────────────────────────────────────

const HIGH_SIGNAL_MARKERS = [
  'responsible for', 'you will', "what you'll do", 'key responsibilities',
  'requirements', 'qualifications', 'you have', 'you bring',
  "what we're looking for", 'minimum qualifications', 'preferred qualifications',
  'basic qualifications',
]

const HIGH_SIGNAL_RE = new RegExp(
  `(${HIGH_SIGNAL_MARKERS.map(m => m.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`,
  'i'
)

// ─── Voyage AI embedding ──────────────────────────────────────────────────────

const VOYAGE_MODEL = 'voyage-3-lite'
const VOYAGE_URL   = 'https://api.voyageai.com/v1/embeddings'

/**
 * Embed a single text string using Voyage AI.
 * Returns a float[] vector.
 * Throws on non-2xx responses (caller handles retries / 429).
 */
export async function embedText(text) {
  const apiKey = process.env.VOYAGE_API_KEY
  if (!apiKey) throw new Error('VOYAGE_API_KEY is not set')

  const res = await fetch(VOYAGE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ input: [text], model: VOYAGE_MODEL }),
  })

  if (!res.ok) {
    const err = new Error(`Voyage API error: ${res.status} ${res.statusText}`)
    err.status = res.status
    throw err
  }

  const json = await res.json()
  return json.data[0].embedding
}

// ─── Cosine similarity ───────────────────────────────────────────────────────

export function cosineSimilarity(a, b) {
  let dot = 0, normA = 0, normB = 0
  for (let i = 0; i < a.length; i++) {
    dot   += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  if (normA === 0 || normB === 0) return 0
  return dot / (Math.sqrt(normA) * Math.sqrt(normB))
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function preprocessQuery(company, role, jobDescription) {
  const prefix = `${role} at ${company}. `

  if (!jobDescription || jobDescription.trim().length < 50) {
    return `${role} at ${company}`
  }

  // 1. Strip boilerplate sentences / bullet points
  const stripped = jobDescription
    .replace(BOILERPLATE_RE, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()

  if (stripped.length < 50) {
    return `${role} at ${company}`
  }

  // 2. Extract high-signal sections.
  //    Split on double-newlines (sections) or single newlines (lines).
  //    Keep chunks that contain a high-signal marker.
  const chunks = stripped.split(/\n{2,}/)
  const highSignal = []
  const rest = []

  for (const chunk of chunks) {
    if (HIGH_SIGNAL_RE.test(chunk)) {
      highSignal.push(chunk.trim())
    } else {
      rest.push(chunk.trim())
    }
  }

  // Prefer high-signal chunks; append rest if there's still budget
  const ordered = [...highSignal, ...rest].filter(Boolean)
  const body = ordered.join(' ').replace(/\s{2,}/g, ' ').trim()

  const combined = prefix + (body || stripped)

  // 3. Hard cap at 1200 characters
  if (combined.length <= 1200) return combined

  // Trim at last word boundary within the cap
  const capped = combined.slice(0, 1200)
  const lastSpace = capped.lastIndexOf(' ')
  return lastSpace > prefix.length ? capped.slice(0, lastSpace) : capped
}
