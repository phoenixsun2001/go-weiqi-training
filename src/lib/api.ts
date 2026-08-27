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

// API 基地址：默认同源（部署时由后端托管 dist），本地开发可用 VITE_API_BASE 覆盖
const BASE = import.meta.env.VITE_API_BASE ?? "";

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

  // AI 智能复盘（不依赖 KataGo；带 gameId 时落库）
  aiReview: (sgf: string, gameId?: number) =>
    post<AiReviewResult>("/api/review/ai", { sgf, game_id: gameId ?? null }),

  // 已落库的 AI 复盘（联查对局元数据；无则 null）
  getAiReviewCached: (gameId: number) =>
    get<AiReviewResult | null>(`/api/review/ai/result/${gameId}`),

  // 批量补算对局库 AI 复盘（幂等）
  batchAiReview: () =>
    post<{ total: number; processed: number; errors: number; cached_total: number }>("/api/review/ai/batch"),

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

  // 定式学习
  getJoseki: (params?: Record<string, string>) => {
    const query = params ? "?" + Object.entries(params).map(([k,v]) => `${k}=${encodeURIComponent(v)}`).join("&") : "";
    return get<{ joseki: any[]; categories: string[] }>(`/api/joseki/list${query}`);
  },

  // 棋理概念索引：concept -> 相关定式（训练任务定位用）
  getJosekiConcepts: () =>
    get<Record<string, { name: string; category: string; difficulty: number; explanation: string }[]>>("/api/joseki/concepts"),

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

  // 野狐定时同步
  getSyncConfig: () =>
    get<{ config: SyncConfigDto; last_run: SyncLogDto | null }>("/api/foxwq/sync/config"),
  setSyncConfig: (p: { enabled: boolean; nickname?: string; uid?: string; interval_hours?: number; limit_count?: number }) =>
    put<{ ok: boolean; config: SyncConfigDto }>("/api/foxwq/sync/config", {
      enabled: p.enabled, nickname: p.nickname ?? "", uid: p.uid ?? "",
      interval_hours: p.interval_hours ?? 24, limit_count: p.limit_count ?? 30,
    }),
  runFoxwqSync: () =>
    post<SyncRunResult>("/api/foxwq/sync/run"),
  getSyncLogs: () =>
    get<SyncLogDto[]>("/api/foxwq/sync/logs"),

  // 训练计划
  generateTrainingPlan: () =>
    post<{ message: string; task_count: number }>("/api/training/generate"),
  getTrainingTasks: () =>
    get<TrainingTaskDto[]>("/api/training/tasks"),
  getTrainingProgress: () =>
    get<TrainingProgressDto>("/api/training/progress"),
  updateTrainingTaskStatus: (taskId: number, status: string) =>
    put<{ ok: boolean }>(`/api/training/task/${taskId}/status`, { status }),
  getTrainingWeakness: () =>
    get<TrainingWeaknessDto>("/api/training/weakness"),
  // 复盘任务的典型对局匹配：{task_id: [对局]}
  getTrainingMatches: () =>
    get<Record<number, TrainingMatchDto[]>>("/api/training/matches"),
  // 近期问题趋势分析（强化训练闭环）
  getTrainingInsights: (window = 10) =>
    get<InsightsDto>(`/api/training/insights?window=${window}`),

  // WebSocket 流式复盘（同源，部署版自动指向服务器）
  wsReviewUrl: () => `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws/review`,
};

export interface TrainingTaskDto {
  id: number; week: number; day: number; category: string;
  title: string; description: string; target_module: string;
  difficulty: number; status: string; sort_order: number;
  completed_at: string | null;
}

export interface TrainingProgressDto {
  total: number; done: number; skipped: number; pending: number;
  completion_rate: number;
  weeks: Record<number, { total: number; done: number; pending: number }>;
}

export interface TrainingWeaknessDto {
  total_games: number;
  phase_scores: Record<string, number>;
  weaknesses: { issue: string; count: number; percentage: number }[];
}

export interface TrainingMatchDto {
  game_id: number;
  date: string;
  opponent: string;
  opponent_rank: string;
  result: string;
  reason: string;
  score: number;
}

export interface AiReviewPhase {
  phase: string; range: string; score: number;
  comments: string[]; issues: string[];
}

export interface AiReviewResult {
  game_id?: number;
  black?: string; white?: string; black_rank?: string; white_rank?: string;
  result?: string; board_size?: number; date?: string;
  reviewee: string; reviewee_color: string; reviewee_won: boolean;
  total_moves: number;
  analyzed_at?: string;
  phases: AiReviewPhase[];
  key_moves: { move: number; color: string; point: string; type: string; issues: string[] }[];
  summary: string;
  territory_estimate: { black_territory_est?: number; white_territory_est?: number; assessment?: string };
  saved?: boolean;
}

export interface SyncConfigDto {
  id: number; enabled: number; nickname: string; uid: string;
  interval_hours: number; limit_count: number; updated_at: string | null;
}

export interface SyncLogDto {
  id: number; started_at: string; finished_at: string | null;
  status: string; trigger_type: string;
  imported: number; skipped: number; failed: number; message: string;
}

export interface SyncRunResult {
  ok: boolean; imported?: number; skipped?: number; failed?: number;
  message?: string; ai_backfill?: number;
}

export interface InsightsDto {
  stored_reviews: number;
  window: number;
  recent_count: number; prev_count: number;
  has_data: boolean;
  recent_date_range?: [string, string];
  phase_trend?: Record<string, { now: number | null; previous: number | null; delta: number | null }>;
  issue_trend?: { issue: string; recent: number; previous: number; delta: number; percentage: number }[];
  win_rate?: { recent: number | null; previous: number | null };
  recommendations?: {
    issue: string; week: number; day: number; title: string;
    description: string; target_module: string; reason: string;
  }[];
}
