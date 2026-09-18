# Take Me Quality (TMQ)

The quality platform for Take Me’s booking call centres. Reviewers listen to calls in the recordings portal and score them here against the TMQ framework; managers get live dashboards, agent profiles, coaching summaries and Excel exports. It replaces the weekly “TMQ Scorecard” Google Sheet.

- **Reviewers:** paste rows from the recordings portal (or enter a call manually), score 21 checks with one tap each or with the keyboard, see the live score, save drafts automatically, submit, and move to the next call.
- **Admins:** dashboard (KPIs, weekly trend by site, section scores, heatmap, zero-tolerance log, agents needing attention, reviewer calibration), agent profiles with one-to-one reports, evaluations explorer with Excel/CSV export, scorecard rules with versioning and a what-if preview, users, sites, roster, workbook import and an audit log.
- **Summaries:** Manual (default, built from the scores, nothing leaves the platform) or AI (Google Gemini). Coaching summaries can be edited by hand and must be approved before sharing.

> **New here (person or AI assistant)?** Read [`HANDOFF.md`](HANDOFF.md) first: full context, every feature, the scoring rules, what was seeded, testing and deployment notes. The original plan, with an interactive copy of the scoring engine, is at [`docs/plan/index.html`](docs/plan/index.html).

---

## Tech stack

| Layer | Choice |
|---|---|
| App | Next.js 16 (App Router, Server Components, Server Actions), React 19, TypeScript |
| UI | Tailwind CSS 4, Take Me brand tokens (Blue `#00A6EB`, Cyan `#45C6FF`, black, white; Baloo 2 + Figtree), Recharts, lucide icons |
| Database | PostgreSQL 17 (Docker locally, **Neon** in production) with Drizzle ORM + drizzle-kit migrations |
| Auth | Own session auth: bcrypt passwords, database sessions (hashed tokens), httpOnly cookies, idle timeout, rate-limited sign-in |
| AI | Google Gemini via `@google/genai` (optional) |
| Tests | Vitest: unit tests (scoring engine, smart paste, dates) and integration tests against a real Postgres test database |
| PWA | Web app manifest, install button, service worker with offline page, Next.js `useOffline` connectivity handling |

---

## Run it locally

Prerequisites: Node.js 20+ (24 recommended) and Docker Desktop.

```bash
npm install
```

```bash
copy .env.example .env.local
```

Then edit `.env.local`: set `AUTH_SECRET` to a long random string (run `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`) and, if you want AI, `GEMINI_API_KEY`.

```bash
npm run db:up
```

```bash
npm run db:migrate
```

```bash
npm run db:seed:sample
```

```bash
npm run dev
```

Open http://localhost:3000.

| Account | Email | Password |
|---|---|---|
| Demo admin | `demo.admin@takeme.taxi` (or `SEED_ADMIN_EMAIL`) | `SEED_ADMIN_PASSWORD` from `.env.local` |
| Demo QA reviewer | `demo.qa@takeme.taxi` | `Demo-QA-2026!` |

`db:seed:sample` adds clearly labelled fictional sites, agents, calls and ~13 weeks of reviews so the dashboards have something to show. It does not import workbook people or call data. Use `npm run db:seed` instead for an empty system (framework, demo sites and the admin account only).

### Useful scripts

| Script | What it does |
|---|---|
| `npm run dev` | Start the app in development |
| `npm run build` / `npm start` | Production build / serve it |
| `npm test` | Run all tests (needs the Docker database running) |
| `npm run typecheck` / `npm run lint` | TypeScript and ESLint |
| `npm run db:up` | Start Postgres in Docker (port 5433) |
| `npm run db:migrate` | Apply database migrations |
| `npm run db:seed` | Install the TMQ framework, sites and first admin (safe to re-run) |
| `npm run db:seed:sample` | The above plus sample agents and review history |
| `npm run db:reset` | Wipe the **local** database and reseed with sample data |
| `npm run db:studio` | Browse the database in Drizzle Studio |
| `npm run ai:check` | Confirm Gemini works end to end with your key |

To also run the real-workbook import test, set `TMQ_WORKBOOK` to the path of an exported TMQ Scorecard `.xlsx` (it defaults to `Desktop\20260907 - Birmingham TMQ Scorecard.xlsx`).

---

## Deploy for free: Vercel + Neon

Both have free plans, and Neon connects to Vercel in a couple of clicks. Choose the **London** region so data stays in the UK.

### 1. Put the code on GitHub

Create a **private** repository and push this `takeme-quality` folder to it. `.env.local` is git-ignored, so no secrets are pushed.

### 2. Create the Vercel project

1. Sign in at https://vercel.com with GitHub and choose **Add New → Project**, then import the repository.
2. If the repo contains the parent folder, set **Root Directory** to `takeme-quality`.
3. Leave the framework as Next.js. The build command comes from `vercel.json` (`npm run vercel-build`, which runs database migrations and then `next build`), and functions run in London (`lhr1`).
4. Don’t deploy yet; add the database and settings first.

### 3. Add a free Neon database

1. In the Vercel project, open **Storage → Create Database → Neon (Serverless Postgres)**.
2. Choose the **Free** plan and the **London (AWS eu-west-2)** region, then connect it to the project for Production, Preview and Development.
3. Vercel adds `DATABASE_URL` (pooled) and `DATABASE_URL_UNPOOLED` automatically. The app uses the pooled one at runtime and the unpooled one for migrations.

