# Layer 2 Architecture Overview

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Frontend (React)                          │
│                    http://localhost:5173                          │
├─────────────────────────────────────────────────────────────────┤
│  Pages:                                                          │
│  ├─ HomePage          - Browse public rooms                     │
│  ├─ CreateRoomPage    - Create new debate room                 │
│  ├─ JoinRoomPage      - Join room with code                    │
│  ├─ MyRoomsPage       - View user's rooms                      │
│  └─ LobbyPage         - Room details & participants             │
│                                                                  │
│  Services:                                                       │
│  └─ RoomService       - API wrapper for room operations         │
│                                                                  │
│  Components:                                                     │
│  └─ RoomCard          - Display room information                │
└─────────────────────────────────────────────────────────────────┘
                            ↓ HTTPS/JSON ↓
                         AuthToken (JWT)
                            ↓        ↓
┌─────────────────────────────────────────────────────────────────┐
│                     Express Backend (Node.js)                    │
│                    http://localhost:3000                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Routes (room.routes.ts):                                        │
│  ├─ POST   /api/rooms           → createRoom                   │
│  ├─ POST   /api/rooms/join      → joinRoom                     │
│  ├─ GET    /api/rooms           → getPublicRooms               │
│  ├─ GET    /api/rooms/my-rooms  → getUserRooms                 │
│  ├─ GET    /api/rooms/:id       → getRoomById                  │
│  ├─ GET    /api/rooms/code/:code → getRoomByCode               │
│  ├─ PUT    /api/rooms/:id       → updateRoom                   │
│  ├─ DELETE /api/rooms/:id       → deleteRoom                   │
│  ├─ POST   /api/rooms/:id/leave → leaveRoom                    │
│  ├─ POST   /api/rooms/:id/start → startRoom                    │
│  └─ POST   /api/rooms/:id/end   → endRoom                      │
│                                                                  │
│  Controllers (room.controller.ts):                               │
│  └─ RoomController → Request handling & validation              │
│                                                                  │
│  Services (room.service.ts):                                     │
│  └─ RoomService → Business logic & database operations          │
│                                                                  │
│  Models (Room.model.ts):                                         │
│  └─ Mongoose schema with participants & password hashing        │
│                                                                  │
│  Middleware:                                                     │
│  ├─ authMiddleware  - JWT verification                          │
│  └─ CORS            - Cross-origin requests                     │
└─────────────────────────────────────────────────────────────────┘
                         ↓        ↓
            MongoDB              Redis
         (Room Collection)   (Session Storage)
```

## Request Flow Diagram

### Create Room Flow
```
CreateRoomPage
    ↓
Form Validation (React Hook Form)
    ↓
RoomService.createRoom()
    ↓
POST /api/rooms
    ↓
authMiddleware (verify JWT)
    ↓
RoomController.createRoom()
    ↓
Validation (Zod Schema)
    ↓
RoomService.createRoom()
    ├─ generateUniqueCode() → "ABC123"
    ├─ Hash password (if private)
    ├─ Create Room document
    ├─ Add creator as first participant
    └─ Return PublicRoom
    ↓
Response (201)
    ↓
Navigate to LobbyPage
```

### Join Room Flow
```
JoinRoomPage
    ↓
RoomService.getRoomByCode()
    ↓
GET /api/rooms/code/:code
    ↓
authMiddleware
    ↓
RoomController.getRoomByCode()
    ↓
Determine if private
    ↓
If Private: Show password input
If Public: Auto-proceed
    ↓
RoomService.joinRoom()
    ↓
POST /api/rooms/join
    ↓
authMiddleware
    ↓
RoomController.joinRoom()
    ↓
Validation + Safety Checks:
    ├─ Room exists?
    ├─ Status = waiting?
    ├─ Participants < max?
    ├─ User not already in room?
    ├─ Password correct (if private)?
    └─ All pass ✓
    ↓
RoomService.joinRoom()
    ├─ Add participant to array
    └─ Save to database
    ↓
Response (200)
    ↓
Navigate to LobbyPage
```

### Lobby Real-time Update Flow
```
LobbyPage mounts
    ↓
GET /api/rooms/:id (initial)
    ↓
Set polling interval (3s)
    ↓
Loop: GET /api/rooms/:id
    ├─ Check for participant changes
    ├─ Check for status changes
    ├─ Update UI if changed
    └─ Repeat every 3 seconds
    ↓
User clicks Start/End
    ↓
POST /api/rooms/:id/start
or
POST /api/rooms/:id/end
    ↓
Status updated in DB
    ↓
Next polling cycle fetches new status
    ↓
UI updates
```

## Data Flow Example: Create Public Room

```
User Input:
{
  name: "AI Ethics",
  topic: "Should AI be regulated?",
  mode: "solo",
  privacy: "public",
  maxParticipants: 5
}
    ↓
