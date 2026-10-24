/**
 * AppShell — the "App navigation" component from the Argumint screens.
 *   • desktop (≥1100px): 248px sidebar
 *   • tablet  (768–1099): 92px icon rail
 *   • mobile  (<768):     64px top bar + 5-item bottom tab bar
 *
 * Owns the global chrome that used to live in Home's nav: theme picker,
 * dev previews, Go Pro card and logout. Pages render their content as children.
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { getLevelInfo } from "@argumint/shared";
import { useAuth } from "../contexts/AuthContext";
import { useTheme, THEMES } from "../contexts/ThemeContext";
import { BrandLogo, BrandSymbol } from "./BrandLogo";
import { Icon, type IconName } from "./Icon";

export type ShellNavId =
  | "home" | "create" | "join" | "leaderboard" | "history"
  | "judging" | "rewards" | "pro" | null;

const NAV: { id: Exclude<ShellNavId, null>; label: string; short: string; icon: IconName; path: string; tab?: boolean }[] = [
  { id: "home",        label: "Home",              short: "Home",    icon: "home",    path: "/",                  tab: true },
  { id: "create",      label: "Create room",       short: "Create",  icon: "plus",    path: "/create-room",       tab: true },
  { id: "join",        label: "Join room",         short: "Join",    icon: "join",    path: "/join-room",         tab: true },
  { id: "leaderboard", label: "Leaderboard",       short: "Ranks",   icon: "trophy",  path: "/leaderboard",       tab: true },
  { id: "history",     label: "Match history",     short: "History", icon: "history", path: "/history",           tab: true },
  { id: "judging",     label: "Judge credibility", short: "Judging", icon: "scale",   path: "/judge-credibility" },
  { id: "rewards",     label: "Level rewards",     short: "Levels",  icon: "star",    path: "/level-rewards" },
  { id: "pro",         label: "Pro",               short: "Pro",     icon: "crown",   path: "/pricing" },
];

const DEV_EMAIL = "bkumar28899@gmail.com";

/** "Ashish Joshi" → "AJ", "Ashish" → "A" */
export function initials(name?: string | null): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map(p => p[0]!.toUpperCase()).join("") || "?";
}

function ThemeMenu({ onClose, placement }: { onClose: () => void; placement: "up" | "down" }) {
  const { theme, setTheme } = useTheme();
  return (
    <>
      <div className="shell-menu-backdrop" onClick={onClose} />
      <div className={`shell-menu shell-menu-${placement}`} role="menu" aria-label="Theme">
        <div className="shell-menu-title">Theme</div>
        {THEMES.map(t => {
          const active = theme === t.id;
          return (
            <button
              key={t.id}
              role="menuitemradio"
              aria-checked={active}
              className={`shell-menu-item${active ? " is-active" : ""}`}
              onClick={() => { setTheme(t.id); onClose(); }}
            >
              <span style={{ fontSize: 16, lineHeight: 1 }}>{t.icon}</span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span className="shell-menu-label">{t.label}</span>
                <span className="shell-menu-desc">{t.desc}</span>
              </span>
              {active && <Icon name="check" size={15} />}
            </button>
          );
        })}
      </div>
    </>
  );
}

interface AppShellProps {
  active: ShellNavId;
  children: React.ReactNode;
  /** Extra classes on <main> (e.g. to drop default padding) */
  mainClassName?: string;
}

