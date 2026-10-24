import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";

const { mockNavigate } = vi.hoisted(() => ({ mockNavigate: vi.fn() }));

vi.mock("react-router-dom", () => ({ useNavigate: () => mockNavigate }));

let mockUser: any = null;
vi.mock("../../contexts/AuthContext", () => ({
  useAuth: () => ({ user: mockUser }),
}));

import { SubscriptionCancel } from "../SubscriptionCancel";

beforeEach(() => {
  vi.clearAllMocks();
  mockUser = { id: "user-1", username: "alice", isPro: false };
});

describe("SubscriptionCancel", () => {
  describe("free user (checkout closed)", () => {
    it("renders the Checkout cancelled heading", () => {
      render(<SubscriptionCancel />);
      expect(screen.getByText("Checkout cancelled")).toBeInTheDocument();
    });

    it("says no payment was taken", () => {
      render(<SubscriptionCancel />);
      expect(screen.getByText(/No payment was taken/)).toBeInTheDocument();
    });

    it("navigates to /pricing when Try again is clicked", () => {
      render(<SubscriptionCancel />);
      fireEvent.click(screen.getByRole("button", { name: "Try again" }));
      expect(mockNavigate).toHaveBeenCalledWith("/pricing");
    });

    it("navigates to / when Back to home is clicked", () => {
      render(<SubscriptionCancel />);
      fireEvent.click(screen.getByRole("button", { name: "Back to home" }));
      expect(mockNavigate).toHaveBeenCalledWith("/");
    });
  });

  describe("Pro user (subscription cancelled)", () => {
    beforeEach(() => { mockUser = { id: "user-1", username: "alice", isPro: true }; });

    it("renders the Subscription cancelled heading", () => {
      render(<SubscriptionCancel />);
      expect(screen.getByText("Subscription cancelled")).toBeInTheDocument();
    });

    it("shows a message about continued Pro access", () => {
      render(<SubscriptionCancel />);
      expect(screen.getByText(/Pro access continues/i)).toBeInTheDocument();
    });

    it("navigates to /pricing when View pricing is clicked", () => {
      render(<SubscriptionCancel />);
      fireEvent.click(screen.getByRole("button", { name: "View pricing" }));
      expect(mockNavigate).toHaveBeenCalledWith("/pricing");
    });

    it("navigates to / when Back to home is clicked", () => {
      render(<SubscriptionCancel />);
      fireEvent.click(screen.getByRole("button", { name: "Back to home" }));
      expect(mockNavigate).toHaveBeenCalledWith("/");
    });
  });
});
