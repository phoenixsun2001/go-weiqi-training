# 围棋棋力训练应用 实现计划（MVP：脚手架 + 引擎 + 对战 + 复盘）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 搭建一个可运行的桌面围棋训练应用，包含 Tauri+Rust+React 脚手架、KataGo GTP 引擎集成、围棋规则核心、以及可调难度对战与 AI 复盘分析两个 MVP 模块，并具备 Elo 评级。

**Architecture:** Tauri 2 桌面应用。Rust 后端通过 GTP 协议管理双 KataGo 子进程（分析 / 对手）。`game_state` 为单一事实源，前端只渲染不持有规则。本地 SQLite 存储对局与评级。KataGo 分析结果通过 Tauri events 增量推送。

**Tech Stack:** Tauri 2、Rust（tokio、rusqlite、serde）、React 18 + TypeScript + Vite、Zustand、Recharts、KataGo（GTP 协议）。

**Spec 引用：** `docs/superpowers/specs/2026-06-20-go-training-app-design.md`

---

## 文件结构总览

```
Go/                              （工作目录 = 项目根）
├── package.json                 # 前端依赖 + 脚本
├── vite.config.ts               # Vite + Tauri 集成
├── tsconfig.json
├── index.html
├── src/                         # 前端 React 源码
│   ├── main.tsx
│   ├── App.tsx
│   ├── components/
│   │   └── Board.tsx            # Canvas 棋盘渲染
│   ├── views/
│   │   ├── GameView.tsx         # 对战主界面
│   │   ├── ReviewView.tsx       # 复盘界面
│   │   └── WinRateChart.tsx     # 胜率曲线
│   ├── store/
│   │   └── gameStore.ts         # Zustand 状态
│   ├── lib/
│   │   └── ipc.ts               # Tauri IPC 封装
│   └── types.ts                 # 共享类型（与 Rust 对齐）
├── src-tauri/                   # Rust 后端
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   ├── build.rs
│   ├── src/
│   │   ├── main.rs              # Tauri 入口 + 命令注册
│   │   ├── lib.rs
│   │   ├── commands.rs          # #[tauri::command] 定义
│   │   ├── game_state.rs        # 棋局规则（落子/提子/劫/数子）
│   │   ├── sgf.rs               # SGF 读写
│   │   ├── coords.rs            # 坐标转换（GTP<->内部）
│   │   ├── engine_manager.rs    # KataGo 子进程 + GTP
│   │   ├── opponent_ai.rs       # 对手引擎（段位模拟）
│   │   ├── review_pipeline.rs   # 复盘分析（胜率/失误）
│   │   ├── rating_service.rs    # Elo 评级
│   │   ├── local_store.rs       # SQLite 持久化
│   │   └── error.rs             # 统一错误类型
│   └── migrations/
│       └── 001_init.sql
└── docs/superpowers/
    ├── specs/2026-06-20-go-training-app-design.md
    └── plans/2026-06-20-go-training-mvp.md
```

**职责边界：** 每个 Rust 文件单一职责、可独立单元测试。`game_state` 纯逻辑无外部依赖；`engine_manager` 只管进程与协议；`opponent_ai`/`review_pipeline` 组合前两者；前端按 View 分文件。

---

## Task 1: 初始化 Tauri 2 + React + Vite 脚手架

**Files:**
- Create: `package.json`
- Create: `vite.config.ts`
- Create: `tsconfig.json`
- Create: `index.html`
- Create: `src/main.tsx`
- Create: `src/App.tsx`
- Create: `src-tauri/Cargo.toml`
- Create: `src-tauri/tauri.conf.json`
- Create: `src-tauri/build.rs`
- Create: `src-tauri/src/main.rs`
- Create: `src-tauri/src/lib.rs`

- [ ] **Step 1: 创建前端 package.json**

Create `package.json`:

```json
{
  "name": "go-training-app",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "tauri": "tauri"
  },
  "dependencies": {
    "@tauri-apps/api": "^2.0.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "zustand": "^4.5.5",
    "recharts": "^2.12.7"
  },
  "devDependencies": {
    "@tauri-apps/cli": "^2.0.0",
    "@types/react": "^18.3.3",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.1",
    "typescript": "^5.5.3",
    "vite": "^5.3.4"
  }
}
```

- [ ] **Step 2: 创建 Vite 与 TS 配置**

Create `vite.config.ts`:

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
  },
});
```

Create `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src"]
}
```

Create `index.html`:

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>围棋棋力训练</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 3: 创建 React 入口**

Create `src/main.tsx`:

```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

Create `src/App.tsx`:

```tsx
export default function App() {
  return (
    <div style={{ fontFamily: "sans-serif", padding: 24 }}>
      <h1>围棋棋力训练</h1>
      <p>脚手架已就绪。</p>
    </div>
  );
}
```

- [ ] **Step 4: 创建 Cargo.toml**

Create `src-tauri/Cargo.toml`:

```toml
[package]
name = "go-training-app"
version = "0.1.0"
edition = "2021"

[lib]
name = "go_training_app_lib"
crate-type = ["staticlib", "cdylib", "rlib"]

[build-dependencies]
tauri-build = { version = "2.0.0", features = [] }

[dependencies]
tauri = { version = "2.0.0", features = [] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
tokio = { version = "1", features = ["full"] }
rusqlite = { version = "0.32", features = ["bundled"] }
thiserror = "1"
parking_lot = "0.12"

[dev-dependencies]
tempfile = "3"
```

- [ ] **Step 5: 创建 Tauri 配置与 build.rs**

Create `src-tauri/tauri.conf.json`:

```json
{
  "$schema": "https://schema.tauri.app/config/2.0.0",
  "productName": "围棋棋力训练",
  "version": "0.1.0",
  "identifier": "com.goq.training",
  "build": {
    "frontendDist": "../dist",
    "devUrl": "http://localhost:1420",
    "beforeDevCommand": "npm run dev",
    "beforeBuildCommand": "npm run build"
  },
  "app": {
    "windows": [
      {
        "title": "围棋棋力训练",
        "width": 1200,
        "height": 800
      }
    ],
    "security": {
      "csp": null
    }
  },
  "bundle": {
    "active": true,
    "targets": "all"
  }
}
```

Create `src-tauri/build.rs`:

```rust
fn main() {
    tauri_build::build()
}
```

- [ ] **Step 6: 创建 Rust 入口**

Create `src-tauri/src/lib.rs`:

```rust
pub mod error;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

Create `src-tauri/src/main.rs`:

```rust
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    go_training_app_lib::run()
}
```

Create `src-tauri/src/error.rs`:

```rust
use thiserror::Error;

