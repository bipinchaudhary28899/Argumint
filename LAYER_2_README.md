# Layer 2: Room Management - Complete Implementation

## Quick Start

### Installation
```bash
npm install
npm run dev
```

### Access Points
- Frontend: http://localhost:5173
- Backend: http://localhost:3000
- API Health: http://localhost:3000/health

## What's Included

### 1. Complete API Layer
- 11 REST endpoints for room management
- Full CRUD operations with validation
- Authentication and authorization
- Error handling with proper HTTP status codes

### 2. Database Layer
- MongoDB Mongoose model for rooms
- Embedded participant management
- Bcrypt password hashing for private rooms
- Automatic timestamps

### 3. Frontend UI
- 5 complete pages for room management
- Real-time participant updates via polling
- Responsive design with Tailwind CSS
- Form validation with error messages

### 4. Type Safety
- Shared Zod schemas between frontend and backend
- TypeScript throughout codebase
- Proper type exports in shared package

## Key Features

✅ **Create Rooms**
- Set debate topic and mode (Solo/Team)
- Choose privacy level (Public/Private)
- Optional password protection
- Max participant limits

✅ **Join Rooms**
- Browse public rooms
- Enter code to join
- Password verification for private rooms
- Auto-validation before joining

✅ **Room Management**
- View all your rooms
- Leave rooms
- Delete rooms (creator only)
- Start/end debates (creator only)

✅ **Real-time Features**
- Live participant list
- Status updates
- Room state transitions
- User-friendly notifications

✅ **Security**
- JWT authentication
- Password hashing with bcrypt
- Authorization checks on sensitive operations
- CORS configuration

## File Structure

```
apps/
├── backend/src/
│   ├── controllers/room.controller.ts      (NEW)
│   ├── models/Room.model.ts                (NEW)
│   ├── services/room.service.ts            (NEW)
│   ├── routes/room.routes.ts               (NEW)
│   ├── app.ts                              (UPDATED)
│   └── server.ts                           (UPDATED)
│
└── frontend/src/
    ├── pages/
    │   ├── HomePage.tsx                    (NEW)
    │   ├── CreateRoomPage.tsx               (NEW)
    │   ├── JoinRoomPage.tsx                 (NEW)
    │   ├── MyRoomsPage.tsx                  (NEW)
    │   └── LobbyPage.tsx                    (NEW)
    ├── components/RoomCard.tsx              (NEW)
    ├── services/room.service.ts             (NEW)
    └── App.tsx                              (UPDATED)

packages/
└── shared/src/
    ├── schemas/room.schema.ts               (NEW)
    └── index.ts                             (UPDATED)

Documentation/
├── LAYER_2.md                              (Overview)
├── LAYER_2_IMPLEMENTATION.md               (Files created)
├── LAYER_2_TESTING.md                      (Testing guide)
├── LAYER_2_ARCHITECTURE.md                 (Architecture diagrams)
└── LAYER_2_README.md                       (This file)
```

## API Documentation

### Base URL
```
POST   /api/rooms
GET    /api/rooms
GET    /api/rooms/my-rooms
GET    /api/rooms/:id
GET    /api/rooms/code/:code
PUT    /api/rooms/:id
DELETE /api/rooms/:id
POST   /api/rooms/join
POST   /api/rooms/:id/leave
POST   /api/rooms/:id/start
POST   /api/rooms/:id/end
```

All endpoints require `authToken` in cookies.

### Example Requests

**Create Room**
```bash
POST /api/rooms
Content-Type: application/json

{
  "name": "AI Ethics Debate",
  "topic": "Should AI be regulated by governments?",
  "mode": "team",
  "privacy": "public",
  "maxParticipants": 10
}
```

**Join Room**
```bash
POST /api/rooms/join
Content-Type: application/json

{
  "code": "ABC123"
}
```

**Join Private Room**
```bash
POST /api/rooms/join
Content-Type: application/json

{
  "code": "XYZ789",
  "password": "secret123"
}
```

## Database Schema

