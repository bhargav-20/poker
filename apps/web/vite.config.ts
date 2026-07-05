import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Minimal typing for the build-time env flag (no @types/node needed).
declare const process: { env: Record<string, string | undefined> };

// On GitHub Pages the app is served from https://<user>.github.io/poker/, so the
// build needs that base path. Local dev/build stays at "/".
export default defineConfig({
  base: process.env.GH_PAGES === "true" ? "/poker/" : "/",
  plugins: [react(), tailwindcss()],
  server: { port: 5173 },
});
