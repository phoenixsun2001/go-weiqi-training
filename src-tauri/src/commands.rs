use crate::error::{AppError, AppResult};
use crate::game_state::{Color, GameState};
use crate::local_store::LocalStore;
use crate::opponent_ai::dan_to_max_visits;
use crate::rating_service;
use crate::engine_manager::EngineHandle;
use crate::coords::{gtp_to_xy, xy_to_gtp};
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::State;

pub struct AppState {
    pub store: Mutex<LocalStore>,
    pub game: Mutex<GameState>,
    /// KataGo 对手引擎（启动后存在）
    pub engine: Mutex<Option<EngineHandle>>,
    /// 当前对手目标段位（1..=5+），用于调整 maxVisits
    pub difficulty: Mutex<i32>,
}

#[derive(Serialize)]
pub struct PlayResult {
    pub captured: usize,
    pub turn: String,
    pub stones: Vec<Option<String>>,
}

fn snapshot_stones(game: &GameState) -> Vec<Option<String>> {
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
    stones
}

#[tauri::command]
pub fn play_move(state: State<AppState>, x: usize, y: usize) -> Result<PlayResult, AppError> {
    let mut game = state.game.lock().unwrap();
    let turn_before = game.turn();
    let captured = game.play(turn_before, (x, y))?;
    let turn_after = game.turn();
    Ok(PlayResult {
        captured,
        turn: color_str(turn_after),
        stones: snapshot_stones(&game),
    })
}

#[tauri::command]
pub fn pass_move(state: State<AppState>) -> Result<PlayResult, AppError> {
    let mut game = state.game.lock().unwrap();
    let turn_before = game.turn();
    game.pass(turn_before)?;
    Ok(PlayResult {
        captured: 0,
        turn: color_str(game.turn()),
        stones: snapshot_stones(&game),
    })
}

#[derive(Serialize)]
pub struct BoardSnapshot {
    pub size: usize,
    pub stones: Vec<Option<String>>,
    pub turn: String,
}

