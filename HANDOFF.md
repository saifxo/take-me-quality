# Take Me Quality (TMQ) — Handoff document

Everything needed to understand, run, change and deploy this project. Written so that a person, or another AI assistant, can pick it up with no other context.

- **Project:** Take Me Quality (TMQ), a call-quality platform for Take Me (UK taxi and private-hire group, takeme.taxi).
- **Replaces:** the weekly "Birmingham TMQ Scorecard" Google Sheet (exported as .xlsx) used to score recorded booking calls.
- **Code:** `C:\SIGMA\bukhari sahab work\takeme-quality`
- **Status:** feature-complete for a first release, working locally, all tests passing. Not yet deployed and not yet in git.
- **Built:** 14 to 16 September 2026.
- **Audience:** built by a QA reviewer at Take Me to show his lead what the team could use instead of the spreadsheet.
- **Related documents in this repo:** `README.md` (setup and deployment), `docs/plan/index.html` (the original plan, with an interactive copy of the scoring engine — open it in a browser).

---

## 1. TL;DR for whoever picks this up

```
Stack     Next.js 16 (App Router, Server Components, Server Actions) + React 19 + TypeScript
UI        Tailwind CSS 4, hand-built components, Recharts, lucide-react, Baloo 2 + Figtree
Data      PostgreSQL 17 + Drizzle ORM (Docker locally on port 5433, Neon in production)
Auth      Own session auth (bcrypt + database sessions + httpOnly cookie). No public sign-up.
AI        Google Gemini via @google/genai (optional). Manual summaries are the default.
Tests     Vitest: 64 tests (unit + integration against a real test database), all passing
Gates     npm run lint / typecheck / test / build all pass
Size      ~118 source files, 28 routes
```

Run it:

```bash
npm install
npm run db:up            # Postgres 17 in Docker (port 5433)
npm run db:migrate
npm run db:seed:sample   # framework + sites + admin + sample roster and 13 weeks of history
npm run dev              # http://localhost:3000
```

Sign in as `demo.admin@takeme.taxi` with the `SEED_ADMIN_PASSWORD` from `.env.local`.

---

## 2. Background: how QA worked before this

### 2.1 The weekly cycle

1. Every Monday a QA reviewer opens the call-recordings portal (a telephony web page; the user supplied a screenshot of it).
2. They filter by agent and by last week (Monday to Sunday), then play the calls.
3. For each call they add a row to the **Analysis** sheet of a Google Sheet and mark 21 criteria.
4. The **Overview** sheet rolls those rows up per campaign and agent using formulas.
5. The workbook is saved per week, for example `20260907 - Birmingham TMQ Scorecard.xlsx`, dated the Monday the review happens.

### 2.2 The recordings portal (not changed by this project)

| Portal column | Example | What the platform does with it |
|---|---|---|
| Context | `Queue` or `Exten` | Queue is a customer call; Exten is an internal agent-to-agent call, skipped by default |
| Destination | `901 / 8101 - Demo Ava Stone - DMN - D1` | queue / extension / agent name / site code / team code |
| Origination | `07700900123` | caller number, **masked** to `077•• •••123` before saving |
| Date Time | `2026-08-31 02:12:07` | call time (UK local), which decides the reporting week |
| Duration | `00:01:25` | handling time (AHT) |

Agents are named `Name - SITE - TEAM` in the portal. Site codes seen: SOL (Solihull), BIR (Birmingham), BIRPK (Birmingham PK team), NUN (Nuneaton), GBR (Great Barr). Team codes seen: DE and BE; their meaning was never confirmed, so they are stored as free text on the agent record.

### 2.3 The five sheets in the old workbook

| Sheet | Contents | Where it went |
|---|---|---|
| **Analysis** | One row per reviewed call: campaign, agent, phone, date and time, duration, call type, QA name, review date, 21 criteria, one "HiHi" (High Impact Handling Issue), the score formula, feedback, and four section summaries | The Review Studio and the `evaluations` tables |
| **Overview** | Per campaign (Nuneaton, Solihull, Birmingham, N/a): agent, QC score, total calls, below-KPI share, average AHT, four section averages, failed calls, failed reasons, and an `=AI()` coaching summary | Admin dashboard and agent profiles |
| **TMQ Framework** | The marking rubric: 21 criteria with Yes/Partial/No descriptions, marker notes, and approved and not-approved greeting names. An older 19-criterion version sits above it | The Playbook and the versioned scorecard in the database |
| **Print Version** | The same rubric laid out for paper | Print styles and the 1:1 report page |
| **High Impact Handling Issue Info** | The 11 zero-tolerance issues and what each means | The zero-tolerance panel and settings |

What the file actually contained: 40 evaluations, 4 agents (10 calls each), 3 campaigns, a duplicated reviewer label, two review dates, **every call scored 100%**, and Phone, Date and Duration blank on all 40 rows.

The workbook came from Google Sheets (it has `__xludf.DUMMYFUNCTION` wrappers and the Sheets-only `=AI()` function), so the team already had Gemini available.

### 2.4 The 14 problems found in the workbook

This list is the argument for the platform; each one is fixed here.

