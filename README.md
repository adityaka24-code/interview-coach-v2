# PM Interview Coach

An AI-powered interview preparation tool for Product Managers. Record or paste interview transcripts for instant analysis, or generate a tailored prediction report — predicted questions, gap analysis, and callback probability — before your next interview.

---

## Features

### Transcript Analysis
- **Record or paste** a PM interview transcript
- **AI scoring** across 12 question types: Product Sense, Behavioural, Strategy, Estimation, Execution, Metric, and more
- **Per-answer breakdown** — score, strengths, critical gaps, the #1 fix, and a pattern observation
- **Overall verdict** with recruiter-style commentary
- **CV/portfolio context** — upload your CV to get personalised feedback
- **Rewrite suggestions** — Claude rewrites weak answers for you
- **PDF export** of the full report

### Prediction Report
- **Predict interview questions** before you walk in — grouped by type, with high/medium/low likelihood
- **Gap analysis** — JD vs CV comparison, probe risk per gap, prep advice
- **Callback probability** — scored across 4 dimensions (keyword overlap, seniority match, hard requirements, CV substance), shown with and without a referral
- **3 parallel AI analyses** running simultaneously so the report is ready fast
- **45-second countdown** with live section status during generation
- **Auto-recovery** — if callback probability fails to generate, it recomputes silently on the next report view

### Activity & History
- Full history of transcript analyses and prediction reports
- Delete individual reports
- Prediction scores and referral uplift shown in the activity list
- Predictions made while unauthenticated are automatically claimed when you sign in

### Profile
- Store your CV, portfolio, and bio once — auto-loaded into every analysis
- Context is used to personalise scoring and gap analysis

### Job Insights
- Salary trends by company, role level, and location
- Question bank from real PM interviews, filterable by company and type

---

## Tech Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 15 (App Router) |
| UI | React 18 — inline styles, no CSS-in-JS or Tailwind |
| AI — analysis & prediction | Claude (`claude-sonnet-4-5`, `claude-haiku-4-5-20251001`) via Anthropic SDK |
| AI — transcription | OpenAI Whisper |
| Database | Turso (libSQL / SQLite) |
| Auth | Clerk |
| PDF | @react-pdf/renderer |
| File parsing | pdf-parse · mammoth · officeparser |
| Deployment | Vercel |

---

## Getting Started

### 1. Clone and install

```bash
git clone https://github.com/adityaka24-code/interview-coach-v2.git
cd interview-coach-v2
npm install
```

### 2. Set up environment variables

```bash
cp .env.local.template .env.local
```

Fill in all values in `.env.local`:

```
ANTHROPIC_API_KEY=sk-ant-...        # Claude API — analysis, prediction, rewrites
OPENAI_API_KEY=sk-...               # OpenAI Whisper — audio transcription only
TURSO_DATABASE_URL=libsql://...     # Turso remote SQLite database URL
TURSO_AUTH_TOKEN=...                # Turso auth token
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_...
CLERK_SECRET_KEY=sk_...
```

Get your keys:
- **Anthropic** → [console.anthropic.com](https://console.anthropic.com)
- **OpenAI** → [platform.openai.com](https://platform.openai.com)
- **Turso** → [turso.tech](https://turso.tech) — free tier is sufficient
- **Clerk** → [clerk.com](https://clerk.com) — create an app and enable Google OAuth

### 3. Run locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The database schema initialises automatically on first run.

---

## Project Structure

```
interview-coach-v2/
├── app/
│   ├── page.js                          # Home — transcript analysis + prediction form
│   ├── layout.js                        # Root layout, ThemeProvider
│   ├── globals.css                      # CSS custom properties (theme tokens)
│   ├── api/
│   │   ├── analyze/route.js             # Core transcript analysis engine (Claude)
│   │   ├── predict/route.js             # Prediction SSE stream — 3 parallel Claude calls
│   │   ├── predictions/
│   │   │   ├── route.js                 # List / save predictions
│   │   │   └── [id]/
│   │   │       ├── route.js             # Get / PATCH / claim prediction
│   │   │       └── callback/route.js    # Recompute missing callback probability
│   │   ├── interviews/route.js          # Interview CRUD + DELETE
│   │   ├── transcribe/route.js          # OpenAI Whisper — audio to text
│   │   ├── classify-transcript/route.js # Claude Tools — parse transcript into Q&A
│   │   ├── rewrite/route.js             # Claude Tools — rewrite answer suggestions
│   │   ├── parse-file/route.js          # PDF / DOCX / PPTX text extraction
│   │   ├── profile/route.js             # User profile GET / POST
│   │   ├── questions/route.js           # Question bank with filters
│   │   └── salaries/route.js            # Salary analytics
│   ├── components/
│   │   ├── Nav.js                       # Header — theme, a11y, auth
│   │   └── BugReportButton.js           # In-app bug reporter
│   ├── predict/
│   │   ├── loading/page.js              # 45s countdown + SSE progress
│   │   └── report/[id]/page.js          # Prediction report
│   ├── history/page.js                  # Activity — interviews + predictions
│   ├── profile/page.js                  # CV / portfolio management
│   ├── onboarding/                      # First-run onboarding flow
│   └── sign-in/page.js                  # Custom Clerk sign-in with "Maybe later"
├── lib/
│   └── db.js                            # Turso singleton, schema init, all DB functions
└── middleware.js                         # Clerk auth + public route config
```

---

## Architecture Notes

### AI patterns

- **Structured output** (prediction, gap analysis, callback) → Claude Tools API with strict JSON schemas. Guarantees the shape of the response.
- **Free-form analysis** (transcript scoring) → plain `messages.create` + a 24-pass `repairJSON` utility that handles edge cases in Claude's raw output.
- **Parallel execution** — the prediction flow runs 3 independent Claude calls simultaneously via `Promise.allSettled`, streaming each section back to the client as it completes.
- **Retry with backoff** — all Claude calls use exponential backoff and never retry on 400/401.
- **Auto-recovery** — if callback probability fails during prediction generation, the report page silently recomputes it on next load using the stored JD + CV.

### Database

- **Singleton pattern** — `getDb()` creates one Turso connection and caches it globally.
- **Idempotent migrations** — schema changes use `ALTER TABLE` in try/catch; safe to run on every startup.
- **Parameterised queries throughout** — no string interpolation of user input.
- **Prediction ownership** — predictions made anonymously (`user_id = NULL`) are claimed atomically when the user signs in, using `UPDATE ... WHERE user_id IS NULL`.

### Auth model

- Most routes are public — transcript analysis and prediction work without an account.
- Signing in saves your work and enables PDF downloads.
- The **Maybe later** option on sign-in lets users view their report without creating an account.
- Anonymous predictions are automatically associated with the user's account on sign-in.

### Theming

CSS custom properties (`--bg`, `--text`, `--accent`, `--surface`, etc.) handle all colours. A `data-theme` attribute on `<html>` switches between dark and light. A `data-a11y` attribute enables high-contrast mode. Preferences persist in `localStorage`.

---

## Commands

```bash
npm run dev      # Development server with hot reload
npm run build    # Production build
npm run start    # Start production server
```

---

## Deployment

Optimised for **Vercel**. Set all environment variables in the Vercel dashboard under Settings → Environment Variables. The Turso database persists data across serverless function invocations — no writable filesystem dependency.
