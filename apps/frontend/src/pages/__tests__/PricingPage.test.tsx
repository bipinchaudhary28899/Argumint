import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// ─── Hoisted mocks ────────────────────────────────────────────────────────────
const { mockNavigate, mockOpenCheckout, mockCancelSubscription } = vi.hoisted(() => ({
  mockNavigate:           vi.fn(),
  mockOpenCheckout:       vi.fn(),
  mockCancelSubscription: vi.fn(),
}));

// ─── Module mocks ─────────────────────────────────────────────────────────────
vi.mock("react-router-dom", () => ({
  useNavigate: () => mockNavigate,
}));

let mockUser: any = null;
vi.mock("../../contexts/AuthContext", () => ({
  useAuth: () => ({ user: mockUser }),
}));

let mockSubscription = {
  isPro:            false,
  status:           "inactive" as string,
  currentPeriodEnd: null as Date | null,
  isLoading:        false,
  error:            null as string | null,
  openCheckout:     mockOpenCheckout,
  cancelSubscription: mockCancelSubscription,
};
vi.mock("../../payments/useSubscription", () => ({
  useSubscription: () => mockSubscription,
}));

// The shell pulls in theme/level contexts — stub it so we can assert when it's used
vi.mock("../../components/AppShell", () => ({
  AppShell: ({ active, children }: any) => <div data-testid="app-shell" data-active={active}>{children}</div>,
}));

// ─── Import after mocks ────────────────────────────────────────────────────────
import { PricingPage } from "../PricingPage";

function renderPage() {
  return render(<PricingPage />);
}

