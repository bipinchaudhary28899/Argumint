/**
 * BrandLogo — the ARGUMINT "Rebuttal" mark: two speech bubbles that only make
 * a whole together. Inline SVG so it follows the theme:
 *   • left bubble + wordmark use --logo-ink (Charcoal on light, white on dark)
 *   • right bubble is always Volt (#C8F135) — never recolour it
 *
 * BrandSymbol  — the mark alone (loaders, auth screens, compact navs)
 * BrandLogo    — horizontal lockup (symbol + outlined wordmark)
 */

const VOLT = "#C8F135";

// Master paths from argumint-symbol.svg (viewBox 8.74 14 82.52 72)
const LEFT_BUBBLE  = "M22.51 73.25 A36 36 0 0 1 19.81 30.39 L8.74 20.02 L30.39 19.81 A36 36 0 0 1 73.25 22.51 Z";
const RIGHT_BUBBLE = "M77.49 26.75 A36 36 0 0 1 80.19 69.61 L91.26 79.98 L69.61 80.19 A36 36 0 0 1 26.75 77.49 Z";
// Small-size variant (wider gap and tails) for 16–32 px renders
const LEFT_BUBBLE_SM  = "M22.03 72.67 A36 36 0 0 1 19.47 30.92 L7.12 18.85 L30.92 19.47 A36 36 0 0 1 72.67 22.03 Z";
const RIGHT_BUBBLE_SM = "M77.97 27.33 A36 36 0 0 1 80.53 69.08 L92.88 81.15 L69.08 80.53 A36 36 0 0 1 27.33 77.97 Z";
// Wordmark (Big Shoulders Bold, outlined) from argumint-wordmark-black.svg (viewBox 2.5 0 504.31 100)
const WORDMARK = "M2.5 100 15.44 0H43.75L56.69 100H40.19L37.94 76.88H21.25L19 100ZM22.75 62.69H36.5L34.31 40.81L32.44 14.19H26.75L24.88 40.88Z M68.25 100V0H91.5Q104.13 0 109.75 5.09Q115.38 10.19 115.75 21.88Q115.88 26.12 115.94 29.44Q116 32.75 115.94 35.91Q115.88 39.06 115.75 43Q115.5 50.44 113.19 55.12Q110.88 59.81 106 62.25L117.25 100H100.25L90.88 64.88H84.31V100ZM84.31 50.69H91.5Q95.63 50.69 97.56 48.94Q99.5 47.19 99.69 43.81Q99.88 40 99.94 36.22Q100 32.44 99.94 28.69Q99.88 24.94 99.69 21.12Q99.5 17.62 97.56 15.91Q95.63 14.19 91.5 14.19H84.31Z M154.25 101.12Q145.5 101.12 140.06 98.84Q134.63 96.56 132.03 91.53Q129.44 86.5 129.19 78.38Q129 72.19 128.91 64.97Q128.81 57.75 128.81 50.25Q128.81 42.75 128.91 35.59Q129 28.44 129.19 22.38Q129.5 14 132.09 8.81Q134.69 3.62 140.13 1.25Q145.56 -1.12 154.25 -1.12Q166.94 -1.12 172.66 4.09Q178.38 9.31 179 21.5Q179.19 24.94 179.19 29.03Q179.19 33.12 179 36.62H163Q163.19 32.19 163.19 28.12Q163.19 24.06 163 19.62Q162.75 15.5 160.78 13.78Q158.81 12.06 154.25 12.06Q149.5 12.06 147.5 13.78Q145.5 15.5 145.25 19.62Q144.88 27.06 144.72 34.66Q144.56 42.25 144.56 49.94Q144.56 57.62 144.72 65.22Q144.88 72.81 145.25 80.25Q145.5 84.44 147.5 86.19Q149.5 87.94 154.25 87.94Q159.25 87.94 161.34 86.19Q163.44 84.44 163.81 80.25Q163.88 78.31 163.91 76.03Q163.94 73.75 163.91 71.44Q163.88 69.12 163.81 67.19H156V53.19H179.44Q179.69 59.44 179.63 66Q179.56 72.56 179.31 78.38Q178.81 90.62 173 95.88Q167.19 101.12 154.25 101.12Z M217.5 101.12Q204.25 101.12 198.47 95.88Q192.69 90.62 192.5 78.44Q192.25 58.94 192.25 39.22Q192.25 19.5 192.5 0H208.56Q208.38 13 208.31 26.59Q208.25 40.19 208.34 53.75Q208.44 67.31 208.56 80.38Q208.56 84.06 210.75 85.97Q212.94 87.88 217.5 87.88Q221.94 87.88 224.13 85.97Q226.31 84.06 226.31 80.38Q226.38 67.31 226.47 53.75Q226.56 40.19 226.53 26.59Q226.5 13 226.31 0H242.38Q242.63 19.5 242.66 39.22Q242.69 58.94 242.38 78.44Q242.19 90.62 236.44 95.88Q230.69 101.12 217.5 101.12Z M257.13 100V0H287L294.5 38.81L296.88 85.69H301.75L304 38.81L311.63 0H341.38V100H324.88V69.12L327.75 14.19H322.25L316.63 70.75L309.31 99.88H288.69L282 70.75L276.31 14.19H270.88L273.69 69.12V100Z M357 100V0H373.06V100Z M388.69 100V0H416.06L423 31.81L430.31 85.81H435.81L433 40.62L431.75 0H447.88V100H419.25L412.19 66.31L406.5 14.06H400.81L403.44 61.94L404.75 100Z M474.25 100V14.19H457.63V0H506.81V14.19H490.25V100Z";

