import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import { resolve } from "path";

export default defineConfig({
  root: resolve(__dirname, "src/client"),
  plugins: [react()],
  build: {
    outDir: resolve(__dirname, "public-chotot"),
    emptyOutDir: false,
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:3009",
        changeOrigin: true,
      },
    },
  },
});
