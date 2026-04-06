# PM Interview Coach

An AI-powered preparation tool for Product Manager interviews. Analyse transcripts from past interviews, or generate a full prediction report — predicted questions, gap analysis, and callback probability — tailored to a specific job description and your CV.

---

## Features

### Prediction Report
- **Predict interview questions** before you walk in — grouped by question type, each with high/medium/low likelihood and rationale
- **Gap analysis** — JD vs CV comparison surfacing only high and medium probe-risk gaps, with prep advice per gap
- **Callback probability** — scored across 5 dimensions (keyword overlap, skills match, seniority fit, hard requirement coverage, CV substance), displayed with and without a referral boost
- **Visual score breakdown** — each dimension rendered as an inline score box with a fill bar, so you see exactly where points were won or lost
- **3 parallel AI analyses** run simultaneously — questions, gaps, and callback complete independently and stream to the page as they finish
- **Similar questions on record** — even on low-confidence predictions, shows the top 3 most semantically similar questions from the real interview database
- **Company-aware retrieval** — questions from your target company are retrieved and used to ground predictions; subsidiaries (YouTube → Google, Instagram → Meta, etc.) automatically inherit the parent company's question bank

### Transcript Analysis
- **Record or paste** a PM interview transcript
- **AI scoring** across 12 question types: Product Sense, Behavioural, Strategy, Estimation, Execution, Metric, and more
- **Per-answer breakdown** — score, strengths, critical gaps, the #1 fix, and a pattern observation
- **Overall verdict** with recruiter-style commentary
- **CV/portfolio context** — upload your CV to get personalised feedback aligned to your background
- **Rewrite suggestions** — Claude rewrites weak answers so you can see what a strong response looks like
- **PDF export** of the full analysis report

### Activity & History
- Full history of transcript analyses and prediction reports in one feed
- Prediction callback scores and referral uplift shown inline in the activity list
- Predictions made without an account are automatically claimed when you sign in

### Profile
- Store your CV, portfolio, and bio once — auto-loaded into every analysis and prediction
- Context is used to personalise gap analysis and answer scoring

### Job Insights
- Salary trends by company, role level, and location
- Real PM interview question bank, filterable by company and question type

---

## Tech Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 15 (App Router) |
| UI | React 18 — inline styles, CSS custom properties, no Tailwind |
| AI — prediction & analysis | Claude (`claude-sonnet-4-5`, `claude-haiku-4-5-20251001`) via Anthropic SDK |
| AI — transcription | OpenAI Whisper |
| Embeddings & retrieval | Voyage AI (`voyage-3-lite`) — semantic search over real PM interview questions |
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
ANTHROPIC_API_KEY=sk-ant-...        # Claude — analysis, prediction, rewrites
OPENAI_API_KEY=sk-...               # OpenAI Whisper — audio transcription only
TURSO_DATABASE_URL=libsql://...     # Turso remote SQLite database URL
TURSO_AUTH_TOKEN=...                # Turso auth token
VOYAGE_API_KEY=...                  # Voyage AI — semantic question retrieval
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_...
CLERK_SECRET_KEY=sk_...
```

Get your keys:
- **Anthropic** → [console.anthropic.com](https://console.anthropic.com)
- **OpenAI** → [platform.openai.com](https://platform.openai.com)
- **Turso** → [turso.tech](https://turso.tech) — free tier is sufficient
- **Voyage AI** → [voyageai.com](https://www.voyageai.com) — free tier is sufficient
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
│   │   ├── interviews/route.js          # Interview CRUD
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
│   │   ├── loading/page.js              # Countdown + SSE progress
│   │   └── report/[id]/page.js          # Prediction report
│   ├── history/page.js                  # Activity — interviews + predictions
│   ├── profile/page.js                  # CV / portfolio management
│   ├── onboarding/                      # First-run onboarding flow
│   └── sign-in/page.js                  # Custom Clerk sign-in with "Maybe later"
├── lib/
│   ├── db.js                            # Turso singleton, schema init, all DB functions
│   └── embeddings.js                    # Voyage AI embedding, cosine similarity, query preprocessing
├── scripts/
│   └── test-retrieval.mjs               # Retrieval pipeline smoke test (local, uses live DB)
└── middleware.js                         # Clerk auth + public route config
```

---

## Architecture Notes

### Prediction pipeline

The prediction report runs three independent Claude calls simultaneously via `Promise.allSettled`, each targeting a different tool:

| Call | Tool | What it produces |
|---|---|---|
| `fetchQuestions` | `submit_questions` | Predicted questions by type |
| `fetchGaps` | `submit_gaps` | JD vs CV gap analysis |
| `fetchCallback` | `submit_callback` | Callback probability + signals |

Each section streams to the client the moment its call resolves. A section failure does not block the others.

### Retrieval-augmented prediction

Before calling Claude, the prediction route runs a semantic retrieval pipeline:

1. The JD + role + company are preprocessed and embedded via Voyage AI
2. Candidate questions are fetched from the `pm_questions` table — company-filtered first, with a parent-company alias fallback (e.g. YouTube → Google, Instagram → Meta)
3. Questions are ranked by cosine similarity × recency decay × confirmation boost
4. The top 25 are injected into the questions prompt as grounding context

If the company has fewer than 8 questions with embeddings, the retrieval falls back to a role-pattern pool and the report flags low confidence.

### Scoring model (callback probability)

The callback score is computed across 5 dimensions (total 100 pts):

| Dimension | Weight | What it measures |
|---|---|---|
| Keyword overlap | 8 pts | Verbatim JD terms present in CV |
| Skills match | 22 pts | Evidence of actually doing the required work |
| Seniority fit | 28 pts | Ownership, scope, and impact at the right level |
| Hard requirement coverage | 25 pts | Must-have criteria met vs. stated |
| CV substance | 17 pts | Specificity, metrics, and outcomes |

The raw score maps to a `withoutReferral` percentage (10–85%), then a non-linear referral boost is applied that peaks at ~50% base probability — reflecting that referrals move the needle most for borderline candidates.

### Reliability

- **Exponential backoff** with up to 8 retries and ±30% jitter on all Claude calls
- **`noRetry` flag** — errors where retrying cannot help (e.g. response truncated at `max_tokens`) fast-exit the retry loop immediately instead of burning through 8 attempts
- **`stop_reason` guard** — `fetchGaps` explicitly checks for `max_tokens` truncation and surfaces it to Vercel logs with a clear message
- **Auto-recovery** — if callback probability is missing on a saved report, the report page silently recomputes it on load

### Database

- **Singleton pattern** — `getDb()` creates one Turso connection and caches it globally across serverless invocations
- **Idempotent schema** — `initSchema()` runs on every cold start; migrations use `ALTER TABLE` in try/catch
- **Parameterised queries throughout** — no string interpolation of user input
- **Stratified retrieval** — `getQuestionsForRetrieval` fetches up to 17 questions per question type per company, deduplicates, then falls back to global pool if the company has insufficient data

### Auth model

- Most routes are public — transcript analysis and prediction work without an account
- Signing in enables PDF downloads and saves your history
- The **Maybe later** option lets users view a prediction report without creating an account
- Anonymous predictions are atomically claimed to the user's account on sign-in

---

## Commands

```bash
npm run dev                              # Development server with hot reload
npm run build                            # Production build
npm run start                            # Start production server
node scripts/test-retrieval.mjs          # Smoke-test retrieval pipeline against live DB
```

---

## Deployment

Optimised for **Vercel**. Set all environment variables in the Vercel dashboard under Settings → Environment Variables. Turso persists data across serverless invocations — no writable filesystem required.
