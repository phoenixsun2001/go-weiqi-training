import { useCallback, useEffect, useState } from "react";
import Board from "../components/Board";
import { ipc } from "../lib/ipc";
import type { BoardSnapshot, GuessDto, GuessResult } from "../types";

export default function GuessView() {
  const [puzzle, setPuzzle] = useState<GuessDto | null>(null);
  const [snapshot, setSnapshot] = useState<BoardSnapshot | null>(null);
  const [guess, setGuess] = useState("");
  const [result, setResult] = useState<GuessResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [correct, setCorrect] = useState(0);
  const [total, setTotal] = useState(0);

  const loadNext = useCallback(async () => {
    setError(null);
    setResult(null);
    setGuess("");
    try {
      const p = await ipc.nextGuess();
      if (!p) {
        setPuzzle(null);
        setSnapshot(null);
        setError("暂无更多题目");
        return;
      }
      setPuzzle(p);
      setSnapshot(sgfToSnapshot(p.position_sgf));
    } catch (e) {
      setError(String(e));
    }
  }, []);

  useEffect(() => {
    loadNext();
  }, [loadNext]);

  const handleCheck = async () => {
    if (!puzzle || !guess.trim()) return;
    try {
      const res = await ipc.checkGuess(puzzle.id, guess.trim());
      setResult(res);
      setTotal((n) => n + 1);
      if (res.correct) setCorrect((n) => n + 1);
    } catch (e) {
      setError(String(e));
    }
  };

  return (
    <div style={{ display: "flex", gap: 24, padding: 16 }}>
      <div>
        <h2>猜棋训练</h2>
        {snapshot ? (
          <Board snapshot={snapshot} interactive={false} size={480} />
        ) : (
          <p>{error ?? "加载中…"}</p>
        )}
      </div>

      <div style={{ minWidth: 280, maxWidth: 360 }}>
        {puzzle && (
          <>
            <h3>
              {puzzle.category_label} · 难度 {puzzle.difficulty}
            </h3>
            <p style={{ fontSize: 13, color: "#666", marginTop: -4 }}>
              看局面，猜下一手。训练读盘与第一感。
            </p>

            <label style={{ fontSize: 13 }}>你的猜测（GPT 顶点，如 D4）：</label>
            <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
              <input
                type="text"
                value={guess}
                onChange={(e) => setGuess(e.target.value)}
                placeholder="如 D4"
                disabled={result !== null}
                style={{ flex: 1, padding: 6, textTransform: "uppercase" }}
                onKeyDown={(e) => e.key === "Enter" && result === null && handleCheck()}
              />
              {result === null ? (
                <button onClick={handleCheck} disabled={!guess.trim()}>
                  揭晓
                </button>
              ) : (
                <button onClick={loadNext}>下一题</button>
              )}
            </div>

            {result && (
              <div
                style={{
                  marginTop: 12,
                  padding: 12,
                  borderRadius: 6,
                  background: result.correct ? "#e6f7e6" : "#fde8e8",
                  border: `1px solid ${result.correct ? "#52c41a" : "#f5222d"}`,
                }}
              >
                <strong style={{ color: result.correct ? "#389e0d" : "#cf1322" }}>
                  {result.correct ? "✓ 猜对！" : "✗ 不对"}
                </strong>
                <p style={{ margin: "6px 0 0" }}>
                  正解：<strong>{result.answer_vertex}</strong>
                </p>
                <p style={{ margin: "6px 0 0", fontSize: 13, color: "#444" }}>
                  {result.explanation}
                </p>
              </div>
            )}
          </>
        )}

        <hr style={{ margin: "16px 0", border: "none", borderTop: "1px solid #eee" }} />
        <div style={{ fontSize: 13 }}>
          本轮：{correct} / {total} 正确
        </div>
      </div>
    </div>
  );
}

/// 把局面 SGF 解析为只读棋盘快照
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
