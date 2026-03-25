# Debate Room Integration Guide

This guide explains how to integrate the debate room feature into your existing Argumint application pages and flows.

## Overview

The debate room feature is built modularly and can be integrated into any page component. The main entry point is the `<DebateRoom />` component, which is a self-contained feature that handles all debate logic internally.

## Integration Steps

### 1. Import the DebateRoom Component

```typescript
import DebateRoom from "@/components/DebateRoom";
```

### 2. Get Required Props

You'll need these props to initialize DebateRoom:

```typescript
interface DebateRoomProps {
  debateId: string;           // Unique debate ID (from backend)
  roomId: string;             // Room ID from existing system
  topic: string;              // Debate topic
  userId: string;             // Current user ID
  username: string;           // Current user's display name
  maxDurationPerTurn?: number; // Max speaking time (default: 300s)
  onDebateEnd?: () => void;   // Callback when debate ends
}
```

### 3. Example Integration in Existing Page

```typescript
// pages/RoomPage.tsx or similar
import { useEffect, useState } from "react";
import DebateRoom from "@/components/DebateRoom";
import { useSocket } from "@/hooks/useSocket";

export default function RoomPage({ roomCode }: { roomCode: string }) {
  const { socket } = useSocket();
  const [debateStarted, setDebateStarted] = useState(false);
  const [debateData, setDebateData] = useState<{
    debateId: string;
    roomId: string;
    topic: string;
    userId: string;
    username: string;
  } | null>(null);

  const handleStartDebate = async () => {
    // Emit debate:start socket event
    socket?.emit("debate:start", {
      roomId: room._id,
      topic: selectedTopic,
      maxDurationPerTurn: 300,
    }, (response) => {
      if (response.success) {
        setDebateData({
          debateId: response.debateId,
          roomId: room._id,
          topic: selectedTopic,
          userId: currentUser.id,
          username: currentUser.username,
        });
        setDebateStarted(true);
      }
    });
  };

  const handleDebateEnd = () => {
    // Handle post-debate logic
    setDebateStarted(false);
    // Optionally fetch results, show summary, etc.
  };

  if (debateStarted && debateData) {
    return (
      <DebateRoom
        {...debateData}
        onDebateEnd={handleDebateEnd}
      />
    );
  }

  return (
    <div>
      {/* Your existing room UI */}
      <button onClick={handleStartDebate}>Start Debate</button>
    </div>
  );
}
```

## Integration with Existing Hooks

### Using with useSocket

The DebateRoom component uses `useSocket` internally, so your app should already have socket context set up. No additional setup needed.

```typescript
// Your existing socket hook is reused
const { socket } = useSocket();
// DebateRoom will use the same socket instance
```

### Combining with useAuthForm (for user data)

Get user info from existing auth context:

```typescript
import { useAuth } from "@/context/AuthContext"; // or your auth setup

export default function RoomPage() {
  const { user } = useAuth();
  
  // Pass user data to DebateRoom
  <DebateRoom
    userId={user.id}
    username={user.username}
    // ... other props
  />
}
```

## Page Layout Example

Here's a complete example page integrating the debate room:

```typescript
// pages/RoomDetail.tsx
import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import DebateRoom from "@/components/DebateRoom";
import RoomLobby from "@/components/RoomLobby";
import { useSocket } from "@/hooks/useSocket";
import { useAuth } from "@/context/AuthContext";

export default function RoomDetail() {
  const { roomCode } = useParams();
  const { user } = useAuth();
  const { socket } = useSocket();
  
  const [room, setRoom] = useState(null);
  const [showDebate, setShowDebate] = useState(false);
  const [debateInfo, setDebateInfo] = useState(null);

  useEffect(() => {
    // Fetch room data on load
    socket?.emit("room:get-state", { roomCode }, (response) => {
      if (response.success) {
        setRoom(response.room);
      }
    });
  }, [socket, roomCode]);

  const handleStartDebate = () => {
    socket?.emit("debate:start", {
      roomId: room._id,
      topic: room.topic,
      maxDurationPerTurn: room.turnDuration,
    }, (response) => {
      if (response.success) {
        setDebateInfo({
          debateId: response.debateId,
          roomId: room._id,
          topic: room.topic,
          userId: user.id,
          username: user.username,
          maxDurationPerTurn: room.turnDuration,
        });
        setShowDebate(true);
      }
    });
  };

  const handleDebateEnd = () => {
    setShowDebate(false);
    // Show results page or return to lobby
  };

  if (!room) {
    return <div>Loading...</div>;
  }

  if (showDebate && debateInfo) {
    return (
      <div className="debate-container">
        <DebateRoom
          {...debateInfo}
          onDebateEnd={handleDebateEnd}
        />
      </div>
    );
  }

  return (
    <div className="room-container">
      <RoomLobby
        room={room}
        onStartDebate={handleStartDebate}
      />
    </div>
  );
}
```

