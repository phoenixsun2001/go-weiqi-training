import { useEffect, useState } from "react";
import Board, { turnLabel } from "../components/Board";
import { useGameStore } from "../store/gameStore";
import { ipc } from "../lib/ipc";
import type { Color, TerritoryEstimate } from "../types";

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
    stopEngine,
    refreshEngineStatus,
    lastMove,
  } = useGameStore();

  const [katagoInstalled, setKatagoInstalled] = useState<boolean | null>(null);
  const [installing, setInstalling] = useState(false);
  const [installMsg, setInstallMsg] = useState<string | null>(null);
  const [territory, setTerritory] = useState<TerritoryEstimate | null>(null);
  const [estimating, setEstimating] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  useEffect(() => {
    refresh();
    loadElo();
    refreshEngineStatus();
    ipc.katagoStatus().then((s) => setKatagoInstalled(s.installed)).catch(() => {});
  }, [refresh, loadElo, refreshEngineStatus]);

  if (!snapshot) return <div style={{ padding: 16 }}>加载中…</div>;

  const engineRunning = engineStatus?.running ?? false;
  const difficulty = engineStatus?.difficulty ?? 3;

  const handleInstall = async () => {
    setInstalling(true);
    setInstallMsg("正在下载 KataGo（约 60MB，含网络权重）…");
    try {
      const msg = await ipc.installKatago();
      setKatagoInstalled(true);
      setInstallMsg(msg);
    } catch (e) {
      setInstallMsg(`安装失败：${e}`);
    } finally {
      setInstalling(false);
    }
  };

  const handleAutoStart = async () => {
    try {
      const s = await ipc.autoStartEngine(difficulty);
      await refreshEngineStatus();
      setInstallMsg(`✓ AI 引擎已启动（业余${s.difficulty}段）`);
    } catch (e) {
      setInstallMsg(`启动失败：${e}`);
    }
  };

  const handleEstimate = async () => {
    setEstimating(true);
    setTerritory(null);
    try {
      const t = await ipc.estimateTerritory();
      setTerritory(t);
    } catch (e) {
      setInstallMsg(`形势判断失败：${e}`);
    } finally {
      setEstimating(false);
    }
  };

  const handleSaveGame = async () => {
    try {
      const result = territory?.score ?? "";
      const id = await ipc.saveCurrentGame("我", `AI(${difficulty}段)`, result);
      setSaveMsg(`✓ 棋谱已保存到对局库（#${id}）`);
    } catch (e) {
      setSaveMsg(`保存失败：${e}`);
    }
  };


  return (
    <div style={{ display: "flex", gap: 24, padding: 16, alignItems: "flex-start" }}>
      <div style={{ flex: 1, minWidth: 300 }}>
        <Board snapshot={snapshot} onPlay={(x, y) => play(x, y)} interactive={!loading && !aiThinking} showCoords lastMove={lastMove} />
      </div>
      <div style={{ minWidth: 280, width: 320, flexShrink: 1, overflowY: "auto", maxHeight: "calc(100vh - 100px)" }}>
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
            {/* KataGo 一键安装 */}
            {katagoInstalled === false && (
              <div style={{ marginBottom: 12, padding: 10, background: "#fff7e6", border: "1px solid #ffd591", borderRadius: 6 }}>
                <p style={{ margin: "0 0 8px", fontSize: 13 }}>
                  KataGo 引擎尚未安装。点击下方按钮自动下载（OpenCL 版 + 网络权重，约 60MB）：
                </p>
                <button onClick={handleInstall} disabled={installing}>
                  {installing ? "下载中…" : "一键安装 KataGo"}
                </button>
              </div>
            )}
            {installMsg && (
              <p style={{ fontSize: 12, color: katagoInstalled ? "#2a7d2a" : "#b8860b", marginBottom: 8 }}>
                {installMsg}
              </p>
            )}

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
                value={difficulty}
                onChange={(e) => setDifficulty(Number(e.target.value))}
                disabled={engineRunning}
                style={{ marginLeft: 8 }}
              >
                {[1, 2, 3, 4, 5].map((d) => (
                  <option key={d} value={d}>
                    业余 {d} 段
                  </option>
                ))}
              </select>
            </div>

            <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              {!engineRunning ? (
                <button
                  onClick={handleAutoStart}
                  disabled={!katagoInstalled}
                  title={!katagoInstalled ? "请先安装 KataGo" : ""}
                >
                  一键启动 AI 对战
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
                ? `✓ AI 引擎运行中 · 难度 业余${difficulty}段`
                : katagoInstalled
                ? "○ 引擎未启动（点击上方按钮一键启动）"
                : "○ 请先安装 KataGo"}
            </p>
            <p style={{ fontSize: 12, color: "#666" }}>
              说明：难度通过限制 KataGo 的 maxVisits 实现段位模拟（1段=8 … 5段=800+）。
              若执白，开新局后需点"让 AI 先手"由黑棋先行。
            </p>
          </>
        )}


        <hr style={{ margin: "16px 0", border: "none", borderTop: "1px solid #eee" }} />

        {/* 形势判断 */}
        <h3 style={{ fontSize: 15, margin: "0 0 8px" }}>形势判断</h3>
        <button
          onClick={handleEstimate}
          disabled={!engineRunning || estimating}
          style={{ marginBottom: 8 }}
        >
          {estimating ? "判断中…" : "📊 形势判断"}
        </button>
        {territory && (
          <div style={{ padding: 10, background: "#f6f8fa", borderRadius: 6, marginBottom: 8, fontSize: 13 }}>
            <div style={{ marginBottom: 4 }}>
              <strong>结果：</strong>
              <span style={{ color: territory.lead > 0 ? "#000" : "#666", fontSize: 15 }}>
                {territory.score}
              </span>
            </div>
            <div style={{ marginBottom: 4 }}>
              <strong>黑方胜率：</strong>
              {(territory.black_winrate * 100).toFixed(1)}%
              <div style={{ height: 12, background: "#ddd", borderRadius: 6, marginTop: 4, overflow: "hidden" }}>
                <div
                  style={{
                    width: `${territory.black_winrate * 100}%`,
                    height: "100%",
                    background: "#111",
                  }}
                />
              </div>
            </div>
            <div>
              <strong>领先：</strong>
              <span style={{ color: territory.lead > 0 ? "#000" : "#888" }}>
                {territory.lead > 0
                  ? `黑方领先 ${territory.lead.toFixed(1)} 目`
                  : territory.lead < 0
                  ? `白方领先 ${(-territory.lead).toFixed(1)} 目`
                  : "形势均势"}
              </span>
              <span style={{ marginLeft: 8, color: "#999" }}>· {territory.move_count} 手</span>
            </div>
          </div>
        )}

        <hr style={{ margin: "12px 0", border: "none", borderTop: "1px solid #eee" }} />

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <button onClick={() => pass()} disabled={loading || aiThinking}>
            虚手 (Pass)
          </button>
          <button onClick={handleSaveGame} disabled={loading}>
            💾 保存棋谱到对局库
          </button>
          {saveMsg && (
            <p style={{ fontSize: 12, color: saveMsg.startsWith("✓") ? "#2a7d2a" : "#cf1322" }}>
              {saveMsg}
            </p>
          )}
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