| # | Problem | Where | Fixed by |
|---|---|---|---|
| 1 | Scores cannot be traced to their calls (phone, date/time and duration empty on all 40 rows) | Analysis C–E | Smart paste captures queue, extension, call time and duration, plus a masked caller |
| 2 | A skipped answer silently counts as No, because `COUNTIF(I:AC,"<>N/A")` also counts blank cells | Analysis AE | Every criterion must be answered; N/A is an explicit choice |
| 3 | Names are free text, so one typo splits an agent's history | Analysis B, G | Managed agent roster and user accounts |
| 4 | A new workbook every week, fixed 30-row blocks per campaign, a new site means copying formulas | whole file | One database, any date range, unlimited sites |
| 5 | No access control and no audit trail | whole file | Roles, server-side checks, append-only audit log |
| 6 | The Avg AHT formula drifts down the column (E8 compares against A6, E9 against A7, and so on) | Overview E8:E132 | One tested query instead of copied formulas |
| 7 | Failed-reasons ranges drift (K7 starts at row 2, K71 at row 66) and ignore campaign | Overview K7:K132 | Linked records, not joined text |
| 8 | Only one zero-tolerance issue per call (single dropdown) | Analysis AD | Multi-select, each with its own note |
| 9 | Section scores divide by zero when a whole section is N/A | Analysis AJ:AM | An all-N/A section is "not scored" |
| 10 | AI summaries run on empty input ("Please provide the feedback…") and are never saved | Overview M | Summaries need data and are saved with model and prompt version |
| 11 | Two rubric versions live in one sheet and nothing records which was used | TMQ Framework | Versioned scorecards; each review keeps its version |
| 12 | Scores can go negative (all-No is −47.62%) and then match no colour rule | Analysis AE | Optional floor, default 0% |
| 13 | The campaign average is an average of averages | Overview E5 | Call-weighted averages |
| 14 | The "N/a" campaign block shows `#N/A` | Overview A101:M132 | Explicit handling of unassigned agents |

---

## 3. The TMQ framework and the scoring rules

Reverse-engineered from `Analysis!AE3` and `AJ3:AM3` and from the sheet's conditional formatting. The engine reproduces them exactly and the tests lock that behaviour.

### 3.1 Scoring

- **Yes = 1, Partial = 0.5, No = 0. N/A is excluded from the count.**
- `score = (points − critical deductions) ÷ applicable criteria`
- **Critical deductions**, on top of losing the point:

| Criterion | No | Partial |
|---|---|---|
| Confirming & Clarifying Names | −2 | — |
| Full Address Details for Bookings | −2 | — |
| Authentication for Commercial Customers | −2 | −1 (the rubric defines no Partial, so Partial is disabled in the UI) |
| Correct Booking Procedures Followed | −2 | −1 |
| Airport Bookings – Capturing Details | −2 | −1 |

- **Any zero-tolerance issue forces 0%**, whatever the answers.
- **Section scores** use the same points but ignore deductions. A section where everything is N/A is "not scored".
- **Bands:** exactly 100% is Perfect (gold); above 90% Meets KPI (green); above 0% up to and including 90% is Below KPI (amber); 0% is Fail (red). Note that 90.00% exactly is **below** KPI.
- **An agent needs attention** when more than 15% of their calls in the period are below KPI, or there is any zero-tolerance breach, or their average dropped more than 5 points against the previous period.
- Deliberate differences from the sheet: unanswered criteria block submission, all-N/A sections are null instead of `#DIV/0!`, and scores stop at 0% instead of going negative.

### 3.2 Worked examples (these are the parity tests)

| Call | Difference from a typical booking | Applicable | Maths | Score | Band |
|---|---|---|---|---|---|
| Typical booking | Authentication, Procedures, Airport are N/A | 18 | 18 ÷ 18 | 100% | Perfect |
| Asked to spell "Tesco" | Address Partial, Spelling No | 18 | 16.5 ÷ 18 | 91.67% | Meets KPI |
| Missed the full address | Address No (critical) | 18 | (17 − 2) ÷ 18 | 83.33% | Below KPI |
| Airport, terminal not confirmed | Procedures Yes, Airport Partial | 20 | (19.5 − 1) ÷ 20 | 92.50% | Meets KPI |
| Exactly 90% | Procedures and Airport Yes, Holds No, ETA No | 20 | 18 ÷ 20 | 90.00% | Below KPI |
| Account caller not authenticated | Authentication No (critical) | 19 | (18 − 2) ÷ 19 | 84.21% | Below KPI |
| GDPR breach | any answers plus a zero-tolerance issue | — | forced | 0% | Fail |
| Every answer No | all 21 No | 21 | (0 − 10) ÷ 21 | −47.62% in the sheet, floored to 0% here | Fail |

### 3.3 The 21 criteria, in four sections

**First Impressions & Greeting (3):** Correct Company Greeting; Agent Introduction (Name & Personal Touch); Clear Enunciation.

**Booking Process – Capturing Information Accurately (6):** Confirming & Clarifying Names\*; Full Address Details for Bookings\*; Authentication for Commercial Customers\* (account calls only); Avoiding Assumptions; Correct Booking Procedures Followed\* (airport and special calls only); Airport Bookings – Capturing Details\* (airport calls only).

**Customer Interaction & Call Handling (10):** Providing Correct & Consistent Information; Politeness & Enthusiasm; Maintaining Professionalism; Avoiding Unnecessary Holds / Mutes; Keeping the Conversation Natural; Engaging with Customers; Handling ETA Queries Tactfully; Call Control & Efficiency; Not Asking Customers to Spell Well-Known Locations; Active Listening, Acknowledging & Information Retention.

**Call Closure – Professional & Polite Ending (2):** Confident Call Closure; Professional Closing Statement.

\* marks a critical criterion. Every criterion carries the full guidance text and the Yes/Partial/No descriptions from the workbook, plus marker notes where the sheet had them (approved greeting names; postcode and spelling requests on public locations; "Paraphrase = Location + Street or Area"; "Thanks for calling Take Me, goodbye").

### 3.4 The 11 zero-tolerance issues ("HiHi", High Impact Handling Issue)

GDPR breach; Rudeness, Arrogance, Condescension; Booking Error Causing No-Show; Hanging Up on Customer; Business Avoidance; Speaking Non-English; Refusing Business Without Valid Reason; Slander or Criticising Company or Processes; Providing Competitor Contact Details; Auto-Answer / Not Present; Foul or Offensive Language.

### 3.5 Brand and greeting rules

- **Approved greeting names:** "Take Me" and "Great Barr". **Not approved:** "Tower", "Taxi First", "Take Me Taxi(s)", "Take Me Cab". Take Me grows by acquiring local firms, so old brand names on calls are a live risk.
- **Brand** (from the published brand guide at takeme.taxi/know-our-brand): Blue `#00A6EB`, Cyan `#45C6FF`, black and white; values Integrity, Innovation, Sustainability, Customer Focus; fonts LOEW (primary, licensed) and Baloo (secondary). Because LOEW is a paid font, the app uses **Baloo 2** for headings with **Figtree** for text and **IBM Plex Mono** for figures, all from Google Fonts. If the company provides the LOEW files, swap the display font in `src/app/layout.tsx` and `globals.css`.
---

