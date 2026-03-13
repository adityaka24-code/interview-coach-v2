# CLAUDE.md — Interview Coach v2

AI assistant guide for the **PM Interview Coach** codebase. Read this before making changes.

---

## Project Overview

A full-stack Next.js 15 application that records, transcribes, and analyses PM (Product Manager) interview responses using Claude AI. It evaluates answers against question-type-specific rubrics, tracks history, maintains a question bank, and provides salary analytics.

**Stack:** Next.js 15 (App Router) · React 18 · Turso SQLite · Claude API (Anthropic) · OpenAI Whisper

---

## Repository Structure

```
interview-coach-v2/
├── app/
│   ├── layout.js                    # Root layout — wraps app in ThemeProvider
│   ├── page.js                      # Home page — recording, upload, analysis UI
│   ├── globals.css                  # CSS custom properties (theme variables, animations)
│   ├── api/
│   │   ├── analyze/route.js         # Core analysis engine (Claude-powered, 449 lines)
│   │   ├── classify-transcript/route.js  # Claude Tools API — parse transcript into Q&A
│   │   ├── rewrite/route.js         # Claude Tools API — rewrite answer suggestions
│   │   ├── transcribe/route.js      # OpenAI Whisper audio → text
│   │   ├── parse-file/route.js      # PDF/DOCX/PPTX text extraction
│   │   ├── fetch-url/route.js       # Fetch portfolio/URL content
│   │   ├── interviews/route.js      # Interview CRUD
│   │   ├── profile/route.js         # User profile GET/POST
│   │   ├── questions/route.js       # Question bank queries with filters
│   │   ├── salaries/route.js        # Salary analytics, period trends
│   │   └── bug-report/route.js      # Bug report submission
│   ├── components/
│   │   ├── Nav.js                   # Header with theme/a11y toggles + bug report
│   │   ├── Footer.js                # Creator attribution + social links
│   │   ├── FileDropZone.js          # Drag-and-drop file upload (PDF/DOCX/PPTX)
│   │   └── BugReportButton.js       # Modal bug reporter with context capture
│   ├── context/
│   │   └── ThemeContext.js          # Dark/light/a11y mode via React Context
│   ├── history/
│   │   ├── page.js                  # Interview history list
│   │   └── [id]/page.js             # Single interview deep-dive view
│   ├── profile/page.js              # CV / portfolio / bio management
│   ├── questions/page.js            # Question bank explorer
│   └── salaries/page.js             # Salary trends dashboard
└── lib/
    └── db.js                        # Turso SQLite client — singleton, schema init, CRUD
```

---

## Development Commands

```bash
npm run dev      # Start Next.js dev server (hot reload)
npm run build    # Production build
npm run start    # Start production server
```

There is **no test runner configured**. No Jest, Vitest, or testing libraries are present.

---

## Environment Variables

Copy `.env.local.template` → `.env.local` and fill in all four values:

```
ANTHROPIC_API_KEY=sk-ant-...       # Claude API — analysis, transcript classification, rewrites
OPENAI_API_KEY=sk-...              # OpenAI Whisper — audio transcription only
TURSO_DATABASE_URL=libsql://...    # Turso remote SQLite URL
TURSO_AUTH_TOKEN=...               # Turso auth token
```

Never commit `.env.local`.

---

## Database (Turso / libSQL)

**File:** `lib/db.js`

- **Singleton pattern:** `getDb()` creates one connection and caches it globally. Always use `getDb()` — never instantiate `@libsql/client` directly.
- **Auto-initialization:** `initSchema()` runs on first `getDb()` call. It's idempotent — safe to call repeatedly.
- **Migrations:** Schema changes use `ALTER TABLE` wrapped in try/catch blocks. Backfill queries use `UPDATE … WHERE column IS NULL` for idempotency. Always follow this pattern for new columns.
- **Security:** All queries use parameterized statements (`:name` syntax). Never interpolate user input into SQL strings.
- **Resilience:** Queries in `getQuestions()` use `Promise.allSettled()` so partial failures don't crash the whole request.

### Tables

| Table | Purpose |
|---|---|
| `users` | Single-user profile (cv_text, portfolio_text, name, title, org) |
| `interviews` | Interview sessions — transcript, analysis JSON, scores, metadata |
| `questions` | Deduplicated question bank built from interviews |
| `bug_reports` | In-app bug reports |

### Key DB Functions

```js
import { getDb, getUserProfile, saveUserProfile,
         saveInterview, getInterviews, getInterviewById,
         saveQuestions, getQuestions } from '@/lib/db'
```

---

## AI Integration

### Claude (Anthropic SDK)

**Model in use:** `claude-haiku-4-5-20251001` — used in all three Claude API routes.

**Three usage patterns:**

1. **`/api/analyze`** — Plain text completion with a large system prompt. Returns structured JSON for interview scoring. Uses a 24-pass JSON repair utility (`repairJSON`) because Claude output can fail JSON.parse in edge cases.

2. **`/api/classify-transcript`** — Uses **Claude Tools API** to force structured output. The tool schema defines the exact shape expected (question/answer segments). Prefer this pattern when you need guaranteed structure.

3. **`/api/rewrite`** — Also uses **Claude Tools API** to return a rewritten answer. Same structured output guarantee.

**When adding new AI features:**
- For structured data → use Claude Tools API (see `classify-transcript/route.js` as reference)
- For free-form analysis → use plain completion with `repairJSON` on the response
- Always import from `@anthropic-ai/sdk`
- Use model ID `claude-haiku-4-5-20251001` unless a task explicitly requires a more capable model

### OpenAI (Whisper only)

