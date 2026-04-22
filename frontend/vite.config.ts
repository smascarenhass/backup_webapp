import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const processEnv =
  (
    globalThis as {
      process?: {
        env?: Record<string, string | undefined>;
      };
    }
  ).process?.env ?? {};

const apiProxyTarget =
  processEnv.VITE_API_PROXY_TARGET ?? "http://127.0.0.1:8011";

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    proxy: {
      "/api": {
        target: apiProxyTarget,
        changeOrigin: true,
      },
    },
  },
});
