import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const root = path.dirname(fileURLToPath(import.meta.url));

/** HTML + 资源文件；通过 config.js / 设置页配置 HTTPS 在线 API */
export default defineConfig({
  root,
  base: "./",
  plugins: [react(), tailwindcss()],
  define: {
    "process.env.NEXT_PUBLIC_STATIC_HTML": JSON.stringify("1"),
    "process.env.NODE_ENV": JSON.stringify("production"),
  },
  resolve: {
    alias: {
      "@": path.resolve(root, "src"),
      "next/link": path.resolve(root, "src/shims/next-link.tsx"),
      "next/navigation": path.resolve(root, "src/shims/next-navigation.ts"),
      "next/font/google": path.resolve(root, "src/shims/next-font.ts"),
      "server-only": path.resolve(root, "src/shims/server-only.ts"),
    },
  },
  build: {
    outDir: path.resolve(root, "release/jingxu-html"),
    emptyOutDir: true,
    assetsDir: "assets",
    cssCodeSplit: false,
    rollupOptions: {
      input: path.resolve(root, "index.html"),
      output: {
        entryFileNames: "assets/[name]-[hash].js",
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",
      },
    },
  },
});
