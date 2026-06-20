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
- ✅ **可调难度对战（已接入 KataGo）**：选择执色、难度（业余1~5段）、启动引擎后 AI 自动应手；难度通过 `kata-set-param maxVisits` 实时调整
- ✅ 复盘分析管线（胜率提取 / 失误分类 Good/Inaccuracy/Blunder / 逐手分析）
- ✅ 对战主界面（落子 / 虚手 / 新局 / AI 对手开关 / 难度选择 / 棋力显示）
- ✅ **针对性题库训练（弱点驱动）**：按用户棋力（段位+1）出题，优先出弱点分类的题；含作答判定、解析、错题本、弱点统计面板
- ✅ 复盘界面与胜率曲线组件

### 使用 AI 对手

1. 在「对战」页勾选"启用 KataGo AI 对手"
2. 填写本地 KataGo 可执行文件路径（如 `C:/katago/katago.exe`）与启动参数（如 `gtp -model model.bin`）
3. 选择执色与难度（业余 1~5 段）
4. 点击"启动引擎"，绿字提示"引擎运行中"即可开始对弈，AI 会自动应手

## 待实现（后续阶段）

- 猜棋训练模块
- 棋力面板（评级历史曲线）
- KataGo 引擎首次下载向导（目前需手动指定路径）

## 测试

```bash
cd src-tauri && cargo test
```

后端单元测试覆盖：坐标转换、棋局规则（提子/劫/自杀）、SGF 解析导出、Elo 评级、SQLite 存储、GTP 协议解析、对手难度映射、复盘胜率提取与失误分类。
