import { create } from "zustand";
import type { BoardSnapshot, Color, EngineStatus, Stone } from "../types";
import { ipc } from "../lib/ipc";

interface GameStore {
  snapshot: BoardSnapshot | null;
  elo: number | null;
  loading: boolean;
  error: string | null;
  lastErrorKind: "engine" | "rule" | null;

  // AI 对手模式
  aiMode: boolean; // 是否启用 AI 对手
  userColor: Color; // 人类执什么色
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

export const useGameStore = create<GameStore>((set, get) => ({
  snapshot: null,
  elo: null,
  loading: false,
  error: null,
  lastErrorKind: null,

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
      const res = await ipc.playMove(x, y);
      set({
        snapshot: snapFromResult(res, get().snapshot),
        error: null,
        lastErrorKind: null,
      });
      // 若启用 AI 对手且现在轮到 AI，触发 AI 落子
      await maybeAiMove(set, get);
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
      set({ snapshot: snapFromResult(res, get().snapshot) });
      await maybeAiMove(set, get);
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
      const status = await ipc.startEngine({
        binary_path: binaryPath,
        args,
        difficulty: get().engineStatus?.difficulty ?? 3,
      });
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
  get: () => GameStore
) {
  const { aiMode, userColor, snapshot } = get();
  if (!aiMode || !snapshot) return;
  if (snapshot.turn !== aiColor(userColor)) return;
  set({ aiThinking: true });
  try {
    const res = await ipc.aiMove(userColor);
    if (res.played === "resign") {
      setError(set, "AI 认输（resign）", "engine");
    } else {
      set({
        snapshot: snapFromResult(res, get().snapshot),
        error: null,
        lastErrorKind: null,
      });
    }
  } catch (e) {
    setError(set, String(e), "engine");
  } finally {
    set({ aiThinking: false });
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
