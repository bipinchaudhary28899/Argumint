# Argumint — Debate Platform

> A real-time structured debate platform built with React, Node.js, MongoDB, and Redis.  
> Users can create or join debate rooms, argue for or against a topic, and get scored by other participants.

---

## Table of Contents

- [Tech Stack](#tech-stack)
- [Monorepo Structure](#monorepo-structure)
- [Delivery Order](#delivery-order)
- [Layer 0 — Foundation](#layer-0--foundation)
- [Layer 1 — Authentication](#layer-1--authentication)
- [Layer 2 — Room Management](#layer-2--room-management)
- [Layer 3 — Real-time Lobby](#layer-3--real-time-lobby)
- [Layer 4 — Live Debate](#layer-4--live-debate)
- [Layer 5 — Voting & Leaderboard](#layer-5--voting--leaderboard)
- [Shared Package Reference](#shared-package-reference)
- [Environment Variables](#environment-variables)

---

## Tech Stack

| Layer | Technology | Purpose |
|---|---|---|
| Frontend | React 18 + Vite + TypeScript | UI framework |
| Styling | Tailwind CSS | Utility-first styling |
| Routing | React Router v6 | Client-side navigation |
| Global State | Context API | Auth state (logged-in user) |
| Real-time State | Zustand | Socket-driven state (lobby, debate) |
| Forms | React Hook Form + Zod | Form handling and validation |
| HTTP Client | Axios | REST API calls |
| Backend | Node.js + Express + TypeScript | API server |
| Real-time | Socket.IO | Bidirectional event communication |
| Database | MongoDB + Mongoose | Persistent storage |
| Cache / RT | Redis (ioredis) | Sessions, presence, real-time state |
| Validation | Zod | Shared schema validation (frontend + backend) |
| Auth | JWT + bcryptjs | Authentication and password hashing |
| Monorepo | npm workspaces | Shared types package |

---

## Monorepo Structure

```
argumint/
├── packages/
│   └── shared/                        # @argumint/shared — single source of truth
│       └── src/
│           ├── schemas/
│           │   ├── user.schema.ts     # UserSchema, RegisterRequest, LoginRequest
│           │   ├── room.schema.ts     # RoomSchema, CreateRoomRequest, JoinRoomRequest
│           │   └── debate.schema.ts   # DebateSchema, RoundSchema, VoteSchema
│           ├── types/
│           │   └── socket.types.ts    # ServerToClientEvents, ClientToServerEvents
│           └── index.ts
│
├── apps/
│   ├── frontend/
│   │   └── src/
│   │       ├── context/               # AuthContext (global user state)
│   │       ├── stores/                # Zustand stores (real-time state)
│   │       ├── hooks/                 # Custom hooks (useAuth, useSocket, useRoom)
│   │       ├── services/              # API call functions (auth, room, debate)
│   │       └── pages/                 # One file per screen/route
│   │
│   └── backend/
│       └── src/
│           ├── routes/                # Express route definitions
│           ├── controllers/           # Request handlers
│           ├── services/              # Business logic
│           ├── models/                # Mongoose models
│           ├── middleware/            # Auth, validation, error handling
│           └── socket.ts             # Socket.IO server and event handlers
│
└── package.json                       # Workspace root
```

**The rule:** Any type or schema that crosses the network boundary (API request body, API response, socket event payload) lives in `@argumint/shared`. Change it once — TypeScript surfaces errors in both apps immediately.

---

## Delivery Order

Features are built in strict layers. Each layer is fully working before the next begins.

```
Layer 0 → Monorepo skeleton, DB connections, shared package compiling
Layer 1 → Auth (register, login, JWT, protected routes)
Layer 2 → Room management via REST (create, join, list, settings)
Layer 3 → Real-time lobby via Socket.IO (presence, live participant list)
Layer 4 → Live debate (turns, timer, arguments, server-side state)
Layer 5 → Voting and leaderboard (scoring, rankings, debate history)
```

---

## Layer 0 — Foundation

**Goal:** Both apps running, databases connected, shared package importable. No features yet.

### What Gets Built

- npm workspaces configured at root
- `@argumint/shared` package with empty schema stubs, compiling cleanly
- React + Vite frontend running on `http://localhost:5173` with a blank page
- Express backend running on `http://localhost:3000` with a health check endpoint
- MongoDB connected and verified
- Redis connected and verified
- `tsconfig` paths configured so both apps can import `@argumint/shared`

### APIs

| Method | Endpoint | Description |
|---|---|---|
| GET | `/health` | Returns `{ status: "ok", mongo: true, redis: true }` |

### Data Flow

```
npm run dev (root)
  → starts frontend (Vite) + backend (ts-node) concurrently
  → backend connects to MongoDB → logs "MongoDB connected"
  → backend connects to Redis   → logs "Redis connected"
  → GET /health confirms both are up
```

### Files Created

```
package.json                          (workspace root)
packages/shared/package.json
packages/shared/src/index.ts          (empty exports)
apps/frontend/package.json
apps/frontend/src/main.tsx
apps/frontend/src/App.tsx             (blank shell with router)
apps/backend/package.json
apps/backend/src/app.ts               (Express setup)
apps/backend/src/db/mongo.ts          (MongoDB connection)
apps/backend/src/db/redis.ts          (Redis connection)
```

---

## Layer 1 — Authentication

**Goal:** Users can register, log in, and log out. JWT issued on login. Protected routes redirect unauthenticated users to login.

### Feature Description

- **Register:** User creates an account with username, email, and password. Password is hashed with bcrypt before storing.
- **Login:** User provides email + password. Server validates, issues a JWT, stores session reference in Redis with a TTL.
- **Logout:** JWT is blacklisted in Redis so it cannot be reused even before it expires.
- **Protected Routes:** Frontend checks for a valid token before rendering any authenticated page. Invalid or missing token redirects to `/login`.
- **Auth Context:** After login, the user object is stored in React Context so any component can call `useAuth()` and get the current user without an API call.

### Schemas (`@argumint/shared`)

```typescript
// user.schema.ts

UserSchema {
  _id: string
  username: string        // min 3, max 30 chars
  email: string           // valid email format
  passwordHash: string    // never sent to frontend
  stats: {
    debatesWon: number
    debatesLost: number
    totalDebates: number
  }
  createdAt: Date
}

PublicUserSchema = UserSchema without passwordHash   // safe to send to frontend

RegisterRequestSchema {
  username: string        // min 3, max 30
  email: string           // valid email
  password: string        // min 8 chars
}

LoginRequestSchema {
  email: string
  password: string
}

AuthResponseSchema {
  user: PublicUser
  token: string
}
```

### APIs

| Method | Endpoint | Auth | Body | Response |
|---|---|---|---|---|
| POST | `/api/auth/register` | None | `RegisterRequest` | `AuthResponse` |
| POST | `/api/auth/login` | None | `LoginRequest` | `AuthResponse` |
| POST | `/api/auth/logout` | JWT | — | `{ message: "logged out" }` |
| GET | `/api/auth/me` | JWT | — | `PublicUser` |
| PUT | `/api/auth/profile` | JWT | `{ username? }` | `PublicUser` |
| PUT | `/api/auth/change-password` | JWT | `{ currentPassword, newPassword }` | `{ message: "updated" }` |

### Data Flow

**Register:**
```
RegisterPage (React Hook Form + RegisterRequestSchema)
  → validate with Zod on frontend
  → POST /api/auth/register
    → Zod validates req.body (same schema)
    → bcrypt.hash(password, 10)
    → User.create({ username, email, passwordHash })
    → jwt.sign({ userId }, JWT_SECRET)
    → return { user: PublicUser, token }
  → AuthContext.setUser(user)
  → store token in localStorage
  → navigate('/home')
```

**Login:**
```
LoginPage (React Hook Form + LoginRequestSchema)
  → POST /api/auth/login
    → User.findOne({ email })
    → bcrypt.compare(password, user.passwordHash)
    → jwt.sign({ userId }, JWT_SECRET, { expiresIn: '7d' })
    → Redis: SET session:{userId} {token} EX 604800
    → return { user: PublicUser, token }
  → AuthContext.setUser(user)
  → navigate('/home')
```

**Protected route check:**
```
User navigates to /home
  → ProtectedRoute component reads token from localStorage
  → GET /api/auth/me (sends token in Authorization header)
    → JWT middleware verifies token
    → Redis checks token is not blacklisted
    → return PublicUser
  → AuthContext.setUser(user)
  → render HomePage
  (if token missing or invalid → navigate('/login'))
```

**Logout:**
```
User clicks logout
  → POST /api/auth/logout
    → Redis: SET blacklist:{token} 1 EX (remaining TTL)
  → AuthContext.setUser(null)
  → localStorage.removeItem('token')
  → navigate('/login')
```

### Files Created

```
packages/shared/src/schemas/user.schema.ts

apps/frontend/src/context/AuthContext.tsx
apps/frontend/src/hooks/useAuth.ts
apps/frontend/src/services/auth.service.ts
apps/frontend/src/services/api.ts              (axios instance with JWT header)
apps/frontend/src/components/ProtectedRoute.tsx
apps/frontend/src/pages/LoginPage.tsx
apps/frontend/src/pages/RegisterPage.tsx

apps/backend/src/middleware/auth.middleware.ts
apps/backend/src/middleware/validate.middleware.ts
apps/backend/src/controllers/auth.controller.ts
apps/backend/src/services/auth.service.ts
apps/backend/src/models/User.model.ts
apps/backend/src/routes/auth.routes.ts
```

---

## Layer 2 — Room Management

**Goal:** Authenticated users can create rooms with a mode and settings, share a 6-character room code, and other users can join using that code. Rooms are managed via REST only — no sockets yet.

### Feature Description

- **Create Room:** User selects a debate mode (Solo or Team), fills in topic, privacy setting, optional password, and max participants. A unique 6-character code is generated and returned.
- **Join Room:** User enters the room code. If the room is private, they also enter the password. On success, they are added to the participants array.
- **Mode — Solo:** Each participant argues individually for or against the topic.
- **Mode — Team:** Participants are split into two teams (For / Against).
- **Room Privacy:** Public rooms appear in the browse list. Private rooms require a code + password.
- **Room Lifecycle:** Rooms have a status: `waiting` → `active` → `ended`. Only the creator can start or end the debate.
- **Leave Room:** Any participant can leave. If the creator leaves, the room is deleted.

### Schemas (`@argumint/shared`)

```typescript
// room.schema.ts

RoomSchema {
  _id: string
  code: string              // 6-char alphanumeric, auto-generated
  name: string              // room display name
  topic: string             // debate topic/motion
  mode: 'solo' | 'team'
  privacy: 'public' | 'private'
  status: 'waiting' | 'active' | 'ended'
  createdBy: string         // userId
  participants: Array<{
    userId: string
    username: string
    side: 'for' | 'against' | 'neutral'
    isReady: boolean
    joinedAt: Date
  }>
  maxParticipants: number   // default 10
  password?: string         // hashed, only stored if private, never sent to frontend
  createdAt: Date
}

PublicRoomSchema = RoomSchema without password field

CreateRoomRequestSchema {
  name: string              // min 3, max 60
  topic: string             // min 10, max 200
  mode: 'solo' | 'team'
  privacy: 'public' | 'private'
  password?: string         // required if privacy is 'private'
  maxParticipants: number   // min 2, max 20
}

JoinRoomRequestSchema {
  code: string              // exactly 6 chars
  password?: string
}
```

### APIs

| Method | Endpoint | Auth | Body | Response |
|---|---|---|---|---|
| POST | `/api/rooms` | JWT | `CreateRoomRequest` | `PublicRoom` |
| POST | `/api/rooms/join` | JWT | `JoinRoomRequest` | `PublicRoom` |
| GET | `/api/rooms` | JWT | — | `PublicRoom[]` (public rooms only) |
| GET | `/api/rooms/my-rooms` | JWT | — | `PublicRoom[]` |
| GET | `/api/rooms/:id` | JWT | — | `PublicRoom` |
| GET | `/api/rooms/code/:code` | JWT | — | `PublicRoom` |
| PUT | `/api/rooms/:id` | JWT (owner) | Partial `CreateRoomRequest` | `PublicRoom` |
| DELETE | `/api/rooms/:id` | JWT (owner) | — | `{ message: "deleted" }` |
| POST | `/api/rooms/:id/leave` | JWT | — | `{ message: "left" }` |

### Data Flow

**Create Room:**
```
CreateRoomPage (React Hook Form + CreateRoomRequestSchema)
  → validate with Zod on frontend
  → POST /api/rooms
    → Zod validates req.body
    → generate 6-char code (unique, retry if collision)
    → if private: bcrypt.hash(password)
    → Room.create({ ...body, code, createdBy: req.userId, status: 'waiting' })
    → push creator into participants array with side: 'neutral'
    → return PublicRoom
  → navigate('/lobby/:roomId')
```

**Join Room:**
```
JoinRoomPage (enter code + optional password)
  → POST /api/rooms/join { code, password }
    → Room.findOne({ code })
    → check room.status === 'waiting'
    → check participants.length < maxParticipants
    → if private: bcrypt.compare(password, room.password)
    → push user into participants array
    → return PublicRoom
  → navigate('/lobby/:roomId')
```

**Browse Public Rooms:**
```
HomePage
  → GET /api/rooms
    → Room.find({ privacy: 'public', status: 'waiting' })
    → return array sorted by createdAt desc
  → display room cards with topic, participant count, mode badge
```

### Files Created

```
packages/shared/src/schemas/room.schema.ts

apps/frontend/src/services/room.service.ts
apps/frontend/src/pages/HomePage.tsx
apps/frontend/src/pages/CreateRoomPage.tsx
apps/frontend/src/pages/JoinRoomPage.tsx
apps/frontend/src/pages/MyRoomsPage.tsx
apps/frontend/src/components/RoomCard.tsx

apps/backend/src/controllers/room.controller.ts
apps/backend/src/services/room.service.ts
apps/backend/src/models/Room.model.ts
apps/backend/src/routes/room.routes.ts
```

---

## Layer 3 — Real-time Lobby

**Goal:** When multiple users are in the same room's lobby, they see each other join and leave in real-time. The room creator can start the debate once everyone is ready. All of this happens via Socket.IO backed by Redis for presence tracking.

### Feature Description

- **Live Participant List:** As users join the lobby, all existing participants see the new user appear instantly without refreshing.
- **Presence Tracking:** Redis stores who is currently connected and in which room. This is ephemeral — if a user disconnects, they are removed automatically.
- **Ready System:** Each participant can mark themselves as ready. The creator sees a "Start Debate" button activate when all participants are ready.
- **User Left:** If a participant disconnects or leaves, others see them removed from the list immediately.
- **Zustand Store:** Socket events write to the Zustand `roomStore`. React components read from the store — they do not listen to socket events directly.

### Socket Events

All event types are defined in `@argumint/shared/src/types/socket.types.ts`.

**Client → Server:**

| Event | Payload | Description |
|---|---|---|
| `joinRoom` | `{ roomId: string }` | User enters the lobby |
| `leaveRoom` | `{ roomId: string }` | User leaves the lobby |
| `setReady` | `{ roomId: string, isReady: boolean }` | Toggle ready state |
| `startDebate` | `{ roomId: string }` | Creator starts the debate (owner only) |

**Server → Client:**

| Event | Payload | Description |
|---|---|---|
| `roomState` | `RoomSocketState` | Full room snapshot on join |
| `userJoined` | `SocketUser` | A new participant joined |
| `userLeft` | `{ userId: string }` | A participant left or disconnected |
| `participantUpdated` | `SocketUser` | A participant's ready state changed |
| `debateStarted` | `{ debateId: string }` | Creator started the debate |
| `error` | `{ message: string }` | Something went wrong |

### Data Flow

**User enters lobby:**
```
LobbyPage mounts
  → useRoom(roomId) hook → GET /api/rooms/:id (load initial data)
  → useSocket(roomId) hook → socket.connect()
  → socket.emit('joinRoom', { roomId })

Backend socket.ts receives 'joinRoom':
  → verify JWT from socket handshake
  → socket.join(roomId)               (Socket.IO room)
  → Redis: SADD room:{roomId}:members {userId}
  → Redis: SET presence:{userId} {socketId} EX 3600
  → fetch current participants from MongoDB
  → emit 'roomState' back to this socket only (full snapshot)
  → broadcast 'userJoined' to everyone else in the room

Frontend receives 'roomState':
  → roomStore.setParticipants(roomState.participants)

Frontend receives 'userJoined':
  → roomStore.addParticipant(user)

LobbyPage reads from Zustand:
  → const participants = useRoomStore(state => state.participants)
  → re-renders participant list
```

**User disconnects:**
```
Socket.IO fires 'disconnect' event on backend
  → Redis: SREM room:{roomId}:members {userId}
  → Redis: DEL presence:{userId}
  → Room.updateOne: pull userId from participants
  → broadcast 'userLeft' { userId } to room

Frontend receives 'userLeft':
  → roomStore.removeParticipant(userId)
  → participant list re-renders without that user
```

**Creator starts debate:**
```
Creator clicks "Start Debate"
  → socket.emit('startDebate', { roomId })

Backend receives 'startDebate':
  → verify socket user is room creator
  → Room.updateOne({ status: 'active' })
  → create Debate document in MongoDB
  → store debate state in Redis: SET debate:{debateId} {...} EX 7200
  → broadcast 'debateStarted' { debateId } to all in room

All frontends receive 'debateStarted':
  → navigate('/debate/:debateId')
```

### Files Created

```
packages/shared/src/types/socket.types.ts

apps/frontend/src/stores/roomStore.ts
apps/frontend/src/hooks/useSocket.ts
apps/frontend/src/hooks/useRoom.ts
apps/frontend/src/pages/LobbyPage.tsx
apps/frontend/src/components/ParticipantCard.tsx
apps/frontend/src/components/ReadyButton.tsx

apps/backend/src/socket.ts
apps/backend/src/services/presence.service.ts   (Redis presence logic)
```

---

## Layer 4 — Live Debate

**Goal:** Once the debate starts, participants take turns presenting their arguments within a time limit. The turn order, timer, and argument history are managed server-side with Redis. All clients stay in sync via Socket.IO.

### Feature Description

- **Turn System:** Server determines whose turn it is based on mode. In Solo mode, participants rotate. In Team mode, For and Against sides alternate.
- **Server-side Timer:** The countdown timer runs on the backend (stored in Redis), not the frontend. This prevents any client from cheating by manipulating their local timer.
- **Argument Submission:** When it is your turn, you can type and submit an argument. It is broadcast to all participants and stored in MongoDB.
- **Turn Skip:** If a participant's timer runs out without submitting, the server automatically moves to the next turn.
- **Argument Feed:** All participants see a live scrolling feed of arguments as they are submitted.
- **Debate End:** After all rounds complete, or if the creator manually ends it, the debate moves to the voting phase.

### Schemas (`@argumint/shared`)

```typescript
// debate.schema.ts

RoundSchema {
  roundNumber: number
  speakerId: string
  speakerUsername: string
  side: 'for' | 'against' | 'neutral'
  argument: string
  submittedAt: Date
  durationSeconds: number    // how long they took
}

DebateSchema {
  _id: string
  roomId: string
  topic: string
  mode: 'solo' | 'team'
  rounds: RoundSchema[]
  currentTurn: {
    speakerId: string
    speakerUsername: string
    startedAt: Date
    durationSeconds: number    // allowed time per turn
  } | null
  status: 'in_progress' | 'voting' | 'ended'
  totalRounds: number
  startedAt: Date
  endedAt?: Date
}
```

### Socket Events

**Client → Server:**

| Event | Payload | Description |
|---|---|---|
| `submitArgument` | `{ debateId, argument: string }` | Submit your argument on your turn |
| `endDebate` | `{ debateId }` | Creator manually ends the debate |

**Server → Client:**

| Event | Payload | Description |
|---|---|---|
| `debateState` | `DebateState` | Full snapshot when joining mid-debate |
| `turnStarted` | `{ speakerId, speakerUsername, durationSeconds, endsAt }` | New turn begun |
| `turnEnded` | `{ speakerId, reason: 'submitted' \| 'timeout' }` | Turn over |
| `argumentSubmitted` | `RoundSchema` | New argument added to the feed |
| `debateEnded` | `{ debateId }` | Debate over, move to voting |

### Data Flow

**Turn cycle:**
```
Backend debate turn manager (runs on server):
  → determine next speaker from turn order
  → Redis: SET debate:{debateId}:currentTurn { speakerId, endsAt } EX turnDuration
  → broadcast 'turnStarted' { speakerId, durationSeconds, endsAt } to all in room
  → set server-side setTimeout for turnDuration

Frontend receives 'turnStarted':
  → debateStore.setCurrentTurn({ speakerId, endsAt })
  → if speakerId === currentUser.id → show argument input
  → start visual countdown from endsAt (calculated from server time)
```

**Argument submitted:**
```
Active speaker types argument and clicks Submit
  → socket.emit('submitArgument', { debateId, argument })

Backend receives 'submitArgument':
  → verify it is actually this user's turn
  → clearTimeout (cancel the timer)
  → Round.create({ speakerId, argument, ... }) or push to Debate.rounds
  → broadcast 'argumentSubmitted' { round } to all in room
  → move to next turn (repeat turn cycle)

Frontend receives 'argumentSubmitted':
  → debateStore.addRound(round)
  → argument appears in feed for all participants
```

**Turn timeout:**
```
Server setTimeout fires (speaker didn't submit in time)
  → broadcast 'turnEnded' { speakerId, reason: 'timeout' }
  → move to next turn

Frontend receives 'turnEnded':
  → debateStore.clearCurrentTurn()
  → hide argument input
  → show "Time's up" notification
```

### Files Created

```
packages/shared/src/schemas/debate.schema.ts   (add to existing shared)

apps/frontend/src/stores/debateStore.ts
apps/frontend/src/pages/DebatePage.tsx
apps/frontend/src/components/ArgumentFeed.tsx
apps/frontend/src/components/TurnTimer.tsx
apps/frontend/src/components/ArgumentInput.tsx

apps/backend/src/controllers/debate.controller.ts
apps/backend/src/services/debate.service.ts     (turn logic, timer management)
apps/backend/src/models/Debate.model.ts
apps/backend/src/routes/debate.routes.ts
```

---

## Layer 5 — Voting & Leaderboard

**Goal:** After a debate ends, participants vote on who argued best. Scores are calculated, user stats are updated in MongoDB, and the leaderboard in Redis is updated. Users can view their debate history and a global ranking.

### Feature Description

- **Post-debate Voting:** Each participant votes for the debater they found most convincing. You cannot vote for yourself.
- **Score Calculation:** Winner is determined by most votes. Points are awarded and stored against the user's profile.
- **Debate History:** Users can view their past debates, their arguments, and the outcome.
- **Leaderboard:** Global ranking of users by total score, powered by a Redis Sorted Set for fast retrieval.
- **User Stats:** Win rate, total debates, and total score displayed on the user profile.

### Schemas (`@argumint/shared`)

```typescript
// debate.schema.ts (additions)

VoteSchema {
  _id: string
  debateId: string
  voterId: string
  votedForId: string          // userId of who they voted for
  createdAt: Date
}

DebateResultSchema {
  debateId: string
  winnerId: string
  winnerUsername: string
  voteCount: number
  totalParticipants: number
  rounds: RoundSchema[]
}
```

### APIs

| Method | Endpoint | Auth | Body | Response |
|---|---|---|---|---|
| POST | `/api/debates/:id/vote` | JWT | `{ votedForId: string }` | `{ message: "vote recorded" }` |
| GET | `/api/debates/:id/result` | JWT | — | `DebateResult` |
| GET | `/api/debates/:id` | JWT | — | `Debate` |
| GET | `/api/users/leaderboard` | JWT | — | `PublicUser[]` (top 50) |
| GET | `/api/users/:id` | JWT | — | `PublicUser` with stats |
| GET | `/api/users/me/history` | JWT | — | `DebateResult[]` |

### Data Flow

**Voting phase:**
```
Debate ends → all clients receive 'debateEnded'
  → navigate to /debate/:id/vote

VotingPage loads
  → GET /api/debates/:id (load debate rounds and participants)
  → show each participant's arguments
  → user selects who they vote for

User submits vote:
  → POST /api/debates/:id/vote { votedForId }
    → check user hasn't already voted
    → check votedForId !== req.userId (no self-voting)
    → Vote.create({ debateId, voterId, votedForId })
    → check if all participants have voted
    → if yes: trigger result calculation

Result calculation (all votes in):
  → aggregate votes by votedForId
  → determine winnerId (most votes)
  → DebateResult.create({ debateId, winnerId, voteCount, ... })
  → User.updateOne winner: { $inc: { 'stats.debatesWon': 1, 'stats.totalScore': 10 } }
  → User.updateMany losers: { $inc: { 'stats.debatesLost': 1, 'stats.totalScore': 2 } }
  → Redis: ZADD leaderboard {newScore} {userId}   (updates sorted set)
  → Room.updateOne({ status: 'ended' })
  → broadcast 'resultReady' { debateId } via socket
```

**Leaderboard fetch:**
```
LeaderboardPage mounts
  → GET /api/users/leaderboard
    → Redis: ZREVRANGE leaderboard 0 49 WITHSCORES
    → fetch user details for each userId from MongoDB
    → return array sorted by score desc
  → display ranked list with scores and win rates
```

### Files Created

```
apps/frontend/src/pages/VotingPage.tsx
apps/frontend/src/pages/ResultPage.tsx
apps/frontend/src/pages/LeaderboardPage.tsx
apps/frontend/src/pages/ProfilePage.tsx
apps/frontend/src/components/VoteCard.tsx
apps/frontend/src/components/ScoreSummary.tsx

apps/backend/src/controllers/debate.controller.ts  (add vote and result endpoints)
apps/backend/src/controllers/user.controller.ts
apps/backend/src/services/scoring.service.ts
apps/backend/src/models/Vote.model.ts
apps/backend/src/routes/user.routes.ts
```

---

## Shared Package Reference

All types below are exported from `@argumint/shared` and used identically on both frontend and backend.

### Interfaces Summary

| Type | Used By | Layer |
|---|---|---|
| `User` / `PublicUser` | frontend + backend | Layer 1 |
| `RegisterRequest` / `LoginRequest` | frontend forms + backend validation | Layer 1 |
| `AuthResponse` | frontend auth service + backend controller | Layer 1 |
| `Room` / `PublicRoom` | frontend + backend | Layer 2 |
| `CreateRoomRequest` / `JoinRoomRequest` | frontend forms + backend validation | Layer 2 |
| `ServerToClientEvents` | Socket.IO server typing | Layer 3 |
| `ClientToServerEvents` | Socket.IO client typing | Layer 3 |
| `RoomSocketState` / `SocketUser` | socket event payloads | Layer 3 |
| `Debate` / `Round` | frontend + backend | Layer 4 |
| `DebateState` | socket event payload | Layer 4 |
| `Vote` / `DebateResult` | frontend + backend | Layer 5 |

---

## Environment Variables

### Backend (`apps/backend/.env`)

```env
# Database
MONGODB_URI=mongodb://localhost:27017/argumint
REDIS_URL=redis://localhost:6379

# Auth
JWT_SECRET=your-secret-key-min-32-chars
JWT_EXPIRE=7d

# Server
PORT=3000
NODE_ENV=development

# Frontend (for CORS)
FRONTEND_URL=http://localhost:5173
```

### Frontend (`apps/frontend/.env`)

```env
VITE_API_URL=http://localhost:3000
VITE_SOCKET_URL=http://localhost:3000
```

---

## Running Locally

```bash
# 1. Install all dependencies (from root)
npm install

# 2. Set up environment files
cp apps/backend/.env.example apps/backend/.env
cp apps/frontend/.env.example apps/frontend/.env
# edit both files with your values

# 3. Start MongoDB and Redis locally
# (or use Docker: docker-compose up -d)

# 4. Start both apps from root
npm run dev

# Frontend: http://localhost:5173
# Backend:  http://localhost:3000
```

---

## Deployment

The app is split across two platforms:

**Frontend** → Vercel
- URL: https://argumint-frontend.vercel.app
- Preview URL: https://argumint-frontend-git-main-bkumar28899-4688s-projects.vercel.app
- Auto-deploys on push to `main`
- Built from repo root using npm workspaces (`packages/shared` is built first)

**Backend** → Render
- URL: https://argumint-backend.onrender.com
- Auto-deploys on push to `main`
- Built from repo root, serves from `apps/backend/dist/server.js`
- Note: free tier spins down after 15 minutes of inactivity — first request after idle may take ~30 seconds to wake up

**Databases**
- MongoDB: MongoDB Atlas (M0 free tier)
- Redis: Upstash (free tier, TLS enabled)

**Environment Variables**
- Frontend (`VITE_API_BASE_URL`): set in Vercel dashboard
- Backend (`JWT_SECRET`, `MONGODB_URI`, `REDIS_URL`, `FRONTEND_URL`, `PORT`): set in Render dashboard

*Argumint 2.0 — Built with React, Node.js, MongoDB, Redis*
