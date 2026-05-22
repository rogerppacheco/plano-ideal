import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  preview: {
    host: "0.0.0.0",
    port: Number(process.env.PORT) || 4173,
    // Railway usa host *.up.railway.app — sem isso o preview bloqueia o acesso
    allowedHosts: [".up.railway.app", "localhost"],
  },
});
