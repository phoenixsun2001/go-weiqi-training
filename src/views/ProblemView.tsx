import { useCallback, useEffect, useState } from "react";
import Board from "../components/Board";
import { ipc } from "../lib/ipc";
import type { BoardSnapshot, ProblemDto, WeaknessDto, WrongBookDto } from "../types";

interface AnswerState {
  submitted: boolean;
  correct: boolean;
  answerVertex: string;
}

export default function ProblemView() {
  const [problem, setProblem] = useState<ProblemDto | null>(null);
  const [snapshot, setSnapshot] = useState<BoardSnapshot | null>(null);
  const [answer, setAnswer] = useState("");
  const [answerState, setAnswerState] = useState<AnswerState | null>(null);
  const [weakness, setWeakness] = useState<WeaknessDto[]>([]);
  const [wrongBook, setWrongBook] = useState<WrongBookDto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [solved, setSolved] = useState(0);
  const [attempted, setAttempted] = useState(0);

  const loadProblem = useCallback(async () => {
    setError(null);
    setAnswerState(null);
    setAnswer("");
    try {
      const p = await ipc.nextProblem();
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
  }, []);

  const loadReports = useCallback(async () => {
    try {
      const [w, wb] = await Promise.all([ipc.weaknessReport(), ipc.wrongBook()]);
      setWeakness(w);
      setWrongBook(wb);
    } catch (e) {
      // 忽略报告加载错误
    }
  }, []);

  useEffect(() => {
    loadProblem();
    loadReports();
  }, [loadProblem, loadReports]);

  const handleSubmit = async () => {
    if (!problem || !answer.trim()) return;
    try {
      const res = await ipc.submitAnswer(problem.id, answer.trim());
      setAnswerState({
        submitted: true,
        correct: res.correct,
        answerVertex: res.answer_vertex,
      });
      setAttempted((n) => n + 1);
      if (res.correct) setSolved((n) => n + 1);
      await loadReports();
    } catch (e) {
      setError(String(e));
    }
  };

  const handleNext = () => {
    loadProblem();
  };

  return (
    <div style={{ display: "flex", gap: 24, padding: 16, alignItems: "flex-start" }}>
      <div style={{ flexShrink: 0 }}>
        <h2>针对性题库训练</h2>
        {snapshot ? (
          <Board snapshot={snapshot} interactive={false} size={480} />
        ) : (
          <p>{error ?? "加载中…"}</p>
        )}
      </div>

      <div style={{ minWidth: 280, maxWidth: 360 }}>
        {problem && (
          <>
            <h3>
              {problem.category_label} · 难度 {problem.difficulty}
            </h3>
            <p style={{ fontSize: 13, color: "#666", marginTop: -4 }}>
              题号 #{problem.id} —— 题目优先按你的弱点分类出题
            </p>

            <label style={{ fontSize: 13 }}>输入你的答案（GTP 顶点，如 D4）：</label>
            <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
              <input
                type="text"
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                placeholder="如 D4"
                disabled={answerState?.submitted}
                style={{ flex: 1, padding: 6, textTransform: "uppercase" }}
                onKeyDown={(e) => e.key === "Enter" && !answerState?.submitted && handleSubmit()}
              />
              {!answerState?.submitted ? (
                <button onClick={handleSubmit} disabled={!answer.trim()}>
                  提交
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
                </p>
                <p style={{ margin: "6px 0 0", fontSize: 13, color: "#444" }}>
                  {problem.explanation}
                </p>
              </div>
            )}
          </>
        )}

        <hr style={{ margin: "16px 0", border: "none", borderTop: "1px solid #eee" }} />

        <div style={{ fontSize: 13 }}>
          本轮：{solved} / {attempted} 正确
        </div>

        {/* 弱点统计 */}
        <h4 style={{ marginBottom: 4 }}>弱点分析（驱动针对性出题）</h4>
        {weakness.length === 0 ? (
          <p style={{ fontSize: 12, color: "#999" }}>
            暂无数据。完成复盘后，失误类型会自动累积到此处，指导出题优先级。
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

        {/* 错题本 */}
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

/// 把题目 SGF 解析为只读棋盘快照（黑手摆出来作为题目局面）
function sgfToSnapshot(sgf: string): BoardSnapshot {
  const sizeMatch = sgf.match(/SZ\[(\d+)\]/);
  const size = sizeMatch ? Number(sizeMatch[1]) : 19;
  const stones: BoardSnapshot["stones"] = Array(size * size).fill(null);
  // 匹配 ;B[xy] / ;W[xy]（xy 为小写 SGF 坐标）
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