interface SymbolProps {
  size?: number;
  className?: string;
  style?: React.CSSProperties;
  /** Accessible name; pass "" to mark as decorative */
  title?: string;
}

export function BrandSymbol({ size = 34, className, style, title = "Argumint" }: SymbolProps) {
  const small = size <= 32;
  return (
    <svg
      viewBox={small ? "7.12 14 85.76 72" : "8.74 14 82.52 72"}
      width={size}
      height={(size * 72) / (small ? 85.76 : 82.52)}
      className={className}
      style={{ display: "block", flexShrink: 0, overflow: "visible", ...style }}
      role={title ? "img" : undefined}
      aria-label={title || undefined}
      aria-hidden={title ? undefined : true}
    >
      <path d={small ? LEFT_BUBBLE_SM : LEFT_BUBBLE} fill="var(--logo-ink, #1F2328)" />
      <path d={small ? RIGHT_BUBBLE_SM : RIGHT_BUBBLE} fill={VOLT} />
    </svg>
  );
}

interface LogoProps {
  /** Height of the symbol in px; the wordmark scales with it */
  height?: number;
  /** Hide the wordmark below this breakpoint by passing compact */
  compact?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

export function BrandLogo({ height = 30, compact = false, className, style }: LogoProps) {
  // Lockup geometry from argumint-lockup-horizontal.svg: symbol 72 tall,
  // wordmark scaled 0.64 (64 tall) and placed 104.4 units from the left.
  const unit = height / 72;
  const symbolW = 82.52 * unit;
  return (
    <span
      className={className}
      style={{ display: "inline-flex", alignItems: "center", gap: 13.66 * unit, lineHeight: 0, ...style }}
      role="img"
      aria-label="Argumint"
    >
      <svg viewBox="8.74 14 82.52 72" width={symbolW} height={height} aria-hidden="true" style={{ display: "block", flexShrink: 0, overflow: "visible" }}>
        <path d={LEFT_BUBBLE} fill="var(--logo-ink, #1F2328)" />
        <path d={RIGHT_BUBBLE} fill={VOLT} />
      </svg>
      {!compact && (
        <svg className="brand-wordmark" viewBox="2.5 0 504.31 100" width={504.31 * 0.64 * unit} height={64 * unit} aria-hidden="true" style={{ display: "block", flexShrink: 0 }}>
          <path d={WORDMARK} fill="var(--logo-ink, #1F2328)" />
        </svg>
      )}
    </span>
  );
}
