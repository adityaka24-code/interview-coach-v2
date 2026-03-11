import { createClient } from '@libsql/client'

let _db

export function getDb() {
  if (!_db) {
    // D-03: validate required env vars before attempting connection
    if (!process.env.TURSO_DATABASE_URL) {
      throw new Error('TURSO_DATABASE_URL is not set. Add it to your .env.local file.')
    }
    _db = createClient({
      url: process.env.TURSO_DATABASE_URL,
      authToken: process.env.TURSO_AUTH_TOKEN,
    })
  }
  return _db
}

export async function initSchema() {
  const db = getDb()
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
}

export async function getUser() {
  await initSchema()
  const db = getDb()
  const res = await db.execute({ sql: "SELECT * FROM users WHERE id='default'", args: [] })
  return res.rows[0] || null
}

export async function upsertUser(data) {
  await initSchema()
  const db = getDb()
  await db.execute({
    sql: `UPDATE users SET name=?, email=?, title=?, org=?, cv_text=?, portfolio_text=?, updated_at=datetime('now') WHERE id='default'`,
    args: [data.name||'Me', data.email||'', data.title||'', data.org||'', data.cv_text||'', data.portfolio_text||''],
  })
}

export async function saveInterview(data) {
  await initSchema()
  const db = getDb()
  const id = crypto.randomUUID()
  await db.execute({
    sql: `INSERT INTO interviews 
      (id,company,role,location,experience_years,salary_min,salary_max,salary_currency,salary_source,
       job_description,job_url,cv_text,portfolio_text,transcript,analysis,overall_score,round_type)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    args: [
      id, data.company, data.role, data.location||'', data.experienceYears||'',
      data.salaryMin||null, data.salaryMax||null, data.salaryCurrency||'USD', data.salarySource||'user',
      data.jobDescription||'', data.jobUrl||'', data.cvText||'', data.portfolioText||'',
      data.transcript||'', JSON.stringify(data.analysis||{}), data.analysis?.overallScore||0, data.roundType||'unknown',
    ],
  })
  return id
}

export async function listInterviews() {
  await initSchema()
  const db = getDb()
  const res = await db.execute({
    sql: 'SELECT id,company,role,location,experience_years,salary_min,salary_max,salary_currency,date,overall_score,round_type FROM interviews ORDER BY date DESC',
    args: [],
  })
  return res.rows
}

export async function getInterview(id) {
  await initSchema()
  const db = getDb()
  const res = await db.execute({ sql: 'SELECT * FROM interviews WHERE id=?', args: [id] })
  const row = res.rows[0]
  if (!row) return null
  // D-05: corrupt analysis column must not 500 the history detail page
  let analysis = {}
  try { analysis = JSON.parse(row.analysis || '{}') } catch { analysis = {} }
  return { ...row, analysis }
}

export async function upsertQuestion(text, meta) {
  await initSchema()
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
    args: [id, text, normalized, meta.company||'', meta.role||'', meta.location||'', meta.experienceYears||'', meta.source||'user', meta.questionType||'', meta.roundType||'unknown'],
  })
  return id
}

export async function getQuestions({ company, role, location, experienceYears, search, source, questionType, sortBy='recency' } = {}) {
  await initSchema()
  const db = getDb()
  let sql = 'SELECT * FROM questions WHERE 1=1'
  const args = []
  if (company) { sql += ' AND company LIKE ?'; args.push(`%${company}%`) }
  if (role) { sql += ' AND role LIKE ?'; args.push(`%${role}%`) }
  if (location) { sql += ' AND location LIKE ?'; args.push(`%${location}%`) }
  if (experienceYears) { sql += ' AND (experience_years=? OR experience_years="")'; args.push(experienceYears) }
  if (search) { sql += ' AND text LIKE ?'; args.push(`%${search}%`) }
  if (source) { sql += ' AND source=?'; args.push(source) }
  if (questionType) { sql += ' AND question_type=?'; args.push(questionType) }
  sql += sortBy === 'frequency' ? ' ORDER BY frequency DESC, last_seen DESC' : ' ORDER BY last_seen DESC, frequency DESC'
  sql += ' LIMIT 200'
  const res = await db.execute({ sql, args })
  return res.rows
}

export async function getSalaries({ role, company, location, experienceYears, source } = {}) {
  await initSchema()
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
export async function saveBugReport({ description, page, activity, userAgent, screenSize, userName }) {
  await initSchema()
  const db = getDb()
  const id = crypto.randomUUID()
  await db.execute({
    sql: 'INSERT INTO bug_reports (id, description, page, activity, user_agent, screen_size, user_name) VALUES (?, ?, ?, ?, ?, ?, ?)',
    args: [id, description, page||'', activity||'', userAgent||'', screenSize||'', userName||''],
  })
  return id
}
