# Feature Flow Documentation

## Overview
This document outlines the data flow, REST API calls, and Socket.io events for each implemented feature.

---

## 1. Authentication Flow (Login/Register)

### User Registration
```
[Frontend] User fills registration form
    ↓
[REST API] POST /auth/register
    ├─ Body: { username, email, password }
    ├─ Validates with Zod schema
    └─ Creates user in MongoDB
    ↓
[Backend Response] Returns { user, token }
    ├─ Sets secure httpOnly cookie: authToken
    └─ Returns token in response body
    ↓
[Frontend API Interceptor] Captures response
    ├─ Extracts token from response.data.token
    └─ Stores in localStorage with key "token"
    ↓
[Socket.io Connection] Attempts to initialize
    ├─ Retrieves token from localStorage
    └─ Passes token in auth object for handshake
    ↓
[Backend Socket Middleware] Validates token
    ├─ Verifies JWT signature
    ├─ Extracts userId and username
    └─ Allows connection if valid
    ↓
[Frontend] AuthContext updates, user logged in
    └─ useSocket hook establishes Socket.io connection
```

### User Login
```
[Frontend] User enters credentials
    ↓
[REST API] POST /auth/login
    ├─ Body: { email, password }
    ├─ Validates credentials against MongoDB
    └─ Generates JWT token
    ↓
[Backend Response] Returns { user, token }
    └─ (Same process as registration)
```

---

## 2. Room Creation Flow

### Step-by-Step Data Flow
```
[Frontend: CreateRoom Page] User fills form
    ├─ topic: string
    ├─ description: string
    ├─ maxParticipants: number
    ├─ debateMode: "buzzer" | "round-robin"
    ├─ prepTime: number
    ├─ roundDuration: number
    └─ timer: number
    ↓
[Validation] Frontend validates with Zod schema
    ↓
[REST API] POST /rooms/create
    ├─ Headers: Cookie (authToken auto-included via withCredentials)
    ├─ Body: RoomData
    ├─ Backend extracts userId from JWT in cookie
    ├─ Generates unique 6-char room code
    ├─ Creates Room document in MongoDB with:
    │  ├─ code: string (unique)
    │  ├─ createdBy: userId
    │  ├─ participants: [{ userId, username, role: "moderator", status: "joined" }]
    │  ├─ settings: { topic, description, ... }
    │  └─ status: "waiting"
    └─ Returns full Room object
    ↓
[Frontend Response Handler]
    ├─ Receives Room data
    ├─ Stores in RoomContext via setRoom()
    ├─ Clears form
    └─ Navigates to /room/:code/lobby
    ↓
[RoomLobby Component Loads]
    ├─ Loads room from context (already populated)
    ├─ Displays: N/10 participants (e.g., 1/10)
    └─ Renders participant list with creator as moderator
```

---

## 3. Room Joining Flow

### Step-by-Step Data Flow
```
[Frontend: JoinRoom Page] User enters room code
    ├─ Input: 6-char room code
    └─ Converts to uppercase
    ↓
[Validation] Frontend validates code format
    ↓
[REST API] POST /rooms/join
    ├─ Body: { code }
    ├─ Backend extracts userId from JWT
    ├─ Finds room by code in MongoDB
    ├─ Checks if room is full (participants.length >= maxParticipants)
    ├─ Adds user to participants array:
    │  └─ { userId, username, role: "participant", status: "joined" }
    ├─ Saves updated room to MongoDB
    └─ Returns full Room object with all participants
    ↓
[Frontend Response Handler]
    ├─ Receives Room data
    ├─ Stores in RoomContext via setRoom()
    └─ Navigates to /room/:code/lobby
    ↓
[RoomLobby Component Loads]
    ├─ Loads room from context
    ├─ Displays: N/10 participants (updated count)
    └─ Current user can see ready button (role !== moderator)
```

---

## 4. Room Lobby - Real-Time Updates

