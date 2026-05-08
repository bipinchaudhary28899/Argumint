import { useEffect, useRef, useState } from "react";
import type { Socket } from "socket.io-client";

interface PeerInfo {
  socketId: string;
  userId: string;
  username: string;
}

/**
 * Mesh-WebRTC hook for the debate room.
 *
 * Each participant maintains an RTCPeerConnection to every other
 * participant. The "active speaker" is the only one with a sending
 * audio track; everyone else listens.
 *
 * Initiation rule: when two peers discover each other, the one with the
 * lexicographically smaller userId is the offerer. This avoids both
 * sides firing simultaneous offers (glare).
 *
 * Signaling is over Socket.IO using the events `webrtc:offer`,
 * `webrtc:answer`, `webrtc:ice-candidate` (handled by the backend
 * forwarder).
 *
 * Mobile autoplay fix: mobile browsers (iOS Safari, Android Chrome) block
 * audio autoplay until the user has interacted with the page. We call
 * .play() immediately on ontrack, and expose resumeAudio() so the
 * DebatePage can retry from button-press handlers (which count as gestures).
 *
 * Stream sharing: DebatePage acquires the mic once (for MediaRecorder) and
 * passes a getter via `getExternalStream`. WebRTC reuses that stream instead
 * of calling getUserMedia again. This prevents:
 *   - Android Chrome: concurrent getUserMedia + Web Speech API mic conflict
 *     (the infamous "Chrome is recording" toast that blocks speech recognition)
 *   - iOS Safari: two simultaneous getUserMedia calls interfering with each other
 */
