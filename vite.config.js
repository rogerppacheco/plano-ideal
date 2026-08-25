import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { prerenderPublicPages } from "./scripts/vite-plugin-prerender-public.js";

export default defineConfig({
  plugins: [react(), prerenderPublicPages()],
  preview: {
    host: "0.0.0.0",
    port: Number(process.env.PORT) || 4173,
    // Railway e domínio customizado — sem isso o preview bloqueia o Host
    allowedHosts: [
      ".up.railway.app",
      "localhost",
      "fibraaqui.com.br",
      "www.fibraaqui.com.br",
      ".fibraaqui.com.br",
    ],
  },
});
