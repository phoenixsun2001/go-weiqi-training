import { invoke } from "@tauri-apps/api/core";
import type {
  AiMoveResult,
  BoardSnapshot,
  EngineStatus,
  PlayResult,
  StartEngineArgs,
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
};

type Color = import("../types").Color;