## State Management Flow

```
RoomLobby (Voting/Ready phase)
    ↓
[User clicks "Start Debate"]
    ↓
debate:start socket event
    ↓
DebateRoom mounted with debate data
    ↓
Debate lifecycle:
  - Users claim mic
  - Transcripts collected
  - Arguments stored
  - Rounds progress
    ↓
debate:finished socket event
    ↓
onDebateEnd callback
    ↓
Show Results/Summary page
```

## Styling Integration

The DebateRoom component uses class names for styling:

```css
.debate-room { /* Main container */ }
.debate-header { /* Title and round info */ }
.current-speaker-section { /* Active speaker area */ }
.speaker-timer { /* Countdown timer */ }
.transcript-display { /* Live transcript */ }
.mic-control { /* Mic button area */ }
.argument-history { /* Arguments list */ }
.mic-button { /* Claiming button */ }
.finish-button { /* Finish speaking button */ }
.error-message { /* Error display */ }
.cooldown-message { /* Cooldown countdown */ }
```

Customize styling by:
1. Adding CSS classes in `src/styles/debate.css`
2. Using Tailwind classes directly in components
3. Overriding default class styles

## Error Handling in Integration

DebateRoom displays errors internally, but you can also handle them at the page level:

```typescript
const handleDebateEnd = () => {
  // Fetch final debate data to check for errors
  socket?.emit("debate:get-state", { debateId }, (response) => {
    if (!response.success) {
      showErrorModal("Failed to retrieve debate results");
      return;
    }
    
    // Show results
    const { debate, arguments } = response;
    showResultsPage(debate, arguments);
  });
};
```

## Performance Considerations

### Socket Event Optimization
- Debate events are scoped to room namespace: `room:{roomId}`
- Only room participants receive debate broadcasts
- No unnecessary global broadcasts

### Database Queries
- `getArgumentsInOrder()` returns all arguments efficiently
- Round numbers maintain order without requiring sort
- Single MongoDB document reduces query overhead

### Frontend Rendering
- DebateRoom uses React hooks (no unnecessary re-renders)
- Arguments history appends incrementally
- Timer updates at 1-second granularity

### Scaling to Multiple Rounds
- Each round stored as embedded document
- Current round always accessed by index
- No pagination needed for reasonable round counts (1-10)

## Browser Compatibility

### Web Speech API Support
Test in your target browsers:

```typescript
// In DebateRoom or useWebSpeech
if (!('SpeechRecognition' in window) && !('webkitSpeechRecognition' in window)) {
  // Show fallback for unsupported browsers
  return <ManualTranscriptForm />;
}
```

### Fallback for Unsupported Browsers
```typescript
// Create a manual transcript input component
<input 
  type="textarea"
  placeholder="Type or paste your argument here..."
  value={manualTranscript}
  onChange={(e) => setManualTranscript(e.target.value)}
/>
```

## Testing the Integration

### 1. Test Debate Start
```typescript
const handleStartDebate = async () => {
  try {
    // Should trigger debate:started socket event
    // DebateRoom should mount
    // Timer should initialize
  } catch (e) {
    console.error("Debate start failed:", e);
  }
};
```

### 2. Test Mic Claiming
```typescript
// Click "Claim Mic" button
// Should:
// - Emit debate:claim-mic event
// - Start Web Speech API
// - Display transcript in real-time
// - Show countdown timer
```

### 3. Test Finishing Speech
```typescript
// Click "Finish Speaking"
// Should:
// - Emit debate:release-mic with transcript
// - Show "Wait X seconds" cooldown
// - Display argument in history
// - Next user can claim mic after 5s
```

### 4. Test Rejoin
```typescript
// Disconnect socket during debate
// Reconnect
// Should:
// - Fetch all previous arguments
// - Restore current debate state
// - Continue from where it left off
```

## Common Integration Issues

### Issue: Socket events not firing
**Solution**: Ensure useSocket is initialized at app root and DebateRoom is within a component that can access it.

### Issue: Web Speech API errors
**Solution**: Check browser support and implement fallback transcript input.

### Issue: Transcript not saving
**Solution**: Verify MongoDB connection and that Debate model is properly imported.

### Issue: Timer not counting down
**Solution**: Ensure useDebateTimer is called with proper dependency arrays.

## Next Steps After Integration

1. **Add Results Page**: Show debate summary and argument scores
2. **Connect AI Scoring**: Process arguments through AI pipeline
3. **Add Voting**: Allow room participants to vote on arguments
4. **Export Transcript**: Download debate transcript as PDF
5. **Analytics Dashboard**: Track debate metrics over time

---

For questions or issues, refer to:
- `DEBATE_FEATURE_README.md` - Architecture and data flow
- `IMPLEMENTATION_CHECKLIST.md` - Feature checklist
- Source files in `apps/backend/src/services/` and `apps/frontend/src/`
