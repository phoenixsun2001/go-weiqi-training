use crate::error::{AppError, AppResult};
use rusqlite::{params, Connection};
use std::sync::Mutex;

/// 题目分类（与 weakness 表对齐，驱动针对性出题）
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Category {
    Tsumego,  // 死活
    Tesuji,   // 手筋
    Fuseki,   // 布局
    Endgame,  // 官子
}

impl Category {
    pub fn as_str(self) -> &'static str {
        match self {
            Category::Tsumego => "tsumego",
            Category::Tesuji => "tesuji",
            Category::Fuseki => "fuseki",
            Category::Endgame => "endgame",
        }
    }

    pub fn label(self) -> &'static str {
        match self {
            Category::Tsumego => "死活",
            Category::Tesuji => "手筋",
            Category::Fuseki => "布局",
            Category::Endgame => "官子",
        }
    }

    pub fn from_str(s: &str) -> AppResult<Category> {
        match s {
            "tsumego" => Ok(Category::Tsumego),
            "tesuji" => Ok(Category::Tesuji),
            "fuseki" => Ok(Category::Fuseki),
            "endgame" => Ok(Category::Endgame),
            other => Err(AppError::Rule(format!("未知题目分类: {other}"))),
        }
    }

    pub fn all() -> [Category; 4] {
        [Category::Tsumego, Category::Tesuji, Category::Fuseki, Category::Endgame]
    }
}

pub struct ProblemRow {
    pub id: i64,
    pub category: String,
    pub difficulty: i32,
    pub question_sgf: String,
    pub answer_vertex: String,
    pub explanation: String,
}

pub struct WeaknessRow {
    pub category: String,
    pub blunder_count: i32,
    pub inaccuracy_count: i32,
}

pub struct WrongBookRow {
    pub id: i64,
    pub problem_id: i64,
    pub attempted_at: String,
    pub user_answer: String,
    pub correct: bool,
}

/// 题库 + 弱点统计访问器（复用主库连接）
pub struct ProblemDb<'a> {
    conn: &'a Mutex<Connection>,
}

impl<'a> ProblemDb<'a> {
    pub fn new(conn: &'a Mutex<Connection>) -> Self {
        Self { conn }
    }

