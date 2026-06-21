use crate::error::{AppError, AppResult};
use crate::game_state::{Color, GameState};
use crate::local_store::LocalStore;
use crate::opponent_ai::dan_to_max_visits;
use crate::problem_db::{Category, ProblemDb};
use crate::rating_service;
use crate::review_pipeline::{analyze_game, MoveKind};
use crate::sgf;
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
    /// KataGo 分析引擎（用于复盘分析，与对手引擎独立）
    pub analysis_engine: Mutex<Option<EngineHandle>>,
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
    // 同步到 KataGo 引擎（如果已启动），保持双方棋盘一致
    let size = game.size();
    if let Some(engine) = state.engine.lock().unwrap().as_ref() {
        let color = color_str(turn_before);
        let vertex = xy_to_gtp(x, y, size).unwrap_or_else(|_| "pass".into());
        let _ = engine.command(&format!("play {color} {vertex}"));
    }
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
    // 同步 pass 到 KataGo
    if let Some(engine) = state.engine.lock().unwrap().as_ref() {
        let color = color_str(turn_before);
        let _ = engine.command(&format!("play {color} pass"));
    }
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

// ============ 题库训练模块 ============

#[derive(Serialize)]
pub struct ProblemDto {
    pub id: i64,
    pub category: String,
    pub category_label: String,
    pub difficulty: i32,
    pub question_sgf: String,
    pub explanation: String,
}

/// 取下一道题（弱点驱动的针对性选题）
#[derive(Deserialize)]
pub struct NextProblemArgs {
    /// 指定难度上限（1..=9）；None 则跟随用户棋力（段位+1）
    pub max_difficulty: Option<i32>,
}

#[tauri::command]
pub fn next_problem(state: State<AppState>, args: NextProblemArgs) -> Result<Option<ProblemDto>, AppError> {
    let store = state.store.lock().unwrap();
    let max_diff = if let Some(d) = args.max_difficulty {
        d
    } else {
        let profile = store.load_profile()?.ok_or_else(|| AppError::Rule("无用户档案".into()))?;
        rating_service::dan_from_elo(profile.elo) + 1
    };
    let db = ProblemDb::new(store.conn_ref());
    let row = db.next_problem(max_diff)?;
    Ok(row.map(|p| ProblemDto {
        id: p.id,
        category: p.category.clone(),
        category_label: Category::from_str(&p.category)
            .map(|c| c.label().to_string())
            .unwrap_or(p.category),
        difficulty: p.difficulty,
        question_sgf: p.question_sgf,
        explanation: p.explanation,
    }))
}

#[derive(Deserialize)]
pub struct SubmitAnswerArgs {
    pub problem_id: i64,
    pub user_answer: String,
}

#[derive(Serialize)]
pub struct SubmitResult {
    pub correct: bool,
    pub answer_vertex: String,
}

#[tauri::command]
pub fn submit_answer(
    state: State<AppState>,
    args: SubmitAnswerArgs,
) -> Result<SubmitResult, AppError> {
    let store = state.store.lock().unwrap();
    let db = ProblemDb::new(store.conn_ref());
    let correct = db.submit_answer(args.problem_id, &args.user_answer)?;
    // 回填正确答案供解析展示
    let problem = db
        .get_problem(args.problem_id)?
        .ok_or_else(|| AppError::Rule("题目不存在".into()))?;
    Ok(SubmitResult {
        correct,
        answer_vertex: problem.answer_vertex,
    })
}

#[derive(Serialize)]
pub struct WrongBookDto {
    pub id: i64,
    pub problem_id: i64,
    pub user_answer: String,
    pub correct: bool,
    pub attempted_at: String,
}

#[tauri::command]
pub fn wrong_book(state: State<AppState>) -> Result<Vec<WrongBookDto>, AppError> {
    let store = state.store.lock().unwrap();
    let db = ProblemDb::new(store.conn_ref());
    let rows = db.list_wrong_book(50)?;
    Ok(rows
        .into_iter()
        .map(|r| WrongBookDto {
            id: r.id,
            problem_id: r.problem_id,
            user_answer: r.user_answer,
            correct: r.correct,
            attempted_at: r.attempted_at,
        })
        .collect())
}

