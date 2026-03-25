# Debate Room Feature Implementation

This document outlines the core debate room feature implementation for the Argumint application, built with a button-based turn management system, real-time transcription, and structured argument storage.

## Architecture Overview

### Backend Services

#### 1. **Debate Service** (`apps/backend/src/services/debate.service.ts`)
Manages all debate-related operations and state:

- **createDebate()**: Initialize a new debate with participants
- **claimMic()**: User claims mic for the current round
- **releaseMic()**: User finishes speaking and submits transcript
- **moveToNextRound()**: Advance to the next debate round
- **getArgumentsInOrder()**: Retrieve all arguments in chronological order with round numbers
- **updateArgumentScore()**: Store AI scoring results for each argument
- **getDebateSummary()**: Final results and debate metadata

Key Features:
- Arguments are stored with round numbers to maintain order
- Transcripts are saved immediately after speaking (supports rejoin scenarios)
- Prevents speaker from reclaiming mic in same round
- Supports multiple rounds with automatic speaker lock

#### 2. **Turn Manager Service** (`apps/backend/src/services/turnManager.service.ts`)
Manages mic queue and cooldown logic using Redis:

- **addToQueue()**: Add user to mic queue
- **getNextFromQueue()**: Get next speaker
- **setCooldown()**: Set 5-second cooldown after speaking
- **isOnCooldown()**: Check if user can claim mic
- **notifyMicAvailable()**: Broadcast mic availability
- **startMicCountdown()**: Handle 5-second countdown before mic release

Features:
- Redis-backed queue for concurrent user handling
- 5-second cooldown prevents immediate re-claiming
- Automatic queue management
- Real-time notifications to all room participants

### Database Schema

#### Debate Model
```typescript
interface IDebate {
  roomId: string;
  topic: string;
  status: "ready" | "in-progress" | "finished";
  rounds: IDebateRound[];
  arguments: IArgument[];
  participantIds: string[];
  currentRoundNumber: number;
  startedAt: Date;
  endedAt?: Date;
}
```

#### Argument Model (stored in Debate.arguments array)
```typescript
interface IArgument {
  debateId: string;
  roundNumber: number;
  speakerId: string;
  speakerUsername: string;
  transcript: string;
  aiScore?: number;
  duration: number;
  startedAt: Date;
  endedAt: Date;
}
```

**Key Design Decision**: Arguments are embedded in the Debate document with round numbers for order preservation. This enables:
- Chronological retrieval even if users rejoin
- Atomic argument + debate state updates
- Single query to get all debate data

#### Debate Round Model (stored in Debate.rounds array)
```typescript
interface IDebateRound {
  roundNumber: number;
  currentSpeakerId?: string;
  speakersInRound: string[];
  maxDuration: number;
  status: "waiting" | "speaking" | "finished";
}
```

### Socket Events

#### Emitted by Client

| Event | Payload | Response |
|-------|---------|----------|
| `debate:start` | `{roomId, topic, maxDurationPerTurn}` | `{success, debateId}` |
| `debate:claim-mic` | `{debateId, roomId}` | `{success, currentSpeaker, roundNumber, maxDuration}` |
| `debate:release-mic` | `{debateId, roomId, transcript, duration}` | `{success, argumentId, transcript, duration}` |
| `debate:next-round` | `{debateId, roomId}` | `{success, roundNumber}` |
| `debate:end` | `{debateId, roomId}` | `{success, debate}` |
| `debate:get-state` | `{debateId}` | `{success, debate, arguments}` |

#### Emitted by Server (Broadcasting)

| Event | Data |
|-------|------|
| `debate:started` | `{debateId, roomId, topic, participants, currentRound}` |
| `debate:mic-claimed` | `{debateId, speaker, roundNumber, maxDuration}` |
| `debate:mic-released` | `{debateId, speaker, roundNumber, transcript, duration}` |
| `debate:mic-available` | `{debateId, queueLength, nextInQueue, cooldownDuration}` |
| `debate:mic-countdown` | `{debateId, remainingSeconds}` |
| `debate:round-started` | `{debateId, roundNumber}` |
| `debate:finished` | `{debateId, summary}` |

### Frontend Hooks

#### 1. **useWebSpeech** 
Browser-based speech recognition using Web Speech API:
```typescript
const {
  isListening,
  transcript,
  interimTranscript,
  startListening,
  stopListening,
  resetTranscript,
  isSupported
} = useWebSpeech({ language: "en-US", continuous: true, interimResults: true });
```

Features:
- Real-time interim results for user feedback
- Final transcripts when phrases complete
- Error handling for unsupported browsers
- Automatic cleanup on unmount

#### 2. **useDebateTimer**
Manages speaking time limits:
```typescript
const {
  timeRemaining,
  isRunning,
  startTimer,
  stopTimer,
  resetTimer,
  elapsedTime,
  percentageUsed
} = useDebateTimer({ maxDuration: 300, onTimeUp: handleTimeUp });
```

Features:
- 1-second granularity countdown
- Callbacks when time expires
- Percentage calculation for progress indicators
- Elapsed time tracking