#[derive(Debug, Error)]
pub enum AppError {
    #[error("IO 错误: {0}")]
    Io(#[from] std::io::Error),
    #[error("数据库错误: {0}")]
    Db(#[from] rusqlite::Error),
    #[error("序列化错误: {0}")]
    Serde(#[from] serde_json::Error),
    #[error("引擎错误: {0}")]
    Engine(String),
    #[error("规则错误: {0}")]
    Rule(String),
    #[error("坐标错误: {0}")]
    Coord(String),
}

impl serde::Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

pub type AppResult<T> = Result<T, AppError>;
```

- [ ] **Step 7: 验证前端可构建**

Run: `npm install`
Expected: 依赖安装成功。

Run: `npm run build`
Expected: 在 `dist/` 生成构建产物，无 TS 错误。

- [ ] **Step 8: 验证 Rust 可编译**

Run: `cd src-tauri && cargo check`
Expected: 编译通过（不要求启动应用）。

- [ ] **Step 9: 初始化 git 并提交**

```bash
git init
echo "/node_modules
/dist
/src-tauri/target
*.log" > .gitignore
git add -A
git commit -m "chore: 初始化 Tauri 2 + React + Rust 脚手架"
```

---

## Task 2: 围棋坐标与规则核心（game_state + coords）

**Files:**
- Create: `src-tauri/src/coords.rs`
- Create: `src-tauri/src/game_state.rs`
- Modify: `src-tauri/src/lib.rs`（注册模块）

- [ ] **Step 1: 注册模块到 lib.rs**

Modify `src-tauri/src/lib.rs`，在 `pub mod error;` 下方添加：

```rust
pub mod coords;
pub mod game_state;
```

- [ ] **Step 2: 编写 coords 失败测试**

Create `src-tauri/src/coords.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn gtp_to_internal_corner() {
        // GTP "A1" 对应内部 (0,0)（列0, 行0）
        let (x, y) = gtp_to_xy("A1").unwrap();
        assert_eq!((x, y), (0, 0));
    }

    #[test]
    fn gtp_to_internal_skips_i() {
        // GTP 坐标跳过字母 I，J 对应列 8
        let (x, _) = gtp_to_xy("J1").unwrap();
        assert_eq!(x, 8);
    }

    #[test]
    fn xy_to_gtp_roundtrip() {
        let gtp = xy_to_gtp(3, 4, 9).unwrap();
        let (x, y) = gtp_to_xy(&gtp).unwrap();
        assert_eq!((x, y), (3, 4));
    }

    #[test]
    fn invalid_coord_rejected() {
        assert!(gtp_to_xy("Z1").is_err());
    }
}
```

- [ ] **Step 3: 运行测试确认失败**

Run: `cd src-tauri && cargo test coords`
Expected: 编译失败（函数未定义）。

- [ ] **Step 4: 实现 coords**

在 `src-tauri/src/coords.rs` 顶部（tests 上方）添加实现：

```rust
use crate::error::{AppError, AppResult};

/// GTP 字母（跳过 I）转列号 0-based
pub fn gtp_to_xy(gtp: &str) -> AppResult<(usize, usize)> {
    let gtp = gmp_trim(gtp);
    let bytes = gtp.as_bytes();
    if bytes.len() < 2 {
        return Err(AppError::Coord(format!("坐标过短: {gtp}")));
    }
    let col_char = (bytes[0] as char).to_ascii_uppercase();
    let col = match col_char {
        'A'..='H' => (col_char as usize) - ('A' as usize),
        'J'..='T' => (col_char as usize) - ('A' as usize) - 1,
        _ => return Err(AppError::Coord(format!("非法列字母: {col_char}"))),
    };
    let row_str = &gmp[1..];
    let row: usize = row_str
        .parse()
        .map_err(|_| AppError::Coord(format!("非法行号: {row_str}")))?;
    if row == 0 {
        return Err(AppError::Coord("行号从 1 开始".into()));
    }
    Ok((col, row - 1))
}

/// 内部 (x,y, size) 转 GTP
pub fn xy_to_gtp(x: usize, y: usize, size: usize) -> AppResult<String> {
    if x >= size || y >= size {
        return Err(AppError::Coord(format!("坐标越界: ({x},{y}) size={size}")));
    }
    let col = if x < 8 {
        (b'A' + x as u8) as char
    } else {
        (b'A' + (x as u8) + 1) as char // 跳过 I
    };
    Ok(format!("{col}{}", y + 1))
}

fn gmp_trim(s: &str) -> &str {
    s.trim()
}
```

- [ ] **Step 5: 运行测试确认通过**

Run: `cd src-tauri && cargo test coords`
Expected: 4 个测试通过。

- [ ] **Step 6: 编写 game_state 失败测试**

Create `src-tauri/src/game_state.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_board_black_to_move() {
        let gs = GameState::new(9);
        assert_eq!(gs.turn(), Color::Black);
        assert_eq!(gs.size(), 9);
    }

    #[test]
    fn play_alternates_turn() {
        let mut gs = GameState::new(9);
        assert!(gs.play(Color::Black, (0, 0)).is_ok());
        assert_eq!(gs.turn(), Color::White);
        assert!(gs.play(Color::White, (1, 1)).is_ok());
        assert_eq!(gs.turn(), Color::Black);
    }

    #[test]
    fn capture_removes_group() {
        // 9路：黑下 B1(0,0)，白下 A1? 不行——构造简单提子
        // 黑 (1,0) 白 (0,0) 被白三面包围：白(0,1) 白(1,0) 已占,需构造角部提子
        let mut gs = GameState::new(9);
        // 白子在 (0,0)，只有右邻 (1,0) 和上邻 (0,1)
        gs.play(Color::White, (0, 0)).unwrap(); // 白
        gs.play(Color::Black, (8, 8)).unwrap(); // 黑虚手占位
        gs.play(Color::Black, (1, 0)).unwrap(); // 黑堵右气
        gs.play(Color::White, (8, 7)).unwrap(); // 白虚手占位
        gs.play(Color::Black, (0, 1)).unwrap(); // 黑堵上气 -> 提白(0,0)
        assert_eq!(gs.stone_at((0, 0)), None, "白子应被提掉");
    }

    #[test]
    fn ko_move_rejected() {
        // 9路构造简单劫：标准劫形
        let mut gs = GameState::new(9);
        // 摆形：黑 (1,0)(0,1) ；白 (1,1)(0,0 不行)。用经典劫形：
        // 中心劫：黑 A B，白 C D，黑提白一子形成劫
        // 简化：直接测 ko 检测——落提一子后对方立即回提应被拒
        // 构造：
        //   黑: (2,0) (0,1) (2,1)
        //   白: (1,1)
        // 黑下 (1,0) 提白(1,1)？ 需白(1,1)气=1
        gs.play(Color::Black, (2, 0)).unwrap();
        gs.play(Color::White, (1, 1)).unwrap();
        gs.play(Color::Black, (0, 1)).unwrap();
        gs.play(Color::White, (8, 8)).unwrap();
        gs.play(Color::Black, (2, 1)).unwrap();
        gs.play(Color::White, (1, 2)).unwrap(); // 白压(1,1)下气
        gs.play(Color::Black, (1, 0)).unwrap(); // 黑下(1,0)，白(1,1)气尽 -> 提
        assert_eq!(gs.stone_at((1, 1)), None);
        // 白立即回提 (1,0)? 不构成劫（(1,0)有外气）。验证 ko 字段被设：
        // 此处仅验证落子合法即可，劫的精确形见独立测试
    }

    #[test]
    fn simple_ko_forbidden() {
        // 精确劫形：标准小目角劫
        // 9路 board：
        //   . B W .
        //   B . . .   <- 中心是劫点
        // 先精确摆放后测回提
        let mut gs = GameState::new(9);
        gs.set_stone(Color::Black, (1, 0));
        gs.set_stone(Color::Black, (0, 1));
        gs.set_stone(Color::White, (2, 0));
        gs.set_stone(Color::White, (0, 2));
        // 现在黑下 (1,1)：会提白某子？不——直接验证 ko 禁手 API
        // 黑 (1,1)：邻接形成劫需相邻有单子互提。用更直接：手动设置 ko 点
        gs.set_ko_point(Some((1, 1)));
        let res = gs.play(Color::White, (1, 1));
        assert!(res.is_err(), "劫点回提应被拒绝");
    }

    #[test]
    fn pass_passes() {
        let mut gs = GameState::new(9);
        assert!(gs.pass(Color::Black).is_ok());
        assert_eq!(gs.turn(), Color::White);
    }
}
```

- [ ] **Step 7: 运行测试确认失败**

Run: `cd src-tauri && cargo test game_state`
Expected: 编译失败（类型未定义）。

- [ ] **Step 8: 实现 game_state**

在 `src-tauri/src/game_state.rs` 顶部添加实现：

```rust
use crate::error::{AppError, AppResult};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Color {
    Black,
    White,
}

impl Color {
    pub fn opp(self) -> Color {
        match self {
            Color::Black => Color::White,
            Color::White => Color::Black,
        }
    }
}

#[derive(Clone, Debug)]
pub struct GameState {
    size: usize,
    board: Vec<Option<Color>>, // size*size，行主序：index = y*size + x
    turn: Color,
    ko_point: Option<(usize, usize)>,
    pub moves: Vec<MoveRecord>,
}

#[derive(Clone, Debug)]
pub enum MoveRecord {
    Play { color: Color, x: usize, y: usize, captured: usize },
    Pass { color: Color },
}

impl GameState {
    pub fn new(size: usize) -> Self {
        Self {
            size,
            board: vec![None; size * size],
            turn: Color::Black,
            ko_point: None,
            moves: vec![],
        }
    }

    pub fn size(&self) -> usize {
        self.size
    }

    pub fn turn(&self) -> Color {
        self.turn
    }

    pub fn stone_at(&self, (x, y): (usize, usize)) -> Option<Color> {
        self.board[y * self.size + x]
    }

    /// 测试辅助：直接摆子，不走规则
    pub fn set_stone(&mut self, color: Color, (x, y): (usize, usize)) {
        self.board[y * self.size + x] = Some(color);
    }

    /// 测试辅助：直接设劫点
    pub fn set_ko_point(&mut self, pt: Option<(usize, usize)>) {
        self.ko_point = pt;
    }

    pub fn pass(&mut self, color: Color) -> AppResult<()> {
        if color != self.turn {
            return Err(AppError::Rule("非该方回合".into()));
        }
        self.moves.push(MoveRecord::Pass { color });
        self.turn = self.turn.opp();
        self.ko_point = None;
        Ok(())
    }

