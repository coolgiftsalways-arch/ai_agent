import {
  defineConfig,
} from "vite";

import react from
  "@vitejs/plugin-react";

import path from
  "node:path";


export default defineConfig({
  root:
    path.resolve(
      process.cwd(),
      "src/ui"
    ),

  plugins: [
    react(),
  ],

  server: {
    port: 5173,
    strictPort: true,
  },

  build: {
    outDir:
      path.resolve(
        process.cwd(),
        "dist-ui"
      ),

    emptyOutDir: true,
  },
});