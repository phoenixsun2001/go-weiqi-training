"""SQLite 存储层：档案/对局/评级历史/题库/错题本/弱点/对局库/复盘结果"""
import json
import sqlite3
import time
from pathlib import Path

SCHEMA = """
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
CREATE TABLE IF NOT EXISTS problem (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category TEXT NOT NULL,
    difficulty INTEGER NOT NULL,
    question_sgf TEXT NOT NULL,
    answer_vertex TEXT NOT NULL,
    explanation TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS wrong_book (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    problem_id INTEGER NOT NULL,
    attempted_at TEXT NOT NULL,
    user_answer TEXT NOT NULL,
    correct INTEGER NOT NULL,
    FOREIGN KEY(problem_id) REFERENCES problem(id)
);
CREATE TABLE IF NOT EXISTS weakness (
    category TEXT PRIMARY KEY,
    blunder_count INTEGER NOT NULL DEFAULT 0,
    inaccuracy_count INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS imported_game (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    imported_at TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'foxwq',
    chess_id TEXT NOT NULL DEFAULT '',
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
CREATE TABLE IF NOT EXISTS review_result (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    game_id INTEGER NOT NULL UNIQUE,
    analyzed_at TEXT NOT NULL,
    report_json TEXT NOT NULL,
    winrate_curve_json TEXT NOT NULL,
    moves_json TEXT NOT NULL,
    blunder_count INTEGER NOT NULL DEFAULT 0,
    inaccuracy_count INTEGER NOT NULL DEFAULT 0,
    summary TEXT NOT NULL DEFAULT '',
    FOREIGN KEY(game_id) REFERENCES imported_game(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS training_task (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    week INTEGER NOT NULL,
    day INTEGER NOT NULL,
    category TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    target_module TEXT NOT NULL DEFAULT 'practice',
    difficulty INTEGER DEFAULT 3,
    status TEXT NOT NULL DEFAULT 'pending',
    completed_at TEXT,
    sort_order INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS ai_review (
    game_id INTEGER PRIMARY KEY,
    analyzed_at TEXT NOT NULL,
    reviewee TEXT DEFAULT '',
    reviewee_color TEXT DEFAULT '',
    reviewee_won INTEGER DEFAULT 0,
    total_moves INTEGER DEFAULT 0,
    phase_scores_json TEXT NOT NULL DEFAULT '{}',
    issues_json TEXT NOT NULL DEFAULT '[]',
    phases_json TEXT NOT NULL DEFAULT '[]',
    key_moves_json TEXT NOT NULL DEFAULT '[]',
    territory_json TEXT NOT NULL DEFAULT '{}',
    summary TEXT DEFAULT '',
    FOREIGN KEY(game_id) REFERENCES imported_game(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS foxwq_sync_config (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    enabled INTEGER NOT NULL DEFAULT 0,
    nickname TEXT NOT NULL DEFAULT '',
    uid TEXT NOT NULL DEFAULT '',
    interval_hours REAL NOT NULL DEFAULT 24,
    limit_count INTEGER NOT NULL DEFAULT 30,
    updated_at TEXT
);
CREATE TABLE IF NOT EXISTS foxwq_sync_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    started_at TEXT NOT NULL,
    finished_at TEXT,
    status TEXT NOT NULL DEFAULT 'running',
    trigger_type TEXT NOT NULL DEFAULT 'manual',
    imported INTEGER DEFAULT 0,
    skipped INTEGER DEFAULT 0,
    failed INTEGER DEFAULT 0,
    message TEXT DEFAULT ''
);
"""

CATEGORY_LABELS = {
    "tsumego": "死活",
    "tesuji": "手筋",
    "fuseki": "布局",
    "endgame": "官子",
}


def _now() -> str:
    return f"epoch:{int(time.time())}"