### Socket.io Connection & Join
```
[RoomLobby Component] useEffect triggers
    ├─ Checks: socket exists? isConnected? room exists? code exists?
    └─ If all true, continues
    ↓
[Socket Event] Client emits "room:join"
    ├─ Data: { roomCode: "XXXXXX" }
    ├─ Callback: (response) => { success, room, error }
    └─ Frontend waits for callback
    ↓
[Backend Socket Handler] "room:join" event
    ├─ Extracts roomCode from event data
    ├─ Fetches room from MongoDB by code
    ├─ Checks if user already in participants list
    ├─ If NOT already participant:
    │  └─ Calls RoomService.joinRoom() to add them
    ├─ Calls socket.join(`room:XXXXX`) - joins socket.io room
    ├─ Responds to client callback with updated room
    └─ Broadcasts to all sockets in room
    ↓
[Socket Broadcast] "room:participant-joined"
    ├─ Emitted to: io.to(`room:XXXXX`) - all users in this room
    ├─ Data: {
    │  ├─ roomId: ObjectId as string
    │  ├─ participants: [full updated array]
    │  └─ message: "username joined the room"
    │ }
    └─ (Reaches BOTH existing users and the newly joined user)
    ↓
[Frontend Socket Listener] "room:participant-joined"
    ├─ Received on ALL clients in the room simultaneously
    ├─ Updates local state: setLocalRoom()
    ├─ Updates participants array in component state
    └─ Component re-renders with updated participant count
    ↓
[UI Update]
    ├─ ALL users see updated participant count (e.g., 1/10 → 2/10)
    ├─ Participant list updates
    └─ New user appears in the list with "Waiting" status
```

### Real-Time Broadcasting Chain
```
User2 joins room → REST API adds to DB → User2 socket.emit() → 
Backend broadcasts to socket room → User1 receives broadcast → 
User1's state updates → User1 sees 2/10
```

---

## 5. Ready Status Flow

### User Marking Ready
```
[Frontend: RoomLobby] Non-moderator clicks "Ready Up" button
    ↓
[Socket Event] Client emits "participant:ready"
    ├─ Data: { roomCode: "XXXXXX" }
    ├─ Current user: sets userReady = true locally
    └─ Frontend optimistically updates button
    ↓
[Backend Socket Handler] "participant:ready" event
    ├─ Extracts roomCode from event data
    ├─ Fetches room from MongoDB
    ├─ Finds participant with matching userId
    ├─ Updates their status: status = "ready"
    ├─ Saves room to MongoDB
    └─ Broadcasts to room
    ↓
[Socket Broadcast] "room:participant-status-updated"
    ├─ Emitted to: io.to(`room:XXXXX`)
    ├─ Data: {
    │  ├─ roomId: ObjectId as string
    │  ├─ participants: [updated array with new status]
    │  └─ message: "username is ready"
    │ }
    └─ (All users receive updated status)
    ↓
[Frontend Socket Listener] "room:participant-status-updated"
    ├─ Updates state: setLocalRoom() with new participants
    ├─ Re-renders participant list
    └─ Updates status badges (Waiting → Ready)
    ↓
[Moderator Sees]
    ├─ All participants' status badges
    ├─ When all are "ready": "Start Debate" button becomes enabled
    └─ Participant count must be >= 2
```

### Moderator Starting Debate
```
[Frontend: RoomLobby] Moderator clicks "Start Debate" button
    ├─ Button is only enabled when:
    │  ├─ User role === "moderator"
    │  ├─ All participants status === "ready"
    │  └─ Participant count >= 2
    ↓
[Socket Event] Client emits "room:start-debate"
    ├─ Data: { roomCode: "XXXXXX" }
    └─ (This feature needs to be implemented)
    ↓
[Backend Socket Handler] "room:start-debate" event
    ├─ Validates user is moderator
    ├─ Validates all participants are ready
    ├─ Updates room.status = "active" in MongoDB
    ├─ Broadcasts to room: "room:debate-started"
    └─ (This feature needs to be implemented)
    ↓
[Frontend Navigation]
    └─ All users navigate to voting/debate prep phase
    └─ (This phase needs to be implemented)
```

