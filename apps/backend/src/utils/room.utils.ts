import { Room } from "../models/Room.model.js";

/**
 * Generate a unique 6-character room code
 * Format: ABC123 (3 letters + 3 numbers)
 */
export async function generateUniqueRoomCode(): Promise<string> {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  
  while (true) {
    let code = "";
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    
    // Check if code already exists
    const existing = await Room.findOne({ code });
    if (!existing) {
      return code;
    }
  }
}
