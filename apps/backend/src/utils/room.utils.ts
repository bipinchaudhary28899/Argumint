import { Room } from "../models/Room.model.js";

/**
 * Generate a unique 6-character room code.
 * Generates a batch of candidates and checks them in a single DB query,
 * avoiding sequential round-trips on every attempt.
 */
export async function generateUniqueRoomCode(): Promise<string> {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

  const makeCode = () =>
    Array.from({ length: 6 }, () =>
      chars.charAt(Math.floor(Math.random() * chars.length)),
    ).join("");

  for (let attempt = 0; attempt < 5; attempt++) {
    // Generate 8 candidates and check all at once — single DB round-trip
    const candidates = Array.from({ length: 8 }, makeCode);
    const taken = await Room.find(
      { code: { $in: candidates } },
      { code: 1, _id: 0 },
    ).lean();
    const takenSet = new Set(taken.map((r: any) => r.code));
    const available = candidates.find((c) => !takenSet.has(c));
    if (available) return available;
  }

  throw new Error("Could not generate a unique room code — please try again");
}
