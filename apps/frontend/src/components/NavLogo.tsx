/**
 * NavLogo — renders the Argumint logo image inside a small dark pill
 * that looks clean on both the white nav bar and dark page backgrounds.
 *
 * Use as a drop-in replacement for the "ARGUMINT" text span/button in
 * every nav. Pass onClick for pages where the logo navigates home.
 *
 * Logo priority: glacier > pro > default
 */
export function NavLogo({ onClick, isPro, isGlacier }: { onClick?: () => void; isPro?: boolean; isGlacier?: boolean }) {
  const src = isGlacier
    ? "/logo/glacier_logo.png"
    : isPro
      ? "/logo/pro_logo.png"
      : "/logo/logo.png";

  const inner = (
    <div style={{ backgroundColor: "transparent" }}>
      <img
        src={src}
        alt="Argumint"
        style={{ width: 70, height: 70, borderRadius: "0.25rem", objectFit: "contain", display: "block" }}
      />
    </div>
  );

  if (onClick) {
    return (
      <button
        onClick={onClick}
        style={{ background: "none", border: "none", padding: 0, cursor: "pointer", lineHeight: 0 }}
      >
        {inner}
      </button>
    );
  }
  return inner;
}
