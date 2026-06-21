use crate::error::AppResult;
use crate::sgf::{parse_metadata, SgfMetadata};
use rusqlite::{params, Connection};
use std::sync::Mutex;

pub struct ImportedGameRow {
    pub id: i64,
    pub imported_at: String,
    pub source: String,
    pub black_name: String,
    pub white_name: String,
    pub black_rank: String,
    pub white_rank: String,
    pub result: String,
    pub board_size: i64,
    pub played_date: String,
    pub move_count: i64,
    pub sgf: String,
    pub reviewed: bool,
    pub tags: String,
    pub notes: String,
}

pub struct ImportedGameStore<'a> {
    conn: &'a Mutex<Connection>,
}

impl<'a> ImportedGameStore<'a> {
    pub fn new(conn: &'a Mutex<Connection>) -> Self {
        Self { conn }
    }

    pub fn insert(&self, source: &str, meta: &SgfMetadata, sgf: &str) -> AppResult<i64> {
        let conn = self.conn.lock().unwrap();
        let now = now_iso();
        conn.execute(
            "INSERT INTO imported_game(imported_at,source,black_name,white_name,black_rank,white_rank,result,board_size,played_date,move_count,sgf,reviewed,tags,notes)
             VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,0,'','')",
            params![
                now,
                source,
                meta.black_name,
                meta.white_name,
                meta.black_rank,
                meta.white_rank,
                meta.result,
                meta.board_size as i64,
                meta.played_date,
                meta.move_count as i64,
                sgf,
            ],
        )?;
        Ok(conn.last_insert_rowid())
    }

    pub fn list(&self) -> AppResult<Vec<ImportedGameRow>> {
        let conn = self.conn.lock().unwrap();
        let mut sel = conn.prepare(
            "SELECT id,imported_at,source,black_name,white_name,black_rank,white_rank,result,board_size,played_date,move_count,sgf,reviewed,tags,notes
             FROM imported_game ORDER BY imported_at DESC",
        )?;
        let rows = sel.query_map([], map_row)?;
        let mut v = vec![];
        for row in rows {
            v.push(row?);
        }
        Ok(v)
    }

    pub fn get(&self, id: i64) -> AppResult<Option<ImportedGameRow>> {
        let conn = self.conn.lock().unwrap();
        let mut sel = conn.prepare(
            "SELECT id,imported_at,source,black_name,white_name,black_rank,white_rank,result,board_size,played_date,move_count,sgf,reviewed,tags,notes
             FROM imported_game WHERE id=?1",
        )?;
        let mut iter = sel.query_and_then(params![id], map_row)?;
        Ok(iter.next().transpose()?)
    }

    pub fn delete(&self, id: i64) -> AppResult<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM imported_game WHERE id=?1", params![id])?;
        Ok(())
    }

    pub fn update_reviewed(&self, id: i64, reviewed: bool) -> AppResult<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "UPDATE imported_game SET reviewed=?1 WHERE id=?2",
            params![reviewed as i32, id],
        )?;
        Ok(())
    }

    pub fn update_tags_notes(&self, id: i64, tags: &str, notes: &str) -> AppResult<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "UPDATE imported_game SET tags=?1, notes=?2 WHERE id=?3",
            params![tags, notes, id],
        )?;
        Ok(())
    }

    // ===== 复盘结果持久化 =====

    /// 保存或更新复盘结果（按 game_id 唯一）
    pub fn save_review_result(
        &self,
        game_id: i64,
        report_json: &str,
        winrate_curve_json: &str,
        moves_json: &str,
        blunder_count: i64,
        inaccuracy_count: i64,
        summary: &str,
    ) -> AppResult<i64> {
        let conn = self.conn.lock().unwrap();
        let now = now_iso();
        conn.execute(
            "INSERT INTO review_result(game_id,analyzed_at,report_json,winrate_curve_json,moves_json,blunder_count,inaccuracy_count,summary)
             VALUES(?1,?2,?3,?4,?5,?6,?7,?8)
             ON CONFLICT(game_id) DO UPDATE SET
                analyzed_at=?2, report_json=?3, winrate_curve_json=?4, moves_json=?5,
                blunder_count=?6, inaccuracy_count=?7, summary=?8",
            params![game_id, now, report_json, winrate_curve_json, moves_json, blunder_count, inaccuracy_count, summary],
        )?;
        Ok(conn.last_insert_rowid())
    }

    pub fn get_review_result(&self, game_id: i64) -> AppResult<Option<ReviewResultRow>> {
        let conn = self.conn.lock().unwrap();
        let mut sel = conn.prepare(
            "SELECT id,game_id,analyzed_at,report_json,winrate_curve_json,moves_json,blunder_count,inaccuracy_count,summary
             FROM review_result WHERE game_id=?1",
        )?;
        let mut iter = sel.query_and_then(params![game_id], map_review_row)?;
        Ok(iter.next().transpose()?)
    }
}

