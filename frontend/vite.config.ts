import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "path";
/// <reference types="vitest" />
import type { Plugin } from "vite";
import { defineConfig } from "vitest/config";

/**
 * Fails the build when a lazy chunk imports the entry chunk. Django
 * loads the entry as index.js?v=<version>, so a chunk's plain
 * "./index.js" would be a second copy of the whole app. Modules the
 * entry and a lazy chunk share go to the "shared" chunk instead.
 */
function noEntryImports(): Plugin {
  return {
    name: "dcs-no-entry-imports",
    apply: "build",
    generateBundle(_, bundle) {
      const entries = Object.values(bundle).filter(
        (chunk) => chunk.type === "chunk" && chunk.isEntry,
      );

      for (const chunk of Object.values(bundle)) {
        if (chunk.type !== "chunk" || chunk.isEntry) continue;

        const entry = entries.find((e) => chunk.imports.includes(e.fileName));

        if (entry) {
          this.error(
            `${chunk.fileName} imports the entry chunk ${entry.fileName}; ` +
              "move the modules they share into the shared chunk.",
          );
        }
      }
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), noEntryImports()],
  build: {
    outDir: path.resolve(
      import.meta.dirname,
      "../content_studio/static/content_studio",
    ),
    // Preload links would use absolute /assets/ URLs, which Django does
    // not serve; lazy chunks load relative to index.js without them.
    modulePreload: false,
    rolldownOptions: {
      output: {
        entryFileNames: "assets/[name].js",
        assetFileNames: "assets/[name].[ext]",
        // Lazy chunks (the code editor) must not import the entry: see
        // noEntryImports. The libraries they share with it go here.
        codeSplitting: {
          groups: [
            {
              name: "shared",
              // Keyboard key names: the rich text and code editors.
              test: /node_modules[\\/]w3c-keyname[\\/]/,
            },
          ],
        },
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["src/test/setup.ts"],
  },
});
