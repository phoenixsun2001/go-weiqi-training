#!/usr/bin/env node
// 统一开发启动器：动态探测可用端口，同步更新 .dev-port、tauri.conf.json 的 devUrl，再启动 tauri dev。
// 解决 Windows 动态端口排除范围导致 Vite 绑定 EACCES 的问题。
import net from "node:net";
import { writeFileSync, readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

function tryPort(port) {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once("error", () => resolve(false));
    srv.once("listening", () => srv.close(() => resolve(true)));
    srv.listen(port, "127.0.0.1");
  });
}

async function findPort() {
  const candidates = [
    6173, 6273, 6373, 6573, 6673, 6873, 6973, 7173, 7273, 7373,
    7473, 7573, 7673, 3003, 3100, 4500, 4600, 4700, 4800, 4900,
  ];
  for (const p of candidates) {
    if (await tryPort(p)) return p;
  }
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, "127.0.0.1", () => {
      const port = srv.address().port;
      srv.close(() => resolve(port));
    });
    srv.on("error", reject);
  });
}

const port = await findPort();
console.log(`[dev:tauri] 探测到可用端口 ${port}`);

// 1) 写入 .dev-port 供 vite.config.ts 读取
writeFileSync(join(root, ".dev-port"), String(port));

// 2) 同步更新 tauri.conf.json 的 devUrl（Vite 退出时会复原由 git 管理，不提交）
const confPath = join(root, "src-tauri", "tauri.conf.json");
const conf = JSON.parse(readFileSync(confPath, "utf-8"));
const previousUrl = conf.build.devUrl;
conf.build.devUrl = `http://127.0.0.1:${port}`;
writeFileSync(confPath, JSON.stringify(conf, null, 2) + "\n");
console.log(`[dev:tauri] devUrl -> http://127.0.0.1:${port}`);

// 3) 启动 tauri dev；退出时复原 tauri.conf.json
const tauri = spawn("npx", ["tauri", "dev", ...process.argv.slice(2)], {
  stdio: "inherit",
  shell: true,
});

const restore = () => {
  try {
    const c = JSON.parse(readFileSync(confPath, "utf-8"));
    c.build.devUrl = previousUrl;
    writeFileSync(confPath, JSON.stringify(c, null, 2) + "\n");
  } catch {
    /* ignore */
  }
};
process.on("exit", restore);
process.on("SIGINT", () => { tauri.kill("SIGINT"); process.exit(0); });
process.on("SIGTERM", () => { tauri.kill("SIGTERM"); process.exit(0); });

tauri.on("exit", (code) => process.exit(code ?? 0));
