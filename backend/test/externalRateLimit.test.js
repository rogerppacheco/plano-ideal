import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import {
  externalRateLimit,
  resetExternalRateLimitBuckets,
} from "../src/middleware/externalRateLimit.js";

function runMiddleware(middleware, req) {
  return new Promise((resolve) => {
    const res = {
      statusCode: 200,
      headers: {},
      body: null,
      setHeader(name, value) {
        this.headers[name] = value;
      },
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(payload) {
        this.body = payload;
        resolve(this);
      },
    };

    middleware(req, res, () => resolve(res));
  });
}

describe("externalRateLimit", () => {
  beforeEach(() => {
    resetExternalRateLimitBuckets();
  });

  it("bloqueia após exceder o limite e retorna Retry-After", async () => {
    const limiter = externalRateLimit("credit");
    const req = { apiClient: { apiKeyId: 99 } };
    const maxRequests = 10;

    let lastResponse;
    for (let i = 0; i < maxRequests + 1; i += 1) {
      lastResponse = await runMiddleware(limiter, req);
    }

    assert.equal(lastResponse.statusCode, 429);
    assert.equal(lastResponse.body.code, "RATE_LIMITED");
    assert.ok(Number(lastResponse.headers["Retry-After"]) >= 1);
  });

  it("ignora requisições sem apiClient", async () => {
    const limiter = externalRateLimit("coverage");
    const res = await runMiddleware(limiter, {});
    assert.equal(res.statusCode, 200);
  });
});