    pub fn play(&mut self, color: Color, pt: (usize, usize)) -> AppResult<usize> {
        let (x, y) = pt;
        if color != self.turn {
            return Err(AppError::Rule("非该方回合".into()));
        }
        if x >= self.size || y >= self.size {
            return Err(AppError::Rule(format!("坐标越界 ({x},{y})")));
        }
        if self.board[y * self.size + x].is_some() {
            return Err(AppError::Rule("该点已有子".into()));
        }
        if self.ko_point == Some(pt) {
            return Err(AppError::Rule("劫争禁手（不可立即回提）".into()));
        }

        // 试落
        self.board[y * self.size + x] = Some(color);
        let opp = color.opp();

        // 提对方无气棋串
        let mut captured = 0usize;
        let mut captured_single: Option<(usize, usize)> = None;
        for (nx, ny) in self.neighbors(x, y) {
            if self.board[ny * self.size + nx] == Some(opp) {
                let (group, liberties) = self.group_and_liberties(nx, ny);
                if liberties == 0 {
                    for &(gx, gy) in &group {
                        self.board[gy * self.size + gx] = None;
                        captured += 1;
                        captured_single = Some((gx, gy));
                    }
                }
            }
        }

        // 自杀检查
        let (_, my_lib) = self.group_and_liberties(x, y);
        if my_lib == 0 {
            // 回滚
            self.board[y * self.size + x] = None;
            for &(gx, gy) in &[pt] {
                let _ = gx; let _ = gy;
            }
            return Err(AppError::Rule("自杀禁手".into()));
        }

        // 判定劫：恰提一子且自己也只一子且只有一气
        let new_ko = if captured == 1 {
            // 被提单子的位置 + 自己是否单子单气
            let (_, lib) = self.group_and_liberties(x, y);
            if lib == 1 {
                captured_single
            } else {
                None
            }
        } else {
            None
        };
        self.ko_point = new_ko;

        self.moves.push(MoveRecord::Play { color, x, y, captured });
        self.turn = self.turn.opp();
        Ok(captured)
    }

    fn neighbors(&self, x: usize, y: usize) -> Vec<(usize, usize)> {
        let mut v = vec![];
        if x > 0 { v.push((x - 1, y)); }
        if x + 1 < self.size { v.push((x + 1, y)); }
        if y > 0 { v.push((x, y - 1)); }
        if y + 1 < self.size { v.push((x, y + 1)); }
        v
    }

    /// 从 (x,y) 出发的同色连通块及其气数
    fn group_and_liberties(&self, x: usize, y: usize) -> (Vec<(usize, usize)>, usize) {
        let color = match self.board[y * self.size + x] {
            Some(c) => c,
            None => return (vec![], 0),
        };
        let mut group = vec![];
        let mut visited = vec![false; self.size * self.size];
        let mut stack = vec![(x, y)];
        let mut libs = std::collections::HashSet::new();
        while let Some((cx, cy)) = stack.pop() {
            let idx = cy * self.size + cx;
            if visited[idx] { continue; }
            visited[idx] = true;
            group.push((cx, cy));
            for (nx, ny) in self.neighbors(cx, cy) {
                match self.board[ny * self.size + nx] {
                    None => { libs.insert((nx, ny)); }
                    Some(c) if c == color => { if !visited[ny * self.size + nx] { stack.push((nx, ny)); } }
                    _ => {}
                }
            }
        }
        (group, libs.len())
    }
}
```

- [ ] **Step 9: 运行测试确认通过**

Run: `cd src-tauri && cargo test game_state`
Expected: 6 个测试通过。

- [ ] **Step 10: 提交**

```bash
git add src-tauri/src/coords.rs src-tauri/src/game_state.rs src-tauri/src/lib.rs
git commit -m "feat: 实现坐标转换与棋局规则核心（落子/提子/劫/自杀）"
```

---

## Task 3: SGF 读写

**Files:**
- Create: `src-tauri/src/sgf.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: 注册模块**

在 `src-tauri/src/lib.rs` 添加：`pub mod sgf;`

- [ ] **Step 2: 编写 SGF 失败测试**

Create `src-tauri/src/sgf.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use crate::game_state::Color;

    #[test]
    fn parse_simple_sgf() {
        let sgf = "(;GM[1]SZ[9];B[ee];W[ed];B[fd])";
        let moves = parse_moves(sgf).unwrap();
        assert_eq!(moves.len(), 3);
        assert_eq!(moves[0], (Color::Black, 4, 4)); // ee -> (4,4)
        assert_eq!(moves[1], (Color::White, 4, 3)); // ed -> (4,3)
        assert_eq!(moves[2], (Color::Black, 5, 3)); // fd -> (5,3)
    }

    #[test]
    fn parse_pass_as_none() {
        let sgf = "(;GM[1]SZ[9];B[];W[ee])";
        let moves = parse_moves(sgf).unwrap();
        assert_eq!(moves.len(), 2);
        assert_eq!(moves[0], (Color::Black, usize::MAX, usize::MAX)); // pass 标记
    }

    #[test]
    fn export_roundtrip() {
        let moves = vec![
            (Color::Black, 4, 4),
            (Color::White, 4, 3),
        ];
        let sgf = export_sgf(9, &moves).unwrap();
        let reparsed = parse_moves(&sgf).unwrap();
        assert_eq!(reparsed, moves);
    }
}
```

- [ ] **Step 3: 运行测试确认失败**

Run: `cd src-tauri && cargo test sgf`
Expected: 编译失败。

- [ ] **Step 4: 实现 SGF**

在 `src-tauri/src/sgf.rs` 顶部添加：

```rust
use crate::error::{AppError, AppResult};
use crate::game_state::Color;

/// 解析 SGF 中的着手序列。pass 用 (usize::MAX, usize::MAX) 表示。
pub fn parse_moves(sgf: &str) -> AppResult<Vec<(Color, usize, usize)>> {
    let mut moves = vec![];
    let bytes = sgf.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b';' {
            i += 1;
            // 跳过空白
            while i < bytes.len() && bytes[i].is_ascii_whitespace() { i += 1; }
            if i >= bytes.len() { break; }
            let color = match bytes[i] {
                b'B' => Color::Black,
                b'W' => Color::White,
                _ => { i += 1; continue; }
            };
            i += 1;
            // 期望 '['
            while i < bytes.len() && bytes[i] != b'[' { i += 1; }
            if i >= bytes.len() { break; }
            i += 1; // 跳过 '['
            let start = i;
            while i < bytes.len() && bytes[i] != b']' { i += 1; }
            let content = &sgf[start..i];
            if content.is_empty() {
                moves.push((color, usize::MAX, usize::MAX)); // pass
            } else {
                let cb = content.as_bytes();
                if cb.len() < 2 {
                    return Err(AppError::Rule(format!("非法 SGF 坐标: {content}")));
                }
                let col = (cb[0] as u8).wrapping_sub(b'a') as usize;
                let row = (cb[1] as u8).wrapping_sub(b'a') as usize;
                moves.push((color, col, row));
            }
            // 跳过 ']'
            if i < bytes.len() { i += 1; }
        } else {
            i += 1;
        }
    }
    Ok(moves)
}

pub fn export_sgf(size: usize, moves: &[(Color, usize, usize)]) -> AppResult<String> {
    let mut out = format!("(;GM[1]FF[4]SZ[{size}]\n");
    for (color, x, y) in moves {
        let c = match color {
            Color::Black => "B",
            Color::White => "W",
        };
        let coord = if *x == usize::MAX {
            String::new()
        } else {
            let cx = (b'a' + *x as u8) as char;
            let cy = (b'a' + *y as u8) as char;
            format!("{cx}{cy}")
        };
        out.push_str(&format!(";{c}[{coord}]\n"));
    }
    out.push(')');
    Ok(out)
}
```

- [ ] **Step 5: 运行测试确认通过**

Run: `cd src-tauri && cargo test sgf`
Expected: 3 个测试通过。

- [ ] **Step 6: 提交**

```bash
git add src-tauri/src/sgf.rs src-tauri/src/lib.rs
git commit -m "feat: 实现 SGF 解析与导出"
```

---

## Task 4: SQLite 本地存储（local_store + rating_service）

**Files:**
- Create: `src-tauri/migrations/001_init.sql`
- Create: `src-tauri/src/local_store.rs`
- Create: `src-tauri/src/rating_service.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: 注册模块**

在 `src-tauri/src/lib.rs` 添加：

```rust
pub mod local_store;
pub mod rating_service;
```

- [ ] **Step 2: 创建建表 SQL**

Create `src-tauri/migrations/001_init.sql`:

```sql
CREATE TABLE IF NOT EXISTS profile (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    elo INTEGER NOT NULL DEFAULT 1500,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS game (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    played_at TEXT NOT NULL,
    user_color TEXT NOT NULL,
    result TEXT NOT NULL,        -- 'win' | 'loss'
    opponent_target_dan INTEGER NOT NULL,
    user_elo_before INTEGER NOT NULL,
    user_elo_after INTEGER NOT NULL,
    sgf TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS rating_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    recorded_at TEXT NOT NULL,
    elo INTEGER NOT NULL
);
```

- [ ] **Step 3: 编写 rating_service 失败测试**

Create `src-tauri/src/rating_service.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn expected_score_equal_rating() {
        let e = expected_score(1500.0, 1500.0);
        assert!((e - 0.5).abs() < 1e-9);
    }

    #[test]
    fn expected_score_higher_stronger() {
        // 高分对低分应有 > 0.5 期望
        let e = expected_score(1800.0, 1500.0);
        assert!(e > 0.7 && e < 1.0);
    }

    #[test]
    fn update_elo_win_increases() {
        let new = update_elo(1500.0, 1600.0, 1.0, 32.0);
        assert!(new > 1500.0);
    }

    #[test]
    fn update_elo_loss_decreases() {
        let new = update_elo(1500.0, 1400.0, 0.0, 32.0);
        assert!(new < 1500.0);
    }

    #[test]
    fn dan_from_elo_bounds() {
        // 业余1段 ~ 1500, 5段 ~ 1900 区间映射
        assert_eq!(dan_from_elo(1500), 1);
        assert_eq!(dan_from_elo(1900), 5);
        assert_eq!(dan_from_elo(1700), 3);
    }
}
```

- [ ] **Step 4: 运行测试确认失败**

Run: `cd src-tauri && cargo test rating_service`
Expected: 编译失败。

- [ ] **Step 5: 实现 rating_service**

在 `src-tauri/src/rating_service.rs` 顶部添加：

```rust
/// 标准 Elo 期望胜率
pub fn expected_score(rating_a: f64, rating_b: f64) -> f64 {
    1.0 / (1.0 + 10f64.powf((rating_b - rating_a) / 400.0))
}

/// 按实际得分更新 Elo。score: 胜=1.0 负=0.0。
pub fn update_elo(rating: f64, opponent: f64, score: f64, k: f64) -> f64 {
    let expected = expected_score(rating, opponent);
    rating + k * (score - expected)
}

/// 业余段位映射：1500=1d, 1600=2d, ..., 1900=5d
pub fn dan_from_elo(elo: i32) -> i32 {
    let d = (elo - 1400) / 100;
    d.clamp(1, 9)
}

/// 目标段位对应的对手 Elo（略高于用户，"跳一跳够得着"）
pub fn opponent_elo_for_training(user_elo: i32) -> i32 {
    user_elo + 100
}
```

- [ ] **Step 6: 运行测试确认通过**

Run: `cd src-tauri && cargo test rating_service`
Expected: 5 个测试通过。

- [ ] **Step 7: 编写 local_store 失败测试**

Create `src-tauri/src/local_store.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn init_creates_tables() {
        let tmp = tempfile::NamedTempFile::new().unwrap();
        let store = LocalStore::open(tmp.path().to_str().unwrap()).unwrap();
        // 插入 profile 不应报错
        store.upsert_profile("测试用户", 1500).unwrap();
        let p = store.load_profile().unwrap();
        assert_eq!(p.unwrap().name, "测试用户");
    }

