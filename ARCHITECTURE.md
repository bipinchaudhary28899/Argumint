# Debate Room Architecture Diagram

## System Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         CLIENT (Frontend)                            │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                    Page/Container                           │   │
│  │  (RoomDetail, RoomPage, etc.)                             │   │
│  └────────────────────┬────────────────────────────────────────┘   │
│                       │ Mounts with props:                          │
│                       │ debateId, roomId, userId, username          │
│                       ▼                                              │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │              <DebateRoom /> Component                       │   │
│  │  (Main orchestrator - manages all state)                   │   │
│  └──────┬─────────────────────────────────────────┬────────────┘   │
│         │                                          │                │
│    Uses Hooks:                            Renders Sub-components:  │
│    ├─ useSocket()                         ├─ MicControl           │
│    ├─ useWebSpeech()                      ├─ TranscriptDisplay    │
│    ├─ useDebateTimer()                    ├─ SpeakerTimer         │
│    └─ useDebateSocket()                   └─ ArgumentHistory      │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
         │                                            │
         │ Socket.IO Events                          │
         │ (debate:start, claim-mic, etc.)          │
         │                                            │ Browser Web
         │                                            │ Speech API
         ▼                                            ▼
┌─────────────────────────────────────────────────────────────────────┐
│                   SERVER (Backend)                                   │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │               Socket.IO Event Handlers                         │ │
│  │  debate:start, debate:claim-mic, debate:release-mic, etc.    │ │
│  └──────────────────┬─────────────────────────────────────────────┘ │
│                     │                                                │
│                     ▼                                                │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │              Service Layer                                     │ │
│  │                                                                │ │
│  │  ┌──────────────────────┐      ┌──────────────────────┐      │ │
│  │  │  DebateService       │      │  TurnManagerService  │      │ │
│  │  │  ─────────────────   │      │  ──────────────────  │      │ │
│  │  │ • createDebate()     │      │ • addToQueue()       │      │ │
│  │  │ • claimMic()         │      │ • getNextFromQueue() │      │ │
│  │  │ • releaseMic()       │      │ • setCooldown()      │      │ │
│  │  │ • moveToNextRound()  │      │ • isOnCooldown()     │      │ │
│  │  │ • endDebate()        │      │ • notifyMicAvailable │      │ │
│  │  │ • getArguments...()  │      │ • startMicCountdown()│      │ │
│  │  │ • updateArgumentScore│      │                      │      │ │
│  │  └──────────┬───────────┘      └────────┬─────────────┘      │ │
│  │             │                           │                     │ │
│  └─────────────┼───────────────────────────┼─────────────────────┘ │
│                │                           │                        │
│        MongoDB │                    Redis │                        │
│                ▼                           ▼                        │
│  ┌──────────────────────────┐  ┌──────────────────────────┐       │
│  │    MongoDB Database      │  │   Redis Cache/Queue      │       │
│  │  ────────────────────    │  │  ─────────────────────   │       │
│  │                          │  │                          │       │
│  │  Debate Collection:      │  │  debate:queue:{id}       │       │
│  │  {                       │  │  debate:cooldown:{...}   │       │
│  │    _id: ObjectId         │  │                          │       │
│  │    roomId: string        │  │  (TTL: 5-15 minutes)     │       │
│  │    topic: string         │  │                          │       │
│  │    status: string        │  │                          │       │
│  │    currentRoundNumber: n │  │                          │       │
│  │    rounds: [             │  │                          │       │
│  │      {                   │  │                          │       │
│  │        roundNumber: n    │  │                          │       │
│  │        currentSpeaker    │  │                          │       │
│  │        speakersInRound   │  │                          │       │
│  │        maxDuration       │  │                          │       │
│  │        status: "string"  │  │                          │       │
│  │      }                   │  │                          │       │
│  │    ]                     │  │                          │       │
│  │    arguments: [          │  │                          │       │
│  │      {                   │  │                          │       │
│  │        roundNumber: n    │  │                          │       │
│  │        speakerId: string │  │                          │       │
│  │        transcript: string│  │                          │       │
│  │        duration: number  │  │                          │       │
│  │        aiScore: number   │  │                          │       │
│  │        startedAt: Date   │  │                          │       │
│  │        endedAt: Date     │  │                          │       │
│  │      }                   │  │                          │       │
│  │    ]                     │  │                          │       │
│  │  }                       │  │                          │       │
│  └──────────────────────────┘  └──────────────────────────┘       │
│                                                                       │
└─────────────────────────────────────────────────────────────────────┘
```

## Component Hierarchy

```
<Page/Container>
└── <DebateRoom />
    ├── <MicControl />
    │   └── Button: "Claim Mic" / "Recording..."
    │
    ├── <TranscriptDisplay />
    │   ├── Final transcript (black)
    │   ├── Interim transcript (gray)
    │   └── Placeholder
    │
    ├── <SpeakerTimer />
    │   ├── Time remaining (MM:SS)
    │   ├── Progress bar
    │   └── Percentage used
    │
    ├── <ArgumentHistory />
    │   ├── Argument Card 1
    │   │   ├── Speaker name
    │   │   ├── Round number
    │   │   ├── Duration
    │   │   ├── AI score (if available)
    │   │   └── Transcript text
    │   ├── Argument Card 2
    │   └── ...
    │
    └── Buttons
        ├── Finish Speaking
        ├── Next Round
        └── End Debate