#[tauri::command]
pub fn board_snapshot(state: State<AppState>) -> Result<BoardSnapshot, AppError> {
    let game = state.game.lock().unwrap();
    let size = game.size();
    Ok(BoardSnapshot {
        size,
        stones: snapshot_stones(&game),
        turn: color_str(game.turn()),
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
    let profile = store
        .load_profile()?
        .ok_or_else(|| AppError::Rule("无用户档案".into()))?;
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
    let mut game = state.game.lock().unwrap();
    *game = GameState::new(size);
    // 让引擎同步到新棋盘
    if let Some(engine) = state.engine.lock().unwrap().as_ref() {
        let _ = engine.command("clear_board");
    }
    Ok(())
}

#[derive(Deserialize)]
pub struct StartEngineArgs {
    /// KataGo 可执行文件路径
    pub binary_path: String,
    /// gtp 模式参数（如 ["gtp", "-model", "model.bin"]）
    pub args: Vec<String>,
    /// 对手目标段位（1..=9），影响 maxVisits
    pub difficulty: i32,
}

#[derive(Serialize)]
pub struct EngineStatus {
    pub running: bool,
    pub difficulty: i32,
}

/// 启动 KataGo 对手引擎并设置难度
#[tauri::command]
pub fn start_engine(state: State<AppState>, args: StartEngineArgs) -> Result<EngineStatus, AppError> {
    let arg_refs: Vec<&str> = args.args.iter().map(|s| s.as_str()).collect();
    let handle = EngineHandle::spawn(&args.binary_path, &arg_refs)?;
    // 设置棋盘大小与难度
    let size = state.game.lock().unwrap().size();
    let _ = handle.command(&format!("boardsize {size}"));
    let visits = dan_to_max_visits(args.difficulty);
    let _ = handle.command(&format!("kata-set-param maxVisits {visits}"));
    *state.engine.lock().unwrap() = Some(handle);
    *state.difficulty.lock().unwrap() = args.difficulty;
    Ok(EngineStatus {
        running: true,
        difficulty: args.difficulty,
    })
}

#[tauri::command]
pub fn stop_engine(state: State<AppState>) -> Result<(), AppError> {
    // Drop 即会 kill 子进程
    state.engine.lock().unwrap().take();
    Ok(())
}

#[tauri::command]
pub fn engine_status(state: State<AppState>) -> Result<EngineStatus, AppError> {
    Ok(EngineStatus {
        running: state.engine.lock().unwrap().is_some(),
        difficulty: *state.difficulty.lock().unwrap(),
    })
}

/// 设置对手难度（段位），动态调整 maxVisits
#[tauri::command]
pub fn set_difficulty(state: State<AppState>, difficulty: i32) -> Result<(), AppError> {
    *state.difficulty.lock().unwrap() = difficulty;
    if let Some(engine) = state.engine.lock().unwrap().as_ref() {
        let visits = dan_to_max_visits(difficulty);
        let _ = engine.command(&format!("kata-set-param maxVisits {visits}"));
    }
    Ok(())
}

/// 让 AI 对手在当前局面下落子，并把该步应用到 game_state。
/// user_color 是人类的颜色；AI 落在另一色。
#[derive(Deserialize)]
pub struct AiMoveArgs {
    pub user_color: String,
}

#[derive(Serialize)]
pub struct AiMoveResult {
    pub played: String, // "play" | "pass" | "resign"
    pub vertex: Option<(usize, usize)>,
    pub captured: usize,
    pub turn: String,
    pub stones: Vec<Option<String>>,
}

#[tauri::command]
pub fn ai_move(state: State<AppState>, args: AiMoveArgs) -> Result<AiMoveResult, AppError> {
    let engine_guard = state.engine.lock().unwrap();
    let engine = engine_guard
        .as_ref()
        .ok_or_else(|| AppError::Engine("对手引擎未启动，请先在设置中启动 KataGo".into()))?;

    let ai_color = if args.user_color == "black" { "white" } else { "black" };
    let mut game = state.game.lock().unwrap();
    let ai_turn_color = if ai_color == "black" { Color::Black } else { Color::White };

    // 当前应轮到 AI
    if game.turn() != ai_turn_color {
        return Err(AppError::Rule(format!(
            "当前轮到 {}，不是 AI（{}）",
            color_str(game.turn()),
            ai_color
        )));
    }

    // 让引擎生成应手
    let reply = engine.command(&format!("genmove {ai_color}"))?;
    let reply = reply.trim().to_lowercase();

    if reply == "resign" {
        return Ok(AiMoveResult {
            played: "resign".into(),
            vertex: None,
            captured: 0,
            turn: color_str(game.turn()),
            stones: snapshot_stones(&game),
        });
    }
    if reply == "pass" {
        game.pass(ai_turn_color)?;
        return Ok(AiMoveResult {
            played: "pass".into(),
            vertex: None,
            captured: 0,
            turn: color_str(game.turn()),
            stones: snapshot_stones(&game),
        });
    }

    // 正常落子：把 GTP 顶点转内部坐标并应用到 game_state
    let (x, y) = gtp_to_xy(&reply).map_err(|e| {
        AppError::Engine(format!("引擎返回非法顶点 '{reply}': {e}"))
    })?;
    let captured = game.play(ai_turn_color, (x, y))?;
    Ok(AiMoveResult {
        played: "play".into(),
        vertex: Some((x, y)),
        captured,
        turn: color_str(game.turn()),
        stones: snapshot_stones(&game),
    })
}

fn color_str(c: Color) -> String {
    match c {
        Color::Black => "black".into(),
        Color::White => "white".into(),
    }
}

// 保留引用以避免 unused import 警告（xy_to_gtp 在未来引擎同步时会用到）
#[allow(dead_code)]
fn _keep_xy_to_gtp(x: usize, y: usize, size: usize) -> AppResult<String> {
    xy_to_gtp(x, y, size)
}