Only used in `/api/transcribe` for speech-to-text. The import is `openai`. Do not expand OpenAI usage — all intelligence/analysis should use Claude.

---

## Question Type Taxonomy

The analysis engine evaluates 12 PM question types. Each has its own rubric baked into the system prompt in `analyze/route.js`. The canonical type strings (used in DB and UI):

```
PRODUCT_SENSE · PRODUCT_IMPROVEMENT · PRODUCT_REDESIGN · DESIGN
BEHAVIOURAL · ESTIMATION · GUESSTIMATE · MARKET_ESTIMATION
STRATEGY · CASE_STUDY · METRIC · EXECUTION
```

When extending scoring logic or adding new rubrics, edit the system prompt in `app/api/analyze/route.js` and keep type strings consistent with the above list.

---

## Theming & Styling

**Approach:** Inline styles throughout (`style={{ ... }}`). There is no CSS-in-JS library and no Tailwind. Global utility classes live in `globals.css`.

**Theme system:**
- `ThemeContext.js` provides `{ theme, toggleTheme, a11yMode, toggleA11y }`
- Active theme is set as a `data-theme` attribute on `<html>` and a `data-a11y` attribute for accessibility mode
- CSS custom properties handle all colour/spacing tokens

**CSS variables (defined in `globals.css`):**

```css
--bg, --bg-secondary, --text, --text-secondary
--accent, --border, --success, --warning, --danger
--card-bg, --input-bg, --shadow
```

Always reference these variables in inline styles (e.g., `color: 'var(--text)'`) rather than hardcoding colours.

**Fonts:** Montserrat (headings) · Open Sans (body) · DM Mono (code/mono)

**Theme persistence:** `localStorage` (`theme` and `a11yMode` keys).

---

## Path Aliases

`jsconfig.json` configures:

```js
import Foo from '@/lib/db'        // resolves to ./lib/db.js
import Bar from '@/app/components/Nav'
```

Always use `@/` imports. Never use relative `../../` paths.

---

## File Parsing

`/api/parse-file` handles PDF, DOCX, and PPTX via server-side packages declared in `next.config.js`:

```js
serverExternalPackages: ['pdf-parse', 'mammoth', 'officeparser']
```

These packages require dynamic imports inside route handlers, not top-level imports. Follow the existing pattern in `parse-file/route.js` when adding new server-only file processing.

---

## Key Conventions

### API Routes

- All routes are in `app/api/*/route.js` following Next.js App Router conventions.
- Use `NextResponse.json()` for all responses.
- Return `{ error: '...' }` with appropriate HTTP status on failures.
- Validate required fields at the top of each handler before any expensive operations.

### Component Patterns

- Function components only. No class components.
- State with `useState`, side effects with `useEffect`, memoised callbacks with `useCallback`.
- No external state management library (no Redux, Zustand, etc.).
- Accessibility: always include `aria-label` on interactive elements, `role` where semantic HTML isn't sufficient.

### JSON Repair (repairJSON)

`app/api/analyze/route.js` exports a `repairJSON(str)` utility that handles 24 known Claude output edge cases (unescaped quotes, trailing commas, BOM characters, etc.). Import and use it whenever parsing Claude's raw text response:

```js
import { repairJSON } from '@/app/api/analyze/route'  // or inline for new routes
const parsed = JSON.parse(repairJSON(claudeRawText))
```

### Error Handling

- Wrap all Claude/OpenAI API calls in try/catch.
- Log errors to `console.error` with context (route name, operation).
- Return a safe fallback response — never let unhandled exceptions reach the client as 500s.

---

## Architecture Decisions (Do Not Change Without Understanding)

| Decision | Reason |
|---|---|
| Single-user app (hardcoded `userId = 'default'`) | Intentional — personal tool, no auth needed |
| Inline styles instead of CSS modules | Rapid iteration speed; acceptable for single-dev project |
| `repairJSON` 24-pass repair | Claude responses occasionally break standard `JSON.parse`; this is battle-tested |
| `Promise.allSettled` in question queries | Multiple optional filter queries — partial failure should not crash the endpoint |
| Dynamic imports for pdf-parse/mammoth/officeparser | These packages are Node.js-only; dynamic import prevents Next.js build errors |
| Turso (libSQL) over local SQLite | Persists data on Vercel serverless (no writable filesystem) |

---

## Common Tasks

### Add a new API route

1. Create `app/api/<name>/route.js`
2. Export `export async function GET(request)` / `POST` as needed
3. Import `getDb` from `@/lib/db` if DB access is required
4. Return `NextResponse.json({ ... })`

### Add a new database column

1. Add column to the `CREATE TABLE` statement in `lib/db.js`
2. Add an idempotent `ALTER TABLE` migration in `initSchema()` (wrapped in try/catch)
3. Add a backfill `UPDATE ... WHERE column IS NULL` if a default value is needed

### Extend the analysis rubric

1. Open `app/api/analyze/route.js`
2. Find the system prompt section for the relevant question type (search for `PRODUCT_SENSE`, `BEHAVIOURAL`, etc.)
3. Modify the rubric criteria inline in the prompt string
4. Keep the output JSON shape unchanged unless you also update the parsing/display code in `app/page.js` and `app/history/[id]/page.js`

### Add a new Claude feature

1. Create the route file
2. Import `Anthropic` from `@anthropic-ai/sdk`
3. Instantiate with `new Anthropic()` (reads `ANTHROPIC_API_KEY` from env automatically)
4. For structured output: use Tools API (see `classify-transcript/route.js`)
5. For free-form: use `messages.create` and wrap output in `repairJSON` before `JSON.parse`
