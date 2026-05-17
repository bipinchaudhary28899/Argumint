import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";

const { mockNavigate } = vi.hoisted(() => ({ mockNavigate: vi.fn() }));

vi.mock("react-router-dom", () => ({ useNavigate: () => mockNavigate }));

import { SubscriptionCancel } from "../SubscriptionCancel";

beforeEach(() => { vi.clearAllMocks(); });

describe("SubscriptionCancel", () => {
  it("renders the heading", () => {
    render(<SubscriptionCancel />);
    expect(screen.getByText("Subscription cancelled")).toBeInTheDocument();
  });

  it("shows a message about continued Pro access", () => {
    render(<SubscriptionCancel />);
    expect(screen.getByText(/Pro access continues/i)).toBeInTheDocument();
  });

  it("renders View pricing and Go home buttons", () => {
    render(<SubscriptionCancel />);
    expect(screen.getByText("View pricing")).toBeInTheDocument();
    expect(screen.getByText("Go home")).toBeInTheDocument();
  });

  it("navigates to /pricing when View pricing is clicked", () => {
    render(<SubscriptionCancel />);
    fireEvent.click(screen.getByText("View pricing"));
    expect(mockNavigate).toHaveBeenCalledWith("/pricing");
  });

  it("navigates to / when Go home is clicked", () => {
    render(<SubscriptionCancel />);
    fireEvent.click(screen.getByText("Go home"));
    expect(mockNavigate).toHaveBeenCalledWith("/");
  });
});
