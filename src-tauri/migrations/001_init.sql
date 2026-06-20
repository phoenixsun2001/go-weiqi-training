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

