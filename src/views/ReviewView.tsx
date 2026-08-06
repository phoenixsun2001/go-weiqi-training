import { useEffect, useMemo, useState } from "react";
import WinRateChart from "./WinRateChart";
import Board from "../components/Board";
import { ipc } from "../lib/ipc";
import type { AnalysisReport, BoardSnapshot, MoveAnalysisDto, ReviewResultDto } from "../types";

interface AiReviewResult {
  black: string; white: string;
  black_rank: string; white_rank: string;
  result: string; total_moves: number;
  board_size: number; date: string;
  reviewee: string; reviewee_color: string; reviewee_won: boolean;
  phases: { phase: string; range: string; score: number; comments: string[]; issues: string[] }[];
  key_moves: { move: number; color: string; point: string; type: string; issues: string[] }[];
  summary: string;
  territory_estimate: { black_territory_est: number; white_territory_est: number; assessment: string; black_third_line: number; white_third_line: number; black_center: number; white_center: number };
}

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

  // 新功能状态
  const [showMoveNumbers, setShowMoveNumbers] = useState(false);
  const [aiReview, setAiReview] = useState<AiReviewResult | null>(null);
  const [aiReviewing, setAiReviewing] = useState(false);

  useEffect(() => {
    ipc.analysisEngineStatus().then((s) => setEngineRunning(s.running)).catch(() => {});
  }, []);

  useEffect(() => {
    if (pendingReview) {
      setSgf(pendingReview.sgf);
      setGameId(pendingReview.gameId);
      setReport(null);
      setCachedResult(null);
      setCurrent(null);
      setError(null);
      setAiReview(null);
      ipc.getReviewResult(pendingReview.gameId).then((r) => {
        if (r) {
          setCachedResult(r);
          setReport({
            moves: r.moves, winrate_curve: r.winrate_curve,
            blunder_count: r.blunder_count, inaccuracy_count: r.inaccuracy_count, summary: r.summary,
          });
        }
      }).catch(() => {});
    }
  }, [pendingReview]);

  useEffect(() => {
    if (!autoPlay || !report) return;
    const timer = setTimeout(() => {
      setCurrent((c) => {
        if (c === null) return 0;
        if (c >= report.moves.length - 1) { setAutoPlay(false); return c; }
        return c + 1;
      });
    }, 800);
    return () => clearTimeout(timer);
  }, [autoPlay, current, report]);

  const handleAutoStart = async () => {
    setError(null);
    try { await ipc.startAnalysisEngine(); setEngineRunning(true); }
    catch (e) { setError(String(e)); }
  };

  const analyze = async () => {
    setError(null); setAnalyzing(true); setReport(null);
    try {
      const r = await ipc.importAndAnalyze(sgf, 0.03, gameId ?? undefined);
      setReport(r); setCurrent(null);
      if (gameId) onReviewed();
    } catch (e) { setError(String(e)); }
    finally { setAnalyzing(false); }
  };

  // AI 智能复盘（不依赖 KataGo）
  const handleAiReview = async () => {
    setError(null); setAiReviewing(true); setAiReview(null);
    try {
      const r = await ipc.aiReview(sgf, gameId ?? undefined);
      setAiReview(r);
    } catch (e) { setError(String(e)); }
    finally { setAiReviewing(false); }
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setSgf(String(reader.result));
    reader.readAsText(file);
  };

  // 解析 SGF 为逐步棋盘快照
  const boardSnapshots = useMemo(() => buildBoardSequence(sgf), [sgf]);
  const displayStep = current !== null ? current : (boardSnapshots.length - 1);
  const currentSnapshot: BoardSnapshot = boardSnapshots[Math.min(displayStep, boardSnapshots.length - 1)] ?? boardSnapshots[0];
  const currentMove: MoveAnalysisDto | null = report && current !== null ? report.moves[current] ?? null : null;

  // 手数映射（当前步数之前所有棋子的手数）
  const moveNumbers = useMemo(() => {
    if (!showMoveNumbers || !sgf) return undefined;
    const re = /;([BW])\[([a-z]{2})\]/g;
    const map: Record<string, number> = {};
    let m: RegExpExecArray | null;
    let num = 1;
    const step = current !== null ? current : boardSnapshots.length - 1;
    while ((m = re.exec(sgf)) !== null) {
      if (num > step + 1) break;
      const x = m[2].charCodeAt(0) - 97;
      const y = m[2].charCodeAt(1) - 97;
      map[`${x},${y}`] = num;
      num++;
    }
    return map;
  }, [showMoveNumbers, sgf, current, boardSnapshots.length]);

  return (
    <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2 style={{ margin: 0 }}>AI 复盘分析</h2>
        {cachedResult && (
          <span style={{ fontSize: 12, color: "#1890ff" }}>📋 已缓存复盘结果</span>
        )}
      </div>

      {/* 引擎 + 工具栏 */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        {engineRunning ? (
          <button onClick={() => { ipc.stopAnalysisEngine(); setEngineRunning(false); }}>停止 KataGo</button>
        ) : (
          <button onClick={handleAutoStart}>启动 KataGo</button>
        )}
        <span style={{ fontSize: 12, color: engineRunning ? "#2a7d2a" : "#999" }}>
          {engineRunning ? "✓ KataGo 运行中" : "○ KataGo 未启动"}
        </span>
        <span style={{ width: 1, background: "#ddd", height: 20, margin: "0 4px" }} />
        <label style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 4 }}>
          <input type="checkbox" checked={showMoveNumbers} onChange={(e) => setShowMoveNumbers(e.target.checked)} />
          显示手数
        </label>
      </div>

      {/* SGF 导入 */}
      {!pendingReview && (
        <div style={{ border: "1px solid #eee", borderRadius: 6, padding: 8 }}>
          <div style={{ display: "flex", gap: 8, marginBottom: 6, alignItems: "center" }}>
            <input type="file" accept=".sgf" onChange={handleFile} />
            <span style={{ fontSize: 12, color: "#999" }}>或粘贴 SGF</span>
          </div>
          <textarea value={sgf} onChange={(e) => setSgf(e.target.value)} rows={3}
            style={{ width: "100%", fontFamily: "monospace", fontSize: 12 }} />
        </div>
      )}

      {error && <p style={{ color: "red", fontSize: 13 }}>{error}</p>}

      {/* 棋盘 + 分析面板 */}
      {sgf && currentSnapshot && (
        <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
          <div style={{ flex: 1, minWidth: 300 }}>
            <Board snapshot={currentSnapshot} interactive={false} showCoords moveNumbers={moveNumbers} />
            {/* 导航控件 */}
            <div style={{ display: "flex", gap: 4, justifyContent: "center", marginTop: 8 }}>
              <button onClick={() => { setAutoPlay(false); setCurrent(0); }}>⏮</button>
              <button onClick={() => { setAutoPlay(false); setCurrent((c) => Math.max(0, (c ?? 1) - 1)); }}>◀</button>
              <button onClick={() => setAutoPlay((p) => !p)} style={{ background: autoPlay ? "#1890ff" : undefined, color: autoPlay ? "#fff" : undefined }}>{autoPlay ? "⏸" : "▶"}</button>
              <button onClick={() => { setAutoPlay(false); setCurrent((c) => Math.min(boardSnapshots.length - 1, (c ?? 0) + 1)); }}>▶</button>
              <button onClick={() => { setAutoPlay(false); setCurrent(boardSnapshots.length - 1); }}>⏭</button>
            </div>
            <p style={{ textAlign: "center", fontSize: 12, color: "#666", marginTop: 4 }}>
              第 {displayStep} / {boardSnapshots.length - 1} 手
            </p>
          </div>

          <div style={{ flex: 1, minWidth: 300 }}>
            {/* 复盘按钮 */}
            <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              <button onClick={handleAiReview} disabled={aiReviewing || !sgf.trim()} style={{ padding: "6px 12px", fontWeight: "bold" }}>
                {aiReviewing ? "🤖 AI 复盘中…" : "🤖 AI 智能复盘"}
              </button>
              <button onClick={analyze} disabled={!engineRunning || analyzing || !sgf.trim()}>
                {analyzing ? "KataGo 分析中…" : "KataGo 复盘"}
              </button>
            </div>

            {/* AI 智能复盘结果 */}
            {aiReview && (
              <div style={{ marginBottom: 12 }}>
                {/* 对战信息卡片 */}
                <div style={{ padding: 12, background: "#f0f5ff", borderRadius: 6, border: "1px solid #adc6ff", marginBottom: 8 }}>
                  {/* 复盘对象标签 */}
                  <div style={{ textAlign: "center", marginBottom: 6 }}>
                    <span style={{ fontSize: 12, background: "#1890ff", color: "#fff", padding: "2px 8px", borderRadius: 8 }}>
                      🎯 复盘对象：{aiReview.reviewee}（执{aiReview.reviewee_color}）· {aiReview.reviewee_won ? "胜" : "负"}
                    </span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 16, marginBottom: 8 }}>
                    {/* 黑方 */}
                    <div style={{ textAlign: "center", minWidth: 100, opacity: aiReview.reviewee_color === "黑" ? 1 : 0.7 }}>
                      <div style={{ width: 28, height: 28, borderRadius: "50%", background: "#111", margin: "0 auto 4px", border: aiReview.reviewee_color === "黑" ? "3px solid #1890ff" : "none" }} />
                      <div style={{ fontWeight: "bold", fontSize: 14 }}>{aiReview.black || "黑方"}</div>
                      {aiReview.black_rank && <div style={{ fontSize: 12, color: "#666" }}>{aiReview.black_rank}</div>}
                    </div>
                    {/* VS + 结果 */}
                    <div style={{ textAlign: "center" }}>
                      <div style={{ fontSize: 18, fontWeight: "bold", color: aiReview.reviewee_won ? "#389e0d" : "#cf1322" }}>
                        {aiReview.reviewee_won ? "胜" : "负"}
                      </div>
                      {aiReview.result && <div style={{ fontSize: 12, color: "#999" }}>{aiReview.result}</div>}
                    </div>
                    {/* 白方 */}
                    <div style={{ textAlign: "center", minWidth: 100, opacity: aiReview.reviewee_color === "白" ? 1 : 0.7 }}>
                      <div style={{ width: 28, height: 28, borderRadius: "50%", background: "#fff", border: aiReview.reviewee_color === "白" ? "3px solid #1890ff" : "2px solid #333", margin: "0 auto 4px" }} />
                      <div style={{ fontWeight: "bold", fontSize: 14 }}>{aiReview.white || "白方"}</div>
                      {aiReview.white_rank && <div style={{ fontSize: 12, color: "#666" }}>{aiReview.white_rank}</div>}
                    </div>
                  </div>
                  {/* 补充信息 */}
                  <div style={{ display: "flex", justifyContent: "center", gap: 20, fontSize: 12, color: "#888", borderTop: "1px solid #d6e4ff", paddingTop: 6 }}>
                    <span>📅 {aiReview.date || "日期未知"}</span>
                    <span>♟ {aiReview.total_moves}手</span>
                    <span>📊 {aiReview.board_size}路</span>
                  </div>
                  {/* 总结评语 */}
                  <p style={{ margin: "8px 0 0", fontSize: 13, lineHeight: 1.6, color: "#333", background: "#fff", padding: 8, borderRadius: 4 }}>
                    {aiReview.summary}
                  </p>
                </div>

                {/* 形势判断 */}
                <div style={{ padding: 8, background: "#f6f8fa", borderRadius: 6, marginBottom: 8, fontSize: 13 }}>
                  <strong>📊 形势判断</strong>
                  <div style={{ marginTop: 4 }}>{aiReview.territory_estimate.assessment}</div>
                  <div style={{ display: "flex", gap: 16, marginTop: 4, fontSize: 12, color: "#666" }}>
                    <span>黑实地估算: {aiReview.territory_estimate.black_territory_est}</span>
                    <span>白实地估算: {aiReview.territory_estimate.white_territory_est}</span>
                  </div>
                  <div style={{ display: "flex", gap: 16, fontSize: 12, color: "#999" }}>
                    <span>黑三线: {aiReview.territory_estimate.black_third_line} | 中腹: {aiReview.territory_estimate.black_center}</span>
                    <span>白三线: {aiReview.territory_estimate.white_third_line} | 中腹: {aiReview.territory_estimate.white_center}</span>
                  </div>
                </div>

                {/* 逐阶段分析 */}
                {aiReview.phases.map((p, i) => (
                  <div key={i} style={{ padding: 8, marginBottom: 6, borderRadius: 4, border: "1px solid #eee", fontSize: 13 }}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <strong>{p.phase}</strong>
                      <span style={{ fontSize: 12 }}>
                        {p.range} ·
                        <span style={{ color: p.score >= 4 ? "#389e0d" : p.score >= 3 ? "#d4a017" : "#cf1322" }}>
                          {"★".repeat(p.score)}{"☆".repeat(5 - p.score)}
                        </span>
                      </span>
                    </div>
                    <ul style={{ margin: "4px 0 0 16px", padding: 0, fontSize: 12, lineHeight: 1.6 }}>
                      {p.comments.map((c, j) => <li key={j}>{c}</li>)}
                    </ul>
                    {p.issues.length > 0 && (
                      <div style={{ marginTop: 4 }}>
                        {p.issues.map((iss, j) => (
                          <span key={j} style={{ fontSize: 11, background: "#fff1f0", color: "#cf1322", padding: "1px 6px", borderRadius: 8, marginRight: 4 }}>⚠ {iss}</span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}

                {/* 关键手分析 */}
                {aiReview.key_moves.length > 0 && (
                  <div style={{ padding: 8, marginBottom: 6, borderRadius: 4, border: "1px solid #ffe58f", background: "#fffbe6", fontSize: 13 }}>
                    <strong>🔍 关键手分析</strong>
                    {aiReview.key_moves.map((km, i) => (
                      <div key={i} style={{ marginTop: 4, fontSize: 12 }}>
                        第{km.move}手 {km.color}{km.point}（{km.type}）:
                        {km.issues.map((iss, j) => (
                          <span key={j} style={{ color: "#cf1322", marginLeft: 4 }}>⚠{iss}</span>
                        ))}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* KataGo 复盘结果（如果已跑） */}
            {report && (
              <>
                {report.summary && (
                  <div style={{ padding: 8, background: "#f6f8fa", borderRadius: 6, marginBottom: 8, fontSize: 13 }}>
                    <strong>KataGo 总结</strong>
                    <p style={{ margin: "4px 0 0", lineHeight: 1.5 }}>{report.summary}</p>
                  </div>
                )}
                {report.winrate_curve.length > 0 && (
                  <>
                    <h4 style={{ margin: "8px 0 4px" }}>胜率曲线</h4>
                    <WinRateChart winrates={report.winrate_curve} currentIndex={current} onJump={setCurrent} />
                  </>
                )}
                {currentMove && (
                  <div style={{ marginTop: 8, padding: 8, borderRadius: 4, fontSize: 13, border: `1px solid ${kindColor(currentMove.kind, 1)}`, background: kindColor(currentMove.kind, 0.08) }}>
                    第 {currentMove.move_index + 1} 手 · <strong>{kindLabel(currentMove.kind)}</strong> · 胜率{(currentMove.played_winrate * 100).toFixed(1)}%
                    {currentMove.loss > 0.001 && <span style={{ color: "#cf1322" }}>（损失{(currentMove.loss * 100).toFixed(1)}%）</span>}
                  </div>
                )}
                <h4 style={{ marginBottom: 4, marginTop: 8 }}>失误手</h4>
                <div style={{ maxHeight: 150, overflowY: "auto", fontSize: 12 }}>
                  {report.moves.filter((m) => m.kind !== "good").length === 0 ? (
                    <p style={{ color: "#389e0d" }}>无失误</p>
                  ) : (
                    report.moves.filter((m) => m.kind !== "good").map((m) => (
                      <div key={m.move_index} onClick={() => { setAutoPlay(false); setCurrent(m.move_index); }}
                        style={{ cursor: "pointer", padding: "2px 4px", borderBottom: "1px solid #f0f0f0", color: kindColor(m.kind, 1) }}>
                        第{m.move_index + 1}手 · {kindLabel(m.kind)} · 损失{(m.loss * 100).toFixed(1)}%
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

function buildBoardSequence(sgf: string): BoardSnapshot[] {
  const sizeMatch = sgf.match(/SZ\[(\d+)\]/);
  const size = sizeMatch ? Number(sizeMatch[1]) : 19;
  const empty: BoardSnapshot["stones"] = Array(size * size).fill(null);
  const snapshots: BoardSnapshot[] = [{ size, stones: [...empty], turn: "black" }];
  const re = /;([BW])\[([a-z]{2}|)\]/g;
  let m: RegExpExecArray | null;
  let stones = [...empty];
  while ((m = re.exec(sgf)) !== null) {
    const color = m[1] === "B" ? "black" : "white";
    if (m[2].length === 2) {
      const x = m[2].charCodeAt(0) - 97;
      const y = m[2].charCodeAt(1) - 97;
      if (x >= 0 && x < size && y >= 0 && y < size) stones[y * size + x] = color;
    }
    stones = [...stones];
    snapshots.push({ size, stones, turn: color === "black" ? "white" : "black" });
  }
  return snapshots;
}

function kindLabel(k: MoveAnalysisDto["kind"]): string {
  return k === "blunder" ? "严重失误" : k === "inaccuracy" ? "不准确" : "好棋";
}
function kindColor(k: MoveAnalysisDto["kind"], a: number): string {
  return k === "blunder" ? `rgba(207,19,34,${a})` : k === "inaccuracy" ? `rgba(212,160,23,${a})` : `rgba(56,158,13,${a})`;
}

// (helper functions removed - result label/color now inline in component)
