import { useEffect, useState } from "react";
import Board, { turnLabel } from "../components/Board";
import { useGameStore } from "../store/gameStore";
import type { Color } from "../types";

export default function GameView() {
  const {
    snapshot,
    elo,
    loading,
    error,
    lastErrorKind,
    aiMode,
    userColor,
    engineStatus,
    aiThinking,
    play,
    pass,
    refresh,
    loadElo,
    newGame,
    setAiMode,
    setUserColor,
    setDifficulty,
    startEngine,
    stopEngine,
    refreshEngineStatus,
  } = useGameStore();

  // 引擎配置（本地状态，未持久化）
  const [binaryPath, setBinaryPath] = useState("");
  const [engineArgs, setEngineArgs] = useState("gtp -model model.bin");

  useEffect(() => {
    refresh();
    loadElo();
    refreshEngineStatus();
  }, [refresh, loadElo, refreshEngineStatus]);

  if (!snapshot) return <div style={{ padding: 16 }}>加载中…</div>;

  const engineRunning = engineStatus?.running ?? false;

  return (
    <div style={{ display: "flex", gap: 24, padding: 16 }}>
      <Board snapshot={snapshot} onPlay={(x, y) => play(x, y)} interactive={!loading && !aiThinking} />
      <div style={{ minWidth: 280, maxWidth: 360 }}>
        <h2>对战练习</h2>
        <p>当前回合：{turnLabel(snapshot.turn)}{aiThinking && "（AI 思考中…）"}</p>
        <p>
          你的棋力：{elo ? `${elo}（业余${danFromElo(elo)}段）` : "未评估"}
        </p>
        {error && (
          <p style={{ color: lastErrorKind === "engine" ? "#b8860b" : "red" }}>
            {lastErrorKind === "engine" ? "⚠ " : "错误："}
            {error}
          </p>
        )}

        <hr style={{ margin: "16px 0", border: "none", borderTop: "1px solid #eee" }} />

        {/* AI 对手设置 */}
        <h3>AI 对手</h3>
        <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <input
            type="checkbox"
            checked={aiMode}
            onChange={(e) => setAiMode(e.target.checked)}
          />
          启用 KataGo AI 对手
        </label>

        {aiMode && (
          <>
            <div style={{ marginBottom: 8 }}>
              执色：
              <select
                value={userColor}
                onChange={(e) => setUserColor(e.target.value as Color)}
                disabled={engineRunning}
                style={{ marginLeft: 8 }}
              >
                <option value="black">执黑（先手）</option>
                <option value="white">执白（后手）</option>
              </select>
            </div>

            <div style={{ marginBottom: 8 }}>
              难度（段位）：
              <select
                value={engineStatus?.difficulty ?? 3}
                onChange={(e) => setDifficulty(Number(e.target.value))}
                style={{ marginLeft: 8 }}
              >
                {[1, 2, 3, 4, 5].map((d) => (
                  <option key={d} value={d}>
                    业余 {d} 段
                  </option>
                ))}
              </select>
            </div>

            <div style={{ marginBottom: 8 }}>
              <label style={{ fontSize: 13 }}>KataGo 路径：</label>
              <input
                type="text"
                value={binaryPath}
                onChange={(e) => setBinaryPath(e.target.value)}
                placeholder="如 C:/katago/katago.exe"
                disabled={engineRunning}
                style={{ width: "100%", padding: 4, marginTop: 2 }}
              />
            </div>

            <div style={{ marginBottom: 8 }}>
              <label style={{ fontSize: 13 }}>启动参数：</label>
              <input
                type="text"
                value={engineArgs}
                onChange={(e) => setEngineArgs(e.target.value)}
                placeholder="gtp -model model.bin"
                disabled={engineRunning}
                style={{ width: "100%", padding: 4, marginTop: 2 }}
              />
            </div>

            <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              {!engineRunning ? (
                <button
                  onClick={() => startEngine(binaryPath, engineArgs.split(/\s+/).filter(Boolean))}
                  disabled={!binaryPath}
                >
                  启动引擎
                </button>
              ) : (
                <button onClick={() => stopEngine()}>停止引擎</button>
              )}
            </div>

            <p
              style={{
                fontSize: 12,
                color: engineRunning ? "#2a7d2a" : "#999",
                marginBottom: 8,
              }}
            >
              {engineRunning
                ? `✓ 引擎运行中 · 难度 业余${engineStatus?.difficulty ?? 3}段`
                : "○ 引擎未启动"}
            </p>
            <p style={{ fontSize: 12, color: "#666" }}>
              说明：难度通过限制 KataGo 的 maxVisits 实现段位模拟（1段=8 … 5段=800+）。
              若执白，开新局后点"让 AI 先手"由黑棋先行。
            </p>
          </>
        )}

        <hr style={{ margin: "16px 0", border: "none", borderTop: "1px solid #eee" }} />

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <button onClick={() => pass()} disabled={loading || aiThinking}>
            虚手 (Pass)
          </button>
          <button onClick={() => newGame(9)}>新对局（9路）</button>
          <button onClick={() => newGame(19)}>新对局（19路）</button>
          <button onClick={() => refresh()}>刷新棋盘</button>
        </div>
      </div>
    </div>
  );
}

function danFromElo(elo: number): number {
  return Math.max(1, Math.min(9, Math.floor((elo - 1400) / 100)));
}
