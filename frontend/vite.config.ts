import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

const backendTarget = process.env.VITE_BACKEND_TARGET ?? "http://127.0.0.1:3000";
const allowedTunnelHosts = [".devtunnels.ms"];
const apiProxy = {
  "/api": {
    target: backendTarget,
    changeOrigin: true,
    rewrite: (path: string) => path.replace(/^\/api/, "")
  }
};

export default defineConfig({
  plugins: [vue()],
  server: {
    host: "0.0.0.0",
    port: 5173,
    allowedHosts: allowedTunnelHosts,
    proxy: apiProxy
  },
  preview: {
    host: "0.0.0.0",
    port: 4173,
    allowedHosts: allowedTunnelHosts,
    proxy: apiProxy
  }
});
