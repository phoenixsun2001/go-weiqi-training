import { create } from "zustand";
import type { BoardSnapshot, Color, EngineStatus, Stone } from "../types";
import { ipc } from "../lib/ipc";

interface GameStore {
  snapshot: BoardSnapshot | null;
  elo: number | null;
  loading: boolean;
  error: string | null;
  lastErrorKind: "engine" | "rule" | null;
  /** 最新一手棋的坐标（用于红三角标记） */
  lastMove: { x: number; y: number } | null;

  aiMode: boolean;
  userColor: Color;
  engineStatus: EngineStatus | null;
  aiThinking: boolean;

  refresh: () => Promise<void>;
  play: (x: number, y: number) => Promise<void>;
  pass: () => Promise<void>;
  newGame: (size: number) => Promise<void>;
  loadElo: () => Promise<void>;

  setAiMode: (on: boolean) => void;
  setUserColor: (c: Color) => void;
  setDifficulty: (difficulty: number) => Promise<void>;
  startEngine: (binaryPath: string, args: string[]) => Promise<void>;
  stopEngine: () => Promise<void>;
  refreshEngineStatus: () => Promise<void>;
}

const emptySnapshot = (size = 19): BoardSnapshot => ({
  size,
  stones: Array(size * size).fill(null),
  turn: "black",
});

/** 比较新旧 stones 找到新增的棋子（即最新一手） */
function diffLastMove(
  prev: Stone[] | null,
  next: Stone[],
  size: number
): { x: number; y: number } | null {
  if (!prev) return null;
  for (let i = 0; i < next.length && i < prev.length; i++) {
    // 新位置有子但旧位置没有（提子后可能有多个变化，取第一个新增）
    if (next[i] && !prev[i]) {
      return { x: i % size, y: Math.floor(i / size) };
    }
  }
  return null;
}

export const useGameStore = create<GameStore>((set, get) => ({
  snapshot: emptySnapshot(19),
  elo: null,
  loading: false,
  error: null,
  lastErrorKind: null,
  lastMove: null,

  aiMode: false,
  userColor: "black",
  engineStatus: null,
  aiThinking: false,

  refresh: async () => {
    try {
      const snap = await ipc.boardSnapshot();
      set({ snapshot: snap, error: null, lastErrorKind: null });
    } catch (e) {
      set({ error: String(e) });
    }
  },

  play: async (x, y) => {
    if (get().loading) return;
    set({ loading: true });
    try {
      const prevStones = get().snapshot?.stones ?? null;
      const res = await ipc.playMove(x, y);
      const newSnap = snapFromResult(res, get().snapshot);
      set({
        snapshot: newSnap,
        lastMove: { x, y },
        error: null,
        lastErrorKind: null,
      });
      await maybeAiMove(set, get, prevStones);
    } catch (e) {
      setError(set, String(e));
    } finally {
      set({ loading: false });
    }
  },

  pass: async () => {
    if (get().loading) return;
    set({ loading: true });
    try {
      const res = await ipc.passMove();
      set({ snapshot: snapFromResult(res, get().snapshot), lastMove: null });
      await maybeAiMove(set, get, null);
    } catch (e) {
      setError(set, String(e));
    } finally {
      set({ loading: false });
    }
  },

  newGame: async (size) => {
    try {
      await ipc.newGame(size);
      await get().refresh();
      set({ lastMove: null });
    } catch (e) {
      setError(set, String(e));
    }
  },

  loadElo: async () => {
    const elo = await ipc.getElo();
    set({ elo });
  },

  setAiMode: (on) => set({ aiMode: on }),
  setUserColor: (c) => set({ userColor: c }),

  setDifficulty: async (difficulty) => {
    try {
      await ipc.setDifficulty(difficulty);
      await get().refreshEngineStatus();
    } catch (e) {
      setError(set, String(e));
    }
  },

  startEngine: async (binaryPath, args) => {
    try {
      const status = await ipc.startEngine(binaryPath, args, get().engineStatus?.difficulty ?? 3);
      set({ engineStatus: status, error: null, lastErrorKind: null });
    } catch (e) {
      setError(set, String(e), "engine");
    }
  },

  stopEngine: async () => {
    try {
      await ipc.stopEngine();
      await get().refreshEngineStatus();
    } catch (e) {
      setError(set, String(e));
    }
  },

  refreshEngineStatus: async () => {
    try {
      const status = await ipc.engineStatus();
      set({ engineStatus: status });
    } catch (e) {
      setError(set, String(e));
    }
  },
}));

interface ResultLike {
  turn: Color;
  stones: Stone[];
}
function snapFromResult(res: ResultLike, prev: BoardSnapshot | null): BoardSnapshot {
  const size = prev?.size ?? 19;
  return { size, stones: res.stones, turn: res.turn };
}

function aiColor(userColor: Color): Color {
  return userColor === "black" ? "white" : "black";
}

async function maybeAiMove(
  set: (partial: Partial<GameStore>) => void,
  get: () => GameStore,
  _prevStones: Stone[] | null
) {
  const { aiMode, userColor, snapshot } = get();
  if (!aiMode || !snapshot) return;
  if (snapshot.turn !== aiColor(userColor)) return;
  // 在 AI 思考期间也锁住 loading，防止用户并发落子导致引擎管道冲突
  set({ aiThinking: true, loading: true });
  // 模拟人类思考节奏：延迟 0.8-2 秒
  const thinkTime = 800 + Math.random() * 1200;
  await new Promise((r) => setTimeout(r, thinkTime));
  try {
    const aiStonesBefore = get().snapshot?.stones ?? null;
    const res = await ipc.aiMove(userColor);
    if (res.played === "resign") {
      setError(set, "AI 认输（resign）", "engine");
    } else {
      const newSnap = snapFromResult(res, get().snapshot);
      // 找 AI 落子位置（通过 vertex 字段或 diff）
      const aiMove =
        (res.vertex ? { x: res.vertex[0], y: res.vertex[1] } : null) ??
        diffLastMove(aiStonesBefore, newSnap.stones, newSnap.size);
      set({
        snapshot: newSnap,
        lastMove: aiMove,
        error: null,
        lastErrorKind: null,
      });
    }
  } catch (e) {
    setError(set, String(e), "engine");
  } finally {
    set({ aiThinking: false, loading: false });
  }
}

function setError(
  set: (partial: Partial<GameStore>) => void,
  msg: string,
  kind: "engine" | "rule" = "rule"
) {
  set({ error: msg, lastErrorKind: kind });
}

export { emptySnapshot };
