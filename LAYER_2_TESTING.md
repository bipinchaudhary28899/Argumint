# Layer 2 Testing Guide

## Setup

1. Install dependencies:
```bash
npm install
```

2. Start the application:
```bash
npm run dev
```

Backend should run on `http://localhost:3000`
Frontend should run on `http://localhost:5173`

## Test Scenarios

### Scenario 1: Create and Join Public Room

1. **Register/Login** to the app
2. Click **Create Room**
3. Fill in the form:
   - Name: "AI Ethics"
   - Topic: "Should AI be regulated by governments?"
   - Mode: Solo
   - Privacy: Public
   - Max Participants: 5
4. Click **Create Room**
5. You should be redirected to the lobby page showing:
   - Room code (6 characters, uppercase alphanumeric)
   - Room status: Waiting
   - 1 participant (you)
6. Open a new browser tab (or different user)
7. Go to home page, see your room in the list
8. Click **Join Room** or the room card's Join button
9. Enter the 6-character code
10. Click **Check & Join**
11. Verify you're added as participant in the lobby

### Scenario 2: Create and Join Private Room

1. Click **Create Room**
2. Fill in the form:
   - Name: "Private Debate"
   - Topic: "Should remote work be mandatory?"
   - Mode: Team
   - Privacy: Private
   - Password: "secret123"
   - Max Participants: 8
3. Click **Create Room**
4. Copy the room code
5. Share code with another user
6. Other user clicks **Join Room**
7. Enters code
8. Prompted for password
9. Enters password (wrong password should fail)
10. Joins successfully

### Scenario 3: Start and End Debate

1. Create a public room (as User A)
2. Have User B join the room
3. In lobby, User A should see **Start Debate** button
4. Click **Start Debate**
5. Room status should change to "Active"
6. **Start Debate** button should be replaced with **End Debate**
7. Click **End Debate**
8. Room status should change to "Ended"

### Scenario 4: Leave Room

1. User A creates room
2. User B joins room
3. Verify both are in participants list
4. User B clicks **Leave Room**
5. Confirm the action
6. User B should be redirected to home
7. User A's participant list should only show User A

### Scenario 5: View My Rooms

1. Create 3 different rooms
2. Have other users join some of them
3. Go to **My Rooms** page
4. Should see all rooms you created or joined
5. For each room, should see:
   - Room name and topic
   - Mode and privacy badges
   - Status indicator
   - Participant count
   - Code displayed
   - View, Leave, and Delete buttons

### Scenario 6: Browse Public Rooms

1. Create multiple public rooms
2. Go to **HomePage**
3. Should see all public waiting rooms in a grid
4. Each card should show:
   - Room name
   - Topic (truncated)
   - Solo/Team badge
   - Public badge
   - Code
   - Participant count
   - Join button (disabled if full)

### Scenario 7: Error Handling

Test these error cases:

**Invalid Code**
- Join Room page → enter "INVALID"
- Should show "Room not found" error

**Room Full**
- Create room with max 2 participants
- Have 2 users join
- 3rd user tries to join
- Should show "Room is full" error

**Wrong Password**
- Create private room with password
- Try to join with wrong password
- Should show "Invalid room password" error

**Duplicate Join**
- User joins room
- User tries to join same room again
- Should show "User already in room" error

**Access Denied**
- User A creates room
- User B tries to delete it
- Should show "Only room creator can delete" error

**Room Not Accepting**
- Create room, start debate (status: active)
- New user tries to join
- Should show "Room is not accepting new participants"

## API Testing (cURL)

### Create Room
```bash
curl -X POST http://localhost:3000/api/rooms \
  -H "Content-Type: application/json" \
  -H "Cookie: authToken=YOUR_TOKEN" \
  -d '{
    "name": "Test Room",
    "topic": "This is a test debate topic",
    "mode": "solo",
    "privacy": "public",
    "maxParticipants": 10
  }'
```

### Get Public Rooms
```bash
curl http://localhost:3000/api/rooms \
  -H "Cookie: authToken=YOUR_TOKEN"
```

### Join Room
```bash
curl -X POST http://localhost:3000/api/rooms/join \
  -H "Content-Type: application/json" \
  -H "Cookie: authToken=YOUR_TOKEN" \
  -d '{
    "code": "ABC123"
  }'
```

### Join Private Room
```bash
curl -X POST http://localhost:3000/api/rooms/join \
  -H "Content-Type: application/json" \
  -H "Cookie: authToken=YOUR_TOKEN" \
  -d '{
    "code": "ABC123",
    "password": "secret123"
  }'
```

### Get Room by Code
```bash
curl http://localhost:3000/api/rooms/code/ABC123 \
  -H "Cookie: authToken=YOUR_TOKEN"
```

### Start Debate
```bash
curl -X POST http://localhost:3000/api/rooms/ROOM_ID/start \
  -H "Cookie: authToken=YOUR_TOKEN"
```

### Leave Room
```bash
curl -X POST http://localhost:3000/api/rooms/ROOM_ID/leave \
  -H "Cookie: authToken=YOUR_TOKEN"
```

## Database Validation

### Check Room Created
```javascript
// MongoDB shell
db.rooms.find({}).pretty()
```

### Verify Password Hashing
```javascript
// Check that password field is hashed (not plaintext)
db.rooms.findOne({ privacy: "private" })
// Should show something like: "password": "$2b$10$..."
```

### Check Participant Added
```javascript
db.rooms.findOne({ _id: ObjectId("...") })
// Should show participants array with user objects
```

## Performance Testing

1. **Create 50 public rooms** and measure browse time
2. **Add 20 participants** to one room and check lobby load time
3. **Join/leave room repeatedly** to test concurrent updates
4. **Query my-rooms with 10 rooms** and verify response time

## Known Limitations

- No real-time WebSocket updates (polling every 3 seconds)
- No team auto-assignment in team mode
- No debate turn management
- No vote/scoring in place
