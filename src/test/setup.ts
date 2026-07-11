import { afterAll, afterEach, beforeAll } from "vitest";
import { setupServer } from "msw/node";

export const API_BASE_URL = "http://localhost:4000/api";

export const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));

afterEach(() => {
  server.resetHandlers();
  sessionStorage.clear();
});

afterAll(() => server.close());
