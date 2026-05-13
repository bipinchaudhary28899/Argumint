/**
 * useReconnectHandler
 *
 * Mount this hook on any room page that needs to survive a socket
 * disconnect/reconnect cycle.  When the socket reconnects, Socket.IO
 * assigns a new socket ID and the server drops all prior room subscriptions,
 * so we need to re-join the server-side channel and re-fetch state.
 *
 * Strategy
 * ─────────
 *   • Lobby  → re-emit `room:join` (re-subscribes to `room:<id>` channel
 *               and returns latest room snapshot)
 *   • Prep / Debate / Result → re-emit `debate:get-state` (re-subscribes
 *               and returns latest debate + room snapshot; timers are
 *               server-derived so they self-correct automatically)
 *
 * The caller provides an `onReconnect` subscriber (from `useSocket`) and a
 * `reconnectFn` that knows what to re-emit.  The hook registers/deregisters
 * cleanly on unmount.
 */
import { useEffect } from "react";

type UnsubFn = () => void;

interface Options {
  /**
   * `onReconnect` from `useSocket()` — registers a callback that fires
   * every time the socket successfully reconnects.
   */
  onReconnect: (fn: () => void) => UnsubFn;
  /**
   * The action to execute when a reconnect happens.
   * Usually: emit `room:join` or `debate:get-state`.
   * Will only be called if the socket is available (guard via closure).
   */
  reconnectFn: () => void;
  /**
   * Set to `false` to disable the handler (e.g., while the socket/room
   * state is still loading for the first time).
   */
  enabled?: boolean;
}

export function useReconnectHandler({ onReconnect, reconnectFn, enabled = true }: Options) {
  useEffect(() => {
    if (!enabled) return;
    const unsub = onReconnect(() => {
      console.info("[useReconnectHandler] socket reconnected — restoring room state");
      reconnectFn();
    });
    return unsub;
    // reconnectFn changes identity on every render; intentionally omit it from
    // deps so we don't re-register on every tick.  The closure captures the
    // latest value via the ref pattern used in callers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onReconnect, enabled]);
}
