import { createClient } from '@libsql/client'

// Normalise company name at ingestion time — trim whitespace, collapse runs,
// title-case each word. Applied before every DB write so storage is consistent.
export function normalizeCompany(raw) {
  if (!raw || typeof raw !== 'string') return ''
  return raw
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, c => c.toUpperCase())
}

let _db
let _schemaReady = false   // true once initSchema() completes successfully
let _dbUnavailable = false // true once we've confirmed DB is down this process lifetime

export function getDb() {
  if (_dbUnavailable) throw new Error('DB unavailable')
  if (!_db) {
    if (!process.env.TURSO_DATABASE_URL) {
      _dbUnavailable = true
      throw new Error('TURSO_DATABASE_URL is not set. Add it to your .env.local file.')
    }
    try {
      _db = createClient({
        url: process.env.TURSO_DATABASE_URL,
        authToken: process.env.TURSO_AUTH_TOKEN,
      })
    } catch (err) {
      _dbUnavailable = true
      throw err
    }
  }
  return _db
}

export async function initSchema() {
  if (_schemaReady) return          // already initialised — skip
  if (_dbUnavailable) return        // DB down — skip silently
  let db
  try { db = getDb() } catch { return }

  try {
    await db.executeMultiple(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT DEFAULT 'Me',
      email TEXT DEFAULT '',
      title TEXT DEFAULT '',
      org TEXT DEFAULT '',
      cv_text TEXT DEFAULT '',
      portfolio_text TEXT DEFAULT '',
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS interviews (
      id TEXT PRIMARY KEY,
      company TEXT NOT NULL,
      role TEXT NOT NULL,
      location TEXT DEFAULT '',
      experience_years TEXT DEFAULT '',
      salary_min INTEGER,
      salary_max INTEGER,
      salary_currency TEXT DEFAULT 'USD',
      salary_source TEXT DEFAULT 'user',
      job_description TEXT DEFAULT '',
      job_url TEXT DEFAULT '',
      cv_text TEXT DEFAULT '',
      portfolio_text TEXT DEFAULT '',
      date TEXT DEFAULT (datetime('now')),
      transcript TEXT DEFAULT '',
      analysis TEXT DEFAULT '',
      overall_score INTEGER DEFAULT 0,
      round_type TEXT DEFAULT 'unknown'
    );
    CREATE TABLE IF NOT EXISTS questions (
      id TEXT PRIMARY KEY,
      text TEXT NOT NULL,
      normalized TEXT NOT NULL,
      company TEXT DEFAULT '',
      role TEXT DEFAULT '',
      location TEXT DEFAULT '',
      experience_years TEXT DEFAULT '',
      source TEXT DEFAULT 'user',
      question_type TEXT DEFAULT '',
      round_type TEXT DEFAULT 'unknown',
      frequency INTEGER DEFAULT 1,
      first_seen TEXT DEFAULT (datetime('now')),
      last_seen TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS bug_reports (
      id TEXT PRIMARY KEY,
      description TEXT NOT NULL,
      page TEXT DEFAULT '',
      activity TEXT DEFAULT '',
      user_agent TEXT DEFAULT '',
      screen_size TEXT DEFAULT '',
      user_name TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS predictions (
      id TEXT PRIMARY KEY,
      company TEXT DEFAULT '',
      role_level TEXT DEFAULT '',
      round_type TEXT DEFAULT '',
      jd_text TEXT DEFAULT '',
      cv_text TEXT DEFAULT '',
      result TEXT DEFAULT '',
      outcome TEXT DEFAULT 'pending',
      created_at TEXT DEFAULT (datetime('now'))
    );
  `)

  // Migrations — ALTER TABLE is idempotent via try/catch (SQLite errors if column exists)
  // ADD COLUMN migrations — idempotent, silently skip if column exists
  const addCols = [
    "ALTER TABLE interviews ADD COLUMN round_type TEXT DEFAULT 'unknown'",
    "ALTER TABLE questions  ADD COLUMN round_type TEXT DEFAULT 'unknown'",
    "ALTER TABLE questions  ADD COLUMN question_type TEXT DEFAULT ''",
    "ALTER TABLE users      ADD COLUMN org TEXT DEFAULT ''",
    "ALTER TABLE users      ADD COLUMN email TEXT DEFAULT ''",
    "ALTER TABLE users      ADD COLUMN title TEXT DEFAULT ''",
    "ALTER TABLE predictions ADD COLUMN outcome TEXT DEFAULT 'pending'",
    // Auth migrations
    "ALTER TABLE users      ADD COLUMN age INTEGER",
    "ALTER TABLE users      ADD COLUMN onboarding_complete INTEGER DEFAULT 0",
    "ALTER TABLE interviews ADD COLUMN user_id TEXT",
    "ALTER TABLE predictions ADD COLUMN user_id TEXT",
  ]
  for (const sql of addCols) {
    try { await db.execute({ sql, args: [] }) } catch (_) { /* column already exists */ }
  }

  // Backfill NULLs on existing rows — SQLite ALTER TABLE does NOT apply DEFAULTs retroactively
  const backfills = [
    "UPDATE interviews SET round_type = 'unknown' WHERE round_type IS NULL",
    "UPDATE questions  SET round_type = 'unknown' WHERE round_type IS NULL",
    "UPDATE questions  SET question_type = '' WHERE question_type IS NULL",
    "UPDATE users      SET org = '' WHERE org IS NULL",
    "UPDATE users      SET email = '' WHERE email IS NULL",
    "UPDATE users      SET title = '' WHERE title IS NULL",
  ]
  for (const sql of backfills) {
    try { await db.execute({ sql, args: [] }) } catch (_) { /* ignore */ }
  }

    // Ensure default user exists
    await db.execute({
      sql: "INSERT OR IGNORE INTO users (id, name) VALUES ('default', 'Me')",
      args: [],
    })
    _schemaReady = true
  } catch (err) {
    _dbUnavailable = true
    console.error('[db] initSchema failed — DB marked unavailable for this process:', err.message)
  }
}

// Create or fetch a user by Google ID (called at sign-in)
export async function getOrCreateUser(googleId, email, name) {
  await initSchema()
  if (_dbUnavailable) return null
  const db = getDb()
  const res = await db.execute({ sql: 'SELECT * FROM users WHERE id = ?', args: [googleId] })
  if (res.rows[0]) return res.rows[0]
  await db.execute({
    sql: "INSERT INTO users (id, name, email, onboarding_complete) VALUES (?, ?, ?, 0)",
    args: [googleId, name || 'Me', email || ''],
  })
  const created = await db.execute({ sql: 'SELECT * FROM users WHERE id = ?', args: [googleId] })
  return created.rows[0] || null
}

export async function getUser(userId = 'default') {
  await initSchema()
  if (_dbUnavailable) return null
  const db = getDb()
  const res = await db.execute({ sql: 'SELECT * FROM users WHERE id = ?', args: [userId] })
  return res.rows[0] || null
}

export async function upsertUser(userId = 'default', data) {
  await initSchema()
  if (_dbUnavailable) return
  const db = getDb()
  await db.execute({
    sql: `UPDATE users SET name=?, email=?, title=?, org=?, age=?, cv_text=?, portfolio_text=?, onboarding_complete=?, updated_at=datetime('now') WHERE id=?`,
    args: [data.name||'Me', data.email||'', data.title||'', data.org||'', data.age||null, data.cv_text||'', data.portfolio_text||'', data.onboarding_complete ? 1 : 0, userId],
  })
}

export async function saveInterview(data) {
  await initSchema()
  if (_dbUnavailable) throw new Error('DB unavailable')
  const db = getDb()
  const id = crypto.randomUUID()
  await db.execute({
    sql: `INSERT INTO interviews
      (id,company,role,location,experience_years,salary_min,salary_max,salary_currency,salary_source,
       job_description,job_url,cv_text,portfolio_text,transcript,analysis,overall_score,round_type,user_id)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    args: [
      id, normalizeCompany(data.company), data.role, data.location||'', data.experienceYears||'',
      data.salaryMin||null, data.salaryMax||null, data.salaryCurrency||'USD', data.salarySource||'user',
      data.jobDescription||'', data.jobUrl||'', data.cvText||'', data.portfolioText||'',
      data.transcript||'', JSON.stringify(data.analysis||{}), data.analysis?.overallScore||0,
      data.roundType||'unknown', data.userId||null,
    ],
  })
  return id
}

export async function listInterviews(userId) {
  await initSchema()
  if (_dbUnavailable) return []
  const db = getDb()
  const res = await db.execute({
    sql: 'SELECT id,company,role,location,experience_years,salary_min,salary_max,salary_currency,date,overall_score,round_type FROM interviews WHERE user_id=? ORDER BY date DESC',
    args: [userId],
  })
  return res.rows
}

export async function getInterview(id, userId) {
  await initSchema()
  if (_dbUnavailable) return null
  const db = getDb()
  const res = await db.execute({ sql: 'SELECT * FROM interviews WHERE id=? AND user_id=?', args: [id, userId] })
  const row = res.rows[0]
  if (!row) return null
  let analysis = {}
  try { analysis = JSON.parse(row.analysis || '{}') } catch { analysis = {} }
  return { ...row, analysis }
}

export async function upsertQuestion(text, meta) {
  await initSchema()
  if (_dbUnavailable) return null
  const db = getDb()
  const normalized = text.toLowerCase().trim().replace(/\s+/g,' ')
  const existing = await db.execute({ sql: 'SELECT id FROM questions WHERE normalized=?', args: [normalized] })
  if (existing.rows[0]) {
    await db.execute({
      sql: "UPDATE questions SET frequency=frequency+1, last_seen=datetime('now') WHERE id=?",
      args: [existing.rows[0].id],
    })
    return existing.rows[0].id
  }
  const id = crypto.randomUUID()
  await db.execute({
    sql: 'INSERT INTO questions (id,text,normalized,company,role,location,experience_years,source,question_type,round_type) VALUES (?,?,?,?,?,?,?,?,?,?)',
    args: [id, text, normalized, normalizeCompany(meta.company), meta.role||'', meta.location||'', meta.experienceYears||'', meta.source||'user', meta.questionType||'', meta.roundType||'unknown'],
  })
  return id
}

export async function getQuestions({ company, role, location, experienceYears, search, source, questionType, sortBy='recency' } = {}) {
  await initSchema()
  if (_dbUnavailable) return []
  const db = getDb()
  let sql = 'SELECT * FROM questions WHERE 1=1'
  const args = []
  if (company) { sql += ' AND company LIKE ?'; args.push(`%${company}%`) }
  if (role) { sql += ' AND role LIKE ?'; args.push(`%${role}%`) }
  if (location) { sql += ' AND location LIKE ?'; args.push(`%${location}%`) }
  if (experienceYears) { sql += ' AND (experience_years=? OR experience_years="")'; args.push(experienceYears) }
  if (search) { sql += ' AND text LIKE ?'; args.push(`%${search}%`) }
  if (source) { sql += ' AND source=?'; args.push(source) }
  if (questionType) { sql += ' AND UPPER(question_type)=UPPER(?)'; args.push(questionType) }
  sql += sortBy === 'frequency' ? ' ORDER BY frequency DESC, last_seen DESC' : ' ORDER BY last_seen DESC, frequency DESC'
  sql += ' LIMIT 200'
  const res = await db.execute({ sql, args })
  return res.rows
}

export async function getSalaries({ role, company, location, experienceYears, source } = {}) {
  await initSchema()
  if (_dbUnavailable) return []
  const db = getDb()
  let sql = 'SELECT * FROM interviews WHERE salary_min IS NOT NULL'
  const args = []
  if (role) { sql += ' AND role LIKE ?'; args.push(`%${role}%`) }
  if (company) { sql += ' AND company LIKE ?'; args.push(`%${company}%`) }
  if (location) { sql += ' AND location LIKE ?'; args.push(`%${location}%`) }
  if (experienceYears) { sql += ' AND experience_years=?'; args.push(experienceYears) }
  if (source) { sql += ' AND salary_source=?'; args.push(source) }
  sql += ' ORDER BY date DESC'
  const res = await db.execute({ sql, args })
  return res.rows
}

export async function getFilterOptions() {
  await initSchema()
  if (_dbUnavailable) return { companies: [], roles: [], locations: [], qCompanies: [], sources: [], salarySources: [] }
  const db = getDb()
  // D-06: allSettled — one failing query returns empty array, not a full crash
  const [companies, roles, locations, qCompanies, sources, salarySources] = await Promise.allSettled([
    db.execute({ sql: 'SELECT DISTINCT company FROM interviews ORDER BY company', args: [] }),
    db.execute({ sql: 'SELECT DISTINCT role FROM interviews ORDER BY role', args: [] }),
    db.execute({ sql: "SELECT DISTINCT location FROM interviews WHERE location!='' ORDER BY location", args: [] }),
    db.execute({ sql: "SELECT DISTINCT company FROM questions WHERE company!='' ORDER BY company", args: [] }),
    db.execute({ sql: 'SELECT DISTINCT source FROM questions ORDER BY source', args: [] }),
    db.execute({ sql: 'SELECT DISTINCT salary_source FROM interviews ORDER BY salary_source', args: [] }),
  ])
  const rows = (r) => r.status === 'fulfilled' ? r.value.rows : []
  return {
    companies: rows(companies).map(r=>r.company),
    roles:     rows(roles).map(r=>r.role),
    locations: rows(locations).map(r=>r.location),
    qCompanies:rows(qCompanies).map(r=>r.company),
    sources:   rows(sources).map(r=>r.source),
    salarySources: rows(salarySources).map(r=>r.salary_source),
  }
}
export async function savePrediction(data) {
  await initSchema()
  const db = getDb()
  const company   = normalizeCompany(data.company)
  const roleLevel = data.roleLevel || ''
  const roundType = data.roundType || ''
  const userId    = data.userId || null

  // Honour the unique constraint (user_id, company, role_level, round_type):
  // if an identical scenario already exists, update it in-place and return the
  // same id so the client navigates to the existing report.
  const existing = await db.execute({
    sql: `SELECT id FROM predictions
          WHERE COALESCE(user_id,'')=? AND company=? AND role_level=? AND round_type=?`,
    args: [userId || '', company, roleLevel, roundType],
  })
  if (existing.rows[0]) {
    const id = existing.rows[0].id
    await db.execute({
      sql: `UPDATE predictions
            SET jd_text=?, cv_text=?, result=?, outcome='pending', created_at=datetime('now')
            WHERE id=?`,
      args: [data.jdText || '', data.cvText || '', JSON.stringify(data.result || {}), id],
    })
    return id
  }

  const id = crypto.randomUUID()
  await db.execute({
    sql: `INSERT INTO predictions (id, company, role_level, round_type, jd_text, cv_text, result, outcome, user_id)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [id, company, roleLevel, roundType, data.jdText || '', data.cvText || '',
           JSON.stringify(data.result || {}), 'pending', userId],
  })
  return id
}
export async function getPredictions(userId) {
  await initSchema()
  const db = getDb()
  const res = await db.execute({
    sql: 'SELECT id, company, role_level, round_type, outcome, created_at, result FROM predictions WHERE user_id=? ORDER BY created_at DESC',
    args: [userId]
  })
  return res.rows
}
export async function getPredictionById(id, userId) {
  await initSchema()
  const db = getDb()
  const res = await db.execute({
    sql: userId
      ? 'SELECT * FROM predictions WHERE id=? AND (user_id=? OR user_id IS NULL)'
      : 'SELECT * FROM predictions WHERE id=?',
    args: userId ? [id, userId] : [id]
  })
  const row = res.rows[0]
  if (!row) return null
  let result = {}
  try { result = JSON.parse(row.result || '{}') } catch { result = {} }
  return { ...row, result }
}
export async function updatePredictionOutcome(id, outcome) {
  await initSchema()
  const db = getDb()
  await db.execute({
    sql: 'UPDATE predictions SET outcome=? WHERE id=?',
    args: [outcome, id]
  })
}
export async function updateQuestionFeedback(predictionId, questionIndex, typeIndex, wasAsked) {
  await initSchema()
  const db = getDb()
  const res = await db.execute({
    sql: 'SELECT result FROM predictions WHERE id=?',
    args: [predictionId]
  })
  const row = res.rows[0]
  if (!row) return
  let result = {}
  try { result = JSON.parse(row.result || '{}') } catch { return }

  if (result.predictedQuestions?.[typeIndex]?.questions?.[questionIndex]) {
    result.predictedQuestions[typeIndex].questions[questionIndex].wasAsked = wasAsked
  }

  await db.execute({
    sql: 'UPDATE predictions SET result=? WHERE id=?',
    args: [JSON.stringify(result), predictionId]
  })
}
// ─── One-time data migration ───────────────────────────────────────────────
// Normalises all existing company names in interviews, predictions, and questions,
// deduplicates predictions on (user_id, company, role_level, round_type),
// then creates the unique index that enforces this going forward.
// Safe to call multiple times — idempotent.
export async function runCompanyNormalisationMigration() {
  await initSchema()
  const db = getDb()
  const results = { interviews: 0, predictions: 0, questions: 0, dupsRemoved: 0, indexCreated: false }

  // 1. Normalise interviews.company
  const ivRows = await db.execute({ sql: 'SELECT id, company FROM interviews', args: [] })
  for (const row of ivRows.rows) {
    const norm = normalizeCompany(row.company)
    if (norm !== row.company) {
      await db.execute({ sql: 'UPDATE interviews SET company=? WHERE id=?', args: [norm, row.id] })
      results.interviews++
    }
  }

  // 2. Normalise predictions.company
  const prRows = await db.execute({ sql: 'SELECT id, company FROM predictions', args: [] })
  for (const row of prRows.rows) {
    const norm = normalizeCompany(row.company)
    if (norm !== row.company) {
      await db.execute({ sql: 'UPDATE predictions SET company=? WHERE id=?', args: [norm, row.id] })
      results.predictions++
    }
  }

  // 3. Normalise questions.company
  const qRows = await db.execute({ sql: 'SELECT id, company FROM questions', args: [] })
  for (const row of qRows.rows) {
    const norm = normalizeCompany(row.company)
    if (norm !== row.company) {
      await db.execute({ sql: 'UPDATE questions SET company=? WHERE id=?', args: [norm, row.id] })
      results.questions++
    }
  }

  // 4. Deduplicate predictions on (user_id, company, role_level, round_type) —
  //    keep the most recently created row per group, delete the rest.
  //    Must run BEFORE creating the unique index.
  const dupDel = await db.execute({
    sql: `DELETE FROM predictions
          WHERE rowid NOT IN (
            SELECT MAX(rowid)
            FROM predictions
            GROUP BY COALESCE(user_id,''), company, role_level, round_type
          )`,
    args: [],
  })
  results.dupsRemoved = dupDel.rowsAffected ?? 0

  // 5. Create unique index — idempotent via IF NOT EXISTS
  await db.execute({
    sql: `CREATE UNIQUE INDEX IF NOT EXISTS idx_predictions_uniq
          ON predictions(COALESCE(user_id,''), company, role_level, round_type)`,
    args: [],
  })
  results.indexCreated = true

  return results
}

export async function saveBugReport({ description, page, activity, userAgent, screenSize, userName }) {
  await initSchema()
  if (_dbUnavailable) return null
  const db = getDb()
  const id = crypto.randomUUID()
  await db.execute({
    sql: 'INSERT INTO bug_reports (id, description, page, activity, user_agent, screen_size, user_name) VALUES (?, ?, ?, ?, ?, ?, ?)',
    args: [id, description, page||'', activity||'', userAgent||'', screenSize||'', userName||''],
  })
  return id
}
