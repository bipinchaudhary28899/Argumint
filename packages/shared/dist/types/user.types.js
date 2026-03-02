export function toPublicUser(user) {
    return {
        id: user._id.toString(),
        email: user.email,
        createdAt: user.createdAt,
    };
}
