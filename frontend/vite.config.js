import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // listen on 0.0.0.0 so phones on the same Wi‑Fi can connect
    port: 5173,
    // Allow Cloudflare quick-tunnel addresses (https://*.trycloudflare.com) so phones can open
    // the dev server over HTTPS, which browsers require before they share location.
    allowedHosts: [".trycloudflare.com"],
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8000",
        changeOrigin: true,
      },
    },
  },
});