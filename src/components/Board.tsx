import { useEffect, useRef } from "react";
import type { BoardSnapshot, Color } from "../types";

interface Props {
  snapshot: BoardSnapshot;
  onPlay?: (x: number, y: number) => void;
  interactive: boolean;
  size?: number; // 像素大小
}

export default function Board({ snapshot, onPlay, interactive, size = 540 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const n = snapshot.size;
    const cell = size / (n + 1);
    // 背景
    ctx.fillStyle = "#ddb86b";
    ctx.fillRect(0, 0, size, size);
    // 网格线
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 1;
    for (let i = 0; i < n; i++) {
      const p = cell * (i + 1);
      ctx.beginPath();
      ctx.moveTo(cell, p);
      ctx.lineTo(size - cell, p);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(p, cell);
      ctx.lineTo(p, size - cell);
      ctx.stroke();
    }
    // 星位
    const stars = starPoints(n);
    ctx.fillStyle = "#000";
    for (const [sx, sy] of stars) {
      ctx.beginPath();
      ctx.arc(cell * (sx + 1), cell * (sy + 1), 3, 0, Math.PI * 2);
      ctx.fill();
    }
    // 棋子
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const s = snapshot.stones[y * n + x];
        if (s) {
          ctx.beginPath();
          ctx.arc(cell * (x + 1), cell * (y + 1), cell * 0.45, 0, Math.PI * 2);
          ctx.fillStyle = s === "black" ? "#111" : "#fff";
          ctx.fill();
          ctx.strokeStyle = "#000";
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      }
    }
  }, [snapshot, size]);

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!interactive || !onPlay) return;
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const scale = size / rect.width;
    const px = (e.clientX - rect.left) * scale;
    const py = (e.clientY - rect.top) * scale;
    const n = snapshot.size;
    const cell = size / (n + 1);
    const x = Math.round(px / cell - 1);
    const y = Math.round(py / cell - 1);
    if (x >= 0 && x < n && y >= 0 && y < n) {
      onPlay(x, y);
    }
  };

  return (
    <canvas
      ref={canvasRef}
      width={size}
      height={size}
      onClick={handleClick}
      style={{
        cursor: interactive ? "pointer" : "default",
        background: "#ddb86b",
        display: "block",
        flexShrink: 0,
        width: size,
        height: size,
      }}
    />
  );
}

function starPoints(n: number): [number, number][] {
  if (n === 9) {
    return [
      [2, 2],
      [2, 6],
      [6, 2],
      [6, 6],
      [4, 4],
    ];
  }
  if (n === 19) {
    return [
      [3, 3],
      [3, 9],
      [3, 15],
      [9, 3],
      [9, 9],
      [9, 15],
      [15, 3],
      [15, 9],
      [15, 15],
    ];
  }
  return [];
}

export function turnLabel(turn: Color): string {
  return turn === "black" ? "黑方" : "白方";
}
