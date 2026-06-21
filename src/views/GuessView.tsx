import { useCallback, useEffect, useState } from "react";
import Board, { xyToGtp } from "../components/Board";
import { ipc } from "../lib/ipc";
import type { BoardSnapshot, GuessDto, GuessResult } from "../types";

export default function GuessView() {
  const [puzzle, setPuzzle] = useState<GuessDto | null>(null);
  const [snapshot, setSnapshot] = useState<BoardSnapshot | null>(null);
  const [pickedVertex, setPickedVertex] = useState<string | null>(null);
  const [pickedXy, setPickedXy] = useState<{ x: number; y: number } | null>(null);
  const [result, setResult] = useState<GuessResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [correct, setCorrect] = useState(0);
  const [total, setTotal] = useState(0);

  const loadNext = useCallback(async () => {
    setError(null);
    setResult(null);
    setPickedVertex(null);
    setPickedXy(null);
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

  const handleBoardClick = (x: number, y: number) => {
    if (result || !puzzle) return;
    const n = snapshot?.size ?? 19;
    setPickedXy({ x, y });
    setPickedVertex(xyToGtp(x, y, n));
  };

  const handleCheck = async () => {
    if (!puzzle || !pickedVertex) return;
    try {
      const res = await ipc.checkGuess(puzzle.id, pickedVertex);
      setResult(res);
      setTotal((n) => n + 1);
      if (res.correct) setCorrect((n) => n + 1);
    } catch (e) {
      setError(String(e));
    }
  };

  // 标记
  const marks: { x: number; y: number; label: string; color?: string }[] = [];
  if (result) {
    const n = snapshot?.size ?? 19;
    for (const v of result.answer_vertex.split(/\s+/)) {
      const p = gtpToXy(v, n);
      if (p) marks.push({ x: p.x, y: p.y, label: "●", color: "#389e0d" });
    }
    if (!result.correct && pickedXy) {
      marks.push({ x: pickedXy.x, y: pickedXy.y, label: "✗", color: "#cf1322" });
    }
  } else if (pickedXy) {
    marks.push({ x: pickedXy.x, y: pickedXy.y, label: "?", color: "#1890ff" });
  }

  return (
    <div style={{ display: "flex", gap: 24, padding: 16, alignItems: "flex-start" }}>
      <div style={{ flexShrink: 0 }}>
        <h2>猜棋训练</h2>
        {snapshot ? (
          <Board
            snapshot={snapshot}
            onPlay={handleBoardClick}
            interactive={!result}
            size={480}
            showCoords
            marks={marks}
          />
        ) : (
          <p>{error ?? "加载中…"}</p>
        )}
      </div>

      <div style={{ minWidth: 280, width: 320, flexShrink: 1 }}>
        {puzzle && (
          <>
            <h3>
              {puzzle.category_label} · 难度 {puzzle.difficulty}
            </h3>
            <p style={{ fontSize: 13, color: "#666", marginTop: -4 }}>
              看局面，猜下一手。在棋盘上点击你的答案。
            </p>

            <div style={{ marginTop: 8, padding: 8, background: "#f6f8fa", borderRadius: 4 }}>
              <span style={{ fontSize: 13 }}>你的猜测：</span>
              <strong>{pickedVertex ?? "（点击棋盘选择）"}</strong>
            </div>

            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              {!result ? (
                <button onClick={handleCheck} disabled={!pickedVertex}>
                  揭晓答案
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
                  <span style={{ fontSize: 12, color: "#666" }}>（绿点标记）</span>
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

function gtpToXy(gtp: string, size: number): { x: number; y: number } | null {
  if (gtp.length < 2) return null;
  const col = gtp[0].toUpperCase();
  const x = col <= "H" ? col.charCodeAt(0) - 65 : col.charCodeAt(0) - 66;
  const y = size - parseInt(gtp.slice(1));
  if (x < 0 || x >= size || y < 0 || y >= size || isNaN(y)) return null;
  return { x, y };
}
