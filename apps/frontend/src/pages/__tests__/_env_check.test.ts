import { describe, it, expect } from "vitest";
describe("env check", () => {
  it("has sessionStorage", () => {
    expect(typeof sessionStorage).toBe("object");
  });
  it("has localStorage", () => {
    expect(typeof localStorage).toBe("object");
  });
  it("has window", () => {
    expect(typeof window).toBe("object");
  });
});
