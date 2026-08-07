import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

// 从 .dev-port 读取动态端口（由 scripts/find-port.mjs 写入），
// 避免 Windows 动态端口排除范围导致的 EACCES。默认回退到 6173。
function readDevPort(): number {
  try {
    const portFile = join(__dirname, ".dev-port");
    if (existsSync(portFile)) {
      return Number(readFileSync(portFile, "utf-8").trim()) || 6173;
    }
  } catch {
    // 忽略，用默认值
  }
  return 6173;
}

const port = readDevPort();

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    host: "127.0.0.1",
    port,
    strictPort: true,
    // 本地开发代理：前端同源请求 /api、/ws 转发到 FastAPI 后端
    proxy: {
      "/api": "http://127.0.0.1:8000",
      "/ws": { target: "ws://127.0.0.1:8000", ws: true },
    },
  },
});
