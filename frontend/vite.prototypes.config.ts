import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { defineConfig } from "vite";

// The design prototypes: a standalone page built from the admin's own
// components and styles (see prototypes/PLAN.md).
//
//   npm run dev:prototypes     serve at http://localhost:5174/
//   npm run build:prototypes   static build in prototypes/dist
export default defineConfig({
  root: path.resolve(import.meta.dirname, "prototypes"),
  base: "./",
  plugins: [react(), tailwindcss()],
  server: { port: 5174 },
  build: {
    outDir: path.resolve(import.meta.dirname, "prototypes/dist"),
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
});
