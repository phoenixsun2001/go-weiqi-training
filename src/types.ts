export type Stone = "black" | "white" | null;
export type Color = "black" | "white";

export interface BoardSnapshot {
  size: number;
  stones: Stone[];
  turn: Color;
}

export interface PlayResult {
  captured: number;
  turn: Color;
  stones: Stone[];
}

export interface EngineStatus {
  running: boolean;
  difficulty: number;
}

export interface AiMoveResult {
  played: "play" | "pass" | "resign";
  vertex: [number, number] | null;
  captured: number;
  turn: Color;
  stones: Stone[];
}

export interface StartEngineArgs {
  binary_path: string;
  args: string[];
  difficulty: number;
}