#### 3. **useDebateSocket**
Socket.IO event management:
```typescript
const {
  startDebate,
  claimMic,
  releaseMic,
  nextRound,
  endDebate,
  getDebateState,
  onDebateStarted,
  onMicClaimed,
  onMicReleased,
  onMicAvailable,
  onMicCountdown,
  onRoundStarted,
  onDebateFinished
} = useDebateSocket();
```

### Frontend Components

#### **DebateRoom** (Main Container)
Orchestrates the debate flow and manages state:
- Listens to all socket events
- Coordinates timer and speech recognition
- Manages error states and feedback
- Displays current speaker info
- Renders controls and argument history

#### **MicControl** 
Button for claiming mic:
- Shows recording status
- Displays cooldown messages
- Disabled state during speaking/cooldown

#### **TranscriptDisplay**
Shows live speech transcription:
- Final transcript in black
- Interim results in gray/italic
- Real-time updates as user speaks

#### **SpeakerTimer**
Visual countdown timer:
- Time remaining in MM:SS format
- Colored progress bar (green→yellow→red)
- Percentage used indicator

#### **ArgumentHistory**
Lists all arguments in order:
- Speaker name, round number, duration
- AI score (when available)
- Full transcript text

## Debate Flow

### 1. **Setup Phase**
- Room creator initiates debate with topic and max duration per turn
- All participants notified of debate start
- System initializes first round

### 2. **Speaking Phase**
- Button appears: "Claim Mic"
- User clicks → mic is claimed
- Timer starts (max duration shown)
- Browser Web Speech API activates for transcription
- Real-time transcript updates visible

### 3. **End of Turn**
User can end speaking in two ways:
1. **Manually click "Finish Speaking"** → Event emitted to all
2. **Time expires automatically** → System ends turn

### 4. **Cooldown Phase (5 seconds)**
- Mic is released
- Transcript is saved to database immediately
- Button shows: "Wait X seconds before claiming mic"
- Other users cannot claim mic during this period

### 5. **Next Turn**
- After 5-second cooldown, button becomes available again
- First person to click gets the mic
- Previous speaker cannot reclaim (speaker lock)
- Cycle repeats for current round

### 6. **Next Round**
- Admin/host can advance to next round
- New speaker lock list reset
- Previous arguments remain in history
- Round number increments

### 7. **Debate End**
- Admin ends debate
- Final summary generated with all arguments
- Debate status → "finished"
- Arguments remain queryable for post-analysis

## Data Persistence

### Argument Storage
- **When**: Immediately after user finishes speaking (transcript saved before even the 5-second cooldown)
- **Where**: MongoDB (Debate.arguments array)
- **Why**: Supports user rejoin scenarios and async transcription processing
- **Order**: Maintained by roundNumber and insertion order

### Rejoin Handling
If a user disconnects and rejoins:
1. Frontend queries `debate:get-state` to fetch all arguments
2. Arguments returned in order (sorted by roundNumber)
3. Current debate state synced
4. User can continue from where debate left off

## Async Processing (Parallel Tasks)

For scaling with AI features:

```
As user finishes speaking:
├─ Save transcript to database (IMMEDIATE)
├─ Emit "mic:released" to all participants (IMMEDIATE)
└─ Queue background jobs (PARALLEL):
    ├─ AI Scoring (process transcript, store score)
    └─ Sentiment Analysis (optional future feature)
```

The system maintains order by storing `roundNumber` with each argument. Async AI scoring can happen later without losing chronological information.

## Configuration

Environment variables needed:
```
MONGODB_URI=<connection string>
REDIS_URL=<connection string>  # For turn queue management
```

Customizable settings:
- `maxDurationPerTurn`: Seconds per speaker (default: 300)
- `votingDuration`: Voting phase timing
- `COOLDOWN_DURATION`: Time before mic reusable (hardcoded: 5 seconds)

## Future Enhancements

1. **AI Argument Scoring**
   - Async queue processing
   - Score stored in Argument.aiScore
   - Displayed in ArgumentHistory

2. **Sides/Positions**
   - Add `side: "for" | "against"` to arguments
   - Filter/group by position
   - Calculate side-based statistics

3. **Multiple Debaters**
   - Extend from 2→N participants
   - Queue-based selection

4. **Real-time Analytics**
   - Argument count per speaker
   - Speaking time distribution
   - Engagement metrics

5. **Audio Storage**
   - Record actual audio blobs
   - Store in cloud (e.g., Vercel Blob)
   - Transcript confidence scores

## Error Handling

The system handles:
- ✅ User already in queue
- ✅ User on cooldown trying to reclaim
- ✅ Empty transcript submission
- ✅ Socket disconnection during speech
- ✅ Browser Web Speech API unavailable
- ✅ MongoDB/Redis connection failures

All errors are communicated back to the client via socket callbacks.

---

**Implementation Status**: Core backend services, socket events, frontend hooks, and UI components are complete. Ready for integration testing and AI scoring pipeline integration.