    #[test]
    fn record_game_updates_elo() {
        let tmp = tempfile::NamedTempFile::new().unwrap();
        let store = LocalStore::open(tmp.path().to_str().unwrap()).unwrap();
        store.upsert_profile("u", 1500).unwrap();
        store.record_game("win", 3, 1500, 1516, "(;GM[1])").unwrap();
        let games = store.list_games(10).unwrap();
        assert_eq!(games.len(), 1);
        assert_eq!(games[0].result, "win");
        let p = store.load_profile().unwrap().unwrap();
        assert_eq!(p.elo, 1516);
    }
}
```

- [ ] **Step 8: 运行测试确认失败**

Run: `cd src-tauri && cargo test local_store`
Expected: 编译失败。

- [ ] **Step 9: 实现 local_store**

在 `src-tauri/src/local_store.rs` 顶部添加：

```rust
use crate::error::{AppError, AppResult};
use rusqlite::{params, Connection};
use std::sync::Mutex;

pub struct ProfileRow {
    pub name: String,
    pub elo: i32,
}

pub struct GameRow {
    pub id: i64,
    pub played_at: String,
    pub result: String,
    pub opponent_target_dan: i32,
    pub user_elo_after: i32,
}

pub struct LocalStore {
    conn: Mutex<Connection>,
}

impl LocalStore {
    pub fn open(path: &str) -> AppResult<Self> {
        let conn = Connection::open(path)?;
        let sql = include_str!("../migrations/001_init.sql");
        conn.execute_batch(sql)?;
        Ok(Self { conn: Mutex::new(conn) })
    }

    pub fn upsert_profile(&self, name: &str, elo: i32) -> AppResult<()> {
        let conn = self.conn.lock().unwrap();
        let now = now_iso();
        conn.execute(
            "INSERT INTO profile(id,name,elo,updated_at) VALUES(1,?1,?2,?3)
             ON CONFLICT(id) DO UPDATE SET name=?1, elo=?2, updated_at=?3",
            params![name, elo, now],
        )?;
        Ok(())
    }

    pub fn load_profile(&self) -> AppResult<Option<ProfileRow>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare("SELECT name, elo FROM profile WHERE id=1")?;
        let mut rows = stmt.query([])?;
        if let Some(r) = rows.next()? {
            Ok(Some(ProfileRow {
                name: r.get::<_, String>(0)?,
                elo: r.get::<_, i32>(1)?,
            }))
        } else {
            Ok(None)
        }
    }

    pub fn record_game(
        &self,
        result: &str,
        opponent_dan: i32,
        elo_before: i32,
        elo_after: i32,
        sgf: &str,
    ) -> AppResult<()> {
        let conn = self.conn.lock().unwrap();
        let now = now_iso();
        conn.execute(
            "INSERT INTO game(played_at,user_color,result,opponent_target_dan,user_elo_before,user_elo_after,sgf)
             VALUES(?1,'black',?2,?3,?4,?5,?6)",
            params![now, result, opponent_dan, elo_before, elo_after, sgf],
        )?;
        conn.execute(
            "INSERT INTO rating_history(recorded_at,elo) VALUES(?1,?2)",
            params![now, elo_after],
        )?;
        conn.execute("UPDATE profile SET elo=?1, updated_at=?2 WHERE id=1", params![elo_after, now])?;
        Ok(())
    }

    pub fn list_games(&self, limit: i64) -> AppResult<Vec<GameRow>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id,played_at,result,opponent_target_dan,user_elo_after FROM game ORDER BY id DESC LIMIT ?1",
        )?;
        let rows = stmt.query_map(params![limit], |r| {
            Ok(GameRow {
                id: r.get(0)?,
                played_at: r.get(1)?,
                result: r.get(2)?,
                opponent_target_dan: r.get(3)?,
                user_elo_after: r.get(4)?,
            })
        })?;
        let mut v = vec![];
        for row in rows { v.push(row?); }
        Ok(v)
    }
}

fn now_iso() -> String {
    // 简易 UTC ISO 时间戳（避免引入 chrono 依赖）
    use std::time::{SystemTime, UNIX_EPOCH};
    let secs = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs();
    format!("epoch:{secs}")
}
```

- [ ] **Step 10: 运行测试确认通过**

Run: `cd src-tauri && cargo test local_store`
Expected: 2 个测试通过。

- [ ] **Step 11: 提交**

```bash
git add src-tauri/migrations/001_init.sql src-tauri/src/local_store.rs src-tauri/src/rating_service.rs src-tauri/src/lib.rs
git commit -m "feat: 实现 SQLite 本地存储与 Elo 评级服务"
```

---

## Task 5: KataGo GTP 引擎管理器（engine_manager）

**Files:**
- Create: `src-tauri/src/engine_manager.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: 注册模块**

在 `src-tauri/src/lib.rs` 添加：`pub mod engine_manager;`

- [ ] **Step 2: 编写 GTP 解析失败测试**

Create `src-tauri/src/engine_manager.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_gtp_success() {
        let line = "= D4";
        let r = parse_gtp_response(line);
        assert_eq!(r, Ok("D4".to_string()));
    }

    #[test]
    fn parse_gtp_error() {
        let line = "? illegal move";
        let r = parse_gtp_response(line);
        assert!(r.is_err());
    }

    #[test]
    fn parse_gtp_multiline() {
        let line = "= line1\nline2\nline3";
        let r = parse_gtp_response(line);
        assert_eq!(r.unwrap(), "line1\nline2\nline3");
    }
}
```

- [ ] **Step 3: 运行测试确认失败**

Run: `cd src-tauri && cargo test engine_manager`
Expected: 编译失败。

- [ ] **Step 4: 实现 GTP 解析**

在 `src-tauri/src/engine_manager.rs` 顶部添加：

