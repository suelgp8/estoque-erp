import { defineConfig, loadEnv } from "vite";
import vue from "@vitejs/plugin-vue";

function parseCsvList(value: string | undefined, fallback: string[]): string[] {
  const items = (value ?? fallback.join(","))
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  return [...new Set(items)];
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const backendTarget = env.VITE_BACKEND_TARGET ?? "http://127.0.0.1:3000";
  const allowedHosts = parseCsvList(env.VITE_ALLOWED_HOSTS, ["localhost", "127.0.0.1", "sueldev.qzz.io"]);
  const apiProxy = {
    "/api": {
      target: backendTarget,
      changeOrigin: true,
      rewrite: (path: string) => path.replace(/^\/api/, "")
    }
  };

  return {
    plugins: [vue()],
    server: {
      host: true,
      port: 5173,
      allowedHosts,
      proxy: apiProxy
    },
    preview: {
      host: true,
      port: 4173,
      allowedHosts,
      proxy: apiProxy
    }
  };
});
