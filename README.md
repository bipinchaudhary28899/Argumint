# Argumint — Real-Time Debate Arena

> A multiplayer debate platform where players join rooms, argue for or against a motion, and get scored by an AI judge — with optional human judges whose reliability is itself scored. Supports two debate modes: **Alternate** (structured turn-by-turn) and **Buzzer** (grab-the-mic free-for-all). Live audio runs over WebRTC; everything else flows over Socket.IO.

This is the single source of truth for the project. It covers the feature set, the system architecture, how data flows through a debate end to end, the scoring/credibility systems, every environment variable, and how to run and deploy the app.

---

## Table of Contents

1. [Features](#features)
2. [Tech Stack](#tech-stack)
3. [Monorepo Structure](#monorepo-structure)
4. [Architecture](#architecture)
5. [Data Flow](#data-flow-life-of-a-debate)
6. [Real-Time Event Reference](#real-time-event-reference-socketio)
7. [REST API Reference](#rest-api-reference)
8. [Debate Scoring (AI Judge)](#debate-scoring-ai-judge)
9. [XP & Levelling](#xp--levelling)
10. [Judge Credibility System](#judge-credibility-system)
11. [Pro Subscriptions & Payments](#pro-subscriptions--payments)
12. [Getting Started](#getting-started)
13. [Environment Variables](#environment-variable-reference)
14. [Testing](#testing)
15. [Deployment](#deployment)
16. [Key Files](#key-files)

---

## Features

- **Two debate modes** — *Alternate* (ordered turns with a per-turn countdown) and *Buzzer* (free-for-all; first to grab the mic holds the floor, with a re-grab window when it's released).
- **Live audio over WebRTC** — participants hear each other through a peer-to-peer mesh; Socket.IO carries the signalling (offer / answer / ICE).
- **Speech transcription** — browser Web Speech API as the primary path, with an OpenAI Whisper (`gpt-4o-mini-transcribe`) server-side fallback.
- **AI judge** — GPT-4o-mini scores every argument on four axes (clarity, evidence, rebuttal, organization) and picks a winning side with feedback.
- **Human judges + credibility scoring** — Pro rooms can seat human judges; each judge's reliability is scored against the AI and against peers using a 6-pillar model and tracked as a rolling credibility score.
- **XP & levelling** — earn XP per debate and climb a 10-tier ladder from *Novice* to *Grand Master*.
- **Leaderboard & match history** — per-user debate and judge history, plus a global leaderboard.
- **Real-time lobby** — ready-up system, host controls, role changes (participant / judge / spectator / moderator), host transfer, and live participant status.
- **Optional topic voting** — a pre-debate phase where players vote on the motion.
- **Pro subscriptions** — Razorpay-backed recurring subscription unlocking Pro features (e.g. human-judge rooms), with webhook-driven status sync.
- **Cross-device auth** — JWT sent as an `Authorization: Bearer` header so the app works across origins (Vercel frontend + Render backend) without third-party cookies.
- **Single active session** — Redis enforces one session per user; logging in elsewhere prompts before evicting the first session.
- **Mobile responsive** — every screen is tuned for phone-sized viewports, with an in-app-browser gate for unsupported webviews.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend framework | React 19 + Vite 7 + TypeScript |
| Styling | Tailwind CSS v4 + a custom CSS design system (CSS variables, glass morphism, theming) |
| Routing | React Router v7 |
| Real-time (client) | Socket.IO client + native WebRTC for audio |
| HTTP client | Axios |
| Backend | Node.js 20 + Express 4 + TypeScript (ESM) |
| Real-time (server) | Socket.IO |
| Database | MongoDB + Mongoose |
| Session cache | Redis (ioredis) |
| Auth | JWT + bcrypt / bcryptjs |
| Transcription | OpenAI Whisper (`gpt-4o-mini-transcribe`) |
| AI Judge | OpenAI (`gpt-4o-mini`) |
| Payments | Razorpay (Stripe service scaffolded) |
| Validation | Zod (shared schemas) |
| Testing | Vitest (+ Testing Library on the frontend) |
| Monorepo | npm workspaces |
| Deploy | Vercel (frontend) · Render / Docker (backend) |

---

## Monorepo Structure

```
Argumint/
├── apps/
│   ├── frontend/                  # React + Vite app (deployed on Vercel)
│   │   ├── public/logo/           # App logo assets
│   │   └── src/
│   │       ├── components/        # Shared UI (NavLogo, VotingPanel, ProtectedRoute…)
│   │       ├── contexts/          # AuthContext, RoomContext, ThemeContext
│   │       ├── hooks/             # useSocket, useWebRTCMesh, useSpeechRecognition, useRecorder…
│   │       ├── pages/             # One component per route
│   │       ├── payments/          # paymentsApi + useSubscription
│   │       └── services/          # Axios API client
│   └── backend/                   # Express + Socket.IO server (Docker → Render)
│       └── src/
│           ├── app.ts             # Express app: CORS, body parsing, route attachment
│           ├── server.ts          # Boot: connect Mongo/Redis, attach routes, start Socket.IO
│           ├── db/                # mongo.ts, redis.ts connection helpers
│           ├── middleware/        # auth, rate-limit, socket auth
│           ├── models/            # Mongoose schemas (User, Room, Debate, JudgeSession)
│           ├── routes/            # REST: auth, room, debate, admin
│           ├── payments/          # Razorpay/Stripe services, routes, webhook handler
│           ├── services/          # Business logic (auth, room, debate, judge, credibility, whisper, audio)
│           ├── socket/            # All Socket.IO event handlers (index.ts)
│           └── utils/             # room helpers
└── packages/
    └── shared/                    # @argumint/shared — TypeScript types + Zod schemas used by both apps
```

---

## Architecture

Argumint is a three-package npm-workspace monorepo. The **shared** package is the contract layer: it exports the Zod schemas and TypeScript types (auth, room, debate, user, level table) consumed by both the frontend and backend, so request/response shapes and domain models stay in sync. It must be built before either app (`tsc -b`), which is why the Vercel build and the Docker build both compile `packages/shared` first.

```
┌──────────────────────────┐         ┌──────────────────────────────────────┐
│        Browser (SPA)      │         │            Backend (Node)             │
│  React 19 + Vite          │  HTTPS  │  Express 4                            │
│                           │ ──────► │   /auth /rooms /debates               │
│  AuthContext (JWT in      │  REST   │   /payments /admin /health            │
│   localStorage)           │ ◄────── │                                       │
│  RoomContext (live state) │         │  Socket.IO server                     │
│                           │ WSS     │   room:* debate:* buzzer:* webrtc:*   │
│  useSocket ───────────────┼────────►│                                       │
│  useWebRTCMesh ───────────┼─ P2P ──┐│   ┌── services ──────────────────┐   │
│   (audio, peer-to-peer)   │        ││   │ auth · room · debate · judge │   │
│  useSpeechRecognition     │        ││   │ credibility · whisper · audio│   │
└──────────────────────────┘        │└───┴──────────────┬───────────────┘   │
        ▲  audio mesh between peers ─┘                   │                    │
        │                                                ▼                    │
        │                              ┌──────────┐ ┌────────┐ ┌───────────┐  │
        │                              │ MongoDB  │ │ Redis  │ │  OpenAI   │  │
        │                              │ (Mongoose)│ │(session│ │ Whisper + │  │
        │                              │ User Room│ │+ buzzer│ │  Judge)   │  │
        │                              │ Debate   │ │ locks) │ └───────────┘  │
        │                              │ JudgeSess│ └────────┘ ┌───────────┐  │
        │                              └──────────┘            │ Razorpay  │  │
        └─────────── WebRTC media is direct browser↔browser ───┴───────────┴──┘
```

Key architectural points:

- **Two transport channels.** Plain request/response (login, room creation, history, payments) goes over REST/Axios. Everything live — lobby presence, turn timers, buzzer state, scoring windows — goes over Socket.IO. Audio media itself never touches the server: WebRTC establishes direct peer connections, and Socket.IO is used only to relay the SDP offers/answers and ICE candidates.
- **Lazy route attachment.** `server.ts` connects to Mongo and Redis first, then attaches each route group (`attachAuthRoutes`, `attachRoomRoutes`, etc.) with the live Redis client injected. This guarantees dependencies exist before any handler can run.
- **Redis is the live-state coordinator.** Beyond caching, Redis enforces single-session auth (one socket per user, evicting stale sessions) and backs short-lived buzzer locks/cooldowns so the "who holds the mic" decision is race-free.
- **Authoritative server.** Turn order, timers, buzzer ownership, and scoring are all decided server-side and broadcast to the room; clients render what they're told. A `debate:get-state` / `room:get-state` handshake lets a reconnecting or late-joining socket rebuild full state, since it would otherwise miss past room broadcasts.
- **Cost tracking.** Each `Debate` records Whisper minutes, judge token counts, and a computed USD cost, so per-debate spend is observable.

---

## Data Flow (Life of a Debate)

```
Create Room → Lobby → [Optional Voting] → Prep Screen → Debate → AI Judge → Results → XP/Credibility
```

1. **Create.** The host `POST /rooms/create` with the motion, mode (`alternate`/`buzzer`), round count, and turn duration. A 6-character room code is generated. Room status starts at `lobby`.
2. **Join & ready up.** Players `POST /rooms/join` with the code, then connect a socket and emit `room:join`. The lobby broadcasts presence via `room:participant-*` events; players toggle ready with `room:update-status`.
3. **(Optional) Voting.** The host can run a topic-vote phase (`room:start-voting` → `room:vote-topic` → `room:end-voting`) before locking in the motion.
4. **Start.** Host emits `room:start-debate`. The server randomly assigns each participant **FOR** or **AGAINST**, builds the turn order, persists a `Debate` document, and broadcasts `debate:started`. Players move to the prep screen, then the arena.
5. **Speak — Alternate mode.** The server emits `debate:turn-started` with the active speaker and an `endsAt` timestamp. The speaker talks (audio is shared peer-to-peer over WebRTC); speech is transcribed live in-browser and/or sent to `POST /debates/.../transcribe` (Whisper fallback). The argument is submitted via `debate:submit-argument`, the server emits `debate:turn-ended`, and advances to the next turn.
6. **Speak — Buzzer mode.** The mic is open. A player emits `buzzer:grab`; the server (using a Redis lock) assigns the floor and broadcasts `buzzer:holder-changed`. On `buzzer:release` or timeout, a re-grab window opens (`buzzer:window-open`) for a few seconds before the floor frees up again. Warnings (`buzzer:warning`, `buzzer:holder-urgent`) keep the UI in sync with the countdown.
7. **End & judge.** When all turns finish (or the host emits `debate:host-end`), the backend assembles the full transcript and calls the **AI judge** (`judge.service`). GPT-4o-mini returns per-speaker scores and a winning side. The server emits `debate:result-ready` (or `debate:result-failed`).
8. **Human judging (Pro).** If the room has human judges, a scoring window opens (`debate:scoring-window-opened`). Judges submit scores (`debate:submit-judge-scores`) and lock them (`debate:lock-judge-scores`). After lock, `credibility.service` computes each judge's session score across six pillars and updates their rolling credibility.
9. **Results.** The Result page shows the leaderboard, per-axis score breakdowns, the winning side, and XP awarded. User `stats` (wins/losses), `xp`, and `judgeStats` are persisted.

---

## Real-Time Event Reference (Socket.IO)

All room broadcasts are scoped to a `room:<roomId>` channel. Authentication is enforced by socket middleware on connect.

| Namespace | Client → Server | Server → Client (broadcast) |
|---|---|---|
| **Session** | — | `session:evicted` (logged in elsewhere) |
| **Room** | `room:join`, `room:leave`, `room:update-status`, `room:get-state`, `room:change-role`, `room:transfer-host` | `room:participant-left`, `room:participant-status-updated`, `room:role-changed`, `room:host-transferred`, `room:deleted` |
| **Voting** | `room:start-voting`, `room:vote-topic`, `room:end-voting` | `room:voting-started`, `room:voting-update`, `room:voting-ended` |
| **Debate** | `room:start-debate`, `debate:get-state`, `debate:submit-argument`, `debate:host-end`, `debate:submit-judge-scores`, `debate:lock-judge-scores` | `debate:started`, `debate:turn-started`, `debate:turn-ended`, `debate:ended`, `debate:argument-submitted`, `debate:result-ready`, `debate:result-failed`, `debate:scoring-window-opened`, `debate:judge-scores-updated`, `debate:judge-scores-locked` |
| **Buzzer** | `buzzer:grab`, `buzzer:release` | `buzzer:holder-changed`, `buzzer:open`, `buzzer:preparing`, `buzzer:window-open`, `buzzer:window-closed`, `buzzer:warning`, `buzzer:holder-urgent`, `buzzer:speaker-timeout` |
| **WebRTC (audio)** | `webrtc:offer`, `webrtc:answer`, `webrtc:ice-candidate`, `webrtc:get-peers` | `webrtc:offer`, `webrtc:answer`, `webrtc:ice-candidate` (relayed to a specific peer socket) |

---

## REST API Reference

Base URL = `VITE_API_BASE_URL`. All routes except register/login and the Razorpay webhook require a `Authorization: Bearer <jwt>` header.

| Method & Path | Auth | Purpose |
|---|---|---|
| `GET /health` | No | Liveness + Mongo/Redis status |
| `POST /auth/register` | No | Create account |
| `POST /auth/login` | No (rate-limited) | Log in, issue JWT |
| `POST /auth/logout` | Yes | Invalidate session |
| `GET /auth/me` | Yes | Current user profile |
| `GET /auth/history` | Yes | User's debate history |
| `GET /auth/judge-history` | Yes | `judgeStats` summary + per-session pillar breakdowns |
| `GET /auth/leaderboard` | Yes | Global leaderboard |
| `POST /rooms/create` | Yes | Create a room |
| `GET /rooms/stats` | Yes | Room stats |
| `GET /rooms/:code` | Yes | Fetch a room by code |
| `POST /rooms/join` | Yes | Join a room by code |
| `PUT /rooms/:code` (settings) | Yes | Update room settings |
| `GET /debates/...` | Yes | Fetch debate / analysis data |
| `POST /debates/.../transcribe` | Yes | Whisper transcription fallback |
| `POST /payments/create-subscription` | Yes | Start a Razorpay subscription |
| `POST /payments/verify-payment` | Yes | Verify a completed payment |
| `POST /payments/cancel-subscription` | Yes | Cancel subscription |
| `GET /payments/subscription-status` | Yes | Current subscription state |
| `POST /payments/webhook` | No (HMAC-verified) | Razorpay webhook → sync Pro status |
| `GET /admin/users`, `GET /admin/summary` | Dev guard | Admin/debug views |

---

## Debate Scoring (AI Judge)

After a debate ends, `judge.service` sends the full chronological transcript to OpenAI (`OPENAI_JUDGE_MODEL`, default `gpt-4o-mini`). Each speaker is scored on four axes, **0–25 each**, summing to a 0–100 total:

| Axis | Question the judge answers |
|---|---|
| **Clarity** | Was the argument easy to follow? |
| **Evidence** | Were claims backed with reasoning, examples, or facts? |
| **Rebuttal** | Did they engage with the opposing side's points? |
| **Organization** | Was the argument structured logically? |

The service re-computes `total` as the sum of the four parts (the model occasionally returns an inconsistent total) and clamps each axis to 0–25. The judge also returns a winning side, winning points, per-speaker feedback, strengths, and improvements. Token usage and USD cost are recorded on the `Debate` document.

---

## XP & Levelling

Debaters earn XP per debate and progress through a 10-tier ladder (`packages/shared/src/utils/levels.ts`):

| Level | Min XP | Title | | Level | Min XP | Title |
|---|---|---|---|---|---|---|
| 1 | 0 | Novice | | 6 | 1800 | Rhetorician |
| 2 | 150 | Debater | | 7 | 2600 | Sophist |
| 3 | 400 | Arguer | | 8 | 3600 | Dialectician |
| 4 | 750 | Advocate | | 9 | 5000 | Logician |
| 5 | 1200 | Orator | | 10 | 7000 | Grand Master |

`getLevelInfo(totalXP)` returns the current tier, the next tier, and progress toward it (used by the Home player card and the Level Rewards page).

---

## Judge Credibility System

Every user has **two independent scoring zones**: their **Debater XP / Level** (from arguing) and their **Judge Credibility** (reliability as a human judge). The two are completely separate.

When a Pro room seats human judges, each submits scores for the participants. After the debate, the system computes a **session score** per judge across six pillars, then folds it into a rolling credibility score.

### The 6 Pillars

| # | Pillar | Weight | Description |
|---|---|---|---|
| P1 | **Rank Agreement** | 30% | How well the judge's ranking matches the AI's (Spearman correlation) |
| P2 | **Gap Preservation** | 20% | Whether the relative score gaps match the AI's gaps |
| P3 | **Consensus Similarity** | 15% | Agreement with the median across all human judges in the debate |
| P4 | **Outlier Coherence** | 10% | Consistency over time; perpetual outliers score lower (needs ≥3 past sessions) |
| P5 | **Bias Detection** | 15% | Detects systematic favouritism across history (needs ≥5 past sessions) |
| P6 | **Integrity Score** | 10% | Penalises lazy scoring (identical scores for everyone → 0) |

P4 and P5 need history; for new judges they're excluded and early sessions are scored on P1–P3 + P6 only.

### Rolling Update (EMA)

```
λ = 2 / (min(N, 20) + 1)
new_credibility = λ × session_score + (1 − λ) × prev_credibility
```

New judges start at **0.75** (moderate band) for a fair chance before history accumulates.

### Bias Cap (P5 Hard Cap)

If P5 detects strong systematic bias it caps the whole score regardless of other pillars:

| Bias severity | Multiplier |
|---|---|
| Clean (CV < 0.30) | ×1.00 |
| Moderate (CV 0.30–0.60) | ×0.75 |
| Severe (CV ≥ 0.60) | ×0.50 |

### Credibility Bands

| Score | Band | Meaning |
|---|---|---|
| ≥ 0.75 | **Strong** | Consistently in line with AI and peers |
| 0.45 – 0.74 | **Moderate** | Reasonable agreement, some divergence |
| < 0.45 | **Flagged** | Significant divergence or detected bias |

Each judged debate writes a `JudgeSession` document (raw scores, all computable pillar scores, the composite session score, and resulting credibility). `GET /auth/judge-history` returns the full breakdown.

---

## Pro Subscriptions & Payments

Pro is a recurring subscription handled by **Razorpay** (`apps/backend/src/payments/`). The flow:

1. Frontend calls `POST /payments/create-subscription`; the user completes Razorpay checkout.
2. Frontend calls `POST /payments/verify-payment` to confirm the signed payment.
3. Razorpay also sends a server-to-server `POST /payments/webhook`, whose HMAC signature is verified against the **raw request body** (Express stores the raw buffer in `req.rawBody` specifically for this). The webhook keeps `isPro`, `subscriptionStatus`, and `currentPeriodEnd` on the `User` in sync regardless of client behaviour.
4. `GET /payments/subscription-status` and the `useSubscription` hook drive the Pricing / Subscription Success / Cancel pages and gate Pro-only features.

A `stripe.service.ts` exists as a scaffold; Razorpay is the active provider in deployment.

---

## Getting Started

### Prerequisites

- Node.js ≥ 20
- A MongoDB cluster (Atlas free tier works)
- A Redis instance (Upstash free tier works) — optional in dev; sessions fall back to in-memory if absent
- An OpenAI API key (transcription + judging)
- A Razorpay account (only if you're exercising Pro/payments)

### 1. Clone & install

```bash
git clone https://github.com/your-username/argumint.git
cd argumint
npm install            # installs all workspaces
```

### 2. Configure environment variables

**Backend** — create `apps/backend/.env` (see [reference](#backend-appsbackendenv)):

```env
PORT=3000
NODE_ENV=development
JWT_SECRET=<long-random-string>      # node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
MONGODB_URI=mongodb+srv://<user>:<password>@<cluster>.mongodb.net/?appName=Argumint
REDIS_URL=redis://default:<password>@<host>:<port>
FRONTEND_URL=http://localhost:5173
OPENAI_API_KEY=sk-...
OPENAI_TRANSCRIBE_MODEL=gpt-4o-mini-transcribe
OPENAI_JUDGE_MODEL=gpt-4o-mini
# Razorpay (only if testing payments)
RAZORPAY_KEY_ID=...
RAZORPAY_KEY_SECRET=...
RAZORPAY_WEBHOOK_SECRET=...
RAZORPAY_PLAN_ID=...
```

**Frontend** — create `apps/frontend/.env`:

```env
VITE_API_BASE_URL=http://localhost:3000   # no trailing slash; your Render URL in production
```

### 3. Run in development

```bash
npm run dev    # frontend (5173) + backend (3000) concurrently
```

Or run each workspace separately:

```bash
npm run dev --workspace=apps/backend
npm run dev --workspace=apps/frontend
```

> The **shared** package compiles automatically as part of each app's build, but if you change types and the apps don't pick them up, rebuild it: `npm run build --workspace=packages/shared`.

### 4. Build for production

```bash
npm run build    # builds shared → backend → frontend across all workspaces
```

---

## Environment Variable Reference

### Backend (`apps/backend/.env`)

| Variable | Required | Description |
|---|---|---|
| `PORT` | No | Server port (default 3000) |
| `NODE_ENV` | No | `development` or `production` |
| `JWT_SECRET` | **Yes** | Secret for signing JWTs |
| `MONGODB_URI` | **Yes** | MongoDB connection string |
| `REDIS_URL` | No | Redis URL — sessions fall back to in-memory if absent |
| `FRONTEND_URL` | **Yes (prod)** | Allowed CORS origin |
| `OPENAI_API_KEY` | **Yes** | Transcription + AI judging |
| `OPENAI_TRANSCRIBE_MODEL` | No | Default `gpt-4o-mini-transcribe` |
| `OPENAI_JUDGE_MODEL` | No | Default `gpt-4o-mini` |
| `RAZORPAY_KEY_ID` | For payments | Razorpay public key |
| `RAZORPAY_KEY_SECRET` | For payments | Razorpay secret key |
| `RAZORPAY_WEBHOOK_SECRET` | For payments | HMAC secret used to verify webhooks |
| `RAZORPAY_PLAN_ID` | For payments | Subscription plan ID (`RAZORPAY_PLAN_ID_DEV` used when `NODE_ENV` is not production) |
| `DEV_SECRET` | No | Guard token for the `/admin` debug routes |

### Frontend (`apps/frontend/.env`)

| Variable | Required | Description |
|---|---|---|
| `VITE_API_BASE_URL` | **Yes** | Backend base URL — no trailing slash |

---

## Testing

Both apps use **Vitest**; the frontend adds React Testing Library.

```bash
npm test --workspace=apps/backend     # backend unit tests (e.g. credibility.service)
npm test --workspace=apps/frontend    # frontend component/hook/page tests
npm run test:watch --workspace=apps/frontend
```

Frontend tests live next to source under `__tests__/` directories and cover contexts, hooks, pages, payments, and the API client.

---

## Deployment

| App | Platform | Notes |
|---|---|---|
| Frontend | **Vercel** | `vercel.json` builds shared then the Vite app; set `VITE_API_BASE_URL` to the Render URL. SPA rewrite sends all paths to `index.html`. |
| Backend | **Render (Docker)** | `render.yaml` defines the service; `apps/backend/Dockerfile` builds shared → backend. Set all backend env vars and point `FRONTEND_URL` at the Vercel domain for CORS. |

> **Cross-origin auth note.** Browsers block third-party `httpOnly` cookies across origins (`*.vercel.app` → `*.onrender.com`). The frontend stores the JWT in `localStorage` and attaches it as an `Authorization: Bearer` header on every request; the backend reads the header first and falls back to the cookie for same-origin/legacy clients. CORS also allows any `argumint*.vercel.app` preview deployment. `app.set("trust proxy", 1)` lets rate-limiting see the real client IP behind Render's proxy.

---

## Key Files

| File | What it does |
|---|---|
| `apps/backend/src/server.ts` | Boot sequence — connect Mongo/Redis, attach routes, start Socket.IO |
| `apps/backend/src/app.ts` | Express app, CORS allow-list, raw-body capture for webhooks |
| `apps/backend/src/socket/index.ts` | All real-time logic — room, lobby, debate, buzzer, WebRTC signalling |
| `apps/backend/src/services/judge.service.ts` | GPT-4o-mini prompt + scoring pipeline + cost tracking |
| `apps/backend/src/services/credibility.service.ts` | 6-pillar computation, rolling EMA, bias cap |
| `apps/backend/src/services/whisper.service.ts` | OpenAI Whisper transcription wrapper |
| `apps/backend/src/services/auth.service.ts` | JWT issue/verify, Redis single-session enforcement |
| `apps/backend/src/payments/webhook.handler.ts` | Razorpay webhook HMAC verification + Pro sync |
| `apps/backend/src/models/` | Mongoose schemas: User, Room, Debate, JudgeSession |
| `apps/frontend/src/App.tsx` | Route table (login, lobby, prep, debate, result, analysis, pricing…) |
| `apps/frontend/src/hooks/useWebRTCMesh.ts` | Peer-to-peer audio mesh |
| `apps/frontend/src/hooks/useSpeechRecognition.ts` | Web Speech API hook with auto-restart |
| `apps/frontend/src/services/api.ts` | Axios client — attaches Bearer token, persists it on login |
| `packages/shared/src/` | Shared types, Zod schemas, level table |

---

## License

MIT
