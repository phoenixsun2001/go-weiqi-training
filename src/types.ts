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

// 题库训练
export interface ProblemDto {
  id: number;
  category: string;
  category_label: string;
  difficulty: number;
  question_sgf: string;
  explanation: string;
}

export interface SubmitResult {
  correct: boolean;
  answer_vertex: string;
}

export interface WrongBookDto {
  id: number;
  problem_id: number;
  user_answer: string;
  correct: boolean;
  attempted_at: string;
}

export interface WeaknessDto {
  category: string;
  category_label: string;
  blunder_count: number;
  inaccuracy_count: number;
}

// 猜棋训练
export interface GuessDto {
  id: number;
  category_label: string;
  difficulty: number;
  position_sgf: string;
}

export interface GuessResult {
  correct: boolean;
  answer_vertex: string;
  explanation: string;
}
