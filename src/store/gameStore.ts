import { create } from "zustand";
import type { BoardSnapshot } from "../types";
import { ipc } from "../lib/ipc";

interface GameStore {
  snapshot: BoardSnapshot | null;
  elo: number | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  play: (x: number, y: number) => Promise<void>;
  pass: () => Promise<void>;
  newGame: (size: number) => Promise<void>;
  loadElo: () => Promise<void>;
}

export const useGameStore = create<GameStore>((set, get) => ({
  snapshot: null,
  elo: null,
  loading: false,
  error: null,

  refresh: async () => {
    try {
      const snap = await ipc.boardSnapshot();
      set({ snapshot: snap, error: null });
    } catch (e) {
      set({ error: String(e) });
    }
  },

  play: async (x, y) => {
    set({ loading: true });
    try {
      await ipc.playMove(x, y);
      await get().refresh();
    } catch (e) {
      set({ error: String(e) });
    } finally {
      set({ loading: false });
    }
  },

  pass: async () => {
    await ipc.passMove();
    await get().refresh();
  },

  newGame: async (size) => {
    await ipc.newGame(size);
    await get().refresh();
  },

  loadElo: async () => {
    const elo = await ipc.getElo();
    set({ elo });
  },
}));