#[derive(Serialize)]
pub struct WeaknessDto {
    pub category: String,
    pub category_label: String,
    pub blunder_count: i32,
    pub inaccuracy_count: i32,
}

#[tauri::command]
pub fn weakness_report(state: State<AppState>) -> Result<Vec<WeaknessDto>, AppError> {
    let store = state.store.lock().unwrap();
    let db = ProblemDb::new(store.conn_ref());
    let rows = db.list_weakness()?;
    Ok(rows
        .into_iter()
        .map(|r| {
            let label = Category::from_str(&r.category)
                .map(|c| c.label().to_string())
                .unwrap_or_else(|_| r.category.clone());
            WeaknessDto {
                category: r.category,
                category_label: label,
                blunder_count: r.blunder_count,
                inaccuracy_count: r.inaccuracy_count,
            }
        })
        .collect())
}

/// 供复盘管线把失误写入弱点统计（按手数阶段映射分类）。
#[derive(Deserialize)]
pub struct RecordWeaknessArgs {
    /// 'fuseki' | 'tsumego' | 'tesuji' | 'endgame'
    pub category: String,
    /// 是否严重失误
    pub blunder: bool,
}

#[tauri::command]
pub fn record_weakness(
    state: State<AppState>,
    args: RecordWeaknessArgs,
) -> Result<(), AppError> {
    let store = state.store.lock().unwrap();
    let db = ProblemDb::new(store.conn_ref());
    let cat = Category::from_str(&args.category)?;
    db.add_weakness(cat, args.blunder)?;
    Ok(())
}

// ============ 猜棋训练模块 ============

#[derive(Serialize)]
pub struct GuessDto {
    pub id: i64,
    pub category_label: String,
    pub difficulty: i32,
    pub position_sgf: String,
}

/// 取一道猜棋题（隐藏正解）。难度上限跟随用户段位。
#[tauri::command]
pub fn next_guess(state: State<AppState>) -> Result<Option<GuessDto>, AppError> {
    let store = state.store.lock().unwrap();
    let profile = store.load_profile()?.ok_or_else(|| AppError::Rule("无用户档案".into()))?;
    let max_diff = rating_service::dan_from_elo(profile.elo) + 1;
    let db = ProblemDb::new(store.conn_ref());
    let row = db.next_problem(max_diff)?;
    Ok(row.map(|p| GuessDto {
        id: p.id,
        category_label: Category::from_str(&p.category)
            .map(|c| c.label().to_string())
            .unwrap_or(p.category),
        difficulty: p.difficulty,
        position_sgf: p.question_sgf,
    }))
}

#[derive(Deserialize)]
pub struct CheckGuessArgs {
    pub problem_id: i64,
    pub user_guess: String,
}

#[derive(Serialize)]
pub struct GuessResult {
    pub correct: bool,
    /// 正解顶点（多个用空格）
    pub answer_vertex: String,
    /// 用户答案是否落在 top 候选（这里简单用精确匹配）
    pub explanation: String,
}

#[tauri::command]
pub fn check_guess(state: State<AppState>, args: CheckGuessArgs) -> Result<GuessResult, AppError> {
    let store = state.store.lock().unwrap();
    let db = ProblemDb::new(store.conn_ref());
    let problem = db
        .get_problem(args.problem_id)?
        .ok_or_else(|| AppError::Rule("题目不存在".into()))?;
    let correct = problem
        .answer_vertex
        .split_whitespace()
        .any(|a| a.eq_ignore_ascii_case(args.user_guess.trim()));
    Ok(GuessResult {
        correct,
        answer_vertex: problem.answer_vertex,
        explanation: problem.explanation,
    })
}

// ============ 复盘分析端到端 ============

#[derive(Deserialize)]
pub struct StartAnalysisEngineArgs {
    pub binary_path: String,
    pub args: Vec<String>,
}

#[derive(Serialize)]
pub struct AnalysisEngineStatus {
    pub running: bool,
}

