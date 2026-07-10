# 围棋棋力训练应用

帮助业余 1 段以上棋手提升到业余 5 段或以上的 Web 训练应用。

## 技术栈

- **后端**：Python FastAPI + SQLite + KataGo（GTP 协议）
- **前端**：React 18 + TypeScript + Vite + Recharts
- **AI 引擎**：KataGo（OpenCL 后端，适配 AMD/NVIDIA GPU）

## 架构

```
浏览器 (React SPA)
    ↕ HTTP REST + WebSocket
Python FastAPI 后端 (localhost:8000)
    ├── KataGo GTP 子进程（对战引擎 + 分析引擎）
    ├── SQLite 数据库（档案/对局/题库/复盘/弱点）
    └── 死活题库（420 道 SGF）
```

## 快速启动

### 前置条件

- Python 3.10+
- Node.js 18+
- KataGo 二进制 + 网络权重（放在 `katago/` 目录）

### 安装 KataGo（首次）

将 KataGo 可执行文件和权重放在项目根目录的 `katago/` 下：
```
katago/
├── katago.exe
├── b18c384nbt-uec.bin.gz   (网络权重)
└── default_gtp.cfg          (KataGo 自带配置)
```

下载地址：
- 二进制：https://github.com/lightvector/KataGo/releases (OpenCL 版)
- 权重：https://github.com/lightvector/KataGo/releases/download/v1.12.0/b18c384nbt-uec.bin.gz

### 启动

```bash
# 一键启动（Windows）
start.bat

# 或手动启动
# 1. 构建前端
npm install && npm run build

# 2. 启动后端
cd backend
pip install -r requirements.txt
python main.py

# 3. 打开浏览器访问 http://127.0.0.1:8000
```

### 开发模式（热重载前端）

```bash
# 终端 1：启动后端
cd backend && python main.py

# 终端 2：启动 Vite 开发服务器
npm run dev
# 访问 http://localhost:5173
```

## 功能模块

### 可调难度对战
- KataGo AI 对手，业余 1-5 段难度可调
- maxVisits 控制棋力（1段=8 … 5段=800）
- 形势判断（胜率/目数/领先）

### AI 复盘分析
- 导入野狐/外部 SGF 棋谱
- KataGo 逐手分析，WebSocket 流式推送
- 胜率曲线 + 失误标记（Good/Inaccuracy/Blunder）
- 复盘总结报告 + 结果持久化
- 棋盘导航控件（前进/后退/自动播放）

### 针对性题库训练
- 420 道开源死活题（gogameguru，分 easy/intermediate/hard）
- 弱点驱动出题（复盘失误自动累积弱点，优先出弱项题）
- 棋盘点击作答 + 正解标记

### 猜棋训练
- 看局面猜下一手，训练读盘与第一感

### 对局库
- 导入野狐 SGF 棋谱（批量导入）
- 自动解析双方名字/段位/结果/日期
- 复盘历史列表 + 多维度检索
- 标签与笔记管理

### 棋力评估
- Elo 评级系统（1500=1段 … 1900=5段）

## 完整训练闭环

```
野狐实战 → 导入SGF → KataGo复盘 → 失误分析 → 弱点统计 → 针对性题库出题
```

## 测试

```bash
cd backend && python -m pytest tests/ -v
```

## 项目结构

```
Go/
├── backend/                # Python FastAPI 后端
│   ├── main.py             # API 路由（36+ 端点 + WebSocket）
│   ├── katago_engine.py    # KataGo 子进程管理
│   ├── game_state.py       # 棋局规则
│   ├── sgf_parser.py       # SGF 解析
│   ├── store.py            # SQLite 存储
│   ├── rating.py           # Elo 评级
│   ├── coords.py           # 坐标转换
│   ├── resources/tsumego/  # 420 道死活题 SGF
│   └── tests/              # 单元测试
├── src/                    # React 前端
│   ├── lib/api.ts          # HTTP API 封装
│   ├── components/Board.tsx# Canvas 棋盘
│   ├── store/gameStore.ts  # Zustand 状态
│   └── views/              # 对战/复盘/题库/猜棋/对局库
├── katago/                 # KataGo 二进制+权重（不纳入 git）
├── dist/                   # 前端构建产物
└── start.bat               # 一键启动
```
