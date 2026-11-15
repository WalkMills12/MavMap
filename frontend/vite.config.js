import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // listen on 0.0.0.0 so phones on the same Wi‑Fi can connect
    port: 5173,
    // Allow a Cloudflare quick tunnel (https://….trycloudflare.com) so phones get https,
    // which browsers require before sharing GPS. See "GPS on your phone" in the README.
    allowedHosts: [".trycloudflare.com"],
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8000",
        changeOrigin: true,
      },
    },
  },
});