/// 启动复盘分析引擎（独立于对战引擎）
#[tauri::command]
pub fn start_analysis_engine(
    state: State<AppState>,
    args: StartAnalysisEngineArgs,
) -> Result<AnalysisEngineStatus, AppError> {
    let arg_refs: Vec<&str> = args.args.iter().map(|s| s.as_str()).collect();
    let handle = EngineHandle::spawn(&args.binary_path, &arg_refs)?;
    let size = state.game.lock().unwrap().size();
    let _ = handle.command(&format!("boardsize {size}"));
    *state.analysis_engine.lock().unwrap() = Some(handle);
    Ok(AnalysisEngineStatus { running: true })
}

#[tauri::command]
pub fn stop_analysis_engine(state: State<AppState>) -> Result<(), AppError> {
    state.analysis_engine.lock().unwrap().take();
    Ok(())
}

#[tauri::command]
pub fn analysis_engine_status(state: State<AppState>) -> Result<AnalysisEngineStatus, AppError> {
    Ok(AnalysisEngineStatus {
        running: state.analysis_engine.lock().unwrap().is_some(),
    })
}

#[derive(Deserialize)]
pub struct ImportAndAnalyzeArgs {
    pub sgf: String,
    /// 失误判定阈值（胜率损失，0..1），默认 0.03
    pub threshold: Option<f64>,
    /// 关联的对局库 ID（有则自动保存复盘结果并标记已复盘）
    pub game_id: Option<i64>,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct MoveAnalysisDto {
    pub move_index: usize,
    pub best_winrate: f64,
    pub played_winrate: f64,
    pub loss: f64,
    pub kind: String, // "good" | "inaccuracy" | "blunder"
    pub best_move: String,
    pub category: String, // 阶段映射的分类标签
}

#[derive(Serialize, Clone)]
pub struct AnalysisReport {
    pub moves: Vec<MoveAnalysisDto>,
    pub winrate_curve: Vec<f64>, // 每手黑方胜率 0..1
    pub blunder_count: usize,
    pub inaccuracy_count: usize,
    pub summary: String, // 复盘总结
}

/// 导入 SGF 棋谱并逐手分析：跑真实 KataGo、生成胜率曲线与失误标记，
/// 同时按失误阶段自动写入弱点统计表（驱动针对性题库出题）。
/// 若提供 game_id，分析结果自动持久化并标记对局为已复盘。
#[tauri::command]
pub fn import_and_analyze(
    state: State<AppState>,
    args: ImportAndAnalyzeArgs,
) -> Result<AnalysisReport, AppError> {
    let moves = sgf::parse_moves(&args.sgf)?;
    if moves.is_empty() {
        return Err(AppError::Rule("棋谱无着手".into()));
    }
    let size = extract_size(&args.sgf);
    let threshold = args.threshold.unwrap_or(0.03);

    let engine_guard = state.analysis_engine.lock().unwrap();
    let engine = engine_guard
        .as_ref()
        .ok_or_else(|| AppError::Engine("复盘分析引擎未启动，请先在复盘页启动 KataGo".into()))?;

    let analyses = analyze_game(engine, size, &moves, threshold)?;

    // 把分析结果写入弱点表（按阶段映射分类），并构造 DTO
    let store = state.store.lock().unwrap();
    let db = ProblemDb::new(store.conn_ref());
    let game_db = ImportedGameStore::new(store.conn_ref());
    let total = moves.len();
    let mut dtos = Vec::with_capacity(analyses.len());
    let mut winrate_curve = Vec::with_capacity(analyses.len());
    let mut blunder_count = 0usize;
    let mut inaccuracy_count = 0usize;
    // 各阶段失误统计（用于总结）
    let mut phase_blunders = std::collections::HashMap::<&str, usize>::new();

    for a in &analyses {
        let kind = a.kind;
        if kind == MoveKind::Blunder {
            blunder_count += 1;
            let cat = phase_to_category(a.move_index, total, size);
            *phase_blunders.entry(cat.label()).or_insert(0) += 1;
        } else if kind == MoveKind::Inaccuracy {
            inaccuracy_count += 1;
        }
        // 仅对失误/疑问手记录弱点
        if kind != MoveKind::Good {
            let cat = phase_to_category(a.move_index, total, size);
            let _ = db.add_weakness(cat, kind == MoveKind::Blunder);
        }
        winrate_curve.push(a.played_winrate);
        dtos.push(MoveAnalysisDto {
            move_index: a.move_index,
            best_winrate: a.best_winrate,
            played_winrate: a.played_winrate,
            loss: a.best_winrate - a.played_winrate,
            kind: move_kind_str(kind).into(),
            best_move: a.best_move.clone(),
            category: phase_to_category(a.move_index, total, size).label().into(),
        });
    }

    // 生成复盘总结
    let worst = dtos.iter().max_by(|a, b| a.loss.partial_cmp(&b.loss).unwrap());
    let summary = build_summary(total, blunder_count, inaccuracy_count, &phase_blunders, worst);

    // 若关联对局库 ID，持久化复盘结果并标记已复盘
    if let Some(gid) = args.game_id {
        let report_json = serde_json::to_string(&dtos).unwrap_or_default();
        let curve_json = serde_json::to_string(&winrate_curve).unwrap_or_default();
        let full_json = format!("{{\"blunder_count\":{blunder_count},\"inaccuracy_count\":{inaccuracy_count}}}");
        let _ = game_db.save_review_result(
            gid,
            &full_json,
            &curve_json,
            &report_json,
            blunder_count as i64,
            inaccuracy_count as i64,
            &summary,
        );
        let _ = game_db.update_reviewed(gid, true);
    }

    Ok(AnalysisReport {
        moves: dtos,
        winrate_curve,
        blunder_count,
        inaccuracy_count,
        summary,
    })
}

/// 生成复盘总结文本
fn build_summary(
    total: usize,
    blunders: usize,
    inaccuracies: usize,
    phase_blunders: &std::collections::HashMap<&str, usize>,
    worst: Option<&MoveAnalysisDto>,
) -> String {
    let good_pct = if total > 0 {
        ((total - blunders - inaccuracies) as f64 / total as f64 * 100.0).round() as i64
    } else {
        100
    };
    let mut s = format!(
        "共 {total} 手：好棋率 {good_pct}%，严重失误 {blunders} 处，不准确 {inaccuracies} 处。"
    );
    if !phase_blunders.is_empty() {
        let mut phases: Vec<_> = phase_blunders.iter().collect();
        phases.sort_by(|a, b| b.1.cmp(a.1));
        let detail: Vec<String> = phases.iter().map(|(k, v)| format!("{}{}", k, v)).collect();
        s.push_str(&format!(" 失误集中在{}。", detail.join("、")));
    }
    if let Some(w) = worst {
        if w.loss > 0.001 {
            s.push_str(&format!(
                " 最严重失误在第 {} 手（胜率损失 {:.0}%）。",
                w.move_index + 1,
                w.loss * 100.0
            ));
        }
    }
    s
}


fn move_kind_str(k: MoveKind) -> &'static str {
    match k {
        MoveKind::Good => "good",
        MoveKind::Inaccuracy => "inaccuracy",
        MoveKind::Blunder => "blunder",
    }
}

