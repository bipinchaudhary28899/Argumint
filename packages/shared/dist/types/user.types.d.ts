export interface UserDocument {
    _id: string;
    username: string;
    email: string;
    passwordHash: string;
    stats: {
        debatesWon: number;
        debatesLost: number;
        totalDebates: number;
    };
    createdAt: Date;
    updatedAt: Date;
}
export interface PublicUserInfo {
    id: string;
    username: string;
    email: string;
    stats: {
        debatesWon: number;
        debatesLost: number;
        totalDebates: number;
    };
    createdAt: Date;
}
export declare function toPublicUser(user: {
    _id: {
        toString(): string;
    };
    username: string;
    email: string;
    stats: {
        debatesWon: number;
        debatesLost: number;
        totalDebates: number;
    };
    createdAt: Date;
}): PublicUserInfo;
