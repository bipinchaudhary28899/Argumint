import { z } from "zod";
export declare const RegisterSchema: z.ZodEffects<z.ZodObject<{
    username: z.ZodString;
    email: z.ZodString;
    password: z.ZodString;
    confirmPassword: z.ZodString;
}, "strip", z.ZodTypeAny, {
    username: string;
    email: string;
    password: string;
    confirmPassword: string;
}, {
    username: string;
    email: string;
    password: string;
    confirmPassword: string;
}>, {
    username: string;
    email: string;
    password: string;
    confirmPassword: string;
}, {
    username: string;
    email: string;
    password: string;
    confirmPassword: string;
}>;
export declare const LoginSchema: z.ZodObject<{
    email: z.ZodString;
    password: z.ZodString;
}, "strip", z.ZodTypeAny, {
    email: string;
    password: string;
}, {
    email: string;
    password: string;
}>;
export declare const AuthResponseSchema: z.ZodObject<{
    user: z.ZodObject<{
        id: z.ZodString;
        username: z.ZodString;
        email: z.ZodString;
        xp: z.ZodDefault<z.ZodNumber>;
        stats: z.ZodObject<{
            debatesWon: z.ZodNumber;
            debatesLost: z.ZodNumber;
            totalDebates: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            debatesWon: number;
            debatesLost: number;
            totalDebates: number;
        }, {
            debatesWon: number;
            debatesLost: number;
            totalDebates: number;
        }>;
        createdAt: z.ZodDate;
    }, "strip", z.ZodTypeAny, {
        username: string;
        email: string;
        id: string;
        xp: number;
        stats: {
            debatesWon: number;
            debatesLost: number;
            totalDebates: number;
        };
        createdAt: Date;
    }, {
        username: string;
        email: string;
        id: string;
        stats: {
            debatesWon: number;
            debatesLost: number;
            totalDebates: number;
        };
        createdAt: Date;
        xp?: number | undefined;
    }>;
    token: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    user: {
        username: string;
        email: string;
        id: string;
        xp: number;
        stats: {
            debatesWon: number;
            debatesLost: number;
            totalDebates: number;
        };
        createdAt: Date;
    };
    token?: string | undefined;
}, {
    user: {
        username: string;
        email: string;
        id: string;
        stats: {
            debatesWon: number;
            debatesLost: number;
            totalDebates: number;
        };
        createdAt: Date;
        xp?: number | undefined;
    };
    token?: string | undefined;
}>;
export declare const UserSchema: z.ZodObject<{
    id: z.ZodString;
    username: z.ZodString;
    email: z.ZodString;
    passwordHash: z.ZodString;
    stats: z.ZodObject<{
        debatesWon: z.ZodNumber;
        debatesLost: z.ZodNumber;
        totalDebates: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        debatesWon: number;
        debatesLost: number;
        totalDebates: number;
    }, {
        debatesWon: number;
        debatesLost: number;
        totalDebates: number;
    }>;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
}, "strip", z.ZodTypeAny, {
    username: string;
    email: string;
    id: string;
    stats: {
        debatesWon: number;
        debatesLost: number;
        totalDebates: number;
    };
    createdAt: Date;
    passwordHash: string;
    updatedAt: Date;
}, {
    username: string;
    email: string;
    id: string;
    stats: {
        debatesWon: number;
        debatesLost: number;
        totalDebates: number;
    };
    createdAt: Date;
    passwordHash: string;
    updatedAt: Date;
}>;
export declare const PublicUserSchema: z.ZodObject<{
    id: z.ZodString;
    username: z.ZodString;
    email: z.ZodString;
    xp: z.ZodDefault<z.ZodNumber>;
    stats: z.ZodObject<{
        debatesWon: z.ZodNumber;
        debatesLost: z.ZodNumber;
        totalDebates: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        debatesWon: number;
        debatesLost: number;
        totalDebates: number;
    }, {
        debatesWon: number;
        debatesLost: number;
        totalDebates: number;
    }>;
    createdAt: z.ZodDate;
}, "strip", z.ZodTypeAny, {
    username: string;
    email: string;
    id: string;
    xp: number;
    stats: {
        debatesWon: number;
        debatesLost: number;
        totalDebates: number;
    };
    createdAt: Date;
}, {
    username: string;
    email: string;
    id: string;
    stats: {
        debatesWon: number;
        debatesLost: number;
        totalDebates: number;
    };
    createdAt: Date;
    xp?: number | undefined;
}>;
export type RegisterInput = z.infer<typeof RegisterSchema>;
export type RegisterRequest = Omit<RegisterInput, "confirmPassword">;
export type LoginInput = z.infer<typeof LoginSchema>;
export type AuthResponse = z.infer<typeof AuthResponseSchema>;
export type User = z.infer<typeof UserSchema>;
export type PublicUser = z.infer<typeof PublicUserSchema>;