/// 按手数阶段映射到训练分类（驱动弱点出题）。
/// 布局期 -> fuseki；中盘 -> tesuji（手筋）；官子 -> endgame。
/// 死活类（tsumego）较难从手数阶段区分，这里中盘统一归 tesuji。
fn phase_to_category(move_index: usize, total: usize, _size: usize) -> Category {
    let frac = if total == 0 { 1.0 } else { move_index as f64 / total as f64 };
    if frac < 0.33 {
        Category::Fuseki
    } else if frac < 0.75 {
        Category::Tesuji
    } else {
        Category::Endgame
    }
}

fn extract_size(sgf: &str) -> usize {
    sgf.match_indices("SZ[")
        .next()
        .and_then(|(i, _)| {
            let rest = &sgf[i + 3..];
            rest.find(']').and_then(|end| rest[..end].parse::<usize>().ok())
        })
        .unwrap_or(19)
}

// ============ KataGo 一键安装 ============

#[derive(Serialize)]
pub struct KatagoSetupStatus {
    pub installed: bool,
    pub binary_path: String,
}

#[tauri::command]
pub fn katago_status() -> Result<KatagoSetupStatus, AppError> {
    Ok(KatagoSetupStatus {
        installed: crate::katago_setup::is_installed(),
        binary_path: crate::katago_setup::katago_binary_path().to_string_lossy().into_owned(),
    })
}