// ─── Tests ────────────────────────────────────────────────────────────────────
describe("PricingPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = null;
    mockSubscription = {
      isPro:              false,
      status:             "inactive",
      currentPeriodEnd:   null,
      isLoading:          false,
      error:              null,
      openCheckout:       mockOpenCheckout,
      cancelSubscription: mockCancelSubscription,
    };
    mockOpenCheckout.mockResolvedValue(undefined);
    mockCancelSubscription.mockResolvedValue(undefined);
  });

  // ── Page structure ─────────────────────────────────────────────────────────
  describe("page structure", () => {
    it("renders the Pro headline", () => {
      renderPage();
      expect(screen.getByText("Put a real panel behind the verdict.")).toBeInTheDocument();
    });

    it("renders the ARGUMINT PRO eyebrow", () => {
      renderPage();
      expect(screen.getByText("ARGUMINT PRO")).toBeInTheDocument();
    });

    it("guest view has a Back button (no app shell)", () => {
      renderPage();
      expect(screen.getByRole("button", { name: "Back" })).toBeInTheDocument();
      expect(screen.queryByTestId("app-shell")).not.toBeInTheDocument();
    });

    it("'Back' calls navigate(-1)", () => {
      renderPage();
      fireEvent.click(screen.getByRole("button", { name: "Back" }));
      expect(mockNavigate).toHaveBeenCalledWith(-1);
    });

    it("signed-in view renders inside the app shell with Pro active", () => {
      mockUser = { id: "user-1", username: "alice" };
      renderPage();
      expect(screen.getByTestId("app-shell")).toHaveAttribute("data-active", "pro");
      expect(screen.queryByRole("button", { name: "Back" })).not.toBeInTheDocument();
    });

    it("renders 'POPULAR' badge on Pro card", () => {
      renderPage();
      expect(screen.getByText("POPULAR")).toBeInTheDocument();
    });

    it("renders Razorpay fine print", () => {
      renderPage();
      expect(screen.getByText(/Payments are processed securely by Razorpay/)).toBeInTheDocument();
      expect(screen.getByText(/Secure checkout with Razorpay/)).toBeInTheDocument();
    });

    it("renders the FAQ", () => {
      renderPage();
      expect(screen.getByText("Can I cancel anytime?")).toBeInTheDocument();
      expect(screen.getByText("Do my judges need Pro?")).toBeInTheDocument();
    });
  });

  // ── Free tier ──────────────────────────────────────────────────────────────
  describe("Free tier", () => {
    it("renders '₹0' price", () => {
      renderPage();
      expect(screen.getByText("₹0")).toBeInTheDocument();
    });

    it("renders 'forever' period label", () => {
      renderPage();
      expect(screen.getByText("forever")).toBeInTheDocument();
    });

    it("renders all free feature items", () => {
      renderPage();
      expect(screen.getByText("Ranked debates & XP leaderboard")).toBeInTheDocument();
      expect(screen.getByText("AI scoring after every debate")).toBeInTheDocument();
      expect(screen.getByText("Light, dark, and Glacier theme options")).toBeInTheDocument();
    });

    it("shows 'Get started free' button when no user is logged in", () => {
      mockUser = null;
      renderPage();
      expect(screen.getByText("Get started free")).toBeInTheDocument();
    });

    it("shows 'Current plan' button when user is logged in", () => {
      mockUser = { id: "user-1", username: "alice" };
      renderPage();
      expect(screen.getByText("Current plan")).toBeInTheDocument();
    });

    it("'Get started free' navigates to /register when no user", () => {
      mockUser = null;
      renderPage();
      fireEvent.click(screen.getByText("Get started free"));
      expect(mockNavigate).toHaveBeenCalledWith("/register");
    });

    it("'Current plan' navigates to / when user is logged in", () => {
      mockUser = { id: "user-1", username: "alice" };
      renderPage();
      fireEvent.click(screen.getByText("Current plan"));
      expect(mockNavigate).toHaveBeenCalledWith("/");
    });

    it("does not mark Free as the current plan for a Pro user", () => {
      mockUser = { id: "user-1", username: "alice" };
      mockSubscription.isPro = true;
      mockSubscription.status = "active";
      renderPage();
      expect(screen.queryByText("Current plan")).not.toBeInTheDocument();
      expect(screen.getByText("Included in Pro")).toBeDisabled();
      expect(screen.getByText("YOUR PLAN")).toBeInTheDocument();
    });

    it("'Included in Pro' does not navigate", () => {
      mockUser = { id: "user-1", username: "alice" };
      mockSubscription.isPro = true;
      renderPage();
      fireEvent.click(screen.getByText("Included in Pro"));
      expect(mockNavigate).not.toHaveBeenCalled();
    });
  });

  // ── Pro tier ───────────────────────────────────────────────────────────────
  describe("Pro tier", () => {
    it("renders '₹50' price", () => {
      renderPage();
      expect(screen.getByText("₹50")).toBeInTheDocument();
    });

    it("renders '/ month' period label", () => {
      renderPage();
      expect(screen.getByText("/ month")).toBeInTheDocument();
    });

    it("renders all pro feature items", () => {
      renderPage();
      expect(screen.getByText("Exclusive gold UI & profile badge")).toBeInTheDocument();
      expect(screen.getByText("Buzzer mode for fast-paced debates")).toBeInTheDocument();
      expect(screen.getByText("Detailed AI analysis of your performance")).toBeInTheDocument();
    });
  });

  // ── Upgrade flow (free user) ───────────────────────────────────────────────
  describe("upgrade flow — free user", () => {
    beforeEach(() => {
      mockSubscription.isPro = false;
    });

    it("shows 'Upgrade to Pro' button for non-pro user", () => {
      renderPage();
      expect(screen.getByRole("button", { name: "Upgrade to Pro" })).toBeInTheDocument();
    });

    it("clicking 'Upgrade to Pro' navigates to /login when not logged in", async () => {
      mockUser = null;
      renderPage();
      fireEvent.click(screen.getByRole("button", { name: "Upgrade to Pro" }));
      expect(mockNavigate).toHaveBeenCalledWith("/login");
    });

    it("clicking 'Upgrade to Pro' calls openCheckout when logged in", async () => {
      mockUser = { id: "user-1", username: "alice" };
      renderPage();
      fireEvent.click(screen.getByRole("button", { name: "Upgrade to Pro" }));
      await waitFor(() =>
        expect(mockOpenCheckout).toHaveBeenCalled()
      );
    });

    it("shows 'Opening checkout…' while checkout is loading", () => {
      mockSubscription.isLoading = true;
      renderPage();
      expect(screen.getByText("Opening checkout…")).toBeInTheDocument();
    });

    it("'Upgrade to Pro' button is disabled while loading", () => {
      mockSubscription.isLoading = true;
      renderPage();
      expect(screen.getByText("Opening checkout…")).toBeDisabled();
    });
  });

  // ── Active Pro user ────────────────────────────────────────────────────────
  describe("active Pro user", () => {
    beforeEach(() => {
      mockUser = { id: "user-1", username: "alice" };
      mockSubscription.isPro   = true;
      mockSubscription.status  = "active";
    });

    it("shows 'You're on Pro' label", () => {
      renderPage();
      expect(screen.getByText("You're on Pro")).toBeInTheDocument();
    });

    it("shows 'Cancel subscription' button", () => {
      renderPage();
      expect(screen.getByText("Cancel subscription")).toBeInTheDocument();
    });

    it("does NOT show 'Upgrade to Pro' for active pro", () => {
      renderPage();
      expect(screen.queryByRole("button", { name: "Upgrade to Pro" })).not.toBeInTheDocument();
    });

    it("clicking 'Cancel subscription' calls cancelSubscription()", async () => {
      renderPage();
      fireEvent.click(screen.getByText("Cancel subscription"));
      await waitFor(() =>
        expect(mockCancelSubscription).toHaveBeenCalled()
      );
    });

    it("shows 'Cancelling…' while cancellation is in progress", () => {
      mockSubscription.isLoading = true;
      renderPage();
      expect(screen.getByText("Cancelling…")).toBeInTheDocument();
    });

    it("shows billing period note", () => {
      renderPage();
      expect(screen.getByText(/Access continues until the end of your current billing period/)).toBeInTheDocument();
    });
  });

  // ── Cancelled (still in paid period) ──────────────────────────────────────
  describe("cancelled Pro (within paid period)", () => {
    beforeEach(() => {
      mockUser = { id: "user-1", username: "alice" };
      mockSubscription.isPro   = true;
      mockSubscription.status  = "cancelled";
    });

    it("shows 'Cancellation scheduled' message", () => {
      renderPage();
      expect(screen.getByText("Cancellation scheduled")).toBeInTheDocument();
    });

    it("shows 'You still have Pro access' text", () => {
      renderPage();
      expect(screen.getByText(/You still have Pro access/)).toBeInTheDocument();
    });

    it("shows 'Re-subscribe' button", () => {
      renderPage();
      expect(screen.getByRole("button", { name: "Re-subscribe" })).toBeInTheDocument();
    });

    it("clicking 'Re-subscribe' calls openCheckout when logged in", async () => {
      renderPage();
      fireEvent.click(screen.getByRole("button", { name: "Re-subscribe" }));
      await waitFor(() =>
        expect(mockOpenCheckout).toHaveBeenCalled()
      );
    });

    it("shows the currentPeriodEnd date when provided", () => {
      mockSubscription.currentPeriodEnd = new Date("2024-12-31");
      renderPage();
      expect(screen.getByText(/31 December 2024/)).toBeInTheDocument();
    });

    it("shows fallback text when currentPeriodEnd is null", () => {
      mockSubscription.currentPeriodEnd = null;
      renderPage();
      expect(screen.getByText(/until the end of your billing period/)).toBeInTheDocument();
    });
  });

  // ── Error banner ───────────────────────────────────────────────────────────
  describe("error banner", () => {
    it("shows error message when subscription error exists", () => {
      mockSubscription.error = "Payment gateway unavailable";
      renderPage();
      expect(screen.getByText("Payment gateway unavailable")).toBeInTheDocument();
    });

    it("does not show error banner when no error", () => {
      mockSubscription.error = null;
      renderPage();
      expect(screen.queryByText(/Payment gateway/)).not.toBeInTheDocument();
    });
  });
});
