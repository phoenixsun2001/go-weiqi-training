/**
 * API 层：替换 Tauri IPC，改用 HTTP fetch 调用 Python FastAPI 后端
 */
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
  SubmitResult,
  TerritoryEstimate,
  WeaknessDto,
  WrongBookDto,
} from "../types";

const BASE = "http://127.0.0.1:8000";

async function post<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || res.statusText);
  }
  return res.json();
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(await res.text() || res.statusText);
  return res.json();
}

async function del<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { method: "DELETE" });
  if (!res.ok) throw new Error(await res.text() || res.statusText);
  return res.json();
}

async function put<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text() || res.statusText);
  return res.json();
}

export const api = {
  // 棋盘 / 对战
  newGame: (size: number) => post<{ ok: boolean }>("/api/game/new", { size }),
  playMove: (x: number, y: number) => post<PlayResult>("/api/game/play", { x, y }),
  passMove: () => post<PlayResult>("/api/game/pass"),
  boardSnapshot: () => get<BoardSnapshot>("/api/game/snapshot"),
  getElo: () => get<number | null>("/api/elo"),

  // 记录对局
  recordGame: (result: string, opponentDan: number, sgf: string) =>
    post<number>("/api/game/record", { result, opponent_dan: opponentDan, sgf }),

  // AI 引擎
  katagoStatus: () => get<{ installed: boolean; binary_path: string }>("/api/katago/status"),
  installKatago: () => post<{ message: string }>("/api/problems/import-tsumego"), // 兼容：Web 版题库导入即安装
  autoStartEngine: (difficulty: number) => post<EngineStatus>("/api/engine/start", { difficulty }),
  startEngine: (_binaryPath: string, _args: string[], difficulty: number) =>
    post<EngineStatus>("/api/engine/start", { difficulty }),
  stopEngine: () => post<{ ok: boolean }>("/api/engine/stop"),
  engineStatus: () => get<EngineStatus>("/api/engine/status"),
  setDifficulty: (difficulty: number) => post<{ ok: boolean }>("/api/engine/set-difficulty", { difficulty }),
  aiMove: (userColor: string) => post<AiMoveResult>("/api/engine/ai-move", { user_color: userColor }),

  // 形势判断 + 保存
  estimateTerritory: () => get<TerritoryEstimate>("/api/territory"),
  saveCurrentGame: (blackName?: string, whiteName?: string, result?: string) =>
    post<number>("/api/game/save", { black_name: blackName, white_name: whiteName, result }),

  // 复盘分析引擎
  startAnalysisEngine: (_binaryPath?: string, _args?: string[]) =>
    post<{ running: boolean }>("/api/engine/start-analysis"),
  autoStartAnalysisEngine: () => post<{ running: boolean }>("/api/engine/start-analysis"),
  stopAnalysisEngine: () => post<{ ok: boolean }>("/api/engine/stop-analysis"),
  analysisEngineStatus: () => get<{ running: boolean }>("/api/engine/analysis-status"),
  importAndAnalyze: (sgf: string, threshold?: number, gameId?: number) =>
    post<AnalysisReport>("/api/review/analyze", { sgf, threshold: threshold ?? null, game_id: gameId ?? null }),
  getReviewResult: (gameId: number) => get<ReviewResultDto | null>(`/api/review/result/${gameId}`),

  // AI 智能复盘（不依赖 KataGo）
  aiReview: (sgf: string, gameId?: number) =>
    post<{
      black: string; white: string; black_rank: string; white_rank: string;
      result: string; total_moves: number; board_size: number; date: string;
      reviewee: string; reviewee_color: string; reviewee_won: boolean;
      phases: { phase: string; range: string; score: number; comments: string[]; issues: string[] }[];
      key_moves: { move: number; color: string; point: string; type: string; issues: string[] }[];
      summary: string;
      territory_estimate: { black_territory_est: number; white_territory_est: number; assessment: string; black_third_line: number; white_third_line: number; black_center: number; white_center: number };
    }>("/api/review/ai", { sgf, game_id: gameId ?? null }),

  // 题库
  importTsumego: () => post<{ message: string }>("/api/problems/import-tsumego"),
  nextProblem: (maxDifficulty?: number) =>
    post<ProblemDto | null>("/api/problems/next", { max_difficulty: maxDifficulty ?? null }),
  submitAnswer: (problemId: number, userAnswer: string) =>
    post<SubmitResult>("/api/problems/submit", { problem_id: problemId, user_answer: userAnswer }),
  wrongBook: () => get<WrongBookDto[]>("/api/problems/wrong-book"),
  weaknessReport: () => get<WeaknessDto[]>("/api/weakness"),
  recordWeakness: (category: string, blunder: boolean) =>
    post<{ ok: boolean }>("/api/weakness/record", { category, blunder }),

  // 猜棋
  nextGuess: () => get<GuessDto | null>("/api/guess/next"),
  checkGuess: (problemId: number, userGuess: string) =>
    post<GuessResult>("/api/guess/check", { problem_id: problemId, user_guess: userGuess }),

  // 对局库
  importGame: (sgf: string, source?: string) =>
    post<ImportedGameDto>("/api/library/import", { sgf, source: source ?? null }),
  listImportedGames: () => get<ImportedGameDto[]>("/api/library/list"),
  getImportedGame: (id: number) => get<ImportedGameDto | null>(`/api/library/${id}`),
  deleteImportedGame: (id: number) => del<{ ok: boolean }>(`/api/library/${id}`),
  updateGameMeta: (id: number, reviewed?: boolean, tags?: string, notes?: string) =>
    put<ImportedGameDto>("/api/library/meta", { id, reviewed: reviewed ?? null, tags: tags ?? null, notes: notes ?? null }),

  // 棋力面板
  ratingHistory: () => get<{ recorded_at: string; elo: number }[]>("/api/rating/history"),

  // 野狐棋谱导入
  foxwqSearch: (params: { nickname?: string; uid?: string; limit?: number; date_from?: string; date_to?: string }) =>
    post<{
      uid: string; nickname: string;
      games: { chessid: string; black_name: string; white_name: string; black_dan: string; white_dan: string; result: string; start_time: string; move_count: number }[];
      total_found: number; total_filtered: number;
    }>("/api/foxwq/search", {
      nickname: params.nickname ?? null,
      uid: params.uid ?? null,
      limit: params.limit ?? 50,
      date_from: params.date_from ?? null,
      date_to: params.date_to ?? null,
    }),

  foxwqImport: (params: { nickname?: string; uid?: string; limit?: number; date_from?: string; date_to?: string }) =>
    post<{ imported: number; skipped: number; failed: number; message: string }>("/api/foxwq/import", {
      nickname: params.nickname ?? null,
      uid: params.uid ?? null,
      limit: params.limit ?? 50,
      date_from: params.date_from ?? null,
      date_to: params.date_to ?? null,
    }),

  // WebSocket 流式复盘
  wsReviewUrl: () => `ws://127.0.0.1:8000/ws/review`,
};
