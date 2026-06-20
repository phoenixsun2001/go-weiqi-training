import { invoke } from "@tauri-apps/api/core";
import type {
  AiMoveResult,
  BoardSnapshot,
  EngineStatus,
  PlayResult,
  ProblemDto,
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
  nextProblem: () => invoke<ProblemDto | null>("next_problem"),
  submitAnswer: (problemId: number, userAnswer: string) =>
    invoke<SubmitResult>("submit_answer", { args: { problem_id: problemId, user_answer: userAnswer } }),
  wrongBook: () => invoke<WrongBookDto[]>("wrong_book"),
  weaknessReport: () => invoke<WeaknessDto[]>("weakness_report"),
  recordWeakness: (category: string, blunder: boolean) =>
    invoke<void>("record_weakness", { args: { category, blunder } }),
};

type Color = import("../types").Color;
