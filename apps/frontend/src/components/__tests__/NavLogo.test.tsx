/**
 * NavLogo.test.tsx
 *
 * Tests for the NavLogo component which renders the Argumint branding image
 * inside either a plain <div> or a <button> wrapper depending on whether an
 * onClick handler is supplied.
 *
 * Logo priority: isGlacier > isPro > default
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import { NavLogo } from "../NavLogo";

// ── Logo source selection ─────────────────────────────────────────────────────

describe("NavLogo — logo src selection", () => {
  it("uses the default logo when no variant props are passed", () => {
    render(<NavLogo />);
    expect(screen.getByRole("img")).toHaveAttribute("src", "/logo/logo.png");
  });

  it("uses the pro logo when isPro=true and isGlacier is not set", () => {
    render(<NavLogo isPro />);
    expect(screen.getByRole("img")).toHaveAttribute("src", "/logo/pro_logo.png");
  });

  it("uses the glacier logo when isGlacier=true", () => {
    render(<NavLogo isGlacier />);
    expect(screen.getByRole("img")).toHaveAttribute("src", "/logo/glacier_logo.png");
  });

  it("glacier takes precedence over isPro when both flags are true", () => {
    render(<NavLogo isPro isGlacier />);
    expect(screen.getByRole("img")).toHaveAttribute("src", "/logo/glacier_logo.png");
  });

  it("uses default logo when isPro=false and isGlacier=false (explicit falsy)", () => {
    render(<NavLogo isPro={false} isGlacier={false} />);
    expect(screen.getByRole("img")).toHaveAttribute("src", "/logo/logo.png");
  });
});

// ── Alt text ──────────────────────────────────────────────────────────────────

describe("NavLogo — accessibility", () => {
  it('img has alt="Argumint"', () => {
    render(<NavLogo />);
    expect(screen.getByRole("img", { name: "Argumint" })).toBeInTheDocument();
  });

  it('img has alt="Argumint" on the pro variant', () => {
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
    // jsdom represents border shorthand differently; test observable behaviour instead
    expect(btn.style.cursor).toBe("pointer");
    expect(btn.style.padding).toBe("0px");
  });

  it("button wraps the logo img correctly", () => {
    render(<NavLogo onClick={() => {}} />);
    const img = screen.getByRole("img", { name: "Argumint" });
    expect(screen.getByRole("button").contains(img)).toBe(true);
  });
});

// ── Wrapper element — without onClick ─────────────────────────────────────────

describe("NavLogo — without onClick (div wrapper)", () => {
  it("does NOT render a <button> when onClick is not provided", () => {
    render(<NavLogo />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("still renders the img when there is no onClick", () => {
    render(<NavLogo />);
    expect(screen.getByRole("img", { name: "Argumint" })).toBeInTheDocument();
  });
});

// ── Combination edge cases ────────────────────────────────────────────────────

describe("NavLogo — edge cases", () => {
  it("renders correctly with onClick + isPro", () => {
    const handleClick = vi.fn();
    render(<NavLogo onClick={handleClick} isPro />);
    expect(screen.getByRole("img")).toHaveAttribute("src", "/logo/pro_logo.png");
    fireEvent.click(screen.getByRole("button"));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it("renders correctly with onClick + isGlacier", () => {
    const handleClick = vi.fn();
    render(<NavLogo onClick={handleClick} isGlacier />);
    expect(screen.getByRole("img")).toHaveAttribute("src", "/logo/glacier_logo.png");
    fireEvent.click(screen.getByRole("button"));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it("img dimensions are 70×70 as specified in styles", () => {
    render(<NavLogo />);
    const img = screen.getByRole("img");
    expect(img.style.width).toBe("70px");
    expect(img.style.height).toBe("70px");
  });
});
