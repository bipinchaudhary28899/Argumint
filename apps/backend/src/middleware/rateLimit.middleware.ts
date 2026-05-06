import rateLimit from "express-rate-limit";

export const loginRateLimiter = rateLimit({
  windowMs: 3 * 60 * 1000, // 3 minutes
  max: 5, // Limit each IP to 5 requests per windowMs
  message: "Too many login attempts, please try again later",
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  skip: (req) => {
    // Skip rate limiting for health checks
    return req.path === "/health";
  },
});
