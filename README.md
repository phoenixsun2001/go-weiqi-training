# 围棋棋力训练应用

帮助业余 1 段以上棋手提升到业余 5 段或以上的桌面训练应用。

## 技术栈

- **Tauri 2**（Rust 后端 + React/TS 前端）
- **KataGo**（GTP 协议）作为 AI 引擎
- **本地 SQLite** 存储档案 / 对局 / 评级历史

## 架构

- 双 KataGo 子进程角色（分析引擎 / 对手引擎，互不阻塞）
- `game_state` 为单一事实源，前端只渲染不持有规则
- Elo/Glicko 对战胜率跟踪驱动针对性训练
- 完全离线优先

详见 `docs/superpowers/specs/2026-06-20-go-training-app-design.md`。

## 开发

### 前端

```bash
npm install
npm run dev      # 启动开发服务器（端口 1420）
npm run build    # 类型检查 + 生产构建
```

### Rust 后端

```bash
cd src-tauri
cargo test      # 运行单元测试
cargo check     # 类型检查
cargo build     # 构建
```

### 完整桌面应用（需 Rust + Node）

```bash
npm run tauri dev
```

## 已实现模块（MVP）

- ✅ 围棋规则核心（落子 / 提子 / 劫 / 自杀，含单元测试）
- ✅ 坐标转换（GTP <-> 内部，跳过字母 I）
- ✅ SGF 解析与导出
- ✅ Elo 棋力评级与段位映射（1500=1d ... 1900=5d）
- ✅ SQLite 本地存储（档案 / 对局 / 评级历史）
- ✅ KataGo GTP 引擎管理器（进程管理 + 协议解析）
- ✅ 对手引擎与可调难度映射（段位 -> maxVisits）
- ✅ 复盘分析管线（胜率提取 / 失误分类 Good/Inaccuracy/Blunder / 逐手分析）
- ✅ 对战主界面（落子 / 虚手 / 新局 / 棋力显示）
- ✅ 复盘界面与胜率曲线组件

## 待实现（后续阶段）

- KataGo 引擎实际启动与设置界面（首次下载 / 路径配置向导）
- 针对性题库训练模块
- 猜棋训练模块
- 棋力面板（评级历史曲线）

## 测试

```bash
cd src-tauri && cargo test
```

后端单元测试覆盖：坐标转换、棋局规则（提子/劫/自杀）、SGF 解析导出、Elo 评级、SQLite 存储、GTP 协议解析、对手难度映射、复盘胜率提取与失误分类。
