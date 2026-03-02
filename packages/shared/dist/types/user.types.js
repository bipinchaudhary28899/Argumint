export function toPublicUser(user) {
    return {
        id: user._id.toString(),
        username: user.username,
        email: user.email,
        stats: user.stats,
        createdAt: user.createdAt,
    };
}