```

## Hook Dependencies

```
useSocket
    ↓
useDebateSocket (wrapper for debate-specific socket events)
    ├── uses: useSocket
    └── methods: startDebate, claimMic, releaseMic, nextRound, endDebate, getDebateState

useWebSpeech
    ├── methods: startListening, stopListening, resetTranscript
    └── state: isListening, transcript, interimTranscript, error

useDebateTimer
    ├── methods: startTimer, stopTimer, resetTimer
    └── state: timeRemaining, isRunning, elapsedTime, percentageUsed

DebateRoom (Main component)
    ├── uses: useDebateSocket
    ├── uses: useWebSpeech
    ├── uses: useDebateTimer
    ├── state: currentSpeaker, isUserSpeaking, arguments, roundNumber, debateStatus
    └── listeners: onMicClaimed, onMicReleased, onMicAvailable, onRoundStarted, onDebateFinished
```

## Data Flow: Claiming the Mic

```
User clicks "Claim Mic"
    ↓
handleClaimMic() in DebateRoom
    ↓
useDebateSocket.claimMic({ debateId, roomId })
    ↓
Socket.emit("debate:claim-mic", ...)
    ↓
[SERVER] Socket handler: "debate:claim-mic"
    ↓
DebateService.claimMic()
    ├── Check: not already speaking
    ├── Check: not on cooldown
    ├── Check: not already spoke this round
    ├── Update: currentSpeakerId, status
    └── Save: debate document
    ↓
socket.emit("debate:mic-claimed", {...})
    ↓
[CLIENT] Broadcast received by all in room
    ↓
useDebateSocket.onMicClaimed handler
    ↓
DebateRoom state update:
    ├── setCurrentSpeaker()
    ├── setIsUserSpeaking() [if current user]
    ├── startListening() [useWebSpeech]
    ├── startTimer() [useDebateTimer]
    └── UI updates: show timer, show transcript, disable mic button
```

## Data Flow: Finishing Speech

```
User clicks "Finish Speaking" or timer expires
    ↓
handleFinishSpeaking() in DebateRoom
    ↓
stopListening() [useWebSpeech]
stopTimer() [useDebateTimer]
    ↓
useDebateSocket.releaseMic({
  debateId, roomId, transcript, duration
})
    ↓
Socket.emit("debate:release-mic", ...)
    ↓
[SERVER] Socket handler: "debate:release-mic"
    ↓
DebateService.releaseMic()
    ├── Create: new Argument object
    ├── Save: argument to debate.arguments
    ├── Mark: speakersInRound.push(userId)
    ├── Clear: currentSpeakerId
    ├── Update: status to "waiting"
    └── Save: debate document
    ↓
TurnManagerService.setCooldown()
    ├── Redis: setex(cooldown_key, 5, "true")
    └── Return: socket callback
    ↓
socket.emit("debate:mic-released", {...})
    ↓
[CLIENT] Broadcast received by all
    ↓
useDebateSocket.onMicReleased handler
    ↓