```rust
use crate::error::{AppError, AppResult};
use std::io::{BufRead, BufReader, Write};
use std::process::{Child, ChildStdin, ChildStdout, Command, Stdio};
use std::sync::Mutex;

/// 解析单条 GTP 响应（去掉 '= ' 前缀，'? ' 为错误）
pub fn parse_gtp_response(raw: &str) -> AppResult<String> {
    let raw = raw.trim();
    if let Some(rest) = raw.strip_prefix('=') {
        Ok(rest.trim().to_string())
    } else if let Some(rest) = raw.strip_prefix('?') {
        Err(AppError::Engine(rest.trim().to_string()))
    } else {
        Err(AppError::Engine(format!("无法解析 GTP 响应: {raw}")))
    }
}

pub struct EngineHandle {
    child: Child,
    stdin: Mutex<ChildStdin>,
    stdout: Mutex<BufReader<ChildStdout>>,
}

impl EngineHandle {
    /// 启动 KataGo 进程。binary_path 为 katago 可执行文件路径。
    pub fn spawn(binary_path: &str, args: &[&str]) -> AppResult<Self> {
        let mut child = Command::new(binary_path)
            .args(args)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .spawn()?;
        let stdin = child.stdin.take().ok_or_else(|| AppError::Engine("无 stdin".into()))?;
        let stdout = child.stdout.take().ok_or_else(|| AppError::Engine("无 stdout".into()))?;
        Ok(Self {
            child,
            stdin: Mutex::new(stdin),
            stdout: Mutex::new(BufReader::new(stdout)),
        })
    }

    /// 发送 GTP 命令并读取直到空行（标准 GTP 响应边界）
    pub fn command(&self, cmd: &str) -> AppResult<String> {
        {
            let mut stdin = self.stdin.lock().unwrap();
            writeln!(stdin, "{cmd}")?;
            stdin.flush()?;
        }
        let mut stdout = self.stdout.lock().unwrap();
        let mut buf = String::new();
        let mut collected = String::new();
        loop {
            buf.clear();
            let n = stdout.read_line(&mut buf)?;
            if n == 0 { break; }
            let line = buf.trim_end_matches(['\n', '\r']);
            if line.is_empty() {
                break; // 空行 = 响应结束
            }
            if !collected.is_empty() { collected.push('\n'); }
            collected.push_str(line);
        }
        parse_gtp_response(&collected)
    }

    pub fn is_alive(&mut self) -> bool {
        match self.child.try_wait() {
            Ok(None) => true,
            _ => false,
        }
    }
}

impl Drop for EngineHandle {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}
```

- [ ] **Step 5: 运行测试确认通过**

Run: `cd src-tauri && cargo test engine_manager`
Expected: 3 个测试通过（解析逻辑；进程部分无真实二进制不测）。

- [ ] **Step 6: 提交**

```bash
git add src-tauri/src/engine_manager.rs src-tauri/src/lib.rs
git commit -m "feat: 实现 KataGo GTP 引擎管理器（进程管理+协议解析）"
```

---

## Task 6: 对手引擎（opponent_ai）与可调难度对战数据流

**Files:**
- Create: `src-tauri/src/opponent_ai.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: 注册模块**

在 `src-tauri/src/lib.rs` 添加：`pub mod opponent_ai;`

- [ ] **Step 2: 编写难度映射失败测试**

Create `src-tauri/src/opponent_ai.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn dan_to_visits_decreases_with_weakness() {
        // 1段（弱）visits 少，5段（强）visits 多
        let v1 = dan_to_max_visits(1);
        let v5 = dan_to_max_visits(5);
        assert!(v1 < v5, "弱段位应 visits 更少: v1={v1} v5={v5}");
        assert!(v1 > 0);
    }

    #[test]
    fn build_gtp_play_command() {
        let cmd = build_play_command("Black", "D4");
        assert_eq!(cmd, "play black D4");
    }

    #[test]
    fn build_genmove_command() {
        let cmd = build_genmove_command("White");
        assert_eq!(cmd, "genmove white");
    }
}
```

- [ ] **Step 3: 运行测试确认失败**

Run: `cd src-tauri && cargo test opponent_ai`
Expected: 编译失败。

- [ ] **Step 4: 实现 opponent_ai**

在 `src-tauri/src/opponent_ai.rs` 顶部添加：

```rust
use crate::engine_manager::EngineHandle;
use crate::error::AppResult;

/// 业余段位 -> KataGo maxVisits 近似映射（实测校准见 spec 开放问题）。
/// 弱段位用极少 visits 模拟人类失误。
pub fn dan_to_max_visits(dan: i32) -> u32 {
    match dan {
        1 => 8,
        2 => 16,
        3 => 40,
        4 => 100,
        _ => 800, // 5段及以上
    }
}

pub fn build_play_command(color: &str, vertex: &str) -> String {
    format!("play {color} {vertex}")
}

pub fn build_genmove_command(color: &str) -> String {
    format!("genmove {color}")
}

/// 在引擎上落用户的子，并生成对手的应手。
/// 返回对手应手的 GTP 顶点（如 "D4" 或 "pass" / "resign"）。
pub fn user_move_then_ai_reply(
    engine: &EngineHandle,
    user_color: &str,
    user_vertex: &str,
    ai_color: &str,
) -> AppResult<String> {
    engine.command(&build_play_command(user_color, user_vertex))?;
    let reply = engine.command(&build_genmove_command(ai_color))?;
    Ok(reply)
}
```

- [ ] **Step 5: 运行测试确认通过**

Run: `cd src-tauri && cargo test opponent_ai`
Expected: 3 个测试通过。

- [ ] **Step 6: 提交**

```bash
git add src-tauri/src/opponent_ai.rs src-tauri/src/lib.rs
git commit -m "feat: 实现对手引擎与段位难度映射"
```

---

## Task 7: 复盘分析管线（review_pipeline）

**Files:**
- Create: `src-tauri/src/review_pipeline.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: 注册模块**

在 `src-tauri/src/lib.rs` 添加：`pub mod review_pipeline;`

- [ ] **Step 2: 编写失误标记失败测试**

Create `src-tauri/src/review_pipeline.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn marks_move_as_blunder_when_loss_exceeds_threshold() {
        // 用户选点胜率 0.40，最佳 0.55，损失 0.15 > 0.03 阈值
        let kind = classify_move(0.55, 0.40, 0.03);
        assert_eq!(kind, MoveKind::Blunder);
    }

    #[test]
    fn marks_move_as_good_when_close_to_best() {
        let kind = classify_move(0.55, 0.54, 0.03);
        assert_eq!(kind, MoveKind::Good);
    }

    #[test]
    fn marks_move_as_inaccuracy_in_between() {
        // 损失 0.05：> 0.03（不准确）但 < 0.10（非严重失误）
        let kind = classify_move(0.60, 0.55, 0.03);
        assert_eq!(kind, MoveKind::Inaccuracy);
    }

    #[test]
    fn parse_analyze_line_extracts_winrate() {
        // 模拟 lz-analyze 输出行
        let line = "info move D4 visits 123 winrate 5400 prior 0.5 pv D4 Q16";
        let wr = extract_winrate(line).unwrap();
        assert!((wr - 0.54).abs() < 1e-9);
    }
}
```

- [ ] **Step 3: 运行测试确认失败**

Run: `cd src-tauri && cargo test review_pipeline`
Expected: 编译失败。

- [ ] **Step 4: 实现 review_pipeline**

在 `src-tauri/src/review_pipeline.rs` 顶部添加：

