/**
 * Icon — 24×24 stroke glyphs from the Argumint design system.
 * Inherits colour from `currentColor`, so set `color` on the parent.
 */

const PATHS = {
  home:    "M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z",
  plus:    "M12 5v14M5 12h14",
  join:    "M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3",
  trophy:  "M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM7 6H4v1a3 3 0 0 0 3 3M17 6h3v1a3 3 0 0 1-3 3",
  scale:   "M12 3v18M7 21h10M5 7h14M5 7l-3 7a3 3 0 0 0 6 0zM19 7l-3 7a3 3 0 0 0 6 0z",
  star:    "M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.6 6.6 19.5l1.2-6L3.3 9.3l6.1-.7z",
  crown:   "M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5z",
  copy:    "M9 9h11v11H9zM5 15H4V4h11v1",
  logout:  "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9",
  user:    "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0",
  bolt:    "M13 2 4 14h7l-1 8 9-12h-7z",
  left:    "M19 12H5M11 6l-6 6 6 6",
  right:   "M5 12h14M13 6l6 6-6 6",
  check:   "M5 12.5l4.5 4.5L19 7",
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 20, style }: { name: IconName; size?: number; style?: React.CSSProperties }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={size > 28 ? 1.6 : 1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ display: "block", flexShrink: 0, ...style }}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