DebateRoom state update:
    ├── Add argument to argumentsHistory
    ├── setCurrentSpeaker(null)
    ├── setIsUserSpeaking(false)
    ├── setShowCooldown(true)
    ├── Start countdown: "Wait 5 seconds..."
    └── UI updates: show cooldown message, re-enable mic button (disabled until cooldown)

After 5 second cooldown:
    ↓
setShowCooldown(false)
    ↓
UI updates: mic button enabled, anyone can claim
```

## Socket Event Sequence Diagram

```
Client                          Server                          Other Clients
  │                              │                                    │
  │──── debate:start ─────────▶  │                                    │
  │                              │ Create debate, init round 1        │
  │                              │ Save to MongoDB                    │
  │  ◀─────callback ────────────│                                    │
  │  {success, debateId}         │                                    │
  │                              │                                    │
  │                              │ ──┐ broadcast:                     │
  │                              │   │ debate:started ────────────▶   │
  │  ◀─── debate:started ────────┘                                   │
  │                                                                   │
  │──── debate:claim-mic ────▶   │                                   │
  │                              │ Validate user                     │
  │                              │ Update currentSpeakerId           │
  │  ◀─────callback ────────────│                                   │
  │  {success, speaker, time}    │                                   │
  │                              │                                   │
  │  [Speaking & recording]      │ ──┐ broadcast:                    │
  │                              │   │ debate:mic-claimed ──────────▶│
  │                              │   │ (Other client sees speaker)   │
  │                              │                                   │
  │  [After 5 seconds/timer]     │                                   │
  │                              │                                   │
  │──── debate:release-mic ───▶  │                                   │
  │     {transcript, duration}   │ Save argument + transcript        │
  │                              │ Set 5-sec cooldown (Redis)        │
  │  ◀─────callback ────────────│                                   │
  │  {success, argumentId}       │                                   │
  │                              │                                   │
  │                              │ ──┐ broadcast:                    │
  │  ◀─── debate:mic-released ──┘   │ debate:mic-released ──────────▶│
  │     {transcript}                │ (Other clients see argument)   │
  │                                │                                │
  │                                │ ──┐ broadcast (after 5s):       │
  │  ◀─ debate:mic-available ──────┘   │ debate:mic-available ─────▶ │
  │                                    │ (Next user can claim)      │
  │                                                                   │
```

## State Machine: Debate Status

```
         ┌─────────────────────────────────┐
         │                                 │
         │           READY                 │
         │   (awaiting start signal)       │
         │                                 │
         └────────────┬────────────────────┘
                      │
                      │ debate:start
                      ▼
         ┌─────────────────────────────────┐
         │                                 │
         │       IN-PROGRESS               │
         │   (debate is active)            │
         │                                 │
         │  States:                        │
         │  • Round N active               │
         │  • Speaker claiming mic         │
         │  • Arguments being stored       │
         │                                 │
         └────────────┬────────────────────┘
                      │
                      │ debate:end
                      ▼
         ┌─────────────────────────────────┐
         │                                 │
         │          FINISHED               │
         │   (debate concluded)            │
         │                                 │
         │  Actions available:             │
         │  • View full transcript         │
         │  • Download results             │
         │  • Share debate                 │
         │                                 │
         └─────────────────────────────────┘
```

## Round State Machine

```
         ┌──────────────────────────────┐
         │         WAITING              │
         │   No one speaking            │
         │   Mic button available       │
         └────────────┬─────────────────┘
                      │
                      │ User clicks "Claim Mic"
                      ▼
         ┌──────────────────────────────┐
         │        SPEAKING              │
         │   User is recording          │
         │   Timer counting down        │
         │   Mic button disabled        │
         └────────────┬─────────────────┘
                      │
                      │ Finish or timer expires
                      ▼
         ┌──────────────────────────────┐
         │       FINISHED               │
         │   Transcript saved           │
         │   Cooldown started (5 sec)   │
         └────────────┬─────────────────┘
                      │
                      │ After 5 seconds → WAITING
                      │ or admin moves → Next round
                      ▼
```

---

This architecture ensures:
- **Scalability**: Redis queues handle concurrent users
- **Reliability**: MongoDB embedded documents for atomicity
- **Real-time**: Socket.IO broadcasts keep everyone synchronized
- **Testability**: Services are decoupled from UI components
- **Maintainability**: Clear separation of concerns and documented flows
