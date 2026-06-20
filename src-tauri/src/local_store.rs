use crate::error::AppResult;
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
        Ok(Self {
            conn: Mutex::new(conn),
        })
    }

    /// 暴露内部连接引用，供 problem_db 等模块共享同一数据库
    pub fn conn_ref(&self) -> &Mutex<Connection> {
        &self.conn
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
        conn.execute(
            "UPDATE profile SET elo=?1, updated_at=?2 WHERE id=1",
            params![elo_after, now],
        )?;
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
        for row in rows {
            v.push(row?);
        }
        Ok(v)
    }
}

fn now_iso() -> String {
    // 简易 UTC 时间戳（避免引入 chrono 依赖）
    use std::time::{SystemTime, UNIX_EPOCH};
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs();
    format!("epoch:{secs}")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn init_creates_tables() {
        let tmp = tempfile::NamedTempFile::new().unwrap();
        let store = LocalStore::open(tmp.path().to_str().unwrap()).unwrap();
        store.upsert_profile("测试用户", 1500).unwrap();
        let p = store.load_profile().unwrap();
        assert_eq!(p.unwrap().name, "测试用户");
    }

    #[test]
    fn record_game_updates_elo() {
        let tmp = tempfile::NamedTempFile::new().unwrap();
        let store = LocalStore::open(tmp.path().to_str().unwrap()).unwrap();
        store.upsert_profile("u", 1500).unwrap();
        store
            .record_game("win", 3, 1500, 1516, "(;GM[1])")
            .unwrap();
        let games = store.list_games(10).unwrap();
        assert_eq!(games.len(), 1);
        assert_eq!(games[0].result, "win");
        let p = store.load_profile().unwrap().unwrap();
        assert_eq!(p.elo, 1516);
    }
}
