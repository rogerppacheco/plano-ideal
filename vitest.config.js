import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    coverage: {
      provider: "v8",
      include: ["src/lib/sessionExit.ts", "src/lib/rbac.ts", "src/services/api.ts"],
      reporter: ["text", "text-summary"],
    },
  },
});