---

## 6. User Disconnect Flow

### When User Leaves/Disconnects
```
[User Closes Tab or Loses Connection]
    ↓
[Browser] Socket.io auto-detects disconnect
    ↓
[Backend] socket.on("disconnect") triggers
    ├─ User is NOT removed from room immediately
    ├─ Broadcasts: "room:participant-disconnected"
    │  └─ Data: { participants: [...], message: "user disconnected" }
    └─ Sets 30-second grace period (optional for reconnection)
    ↓
[Frontend Socket Listener] "room:participant-disconnected"
    ├─ Updates state with participant list
    ├─ Shows status as "Offline" or "Disconnected"
    └─ Still counts in participant total
    ↓
[After 30 seconds or User Doesn't Reconnect]
    ├─ (Optional: Remove from participants in DB)
    ├─ Broadcast final update to remaining users
    └─ Participant count decreases
```

---

## 7. Data Flow Diagram Summary

### REST API Calls (Synchronous)
```
Authentication:
  POST /auth/register
  POST /auth/login
  GET /auth/me

Room Management:
  POST /rooms/create          → Creates room, adds creator as participant
  POST /rooms/join            → Adds user to existing room
  GET /rooms/:code            → Fetches room details
  PUT /rooms/:roomId/settings → Updates room settings (moderator only)
```

### Socket.io Events (Real-Time, Asynchronous)
```
Client → Server (Emit):
  room:join                    → User joins socket room, added to participants
  participant:ready            → User marks as ready
  participant:unready          → User marks as not ready
  room:start-debate (TBD)      → Moderator starts debate

Server → Clients (Broadcast):
  room:participant-joined      → Someone joined the room
  room:participant-left        → Someone left the room
  room:participant-status-updated → Someone changed ready status
  room:participant-disconnected   → Someone disconnected
  room:debate-started (TBD)       → Debate phase started
```

---

## 8. State Management

### Frontend State
```
AuthContext:
  ├─ user: User object
  ├─ token: JWT (stored in localStorage)
  └─ isAuthenticated: boolean

RoomContext:
  └─ room: Room object

RoomLobby Component State:
  ├─ localRoom: Room object (updates from socket broadcasts)
  ├─ userReady: boolean (current user's ready status)
  ├─ isConnected: boolean (socket.io connection status)
  ├─ error: string
  └─ isLoading: boolean
```

### Backend State
```
MongoDB Documents:
  ├─ Users collection
  │  └─ { _id, username, email, passwordHash, stats, createdAt }
  └─ Rooms collection
     └─ { 
        ├─ _id, code, createdBy, 
        ├─ participants: [{ userId, username, role, status, joinedAt }],
        ├─ settings: { topic, description, mode, timings },
        ├─ status: "waiting" | "active" | "completed",
        └─ createdAt, updatedAt
     }

Socket.io Rooms:
  └─ room:XXXXX (MongoDB ObjectId)
     └─ Contains all socket connections of users in this room
```

---

## 9. Key Points

1. **Token Flow**: LocalStorage → Socket.io Auth → Backend Middleware → Connection Allowed
2. **Real-Time Updates**: All users in a socket room receive broadcasts simultaneously
3. **Database Consistency**: MongoDB is source of truth for room data
4. **Optimistic UI**: Frontend can update UI immediately, backend confirms via broadcast
5. **Grace Period**: Disconnect handling can support reconnection within 30 seconds (TBD implementation)

---

## 10. Next Features to Implement

Based on the original room status flow document:
- Phase 5: Voting system with server-side timers
- Phase 6: Debate start with side assignment (for/against)
- Phase 7: Prep screen countdown
- Phase 8-9: Live debate with buzzer (Redis-backed race condition handling)
- Phase 10: Results and turn history
