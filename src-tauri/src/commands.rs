use crate::error::AppError;
use crate::game_state::{Color, GameState};
use crate::local_store::LocalStore;
use crate::rating_service;
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::State;

pub struct AppState {
    pub store: Mutex<LocalStore>,
    pub game: Mutex<GameState>,
}

#[derive(Serialize)]
pub struct PlayResult {
    pub captured: usize,
    pub turn: String,
}

#[tauri::command]
pub fn play_move(state: State<AppState>, x: usize, y: usize) -> Result<PlayResult, AppError> {
    let mut game = state.game.lock().unwrap();
    let turn_before = game.turn();
    let captured = game.play(turn_before, (x, y))?;
    let turn_after = game.turn();
    Ok(PlayResult {
        captured,
        turn: match turn_after {
            Color::Black => "black".into(),
            Color::White => "white".into(),
        },
    })
}

#[tauri::command]
pub fn pass_move(state: State<AppState>) -> Result<String, AppError> {
    let mut game = state.game.lock().unwrap();
    let turn_before = game.turn();
    game.pass(turn_before)?;
    Ok(match game.turn() {
        Color::Black => "black".into(),
        Color::White => "white".into(),
    })
}

#[derive(Serialize)]
pub struct BoardSnapshot {
    pub size: usize,
    pub stones: Vec<Option<String>>, // "black"/"white"
    pub turn: String,
}

#[tauri::command]
pub fn board_snapshot(state: State<AppState>) -> Result<BoardSnapshot, AppError> {
    let game = state.game.lock().unwrap();
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
    Ok(BoardSnapshot {
        size,
        stones,
        turn: match game.turn() {
            Color::Black => "black".into(),
            Color::White => "white".into(),
        },
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
    *state.game.lock().unwrap() = GameState::new(size);
    Ok(())
}
