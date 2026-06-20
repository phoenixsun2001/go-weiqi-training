pub mod commands;
pub mod coords;
pub mod engine_manager;
pub mod error;
pub mod game_state;
pub mod local_store;
pub mod opponent_ai;
pub mod problem_db;
pub mod rating_service;
pub mod review_pipeline;
pub mod sgf;

use commands::AppState;
use local_store::LocalStore;
use std::sync::Mutex;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // 数据库放在工作目录（生产应使用 app data dir）
    let db_path = dirs_fallback();
    let store = LocalStore::open(&db_path).expect("无法打开数据库");
    // 首次启动创建默认档案
    if store.load_profile().unwrap().is_none() {
        store.upsert_profile("棋手", 1500).unwrap();
    }
    // 首次启动写入示例题库
    {
        let conn = store.conn_ref();
        let _ = problem_db::seed_if_empty(conn);
    }

    tauri::Builder::default()
        .manage(AppState {
            store: Mutex::new(store),
            game: Mutex::new(game_state::GameState::new(19)),
            engine: Mutex::new(None),
            difficulty: Mutex::new(3),
        })
        .invoke_handler(tauri::generate_handler![
            commands::play_move,
            commands::pass_move,
            commands::board_snapshot,
            commands::record_game,
            commands::get_elo,
            commands::new_game,
            commands::start_engine,
            commands::stop_engine,
            commands::engine_status,
            commands::set_difficulty,
            commands::ai_move,
            commands::next_problem,
            commands::submit_answer,
            commands::wrong_book,
            commands::weakness_report,
            commands::record_weakness,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

fn dirs_fallback() -> String {
    // 简易：放当前工作目录（生产应使用 app data dir）
    let path = std::env::current_dir()
        .unwrap_or_else(|_| std::path::PathBuf::from("."))
        .join("training.db");
    path.to_string_lossy().into_owned()
}
