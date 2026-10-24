/**
 * NavLogo.test.tsx
 *
 * Tests for the NavLogo component which renders the ARGUMINT lockup (inline
 * SVG) inside either a plain wrapper or a <button> depending on whether an
 * onClick handler is supplied.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { NavLogo } from "../NavLogo";

// ── Lockup rendering ──────────────────────────────────────────────────────────

describe("NavLogo — lockup", () => {
  it("renders the symbol and the wordmark by default", () => {
    const { container } = render(<NavLogo />);
    expect(container.querySelectorAll("svg")).toHaveLength(2);
  });

  it("renders only the symbol when compact", () => {
    const { container } = render(<NavLogo compact />);
    expect(container.querySelectorAll("svg")).toHaveLength(1);
  });

  it("keeps the Volt half of the symbol fixed", () => {
    const { container } = render(<NavLogo />);
    const fills = Array.from(container.querySelectorAll("path")).map(p => p.getAttribute("fill"));
    expect(fills).toContain("#C8F135");
  });

  it("uses the theme ink token for the left bubble and wordmark", () => {
    const { container } = render(<NavLogo />);
    const fills = Array.from(container.querySelectorAll("path")).map(p => p.getAttribute("fill"));
    expect(fills.filter(f => f?.startsWith("var(--logo-ink")).length).toBe(2);
  });

  it("renders the same mark for Pro and Glacier", () => {
    const a = render(<NavLogo />).container.innerHTML;
    const b = render(<NavLogo isPro isGlacier />).container.innerHTML;
    expect(b).toBe(a);
  });
});

// ── Accessibility ─────────────────────────────────────────────────────────────

describe("NavLogo — accessibility", () => {
  it('has an accessible name of "Argumint"', () => {
    render(<NavLogo />);
    expect(screen.getByRole("img", { name: "Argumint" })).toBeInTheDocument();
  });

  it('keeps the accessible name on the pro variant', () => {
    render(<NavLogo isPro />);
    expect(screen.getByRole("img", { name: "Argumint" })).toBeInTheDocument();
  });
});

// ── Wrapper element — with onClick ────────────────────────────────────────────

describe("NavLogo — with onClick (button wrapper)", () => {
  it("renders a <button> element when onClick is provided", () => {
    render(<NavLogo onClick={() => {}} />);
    expect(screen.getByRole("button")).toBeInTheDocument();
  });

  it("fires the onClick callback when the button is clicked", () => {
    const handleClick = vi.fn();
    render(<NavLogo onClick={handleClick} />);
    fireEvent.click(screen.getByRole("button"));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it("button has cursor:pointer and no padding (style reset)", () => {
    render(<NavLogo onClick={() => {}} />);
    const btn = screen.getByRole("button");
    expect(btn.style.cursor).toBe("pointer");
    expect(btn.style.padding).toBe("0px");
  });

  it("button wraps the logo", () => {
    render(<NavLogo onClick={() => {}} />);
    const img = screen.getByRole("img", { name: "Argumint" });
    expect(screen.getByRole("button").contains(img)).toBe(true);
  });
});

// ── Wrapper element — without onClick ─────────────────────────────────────────

describe("NavLogo — without onClick", () => {
  it("does NOT render a <button> when onClick is not provided", () => {
    render(<NavLogo />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("still renders the logo when there is no onClick", () => {
    render(<NavLogo />);
    expect(screen.getByRole("img", { name: "Argumint" })).toBeInTheDocument();
  });
});

// ── Combination edge cases ────────────────────────────────────────────────────

describe("NavLogo — edge cases", () => {
  it("renders correctly with onClick + isPro", () => {
    const handleClick = vi.fn();
    render(<NavLogo onClick={handleClick} isPro />);
    fireEvent.click(screen.getByRole("button"));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it("renders correctly with onClick + isGlacier", () => {
    const handleClick = vi.fn();
    render(<NavLogo onClick={handleClick} isGlacier />);
    fireEvent.click(screen.getByRole("button"));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });
});
