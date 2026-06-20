import { invoke } from "@tauri-apps/api/core";
import type { BoardSnapshot, PlayResult } from "../types";

export const ipc = {
  newGame: (size: number) => invoke<void>("new_game", { size }),
  playMove: (x: number, y: number) => invoke<PlayResult>("play_move", { x, y }),
  passMove: () => invoke<string>("pass_move"),
  boardSnapshot: () => invoke<BoardSnapshot>("board_snapshot"),
  recordGame: (result: string, opponentDan: number, sgf: string) =>
    invoke<number>("record_game", {
      args: { result, opponent_dan: opponentDan, sgf },
    }),
  getElo: () => invoke<number | null>("get_elo"),
};
