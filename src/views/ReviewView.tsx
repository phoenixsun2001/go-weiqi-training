import { useEffect, useMemo, useState } from "react";
import WinRateChart from "./WinRateChart";
import Board from "../components/Board";
import { ipc } from "../lib/ipc";
import type { AnalysisReport, BoardSnapshot, MoveAnalysisDto, ReviewResultDto } from "../types";

interface Props {
  pendingReview: { gameId: number; sgf: string } | null;
  onReviewed: () => void;
}

export default function ReviewView({ pendingReview, onReviewed }: Props) {
  const [sgf, setSgf] = useState("");
  const [engineRunning, setEngineRunning] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [report, setReport] = useState<AnalysisReport | null>(null);
  const [cachedResult, setCachedResult] = useState<ReviewResultDto | null>(null);
  const [current, setCurrent] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [gameId, setGameId] = useState<number | null>(null);
  const [autoPlay, setAutoPlay] = useState(false);

  useEffect(() => {
    ipc.analysisEngineStatus().then((s) => setEngineRunning(s.running)).catch(() => {});
  }, []);

  // 从对局库跳转：预填 SGF + 尝试加载已缓存的复盘结果
  useEffect(() => {
    if (pendingReview) {
      setSgf(pendingReview.sgf);
      setGameId(pendingReview.gameId);
      setReport(null);
      setCachedResult(null);
      setCurrent(null);
      setError(null);
      // 尝试加载已持久化的复盘结果（不用重跑 KataGo）
      ipc.getReviewResult(pendingReview.gameId).then((r) => {
        if (r) {
          setCachedResult(r);
          setReport({
            moves: r.moves,
            winrate_curve: r.winrate_curve,
            blunder_count: r.blunder_count,
            inaccuracy_count: r.inaccuracy_count,
            summary: r.summary,
          });
        }
      }).catch(() => {});
    }
  }, [pendingReview]);

  // 自动播放
  useEffect(() => {
    if (!autoPlay || !report) return;
    const timer = setTimeout(() => {
      setCurrent((c) => {
        if (c === null) return 0;
        if (c >= report.moves.length - 1) {
          setAutoPlay(false);
          return c;
        }
        return c + 1;
      });
    }, 800);
    return () => clearTimeout(timer);
  }, [autoPlay, current, report]);

  const handleAutoStart = async () => {
    setError(null);
    try {
      await ipc.autoStartAnalysisEngine();
      setEngineRunning(true);
    } catch (e) {
      setError(String(e));
    }
  };

  const analyze = async () => {
    setError(null);
    setAnalyzing(true);
    setReport(null);
    try {
      const r = await ipc.importAndAnalyze(sgf, 0.03, gameId ?? undefined);
      setReport(r);
      setCurrent(null);
      if (gameId) onReviewed();
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

  // 解析 SGF 为逐步棋盘
  const boardSnapshots = useMemo(() => buildBoardSequence(sgf), [sgf]);
  const displayStep = current !== null ? current : (boardSnapshots.length - 1);
  const currentSnapshot: BoardSnapshot = boardSnapshots[Math.min(displayStep, boardSnapshots.length - 1)] ?? boardSnapshots[0];
  const currentMove: MoveAnalysisDto | null =
    report && current !== null ? report.moves[current] ?? null : null;

  return (
    <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2 style={{ margin: 0 }}>AI 复盘分析</h2>
        {cachedResult && (
          <span style={{ fontSize: 12, color: "#1890ff" }}>
            📋 显示已缓存复盘结果（{cachedResult.analyzed_at}），可点"重新分析"更新
          </span>
        )}
      </div>

      {/* 引擎 */}
      <div style={{ border: "1px solid #eee", borderRadius: 6, padding: 8, display: "flex", gap: 8, alignItems: "center" }}>
        {engineRunning ? (
          <button onClick={() => { ipc.stopAnalysisEngine(); setEngineRunning(false); }}>停止引擎</button>
        ) : (
          <button onClick={handleAutoStart}>一键启动 KataGo</button>
        )}
        <span style={{ fontSize: 12, color: engineRunning ? "#2a7d2a" : "#999" }}>
          {engineRunning ? "✓ 分析引擎运行中" : "○ 引擎未启动"}
        </span>
      </div>

      {/* SGF 导入 */}
      {!pendingReview && (
        <div style={{ border: "1px solid #eee", borderRadius: 6, padding: 8 }}>
          <div style={{ display: "flex", gap: 8, marginBottom: 6, alignItems: "center" }}>
            <input type="file" accept=".sgf" onChange={handleFile} />
            <span style={{ fontSize: 12, color: "#999" }}>或粘贴 SGF</span>
          </div>
          <textarea
            value={sgf}
            onChange={(e) => setSgf(e.target.value)}
            rows={3}
            style={{ width: "100%", fontFamily: "monospace", fontSize: 12 }}
          />
        </div>
      )}

      {error && <p style={{ color: "red", fontSize: 13 }}>{error}</p>}

      {/* 棋盘 + 导航 */}
      {sgf && currentSnapshot && (
        <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
          <div style={{ flexShrink: 0 }}>
            <Board snapshot={currentSnapshot} interactive={false} size={520} />
            {/* 导航控件 */}
            <div style={{ display: "flex", gap: 4, justifyContent: "center", marginTop: 8 }}>
              <button onClick={() => setCurrent(0)} title="首手">⏮</button>
              <button onClick={() => setCurrent((c) => Math.max(0, (c ?? 1) - 1))} title="上一手">◀</button>
              <button
                onClick={() => setAutoPlay((p) => !p)}
                style={{ background: autoPlay ? "#1890ff" : undefined, color: autoPlay ? "#fff" : undefined }}
                title="自动播放"
              >
                {autoPlay ? "⏸" : "▶"}
              </button>
              <button onClick={() => setCurrent((c) => Math.min(boardSnapshots.length - 1, (c ?? -1) + 1))} title="下一手">▶</button>
              <button onClick={() => { setAutoPlay(false); setCurrent(boardSnapshots.length - 1); }} title="末手">⏭</button>
            </div>
            <p style={{ textAlign: "center", fontSize: 12, color: "#666", marginTop: 4 }}>
              第 {(displayStep)} / {boardSnapshots.length - 1} 手
            </p>
          </div>

          {/* 分析结果 */}
          <div style={{ flex: 1, minWidth: 300 }}>
            <button
              onClick={analyze}
              disabled={!engineRunning || analyzing || !sgf.trim()}
              style={{ marginBottom: 8 }}
            >
              {analyzing ? "分析中…" : cachedResult ? "🔄 重新分析" : "开始复盘分析"}
            </button>
            {!engineRunning && !cachedResult && (
              <span style={{ fontSize: 12, color: "#b8860b", marginLeft: 8 }}>⚠ 需先启动引擎</span>
            )}

            {/* 总结报告 */}
            {report && (
              <div style={{ background: "#f6f8fa", border: "1px solid #e1e4e8", borderRadius: 6, padding: 10, marginBottom: 8 }}>
                <strong>📋 复盘总结</strong>
                <p style={{ margin: "6px 0 0", fontSize: 13, lineHeight: 1.6 }}>{report.summary}</p>
              </div>
            )}

            {/* 胜率曲线 */}
            {report && report.winrate_curve.length > 0 && (
              <>
                <h4 style={{ margin: "8px 0 4px" }}>胜率曲线</h4>
                <WinRateChart winrates={report.winrate_curve} currentIndex={current} onJump={setCurrent} />
              </>
            )}

            {/* 当前手分析 */}
            {currentMove && (
              <div
                style={{
                  marginTop: 8, padding: 8, borderRadius: 4,
                  background: kindColor(currentMove.kind, 0.12),
                  border: `1px solid ${kindColor(currentMove.kind, 1)}`,
                }}
              >
                <strong>第 {currentMove.move_index + 1} 手</strong>
                <span style={{ marginLeft: 8, color: kindColor(currentMove.kind, 1) }}>{kindLabel(currentMove.kind)}</span>
                <span style={{ marginLeft: 12, fontSize: 13 }}>
                  胜率 {(currentMove.played_winrate * 100).toFixed(1)}%
                  {currentMove.loss > 0.001 && (
                    <span style={{ color: "#cf1322" }}> （损失 {(currentMove.loss * 100).toFixed(1)}%）</span>
                  )}
                </span>
                <div style={{ fontSize: 13, marginTop: 4 }}>
                  最佳：<strong>{currentMove.best_move || "—"}</strong> · 阶段：{currentMove.category}
                </div>
              </div>
            )}

            {/* 失误列表 */}
            {report && (
              <>
                <h4 style={{ marginBottom: 4, marginTop: 12 }}>失误手</h4>
                <div style={{ maxHeight: 200, overflowY: "auto", fontSize: 12 }}>
                  {report.moves.filter((m) => m.kind !== "good").length === 0 ? (
                    <p style={{ color: "#389e0d" }}>本局无明显失误！</p>
                  ) : (
                    report.moves.filter((m) => m.kind !== "good").map((m) => (
                      <div
                        key={m.move_index}
                        onClick={() => { setAutoPlay(false); setCurrent(m.move_index); }}
                        style={{
                          cursor: "pointer", padding: "3px 6px",
                          borderBottom: "1px solid #f0f0f0",
                          color: kindColor(m.kind, 1),
                          background: current === m.move_index ? "#fff7e6" : "transparent",
                        }}
                      >
                        第 {m.move_index + 1} 手 · {kindLabel(m.kind)} · 损失 {(m.loss * 100).toFixed(1)}% · {m.category}
                      </div>
                    ))
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** 解析 SGF 为逐步棋盘快照序列（第0步=空盘，第n步=下了n手后） */
function buildBoardSequence(sgf: string): BoardSnapshot[] {
  const sizeMatch = sgf.match(/SZ\[(\d+)\]/);
  const size = sizeMatch ? Number(sizeMatch[1]) : 19;
  const empty: BoardSnapshot["stones"] = Array(size * size).fill(null);
  const snapshots: BoardSnapshot[] = [{ size, stones: [...empty], turn: "black" }];

  const re = /;([BW])\[([a-z]{2}|)\]/g;
  let m: RegExpExecArray | null;
  let stones = [...empty];
  let turn: "black" | "white" = "black";
  while ((m = re.exec(sgf)) !== null) {
    const color = m[1] === "B" ? "black" : "white";
    if (m[2].length === 2) {
      const x = m[2].charCodeAt(0) - 97;
      const y = m[2].charCodeAt(1) - 97;
      if (x >= 0 && x < size && y >= 0 && y < size) {
        stones[y * size + x] = color;
      }
    }
    turn = color === "black" ? "white" : "black";
    snapshots.push({ size, stones: [...stones], turn });
  }
  return snapshots;
}

function kindLabel(k: MoveAnalysisDto["kind"]): string {
  return k === "blunder" ? "严重失误" : k === "inaccuracy" ? "不准确" : "好棋";
}

function kindColor(k: MoveAnalysisDto["kind"], alpha: number): string {
  return k === "blunder"
    ? `rgba(207,19,34,${alpha})`
    : k === "inaccuracy"
    ? `rgba(212,160,23,${alpha})`
    : `rgba(56,158,13,${alpha})`;
}
