import { useEffect, useState } from "react";
import WinRateChart from "./WinRateChart";
import { ipc } from "../lib/ipc";
import type { AnalysisReport, MoveAnalysisDto } from "../types";

const SAMPLE_SGF = "(;GM[1]FF[4]SZ[9]\n;B[ee];W[ed];B[fd];W[ec];B[gc];W[fe])";

export default function ReviewView() {
  const [sgf, setSgf] = useState(SAMPLE_SGF);
  const [binaryPath, setBinaryPath] = useState("");
  const [engineArgs, setEngineArgs] = useState("gtp -model model.bin");
  const [engineRunning, setEngineRunning] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [report, setReport] = useState<AnalysisReport | null>(null);
  const [current, setCurrent] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    ipc
      .analysisEngineStatus()
      .then((s) => setEngineRunning(s.running))
      .catch(() => {});
  }, []);

  const startEngine = async () => {
    setError(null);
    try {
      await ipc.startAnalysisEngine(binaryPath, engineArgs.split(/\s+/).filter(Boolean));
      setEngineRunning(true);
    } catch (e) {
      setError(String(e));
    }
  };

  const stopEngine = async () => {
    await ipc.stopAnalysisEngine();
    setEngineRunning(false);
  };

  const analyze = async () => {
    setError(null);
    setAnalyzing(true);
    setReport(null);
    try {
      const r = await ipc.importAndAnalyze(sgf, 0.03);
      setReport(r);
      setCurrent(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setAnalyzing(false);
    }
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setSgf(String(reader.result));
    reader.readAsText(file);
  };

  const currentMove: MoveAnalysisDto | null =
    report && current !== null ? report.moves[current] ?? null : null;

  return (
    <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 16 }}>
      <h2>AI 复盘分析</h2>

      {/* 分析引擎设置 */}
      <div style={{ border: "1px solid #eee", borderRadius: 6, padding: 12 }}>
        <h3 style={{ marginTop: 0 }}>分析引擎</h3>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
          <label style={{ fontSize: 13 }}>
            KataGo 路径
            <input
              type="text"
              value={binaryPath}
              onChange={(e) => setBinaryPath(e.target.value)}
              disabled={engineRunning}
              placeholder="如 C:/katago/katago.exe"
              style={{ display: "block", padding: 4, width: 240 }}
            />
          </label>
          <label style={{ fontSize: 13 }}>
            启动参数
            <input
              type="text"
              value={engineArgs}
              onChange={(e) => setEngineArgs(e.target.value)}
              disabled={engineRunning}
              style={{ display: "block", padding: 4, width: 240 }}
            />
          </label>
          {engineRunning ? (
            <button onClick={stopEngine}>停止引擎</button>
          ) : (
            <button onClick={startEngine} disabled={!binaryPath}>
              启动引擎
            </button>
          )}
          <span style={{ fontSize: 12, color: engineRunning ? "#2a7d2a" : "#999" }}>
            {engineRunning ? "✓ 引擎运行中" : "○ 引擎未启动"}
          </span>
        </div>
      </div>

      {/* SGF 导入 */}
      <div style={{ border: "1px solid #eee", borderRadius: 6, padding: 12 }}>
        <h3 style={{ marginTop: 0 }}>导入 SGF 棋谱</h3>
        <div style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "center" }}>
          <input type="file" accept=".sgf" onChange={handleFile} />
          <span style={{ fontSize: 12, color: "#999" }}>或直接在下方粘贴 SGF</span>
        </div>
        <textarea
          value={sgf}
          onChange={(e) => setSgf(e.target.value)}
          rows={4}
          style={{ width: "100%", fontFamily: "monospace", fontSize: 12 }}
        />
        <div style={{ marginTop: 8 }}>
          <button onClick={analyze} disabled={!engineRunning || analyzing || !sgf.trim()}>
            {analyzing ? "分析中…" : "开始复盘分析"}
          </button>
          {!engineRunning && (
            <span style={{ fontSize: 12, color: "#b8860b", marginLeft: 8 }}>
              ⚠ 需先启动分析引擎
            </span>
          )}
        </div>
      </div>

      {error && <p style={{ color: "red" }}>错误：{error}</p>}

      {/* 分析结果 */}
      {report && (
        <div style={{ border: "1px solid #eee", borderRadius: 6, padding: 12 }}>
          <h3 style={{ marginTop: 0 }}>分析结果</h3>
          <div style={{ fontSize: 14, marginBottom: 12 }}>
            共 {report.moves.length} 手 · 严重失误{" "}
            <strong style={{ color: "#cf1322" }}>{report.blunder_count}</strong> · 不准确{" "}
            <strong style={{ color: "#d4a017" }}>{report.inaccuracy_count}</strong>
            <span style={{ marginLeft: 12, color: "#666", fontSize: 12 }}>
              失误已自动记入弱点统计，将影响针对性出题
            </span>
          </div>

          <WinRateChart
            winrates={report.winrate_curve}
            currentIndex={current}
            onJump={setCurrent}
          />

          {currentMove && (
            <div
              style={{
                marginTop: 12,
                padding: 8,
                borderRadius: 4,
                background: kindColor(currentMove.kind, 0.12),
                border: `1px solid ${kindColor(currentMove.kind, 1)}`,
              }}
            >
              <strong>第 {currentMove.move_index + 1} 手</strong>
              <span style={{ marginLeft: 8, color: kindColor(currentMove.kind, 1) }}>
                {kindLabel(currentMove.kind)}
              </span>
              <span style={{ marginLeft: 12, fontSize: 13 }}>
                胜率 {(currentMove.played_winrate * 100).toFixed(1)}%
                {currentMove.loss > 0.001 && (
                  <span style={{ color: "#cf1322" }}>
                    {" "}
                    （损失 {(currentMove.loss * 100).toFixed(1)}%）
                  </span>
                )}
              </span>
              <div style={{ fontSize: 13, marginTop: 4 }}>
                最佳：<strong>{currentMove.best_move || "—"}</strong> · 阶段：{currentMove.category}
              </div>
            </div>
          )}

          {/* 失误列表 */}
          <h4 style={{ marginBottom: 4, marginTop: 16 }}>失误手列表</h4>
          <div style={{ maxHeight: 200, overflowY: "auto", fontSize: 12 }}>
            {report.moves.filter((m) => m.kind !== "good").length === 0 ? (
              <p style={{ color: "#389e0d" }}>本局没有明显失误，下得好！</p>
            ) : (
              report.moves
                .filter((m) => m.kind !== "good")
                .map((m) => (
                  <div
                    key={m.move_index}
                    onClick={() => setCurrent(m.move_index)}
                    style={{
                      cursor: "pointer",
                      padding: "3px 6px",
                      borderBottom: "1px solid #f0f0f0",
                      color: kindColor(m.kind, 1),
                    }}
                  >
                    第 {m.move_index + 1} 手 · {kindLabel(m.kind)} · 胜率损失{" "}
                    {(m.loss * 100).toFixed(1)}% · {m.category} · 最佳 {m.best_move || "—"}
                  </div>
                ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function kindLabel(k: MoveAnalysisDto["kind"]): string {
  switch (k) {
    case "blunder":
      return "严重失误";
    case "inaccuracy":
      return "不准确";
    default:
      return "好棋";
  }
}

function kindColor(k: MoveAnalysisDto["kind"], alpha: number): string {
  switch (k) {
    case "blunder":
      return `rgba(207,19,34,${alpha})`;
    case "inaccuracy":
      return `rgba(212,160,23,${alpha})`;
    default:
      return `rgba(56,158,13,${alpha})`;
  }
}