/// 一键下载安装 KataGo（OpenCL 版 + 权重 + 配置）
#[tauri::command]
pub fn install_katago() -> Result<String, AppError> {
    let msg = crate::katago_setup::install()?;
    Ok(msg)
}

/// 用已安装的 KataGo 一键启动对战引擎（无需手动填路径）
#[tauri::command]
pub fn auto_start_engine(state: State<AppState>, difficulty: i32) -> Result<EngineStatus, AppError> {
    let binary = crate::katago_setup::katago_binary_path();
    let args = crate::katago_setup::gtp_args();
    if !binary.exists() {
        return Err(AppError::Engine(
            "KataGo 尚未安装，请先点击一键安装".into(),
        ));
    }
    let arg_refs: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
    let handle = EngineHandle::spawn(&binary.to_string_lossy(), &arg_refs)?;
    let size = state.game.lock().unwrap().size();
    let _ = handle.command(&format!("boardsize {size}"));
    let visits = dan_to_max_visits(difficulty);
    let _ = handle.command(&format!("kata-set-param maxVisits {visits}"));
    *state.engine.lock().unwrap() = Some(handle);
    *state.difficulty.lock().unwrap() = difficulty;
    Ok(EngineStatus {
        running: true,
        difficulty,
    })
}

/// 用已安装的 KataGo 一键启动复盘分析引擎
#[tauri::command]
pub fn auto_start_analysis_engine(state: State<AppState>) -> Result<AnalysisEngineStatus, AppError> {
    let binary = crate::katago_setup::katago_binary_path();
    let args = crate::katago_setup::gtp_args();
    if !binary.exists() {
        return Err(AppError::Engine(
            "KataGo 尚未安装，请先点击一键安装".into(),
        ));
    }
    let arg_refs: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
    let handle = EngineHandle::spawn(&binary.to_string_lossy(), &arg_refs)?;
    let size = state.game.lock().unwrap().size();
    let _ = handle.command(&format!("boardsize {size}"));
    *state.analysis_engine.lock().unwrap() = Some(handle);
    Ok(AnalysisEngineStatus { running: true })
}

// ============ 对局库（野狐导入） ============

use crate::imported_game_store::ImportedGameStore;
use crate::sgf::parse_metadata;

