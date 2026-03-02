# Layer 2: Room Management Implementation

## Overview

Layer 2 implements authenticated room management with the ability to create, join, browse, and manage debate rooms. Rooms support multiple privacy levels, debate modes, and participant management.

## Features Implemented

### 1. Room Creation
- Users can create debate rooms with:
  - Room name (3-60 characters)
  - Debate topic (10-200 characters)
  - Debate mode: Solo or Team
  - Privacy level: Public or Private
  - Optional password for private rooms
  - Max participants (2-20, default 10)
- Creator automatically joins as first participant
- Unique 6-character alphanumeric code generated

### 2. Room Joining
- Users can join public rooms directly with code
- Private rooms require code + password
- Automatic validation of room status and participant limits
- Password hashing with bcrypt

### 3. Room Browsing
- Public rooms visible in home page
- Users can view all their rooms (created or joined)
- Room cards display key information

### 4. Room Lifecycle
- Rooms have three states: waiting → active → ended
- Only creator can start/end debates
- Creator leaving deletes the room
- Empty rooms auto-delete

## Architecture

### Shared Layer (`packages/shared/src/schemas/`)

**room.schema.ts** - Zod schemas for validation:
- `ParticipantSchema`: User participation details
- `RoomSchema`: Full room with password
- `PublicRoomSchema`: Room without password (safe to send to clients)
- `CreateRoomRequestSchema`: Room creation validation
- `JoinRoomRequestSchema`: Room joining validation

### Backend (`apps/backend/src/`)

**Models** (`models/Room.model.ts`):
- MongoDB Mongoose schema for rooms
- Password hashing with bcrypt
- Automatic timestamps

**Services** (`services/room.service.ts`):
- `RoomService`: Business logic for all room operations
- Code generation with collision detection
- Participant management
- Room lifecycle control

**Controllers** (`controllers/room.controller.ts`):
- `RoomController`: HTTP request handling
- Request validation with Zod
- Error handling and response formatting

**Routes** (`routes/room.routes.ts`):
- `POST /api/rooms` - Create room
- `POST /api/rooms/join` - Join room
- `GET /api/rooms` - Get public rooms
- `GET /api/rooms/my-rooms` - Get user's rooms
- `GET /api/rooms/:id` - Get room by ID
- `GET /api/rooms/code/:code` - Get room by code
- `PUT /api/rooms/:id` - Update room (owner only)
- `DELETE /api/rooms/:id` - Delete room (owner only)
- `POST /api/rooms/:id/leave` - Leave room
- `POST /api/rooms/:id/start` - Start debate (owner only)
- `POST /api/rooms/:id/end` - End debate (owner only)

### Frontend (`apps/frontend/src/`)

**Services** (`services/room.service.ts`):
- `RoomService`: API client wrapper
- Methods for all room operations
- Error handling and response parsing

**Pages**:
- `HomePage.tsx`: Display public rooms, navigation
- `CreateRoomPage.tsx`: Room creation form
- `JoinRoomPage.tsx`: Join room form with code/password
- `MyRoomsPage.tsx`: User's rooms with actions
- `LobbyPage.tsx`: Room details, participants, controls

**Components**:
- `RoomCard.tsx`: Room information card with join button

## API Response Format

All rooms returned to frontend use `PublicRoom` type (no password):
```typescript
{
  _id: string
  code: string
  name: string
  topic: string
  mode: 'solo' | 'team'
  privacy: 'public' | 'private'
  status: 'waiting' | 'active' | 'ended'
  createdBy: string
  participants: [{
    userId: string
    username: string
    side: 'for' | 'against' | 'neutral'
    isReady: boolean
    joinedAt: Date
  }]
  maxParticipants: number
  createdAt: Date
}
```

## Data Flow Examples

### Create Room
1. User fills form → `CreateRoomPage`
2. POST `/api/rooms` with validated `CreateRoomRequest`
3. Backend generates code, hashes password, creates room
4. Creator added as first participant (side: neutral)
5. Redirect to `/lobby/:roomId`

### Join Room
1. User enters code → `JoinRoomPage`
2. Frontend checks room by code
3. If private, prompts for password
4. POST `/api/rooms/join` with code + password
5. Backend validates, checks limits, adds participant
6. Redirect to `/lobby/:roomId`

### Browse Rooms
1. `HomePage` mounts
2. GET `/api/rooms` for public waiting rooms
3. Display room cards with join buttons
4. Click → Navigate to join form with pre-filled code

## Key Design Decisions

### Security
- Passwords hashed with bcrypt
- Private rooms completely hidden from public browse
- Room creator validation for sensitive operations
- JWT authentication required for all room operations

### Performance
- Room code unique constraint indexed in database
- Participant array stored inline (small, frequently accessed)
- Public rooms sorted by creation date descending

### User Experience
- Auto-join public rooms without password prompt
- Room code displayed prominently for sharing
- Real-time participant count
- Clear status indicators
- Polling for room updates in lobby

## Testing Checklist

- [ ] Create public room and verify code generation
- [ ] Create private room with password
- [ ] Join public room by code
- [ ] Join private room with password
- [ ] Get invalid room code error
- [ ] Get room full error
- [ ] Leave room and verify participant removal
- [ ] Delete room as creator
- [ ] Start debate with min participants
- [ ] End debate
- [ ] Browse public rooms list
- [ ] View my rooms
- [ ] Verify password hashing in database

## Future Enhancements

1. **Real-time Updates**: WebSocket support for live participant updates
2. **Team Assignment**: Auto-assign participants to For/Against teams
3. **User Profiles**: Display user stats in lobby
4. **Room History**: Archive and replay past debates
5. **Moderation**: Room rules, participant blocking
6. **Analytics**: Track debate participation and outcomes
