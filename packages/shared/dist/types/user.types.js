export function toPublicUser(user) {
    return {
        id: user._id.toString(),
        username: user.username,
        email: user.email,
        xp: user.xp ?? 0,
        stats: user.stats,
        createdAt: user.createdAt,
    };
}
