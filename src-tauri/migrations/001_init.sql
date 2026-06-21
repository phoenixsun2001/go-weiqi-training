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
    result TEXT NOT NULL,
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

-- 题库
CREATE TABLE IF NOT EXISTS problem (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category TEXT NOT NULL,        -- 'tsumego' 死活 | 'tesuji' 手筋 | 'fuseki' 布局 | 'endgame' 官子
    difficulty INTEGER NOT NULL,   -- 1..9（业余段位映射）
    question_sgf TEXT NOT NULL,    -- 题目局面 SGF
    answer_vertex TEXT NOT NULL,   -- 正解顶点（GTP，如 "D4"，多个用空格）
    explanation TEXT NOT NULL      -- 解析
);

-- 错题本
CREATE TABLE IF NOT EXISTS wrong_book (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    problem_id INTEGER NOT NULL,
    attempted_at TEXT NOT NULL,
    user_answer TEXT NOT NULL,
    correct INTEGER NOT NULL,      -- 0/1
    FOREIGN KEY(problem_id) REFERENCES problem(id)
);

-- 弱点统计：由 review_pipeline 的失误类型聚合而来
CREATE TABLE IF NOT EXISTS weakness (
    category TEXT PRIMARY KEY,     -- 与 problem.category 对齐
    blunder_count INTEGER NOT NULL DEFAULT 0,
    inaccuracy_count INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL
);

-- 导入对局库（野狐等外部棋谱）
CREATE TABLE IF NOT EXISTS imported_game (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    imported_at TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'foxwq',
    black_name TEXT NOT NULL DEFAULT '',
    white_name TEXT NOT NULL DEFAULT '',
    black_rank TEXT NOT NULL DEFAULT '',
    white_rank TEXT NOT NULL DEFAULT '',
    result TEXT NOT NULL DEFAULT '',
    board_size INTEGER NOT NULL DEFAULT 19,
    played_date TEXT NOT NULL DEFAULT '',
    move_count INTEGER NOT NULL DEFAULT 0,
    sgf TEXT NOT NULL,
    reviewed INTEGER NOT NULL DEFAULT 0,
    tags TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT ''
);

-- 复盘结果持久化（避免重复跑 KataGo）
CREATE TABLE IF NOT EXISTS review_result (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    game_id INTEGER NOT NULL UNIQUE,       -- 对应 imported_game.id
    analyzed_at TEXT NOT NULL,
    report_json TEXT NOT NULL,             -- 完整 AnalysisReport 的 JSON
    winrate_curve_json TEXT NOT NULL,      -- 胜率曲线
    moves_json TEXT NOT NULL,              -- 每手分析（失误分类等）
    blunder_count INTEGER NOT NULL DEFAULT 0,
    inaccuracy_count INTEGER NOT NULL DEFAULT 0,
    summary TEXT NOT NULL DEFAULT '',      -- 复盘总结
    FOREIGN KEY(game_id) REFERENCES imported_game(id) ON DELETE CASCADE
);

