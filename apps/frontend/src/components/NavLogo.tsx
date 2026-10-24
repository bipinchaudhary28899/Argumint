import { BrandLogo } from "./BrandLogo";

/**
 * NavLogo — the ARGUMINT horizontal lockup for navs and headers.
 *
 * Use as a drop-in replacement for the "ARGUMINT" text span/button in
 * every nav. Pass onClick for pages where the logo navigates home.
 *
 * The lockup follows the active theme through --logo-ink (Charcoal on light
 * surfaces, white on dark); the Volt bubble never changes. isPro / isGlacier
 * are kept for API compatibility — the brand mark is the same on every tier.
 */
export function NavLogo({ onClick, compact }: { onClick?: () => void; isPro?: boolean; isGlacier?: boolean; compact?: boolean }) {
  const inner = <BrandLogo height={28} compact={compact} />;

  if (onClick) {
    return (
      <button
        onClick={onClick}
        aria-label="Argumint home"
        style={{ background: "none", border: "none", padding: 0, cursor: "pointer", lineHeight: 0 }}
      >
        {inner}
      </button>
    );
  }
  return inner;
}
