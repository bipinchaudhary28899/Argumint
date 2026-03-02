import { z } from "zod";

export const RegisterSchema = z.object({
  username: z
    .string()
    .min(3, "Username must be at least 3 characters")
    .max(30, "Username cannot exceed 30 characters"),
  email: z.string().email("Invalid email address"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/[a-z]/, "Password must contain at least one lowercase letter")
    .regex(/[0-9]/, "Password must contain at least one number"),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

export const LoginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

export const AuthResponseSchema = z.object({
  user: z.object({
    id: z.string(),
    username: z.string(),
    email: z.string(),
    stats: z.object({
      debatesWon: z.number(),
      debatesLost: z.number(),
      totalDebates: z.number(),
    }),
    createdAt: z.date(),
  }),
  token: z.string().optional(),
});

export const UserSchema = z.object({
  id: z.string(),
  username: z.string(),
  email: z.string(),
  passwordHash: z.string(), // hashed password
  stats: z.object({
    debatesWon: z.number(),
    debatesLost: z.number(),
    totalDebates: z.number(),
  }),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const PublicUserSchema = z.object({
  id: z.string(),
  username: z.string(),
  email: z.string(),
  stats: z.object({
    debatesWon: z.number(),
    debatesLost: z.number(),
    totalDebates: z.number(),
  }),
  createdAt: z.date(),
});

export type RegisterInput = z.infer<typeof RegisterSchema>;
export type RegisterRequest = Omit<RegisterInput, "confirmPassword">;
export type LoginInput = z.infer<typeof LoginSchema>;
export type AuthResponse = z.infer<typeof AuthResponseSchema>;
export type User = z.infer<typeof UserSchema>;
export type PublicUser = z.infer<typeof PublicUserSchema>;