class Store:
    def __init__(self, db_path: str):
        self.conn = sqlite3.connect(db_path, check_same_thread=False)
        self.conn.row_factory = sqlite3.Row
        # 先迁移旧表（在执行新schema之前）
        self._migrate()
        self.conn.executescript(SCHEMA)
        self.conn.execute("CREATE INDEX IF NOT EXISTS idx_imported_game_chess_id ON imported_game(chess_id)")
        self.conn.commit()
        self._bootstrap()

    def _migrate(self):
        """增量迁移：为旧数据库添加缺失的列（在 executescript 之前运行）"""
        # 检查 imported_game 表是否存在
        table_exists = self.conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='imported_game'"
        ).fetchone()
        if table_exists:
            cols = [r[1] for r in self.conn.execute("PRAGMA table_info(imported_game)").fetchall()]
            if "chess_id" not in cols:
                self.conn.execute("ALTER TABLE imported_game ADD COLUMN chess_id TEXT NOT NULL DEFAULT ''")
                self.conn.commit()

    def _bootstrap(self):
        """首次启动创建默认档案"""
        row = self.conn.execute("SELECT id FROM profile WHERE id=1").fetchone()
        if row is None:
            self.conn.execute(
                "INSERT INTO profile(id,name,elo,updated_at) VALUES(1,'棋手',1500,?)",
                (_now(),),
            )
            self.conn.commit()

    # ===== Profile / Rating =====
    def load_profile(self) -> dict | None:
        row = self.conn.execute("SELECT name,elo FROM profile WHERE id=1").fetchone()
        if row:
            return {"name": row["name"], "elo": row["elo"]}
        return None

    def update_elo(self, new_elo: int):
        self.conn.execute("UPDATE profile SET elo=?, updated_at=? WHERE id=1", (new_elo, _now()))
        self.conn.execute("INSERT INTO rating_history(recorded_at,elo) VALUES(?,?)", (_now(), new_elo))
        self.conn.commit()

    def get_rating_history(self, limit: int = 100) -> list[dict]:
        rows = self.conn.execute(
            "SELECT recorded_at,elo FROM rating_history ORDER BY id DESC LIMIT ?", (limit,)
        ).fetchall()
        return [{"recorded_at": r["recorded_at"], "elo": r["elo"]} for r in reversed(rows)]

    def record_game(self, result: str, opp_dan: int, elo_before: int, elo_after: int, sgf: str):
        self.conn.execute(
            "INSERT INTO game(played_at,user_color,result,opponent_target_dan,user_elo_before,user_elo_after,sgf) "
            "VALUES(?,'black',?,?,?,?,?)",
            (_now(), result, opp_dan, elo_before, elo_after, sgf),
        )
        self.update_elo(elo_after)

    # ===== Problems =====
    def problem_sgf_exists(self, question_sgf: str) -> bool:
        """按 SGF 内容判重（seed 导入可重复执行）"""
        row = self.conn.execute(
            "SELECT 1 FROM problem WHERE question_sgf=? LIMIT 1", (question_sgf,)
        ).fetchone()
        return row is not None

    def insert_problem(self, category: str, difficulty: int, question_sgf: str, answer_vertex: str, explanation: str) -> int:
        cur = self.conn.execute(
            "INSERT INTO problem(category,difficulty,question_sgf,answer_vertex,explanation) VALUES(?,?,?,?,?)",
            (category, difficulty, question_sgf, answer_vertex, explanation),
        )
        self.conn.commit()
        return cur.lastrowid

    def count_problems(self) -> int:
        return self.conn.execute("SELECT COUNT(*) FROM problem").fetchone()[0]

    def next_problem(self, max_difficulty: int) -> dict | None:
        """按弱点优先级选题"""
        # 读弱点按 blunder_count 降序
        weakness_rows = self.conn.execute(
            "SELECT category FROM weakness ORDER BY blunder_count DESC, inaccuracy_count DESC"
        ).fetchall()
        priority = [r["category"] for r in weakness_rows]
        for cat in ["tsumego", "tesuji", "fuseki", "endgame"]:
            if cat not in priority:
                priority.append(cat)
        for cat in priority:
            row = self.conn.execute(
                "SELECT * FROM problem WHERE category=? AND difficulty<=? ORDER BY RANDOM() LIMIT 1",
                (cat, max_difficulty),
            ).fetchone()
            if row:
                return dict(row)
        return None

    def get_problem(self, pid: int) -> dict | None:
        row = self.conn.execute("SELECT * FROM problem WHERE id=?", (pid,)).fetchone()
        return dict(row) if row else None

    def submit_answer(self, problem_id: int, user_answer: str) -> tuple[bool, str]:
        row = self.conn.execute("SELECT answer_vertex FROM problem WHERE id=?", (problem_id,)).fetchone()
        if not row:
            raise ValueError("题目不存在")
        answers = row["answer_vertex"].split()
        correct = any(a.lower() == user_answer.strip().lower() for a in answers)
        self.conn.execute(
            "INSERT INTO wrong_book(problem_id,attempted_at,user_answer,correct) VALUES(?,?,?,?)",
            (problem_id, _now(), user_answer, int(correct)),
        )
        self.conn.commit()
        return correct, row["answer_vertex"]

    def list_wrong_book(self, limit: int = 50) -> list[dict]:
        rows = self.conn.execute(
            "SELECT * FROM wrong_book ORDER BY id DESC LIMIT ?", (limit,)
        ).fetchall()
        return [dict(r) for r in rows]

    # ===== Weakness =====
    def add_weakness(self, category: str, is_blunder: bool):
        blunder_inc = 1 if is_blunder else 0
        inaccuracy_inc = 0 if is_blunder else 1
        self.conn.execute(
            "INSERT INTO weakness(category,blunder_count,inaccuracy_count,updated_at) VALUES(?,?,?,?) "
            "ON CONFLICT(category) DO UPDATE SET blunder_count=blunder_count+?, inaccuracy_count=inaccuracy_count+?, updated_at=?",
            (category, blunder_inc, inaccuracy_inc, _now(), blunder_inc, inaccuracy_inc, _now()),
        )
        self.conn.commit()

    def list_weakness(self) -> list[dict]:
        rows = self.conn.execute("SELECT * FROM weakness").fetchall()
        return [dict(r) for r in rows]

    # ===== Imported Game Library =====
    def has_chess_id(self, chess_id: str) -> bool:
        """检查某 chess_id 是否已存在（增量去重）"""
        if not chess_id:
            return False
        row = self.conn.execute(
            "SELECT 1 FROM imported_game WHERE chess_id=? LIMIT 1", (chess_id,)
        ).fetchone()
        return row is not None

    def import_game(self, source: str, meta: dict, sgf: str, chess_id: str = "") -> int:
        cur = self.conn.execute(
            "INSERT INTO imported_game(imported_at,source,chess_id,black_name,white_name,black_rank,white_rank,"
            "result,board_size,played_date,move_count,sgf,reviewed,tags,notes) "
            "VALUES(?,?,?,?,?,?,?,?,?,?,?,?,0,'','')",
            (_now(), source, chess_id, meta["black_name"], meta["white_name"], meta["black_rank"],
             meta["white_rank"], meta["result"], meta["board_size"], meta["played_date"],
             meta["move_count"], sgf),
        )
        self.conn.commit()
        return cur.lastrowid

    def list_imported_games(self) -> list[dict]:
        rows = self.conn.execute(
            "SELECT * FROM imported_game ORDER BY imported_at DESC"
        ).fetchall()
        return [dict(r) for r in rows]

    def get_imported_game(self, gid: int) -> dict | None:
        row = self.conn.execute("SELECT * FROM imported_game WHERE id=?", (gid,)).fetchone()
        return dict(row) if row else None

    def delete_imported_game(self, gid: int):
        self.conn.execute("DELETE FROM imported_game WHERE id=?", (gid,))
        self.conn.execute("DELETE FROM review_result WHERE game_id=?", (gid,))
        self.conn.commit()

    def update_game_meta(self, gid: int, reviewed=None, tags=None, notes=None):
        if reviewed is not None:
            self.conn.execute("UPDATE imported_game SET reviewed=? WHERE id=?", (int(reviewed), gid))
        if tags is not None or notes is not None:
            existing = self.get_imported_game(gid)
            if existing:
                self.conn.execute(
                    "UPDATE imported_game SET tags=?, notes=? WHERE id=?",
                    (tags if tags is not None else existing["tags"],
                     notes if notes is not None else existing["notes"], gid),
                )
        self.conn.commit()

    # ===== Review Result =====
    def save_review_result(self, game_id: int, winrate_curve_json: str, moves_json: str,
                           blunder_count: int, inaccuracy_count: int, summary: str):
        import json
        full_json = json.dumps({"blunder_count": blunder_count, "inaccuracy_count": inaccuracy_count})
        self.conn.execute(
            "INSERT INTO review_result(game_id,analyzed_at,report_json,winrate_curve_json,moves_json,"
            "blunder_count,inaccuracy_count,summary) VALUES(?,?,?,?,?,?,?,?) "
            "ON CONFLICT(game_id) DO UPDATE SET analyzed_at=?, report_json=?, winrate_curve_json=?, "
            "moves_json=?, blunder_count=?, inaccuracy_count=?, summary=?",
            (game_id, _now(), full_json, winrate_curve_json, moves_json, blunder_count, inaccuracy_count, summary,
             _now(), full_json, winrate_curve_json, moves_json, blunder_count, inaccuracy_count, summary),
        )
        self.conn.commit()

    def get_review_result(self, game_id: int) -> dict | None:
        row = self.conn.execute("SELECT * FROM review_result WHERE game_id=?", (game_id,)).fetchone()
        return dict(row) if row else None

    # ===== Training Plan =====
    def clear_training_tasks(self):
        self.conn.execute("DELETE FROM training_task")
        self.conn.commit()

    def insert_training_task(self, week, day, category, title, description, target_module, difficulty, sort_order):
        cur = self.conn.execute(
            "INSERT INTO training_task(week,day,category,title,description,target_module,difficulty,status,sort_order) "
            "VALUES(?,?,?,?,?,?,?,'pending',?)",
            (week, day, category, title, description, target_module, difficulty, sort_order),
        )
        self.conn.commit()
        return cur.lastrowid

    def list_training_tasks(self):
        rows = self.conn.execute("SELECT * FROM training_task ORDER BY week, day, sort_order").fetchall()
        return [dict(r) for r in rows]

    def update_task_status(self, task_id, status):
        completed_at = _now() if status == "done" else None
        self.conn.execute(
            "UPDATE training_task SET status=?, completed_at=? WHERE id=?",
            (status, completed_at, task_id),
        )
        self.conn.commit()

    def training_task_count(self):
        return self.conn.execute("SELECT COUNT(*) FROM training_task").fetchone()[0]

    # ===== AI 复盘持久化 =====
    def upsert_ai_review(self, game_id: int, result: dict):
        """保存/更新 AI 棋理复盘结果（结构化列 + 全量 JSON）"""
        phase_scores = {p["phase"]: p["score"] for p in result.get("phases", [])}
        issues = sorted({i for p in result.get("phases", []) for i in p.get("issues", [])})
        self.conn.execute(
            "INSERT INTO ai_review(game_id,analyzed_at,reviewee,reviewee_color,reviewee_won,"
            "total_moves,phase_scores_json,issues_json,phases_json,key_moves_json,territory_json,summary) "
            "VALUES(?,?,?,?,?,?,?,?,?,?,?,?) "
            "ON CONFLICT(game_id) DO UPDATE SET analyzed_at=?,reviewee=?,reviewee_color=?,reviewee_won=?,"
            "total_moves=?,phase_scores_json=?,issues_json=?,phases_json=?,key_moves_json=?,"
            "territory_json=?,summary=?",
            (
                game_id, _now(), result.get("reviewee", ""), result.get("reviewee_color", ""),
                1 if result.get("reviewee_won") else 0, result.get("total_moves", 0),
                json.dumps(phase_scores, ensure_ascii=False), json.dumps(issues, ensure_ascii=False),
                json.dumps(result.get("phases", []), ensure_ascii=False),
                json.dumps(result.get("key_moves", []), ensure_ascii=False),
                json.dumps(result.get("territory_estimate", {}), ensure_ascii=False),
                result.get("summary", ""),
                _now(), result.get("reviewee", ""), result.get("reviewee_color", ""),
                1 if result.get("reviewee_won") else 0, result.get("total_moves", 0),
                json.dumps(phase_scores, ensure_ascii=False), json.dumps(issues, ensure_ascii=False),
                json.dumps(result.get("phases", []), ensure_ascii=False),
                json.dumps(result.get("key_moves", []), ensure_ascii=False),
                json.dumps(result.get("territory_estimate", {}), ensure_ascii=False),
                result.get("summary", ""),
            ),
        )
        self.conn.commit()

    def get_ai_review(self, game_id: int) -> dict | None:
        row = self.conn.execute("SELECT * FROM ai_review WHERE game_id=?", (game_id,)).fetchone()
        return dict(row) if row else None

    def has_ai_review(self, game_id: int) -> bool:
        row = self.conn.execute("SELECT 1 FROM ai_review WHERE game_id=? LIMIT 1", (game_id,)).fetchone()
        return row is not None

    def ai_review_count(self) -> int:
        return self.conn.execute("SELECT COUNT(*) FROM ai_review").fetchone()[0]

    def list_ai_reviews_with_games(self) -> list[dict]:
        """AI 复盘 + 对局元数据联查（趋势分析用，按日期降序）"""
        rows = self.conn.execute(
            "SELECT a.game_id, a.analyzed_at, a.reviewee_won, a.total_moves,"
            " a.phase_scores_json, a.issues_json,"
            " g.played_date, g.imported_at, g.result"
            " FROM ai_review a JOIN imported_game g ON g.id = a.game_id"
            " ORDER BY COALESCE(NULLIF(g.played_date,''), substr(g.imported_at,1,10)) DESC"
        ).fetchall()
        out = []
        for r in rows:
            d = dict(r)
            d["phase_scores"] = json.loads(d.pop("phase_scores_json") or "{}")
            d["issues"] = json.loads(d.pop("issues_json") or "[]")
            out.append(d)
        return out

    # ===== 野狐定时同步 =====
    def get_sync_config(self) -> dict:
        row = self.conn.execute("SELECT * FROM foxwq_sync_config WHERE id=1").fetchone()
        return dict(row) if row else {
            "id": 1, "enabled": 0, "nickname": "", "uid": "",
            "interval_hours": 24, "limit_count": 30, "updated_at": None,
        }

    def set_sync_config(self, enabled=None, nickname=None, uid=None,
                        interval_hours=None, limit_count=None) -> dict:
        cur = self.get_sync_config()
        self.conn.execute(
            "INSERT INTO foxwq_sync_config(id,enabled,nickname,uid,interval_hours,limit_count,updated_at)"
            " VALUES(1,?,?,?,?,?,?)"
            " ON CONFLICT(id) DO UPDATE SET enabled=?,nickname=?,uid=?,interval_hours=?,limit_count=?,updated_at=?",
            (
                enabled if enabled is not None else cur["enabled"],
                nickname if nickname is not None else cur["nickname"],
                uid if uid is not None else cur["uid"],
                interval_hours if interval_hours is not None else cur["interval_hours"],
                limit_count if limit_count is not None else cur["limit_count"],
                _now(),
                enabled if enabled is not None else cur["enabled"],
                nickname if nickname is not None else cur["nickname"],
                uid if uid is not None else cur["uid"],
                interval_hours if interval_hours is not None else cur["interval_hours"],
                limit_count if limit_count is not None else cur["limit_count"],
                _now(),
            ),
        )
        self.conn.commit()
        return self.get_sync_config()

    def insert_sync_log(self, trigger_type: str = "manual") -> int:
        cur = self.conn.execute(
            "INSERT INTO foxwq_sync_log(started_at,status,trigger_type) VALUES(?,'running',?)",
            (_now(), trigger_type),
        )
        self.conn.commit()
        return cur.lastrowid

    def finish_sync_log(self, log_id: int, status: str, imported=0, skipped=0, failed=0, message=""):
        self.conn.execute(
            "UPDATE foxwq_sync_log SET finished_at=?,status=?,imported=?,skipped=?,failed=?,message=? WHERE id=?",
            (_now(), status, imported, skipped, failed, message, log_id),
        )
        self.conn.commit()

    def list_sync_logs(self, limit: int = 10) -> list[dict]:
        rows = self.conn.execute(
            "SELECT * FROM foxwq_sync_log ORDER BY id DESC LIMIT ?", (limit,)
        ).fetchall()
        return [dict(r) for r in rows]