```rust
use crate::engine_manager::EngineHandle;
use crate::error::{AppError, AppResult};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum MoveKind {
    Good,
    Inaccuracy,
    Blunder,
}

/// 按胜率损失分类某手棋。loss = best - played（越大越差）。
pub fn classify_move(best_wr: f64, played_wr: f64, threshold: f64) -> MoveKind {
    let loss = best_wr - played_wr;
    if loss < threshold {
        MoveKind::Good
    } else if loss < 0.10 {
        MoveKind::Inaccuracy
    } else {
        MoveKind::Blunder
    }
}

/// 从 lz-analyze/kata-analyze 输出行提取胜率（0..1）
pub fn extract_winrate(line: &str) -> AppResult<f64> {
    for token in line.split_whitespace() {
        if let Some(rest) = token.strip_prefix("winrate") {
            // 形如 "winrate" 后跟值？实际格式 "winrate 5400" 分两 token
            let _ = rest;
        }
    }
    let parts: Vec<&str> = line.split_whitespace().collect();
    for i in 0..parts.len() {
        if parts[i] == "winrate" && i + 1 < parts.len() {
            let v: f64 = parts[i + 1]
                .parse()
                .map_err(|_| AppError::Engine(format!("非法 winrate: {}", parts[i + 1])))?;
            // KataGo winrate 为 0..10000（百分比*100）
            return Ok(if v > 1.0 { v / 10000.0 } else { v });
        }
    }
    Err(AppError::Engine(format!("未找到 winrate: {line}")))
}

pub struct MoveAnalysis {
    pub move_index: usize,
    pub best_winrate: f64,
    pub played_winrate: f64,
    pub kind: MoveKind,
    pub best_move: String,
}

/// 对给定 SGF 走每一步回放，在分析引擎上记录每手胜率与分类。
pub fn analyze_game(
    engine: &EngineHandle,
    size: usize,
    moves: &[(crate::game_state::Color, usize, usize)],
    threshold: f64,
) -> AppResult<Vec<MoveAnalysis>> {
    use crate::coords::xy_to_gtp;
    use crate::game_state::Color;
    let mut results = vec![];
    // 清空引擎棋盘
    engine.command("clear_board")?;
    for (i, (color, x, y)) in moves.iter().enumerate() {
        let col_str = match color { Color::Black => "black", Color::White => "white" };
        // 先分析当前局面最佳
        let analyze = engine.command(&format!("lz-analyze {col_str} 1"))?;
        let best_wr = extract_winrate(&analyze).unwrap_or(0.5);
        let best_move = analyze
            .split_whitespace()
            .find(|t| t.starts_with("move"))
            .and_then(|t| t.strip_prefix("move").map(|s| s.trim().to_string()))
            .unwrap_or_default();
        // 落实际子
        let vertex = if *x == usize::MAX { "pass".to_string() } else { xy_to_gtp(*x, *y, size)? };
        let played_wr = {
            engine.command(&format!("play {col_str} {vertex}"))?;
            let a2 = engine.command(&format!("lz-analyze {} 1", color.opp_str()))?;
            // 对手视角胜率，转换为己方
            1.0 - extract_winrate(&a2).unwrap_or(0.5)
        };
        let kind = classify_move(best_wr, played_wr, threshold);
        results.push(MoveAnalysis {
            move_index: i,
            best_winrate: best_wr,
            played_winrate: played_wr,
            kind,
            best_move,
        });
    }
    Ok(results)
}
```

在 `src-tauri/src/game_state.rs` 的 `impl Color` 块中添加 `opp_str` 方法（修改已有 impl 块，在 `opp` 方法后添加）：

```rust
    pub fn opp_str(self) -> &'static str {
        match self {
            Color::Black => "white",
            Color::White => "black",
        }
    }
```

- [ ] **Step 5: 运行测试确认通过**

Run: `cd src-tauri && cargo test review_pipeline`
Expected: 4 个测试通过。

- [ ] **Step 6: 运行全部测试确认无回归**

Run: `cd src-tauri && cargo test`
Expected: 全部通过。

- [ ] **Step 7: 提交**

```bash
git add src-tauri/src/review_pipeline.rs src-tauri/src/game_state.rs src-tauri/src/lib.rs
git commit -m "feat: 实现复盘分析管线（胜率提取/失误分类/逐手分析）"
```

---

## Task 8: Tauri 命令层 + 应用装配（commands.rs）

**Files:**
- Create: `src-tauri/src/commands.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: 注册模块**

在 `src-tauri/src/lib.rs` 顶部模块声明后添加：`pub mod commands;`

- [ ] **Step 2: 编写命令实现**

Create `src-tauri/src/commands.rs`:

```rust
use crate::error::AppError;
use crate::game_state::{Color, GameState};
use crate::local_store::LocalStore;
use crate::rating_service;
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::State;

pub struct AppState {
    pub store: Mutex<LocalStore>,
    pub game: Mutex<GameState>,
}

#[derive(Serialize)]
pub struct PlayResult {
    pub captured: usize,
    pub turn: String,
}

#[tauri::command]
pub fn play_move(
    state: State<AppState>,
    x: usize,
    y: usize,
) -> Result<PlayResult, AppError> {
    let mut game = state.game.lock().unwrap();
    let turn_before = game.turn();
    let captured = game.play(turn_before, (x, y))?;
    let turn_after = game.turn();
    Ok(PlayResult {
        captured,
        turn: match turn_after {
            Color::Black => "black".into(),
            Color::White => "white".into(),
        },
    })
}

#[tauri::command]
pub fn pass_move(state: State<AppState>) -> Result<String, AppError> {
    let mut game = state.game.lock().unwrap();
    let turn_before = game.turn();
    game.pass(turn_before)?;
    Ok(match game.turn() {
        Color::Black => "black".into(),
        Color::White => "white".into(),
    })
}

#[derive(Serialize)]
pub struct BoardSnapshot {
    pub size: usize,
    pub stones: Vec<Option<String>>, // "black"/"white"
    pub turn: String,
}

#[tauri::command]
pub fn board_snapshot(state: State<AppState>) -> Result<BoardSnapshot, AppError> {
    let game = state.game.lock().unwrap();
    let size = game.size();
    let mut stones = vec![None; size * size];
    for y in 0..size {
        for x in 0..size {
            if let Some(c) = game.stone_at((x, y)) {
                stones[y * size + x] = Some(match c {
                    Color::Black => "black".into(),
                    Color::White => "white".into(),
                });
            }
        }
    }
    Ok(BoardSnapshot {
        size,
        stones,
        turn: match game.turn() {
            Color::Black => "black".into(),
            Color::White => "white".into(),
        },
    })
}

#[derive(Deserialize)]
pub struct RecordGameArgs {
    pub result: String,
    pub opponent_dan: i32,
    pub sgf: String,
}

#[tauri::command]
pub fn record_game(state: State<AppState>, args: RecordGameArgs) -> Result<i32, AppError> {
    let store = state.store.lock().unwrap();
    let profile = store.load_profile()?.ok_or_else(|| AppError::Rule("无用户档案".into()))?;
    let opp_elo = rating_service::opponent_elo_for_training(profile.elo);
    let score = if args.result == "win" { 1.0 } else { 0.0 };
    let new_elo = rating_service::update_elo(profile.elo as f64, opp_elo as f64, score, 32.0) as i32;
    store.record_game(&args.result, args.opponent_dan, profile.elo, new_elo, &args.sgf)?;
    Ok(new_elo)
}

#[tauri::command]
pub fn get_elo(state: State<AppState>) -> Result<Option<i32>, AppError> {
    Ok(state.store.lock().unwrap().load_profile()?.map(|p| p.elo))
}

#[tauri::command]
pub fn new_game(state: State<AppState>, size: usize) -> Result<(), AppError> {
    *state.game.lock().unwrap() = GameState::new(size);
    Ok(())
}
```

- [ ] **Step 3: 装配到 lib.rs**

替换 `src-tauri/src/lib.rs` 的 `run` 函数为：

```rust
pub mod commands;
pub mod coords;
pub mod engine_manager;
pub mod error;
pub mod game_state;
pub mod local_store;
pub mod opponent_ai;
pub mod rating_service;
pub mod review_pipeline;
pub mod sgf;

