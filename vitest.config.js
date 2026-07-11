import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.js"],
    coverage: {
      provider: "v8",
      include: ["src/lib/sessionExit.js", "src/lib/rbac.js", "src/services/api.js"],
      reporter: ["text", "text-summary"],
    },
  },
});
