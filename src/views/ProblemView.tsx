import { useCallback, useEffect, useState } from "react";
import Board, { xyToGtp } from "../components/Board";
import { ipc } from "../lib/ipc";
import type { BoardSnapshot, ProblemDto, WeaknessDto, WrongBookDto } from "../types";

interface AnswerState {
  submitted: boolean;
  correct: boolean;
  answerVertex: string;
  answerXy: { x: number; y: number }[];
}

export default function ProblemView() {
  const [problem, setProblem] = useState<ProblemDto | null>(null);
  const [snapshot, setSnapshot] = useState<BoardSnapshot | null>(null);
  const [pickedVertex, setPickedVertex] = useState<string | null>(null);
  const [pickedXy, setPickedXy] = useState<{ x: number; y: number } | null>(null);
  const [answerState, setAnswerState] = useState<AnswerState | null>(null);
  const [weakness, setWeakness] = useState<WeaknessDto[]>([]);
  const [wrongBook, setWrongBook] = useState<WrongBookDto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [solved, setSolved] = useState(0);
  const [attempted, setAttempted] = useState(0);
  const [difficulty, setDifficulty] = useState<number>(0); // 0 = 自动(跟随棋力)
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState<string | null>(null);

  const handleImport = async () => {
    setImporting(true);
    setImportMsg("正在导入内置死活题库（gogameguru 420 题）…");
    try {
      const res = await ipc.importTsumego();
      setImportMsg(res.message);
      await loadProblem();
      await loadReports();
    } catch (e) {
      setImportMsg(`导入失败：${e}`);
    } finally {
      setImporting(false);
    }
  };

  const loadProblem = useCallback(async () => {
    setError(null);
    setAnswerState(null);
    setPickedVertex(null);
    setPickedXy(null);
    try {
      const p = await ipc.nextProblem(difficulty > 0 ? difficulty : undefined);
      if (!p) {
        setProblem(null);
        setSnapshot(null);
        setError("暂无更多题目");
        return;
      }
      setProblem(p);
      setSnapshot(sgfToSnapshot(p.question_sgf));
    } catch (e) {
      setError(String(e));
    }
  }, [difficulty]);

  const loadReports = useCallback(async () => {
    try {
      const [w, wb] = await Promise.all([ipc.weaknessReport(), ipc.wrongBook()]);
      setWeakness(w);
      setWrongBook(wb);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    loadProblem();
    loadReports();
  }, [loadProblem, loadReports]);

  const handleBoardClick = (x: number, y: number) => {
    if (answerState?.submitted || !problem) return;
    const n = snapshot?.size ?? 19;
    setPickedXy({ x, y });
    setPickedVertex(xyToGtp(x, y, n));
  };

  const handleSubmit = async () => {
    if (!problem || !pickedVertex) return;
    try {
      const res = await ipc.submitAnswer(problem.id, pickedVertex);
      // 解析答案顶点为坐标（用于在棋盘上标记正解）
      const n = snapshot?.size ?? 19;
      const answerXy = res.answer_vertex
        .split(/\s+/)
        .map((v) => gtpToXy(v, n))
        .filter((p): p is { x: number; y: number } => p !== null);
      setAnswerState({
        submitted: true,
        correct: res.correct,
        answerVertex: res.answer_vertex,
        answerXy,
      });
      setAttempted((n2) => n2 + 1);
      if (res.correct) setSolved((n2) => n2 + 1);
      await loadReports();
    } catch (e) {
      setError(String(e));
    }
  };

  const handleNext = () => {
    loadProblem();
  };

  // 棋盘标记：正解标 ○，用户答案标 ✗（错时）
  const marks: { x: number; y: number; label: string; color?: string }[] = [];
  if (answerState?.submitted) {
    for (const p of answerState.answerXy) {
      marks.push({ x: p.x, y: p.y, label: "●", color: "#389e0d" });
    }
    if (!answerState.correct && pickedXy) {
      marks.push({ x: pickedXy.x, y: pickedXy.y, label: "✗", color: "#cf1322" });
    }
  } else if (pickedXy && !answerState?.submitted) {
    marks.push({ x: pickedXy.x, y: pickedXy.y, label: "?", color: "#1890ff" });
  }

  return (
    <div style={{ display: "flex", gap: 24, padding: 16, alignItems: "flex-start" }}>
      <div style={{ flexShrink: 0 }}>
        <h2>针对性题库训练</h2>
        {snapshot ? (
          <Board
            snapshot={snapshot}
            onPlay={handleBoardClick}
            interactive={!answerState?.submitted}
            size={480}
            showCoords
            marks={marks}
          />
        ) : (
          <p>{error ?? "加载中…"}</p>
        )}
      </div>

      <div style={{ minWidth: 280, maxWidth: 360 }}>
        {/* 难度选择 + 导入题库 */}
        <div style={{ marginBottom: 12, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <label style={{ fontSize: 13 }}>难度：</label>
          <select
            value={difficulty}
            onChange={(e) => setDifficulty(Number(e.target.value))}
            style={{ padding: 4 }}
          >
            <option value={0}>自动</option>
            {[1, 2, 3, 4, 5].map((d) => (
              <option key={d} value={d}>≤ {d}段</option>
            ))}
          </select>
          <button onClick={handleImport} disabled={importing} style={{ fontSize: 12, padding: "4px 8px" }}>
            {importing ? "导入中…" : "📚 导入题库"}
          </button>
        </div>
        {importMsg && (
          <p style={{ fontSize: 12, color: importing ? "#1890ff" : "#666", margin: "0 0 8px" }}>
            {importMsg}
          </p>
        )}

        {problem && (
          <>
            <h3>
              {problem.category_label} · 难度 {problem.difficulty}
            </h3>
            <p style={{ fontSize: 13, color: "#666", marginTop: -4 }}>
              题号 #{problem.id} —— 在棋盘上点击你的答案
            </p>

            <div style={{ marginTop: 8, padding: 8, background: "#f6f8fa", borderRadius: 4 }}>
              <span style={{ fontSize: 13 }}>你的答案：</span>
              <strong>{pickedVertex ?? "（点击棋盘选择）"}</strong>
            </div>

            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              {!answerState?.submitted ? (
                <button onClick={handleSubmit} disabled={!pickedVertex}>
                  提交答案
                </button>
              ) : (
                <button onClick={handleNext}>下一题</button>
              )}
            </div>

            {answerState?.submitted && (
              <div
                style={{
                  marginTop: 12,
                  padding: 12,
                  borderRadius: 6,
                  background: answerState.correct ? "#e6f7e6" : "#fde8e8",
                  border: `1px solid ${answerState.correct ? "#52c41a" : "#f5222d"}`,
                }}
              >
                <strong style={{ color: answerState.correct ? "#389e0d" : "#cf1322" }}>
                  {answerState.correct ? "✓ 正确！" : "✗ 不对"}
                </strong>
                <p style={{ margin: "6px 0 0" }}>
                  正解：<strong>{answerState.answerVertex}</strong>
                  <span style={{ fontSize: 12, color: "#666" }}>（绿点标记）</span>
                </p>
                <p style={{ margin: "6px 0 0", fontSize: 13, color: "#444" }}>
                  {problem.explanation}
                </p>
              </div>
            )}
          </>
        )}

        <hr style={{ margin: "16px 0", border: "none", borderTop: "1px solid #eee" }} />

        <div style={{ fontSize: 13 }}>本轮：{solved} / {attempted} 正确</div>

        <h4 style={{ marginBottom: 4 }}>弱点分析（驱动针对性出题）</h4>
        {weakness.length === 0 ? (
          <p style={{ fontSize: 12, color: "#999" }}>
            暂无数据。完成复盘后，失误类型会自动累积，指导出题优先级。
          </p>
        ) : (
          <table style={{ fontSize: 12, borderCollapse: "collapse", width: "100%" }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>
                <th style={{ padding: 4 }}>分类</th>
                <th style={{ padding: 4 }}>严重失误</th>
                <th style={{ padding: 4 }}>不准确</th>
              </tr>
            </thead>
            <tbody>
              {weakness.map((w) => (
                <tr key={w.category} style={{ borderBottom: "1px solid #f0f0f0" }}>
                  <td style={{ padding: 4 }}>{w.category_label}</td>
                  <td style={{ padding: 4, color: w.blunder_count > 0 ? "#cf1322" : "#999" }}>
                    {w.blunder_count}
                  </td>
                  <td style={{ padding: 4, color: w.inaccuracy_count > 0 ? "#d4a017" : "#999" }}>
                    {w.inaccuracy_count}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <h4 style={{ marginBottom: 4, marginTop: 16 }}>错题本</h4>
        {wrongBook.length === 0 ? (
          <p style={{ fontSize: 12, color: "#999" }}>暂无记录。</p>
        ) : (
          <div style={{ maxHeight: 160, overflowY: "auto", fontSize: 12 }}>
            {wrongBook.map((r) => (
              <div key={r.id} style={{ padding: "2px 0", color: r.correct ? "#389e0d" : "#cf1322" }}>
                {r.correct ? "✓" : "✗"} #{r.problem_id} 答 {r.user_answer}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function sgfToSnapshot(sgf: string): BoardSnapshot {
  const sizeMatch = sgf.match(/SZ\[(\d+)\]/);
  const size = sizeMatch ? Number(sizeMatch[1]) : 19;
  const stones: BoardSnapshot["stones"] = Array(size * size).fill(null);
  const re = /;([BW])\[([a-z]{2})\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(sgf)) !== null) {
    const color = m[1] === "B" ? "black" : "white";
    const x = m[2].charCodeAt(0) - 97;
    const y = m[2].charCodeAt(1) - 97;
    if (x >= 0 && x < size && y >= 0 && y < size) {
      stones[y * size + x] = color;
    }
  }
  return { size, stones, turn: "black" };
}

/** GTP 顶点转内部坐标（与 Board.tsx 的 xyToGtp 互逆） */
function gtpToXy(gtp: string, size: number): { x: number; y: number } | null {
  if (gtp.length < 2) return null;
  const col = gtp[0].toUpperCase();
  const x = col <= "H" ? col.charCodeAt(0) - 65 : col.charCodeAt(0) - 66;
  const y = size - parseInt(gtp.slice(1));
  if (x < 0 || x >= size || y < 0 || y >= size || isNaN(y)) return null;
  return { x, y };
}
