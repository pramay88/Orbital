import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import os from "node:os";

const deviceHostname = os.hostname().toLowerCase();
console.log(deviceHostname)

export default defineConfig({
  plugins: [react()],

  server: {
    host: "0.0.0.0",
    port: 5173,
    strictPort: true,

    allowedHosts: [
      deviceHostname,
      `${deviceHostname}.local`,
      // 'lenovo-loq.local',
    ],

    proxy: {
      "/api": {
        target: "http://127.0.0.1:3001",
        changeOrigin: true,
      },
    },
  },
});
