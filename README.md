# Argumint — Real-Time Debate Arena

> A multiplayer debate platform where players join rooms, argue for or against a motion, and get scored by an AI judge. Supports two modes: **Alternate** (structured turn-by-turn) and **Buzzer** (first to grab the mic wins the floor).

---

## Features

- **Two debate modes** — Alternate (ordered turns) and Buzzer (grab-the-mic free-for-all)
- **AI judge** — GPT-4o-mini scores each argument on relevance, logic, and delivery
- **Live speech transcription** — Web Speech API (primary) with OpenAI Whisper fallback
- **XP & levelling system** — earn XP per debate, level up over time
- **Real-time lobby** — ready-up system, host controls, live participant status
- **Mobile responsive** — all screens optimised for phone-sized viewports
- **Voting** — optional topic-vote phase before the debate starts
- **Cross-device auth** — JWT sent as `Authorization: Bearer` header so the app works across different origins (e.g. Vercel frontend + Render backend) without relying on third-party cookies
- **Single active session** — Redis enforces one session per user; logging in from a second device prompts a confirmation before evicting the first

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + Vite + TypeScript |
| Styling | Custom CSS design system (CSS variables, glass morphism) |
| Routing | React Router v6 |
| Real-time (client) | Socket.IO client |
| HTTP client | Axios |
| Backend | Node.js + Express + TypeScript |
| Real-time (server) | Socket.IO |
| Database | MongoDB + Mongoose |
| Session cache | Redis (ioredis) |
| Auth | JWT + bcryptjs |
| Transcription | OpenAI Whisper (`gpt-4o-mini-transcribe`) |
| AI Judge | OpenAI (`gpt-4o-mini`) |
| Monorepo | npm workspaces |

---

## Monorepo Structure

```
Argumint/
├── apps/
│   ├── frontend/               # React + Vite app (deployed on Vercel)
│   │   ├── public/
│   │   │   └── logo/           # App logo assets
│   │   └── src/
│   │       ├── components/     # Shared UI components (NavLogo, VotingPanel…)
│   │       ├── contexts/       # AuthContext, RoomContext
│   │       ├── hooks/          # useSocket, useSpeechRecognition, useIsMobile…
│   │       ├── pages/          # One file per route
│   │       └── services/       # Axios API client
│   └── backend/                # Express + Socket.IO server (deployed on Render)
│       └── src/
│           ├── middleware/      # Auth, rate-limit, socket auth
│           ├── models/         # Mongoose schemas (User, Room, Debate)
│           ├── routes/         # REST endpoints (auth, rooms, debates, transcribe)
│           ├── services/       # Business logic (auth, room, debate, judge, whisper, audio)
│           └── socket/         # All Socket.IO event handlers
└── packages/
    └── shared/                 # @argumint/shared — types + Zod schemas used by both apps
```

---

## Getting Started

### Prerequisites

- Node.js ≥ 18
- A MongoDB Atlas cluster (free tier works)
- A Redis instance (Upstash free tier works)
- An OpenAI API key (for transcription + judging)

### 1. Clone & install

```bash
git clone https://github.com/your-username/argumint.git
cd argumint
npm install          # installs all workspaces
```

### 2. Configure environment variables

**Backend** — create `apps/backend/.env`:

```env
PORT=3000
NODE_ENV=development

# Generate with: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
JWT_SECRET=<long-random-string>

MONGODB_URI=mongodb+srv://<user>:<password>@<cluster>.mongodb.net/?appName=Argumint
REDIS_URL=redis://default:<password>@<host>:<port>

FRONTEND_URL=http://localhost:5173   # your Vercel URL in production

OPENAI_API_KEY=sk-...
OPENAI_TRANSCRIBE_MODEL=gpt-4o-mini-transcribe
OPENAI_JUDGE_MODEL=gpt-4o-mini
```

**Frontend** — create `apps/frontend/.env`:

```env
VITE_API_BASE_URL=http://localhost:3000   # your Render URL in production
```

### 3. Run in development

```bash
npm run dev    # starts frontend (port 5173) + backend (port 3000) concurrently
```

Or run each separately:

```bash
npm run dev --workspace=apps/backend
npm run dev --workspace=apps/frontend
```

### 4. Build for production

```bash
npm run build
```

---

## Deployment

| App | Platform | Notes |
|---|---|---|
| Frontend | **Vercel** | Set `VITE_API_BASE_URL` to your Render backend URL |
| Backend | **Render** | Set all backend env vars; set `FRONTEND_URL` to your Vercel domain for CORS |

> **Cross-origin auth note:** Modern browsers block third-party `httpOnly` cookies across different origins (e.g. `*.vercel.app` → `*.onrender.com`). The frontend stores the JWT in `localStorage` and attaches it as an `Authorization: Bearer` header on every request. The backend accepts the header first and falls back to the cookie for same-origin / legacy clients. No extra configuration is needed for this to work in production.

---

## How a Debate Works

```
Create Room → Lobby → [Optional Voting] → Prep Screen → Debate → Results
```

1. **Host** creates a room, sets the motion, mode (alternate/buzzer), round count, and turn duration
2. **Players** join via 6-character room code and ready up
3. Host starts the debate — players are randomly assigned **FOR** or **AGAINST**
4. **Alternate mode** — speakers take turns in order; each has a countdown timer; speech is recorded and transcribed
5. **Buzzer mode** — mic is free-for-all; first to press "Grab Mic" gets the floor; releasing or timing out opens a 5-second re-grab window
6. When all turns finish (or host ends), the AI judge scores every argument; the **Result page** shows the match leaderboard with XP awarded to each player

---

## Key Files

