import { useEffect } from "react";
import Board, { turnLabel } from "../components/Board";
import { useGameStore } from "../store/gameStore";

export default function GameView() {
  const { snapshot, elo, loading, error, play, pass, refresh, loadElo, newGame } = useGameStore();

  useEffect(() => {
    refresh();
    loadElo();
  }, [refresh, loadElo]);

  if (!snapshot) return <div style={{ padding: 16 }}>加载中…</div>;

  return (
    <div style={{ display: "flex", gap: 24, padding: 16 }}>
      <Board snapshot={snapshot} onPlay={(x, y) => play(x, y)} interactive={!loading} />
      <div style={{ minWidth: 200 }}>
        <h2>对战练习</h2>
        <p>当前回合：{turnLabel(snapshot.turn)}</p>
        <p>
          你的棋力：{elo ? `${elo} (业余${danFromElo(elo)}段)` : "未评估"}
        </p>
        {error && <p style={{ color: "red" }}>错误：{error}</p>}
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 16 }}>
          <button onClick={() => pass()} disabled={loading}>
            虚手 (Pass)
          </button>
          <button onClick={() => newGame(9)}>新对局（9路）</button>
          <button onClick={() => newGame(19)}>新对局（19路）</button>
          <button onClick={() => refresh()}>刷新棋盘</button>
        </div>
        <p style={{ fontSize: 12, color: "#666", marginTop: 16 }}>
          提示：本 MVP 棋盘支持本地双人对弈与落子。KataGo
          对手引擎集成在完成后即可在设置中启用，届时可实现可调难度的 AI 对战。
        </p>
      </div>
    </div>
  );
}

function danFromElo(elo: number): number {
  return Math.max(1, Math.min(9, Math.floor((elo - 1400) / 100)));
}