## 4. What the product does, feature by feature

Two roles today: **Admin** and **QA reviewer** (the schema and guards are ready for more). Admins can do everything a reviewer can.

### 4.1 Permissions

| Capability | QA reviewer | Admin |
|---|---|---|
| Score calls | Yes | Yes |
| Change a submitted review | Own, for 24 hours (configurable) | Any, with a logged reason |
| See own reviews and weekly progress | Yes | Yes |
| Read the Playbook | Yes | Yes |
| Dashboards, agent profiles, exports | No | Yes |
| AI features | Tidy own notes only | All |
| Scorecard rules and thresholds | No | Yes |
| Accounts, agents, sites, audit log, import | No | Yes |

Enforcement is server-side in the data access layer (`src/server/auth/dal.ts`) plus a role check inside each service. `src/proxy.ts` only checks that a session cookie exists; it never decides access on its own.

### 4.2 Public pages

| Route | What it is |
|---|---|
| `/` | Home page in Take Me's style. Hero "Listen. Score. Coach. It's that simple!" (echoing the brand's "Tap. Ride. Arrive"), an animated call-and-scorecard illustration, how it works in four steps, the four pillars, the zero-tolerance band, "for reviewers"/"for managers" lists, brand values, sign-in call to action. Static, `noindex`. |
| `/standard` | The TMQ standard: all 21 checks with a one-line description each, the zero-tolerance list, and the approved greeting names. |
| `/privacy` | Privacy notice for agents and staff: what is held, why, who sees it, AI use, where it lives, a UK GDPR section, and rights. |
| `/login` | Split-screen sign-in, brand panel with animated waveform. No sign-up link; "ask your admin" for resets. |
| `/welcome` | First sign-in: set your own password (shown only while `mustChangePassword` is set). |
| `/offline` | Friendly offline page served by the service worker when a full reload has no network. |

### 4.3 Reviewer workspace

**`/qa` — Today.** Greeting by time of day; four stat tiles (reviews this week with a per-day bar strip, queue size, average score you gave over 28 days, agents at weekly target); the queue of calls waiting to be scored with Start/Continue and a remove button; "who still needs calls this week" with progress bars per agent against the weekly target; a keyboard-shortcuts card.

**`/qa/new` — Score a call.** Two tabs:

- **Paste from portal (smart paste).** Paste one or many rows; parsing happens instantly in the browser and is then re-done on the server for roster matching and duplicate checks. Handles tab-separated rows, rows collapsed onto one line, one cell per line, header rows, the `» Play «` link text, UK or ISO dates, `+44` numbers, withheld callers, and missing site/team codes. Each row shows agent (matched, "not on the roster", or "add as new agent"), site, masked caller, call time, duration and week, plus badges for internal calls, withheld numbers and calls already reviewed. Internal and duplicate rows are unticked by default. Then "Add to queue" or "Queue N & start scoring". Up to 50 rows at a time.
- **Enter manually.** Agent (grouped by site), call date and time (UK), duration, call type chips, optional queue, extension and caller number. Warns if the call looks like one already reviewed and refuses future call times.

**`/qa/review/[id]` — Review Studio.** The core screen:

- Sticky call header: agent, site, team, call time, duration, queue, masked caller, plus call-type chips. Changing the call type re-applies sensible N/A defaults (for example Airport becomes N/A unless it is an airport call) without overwriting anything you have already noted.
- The 21 checks grouped in four sections, each with Yes / Partial / No / N/A buttons, an "All Yes" shortcut per section and a live section score. Partial is disabled where the rubric has no Partial.
- An info button on each check opens the guidance and the Yes/Partial/No descriptions plus marker notes, so the rubric is never more than one click away.
- Choosing Partial or No opens a note box (required for No) and an optional "at 01:12" timestamp.
- Zero-tolerance panel: multi-select chips; each selected issue needs a description; the score drops to 0% immediately.
- Live score panel: big percentage, band pill, the maths (`18 applicable · 18 pts − 0 deducted`), four section meters, and every deduction spelled out.
- Feedback: what went well, to improve, overall comment, with an optional "Tidy with AI" that rewrites rough notes (with Undo).
- Keyboard: `1` `2` `3` `4` to answer, arrows or `j`/`k` to move, `Esc` to leave a note, `Ctrl+Enter` to submit, `?` for help. Answering Yes or N/A jumps to the next check; Partial or No focuses the note.
- Drafts autosave to the server about a second after you stop typing and are also kept in the browser, so nothing is lost if the connection drops. Submitting validates everything, scores it, and opens the next queued call.
- Amend mode: an admin (or the reviewer within 24 hours) can change a submitted review, but must give a reason, which is recorded.

**`/qa/reviews` — My reviews.** Searchable, paginated list of everything the reviewer submitted (search covers agent names and note text).

**`/evaluations/[id]`** — Read-only view of one review for reviewers and admins: score and band, the four section scores, call details, amendment history, zero-tolerance issues, feedback and every answer with its notes. Print button; admins can delete with a reason.

**`/playbook`** — The rubric as a searchable guide: how scoring works with worked examples, all 21 checks with guidance and Yes/Partial/No descriptions, the zero-tolerance list, approved greetings, and how to use smart paste. Printable.

**`/account`** — Change password (signs you out on other devices), install the app, and a note about idle sign-out.

### 4.4 Admin console