export function AppShell({ active, children, mainClassName }: AppShellProps) {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { meta: themeMeta } = useTheme();
  const [themeOpen, setThemeOpen] = useState<null | "side" | "top">(null);
  const [loggingOut, setLoggingOut] = useState(false);

  const isPro  = (user as any)?.isPro ?? false;
  const isDev  = user?.email === DEV_EMAIL;
  const lvl    = getLevelInfo((user as any)?.xp ?? 0);
  const levelLine = `Lv ${lvl.current.level} · ${lvl.current.title}`;

  const handleLogout = async () => {
    setLoggingOut(true);
    try { await logout(); navigate("/login"); } catch { setLoggingOut(false); }
  };

  const go = (path: string) => navigate(path);

  return (
    <div className="shell">
      <div className="shell-dots" aria-hidden="true" />

      {/* ── Sidebar / rail (≥768px) ── */}
      <aside className="shell-side">
        <nav aria-label="Main" className="shell-side-inner">
          <button className="shell-logo" onClick={() => go("/")} aria-label="Argumint home">
            <span className="shell-logo-full"><BrandLogo height={30} /></span>
            <span className="shell-logo-mark"><BrandSymbol size={36} title="" /></span>
          </button>

          <div className="shell-links">
            {NAV.map(item => {
              const on = item.id === active;
              return (
                <button
                  key={item.id}
                  onClick={() => go(item.path)}
                  aria-current={on ? "page" : undefined}
                  title={item.label}
                  className={`shell-link${on ? " is-active" : ""}`}
                >
                  <Icon name={item.icon} />
                  <span className="shell-link-label">{item.label}</span>
                </button>
              );
            })}
          </div>

          <div className="shell-foot">
            {!isPro && (
              <button className="shell-pro" onClick={() => go("/pricing")}>
                <span className="shell-pro-title"><Icon name="crown" size={18} />GO PRO</span>
                <span className="shell-pro-copy">Seat human judges in your rooms and see how they score.</span>
              </button>
            )}

            {isDev && (
              <div className="shell-dev" aria-label="Dev previews">
                <button title="Preview result page" onClick={() => go("/room/PREVIEW/result/preview")}>🧪</button>
                <button title="Preview debate arena (alternate mode)" onClick={() => go("/room/PREVIEW/debate/preview")}>🎙</button>
                <button title="Preview debate arena (buzzer mode)" onClick={() => go("/room/PREVIEW/debate/preview-buzzer")}>🔔</button>
              </div>
            )}

            <div style={{ position: "relative" }}>
              <button className="shell-theme" onClick={() => setThemeOpen(o => o === "side" ? null : "side")} title="Change theme" aria-haspopup="menu" aria-expanded={themeOpen === "side"}>
                <span style={{ fontSize: 15, lineHeight: 1 }}>{themeMeta.icon}</span>
                <span className="shell-link-label">{themeMeta.label} theme</span>
              </button>
              {themeOpen === "side" && <ThemeMenu placement="up" onClose={() => setThemeOpen(null)} />}
            </div>

            <div className="shell-user">
              <button className="shell-avatar" onClick={() => go("/level-rewards")} title="Profile and rewards">
                {initials(user?.username)}
              </button>
              <div className="shell-user-text">
                <span className="shell-user-name">{user?.username}</span>
                <span className="shell-user-meta">{levelLine}</span>
              </div>
              <button className="shell-logout" onClick={handleLogout} disabled={loggingOut} aria-label="Log out" title="Log out">
                <Icon name="logout" size={18} />
              </button>
            </div>
          </div>
        </nav>
      </aside>

      {/* ── Mobile top bar (<768px) ── */}
      <header className="shell-top">
        <button className="shell-logo" onClick={() => go("/")} aria-label="Argumint home">
          <BrandLogo height={26} />
        </button>
        <span className="shell-top-level">Lv {lvl.current.level}</span>
        <div style={{ position: "relative" }}>
          <button className="shell-top-icon" onClick={() => setThemeOpen(o => o === "top" ? null : "top")} title="Change theme" aria-haspopup="menu" aria-expanded={themeOpen === "top"}>
            <span style={{ fontSize: 16, lineHeight: 1 }}>{themeMeta.icon}</span>
          </button>
          {themeOpen === "top" && <ThemeMenu placement="down" onClose={() => setThemeOpen(null)} />}
        </div>
        <button className="shell-top-icon" onClick={() => go("/level-rewards")} aria-label="Profile and rewards">
          <span className="shell-avatar shell-avatar-sm">{initials(user?.username)}</span>
        </button>
      </header>

      <div className="shell-main-col">
        <main className={`shell-main${mainClassName ? ` ${mainClassName}` : ""}`}>
          {children}
        </main>
      </div>

      {/* ── Mobile tab bar ── */}
      <nav aria-label="Main" className="shell-tabbar">
        {NAV.filter(n => n.tab).map(item => {
          const on = item.id === active;
          return (
            <button
              key={item.id}
              onClick={() => go(item.path)}
              aria-current={on ? "page" : undefined}
              className={`shell-tab${on ? " is-active" : ""}`}
            >
              <Icon name={item.icon} size={22} />
              <span>{item.short}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