### Room Document
```typescript
{
  _id: ObjectId,
  code: string,                    // 6-char unique code
  name: string,                    // 3-60 chars
  topic: string,                   // 10-200 chars
  mode: 'solo' | 'team',
  privacy: 'public' | 'private',
  status: 'waiting' | 'active' | 'ended',
  createdBy: string,               // userId
  participants: [{
    userId: string,
    username: string,
    side: 'for' | 'against' | 'neutral',
    isReady: boolean,
    joinedAt: Date
  }],
  maxParticipants: number,         // 2-20
  password?: string,               // hashed, only if private
  createdAt: Date,
  updatedAt: Date
}
```

## Testing

Comprehensive testing guide available in `LAYER_2_TESTING.md` including:
- 7 detailed test scenarios
- cURL examples for API testing
- Database validation commands
- Error case testing
- Performance testing suggestions

Quick test:
1. Create an account
2. Create a public room
3. Share the room code
4. Join from another browser/user
5. Start the debate
6. Check room updates

## Frontend Routes

| Path | Purpose |
|------|---------|
| `/` | Browse public rooms |
| `/create-room` | Create new room |
| `/join-room` | Join existing room |
| `/my-rooms` | View user's rooms |
| `/lobby/:roomId` | Room details & participants |

## Response Format

All rooms returned as `PublicRoom` (password excluded):

```typescript
{
  _id: string,
  code: string,
  name: string,
  topic: string,
  mode: 'solo' | 'team',
  privacy: 'public' | 'private',
  status: 'waiting' | 'active' | 'ended',
  createdBy: string,
  participants: Participant[],
  maxParticipants: number,
  createdAt: Date
}
```

## Architecture Highlights

### Separation of Concerns
- **Routes**: Request routing and middleware
- **Controllers**: HTTP request handling
- **Services**: Business logic and database operations
- **Models**: Data structure and persistence

### Validation Strategy
- Zod schemas for request validation
- Type inference for TypeScript safety
- Frontend and backend share same schemas

### Error Handling
- Proper HTTP status codes
- Descriptive error messages
- User-friendly frontend notifications

### Performance
- Indexed code field for fast lookups
- Embedded participants (good for < 100)
- Optional polling for real-time updates

## Next Steps (Layer 3)

The following features are planned for Layer 3:
1. WebSocket support for real-time updates
2. Debate structure with turns and rounds
3. Argument/message submission system
4. Vote and scoring mechanism
5. Debate history and results
6. User statistics and leaderboards

## Troubleshooting

### "Room not found"
- Verify room code is exactly 6 characters
- Ensure room status is "waiting" (can't join active/ended rooms)

### "User already in room"
- User is already a participant in this room

### "Room is full"
- Max participants limit reached
- Another user must leave first

### Password errors
- For private rooms, password is required
- Password is case-sensitive
- Verify you're entering the correct password

### CORS errors
- Check FRONTEND_URL environment variable
- Ensure frontend URL is in CORS whitelist in app.ts

## Performance Notes

- Lobby updates via polling every 3 seconds (websockets in v3)
- Room list fetches all public waiting rooms
- Participant arrays embedded in room document
- Consider sharding rooms collection if scale exceeds 100k rooms

## Security Notes

- All passwords hashed with bcrypt (10 rounds)
- JWT tokens verified on every protected request
- Private rooms completely hidden from public browse
- Creator-only operations validated server-side
- Passwords never sent to frontend

## Code Statistics

- **Backend**: ~700 lines (models + services + controllers + routes)
- **Frontend**: ~600 lines (pages + services + components)
- **Shared**: ~100 lines (schemas + types)
- **Documentation**: ~800 lines
- **Total**: ~2,100 lines of code

## Contributors

Implementation completed for Argumint Layer 2.

## License

Part of Argumint project.

---

For detailed documentation, see:
- Architecture: `LAYER_2_ARCHITECTURE.md`
- Testing: `LAYER_2_TESTING.md`
- Implementation: `LAYER_2_IMPLEMENTATION.md`
