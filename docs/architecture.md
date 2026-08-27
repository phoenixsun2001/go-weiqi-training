# 围棋棋力训练系统 — 整体架构与数据流转

> 更新时间：2026-08-07 · 基于当前代码库（commit e2d54bd 之后）

## 一、整体架构图

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          浏览器（React 18 + TS SPA）                       │
│                                                                          │
│  App.tsx（Tab 路由）                                                      │
│  ├─ GameView        对人机对战 / 形势判断                                  │
│  ├─ LibraryView     对局库（野狐导入/检索）                                │
│  ├─ ReviewHistoryView → ReviewView   复盘历史 / 复盘详情                  │
│  ├─ ProblemView     题库（死活/猜棋/错题本/弱点分析）                       │
│  ├─ JosekiView      定式学习（16式·试下模式）                              │
│  ├─ TrainingView    专项强化计划（4周28任务）                             │
│  └─ GoWisdomView    棋理课堂（十诀/升段赛指南/战术图集21图）                 │
│                                                                          │
│  lib/api.ts —— 唯一 HTTP 出口（同源相对路径 / VITE_API_BASE 覆盖）          │
│  data/goWisdom.ts（静态素材） public/materials/*.png（题图 21 张）          │
└──────────────┬──────────────────────────────────┬───────────────────────┘
               │ REST (/api/*)                    │ WebSocket (/ws/review)
               ▼                                  ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                     Python FastAPI 后端（单进程 :8000）                    │
│                                                                          │
│  ── 接入层 main.py ──────────────────────────────                        │
│   46 个 REST 端点 + 1 个 WS 端点，按域分组：                               │
│   对战/game* · 引擎/engine* · 复盘/review* · 题库/problems+guess+weakness │
│   对局库/library+foxwq · 定式/joseki* · 训练/training* · 棋力/elo+rating   │
│   生产模式下 StaticFiles("/") 托管 dist/（前后端同源一体）                  │
│                                                                          │
│  ── 领域逻辑层 ──────────────────────────────────                        │
│   game_state.py    围棋规则引擎（落子/提子/劫/自杀/连通块+气计算）           │
│   ai_review.py     AI 棋理复盘（布局/序盘/中盘/官子评分、issue 标签、       │
│                    关键手、孤棋检测[重建盘面]——不依赖 KataGo）              │
│   training_plan.py 弱点聚合 + 4 周×7 天计划模板                            │
│   game_matcher.py  按任务条件匹配典型对局（负局/胜局/过早接触战/            │
│                    序盘急于战斗/中腹浮棋/孤棋被攻击），进程内缓存            │
│   joseki_data.py   定式库（16 式含棋理解读 principles）                    │
│   sgf_parser.py    SGF 解析（着法/元数据/死活题答案提取）                   │
│   coords.py        坐标转换                                               │
│   rating.py        Elo 评分 ↔ 段位映射                                    │
│   katago_engine.py KataGo GTP 进程管理（对弈引擎/分析引擎双实例）           │
│   foxwq_download.py 野狐 API 对接（搜索/下载/增量 chess_id 去重）           │
│   generate_tsumego.py 死活题生成器（GameState 模拟验证答案）                │
│                                                                          │
│  ── 存储层 store.py（SQLite 单文件 training.db）────────────             │
└──────────────┬──────────────────────┬───────────────────┬────────────────┘
               ▼                      ▼                   ▼
┌──────────────────────┐ ┌───────────────────┐ ┌─────────────────────────┐
│  training.db (SQLite)│ │ backend/resources/│ │ 外部依赖                 │
│  profile      用户档案│ │ tsumego/          │ │ · KataGo(GTP/OpenCL)    │
│  game         对局记录│ │  easy/147         │ │   仅本地有(GPU AMD780M)  │
│  rating_history Elo史│ │  intermediate/148 │ │   服务器无GPU未安装      │
│  problem       题库   │ │  hard/140         │ │ · 野狐(FoxWQ)云接口      │
│  wrong_book   错题本 │ │                   │ │   棋谱导入               │
│  weakness     弱点统计│ │                   │ │                         │
│  imported_game 棋谱库│ │                   │ │                         │
│  review_result 复盘表│ │                   │ │                         │
│  training_task 任务表│ │                   │ │                         │
└──────────────────────┘ └───────────────────┘ └─────────────────────────┘

部署形态：
  本地开发  vite(:6973, proxy /api /ws) ──▶ FastAPI(:8000) ◀─ KataGo 可用
  生产(Lighthouse 43.156.103.68) GitHub ─▶ git pull ─▶ npm build ─▶ systemd
  weiqi-training.service：uvicorn host=0.0.0.0:8000 同进程托管 dist + API
```

## 二、数据流转图

### 流 A｜人机对战（GameView）
```
用户落子 ─▶ POST /api/game/play ─▶ game_state.play() 规则裁决(提子/劫/自杀)
                                        │
AI 应手 ─◀ POST /api/engine/ai-move ◀─ katago_engine(可调难度 visits)
                                        │
形势判断 ◀─ GET /api/territory （就地估算）
终局保存 ─▶ POST /api/game/save|record ─▶ game 表 + rating_history(Elo更新)
```

### 流 B｜野狐棋谱导入（LibraryView）
```
昵称/UID ─▶ POST /api/foxwq/search ─▶ foxwq_download ─▶ 野狐云端返回列表
选择导入 ─▶ POST /api/foxwq/import ─▶ 逐条下载 SGF
              │
              ├─ has_chess_id() 增量去重（已存在则 skip）
              └─ insert imported_game(chess_id/black/white/rank/result/
                 played_date/move_count/sgf)
```

### 流 C｜AI 棋理复盘（ReviewView · 不落库）
```
选中棋谱(pendingReview{gameId,sgf}) ─▶ POST /api/review/ai
    ─▶ sgf_parser.parse_moves/metadata
    ─▶ ai_review.review_game(sgf):
         复盘对象自动识别(JadenSai 所执颜色)
         ├─ 布局/序盘/中盘/官子 四阶段评分 + comments + issues[]
         │   issues 词表: 开局不在角部/角部占领不足/二线棋过多/过早接触战/
         │   过早中腹/序盘急于战斗/序盘中腹浮棋/中腹浮棋风险/孤棋被攻击/
         │   官子冗长/大分差 …
         ├─ 孤棋检测: game_state 重建 midgame_end 盘面 ─▶ 连通块+气+真眼判定
         ├─ key_moves 关键手 / territory_estimate 形势
         └─ summary 文本
    ─▶ 前端渲染（阶段星级/issue 胶囊/关键手列表）※ 结果不入库，实时计算
```

### 流 D｜KataGo 胜率复盘（可选 · 落库，仅本地）
```
POST /api/review/analyze 或 WS /ws/review
    ─▶ 分析引擎逐手 winrate ─▶ moves_json/winrate_curve_json/blunder计数
    ─▶ review_result 表(game_id UNIQUE upsert) + imported_game.reviewed=1
再次查看 ◀─ GET /api/review/result/{game_id}（缓存命中）
```

### 流 E｜题库训练（ProblemView · 弱点驱动）
```
出题 ─▶ POST /api/problems/next {max_difficulty}
    ─▶ store.next_problem(): weakness.blunder_count 降序定类别优先级
       → WHERE difficulty<=? ORDER BY RANDOM()
答题 ─▶ POST /api/problems/submit ─▶ 判定 correct
    ├─ 错误 ─▶ wrong_book 表
    └─ recordWeakness ─▶ weakness 表(blunder_count++) ─▶ 反哺下轮出题优先级
素材源: resources/tsumego 420题(seed_problems 幂等去重导入)
       + 15道基础死活形(GameState 双层搜索验证)
前端: sgfToSnapshot 解析 AB/AW 摆子渲染题面
```

### 流 F｜专项强化计划闭环（TrainingView ★核心流）
```
(1) 生成计划
POST /api/training/generate
  ─▶ get_weakness_summary(): 对对局库每局跑 review_game ─▶ issue Counter
     + 四阶段均分 → phase_scores
  ─▶ PLAN_TEMPLATE(4周28天, 针对 JadenSai: 布局2.0/序盘1.9最弱)
  ─▶ training_task 表 ×28

(2) 任务执行跳转
GET /api/training/tasks ─▶ 任务卡片
  ├─ 复盘任务 ◀─ GET /api/training/matches ─▶ game_matcher 按(week,day)条件
  │             匹配典型对局(top4: 日期/对手/胜负/理由) ─点击─▶ ReviewView 复盘
  ├─ 定式任务 ◀─ GET /api/joseki/concepts(39概念索引)+名称模糊匹配
  │             ─点击─▶ JosekiView 自动选中该定式
  └─ 题库任务 ──带难度──▶ ProblemView(difficulty=2/4/6)

(3) 进度追踪
PUT /api/training/task/{id}/status(done/skipped/pending)
GET /api/training/progress ─▶ 总完成率+各周进度条

(4) 周期结束检验
复盘类任务完成 ─▶ 局部复盘 issue 减少 ─▶ get_weakness_summary 分数上升
实战任务(每周d7)新对局导入 ─▶ 进入下一轮弱点聚合 ←── 闭环
```

### 流 G｜弱点数据总枢纽
```
                 ┌── review_result(KataGo失误计数) ──┐
对局库95局 ──▶ ai_review.review_game(issue标签)      ├──▶ problem出题优先级
                 └── 弱点排行 weakness[]/phase_scores ┴──▶ training_plan模板生成
                                                        └──▶ TrainingView仪表盘
```

## 三、两套复盘体系对比

| | AI 棋理复盘 `/api/review/ai` | KataGo 复盘 `/ws/review` |
|---|---|---|
| 依赖 | 无引擎，纯启发式+规则 | KataGo GPU（仅本地可用） |
| 输出 | 四阶段评分/issues/关键手/形势估算 | 逐手胜率曲线/失点/目差 |
| 持久化 | ❌ 实时计算（<10ms/局） | ✅ review_result 表 |
| 使用场景 | 服务器全功能可用；弱点聚合的数据源 | 本地深度分析 |

## 四、已知约束
- 服务器无 GPU：KataGo 相关接口在生产不可用，其余全功能正常
- AI 复盘不落库：每次打开重新计算（性能开销极小，但历史趋势暂无存档）
- 两套 DB 单向同步：本地 training.db 是主库（95局+题库），通过 SQL/SFTP 增量推送到服务器