pub struct ReviewResultRow {
    pub id: i64,
    pub game_id: i64,
    pub analyzed_at: String,
    pub report_json: String,
    pub winrate_curve_json: String,
    pub moves_json: String,
    pub blunder_count: i64,
    pub inaccuracy_count: i64,
    pub summary: String,
}


fn map_row(r: &rusqlite::Row) -> rusqlite::Result<ImportedGameRow> {
    Ok(ImportedGameRow {
        id: r.get(0)?,
        imported_at: r.get(1)?,
        source: r.get(2)?,
        black_name: r.get(3)?,
        white_name: r.get(4)?,
        black_rank: r.get(5)?,
        white_rank: r.get(6)?,
        result: r.get(7)?,
        board_size: r.get(8)?,
        played_date: r.get(9)?,
        move_count: r.get(10)?,
        sgf: r.get(11)?,
        reviewed: r.get::<_, i32>(12)? != 0,
        tags: r.get(13)?,
        notes: r.get(14)?,
    })
}

fn map_review_row(r: &rusqlite::Row) -> rusqlite::Result<ReviewResultRow> {
    Ok(ReviewResultRow {
        id: r.get(0)?,
        game_id: r.get(1)?,
        analyzed_at: r.get(2)?,
        report_json: r.get(3)?,
        winrate_curve_json: r.get(4)?,
        moves_json: r.get(5)?,
        blunder_count: r.get(6)?,
        inaccuracy_count: r.get(7)?,
        summary: r.get(8)?,
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::sgf::parse_metadata;

    fn open() -> (&'static Mutex<Connection>, tempfile::NamedTempFile) {
        let tmp = tempfile::NamedTempFile::new().unwrap();
        let conn = Connection::open(tmp.path()).unwrap();
        let sql = include_str!("../migrations/001_init.sql");
        conn.execute_batch(sql).unwrap();
        let leaked: &'static Mutex<Connection> = Box::leak(Box::new(Mutex::new(conn)));
        (leaked, tmp)
    }

    #[test]
    fn insert_and_list() {
        let (conn, _tmp) = open();
        let store = ImportedGameStore::new(conn);
        let sgf = "(;GM[1]SZ[19]PB[Alpha]PW[Beta]RE[B+3.5];B[qd];W[dd])";
        let meta = parse_metadata(sgf);
        let id = store.insert("foxwq", &meta, sgf).unwrap();
        assert!(id > 0);
        let list = store.list().unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].black_name, "Alpha");
        assert_eq!(list[0].white_name, "Beta");
        assert_eq!(list[0].result, "B+3.5");
        assert!(!list[0].reviewed);
    }

    #[test]
    fn update_and_get() {
        let (conn, _tmp) = open();
        let store = ImportedGameStore::new(conn);
        let sgf = "(;GM[1]SZ[19];B[qd])";
        let meta = parse_metadata(sgf);
        let id = store.insert("foxwq", &meta, sgf).unwrap();
        store.update_reviewed(id, true).unwrap();
        store.update_tags_notes(id, "布局,官子", "官子失误多").unwrap();
        let row = store.get(id).unwrap().unwrap();
        assert!(row.reviewed);
        assert_eq!(row.tags, "布局,官子");
        assert_eq!(row.notes, "官子失误多");
    }

    #[test]
    fn delete_works() {
        let (conn, _tmp) = open();
        let store = ImportedGameStore::new(conn);
        let sgf = "(;GM[1]SZ[9];B[ee])";
        let meta = parse_metadata(sgf);
        let id = store.insert("foxwq", &meta, sgf).unwrap();
        store.delete(id).unwrap();
        assert!(store.get(id).unwrap().is_none());
    }
}
