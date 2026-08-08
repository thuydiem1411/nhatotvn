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
    host: true,
    // Allow any tunnel host (ngrok / nport / etc.). Restricting this often looks like CORS in the browser.
    allowedHosts: true,
    port: 5174,
    cors: true,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:3009",
        changeOrigin: true,
        secure: false,
      },
      // Admin HTML (data-files list/upload/download) is served by server-chotot.js, not Vite.
      "/admin": {
        target: "http://127.0.0.1:3009",
        changeOrigin: true,
        secure: false,
      },
    },
  },
});
