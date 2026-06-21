import { invoke } from "@tauri-apps/api/core";
import type {
  AiMoveResult,
  AnalysisReport,
  BoardSnapshot,
  EngineStatus,
  GuessDto,
  GuessResult,
  ImportedGameDto,
  PlayResult,
  ProblemDto,
  ReviewResultDto,
  StartEngineArgs,
  SubmitResult,
  WeaknessDto,
  WrongBookDto,
} from "../types";

export const ipc = {
  newGame: (size: number) => invoke<void>("new_game", { size }),
  playMove: (x: number, y: number) => invoke<PlayResult>("play_move", { x, y }),
  passMove: () => invoke<PlayResult>("pass_move"),
  boardSnapshot: () => invoke<BoardSnapshot>("board_snapshot"),
  recordGame: (result: string, opponentDan: number, sgf: string) =>
    invoke<number>("record_game", {
      args: { result, opponent_dan: opponentDan, sgf },
    }),
  getElo: () => invoke<number | null>("get_elo"),

  // KataGo 对手引擎
  startEngine: (args: StartEngineArgs) =>
    invoke<EngineStatus>("start_engine", {
      args: {
        binary_path: args.binary_path,
        args: args.args,
        difficulty: args.difficulty,
      },
    }),
  stopEngine: () => invoke<void>("stop_engine"),
  engineStatus: () => invoke<EngineStatus>("engine_status"),
  setDifficulty: (difficulty: number) =>
    invoke<void>("set_difficulty", { difficulty }),
  aiMove: (userColor: Color) => invoke<AiMoveResult>("ai_move", { args: { user_color: userColor } }),

  // 题库训练
  nextProblem: (maxDifficulty?: number) =>
    invoke<ProblemDto | null>("next_problem", { args: { max_difficulty: maxDifficulty ?? null } }),
  submitAnswer: (problemId: number, userAnswer: string) =>
    invoke<SubmitResult>("submit_answer", { args: { problem_id: problemId, user_answer: userAnswer } }),
  wrongBook: () => invoke<WrongBookDto[]>("wrong_book"),
  weaknessReport: () => invoke<WeaknessDto[]>("weakness_report"),
  recordWeakness: (category: string, blunder: boolean) =>
    invoke<void>("record_weakness", { args: { category, blunder } }),

  // 猜棋训练
  nextGuess: () => invoke<GuessDto | null>("next_guess"),
  checkGuess: (problemId: number, userGuess: string) =>
    invoke<GuessResult>("check_guess", { args: { problem_id: problemId, user_guess: userGuess } }),

  // 复盘分析
  startAnalysisEngine: (binaryPath: string, args: string[]) =>
    invoke<{ running: boolean }>("start_analysis_engine", {
      args: { binary_path: binaryPath, args },
    }),
  stopAnalysisEngine: () => invoke<void>("stop_analysis_engine"),
  analysisEngineStatus: () => invoke<{ running: boolean }>("analysis_engine_status"),
  importAndAnalyze: (sgf: string, threshold?: number, gameId?: number) =>
    invoke<AnalysisReport>("import_and_analyze", {
      args: { sgf, threshold: threshold ?? null, game_id: gameId ?? null },
    }),

  // KataGo 一键安装与自动启动
  katagoStatus: () => invoke<{ installed: boolean; binary_path: string }>("katago_status"),
  installKatago: () => invoke<string>("install_katago"),
  autoStartEngine: (difficulty: number) => invoke<EngineStatus>("auto_start_engine", { difficulty }),
  autoStartAnalysisEngine: () => invoke<{ running: boolean }>("auto_start_analysis_engine"),

  // 对局库（野狐导入）
  importGame: (sgf: string, source?: string) =>
    invoke<ImportedGameDto>("import_game", { args: { sgf, source: source ?? null } }),
  listImportedGames: () => invoke<ImportedGameDto[]>("list_imported_games"),
  getImportedGame: (id: number) => invoke<ImportedGameDto | null>("get_imported_game", { id }),
  deleteImportedGame: (id: number) => invoke<void>("delete_imported_game", { id }),
  updateGameMeta: (id: number, reviewed?: boolean, tags?: string, notes?: string) =>
    invoke<ImportedGameDto>("update_game_meta", {
      args: { id, reviewed: reviewed ?? null, tags: tags ?? null, notes: notes ?? null },
    }),
  getReviewResult: (gameId: number) =>
    invoke<ReviewResultDto | null>("get_review_result", { gameId }),
};

type Color = import("../types").Color;
