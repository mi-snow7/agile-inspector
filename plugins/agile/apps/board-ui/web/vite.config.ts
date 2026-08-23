import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1", // pin explicitly — without this Vite can end up bound
    // only to the IPv6 loopback (::1) on some systems, so http://127.0.0.1
    // silently fails to connect while http://localhost happens to work.
    port: 5173,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:4174",
        changeOrigin: true,
      },
    },
  },
});
