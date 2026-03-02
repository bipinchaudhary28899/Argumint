import { z } from "zod";
export declare const RegisterSchema: z.ZodEffects<z.ZodObject<{
    email: z.ZodString;
    password: z.ZodString;
    confirmPassword: z.ZodString;
}, "strip", z.ZodTypeAny, {
    email: string;
    password: string;
    confirmPassword: string;
}, {
    email: string;
    password: string;
    confirmPassword: string;
}>, {
    email: string;
    password: string;
    confirmPassword: string;
}, {
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
        email: z.ZodString;
        createdAt: z.ZodDate;
    }, "strip", z.ZodTypeAny, {
        email: string;
        id: string;
        createdAt: Date;
    }, {
        email: string;
        id: string;
        createdAt: Date;
    }>;
}, "strip", z.ZodTypeAny, {
    user: {
        email: string;
        id: string;
        createdAt: Date;
    };
}, {
    user: {
        email: string;
        id: string;
        createdAt: Date;
    };
}>;
export declare const UserSchema: z.ZodObject<{
    id: z.ZodString;
    email: z.ZodString;
    password: z.ZodString;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
}, "strip", z.ZodTypeAny, {
    email: string;
    password: string;
    id: string;
    createdAt: Date;
    updatedAt: Date;
}, {
    email: string;
    password: string;
    id: string;
    createdAt: Date;
    updatedAt: Date;
}>;
export declare const PublicUserSchema: z.ZodObject<{
    id: z.ZodString;
    email: z.ZodString;
    createdAt: z.ZodDate;
}, "strip", z.ZodTypeAny, {
    email: string;
    id: string;
    createdAt: Date;
}, {
    email: string;
    id: string;
    createdAt: Date;
}>;
export type RegisterInput = z.infer<typeof RegisterSchema>;
export type RegisterRequest = Omit<RegisterInput, "confirmPassword">;
export type LoginInput = z.infer<typeof LoginSchema>;
export type AuthResponse = z.infer<typeof AuthResponseSchema>;
export type User = z.infer<typeof UserSchema>;
export type PublicUser = z.infer<typeof PublicUserSchema>;