| File | What it does |
|---|---|
| `apps/backend/src/socket/index.ts` | All real-time game logic — room, lobby, debate, and buzzer events |
| `apps/backend/src/services/judge.service.ts` | GPT-4o-mini prompt + scoring pipeline |
| `apps/backend/src/services/whisper.service.ts` | OpenAI Whisper transcription wrapper |
| `apps/backend/src/services/auth.service.ts` | JWT issue/verify, Redis session management, single-session enforcement |
| `apps/backend/src/middleware/auth.middleware.ts` | Bearer header + cookie token extraction, session validation |
| `apps/backend/src/routes/debate.routes.ts` | REST endpoints including `/transcribe` |
| `apps/frontend/src/pages/DebatePage.tsx` | Main debate arena UI (both modes) |
| `apps/frontend/src/hooks/useSpeechRecognition.ts` | Web Speech API hook with auto-restart and interim-text rescue |
| `apps/frontend/src/services/api.ts` | Axios client — attaches Bearer token on every request, persists token on login |
| `apps/frontend/src/components/NavLogo.tsx` | Shared logo component used across all nav bars |
| `packages/shared/src/` | Shared TypeScript types and Zod schemas |

---

## Environment Variable Reference

### Backend (`apps/backend/.env`)

| Variable | Required | Description |
|---|---|---|
| `PORT` | No | Server port (default 3000) |
| `NODE_ENV` | No | `development` or `production` |
| `JWT_SECRET` | **Yes** | Secret for signing JWT tokens |
| `MONGODB_URI` | **Yes** | MongoDB Atlas connection string |
| `REDIS_URL` | No | Redis URL — sessions fall back to in-memory if absent |
| `FRONTEND_URL` | **Yes (prod)** | Allowed CORS origin |
| `OPENAI_API_KEY` | **Yes** | Required for transcription and AI judging |
| `OPENAI_TRANSCRIBE_MODEL` | No | Defaults to `gpt-4o-mini-transcribe` |
| `OPENAI_JUDGE_MODEL` | No | Defaults to `gpt-4o-mini` |

### Frontend (`apps/frontend/.env`)

| Variable | Required | Description |
|---|---|---|
| `VITE_API_BASE_URL` | **Yes** | Backend base URL — no trailing slash |

---

## Judge Credibility System

Every user in Argumint has **two independent scoring zones**:

| Zone | What it tracks | Where it appears |
|---|---|---|
| **Debater XP / Level** | Points earned from arguing in debates | Player card on the Home page |
| **Judge Credibility** | Reliability score as a human judge | Judge card on the Home page |

These zones are completely separate — being a great debater has no effect on your judge credibility, and vice versa.

### How Judge Credibility Works

When a Pro room has human judges, each judge submits scores for the debate participants. After the debate ends, the system computes a **session score** for each judge using six pillars, then updates the judge's rolling credibility score.

#### The 6 Pillars

| # | Pillar | Weight | Description |
|---|---|---|---|
| P1 | **Rank Agreement** | 30% | How well the judge's ranking of participants matches the AI's ranking (Spearman correlation) |
| P2 | **Gap Preservation** | 20% | Whether the relative score gaps between participants match the AI's gaps |
| P3 | **Consensus Similarity** | 15% | Agreement with the median score across all human judges in the same debate |
| P4 | **Outlier Coherence** | 10% | Consistency over time — judges who are perpetually outliers score lower here (requires ≥3 past sessions) |
| P5 | **Bias Detection** | 15% | Detects systematic favouritism toward certain participants across history (requires ≥5 past sessions) |
| P6 | **Integrity Score** | 10% | Penalises lazy scoring — all participants given identical scores gets 0 here |

Pillars P4 and P5 require historical data to compute. For new judges they are excluded from the weighted average, so early sessions are scored on P1–P3 + P6 only.

#### Rolling Update (EMA)

Credibility is updated using an **exponential moving average** with an adaptive decay window of 20 sessions:

```
λ = 2 / (min(N, 20) + 1)
new_credibility = λ × session_score + (1 − λ) × prev_credibility
```

New judges start at **0.75** (moderate band) so they get a fair chance before enough history accumulates.

#### Bias Cap (P5 Hard Cap)

If P5 detects strong systematic bias, it caps the entire credibility score — regardless of other pillar scores:

| Bias severity | Multiplier applied |
|---|---|
| Clean (CV < 0.30) | ×1.00 (no cap) |
| Moderate (CV 0.30–0.60) | ×0.75 |
| Severe (CV ≥ 0.60) | ×0.50 |

#### Credibility Bands

| Score range | Band | Meaning |
|---|---|---|
| ≥ 0.75 | **Strong** | Scores consistently in line with AI and peer judges |
| 0.45 – 0.74 | **Moderate** | Reasonable agreement, some divergence |
| < 0.45 | **Flagged** | Significant divergence or detected bias |

### Data Stored

Each judged debate creates a `JudgeSession` document containing the raw scores submitted, all six pillar scores (where computable), the composite session score, and the judge's credibility after that session was factored in.

### API

`GET /auth/judge-history` (auth required) — returns the authenticated user's `judgeStats` summary and full session history with pillar breakdowns.

### Key Files

| File | Purpose |
|---|---|
| `apps/backend/src/models/JudgeSession.model.ts` | One record per (judge × debate) — stores raw scores and pillar breakdown |
| `apps/backend/src/services/credibility.service.ts` | 6-pillar computation, rolling EMA update, bias cap |
| `apps/backend/src/models/User.model.ts` | `judgeStats` subdocument on User |
| `apps/frontend/src/pages/Home.tsx` | Judge credibility card displayed alongside the debater XP card |

---

## License

MIT
