import { PublicUser } from "./auth.types";
export interface UserDocument {
    _id: string;
    email: string;
    password: string;
    createdAt: Date;
    updatedAt: Date;
}
export interface PublicUserInfo {
    id: string;
    email: string;
    createdAt: Date;
}
export declare function toPublicUser(user: {
    _id: {
        toString(): string;
    };
    email: string;
    createdAt: Date;
}): PublicUser;
