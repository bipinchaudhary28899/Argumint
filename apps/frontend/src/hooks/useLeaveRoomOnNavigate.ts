import { useEffect, useRef } from "react";
import type { Socket } from "socket.io-client";

/**
 * When this component unmounts, check whether we're still on a page
 * scoped to `/room/${code}/...`. If not — i.e. user clicked the logo,
 * hit the back button, or navigated to /home — emit `room:leave` so
 * they're properly removed from the room participants list.
 *
 * Why we don't just always emit on unmount: navigating between
 * lobby ↔ prep ↔ debate also unmounts the page, but we want the user
 * to stay in the room. The pathname check distinguishes the two cases.
 *
 * Why refs: we want the cleanup to use the *latest* socket / roomId
 * values without re-firing the cleanup every render. With a normal
 * dependency array, the cleanup would fire (and emit room:leave) every
 * time those values changed mid-session.
 */
export function useLeaveRoomOnNavigate(
  code: string | undefined,
  roomId: string | undefined,
  socket: Socket | null,
) {
  const codeRef = useRef(code);
  const roomIdRef = useRef(roomId);
  const socketRef = useRef(socket);

  // Always keep the refs in sync with the latest values.
  useEffect(() => {
    codeRef.current = code;
    roomIdRef.current = roomId;
    socketRef.current = socket;
  });

  // The actual cleanup. Only registered once on mount, fires once on unmount.
  useEffect(() => {
    return () => {
      const c = codeRef.current;
      const rid = roomIdRef.current;
      const s = socketRef.current;
      if (!c || !rid || !s) return;

      // By the time React's cleanup runs, the URL has already been updated
      // by react-router. If the next path is still under this room, the
      // user is just hopping between lobby/prep/debate — keep them in.
      const stillInRoom = window.location.pathname.startsWith(`/room/${c}`);
      if (stillInRoom) return;

      // Best-effort: socket may have already been disconnected by another
      // hook's cleanup (depends on hook ordering). socket.emit on a
      // disconnected socket is silently dropped — we tried.
      try {
        s.emit("room:leave", { roomId: rid });
      } catch {
        /* ignore */
      }
    };
  }, []);
}
