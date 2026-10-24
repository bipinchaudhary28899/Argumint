/**
 * RoomHeader — the "Room header" component from the Argumint screens.
 * In-room screens drop the app navigation and keep this bar instead:
 *   [← Leave]  MOTION / text  (status pill)  [CODE ⧉]
 * On mobile the motion wraps onto its own line under the controls.
 */
import { useState } from "react";
import { Icon } from "./Icon";

export type RoomStatusTone = "neutral" | "accent" | "live" | "for" | "against" | "gold";

interface RoomHeaderProps {
  onLeave: () => void;
  leaveLabel?: string;
  /** Motion text; omit to hide the motion block */
  motion?: React.ReactNode;
  motionLabel?: string;
  status?: { label: React.ReactNode; tone?: RoomStatusTone };
  /** Room code shown in the copy chip; omit to hide it */
  code?: string;
  /** Called after the code is copied (in addition to the built-in clipboard write) */
  onCopy?: () => void;
  /** Extra controls rendered before the code chip (e.g. a timer) */
  extra?: React.ReactNode;
  /** Optional second row (tabs, progress, …) */
  children?: React.ReactNode;
}

export function RoomHeader({ onLeave, leaveLabel = "Leave", motion, motionLabel = "Motion", status, code, onCopy, extra, children }: RoomHeaderProps) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    if (!code) return;
    try { await navigator.clipboard?.writeText(code); } catch { /* clipboard may be unavailable */ }
    setCopied(true);
    onCopy?.();
    setTimeout(() => setCopied(false), 1600);
  };

  const tone = status?.tone ?? "neutral";

  return (
    <header className="room-header">
      <div className="room-header-row">
        <button type="button" className="room-header-leave" onClick={onLeave} aria-label={`${leaveLabel} room`}>
          <Icon name="left" size={18} />
          <span className="room-header-leave-label">{leaveLabel}</span>
        </button>

        {motion !== undefined && (
          <div className="room-header-motion">
            <span className="room-header-eyebrow">{motionLabel}</span>
            <span className="room-header-motion-text">{motion}</span>
          </div>
        )}

        {status && (
          <span className={`room-status room-status-${tone}`}>
            <span className="room-status-dot" />
            <span>{status.label}</span>
          </span>
        )}

        {extra}

        {code && (
          <button type="button" className="room-code" onClick={copy} aria-label={`Copy room code ${code}`}>
            {code}
            <span className="room-code-icon">{copied ? <Icon name="check" size={16} /> : <Icon name="copy" size={16} />}</span>
          </button>
        )}
      </div>

      {motion !== undefined && <p className="room-header-motion-mobile">{motion}</p>}
      {children}
    </header>
  );
}