**`/admin` — Quality dashboard.** Filters (period presets, custom weeks, site, reviewer, call type) held in the URL so a view can be shared. Contains: five KPI tiles with change against the previous period (average QC score, calls reviewed, meeting KPI, zero-tolerance breaches, average handling time); weekly average by site as a line chart with the KPI line; the AI or manual weekly briefing; "where calls lose marks" (section scores with a tick marking the previous period); score distribution (a spike at 100% is a calibration question); reviewer calibration (each reviewer's average against the team); agents needing attention; the zero-tolerance log; the per-agent table grouped by site (the Overview sheet, done properly); and a check-by-check heatmap where each cell links to those calls.

**`/admin/agents`** — Roster with filters by site and status, stats for the last four weeks, "pending" agents added by reviewers waiting to be confirmed, and add/edit dialogs.

**`/admin/agents/[id]`** — Agent profile: five KPI tiles, weekly progress line chart, a radar of section scores against the site average, the coaching summary panel (Manual or AI, editable, approvable, with history), "what to work on" (most-missed checks with reviewer quotes), zero-tolerance history, and every reviewed call.

**`/admin/agents/[id]/report`** — A clean one-to-one report for printing or PDF: header, KPIs, section scores against the site, the approved coaching summary, checks to work on and recent feedback.

**`/admin/evaluations`** — Explorer over every submitted review: period, site, reviewer, call type, agent, band, zero-tolerance type, free-text search across notes, "calls that missed check X" (from the heatmap), sorting and paging, and Excel or CSV export of exactly what is on screen.

**`/admin/insights`** — Weekly briefing and recurring themes, each with the Manual/AI toggle, plus a panel explaining how AI is kept safe and UK GDPR compliant.

**`/admin/scorecard`** — Rules and thresholds. Read-only view of the active version, then "Edit rules" creates a draft where you can change the KPI pass mark, attention threshold, weekly target, answer points, score floor, reviewer edit window, every check (title, guidance, Yes/Partial/No text, marker note, penalties, whether Partial or N/A are allowed, which call types it applies to) and the zero-tolerance list. A **what-if preview** re-scores the last 1 to 12 weeks under the draft and shows what would change before publishing. Publishing creates a new version; old reviews keep the version they were marked under. Version history at the bottom.

**`/admin/users`** — Create reviewers and admins. New accounts get a one-time password shown once (with a copy button). Reset password, sign out everywhere, change role, switch an account off. Guards stop you removing your own admin access or leaving no active admin.

**`/admin/sites`** — Sites with their portal codes (the code must match the portal so smart paste can place agents), agent counts and four-week stats.

**`/admin/import`** — Upload an old TMQ Scorecard .xlsx. It reads the Analysis sheet, creates missing sites and agents, re-scores every row with the platform engine, and reports rows read, imported, already imported, skipped (with reasons) and **how many scores match the sheet**. Re-importing the same file changes nothing. Also has quick export links.

**`/admin/audit`** — Every change to reviews, accounts, agents, sites, rules, exports and AI use, newest first, with who and when.

### 4.5 Progressive web app and connectivity

- Installable: web manifest, generated icons (192, 512 and maskable), an "Install app" button in the sidebar and on the Account page, plus iOS instructions where the browser has no prompt.
- Service worker (production only) precaches the offline page and static assets; it never caches signed-in pages or data, so nothing sensitive is left on a shared PC.
- `experimental.useOffline` is on: navigations and server actions that fail because the network dropped are retried automatically when it returns. The UI shows an offline banner, offline-aware loading text, and the submit button says "Waiting for connection…".
- Loading states: route-level skeletons for the heavier pages, prefetching on links, and a small pending dot on the sidebar item you clicked. Fast pages have no spinner at all.

---

## 5. Data model

PostgreSQL, defined in `src/db/schema.ts`, migrations in `drizzle/`.

| Table | Purpose | Key columns |
|---|---|---|
| `users` | Accounts | name, email (unique), password_hash, role (`admin`/`qa`), status, must_change_password, last_login_at |
| `sessions` | Signed-in sessions | id = SHA-256 of the cookie token, user_id, expires_at, last_seen_at, ip, user_agent |
| `login_attempts` | Rate limiting | email, ip, success, created_at |
| `sites` | Towns and teams | name, code (unique, matches the portal), region, active |
| `agents` | The people whose calls are scored | full_name, site_id, team_code, extension, status (`active`/`pending`/`inactive`) |
| `scorecard_versions` | Versioned rules | version, name, status (`draft`/`active`/`retired`), settings (JSON), notes, published_at |
| `sections` | Sections of a version | key, name, short_name, position |
| `criteria` | Checks of a version | key, sheet_column, title, description, yes/partial/no text, marker_notes, allow_partial, allow_na, penalty_no, penalty_partial, applicable_call_types, position |
| `hihi_issues` | Zero-tolerance list of a version | key, short_name, title, description |
| `evaluations` | One reviewed call | version_id, agent_id, site_id, reviewer_id, status (`queued`/`draft`/`submitted`), source (`smart_paste`/`manual`/`import`), call_type, call_at, call_week, duration_sec, queue, extension, caller_masked, caller_hash, anonymous_caller, score, raw_score, band, applicable_count, points, penalty, section_scores (JSON), feedback, strengths, improvements, submitted_at, amended_at/by/reason, import_ref, deleted_at |
| `evaluation_answers` | One answer per check | evaluation_id + criterion_id (primary key), answer, note, at_time |
| `evaluation_issues` | Zero-tolerance issues on a call | evaluation_id + issue_id, note |
| `ai_summaries` | Saved summaries | kind (`agent_coaching`/`weekly_briefing`/`themes`/`polish`), agent_id, period, model, prompt_version, input_hash, output (JSON), created_by, approved_at/by |
| `audit_log` | Append-only trail | actor_id, action, entity, entity_id, before, after, ip, created_at |

Notes worth knowing:

- **`call_week`** is the Monday (UK) of the call, stored as a date. All reporting groups by this, not by the review date.
- **`caller_hash`** is an HMAC of the normalised number keyed with `AUTH_SECRET`, used only to spot duplicate reviews. The full number is never stored.
- **Scores are stored on the evaluation** (score, band, points, penalty, section scores), so changing the rules later never rewrites history.
- **Deletes are soft** (`deleted_at`); every query filters them out.

---

## 6. Architecture and where things live

```
src/
  app/(site)/            public pages: home, standard, privacy
  app/(app)/             signed-in app; layout.tsx builds the sidebar and enforces requireUser()
    qa/                  Today, Score a call, Review Studio, My reviews
    admin/               dashboard, agents, evaluations, insights, scorecard, users, sites, import, audit
    evaluations/[id]/    read-only view of a review
    playbook/, account/
  app/actions/           server actions: auth.ts, reviews.ts, admin.ts (Zod-validated, role-checked)
  app/api/               export/evaluations (Excel + CSV), health
  app/login, welcome, offline, manifest.ts, icon.tsx, apple-icon.tsx, pwa-icon/[variant]
  components/            ui/ (button, form, surface, client), admin/, charts/, shell/, brand/, evaluations/
  db/                    schema.ts (tables), index.ts (client)
  lib/                   scoring/engine.ts, smart-paste.ts, dates.ts, phone.ts, filters.ts,
                         explorer-filters.ts, framework/tmq.ts (the rubric content), utils.ts, brand-icon.tsx
  server/                auth/ (dal, session, password), services/ (auth, users, roster, evaluations,
                         scorecard, analytics, ai, import), audit.ts, crypto.ts, errors.ts
  proxy.ts               cheap cookie gate (Next 16 renamed middleware to proxy)
scripts/                 seed.ts, reset-db.ts, ai-check.ts, env.ts
tests/                   engine, smart-paste, dates-phone, integration, workbook (optional)
drizzle/                 SQL migrations
docs/plan/               the original plan document (open index.html in a browser)
```

**The important files**

| File | Why it matters |
|---|---|
| `src/lib/scoring/engine.ts` | Pure scoring engine. No framework code. Change scoring here, and the tests will tell you if it drifts from the sheet. |
| `src/lib/smart-paste.ts` | Parses portal rows. Never throws: unreadable rows come back as friendly errors. |
| `src/lib/framework/tmq.ts` | The rubric text used to seed version 1. After seeding, the database is the source of truth. |
| `src/server/services/*` | All business logic. Each function takes an `actor` and checks the role, so the same rules apply from pages, actions and scripts. |
| `src/server/auth/dal.ts` | `requireUser`, `requireAdmin`, `actorFor` — the security boundary. |
| `src/lib/dates.ts` | UK time and Monday-based weeks, including BST/GMT changes. Everything date-related should go through here. |

**Patterns used throughout**

- Pages are server components; they call services directly and pass plain data to client components.
- Mutations are server actions that return `{ ok: true, data }` or `{ ok: false, error }`; the UI shows the message. Errors that are safe to show are thrown as `AppError`.
- Validation is Zod at the action boundary; business rules live in the services.
- Client components are small and specific (`review-studio.tsx`, `new-call.tsx`, `ai-cards.tsx`, chart wrappers).
---

## 7. AI (Google Gemini)

### 7.1 Manual or AI, with Manual as the default

Every summary card has a **Manual / AI** toggle and starts on **Manual**:

- **Manual** builds the summary from the scores with fixed rules in `src/server/services/ai.ts` (`ruleCoaching` and the manual branches). Nothing leaves the platform. Saved with model `rules` and labelled "Manual summary, built from the scores".
- **AI** sends an anonymised summary of the data to Gemini. Only available when `GEMINI_API_KEY` is set; otherwise the AI option is disabled with an explanation.

If the mode is `ai` and no key is configured, the service throws a clear message rather than silently falling back.

### 7.2 Features

| Feature | Where | What it does |
|---|---|---|
| Weekly briefing | Dashboard, AI insights | Headline plus up to six bullets with figures, and a "watch next week" list |
| Agent coaching summary | Agent profile | Summary, strengths, one or two tips, and a focus criterion. Editable by hand; needs approval before sharing; full history kept |
| Recurring themes | AI insights | Groups reviewer notes on missed checks into themes with counts and a training idea |
| Tidy with AI | Review Studio | Turns a reviewer's rough notes into clear feedback, with Undo. AI only |

### 7.3 Guardrails

- The key lives only in server environment variables; browsers never see it. All calls are server-side.
- **Scrubbing before sending:** `scrub()` removes emails, phone numbers and UK postcodes, and text is capped. Agents are referred to by **first name only**. Reviewers are also told (in the Playbook and the note placeholders) to keep customer details out of notes.
- Output is checked against a schema (Zod). Answers slightly longer than requested are trimmed rather than rejected; a truncated answer gives a clear error.
- Every result is saved with kind, model, prompt version, an input fingerprint and who asked for it. **Identical input reuses the saved answer**, so repeat clicks cost nothing.
- Per-user daily cap (`AI_DAILY_LIMIT_PER_USER`, default 40). Manual summaries do not count.
- All AI text is labelled with its model, and coaching summaries must be approved by a manager before they are shared with an agent.
- Prompts live in `src/server/services/ai.ts`, versioned (`coaching-v1`, `briefing-v1`, `themes-v1`, `polish-v1`). The house style is UK English, no dashes, no invented facts. Bump the prompt version when you change a prompt so old cached answers are not reused.
- Model comes from `GEMINI_MODEL` (default `gemini-2.5-flash`). For 2.5 models the thinking budget is capped so answers come back in about five seconds.

### 7.4 Verified with the real key

`npm run ai:check` ran against the live key on 15 September 2026: briefing 5.4 s, coaching 4.6 s, themes 5.1 s. Models available on that key included `gemini-2.5-flash`, `gemini-2.5-pro`, `gemini-flash-latest` and newer `gemini-3.x` previews.

---

## 8. Security, privacy and UK GDPR

**Identity**
- No public sign-up. Admins create accounts; the new user gets a one-time password and must set their own at first sign-in (10+ characters, a letter and a number, not their email name, not a common pattern).
- Passwords are bcrypt (cost 11). Unknown emails are compared against a dummy hash so timing does not reveal which emails exist.
- Sessions: 256-bit random token, stored only as a SHA-256 hash; `__Host-` httpOnly, Secure, SameSite=Lax cookie in production; 12-hour lifetime and a 60-minute idle timeout (both configurable). Sessions are revoked when an account is disabled, its role changes, or its password is reset or changed.
- Sign-in rate limiting: 5 failures per email and 25 per IP in 15 minutes. One generic failure message.

**Authorisation**
- Every page and action re-checks session and role in the data access layer. `proxy.ts` is only a first gate; this matters because middleware checks alone have been bypassable in Next.js (CVE-2025-29927).
- Reviewers can only open their own reviews; the read-only view and studio both enforce it. Admin-only pages also have an admin layout as a backstop. Verified in the browser: a reviewer requesting `/admin` receives only a redirect, with no admin data in the response.

**Application**
- Zod validation on every action; parameterised SQL through Drizzle; React escaping for output.
- Exports are protected against CSV formula injection (leading `=`, `+`, `-`, `@` are quoted).
- Headers: Content-Security-Policy, HSTS, `X-Frame-Options: DENY`, `nosniff`, Referrer-Policy, Permissions-Policy, `X-Robots-Tag: noindex`, and `X-Powered-By` removed. Verified on the production build.
- Server actions have Next's built-in origin checks; the action body limit is 5 MB for workbook uploads.
- Append-only audit log; soft deletes only.

**UK GDPR**
- Caller numbers are **never stored in full**: a mask (`077•• •••123`) plus a keyed HMAC for duplicate detection.
- Manual summaries are the default and never leave the platform. In AI mode, customer numbers, addresses, postcodes and emails are removed before anything is sent and agents are identified by first name only, so UK GDPR compliance is maintained. This wording appears on the AI toggles, the AI insights page, the Review Studio, the Playbook, the privacy notice, the home page and the README.
- Host the database in the UK (Neon London) and use a **paid, billing-enabled** Gemini key in production: Google's terms allow content sent through unpaid tiers to be used to improve its products.
- Still the company's job: confirm data-processing terms with Google and Neon, decide a retention period for call identifiers and scores, and tell agents their quality data is held here (the privacy notice is a starting point).

---

## 9. What is in the database right now (seed data)

`npm run db:seed` (safe to re-run) installs:

- **Scorecard version 1** from `src/lib/framework/tmq.ts`: 4 sections, 21 criteria, 11 zero-tolerance issues, and the default settings (KPI above 90%, attention above 15%, weekly target 10 calls, Yes 1 / Partial 0.5 / No 0, score floor 0%, 24-hour reviewer edit window).
- **Three demo sites:** Demo North (DMN), Demo Central (DMC), and Demo South (DMS).
- **One admin** from `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` (named "Demo Hassan Admin" in the seed).

`npm run db:seed:sample` adds, only if there are no evaluations yet:

- **One QA reviewer account:** `demo.qa@takeme.taxi`, password `Demo-QA-2026!`, named "Demo Hassan QA".
- **Eight clearly labelled demo agents** across the three demo sites, plus one pending demo agent.
- **About 1,000 fictional evaluations over 13 weeks**, scored by the real engine, with synthetic notes, occasional zero-tolerance breaches, drafts, queued calls and feedback. Generated from a fixed random seed, so the same demo data appears every time.

The demo seed contains no agent, caller, reviewer or review data from the workbook. Only the recovered scorecard rules and checks are retained.

---

## 10. What was done, in order

1. **Audited the workbook.** Parsed the .xlsx directly (no Excel needed) and read every formula, dropdown and colour rule across all five sheets; recovered the exact scoring formula, the critical deductions, the band thresholds and the 14 problems listed above.
2. **Studied the brand.** Pulled colours, fonts and tone from takeme.taxi and its published brand guide, so the app looks like a Take Me product.
3. **Wrote the plan** (kept at `docs/plan/index.html`), including an interactive copy of the scoring engine so the rules could be checked before any code was written.
4. **Built the foundation:** Next.js 16 + TypeScript + Tailwind 4, Postgres in Docker, Drizzle schema and migrations.
5. **Built the core logic first and tested it:** scoring engine, smart-paste parser, UK date handling, phone masking.
6. **Built the server layer:** sessions and sign-in with rate limiting, the data access layer, and services for users, roster, evaluations, scorecard versioning, analytics, AI and workbook import, each with an audit trail.
7. **Built the interface:** brand design tokens, component library, public site, sign-in, reviewer workspace, Review Studio, admin console, charts, PWA and offline handling.
8. **Seeded realistic sample data** so the dashboards demonstrate something.
9. **Tested in the browser** as both roles: smart paste to submitted review, all 25 pages, exports, role checks, and the AI features with the real key.
10. **Added what the user asked for at the end:** Manual/AI toggle with Manual default, editable coaching summaries, and UK GDPR wording wherever AI or personal data is mentioned.

### 10.1 Bugs found and fixed during testing

| Found | Fix |
|---|---|
| Smart paste kept the previous paste's tickboxes, because choices were remembered by row position | Choices are keyed to a row signature (agent + time + type) |
| The dev service worker cached stale JavaScript, so edits appeared not to apply | The service worker now registers only in production and unregisters itself in development |
| Gemini answers slightly longer than the schema were rejected | Schemas trim instead of failing, and truncated answers give a clear message |
| Gemini read the 90% KPI line as the agent's own score | Input fields renamed (`kpiLinePercent`, `percentOfCallsAboveKpiLine`) and the prompt explains the difference |
| Themes took 32 seconds | Thinking budget capped for 2.5 models; now about 5 seconds |
| Period tabs highlighted "Last week" on pages that default to 4 or 12 weeks | Each page passes its own default to the filter bar |
| Agent name column wrapped and made dashboard rows tall | Minimum column width |
| Radar chart started at 0%, so agent and site looked identical | Radar starts near the data; trend axes tick on multiples of 5 |
| Hero illustration showed a white block on the grey background | Wave colour matched to the section |

### 10.2 Testing

`npm test` runs 64 tests in about 30 seconds (needs the Docker database):

- **`tests/engine.test.ts`** — framework shape (21 criteria, 3/6/10/2 split, the right critical criteria), all eight worked examples, the safeguards (missing answers, all-N/A sections, invalid Partial, section scores ignoring deductions) and band edges.
- **`tests/smart-paste.test.ts`** — tab-separated rows, spaces, rows on one line, one cell per line, header rows, paste order, withheld callers, `+44`, UK dates, BST and GMT conversion, junk input, the 50-row cap, and name matching.
- **`tests/dates-phone.test.ts`** — UK wall-clock to UTC across BST changes, Monday weeks, `datetime-local` round trips, duration parsing, phone normalising and masking.
- **`tests/integration.test.ts`** — against a real `tmq_test` database: sign-in, rate limiting, idle expiry, disabled accounts, first-password flow, admin lockout guard, role checks, smart paste to queue to submit, required notes, duplicate detection, edit windows, the audit trail, KPIs and the agent table, explorer filters, manual and AI summary modes, editing a coaching summary, scrubbing, versioned rules with what-if and publish, and workbook import (including idempotency and rejecting bad files).
- **`tests/workbook.test.ts`** — optional: imports the real `20260907 - Birmingham TMQ Scorecard.xlsx` and checks 40 rows in, none skipped, **every score matching the sheet**, 4 agents created and the right call weeks. Skipped automatically if the file is not present; point `TMQ_WORKBOOK` at it otherwise.

Also verified by hand in the browser: the full reviewer journey, all 25 pages returning 200 with no errors, Excel and CSV exports (no full phone numbers in the output), role checks over HTTP, the install manifest and icons, security headers, and the production build and server.

**Not covered by automated tests:** no end-to-end browser test suite (Playwright was deliberately skipped), and signing in through the form was only checked as far as its validation messages, because the assistant that built this is not permitted to type passwords into forms. **Please sign in once yourself to confirm the whole loop.**
---

## 11. Running it locally

Needs Node 20+ (24 used here) and Docker Desktop.

```bash
npm install
copy .env.example .env.local     # then edit it
npm run db:up
npm run db:migrate
npm run db:seed:sample
npm run dev
```

### 11.1 Environment variables

| Variable | Purpose | Local default |
|---|---|---|
| `DATABASE_URL` | Postgres connection (pooled in production) | `postgres://tmq:tmq_local_pw@localhost:5433/tmq` |
| `DATABASE_URL_UNPOOLED` | Direct connection used for migrations | empty locally |
| `TEST_DATABASE_URL` | Database for the test suite | `…/tmq_test` |
| `AUTH_SECRET` | Signs sessions and keys the caller hash. 32+ random characters | generate your own |
| `SESSION_MAX_AGE_HOURS` / `SESSION_IDLE_MINUTES` | Session lifetime and idle timeout | 12 / 60 |
| `GEMINI_API_KEY` | Enables AI mode; without it only Manual summaries | optional |
| `GEMINI_MODEL` | Model name | `gemini-2.5-flash` |
| `AI_DAILY_LIMIT_PER_USER` | AI requests per person per day | 40 |
| `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` | The first admin created by the seed | set your own |

Generate a secret: `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`.

### 11.2 Scripts

| Script | Does |
|---|---|
| `npm run dev` / `build` / `start` | Development, production build, serve the build |
| `npm test` | All tests (needs the Docker database) |
| `npm run typecheck` / `lint` | TypeScript and ESLint |
| `npm run db:up` | Start Postgres in Docker (creates `tmq` and `tmq_test`) |
| `npm run db:generate` / `db:migrate` | Create and apply migrations after changing `schema.ts` |
| `npm run db:seed` / `db:seed:sample` | Framework, sites, admin (and sample history) |
| `npm run db:reset` | Wipe the **local** database and reseed with sample data (refuses non-local URLs) |
| `npm run db:studio` | Browse the data in Drizzle Studio |
| `npm run ai:check` | Prove Gemini works end to end with the configured key |
| `npm run vercel-build` | What Vercel runs: migrations then build |

---

## 12. Deployment notes (Vercel + Neon, both free tiers)

### 12.1 Why this combination

Vercel runs Next.js natively and Neon is a serverless Postgres that connects to a Vercel project in two clicks and offers a **London (AWS eu-west-2)** region, which keeps UK data in the UK. Both have free plans big enough for this workload (a call centre producing a few thousand reviews a year is tiny for Postgres).

### 12.2 Steps

1. **Push to GitHub.** Create a private repository and push the `takeme-quality` folder. `.env.local` is git-ignored; `.env.example` is committed.
2. **Create the Vercel project.** vercel.com → Add New → Project → import the repo. If the repo contains the parent folder, set **Root Directory** to `takeme-quality`. Framework: Next.js (auto).
3. **Add the database.** In the project: Storage → Create Database → **Neon** → Free plan → **London (aws-eu-west-2)** → connect to Production, Preview and Development. Vercel injects `DATABASE_URL` (pooled) and `DATABASE_URL_UNPOOLED`. The app uses the pooled URL at runtime and the unpooled one for migrations.
4. **Add environment variables** (Settings → Environment Variables): `AUTH_SECRET` (a fresh one, not your local value), `GEMINI_API_KEY`, `GEMINI_MODEL`, `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`, and optionally `SESSION_IDLE_MINUTES` and `AI_DAILY_LIMIT_PER_USER`.
5. **Deploy.** `vercel.json` sets the build command to `npm run vercel-build` (migrations then build) and pins functions to **London (`lhr1`)**, next to the database. After it finishes, open `/api/health`; it should return `{"ok":true,"db":"up"}`.
6. **Seed the production database once**, from your machine, using the **unpooled** URL copied from Vercel:

```powershell
$env:DATABASE_URL="<DATABASE_URL_UNPOOLED>"; $env:SEED_ADMIN_EMAIL="you@takeme.taxi"; $env:SEED_ADMIN_PASSWORD="<strong password>"; npm run db:seed
```

Use `npm run db:seed:sample` instead if you want demo history for a presentation. `db:reset` refuses to run against anything that is not localhost.

7. **Sign in**, change the password, create reviewer accounts under **Users**, add your real sites and agents (or let smart paste create agents as reviewers work), and import old workbooks under **Import & export**.

### 12.3 Afterwards

- **Preview protection:** Settings → Deployment Protection → Vercel Authentication, so preview URLs with real data are not public.
- **Custom domain:** Settings → Domains, for example `qa.takeme.taxi` (needs the company's DNS).
- **Plan:** Vercel's free Hobby plan is for personal, non-commercial use. Real company use needs Pro, ideally on a company-owned team so the project does not sit in a personal account.
- **Backups:** Neon has point-in-time restore; the window depends on the plan. For anything important, take a periodic `pg_dump` as well.
- **Migrations later:** change `src/db/schema.ts`, run `npm run db:generate`, commit the SQL in `drizzle/`, and the next deploy applies it.

### 12.4 If something goes wrong

| Symptom | Likely cause |
|---|---|
| Build fails on `drizzle-kit migrate` | `DATABASE_URL_UNPOOLED` missing, or the Neon integration was not connected to that environment |
| `/api/health` returns `db: down` | Wrong `DATABASE_URL`, or Neon is still waking |
| Sign-in works but every page bounces to `/login` | `AUTH_SECRET` changed between deploys, or cookies blocked; sessions are invalidated by design when the secret changes |
| "No active scorecard yet" | The production database was never seeded; run `npm run db:seed` against it |
| AI options greyed out | `GEMINI_API_KEY` not set in that environment |
| AI errors about the model | Set `GEMINI_MODEL` to a model your key can use (`npm run ai:check` lists what works) |

---

## 13. Decisions taken, and what is still open

Defaults chosen so work could continue; all are easy to change, most from the Scorecard page.

| Question | Default used | Where to change |
|---|---|---|
| Which sites are in scope | Solihull, Birmingham, Birmingham PK, Nuneaton, Great Barr | Admin → Sites |
| What DE/BE and BIRPK mean | Stored as a free-text team code on the agent | Admin → Agents |
| Keep full caller numbers? | No: mask plus keyed hash only | `src/server/services/evaluations.ts` and `lib/phone.ts` |
| Report by call week or review week | Call week, Monday to Sunday, UK time | `lib/dates.ts` |
| Who gets accounts | Admins and QA reviewers only | Admin → Users |
| Reviewer edit window | 24 hours | Scorecard settings |
| Floor scores at 0%, and is 90.00% below KPI? | Yes, and yes | Scorecard settings |
| Gemini tier | AI off until a key is added; paid tier recommended | Environment variables |
| Weekly review target | 10 calls per agent | Scorecard settings |

Worth asking the business: how long to keep call identifiers and scores; whether team leaders should get their own logins; and whether agents should eventually see their own scores.

---

## 14. Not built yet (sensible next steps)

1. **Calibration sessions** — several reviewers score the same call to compare marking. The data model supports it; the UI does not exist.
2. **Disputes and acknowledgement** — an agent or team leader challenges a score; an admin resolves it.
3. **Coaching workflow** — a below-KPI call or breach creates a follow-up task with a due date.
4. **Notifications** — email a weekly digest and alert managers immediately on a zero-tolerance breach (Resend is referenced in the plan; nothing is wired up).
5. **Team leader and agent portals** — a third and fourth role, so agents see their own feedback.
6. **Call audio** — attach or link the recording to a review so disputes can be replayed (needs storage and a DPIA).
7. **AI pre-scoring** — transcribe a recording with Gemini and suggest answers with quotes, with the reviewer deciding every score. The biggest future win, and the biggest privacy step.
8. **Portal integration** — if the telephony system has an API, pull the call list directly instead of pasting.
9. **Two-factor authentication for admins** — the plan recommends it; not implemented.
10. **An end-to-end browser test suite** (Playwright) to complement the current tests.

---

## 15. Gotchas for whoever works on this next

- **This is Next.js 16.** `middleware.ts` is now `proxy.ts`; `params`, `searchParams`, `cookies()` and `headers()` are all async; `revalidateTag` takes a cache profile. The framework ships its own docs at `node_modules/next/dist/docs/` — read those rather than relying on memory. `AGENTS.md`/`CLAUDE.md` in the repo say the same.
- **Service workers and development do not mix.** The worker registers only in production and clears itself in development. If code changes seem not to apply in a browser, check for a registered worker first.
- **Windows PowerShell mangles curly apostrophes** (the app text is full of them). Editing files with PowerShell string replacement can fail to parse; use a file-editing tool or a here-document from Git Bash instead.
- **The parser is deliberately forgiving but never silent.** Rows it cannot read come back as errors shown to the reviewer, so a portal layout change degrades to manual entry instead of losing data.
- **Do not compute scores in the UI and trust them.** The client shows a live score for feedback, but the server always re-scores on submit from the stored rules.
- **Weeks are Mondays in UK time.** Never use `new Date()` arithmetic directly; use `lib/dates.ts`, which handles BST and GMT.
- **Rules are versioned.** Changing scorecard settings never rewrites past scores. If you need historic numbers to move, that is a migration, not a settings change.
- **Sample data is fictional.** Nothing in the seed is a real Take Me agent. The only real names in the system are ones imported from a real workbook, which is why sample and real data should not be mixed in a production database.
- **Testing sign-in:** the integration tests cover it fully; the browser test only covers validation, because the assistant cannot type passwords into forms. To browse as a role during development, insert a session row directly (see `scripts/` patterns) rather than automating the login form.

---

## 16. Glossary

| Term | Meaning |
|---|---|
| **TMQ** | Take Me Quality, the quality programme and this platform |
| **Agent** | A call-centre person whose calls are scored (not a user of the app, for now) |
| **QA reviewer** | The person who listens to calls and scores them; a user of the app |
| **Campaign / site** | The town or team a call belongs to (Solihull, Birmingham, and so on) |
| **HiHi** | High Impact Handling Issue: a zero-tolerance breach that forces 0% |
| **Band** | Perfect, Meets KPI, Below KPI or Fail |
| **AHT** | Average handling time, the mean duration of reviewed calls |
| **Coverage** | How many agents reached the weekly review target |
| **Call week** | The Monday (UK) of the week the call happened; the unit of all reporting |
| **Smart paste** | Pasting rows from the recordings portal to create reviews automatically |
| **Scorecard version** | A published set of rules; every review records the version it was marked under |