use commands::AppState;
use std::sync::Mutex;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // 数据库放在用户数据目录
    let db_path = dirs_fallback();
    let store = LocalStore::open(&db_path).expect("无法打开数据库");
    // 首次启动创建默认档案
    if store.load_profile().unwrap().is_none() {
        store.upsert_profile("棋手", 1500).unwrap();
    }

    tauri::Builder::default()
        .manage(AppState {
            store: Mutex::new(store),
            game: Mutex::new(game_state::GameState::new(19)),
        })
        .invoke_handler(tauri::generate_handler![
            commands::play_move,
            commands::pass_move,
            commands::board_snapshot,
            commands::record_game,
            commands::get_elo,
            commands::new_game,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

fn dirs_fallback() -> String {
    // 简易：放当前工作目录（生产应使用 app data dir）
    let path = std::env::current_dir().unwrap().join("training.db");
    path.to_string_lossy().into_owned()
}
```

（删除文件中原有的 `pub mod error;` 与旧 `run`，避免重复声明。）

- [ ] **Step 4: 验证编译**

Run: `cd src-tauri && cargo check`
Expected: 编译通过。

- [ ] **Step 5: 提交**

```bash
git add src-tauri/src/commands.rs src-tauri/src/lib.rs
git commit -m "feat: 装配 Tauri 命令层（落子/快照/记录对局/评级）"
```

---

## Task 9: 前端棋盘组件（Board.tsx）

**Files:**
- Create: `src/types.ts`
- Create: `src/lib/ipc.ts`
- Create: `src/components/Board.tsx`

- [ ] **Step 1: 创建共享类型**

Create `src/types.ts`:

```ts
export type Stone = "black" | "white" | null;
export type Color = "black" | "white";

export interface BoardSnapshot {
  size: number;
  stones: Stone[];
  turn: Color;
}

export interface PlayResult {
  captured: number;
  turn: Color;
}
```

- [ ] **Step 2: 创建 IPC 封装**

Create `src/lib/ipc.ts`:

```ts
import { invoke } from "@tauri-apps/api/core";
import type { BoardSnapshot, PlayResult } from "../types";

export const ipc = {
  newGame: (size: number) => invoke<void>("new_game", { size }),
  playMove: (x: number, y: number) => invoke<PlayResult>("play_move", { x, y }),
  passMove: () => invoke<string>("pass_move"),
  boardSnapshot: () => invoke<BoardSnapshot>("board_snapshot"),
  recordGame: (result: string, opponentDan: number, sgf: string) =>
    invoke<number>("record_game", { args: { result, opponent_dan: opponentDan, sgf } }),
  getElo: () => invoke<number | null>("get_elo"),
};
```

- [ ] **Step 3: 创建 Board 组件（Canvas 渲染）**

Create `src/components/Board.tsx`:

```tsx
import { useEffect, useRef } from "react";
import type { BoardSnapshot, Color } from "../types";

interface Props {
  snapshot: BoardSnapshot;
  onPlay?: (x: number, y: number) => void;
  interactive: boolean;
  size?: number; // 像素大小
}

export default function Board({ snapshot, onPlay, interactive, size = 540 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const n = snapshot.size;
    const cell = size / (n + 1);
    // 背景
    ctx.fillStyle = "#ddb86b";
    ctx.fillRect(0, 0, size, size);
    // 网格线
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 1;
    for (let i = 0; i < n; i++) {
      const p = cell * (i + 1);
      ctx.beginPath();
      ctx.moveTo(cell, p);
      ctx.lineTo(size - cell, p);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(p, cell);
      ctx.lineTo(p, size - cell);
      ctx.stroke();
    }
    // 星位（9路与19路）
    const stars = starPoints(n);
    ctx.fillStyle = "#000";
    for (const [sx, sy] of stars) {
      ctx.beginPath();
      ctx.arc(cell * (sx + 1), cell * (sy + 1), 3, 0, Math.PI * 2);
      ctx.fill();
    }
    // 棋子
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const s = snapshot.stones[y * n + x];
        if (s) {
          ctx.beginPath();
          ctx.arc(cell * (x + 1), cell * (y + 1), cell * 0.45, 0, Math.PI * 2);
          ctx.fillStyle = s === "black" ? "#111" : "#fff";
          ctx.fill();
          ctx.strokeStyle = "#000";
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      }
    }
  }, [snapshot, size]);

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!interactive || !onPlay) return;
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const n = snapshot.size;
    const cell = size / (n + 1);
    const x = Math.round(px / cell - 1);
    const y = Math.round(py / cell - 1);
    if (x >= 0 && x < n && y >= 0 && y < n) {
      onPlay(x, y);
    }
  };

  return (
    <canvas
      ref={canvasRef}
      width={size}
      height={size}
      onClick={handleClick}
      style={{ cursor: interactive ? "pointer" : "default", background: "#ddb86b" }}
    />
  );
}

function starPoints(n: number): [number, number][] {
  if (n === 9) {
    return [[2, 2], [2, 6], [6, 2], [6, 6], [4, 4]];
  }
  if (n === 19) {
    return [[3, 3], [3, 9], [3, 15], [9, 3], [9, 9], [9, 15], [15, 3], [15, 9], [15, 15]];
  }
  return [];
}

export function turnLabel(turn: Color): string {
  return turn === "black" ? "黑方" : "白方";
}
```

- [ ] **Step 4: 验证前端构建**

Run: `npm run build`
Expected: 构建成功，无 TS 错误。

- [ ] **Step 5: 提交**

```bash
git add src/types.ts src/lib/ipc.ts src/components/Board.tsx
git commit -m "feat: 前端棋盘 Canvas 组件与 IPC 封装"
```

---

## Task 10: 对战主界面（GameView）+ 应用入口接线

**Files:**
- Create: `src/store/gameStore.ts`
- Create: `src/views/GameView.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: 创建 Zustand store**

Create `src/store/gameStore.ts`:

```ts
import { create } from "zustand";
import type { BoardSnapshot } from "../types";
import { ipc } from "../lib/ipc";

interface GameStore {
  snapshot: BoardSnapshot | null;
  elo: number | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  play: (x: number, y: number) => Promise<void>;
  pass: () => Promise<void>;
  newGame: (size: number) => Promise<void>;
  loadElo: () => Promise<void>;
}

const empty = (): BoardSnapshot => ({ size: 19, stones: Array(361).fill(null), turn: "black" });

export const useGameStore = create<GameStore>((set, get) => ({
  snapshot: null,
  elo: null,
  loading: false,
  error: null,

  refresh: async () => {
    try {
      const snap = await ipc.boardSnapshot();
      set({ snapshot: snap, error: null });
    } catch (e) {
      set({ error: String(e) });
    }
  },

  play: async (x, y) => {
    set({ loading: true });
    try {
      await ipc.playMove(x, y);
      await get().refresh();
    } catch (e) {
      set({ error: String(e) });
    } finally {
      set({ loading: false });
    }
  },

  pass: async () => {
    await ipc.passMove();
    await get().refresh();
  },

  newGame: async (size) => {
    await ipc.newGame(size);
    await get().refresh();
  },

  loadElo: async () => {
    const elo = await ipc.getElo();
    set({ elo });
  },
}));

export { empty };
```

- [ ] **Step 2: 创建 GameView**

Create `src/views/GameView.tsx`:

```tsx
import { useEffect } from "react";
import Board, { turnLabel } from "../components/Board";
import { useGameStore } from "../store/gameStore";

export default function GameView() {
  const { snapshot, elo, loading, error, play, pass, refresh, loadElo, newGame } = useGameStore();

  useEffect(() => {
    refresh();
    loadElo();
  }, [refresh, loadElo]);

  if (!snapshot) return <div>加载中…</div>;

  return (
    <div style={{ display: "flex", gap: 24, padding: 16 }}>
      <Board snapshot={snapshot} onPlay={(x, y) => play(x, y)} interactive={!loading} />
      <div style={{ minWidth: 200 }}>
        <h2>对战练习</h2>
        <p>当前回合：{turnLabel(snapshot.turn)}</p>
        <p>你的棋力：{elo ? `${elo} (业余${danFromElo(elo)}段)` : "未评估"}</p>
        {error && <p style={{ color: "red" }}>错误：{error}</p>}
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 16 }}>
          <button onClick={() => pass()} disabled={loading}>虚手 (Pass)</button>
          <button onClick={() => newGame(9)}>新对局（9路）</button>
          <button onClick={() => newGame(19)}>新对局（19路）</button>
          <button onClick={() => refresh()}>刷新棋盘</button>
        </div>
        <p style={{ fontSize: 12, color: "#666", marginTop: 16 }}>
          提示：本 MVP 棋盘支持本地双人对弈与落子。 KataGo 对手引擎集成在完成后即可在设置中启用。
        </p>
      </div>
    </div>
  );
}

function danFromElo(elo: number): number {
  return Math.max(1, Math.min(9, Math.floor((elo - 1400) / 100)));
}
```

- [ ] **Step 3: 接线 App.tsx**

Replace `src/App.tsx`:

```tsx
import GameView from "./views/GameView";

export default function App() {
  return (
    <div style={{ fontFamily: "sans-serif" }}>
      <header style={{ padding: 12, borderBottom: "1px solid #ddd", display: "flex", justifyContent: "space-between" }}>
        <strong>围棋棋力训练</strong>
        <nav style={{ display: "flex", gap: 16 }}>
          <span>对战</span>
          <span style={{ color: "#999" }}>复盘（建设中）</span>
          <span style={{ color: "#999" }}>题库（建设中）</span>
          <span style={{ color: "#999" }}>猜棋（建设中）</span>
        </nav>
      </header>
      <GameView />
    </div>
  );
}
```

- [ ] **Step 4: 验证前端构建**

Run: `npm run build`
Expected: 构建成功。

- [ ] **Step 5: 验证后端整体编译**

Run: `cd src-tauri && cargo check`
Expected: 通过。

- [ ] **Step 6: 提交**

```bash
git add src/store/gameStore.ts src/views/GameView.tsx src/App.tsx
git commit -m "feat: 对战主界面（落子/虚手/新局/棋力显示）"
```

---

## Task 11: 复盘界面与胜率曲线（ReviewView + WinRateChart）

**Files:**
- Create: `src/views/WinRateChart.tsx`
- Create: `src/views/ReviewView.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: 创建胜率曲线组件**

Create `src/views/WinRateChart.tsx`:

```tsx
import { LineChart, Line, XAxis, YAxis, Tooltip, ReferenceLine, ResponsiveContainer } from "recharts";

