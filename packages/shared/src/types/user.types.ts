import { PublicUser } from "./auth.types";

export interface JudgeStats {
  totalSessions: number;
  credibilityScore: number;           // rolling 0–1 (new judges start at 0.75)
  credibilityBand: "strong" | "moderate" | "flagged";
  lastJudgedAt: Date | null;
}

export interface UserDocument {
  _id: string;
  username: string;       // min 3, max 30 chars (enforced at validation layer)
  email: string;          // valid email
  passwordHash: string;   // hashed password
  stats: {
    debatesWon: number;
    debatesLost: number;
    totalDebates: number;
  };
  judgeStats?: JudgeStats;
  // Razorpay fields
  razorpayCustomerId?: string | null;
  subscriptionId?: string | null;
  subscriptionStatus?: string | null;
  isPro?: boolean;
  currentPeriodEnd?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PublicUserInfo {
  id: string;
  username: string;
  email: string;
  xp: number;
  stats: {
    debatesWon: number;
    debatesLost: number;
    totalDebates: number;
  };
  judgeStats: JudgeStats;
  isPro: boolean;
  subscriptionStatus?: string | null;
  currentPeriodEnd?: Date | null;
  createdAt: Date;
}

export function toPublicUser(user: {
  _id: { toString(): string };
  username: string;
  email: string;
  xp?: number;
  stats: {
    debatesWon: number;
    debatesLost: number;
    totalDebates: number;
  };
  judgeStats?: JudgeStats | null;
  isPro?: boolean;
  subscriptionStatus?: string | null;
  currentPeriodEnd?: Date | null;
  createdAt: Date;
}): PublicUserInfo {
  return {
    id: user._id.toString(),
    username: user.username,
    email: user.email,
    xp: user.xp ?? 0,
    stats: user.stats,
    judgeStats: user.judgeStats ?? {
      totalSessions: 0,
      credibilityScore: 0,
      credibilityBand: "moderate",
      lastJudgedAt: null,
    },
    isPro: user.isPro ?? false,
    subscriptionStatus: user.subscriptionStatus ?? null,
    currentPeriodEnd: user.currentPeriodEnd ?? null,
    createdAt: user.createdAt,
  };
}
