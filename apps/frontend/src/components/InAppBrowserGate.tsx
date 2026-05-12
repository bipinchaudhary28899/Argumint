/**
 * Detects restricted in-app WebViews (WhatsApp, Instagram, TikTok, etc.)
 * that block getUserMedia / mic permissions, and renders a "open in real
 * browser" gate instead of the wrapped children.
 *
 * Usage:
 *   <InAppBrowserGate>
 *     <MyPage />
 *   </InAppBrowserGate>
 */
export function useIsInAppBrowser(): boolean {
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  return (
    /FBAN|FBAV|Instagram|WhatsApp\/|TikTok|Snapchat|Twitter\//.test(ua) ||
    /\bwv\b/.test(ua) || // Android WebView flag
    (/iPhone|iPod|iPad/.test(ua) && !/Safari\//.test(ua) && /AppleWebKit/.test(ua))
  );
}

interface InAppBrowserGateProps {
  children: React.ReactNode;
}

export function InAppBrowserGate({ children }: InAppBrowserGateProps) {
  const isInApp = useIsInAppBrowser();

  if (!isInApp) return <>{children}</>;

  return (
    <div
      className="bg-grid"
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "2rem",
        background: "var(--bg)",
        textAlign: "center",
      }}
    >
      <div className="glass fade-up" style={{ maxWidth: 360, padding: "2.5rem 2rem" }}>
        <div style={{ fontSize: "3rem", marginBottom: "1.25rem" }}>🌐</div>
        <h2
          style={{
            fontSize: "1.4rem",
            fontWeight: 900,
            color: "var(--text)",
            margin: "0 0 0.875rem",
            letterSpacing: "-0.02em",
          }}
        >
          Open in your browser
        </h2>
        <p
          style={{
            color: "var(--muted)",
            fontSize: "0.9rem",
            lineHeight: 1.65,
            margin: "0 0 1.75rem",
          }}
        >
          Argumint needs microphone access to work. WhatsApp and other in-app
          browsers block mic permissions — please open this link in{" "}
          <strong style={{ color: "var(--text)" }}>Chrome</strong> or{" "}
          <strong style={{ color: "var(--text)" }}>Safari</strong>.
        </p>
        <button
          className="btn-primary"
          style={{ width: "100%", fontSize: "1rem", padding: "0.875rem" }}
          onClick={() => {
            window.location.href = window.location.href;
          }}
        >
          Open in Browser
        </button>
        <p style={{ marginTop: "1rem", color: "var(--muted)", fontSize: "0.75rem" }}>
          Copy this URL and paste it into Chrome or Safari if the button doesn't work.
        </p>
        <div
          style={{
            marginTop: "0.5rem",
            padding: "0.5rem 0.75rem",
            background: "var(--bg2)",
            borderRadius: "0.5rem",
            fontSize: "0.72rem",
            color: "var(--subtle)",
            wordBreak: "break-all",
            fontFamily: "'JetBrains Mono', monospace",
          }}
        >
          {window.location.href}
        </div>
      </div>
    </div>
  );
}