    /// 插入题目（若库为空则可调 seed）
    pub fn insert_problem(
        &self,
        category: Category,
        difficulty: i32,
        question_sgf: &str,
        answer_vertex: &str,
        explanation: &str,
    ) -> AppResult<i64> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO problem(category,difficulty,question_sgf,answer_vertex,explanation)
             VALUES(?1,?2,?3,?4,?5)",
            params![category.as_str(), difficulty, question_sgf, answer_vertex, explanation],
        )?;
        Ok(conn.last_insert_rowid())
    }

    pub fn count(&self) -> AppResult<i64> {
        let conn = self.conn.lock().unwrap();
        let n: i64 = conn.query_row("SELECT COUNT(*) FROM problem", [], |r| r.get(0))?;
        Ok(n)
    }

    /// 按分类+难度上限随机取一题。
    /// 优先从用户弱点（blunder_count 高）的分类出题——这是"针对性训练"的核心。
    pub fn next_problem(&self, max_difficulty: i32) -> AppResult<Option<ProblemRow>> {
        let conn = self.conn.lock().unwrap();
        // 1) 读弱点，按 blunder_count 降序得到分类优先级
        let mut stmt = conn.prepare("SELECT category FROM weakness ORDER BY blunder_count DESC, inaccuracy_count DESC")?;
        let mut priority: Vec<String> = stmt
            .query_map([], |r| r.get::<_, String>(0))?
            .filter_map(|r| r.ok())
            .collect();
        drop(stmt);
        // 2) 补全未出现在弱点表中的分类，保证全覆盖
        for c in Category::all() {
            let s = c.as_str().to_string();
            if !priority.contains(&s) {
                priority.push(s);
            }
        }
        // 3) 按优先级顺序尝试取题
        let mut sel = conn.prepare(
            "SELECT id,category,difficulty,question_sgf,answer_vertex,explanation
             FROM problem
             WHERE category=?1 AND difficulty<=?2
             ORDER BY RANDOM() LIMIT 1",
        )?;
        for cat in &priority {
            let mut iter = sel.query_and_then(params![cat, max_difficulty], map_problem)?;
            if let Some(r) = iter.next().transpose()? {
                return Ok(Some(r));
            }
        }
        Ok(None)
    }

    /// 按分类+难度上限取一道具体题（用于错题本回顾）
    pub fn get_problem(&self, id: i64) -> AppResult<Option<ProblemRow>> {
        let conn = self.conn.lock().unwrap();
        let mut sel = conn.prepare(
            "SELECT id,category,difficulty,question_sgf,answer_vertex,explanation
             FROM problem WHERE id=?1",
        )?;
        let mut iter = sel.query_and_then(params![id], map_problem)?;
        Ok(iter.next().transpose()?)
    }

    /// 判定作答是否正确（答案顶点集合中包含用户答案），并记入错题本。
    pub fn submit_answer(&self, problem_id: i64, user_answer: &str) -> AppResult<bool> {
        let conn = self.conn.lock().unwrap();
        let answer: String = conn.query_row(
            "SELECT answer_vertex FROM problem WHERE id=?1",
            params![problem_id],
            |r| r.get(0),
        )?;
        let correct = answer
            .split_whitespace()
            .any(|a| a.eq_ignore_ascii_case(user_answer.trim()));
        let now = now_iso();
        conn.execute(
            "INSERT INTO wrong_book(problem_id,attempted_at,user_answer,correct)
             VALUES(?1,?2,?3,?4)",
            params![problem_id, now, user_answer, correct as i32],
        )?;
        Ok(correct)
    }

    pub fn list_wrong_book(&self, limit: i64) -> AppResult<Vec<WrongBookRow>> {
        let conn = self.conn.lock().unwrap();
        let mut sel = conn.prepare(
            "SELECT id,problem_id,attempted_at,user_answer,correct
             FROM wrong_book ORDER BY id DESC LIMIT ?1",
        )?;
        let rows = sel.query_map(params![limit], |r| {
            Ok(WrongBookRow {
                id: r.get(0)?,
                problem_id: r.get(1)?,
                attempted_at: r.get(2)?,
                user_answer: r.get(3)?,
                correct: r.get::<_, i32>(4)? != 0,
            })
        })?;
        let mut v = vec![];
        for row in rows {
            v.push(row?);
        }
        Ok(v)
    }

    // ===== 弱点统计 =====

    /// 累加某分类的弱点计数（由复盘管线调用）
    pub fn add_weakness(&self, category: Category, is_blunder: bool) -> AppResult<()> {
        let conn = self.conn.lock().unwrap();
        let now = now_iso();
        conn.execute(
            "INSERT INTO weakness(category,blunder_count,inaccuracy_count,updated_at)
             VALUES(?1,?2,?3,?4)
             ON CONFLICT(category) DO UPDATE SET
                blunder_count=blunder_count+?2,
                inaccuracy_count=inaccuracy_count+?3,
                updated_at=?4",
            params![
                category.as_str(),
                if is_blunder { 1 } else { 0 },
                if is_blunder { 0 } else { 1 },
                now
            ],
        )?;
        Ok(())
    }

    pub fn list_weakness(&self) -> AppResult<Vec<WeaknessRow>> {
        let conn = self.conn.lock().unwrap();
        let mut sel = conn.prepare("SELECT category,blunder_count,inaccuracy_count FROM weakness")?;
        let rows = sel.query_map([], |r| {
            Ok(WeaknessRow {
                category: r.get(0)?,
                blunder_count: r.get(1)?,
                inaccuracy_count: r.get(2)?,
            })
        })?;
        let mut v = vec![];
        for row in rows {
            v.push(row?);
        }
        Ok(v)
    }
}

fn map_problem(r: &rusqlite::Row) -> rusqlite::Result<ProblemRow> {
    Ok(ProblemRow {
        id: r.get(0)?,
        category: r.get(1)?,
        difficulty: r.get(2)?,
        question_sgf: r.get(3)?,
        answer_vertex: r.get(4)?,
        explanation: r.get(5)?,
    })
}

fn now_iso() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs();
    format!("epoch:{secs}")
}