### 4. Add the other environment variables

In **Settings → Environment Variables** (Production and Preview):

| Name | Value |
|---|---|
| `AUTH_SECRET` | A new long random string, different from your local one |
| `GEMINI_API_KEY` | Your Gemini key (optional; without it summaries stay Manual) |
| `GEMINI_MODEL` | `gemini-2.5-flash` (or a newer model such as `gemini-flash-latest`) |
| `SEED_ADMIN_EMAIL` | The first admin’s email |
| `SEED_ADMIN_PASSWORD` | A strong password for the first admin |
| `SESSION_IDLE_MINUTES` | Optional, default `60` |
| `AI_DAILY_LIMIT_PER_USER` | Optional, default `40` |

### 5. Deploy

Click **Deploy**. The build applies the migrations to Neon. When it finishes, open `https://<your-project>.vercel.app/api/health`; it should return `{"ok":true,"db":"up"}`.

### 6. Seed the production database (once)

From your machine, point the seed script at Neon. Copy `DATABASE_URL_UNPOOLED` from Vercel (Settings → Environment Variables) and run this in PowerShell:

```powershell
$env:DATABASE_URL="<paste DATABASE_URL_UNPOOLED here>"; $env:SEED_ADMIN_EMAIL="you@takeme.taxi"; $env:SEED_ADMIN_PASSWORD="<a strong password>"; npm run db:seed
```

For a demo with sample history, run `npm run db:seed:sample` instead. Then sign in, change your password, create reviewer accounts under **Users**, and import real workbooks under **Import & export**.

### 7. Optional

- **Custom domain:** Settings → Domains (for example `qa.takeme.taxi`, which needs the company’s DNS).
- **Preview protection:** Settings → Deployment Protection → Vercel Authentication, so preview URLs aren’t public.
- **Plan:** Vercel’s free Hobby plan is for personal, non-commercial use. For real company use, move the project to a Pro team owned by the company.

---

## Security and privacy

- **No public sign-up.** Admins create accounts. New users get a one-time password and must set their own at first sign-in (at least 10 characters, with a letter and a number).
- **Sessions:** random 256-bit tokens stored only as SHA-256 hashes; `__Host-` httpOnly, Secure, SameSite cookies; 12-hour lifetime and 60-minute idle timeout; revoked when an account is disabled, its role changes or the password is reset.
- **Sign-in protection:** five failed attempts per email (25 per IP) within 15 minutes blocks further tries; responses don’t reveal whether an email exists.
- **Authorisation on the server:** every page and server action checks the session and role in the data layer. The proxy is only a first gate. Reviewers can open only their own reviews and can change them for 24 hours; admins amend with a logged reason.
- **Input validation:** Zod on every action; parameterised SQL through Drizzle; CSV/Excel exports protected against formula injection.
- **Headers:** Content-Security-Policy, HSTS, `X-Frame-Options: DENY`, `nosniff`, a strict Referrer-Policy and Permissions-Policy, and `noindex`.
- **Audit log:** every change to reviews, accounts, agents, rules, exports and AI use is recorded and can’t be edited in the app.
- **Service worker:** caches only public static files and the offline page, never signed-in pages or data, so nothing sensitive is left on shared call-centre PCs.

### UK GDPR

- Caller numbers are **never stored in full**: only a mask (`077•• •••123`) and a keyed HMAC used to spot duplicate reviews.
- Reviewers are reminded to keep customer names, numbers and addresses out of notes.
- **Manual summaries are the default** and never leave the platform. In **AI** mode, customer numbers, addresses, postcodes and emails are removed before anything is sent to Gemini, and agents are referred to by first name only, so UK GDPR compliance is maintained. AI output is labelled, saved with its model and prompt version, and coaching notes need a manager’s approval before sharing.
- Host the database in the UK (Neon London) and use a **paid (billing-enabled) Gemini key** for production: Google’s terms allow it to use content sent through unpaid tiers to improve its products. Confirm your data-processing terms with Google and Neon as part of the company’s GDPR records.

---

## How scoring works

The engine (`src/lib/scoring/engine.ts`) reproduces the workbook’s formula exactly, and tests check it against the sheet:

- Yes = 1, Partial = 0.5, No = 0, N/A doesn’t count.
- Score = (points − critical deductions) ÷ applicable checks. A “No” on names, address, account authentication, special procedures or airport details costs an extra 2; a “Partial” on the last three costs an extra 1.
- Any zero-tolerance issue makes the call 0%. A call meets KPI when it scores **above** 90%.
- Unlike the sheet, a skipped answer blocks submission instead of silently counting as No, an all-N/A section is “not scored” instead of `#DIV/0!`, and scores stop at 0% instead of going negative.

Every threshold is editable under **Scorecard & rules**. Changes go into a new version, and past reviews keep the version they were marked under.

---

## Project layout

```
src/
  app/(site)        public pages: home, the standard, privacy
  app/(app)         signed-in app: /qa (reviewers), /admin, /evaluations, /playbook, /account
  app/actions       server actions (validated with Zod, role-checked)
  app/api           Excel/CSV export, health check
  components        UI, charts, shell, brand
  db                Drizzle schema and client
  lib               scoring engine, smart paste parser, dates (UK time), framework content
  server            auth, services (business logic), audit, crypto
scripts             seed, reset, AI check
tests               unit + integration tests
drizzle             SQL migrations
```
