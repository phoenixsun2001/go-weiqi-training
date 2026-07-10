/**
 * 兼容层：将旧的 Tauri ipc 接口转发到新的 HTTP api。
 * 前端组件继续用 `import { ipc } from "../lib/ipc"`，无需逐个改。
 */
import { api } from "./api";

// ipc 与 api 的方法签名完全一致（已对齐），直接导出
export const ipc = api;