/// 首次启动时写入若干示例题目（覆盖四类、不同难度）。
/// 生产环境可从外部 SGF 题库导入。
pub fn seed_if_empty(conn: &Mutex<Connection>) -> AppResult<()> {
    let db = ProblemDb::new(conn);
    if db.count()? > 0 {
        return Ok(());
    }
    // 每条：分类、难度、局面SGF、正解顶点、解析
    let seeds: [(Category, i32, &str, &str, &str); 8] = [
        (Category::Tsumego, 1, "(;GM[1]SZ[9];B[ee])", "D5", "角部死活基础：要点夺眼。"),
        (Category::Tsumego, 2, "(;GM[1]SZ[9];B[aa])", "A1", "角上常见手筋，注意扳粘。"),
        (Category::Tsumego, 3, "(;GM[1]SZ[9];B[cc])", "C3", "边上点三三后的死活判断。"),
        (Category::Tesuji, 2, "(;GM[1]SZ[9];B[gg])", "G7", "手筋：征子成立时的弃子整形。"),
        (Category::Tesuji, 3, "(;GM[1]SZ[9];B[dd])", "D4", "手筋：滚打包收要点。"),
        (Category::Fuseki, 1, "(;GM[1]SZ[19];B[qd])", "D16", "布局：星位拆边是好点。"),
        (Category::Fuseki, 2, "(;GM[1]SZ[19];B[dp])", "D4", "布局：小目缔角兼顾实地与厚势。"),
        (Category::Endgame, 2, "(;GM[1]SZ[9];B[ea])", "A5", "官子：先手扳粘是收官要领。"),
    ];
    for (cat, diff, sgf, ans, expl) in seeds {
        db.insert_problem(cat, diff, sgf, ans, expl)?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn open() -> (tempfile::NamedTempFile, ProblemDb<'static>) {
        // 用 Box 漏写生命周期：测试中用一个持久的连接包装
        // 这里简化：直接构造一个独立连接容器
        let tmp = tempfile::NamedTempFile::new().unwrap();
        let conn = Connection::open(tmp.path()).unwrap();
        let sql = include_str!("../migrations/001_init.sql");
        conn.execute_batch(sql).unwrap();
        // 漏到堆上以获得 'static
        let boxed: Box<Mutex<Connection>> = Box::new(Mutex::new(conn));
        let leaked: &'static Mutex<Connection> = Box::leak(boxed);
        (tmp, ProblemDb::new(leaked))
    }

    #[test]
    fn category_roundtrip() {
        for c in Category::all() {
            assert_eq!(Category::from_str(c.as_str()).unwrap(), c);
        }
    }

    #[test]
    fn seed_inserts_problems() {
        let (_tmp, db) = open();
        let leaked = db.conn;
        assert!(seed_if_empty(leaked).is_ok());
        assert_eq!(leaked.lock().unwrap().query_row::<i64, _, _>(
            "SELECT COUNT(*) FROM problem", [], |r| r.get(0)).unwrap(), 8);
        // 再次调用不应重复
        let _ = seed_if_empty(leaked);
        assert_eq!(db.count().unwrap(), 8);
    }

    #[test]
    fn submit_answer_correct_and_wrong() {
        let (_tmp, db) = open();
        let id = db.insert_problem(Category::Tsumego, 1, "(;GM[1]SZ[9])", "D5 E4", "解析").unwrap();
        assert!(db.submit_answer(id, "D5").unwrap(), "D5 在答案集中");
        assert!(db.submit_answer(id, "e4").unwrap(), "大小写不敏感也应正确");
        assert!(!db.submit_answer(id, "Q16").unwrap(), "Q16 不是答案");
        // 错题本应有 3 条（1 正确 + 1 正确 + 1 错误）
        let wb = db.list_wrong_book(10).unwrap();
        assert_eq!(wb.len(), 3);
        assert!(!wb[0].correct); // 最近一条是错误
    }

    #[test]
    fn weakness_drives_priority() {
        let (_tmp, db) = open();
        let leaked = db.conn;
        let _ = seed_if_empty(leaked);
        // 制造官子弱点（blunder 多）
        db.add_weakness(Category::Endgame, true).unwrap();
        db.add_weakness(Category::Endgame, true).unwrap();
        db.add_weakness(Category::Tsumego, false).unwrap();
        // 选题：官子 blunder 最多，应优先出官子题
        let p = db.next_problem(9).unwrap().unwrap();
        assert_eq!(p.category, "endgame", "应优先出弱点分类的题");
    }

    #[test]
    fn next_problem_respects_difficulty() {
        let (_tmp, db) = open();
        let leaked = db.conn;
        let _ = seed_if_empty(leaked);
        let p = db.next_problem(1).unwrap().unwrap();
        assert!(p.difficulty <= 1);
    }
}