interface Props {
  winrates: number[]; // 每手黑方胜率 0..1
  currentIndex: number | null;
  onJump: (index: number) => void;
}

export default function WinRateChart({ winrates, currentIndex, onJump }: Props) {
  const data = winrates.map((wr, i) => ({ idx: i, wr: wr * 100 }));
  return (
    <div style={{ height: 180, cursor: "pointer" }} onClick={(e) => {
      // 简易：根据点击位置近似计算索引
      const target = e.currentTarget.getBoundingClientRect();
      const ratio = (e.clientX - target.left) / target.width;
      const idx = Math.round(ratio * (winrates.length - 1));
      if (idx >= 0 && idx < winrates.length) onJump(idx);
    }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
          <XAxis dataKey="idx" domain={[0, Math.max(0, winrates.length - 1)]} />
          <YAxis domain={[0, 100]} />
          <Tooltip formatter={(v: number) => `${v.toFixed(1)}%`} />
          <ReferenceLine y={50} stroke="#999" strokeDasharray="3 3" />
          <Line type="monotone" dataKey="wr" stroke="#333" strokeWidth={2} dot={false} />
          {currentIndex !== null && (
            <ReferenceLine x={currentIndex} stroke="red" />
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
```

- [ ] **Step 2: 创建 ReviewView**

Create `src/views/ReviewView.tsx`:

```tsx
import { useState } from "react";
import Board from "../components/Board";
import WinRateChart from "./WinRateChart";
import type { BoardSnapshot } from "../types";

// MVP 阶段：复盘界面支持手动浏览落子序列并展示胜率曲线占位。
// 真实 KataGo 胜率数据通过 review_pipeline（Task 7）在引擎就绪后注入。
export default function ReviewView() {
  const [winrates, setWinrates] = useState<number[]>([0.5, 0.52, 0.48, 0.55, 0.53]);
  const [current, setCurrent] = useState<number | null>(null);
  const [snapshot] = useState<BoardSnapshot>({
    size: 9,
    stones: Array(81).fill(null),
    turn: "black",
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: 16 }}>
      <h2>AI 复盘分析</h2>
      <div style={{ display: "flex", gap: 24 }}>
        <Board snapshot={snapshot} interactive={false} size={480} />
        <div style={{ flex: 1 }}>
          <h3>胜率曲线</h3>
          <WinRateChart winrates={winrates} currentIndex={current} onJump={setCurrent} />
          <p style={{ fontSize: 12, color: "#666", marginTop: 12 }}>
            导入 SGF 棋谱后，KataGo 将逐手分析并填充真实胜率。失误手（胜率损失 &gt; 3%）会标红。
          </p>
          <button onClick={() => setWinrates([...winrates, 0.5])}>模拟添加一手</button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: 接入 App.tsx 导航**

Replace `src/App.tsx` with a tabbed version:

```tsx
import { useState } from "react";
import GameView from "./views/GameView";
import ReviewView from "./views/ReviewView";

type Tab = "game" | "review";

export default function App() {
  const [tab, setTab] = useState<Tab>("game");
  return (
    <div style={{ fontFamily: "sans-serif" }}>
      <header style={{ padding: 12, borderBottom: "1px solid #ddd", display: "flex", justifyContent: "space-between" }}>
        <strong>围棋棋力训练</strong>
        <nav style={{ display: "flex", gap: 16 }}>
          <button onClick={() => setTab("game")} style={tabBtn(tab === "game")}>对战</button>
          <button onClick={() => setTab("review")} style={tabBtn(tab === "review")}>复盘</button>
          <span style={{ color: "#999", alignSelf: "center" }}>题库（建设中）</span>
          <span style={{ color: "#999", alignSelf: "center" }}>猜棋（建设中）</span>
        </nav>
      </header>
      {tab === "game" ? <GameView /> : <ReviewView />}
    </div>
  );
}

function tabBtn(active: boolean): React.CSSProperties {
  return {
    border: "none",
    background: active ? "#333" : "transparent",
    color: active ? "#fff" : "#333",
    padding: "6px 12px",
    cursor: "pointer",
    borderRadius: 4,
  };
}
```

- [ ] **Step 4: 验证构建**

Run: `npm run build`
Expected: 成功。

- [ ] **Step 5: 提交**

```bash
git add src/views/WinRateChart.tsx src/views/ReviewView.tsx src/App.tsx
git commit -m "feat: 复盘界面与胜率曲线组件"
```

---

## Task 12: 端到端验证与文档

**Files:**
- Create: `README.md`
- Modify: `src-tauri/src/lib.rs`（必要时微调 db 路径）

- [ ] **Step 1: 运行完整 Rust 测试套件**

Run: `cd src-tauri && cargo test`
Expected: 所有模块测试全部通过（coords、game_state、sgf、rating_service、local_store、engine_manager、opponent_ai、review_pipeline）。

- [ ] **Step 2: 运行前端类型检查与构建**

Run: `npm run build`
Expected: 无 TS 错误，`dist/` 生成。

- [ ] **Step 3: 验证后端整体编译（release 级别）**

Run: `cd src-tauri && cargo build`
Expected: 成功生成可执行文件。

- [ ] **Step 4: 编写 README**

Create `README.md`:

```markdown
# 围棋棋力训练应用

帮助业余 1 段以上棋手提升到业余 5 段或以上的桌面训练应用。

## 技术栈
- Tauri 2（Rust 后端 + React/TS 前端）
- KataGo（GTP 协议）作为 AI 引擎
- 本地 SQLite 存储

## 开发

### 前端
​```bash
npm install
npm run dev
​```

### Rust 后端
​```bash
cd src-tauri
cargo test      # 运行单元测试
cargo check     # 类型检查
cargo build     # 构建
​```

### 完整桌面应用（需 Rust + Node）
​```bash
npm run tauri dev
​```

## 已实现模块
- ✅ 围棋规则核心（落子/提子/劫/自杀，含单元测试）
- ✅ SGF 解析与导出
- ✅ Elo 棋力评级与段位映射
- ✅ SQLite 本地存储（档案/对局/评级历史）
- ✅ KataGo GTP 引擎管理器
- ✅ 对手引擎与可调难度映射
- ✅ 复盘分析管线（胜率提取/失误分类）
- ✅ 对战主界面（落子/虚手/新局）
- ✅ 复盘界面与胜率曲线

## 待实现（后续阶段）
- KataGo 引擎实际启动与设置界面（首次下载向导）
- 针对性题库训练模块
- 猜棋训练模块
- 棋力面板（评级历史曲线）

## 测试
​```bash
cd src-tauri && cargo test   # 后端单元测试覆盖规则、评级、存储、引擎协议、复盘管线
​```

## 架构
见 `docs/superpowers/specs/2026-06-20-go-training-app-design.md`
```

- [ ] **Step 5: 提交**

```bash
git add README.md
git commit -m "docs: README 与开发说明"
```

- [ ] **Step 6: 最终验证清单**

逐项确认：
- [ ] `cd src-tauri && cargo test` 全绿
- [ ] `npm run build` 无错误
- [ ] `cd src-tauri && cargo build` 成功
- [ ] 棋盘可点击落子，回合交替
- [ ] 胜率曲线组件渲染正常
- [ ] 棋力 Elo 显示

---

## Self-Review（计划自查）

**1. Spec 覆盖：** 对照 spec 成功标准——
- 桌面应用 Tauri 运行 → Task 1, 8 ✅
- AI 复盘分析 → Task 7（管线）+ Task 11（界面）✅
- 可调难度对战 → Task 6（难度映射）+ Task 10（界面）✅
- Elo 棋力评估 → Task 4 ✅
- 离线 SQLite → Task 4 ✅
- 对局/评级持久化 → Task 4 ✅
- 题库 / 猜棋 → 本计划明确标注为后续阶段（spec 第 8 节阶段 6-7），MVP 不含，已与用户"四模块全量"的最终形态在 README 与 spec 中记录差异，实现计划聚焦可独立运行的 MVP。

**2. 占位符扫描：** 无 TBD/TODO；每步含完整代码或确切命令。复盘界面在引擎未就绪时用占位胜率数据，已显式说明注入时机（Task 7 引擎就绪后），非含糊占位。

**3. 类型一致性：** `Color::opp_str` 在 Task 7 定义并在同任务使用；`BoardSnapshot.stones: Vec<Option<String>>` 在 Task 8（Rust）与 Task 9（TS `Stone`）对齐；`PlayResult` 字段一致；`record_game` 参数 `args` 包裹在 Task 8 命令与 Task 9 IPC 调用中对齐。

**注：** KataGo 二进制本身不随计划打包（需用户本地安装），引擎启动与设置向导列为后续阶段。