Backend Processing:
{
  _id: ObjectId,
  code: "ABC123",              ← Generated
  name: "AI Ethics",
  topic: "Should AI be regulated?",
  mode: "solo",
  privacy: "public",
  status: "waiting",           ← Default
  createdBy: "user-id",
  participants: [{
    userId: "user-id",
    username: "john@example.com",
    side: "neutral",           ← Default
    isReady: false,            ← Default
    joinedAt: 2024-01-15T10:30:00Z
  }],
  maxParticipants: 5,
  password: undefined,         ← Not set (public room)
  createdAt: 2024-01-15T10:30:00Z,
  updatedAt: 2024-01-15T10:30:00Z
}
    ↓
Sent to Frontend (PublicRoom - no password):
{
  _id: "...",
  code: "ABC123",
  name: "AI Ethics",
  topic: "Should AI be regulated?",
  mode: "solo",
  privacy: "public",
  status: "waiting",
  createdBy: "user-id",
  participants: [{
    userId: "user-id",
    username: "john@example.com",
    side: "neutral",
    isReady: false,
    joinedAt: 2024-01-15T10:30:00Z
  }],
  maxParticipants: 5,
  createdAt: 2024-01-15T10:30:00Z
}
```

## Database Schema

```
MongoDB Collections:
├── users (Layer 1)
│   ├── _id: ObjectId
│   ├── username: String
│   ├── email: String
│   ├── passwordHash: String
│   ├── stats: Object
│   └── timestamps
│
└── rooms (Layer 2)
    ├── _id: ObjectId
    ├── code: String (indexed, unique)
    ├── name: String
    ├── topic: String
    ├── mode: String (enum: solo, team)
    ├── privacy: String (enum: public, private)
    ├── status: String (enum: waiting, active, ended)
    ├── createdBy: String (userId, indexed)
    ├── participants: Array[{
    │   ├── userId: String
    │   ├── username: String
    │   ├── side: String (enum: for, against, neutral)
    │   ├── isReady: Boolean
    │   └── joinedAt: Date
    │ }]
    ├── maxParticipants: Number
    ├── password: String (hashed, only if private)
    └── timestamps
```

## State Management

### Frontend State
```
HomePage:
├─ rooms: PublicRoom[]
├─ loading: boolean
└─ error: string | null

CreateRoomPage:
├─ formData: CreateRoomRequest
├─ password: string
├─ loading: boolean
└─ error: string | null

JoinRoomPage:
├─ formData: JoinRoomRequest
├─ isPrivate: boolean
├─ loading: boolean
└─ error: string | null

MyRoomsPage:
├─ rooms: PublicRoom[]
├─ loading: boolean
└─ error: string | null

LobbyPage:
├─ room: PublicRoom | null
├─ loading: boolean
├─ actionLoading: boolean
└─ error: string | null
```

### Shared State (AuthContext)
```
{
  user: { id, username, email, stats, createdAt }
  isLoading: boolean
  error: string | null
  login: () => Promise<void>
  logout: () => Promise<void>
  register: () => Promise<void>
}
```

## Security Model

```
Authentication:
  User → POST /auth/login
    ↓
  JWT Token → Stored in HTTP-only Cookie
    ↓
  Every API Request → Verified by authMiddleware
    ↓
  req.userId & req.email extracted from JWT

Authorization:
  Owner-only operations:
    ├─ PUT /api/rooms/:id          (creator check)
    ├─ DELETE /api/rooms/:id       (creator check)
    ├─ POST /api/rooms/:id/start   (creator check)
    └─ POST /api/rooms/:id/end     (creator check)

Password Protection:
  Private Rooms:
    ├─ User password → bcrypt hash → stored in DB
    ├─ Join attempt → compare with hash
    └─ Password never sent to frontend
```

## Scaling Considerations

### Current Implementation
- Participants array embedded in Room document
- Good for small rooms (< 100 participants)
- Simple queries, no joins needed

### For Larger Scale
```
Option 1: Separate Participant Collection
  rooms:
    ├─ _id
    ├─ code
    ├─ name
    ├─ ... other fields
    └─ participantCount: number

  participants:
    ├─ _id
    ├─ roomId
    ├─ userId
    ├─ username
    ├─ side
    ├─ isReady
    └─ joinedAt

Option 2: Add Caching Layer
  Redis:
    ├─ room:{roomId} → PublicRoom (TTL: 60s)
    ├─ participants:{roomId} → Participant[] (TTL: 10s)
    └─ public-rooms:waiting → RoomId[] (TTL: 30s)
```

## Error Handling Strategy

```
Client-side:
  ├─ Form validation (React)
  ├─ Network error catching
  └─ User-friendly error messages

Server-side:
  ├─ Request validation (Zod)
  ├─ Authorization checks
  ├─ Database error handling
  └─ HTTP status codes (400, 401, 403, 404, 500)

Common Errors:
  ├─ 400: Invalid input, room full, duplicate join
  ├─ 401: No token, invalid token
  ├─ 403: Not room creator
  ├─ 404: Room not found
  └─ 500: Server error
```
