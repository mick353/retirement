import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const fromProject = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  root: fromProject("./github-pages/"),
  base: "/retirement/",
  publicDir: fromProject("./public/"),
  plugins: [react()],
  build: {
    outDir: fromProject("./dist-pages/"),
    emptyOutDir: true,
  },
});
