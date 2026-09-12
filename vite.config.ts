import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  if (mode === "online" && !env.VITE_API_URL) {
    throw new Error(
      "线上模式需要 VITE_API_URL，请先配置 .env.online.local（参考 .env.online.example）",
    );
  }
  return {
    plugins: [react()],
    server: {
      proxy: {
        "/api": {
          target:
            env.VITE_PROXY_TARGET ||
            process.env.GUANLAN_API_TARGET ||
            env.GUANLAN_API_TARGET ||
            "http://127.0.0.1:3017",
          changeOrigin: true,
        },
      },
    },
  };
});
