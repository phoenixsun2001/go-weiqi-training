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
}
