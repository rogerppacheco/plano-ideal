export const EXTERNAL_API_SCOPES = ["coverage", "credit"];

export const EXTERNAL_RATE_LIMITS = {
  coverage: {
    windowMs: 60_000,
    maxRequests: Number(process.env.EXTERNAL_RATE_COVERAGE_PER_MIN || 60),
  },
  credit: {
    windowMs: 60_000,
    maxRequests: Number(process.env.EXTERNAL_RATE_CREDIT_PER_MIN || 10),
  },
};