#[derive(Serialize, Clone)]
pub struct ImportedGameDto {
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

fn row_to_dto(r: crate::imported_game_store::ImportedGameRow) -> ImportedGameDto {
    ImportedGameDto {
        id: r.id,
        imported_at: r.imported_at,
        source: r.source,
        black_name: r.black_name,
        white_name: r.white_name,
        black_rank: r.black_rank,
        white_rank: r.white_rank,
        result: r.result,
        board_size: r.board_size,
        played_date: r.played_date,
        move_count: r.move_count,
        sgf: r.sgf,
        reviewed: r.reviewed,
        tags: r.tags,
        notes: r.notes,
    }
}

#[derive(Deserialize)]
pub struct ImportGameArgs {
    pub sgf: String,
    pub source: Option<String>,
}

/// 导入 SGF 棋谱到对局库（自动解析元数据）
#[tauri::command]
pub fn import_game(state: State<AppState>, args: ImportGameArgs) -> Result<ImportedGameDto, AppError> {
    let meta = parse_metadata(&args.sgf);
    if meta.move_count == 0 {
        return Err(AppError::Rule("棋谱无着手，可能是无效 SGF".into()));
    }
    let store = state.store.lock().unwrap();
    let db = ImportedGameStore::new(store.conn_ref());
    let source = args.source.unwrap_or_else(|| "foxwq".into());
    let id = db.insert(&source, &meta, &args.sgf)?;
    let row = db.get(id)?.ok_or_else(|| AppError::Rule("导入后查不到记录".into()))?;
    Ok(row_to_dto(row))
}

/// 列出所有导入的对局
#[tauri::command]
pub fn list_imported_games(state: State<AppState>) -> Result<Vec<ImportedGameDto>, AppError> {
    let store = state.store.lock().unwrap();
    let db = ImportedGameStore::new(store.conn_ref());
    let rows = db.list()?;
    Ok(rows.into_iter().map(row_to_dto).collect())
}

/// 获取单条对局详情（含完整 SGF）
#[tauri::command]
pub fn get_imported_game(state: State<AppState>, id: i64) -> Result<Option<ImportedGameDto>, AppError> {
    let store = state.store.lock().unwrap();
    let db = ImportedGameStore::new(store.conn_ref());
    Ok(db.get(id)?.map(row_to_dto))
}

/// 删除对局
#[tauri::command]
pub fn delete_imported_game(state: State<AppState>, id: i64) -> Result<(), AppError> {
    let store = state.store.lock().unwrap();
    let db = ImportedGameStore::new(store.conn_ref());
    db.delete(id)?;
    Ok(())
}

#[derive(Deserialize)]
pub struct UpdateGameMetaArgs {
    pub id: i64,
    pub reviewed: Option<bool>,
    pub tags: Option<String>,
    pub notes: Option<String>,
}

/// 更新对局的复盘状态/标签/笔记
#[tauri::command]
pub fn update_game_meta(
    state: State<AppState>,
    args: UpdateGameMetaArgs,
) -> Result<ImportedGameDto, AppError> {
    let store = state.store.lock().unwrap();
    let db = ImportedGameStore::new(store.conn_ref());
    if let Some(reviewed) = args.reviewed {
        db.update_reviewed(args.id, reviewed)?;
    }
    if args.tags.is_some() || args.notes.is_some() {
        // 需要先读取现有值再更新（因为 tags/notes 可能只传一个）
        let existing = db.get(args.id)?.ok_or_else(|| AppError::Rule("对局不存在".into()))?;
        db.update_tags_notes(
            args.id,
            args.tags.as_deref().unwrap_or(&existing.tags),
            args.notes.as_deref().unwrap_or(&existing.notes),
        )?;
    }
    let row = db.get(args.id)?.ok_or_else(|| AppError::Rule("对局不存在".into()))?;
    Ok(row_to_dto(row))
}

#[derive(Serialize)]
pub struct ReviewResultDto {
    pub game_id: i64,
    pub analyzed_at: String,
    pub moves: Vec<MoveAnalysisDto>,
    pub winrate_curve: Vec<f64>,
    pub blunder_count: i64,
    pub inaccuracy_count: i64,
    pub summary: String,
}

/// 获取已持久化的复盘结果（不用重跑 KataGo）
#[tauri::command]
pub fn get_review_result(state: State<AppState>, game_id: i64) -> Result<Option<ReviewResultDto>, AppError> {
    let store = state.store.lock().unwrap();
    let db = ImportedGameStore::new(store.conn_ref());
    let row = match db.get_review_result(game_id)? {
        Some(r) => r,
        None => return Ok(None),
    };
    let moves: Vec<MoveAnalysisDto> = serde_json::from_str(&row.moves_json).unwrap_or_default();
    let winrate_curve: Vec<f64> = serde_json::from_str(&row.winrate_curve_json).unwrap_or_default();
    Ok(Some(ReviewResultDto {
        game_id: row.game_id,
        analyzed_at: row.analyzed_at,
        moves,
        winrate_curve,
        blunder_count: row.blunder_count,
        inaccuracy_count: row.inaccuracy_count,
        summary: row.summary,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn phase_mapping_layout_midgame_endgame() {
        assert_eq!(phase_to_category(0, 100, 19), Category::Fuseki);
        assert_eq!(phase_to_category(32, 100, 19), Category::Fuseki);
        assert_eq!(phase_to_category(50, 100, 19), Category::Tesuji);
        assert_eq!(phase_to_category(80, 100, 19), Category::Endgame);
    }

    #[test]
    fn extract_size_from_sgf() {
        assert_eq!(extract_size("(;GM[1]SZ[9];B[ee])"), 9);
        assert_eq!(extract_size("(;GM[1]SZ[19])"), 19);
        assert_eq!(extract_size("(;GM[1])"), 19); // 默认
    }
}

