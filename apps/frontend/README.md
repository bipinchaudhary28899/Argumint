# Argumint — Frontend

The React single-page app for Argumint. It renders the lobby, debate arena (Alternate + Buzzer), results, leaderboards, and the Pro/pricing flow, and it talks to the backend over REST (Axios) and Socket.IO, with live audio over WebRTC.

> For the full system overview — architecture, data flow, scoring, and deployment — see the [root README](../../README.md). This file documents the frontend package specifically.

## Stack

- **React 19** + **Vite 7** + **TypeScript**
- **React Router v7** for routing
- **Tailwind CSS v4** (via `@tailwindcss/vite`) plus a custom CSS design system in `src/index.css` (CSS variables, theming, glass morphism)
- **Socket.IO client** for real-time state; native **WebRTC** for peer-to-peer audio
- **Axios** for HTTP, with a shared client that attaches the JWT bearer token
- **Vitest** + **React Testing Library** for tests

## Quick Start

```bash
# from the repo root, install all workspaces
npm install

# create the env file
echo "VITE_API_BASE_URL=http://localhost:3000" > .env

# run just the frontend (Vite dev server on :5173)
npm run dev --workspace=apps/frontend
```

To run frontend + backend together, use `npm run dev` from the repo root.

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `VITE_API_BASE_URL` | Yes | Backend base URL, no trailing slash (e.g. `http://localhost:3000`, or your Render URL in prod) |

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Vite dev server with HMR |
| `npm run build` | Type-check (`tsc -b`) then `vite build` → `dist/` |
| `npm run preview` | Preview the production build locally |
| `npm run lint` | ESLint |
| `npm test` | Run Vitest once |
| `npm run test:watch` | Vitest in watch mode |

## Project Layout

```
src/
├── App.tsx              # Route table (login, lobby, prep, debate, result, analysis, pricing…)
├── main.tsx            # App entry; mounts providers
├── components/         # NavLogo, VotingPanel, ProtectedRoute, ConnectionStatusBanner,
│                       #   InAppBrowserGate, ProWelcomeModal
├── contexts/           # AuthContext (JWT/session), RoomContext (live room state), ThemeContext
├── hooks/              # useSocket, useWebRTCMesh, useSpeechRecognition, useRecorder,
│                       #   useReconnectHandler, useLeaveRoomOnNavigate, useIsMobile, useAuthForm
├── pages/              # One component per route
├── payments/           # paymentsApi + useSubscription (Razorpay/Pro)
├── services/           # api.ts — Axios client, bearer-token handling
├── index.css           # Design system (Tailwind + custom tokens)
└── test/setup.ts       # Vitest/Testing Library setup
```

## How It Works

**Auth.** `AuthContext` holds the session. On login the JWT is stored in `localStorage` and `services/api.ts` attaches it as an `Authorization: Bearer` header on every request — this is what lets the Vercel frontend talk to the Render backend across origins without third-party cookies. `ProtectedRoute` guards authenticated pages (and `guestOnly` routes like login/register).

**Real-time.** `useSocket` opens the authenticated Socket.IO connection; `RoomContext` subscribes to `room:*`, `debate:*`, and `buzzer:*` events to keep the lobby and arena in sync. The server is authoritative — the UI renders the state it's told. `useReconnectHandler` and the `*:get-state` handshake rebuild state after a reconnect.

**Audio.** `useWebRTCMesh` establishes direct peer connections between participants; only the SDP/ICE signalling rides over Socket.IO (`webrtc:*` events). `useSpeechRecognition` runs the browser Web Speech API for live transcription, with `useRecorder` capturing audio for the server-side Whisper fallback.

**Payments.** `payments/useSubscription` + `paymentsApi` drive the Pricing, Subscription Success, and Cancel pages and gate Pro-only features off the user's subscription status.

## Testing

Tests live in `__tests__/` folders next to the code they cover (contexts, hooks, pages, components, payments, services). Run them with `npm test --workspace=apps/frontend`.

## Build & Deploy

The app deploys to **Vercel**. The root `vercel.json` builds the shared package first (`packages/shared`), then runs `vite build`, outputs to `apps/frontend/dist`, and rewrites all routes to `index.html` for SPA routing. Set `VITE_API_BASE_URL` in the Vercel project settings.
