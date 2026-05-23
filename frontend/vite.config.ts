import { defineConfig, loadEnv } from "vite";
import vue from "@vitejs/plugin-vue";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const backendTarget = env.VITE_BACKEND_TARGET ?? "http://127.0.0.1:3000";

  const apiProxy = {
    "/api": {
      target: backendTarget,
      changeOrigin: true,
      rewrite: (path: string) => path.replace(/^\/api/, "")
    }
  };

  return {
    plugins: [
      vue({
        template: {
          compilerOptions: {
            isCustomElement: (tag) => tag === "ion-icon"
          }
        }
      })
    ],
    cacheDir: "/tmp/estoque-erp-vite-cache",

    server: {
      host: "0.0.0.0",
      port: 5173,
      strictPort: true,
      allowedHosts: [
        "localhost",
        "127.0.0.1",
        "sueldev.qzz.io"
      ],
      proxy: apiProxy
    },

    preview: {
      host: "0.0.0.0",
      port: 4173,
      strictPort: true,
      allowedHosts: [
        "localhost",
        "127.0.0.1",
        "sueldev.qzz.io"
      ],
      proxy: apiProxy
    }
  };
});