export function useWebRTCMesh(opts: {
  socket: Socket | null;
  roomId: string | null;
  selfUserId: string | null;
  /** When true, this client publishes its mic to all peers. */
  isSpeaker: boolean;
  /** The active speaker — used to label which incoming stream to play. */
  activeSpeakerUserId: string | null;
  /**
   * Optional callback that returns an already-acquired MediaStream.
   * When provided and non-null, WebRTC uses this stream instead of calling
   * getUserMedia itself, avoiding a second concurrent mic acquisition.
   */
  getExternalStream?: () => MediaStream | null;
}) {
  const { socket, roomId, selfUserId, isSpeaker, activeSpeakerUserId } = opts;

  // Map: peer socketId -> { pc, userId, audioEl }
  const peersRef = useRef<
    Map<
      string,
      {
        pc: RTCPeerConnection;
        userId: string;
        username: string;
        audioEl: HTMLAudioElement;
      }
    >
  >(new Map());

  const localStreamRef = useRef<MediaStream | null>(null);
  // True when localStreamRef was supplied by the caller (DebatePage) rather
  // than acquired here. External streams must NOT be stopped by this hook.
  const streamIsExternalRef = useRef(false);
  const sendersRef = useRef<Map<string, RTCRtpSender>>(new Map());
  const [micError, setMicError] = useState<string | null>(null);
  const [audioBlocked, setAudioBlocked] = useState(false);
  const [activeRemoteUserId, setActiveRemoteUserId] = useState<string | null>(
    null,
  );

  // Surface whose stream is currently producing audio for the UI's "now speaking" indicator.
  useEffect(() => {
    setActiveRemoteUserId(activeSpeakerUserId);
  }, [activeSpeakerUserId]);

  /**
   * Try to play every peer's audio element. Safe to call multiple times.
   * Should be called from any user-gesture handler so the browser's
   * autoplay gate is lifted for mobile devices.
   */
  const resumeAudio = () => {
    let anyBlocked = false;
    peersRef.current.forEach(({ audioEl }) => {
      if (audioEl.paused && audioEl.srcObject) {
        audioEl.play().catch(() => {
          anyBlocked = true;
          setAudioBlocked(true);
        });
      }
    });
    if (!anyBlocked) setAudioBlocked(false);
  };

  /**
   * Build a fresh RTCPeerConnection for a given peer, wire up event
   * listeners, and store it in the peers map.
   */
  const createPeerConnection = (peer: PeerInfo) => {
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
        // ── TURN relay servers ────────────────────────────────────────────
        // STUN alone cannot traverse carrier-grade NAT (CGNAT) used by mobile
        // networks. Without TURN, WebRTC silently fails on 4G/5G and no audio
        // is ever delivered. These are free public servers from Open Relay /
        // Metered — fine for development. Replace with dedicated credentials
        // (Metered, Twilio, Xirsys) before going to production.
        {
          urls: "turn:openrelay.metered.ca:80",
          username: "openrelayproject",
          credential: "openrelayproject",
        },
        {
          urls: "turn:openrelay.metered.ca:443",
          username: "openrelayproject",
          credential: "openrelayproject",
        },
        {
          urls: "turn:openrelay.metered.ca:443?transport=tcp",
          username: "openrelayproject",
          credential: "openrelayproject",
        },
        {
          urls: "turns:openrelay.metered.ca:443",
          username: "openrelayproject",
          credential: "openrelayproject",
        },
      ],
    });

    // Hidden <audio> element to play this peer's stream.
    const audioEl = document.createElement("audio");
    audioEl.autoplay = true;
    audioEl.playsInline = true;   // Required on iOS to prevent fullscreen takeover
    audioEl.dataset.peerUserId = peer.userId;
    document.body.appendChild(audioEl);

    pc.ontrack = (ev) => {
      // Each peer may send 0 or 1 audio tracks depending on whether
      // they're the speaker. We just always attach the stream.
      const [stream] = ev.streams;
      if (!stream) return;
      audioEl.srcObject = stream;
      // Explicitly call .play() — required on mobile where autoplay is
      // blocked until a user gesture. If it fails here we set audioBlocked
      // so the UI can show a "Tap to hear" prompt.
      audioEl.play().catch(() => {
        setAudioBlocked(true);
      });
    };

    pc.onicecandidate = (ev) => {
      if (ev.candidate && socket) {
        socket.emit("webrtc:ice-candidate", {
          targetSocketId: peer.socketId,
          candidate: ev.candidate,
        });
      }
    };

    pc.onconnectionstatechange = () => {
      if (
        pc.connectionState === "failed" ||
        pc.connectionState === "closed" ||
        pc.connectionState === "disconnected"
      ) {
        // Best-effort cleanup — peer will be re-created on next get-peers.
      }
    };

    peersRef.current.set(peer.socketId, {
      pc,
      userId: peer.userId,
      username: peer.username,
      audioEl,
    });

    return pc;
  };

  const closePeer = (socketId: string) => {
    const entry = peersRef.current.get(socketId);
    if (!entry) return;
    try {
      entry.pc.close();
    } catch {
      /* ignore */
    }
    try {
      entry.audioEl.srcObject = null;
      entry.audioEl.remove();
    } catch {
      /* ignore */
    }
    sendersRef.current.delete(socketId);
    peersRef.current.delete(socketId);
  };

  /**
   * Acquire the user's microphone (once) and cache the stream.
   * Prefers an external stream supplied via getExternalStream() so that
   * only one getUserMedia call is made per speaking turn.
   */
  const acquireMic = async () => {
    if (localStreamRef.current) return localStreamRef.current;

    // Use the caller-supplied stream if one is available. This avoids a second
    // concurrent getUserMedia call which on Android Chrome blocks the Web Speech
    // API and on iOS Safari can cause silent recording failures.
    const ext = opts.getExternalStream?.();
    if (ext) {
      localStreamRef.current = ext;
      streamIsExternalRef.current = true;
      setMicError(null);
      return ext;
    }

    // Fall back to our own getUserMedia (e.g. if DebatePage hasn't acquired yet).
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
        video: false,
      });
      localStreamRef.current = stream;
      streamIsExternalRef.current = false;
      setMicError(null);
      return stream;
    } catch (err: any) {
      const msg = err?.message || "Microphone access denied";
      setMicError(msg);
      throw err;
    }
  };

  const releaseMic = () => {
    // Only stop tracks we own. External streams are owned by DebatePage and
    // will be stopped there when the speaking turn ends.
    if (!streamIsExternalRef.current) {
      const s = localStreamRef.current;
      if (s) s.getTracks().forEach((t) => t.stop());
    }
    localStreamRef.current = null;
    streamIsExternalRef.current = false;
  };

  /**
   * Push the mic track onto every existing peer connection. Idempotent —
   * safe to call multiple times.
   */
  const attachMicToAllPeers = async () => {
    const stream = await acquireMic();
    const [track] = stream.getAudioTracks();
    if (!track) return;
    peersRef.current.forEach((entry, socketId) => {
      const existing = sendersRef.current.get(socketId);
      if (existing) {
        try {
          existing.replaceTrack(track);
          return;
        } catch {
          /* fall through to addTrack */
        }
      }
      const sender = entry.pc.addTrack(track, stream);
      sendersRef.current.set(socketId, sender);
    });
  };

  const detachMicFromAllPeers = () => {
    sendersRef.current.forEach((sender, socketId) => {
      try {
        const entry = peersRef.current.get(socketId);
        if (entry) entry.pc.removeTrack(sender);
      } catch {
        /* ignore */
      }
    });
    sendersRef.current.clear();
    releaseMic();
  };

  // ---- Effect 1: discover peers when we (re)connect to the room ----
  useEffect(() => {
    if (!socket || !roomId || !selfUserId) return;

    let cancelled = false;

    const init = async () => {
      socket.emit(
        "webrtc:get-peers",
        { roomId },
        async (res: { success: boolean; peers?: PeerInfo[] }) => {
          if (cancelled || !res?.success || !res.peers) return;

          for (const peer of res.peers) {
            if (peersRef.current.has(peer.socketId)) continue;
            const pc = createPeerConnection(peer);

            // Lower userId initiates the offer.
            const shouldOffer = selfUserId < peer.userId;
            if (shouldOffer) {
              try {
                const offer = await pc.createOffer({
                  offerToReceiveAudio: true,
                });
                await pc.setLocalDescription(offer);
                socket.emit("webrtc:offer", {
                  targetSocketId: peer.socketId,
                  sdp: offer,
                });
              } catch (err) {
                console.error("[WebRTC] createOffer error:", err);
              }
            }
          }
        },
      );
    };
    init();

    return () => {
      cancelled = true;
    };
  }, [socket, roomId, selfUserId]);

  // ---- Effect 2: handle incoming signaling ----
  useEffect(() => {
    if (!socket) return;

    const onOffer = async (data: {
      fromSocketId: string;
      fromUserId: string;
      fromUsername: string;
      sdp: RTCSessionDescriptionInit;
    }) => {
      let entry = peersRef.current.get(data.fromSocketId);
      if (!entry) {
        const pc = createPeerConnection({
          socketId: data.fromSocketId,
          userId: data.fromUserId,
          username: data.fromUsername,
        });
        entry = peersRef.current.get(data.fromSocketId);
        if (!entry) return;
        // entry just created above; pc is the same reference
        void pc;
      }
      try {
        await entry.pc.setRemoteDescription(
          new RTCSessionDescription(data.sdp),
        );
        const answer = await entry.pc.createAnswer();
        await entry.pc.setLocalDescription(answer);
        socket.emit("webrtc:answer", {
          targetSocketId: data.fromSocketId,
          sdp: answer,
        });

        // If this client is currently speaking, also attach the mic
        // track to the freshly negotiated connection.
        if (isSpeaker) {
          await attachMicToAllPeers();
          // Re-negotiate so the new track is signaled.
          try {
            const renegotiate = await entry.pc.createOffer();
            await entry.pc.setLocalDescription(renegotiate);
            socket.emit("webrtc:offer", {
              targetSocketId: data.fromSocketId,
              sdp: renegotiate,
            });
          } catch {
            /* not all browsers need this; ignore */
          }
        }
      } catch (err) {
        console.error("[WebRTC] onOffer error:", err);
      }
    };

    const onAnswer = async (data: {
      fromSocketId: string;
      sdp: RTCSessionDescriptionInit;
    }) => {
      const entry = peersRef.current.get(data.fromSocketId);
      if (!entry) return;
      try {
        await entry.pc.setRemoteDescription(
          new RTCSessionDescription(data.sdp),
        );
      } catch (err) {
        console.error("[WebRTC] onAnswer error:", err);
      }
    };

    const onIce = async (data: {
      fromSocketId: string;
      candidate: RTCIceCandidateInit;
    }) => {
      const entry = peersRef.current.get(data.fromSocketId);
      if (!entry) return;
      try {
        await entry.pc.addIceCandidate(new RTCIceCandidate(data.candidate));
      } catch (err) {
        // It's normal for some candidates to fail; log at debug level.
        console.debug("[WebRTC] addIceCandidate:", err);
      }
    };

    socket.on("webrtc:offer", onOffer);
    socket.on("webrtc:answer", onAnswer);
    socket.on("webrtc:ice-candidate", onIce);

    return () => {
      socket.off("webrtc:offer", onOffer);
      socket.off("webrtc:answer", onAnswer);
      socket.off("webrtc:ice-candidate", onIce);
    };
    // attachMicToAllPeers reads the latest isSpeaker via closure — re-bind
    // when isSpeaker changes so newly received offers respect the current role.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket, isSpeaker]);

  // ---- Effect 3: when isSpeaker flips, attach/detach mic ----
  useEffect(() => {
    if (!socket) return;
    let cancelled = false;
    const run = async () => {
      if (isSpeaker) {
        try {
          await attachMicToAllPeers();
          if (cancelled) return;
          // Trigger renegotiation per peer so the new track is offered.
          peersRef.current.forEach(async (entry, socketId) => {
            try {
              const offer = await entry.pc.createOffer();
              await entry.pc.setLocalDescription(offer);
              socket.emit("webrtc:offer", {
                targetSocketId: socketId,
                sdp: offer,
              });
            } catch (err) {
              console.error("[WebRTC] renegotiate error:", err);
            }
          });
        } catch {
          /* mic error already surfaced via state */
        }
      } else {
        detachMicFromAllPeers();
      }
    };
    run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSpeaker, socket]);

  // ---- Effect 4: full cleanup on unmount ----
  useEffect(() => {
    return () => {
      peersRef.current.forEach((_, socketId) => closePeer(socketId));
      releaseMic();
    };
  }, []);

  return {
    micError,
    audioBlocked,
    resumeAudio,
    activeRemoteUserId,
  };
}
