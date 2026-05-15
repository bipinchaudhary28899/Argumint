import mongoose, { Schema, Document } from "mongoose";
import bcrypt from "bcrypt";

export interface IUser extends Document {
  username: string;
  email: string;
  passwordHash: string;
  xp: number;
  stats: {
    debatesWon: number;
    debatesLost: number;
    totalDebates: number;
  };
  // ── Razorpay / subscription fields ───────────────────────────────────────
  razorpayCustomerId?: string; // Razorpay cust_xxx — created on first checkout
  subscriptionId?: string;     // Razorpay sub_xxx
  subscriptionStatus?: string; // active | authenticated | pending | halted | cancelled | completed
  isPro: boolean;              // fast gate checked by feature guards
  currentPeriodEnd?: Date;     // next billing date (shown in account UI)
  createdAt: Date;
  updatedAt: Date;
  comparePassword(candidatePassword: string): Promise<boolean>;
}

const userSchema = new Schema<IUser>(
  {
    username: {
      type: String,
      required: true,
      minlength: 3,
      maxlength: 30,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    passwordHash: {
      type: String,
      required: true,
      minlength: 8,
    },
    xp: { type: Number, default: 0 },
    stats: {
      debatesWon: { type: Number, default: 0 },
      debatesLost: { type: Number, default: 0 },
      totalDebates: { type: Number, default: 0 },
    },
    // Razorpay fields — all optional so existing documents aren't affected
    razorpayCustomerId: { type: String, default: null },
    subscriptionId:     { type: String, default: null },
    subscriptionStatus: { type: String, default: null },
    isPro:              { type: Boolean, default: false },
    currentPeriodEnd:   { type: Date,   default: null },
  },
  { timestamps: true }
);

// Hash password before saving
userSchema.pre<IUser>("save", async function (next) {
  if (!this.isModified("passwordHash")) {
    return next();
  }

  try {
    const hashed = await bcrypt.hash(this.passwordHash, 10);
    this.passwordHash = hashed;
    next();
  } catch (error) {
    next(error as Error);
  }
});

// Method to compare passwords
userSchema.methods.comparePassword = async function (
  candidatePassword: string
): Promise<boolean> {
  return bcrypt.compare(candidatePassword, this.passwordHash);
};

export const User = mongoose.model<IUser>("User", userSchema);
