/**
 * migrate-judge-stats.ts
 *
 * One-time migration: adds the `judgeStats` subdocument with zero-state defaults
 * to every existing User document that doesn't already have it.
 *
 * Run with:
 *   npx ts-node --esm src/scripts/migrate-judge-stats.ts
 * or (if using tsx):
 *   npx tsx src/scripts/migrate-judge-stats.ts
 *
 * Safe to re-run — uses $exists: false so already-migrated docs are skipped.
 */

import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error("❌  MONGODB_URI is not set. Add it to apps/backend/.env");
  process.exit(1);
}

async function run() {
  await mongoose.connect(MONGODB_URI as string);
  console.log("✅  Connected to MongoDB");

  const db = mongoose.connection.db!;
  const users = db.collection("users");

  // Only touch documents that have no judgeStats field at all
  const result = await users.updateMany(
    { judgeStats: { $exists: false } },
    {
      $set: {
        judgeStats: {
          totalSessions:    0,
          credibilityScore: 0,   // starts at 0 — climbs as the judge scores debates
          credibilityBand:  "moderate",
          lastJudgedAt:     null,
        },
      },
    }
  );

  console.log(`📝  Matched: ${result.matchedCount}  |  Modified: ${result.modifiedCount}`);
  console.log("✅  Migration complete");

  await mongoose.disconnect();
}

run().catch(err => {
  console.error("❌  Migration failed:", err);
  process.exit(1);
});
