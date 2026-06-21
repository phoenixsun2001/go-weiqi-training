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

// 复盘分析
export interface MoveAnalysisDto {
  move_index: number;
  best_winrate: number;
  played_winrate: number;
  loss: number;
  kind: "good" | "inaccuracy" | "blunder";
  best_move: string;
  category: string;
}

export interface AnalysisReport {
  moves: MoveAnalysisDto[];
  winrate_curve: number[];
  blunder_count: number;
  inaccuracy_count: number;
}

// 对局库（野狐导入）
export interface ImportedGameDto {
  id: number;
  imported_at: string;
  source: string;
  black_name: string;
  white_name: string;
  black_rank: string;
  white_rank: string;
  result: string;
  board_size: number;
  played_date: string;
  move_count: number;
  sgf: string;
  reviewed: boolean;
  tags: string;
  notes: string;
}
