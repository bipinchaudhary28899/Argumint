/**
 * ProWelcomeModal.test.tsx
 *
 * Tests for the multi-slide Pro feature tour modal shown once per user after
 * upgrading to Pro.
 *
 * Covers: initial render, slide navigation (Next/Back/dots), dismiss paths
 * (X button, backdrop click), localStorage flag, last-slide CTA, progress bar,
 * slide counter, and navigate-to-create-room on completion.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import React from "react";
import { ProWelcomeModal } from "../ProWelcomeModal";

// ── Mock react-router-dom navigate ────────────────────────────────────────────

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => mockNavigate };
});

// ── Helpers ───────────────────────────────────────────────────────────────────

const TOTAL_SLIDES = 5; // Human Judges, Whisper, Buzzer, Voting, Golden Pro Profile

function renderModal(userId = "user-abc", onClose = vi.fn()) {
  return render(
    <MemoryRouter>
      <ProWelcomeModal userId={userId} onClose={onClose} />
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

// ── Initial render ─────────────────────────────────────────────────────────────

describe("ProWelcomeModal — initial render", () => {
  it("renders without crashing", () => {
    expect(() => renderModal()).not.toThrow();
  });

  it("shows the first slide title 'Human Judges'", () => {
    renderModal();
    expect(screen.getByText("Human Judges")).toBeInTheDocument();
  });

  it("shows the slide counter '1 / 5' on first render", () => {
    renderModal();
    expect(screen.getByText("1 / 5")).toBeInTheDocument();
  });

  it("shows 'Pro Features Tour' header text", () => {
    renderModal();
    expect(screen.getByText(/Pro Features Tour/i)).toBeInTheDocument();
  });

  it("shows 'Next feature' button (not 'Done') on slide 1", () => {
    renderModal();
    expect(screen.getByText(/Next feature/i)).toBeInTheDocument();
    expect(screen.queryByText(/Create my first Pro room/i)).not.toBeInTheDocument();
  });

  it("does NOT show 'Back' button on slide 1", () => {
    renderModal();
    expect(screen.queryByText(/← Back/i)).not.toBeInTheDocument();
  });

  it("renders a backdrop (fixed overlay div)", () => {
    const { container } = renderModal();
    const backdrop = container.querySelector('div[style*="position: fixed"][style*="inset: 0"]');
    expect(backdrop).not.toBeNull();
  });

  it("renders the X dismiss button", () => {
    renderModal();
    expect(screen.getByText("✕")).toBeInTheDocument();
  });

  it("renders the slide description for slide 1", () => {
    renderModal();
    expect(screen.getByText(/Add up to unlimited real judges/i)).toBeInTheDocument();
  });

  it("renders tip text for slide 1", () => {
    renderModal();
    expect(screen.getByText(/Enable when creating a room/i)).toBeInTheDocument();
  });
});

// ── Slide navigation — Next ────────────────────────────────────────────────────

describe("ProWelcomeModal — Next navigation", () => {
  it("advances to slide 2 when 'Next feature' is clicked", () => {
    renderModal();
    fireEvent.click(screen.getByText(/Next feature/i));
    expect(screen.getByText("Whisper AI Transcription")).toBeInTheDocument();
    expect(screen.getByText("2 / 5")).toBeInTheDocument();
  });

  it("shows 'Back' button from slide 2 onward", () => {
    renderModal();
    fireEvent.click(screen.getByText(/Next feature/i));
    expect(screen.getByText(/← Back/i)).toBeInTheDocument();
  });

  it("advances through all 5 slides sequentially", () => {
    renderModal();
    const slideTitles = ["Whisper AI Transcription", "Buzzer Mode", "Topic Voting", "Golden Pro Profile"];
    for (const title of slideTitles) {
      fireEvent.click(screen.getByText(/Next feature/i));
      expect(screen.getByText(title)).toBeInTheDocument();
    }
  });

  it("shows the CTA button on the last slide (slide 5)", () => {
    renderModal();
    for (let i = 0; i < TOTAL_SLIDES - 1; i++) {
      fireEvent.click(screen.getByText(/Next feature/i));
    }
    expect(screen.getByText(/Create my first Pro room/i)).toBeInTheDocument();
    expect(screen.queryByText(/Next feature/i)).not.toBeInTheDocument();
  });

  it("shows '5 / 5' counter on the last slide", () => {
    renderModal();
    for (let i = 0; i < TOTAL_SLIDES - 1; i++) {
      fireEvent.click(screen.getByText(/Next feature/i));
    }
    expect(screen.getByText("5 / 5")).toBeInTheDocument();
  });
});

// ── Slide navigation — Back ────────────────────────────────────────────────────

describe("ProWelcomeModal — Back navigation", () => {
  it("goes back to slide 1 when Back is clicked on slide 2", () => {
    renderModal();
    fireEvent.click(screen.getByText(/Next feature/i));
    fireEvent.click(screen.getByText(/← Back/i));
    expect(screen.getByText("Human Judges")).toBeInTheDocument();
    expect(screen.getByText("1 / 5")).toBeInTheDocument();
  });

  it("hides Back button after going back to slide 1", () => {
    renderModal();
    fireEvent.click(screen.getByText(/Next feature/i));
    fireEvent.click(screen.getByText(/← Back/i));
    expect(screen.queryByText(/← Back/i)).not.toBeInTheDocument();
  });

  it("navigates forward then backward correctly across multiple slides", () => {
    renderModal();
    // Go to slide 3
    fireEvent.click(screen.getByText(/Next feature/i));
    fireEvent.click(screen.getByText(/Next feature/i));
    expect(screen.getByText("Buzzer Mode")).toBeInTheDocument();
    // Go back to slide 2
    fireEvent.click(screen.getByText(/← Back/i));
    expect(screen.getByText("Whisper AI Transcription")).toBeInTheDocument();
  });
});

// ── Dot indicator navigation ───────────────────────────────────────────────────

describe("ProWelcomeModal — dot indicator navigation", () => {
  it("renders 5 dot indicator buttons", () => {
    renderModal();
    // Dots are buttons without text content — find them by their role inside the dots container
    // There are 5 + the X close button + navigation buttons; filter by style
    const { container } = renderModal();
    // Dots are rendered inside a flex row — they are <button> elements with no children text
    // We can count them via the dots container which has gap="0.4rem"
    const dots = container.querySelectorAll('button[style*="border-radius: 9999px"]');
    expect(dots.length).toBe(5);
  });

  it("clicking the 3rd dot jumps directly to slide 3 (Buzzer Mode)", () => {
    const { container } = renderModal();
    const dots = container.querySelectorAll('button[style*="border-radius: 9999px"]');
    fireEvent.click(dots[2]); // 0-indexed → slide 3
    expect(screen.getByText("Buzzer Mode")).toBeInTheDocument();
    expect(screen.getByText("3 / 5")).toBeInTheDocument();
  });

  it("clicking the last dot jumps to slide 5 and shows the CTA", () => {
    const { container } = renderModal();
    const dots = container.querySelectorAll('button[style*="border-radius: 9999px"]');
    fireEvent.click(dots[4]); // slide 5
    expect(screen.getByText(/Create my first Pro room/i)).toBeInTheDocument();
  });

  it("clicking the 1st dot from slide 3 returns to slide 1", () => {
    const { container } = renderModal();
    const dots = container.querySelectorAll('button[style*="border-radius: 9999px"]');
    fireEvent.click(dots[2]); // go to slide 3
    fireEvent.click(dots[0]); // back to slide 1
    expect(screen.getByText("Human Judges")).toBeInTheDocument();
  });
});

// ── Dismiss paths ──────────────────────────────────────────────────────────────

describe("ProWelcomeModal — X button dismiss", () => {
  it("calls onClose when X button is clicked", () => {
    const onClose = vi.fn();
    renderModal("u1", onClose);
    fireEvent.click(screen.getByText("✕"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("sets localStorage flag when X button is clicked", () => {
    renderModal("user-xyz");
    fireEvent.click(screen.getByText("✕"));
    expect(localStorage.getItem("proWelcome_user-xyz")).toBe("1");
  });

  it("sets localStorage with the correct userId key", () => {
    renderModal("specific-user-99");
    fireEvent.click(screen.getByText("✕"));
    expect(localStorage.getItem("proWelcome_specific-user-99")).toBe("1");
    expect(localStorage.getItem("proWelcome_wrong-user")).toBeNull();
  });
});

describe("ProWelcomeModal — backdrop dismiss", () => {
  it("calls onClose when the backdrop is clicked", () => {
    const onClose = vi.fn();
    const { container } = render(
      <MemoryRouter>
        <ProWelcomeModal userId="u1" onClose={onClose} />
      </MemoryRouter>
    );
    // The backdrop is the first fixed div with zIndex 50
    const backdrop = container.querySelector('div[style*="z-index: 50"]') as HTMLElement;
    expect(backdrop).not.toBeNull();
    fireEvent.click(backdrop!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("sets localStorage flag when backdrop is clicked", () => {
    const { container } = render(
      <MemoryRouter>
        <ProWelcomeModal userId="backdrop-user" onClose={() => {}} />
      </MemoryRouter>
    );
    const backdrop = container.querySelector('div[style*="z-index: 50"]') as HTMLElement;
    fireEvent.click(backdrop!);
    expect(localStorage.getItem("proWelcome_backdrop-user")).toBe("1");
  });
});

// ── Last-slide CTA ─────────────────────────────────────────────────────────────

describe("ProWelcomeModal — last slide CTA", () => {
  function goToLastSlide() {
    renderModal("cta-user");
    for (let i = 0; i < TOTAL_SLIDES - 1; i++) {
      fireEvent.click(screen.getByText(/Next feature/i));
    }
  }

  it("clicking 'Create my first Pro room' calls onClose", () => {
    const onClose = vi.fn();
    render(<MemoryRouter><ProWelcomeModal userId="u1" onClose={onClose} /></MemoryRouter>);
    for (let i = 0; i < TOTAL_SLIDES - 1; i++) {
      fireEvent.click(screen.getByText(/Next feature/i));
    }
    fireEvent.click(screen.getByText(/Create my first Pro room/i));
    expect(onClose).toHaveBeenCalled();
  });

  it("clicking 'Create my first Pro room' navigates to /create-room", () => {
    render(<MemoryRouter><ProWelcomeModal userId="u1" onClose={() => {}} /></MemoryRouter>);
    for (let i = 0; i < TOTAL_SLIDES - 1; i++) {
      fireEvent.click(screen.getByText(/Next feature/i));
    }
    fireEvent.click(screen.getByText(/Create my first Pro room/i));
    expect(mockNavigate).toHaveBeenCalledWith("/create-room");
  });

  it("sets localStorage flag when CTA is clicked", () => {
    render(<MemoryRouter><ProWelcomeModal userId="cta-user" onClose={() => {}} /></MemoryRouter>);
    for (let i = 0; i < TOTAL_SLIDES - 1; i++) {
      fireEvent.click(screen.getByText(/Next feature/i));
    }
    fireEvent.click(screen.getByText(/Create my first Pro room/i));
    expect(localStorage.getItem("proWelcome_cta-user")).toBe("1");
  });
});

// ── Progress bar ───────────────────────────────────────────────────────────────

describe("ProWelcomeModal — progress bar", () => {
  it("progress bar is at 20% on slide 1 (1/5)", () => {
    const { container } = renderModal();
    // The progress fill div has width set inline
    const fill = container.querySelector('div[style*="linear-gradient(90deg, rgb(245, 158, 11)"]');
    expect(fill).not.toBeNull();
    expect((fill as HTMLElement).style.width).toBe("20%");
  });

  it("progress bar reaches 100% on slide 5", () => {
    const { container } = renderModal();
    for (let i = 0; i < TOTAL_SLIDES - 1; i++) {
      fireEvent.click(screen.getByText(/Next feature/i));
    }
    const fill = container.querySelector('div[style*="linear-gradient(90deg, rgb(245, 158, 11)"]');
    expect((fill as HTMLElement).style.width).toBe("100%");
  });
});

// ── Slide content spot-checks ──────────────────────────────────────────────────

describe("ProWelcomeModal — slide content", () => {
  const slides = [
    { title: "Human Judges",              tag: "NEW"     },
    { title: "Whisper AI Transcription",  tag: "UPGRADE" },
    { title: "Buzzer Mode",               tag: "NEW"     },
    { title: "Topic Voting",              tag: "NEW"     },
    { title: "Golden Pro Profile",        tag: "STYLE"   },
  ];

  slides.forEach(({ title, tag }, idx) => {
    it(`slide ${idx + 1}: renders title "${title}" and tag "${tag}"`, () => {
      renderModal();
      // Navigate to slide
      for (let i = 0; i < idx; i++) fireEvent.click(screen.getByText(/Next feature/i));
      expect(screen.getByText(title)).toBeInTheDocument();
      expect(screen.getAllByText(tag).length).toBeGreaterThan(0);
    });
  });

  it("shows 'How to use:' tip label on every slide", () => {
    renderModal();
    for (let i = 0; i < TOTAL_SLIDES; i++) {
      expect(screen.getByText(/How to use:/i)).toBeInTheDocument();
      if (i < TOTAL_SLIDES - 1) fireEvent.click(screen.getByText(/Next feature/i));
    }
  });
});
