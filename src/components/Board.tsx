import { useEffect, useRef } from "react";
import type { BoardSnapshot, Color } from "../types";

interface Props {
  snapshot: BoardSnapshot;
  onPlay?: (x: number, y: number) => void;
  interactive: boolean;
  size?: number; // 像素大小
  showCoords?: boolean; // 是否显示坐标
  marks?: { x: number; y: number; label: string; color?: string }[]; // 标记点
}

export default function Board({
  snapshot,
  onPlay,
  interactive,
  size = 540,
  showCoords = true,
  marks = [],
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const n = snapshot.size;

    // 有坐标时多留一圈边距
    const margin = showCoords ? size * 0.05 : size / (n + 1);
    const boardArea = size - 2 * margin;
    const cell = boardArea / n;

    // 背景
    ctx.fillStyle = "#ddb86b";
    ctx.fillRect(0, 0, size, size);

    // 网格线
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 1;
    for (let i = 0; i < n; i++) {
      const p = margin + cell * (i + 0.5);
      ctx.beginPath();
      ctx.moveTo(margin + cell * 0.5, p);
      ctx.lineTo(margin + cell * (n - 0.5), p);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(p, margin + cell * 0.5);
      ctx.lineTo(p, margin + cell * (n - 0.5));
      ctx.stroke();
    }

    // 星位
    const stars = starPoints(n);
    ctx.fillStyle = "#000";
    for (const [sx, sy] of stars) {
      ctx.beginPath();
      ctx.arc(margin + cell * (sx + 0.5), margin + cell * (sy + 0.5), 3, 0, Math.PI * 2);
      ctx.fill();
    }

    // 坐标标注
    if (showCoords) {
      ctx.fillStyle = "#666";
      ctx.font = `${Math.max(9, cell * 0.35)}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const cols = gtpColumns(n);
      for (let i = 0; i < n; i++) {
        const p = margin + cell * (i + 0.5);
        // 顶部和底部字母
        ctx.fillText(cols[i], p, margin * 0.4);
        ctx.fillText(cols[i], p, size - margin * 0.4);
        // 左侧和右侧数字
        ctx.fillText(String(n - i), margin * 0.4, p);
        ctx.fillText(String(n - i), size - margin * 0.4, p);
      }
    }

    // 棋子
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const s = snapshot.stones[y * n + x];
        if (s) {
          const cx = margin + cell * (x + 0.5);
          const cy = margin + cell * (y + 0.5);
          ctx.beginPath();
          ctx.arc(cx, cy, cell * 0.44, 0, Math.PI * 2);
          ctx.fillStyle = s === "black" ? "#111" : "#fff";
          ctx.fill();
          ctx.strokeStyle = "#000";
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      }
    }

    // 标记（如答案标记 X / O）
    for (const m of marks) {
      if (m.x < 0 || m.x >= n || m.y < 0 || m.y >= n) continue;
      const cx = margin + cell * (m.x + 0.5);
      const cy = margin + cell * (m.y + 0.5);
      ctx.font = `bold ${cell * 0.5}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = m.color ?? "#e22";
      ctx.fillText(m.label, cx, cy);
    }
  }, [snapshot, size, showCoords, marks]);

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!interactive || !onPlay) return;
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const scale = size / rect.width;
    const px = (e.clientX - rect.left) * scale;
    const py = (e.clientY - rect.top) * scale;
    const n = snapshot.size;
    const margin = showCoords ? size * 0.05 : size / (n + 1);
    const boardArea = size - 2 * margin;
    const cell = boardArea / n;
    const x = Math.floor((px - margin) / cell);
    const y = Math.floor((py - margin) / cell);
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

/** GTP 列字母（跳过 I） */
function gtpColumns(n: number): string[] {
  const cols: string[] = [];
  for (let i = 0; i < n; i++) {
    const code = i < 8 ? 65 + i : 66 + i; // A-H, J-...
    cols.push(String.fromCharCode(code));
  }
  return cols;
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

/** 内部 (x,y,size) 转 GTP 顶点字符串（跳过 I），与后端一致 */
export function xyToGtp(x: number, y: number, size: number): string {
  const col = x < 8 ? String.fromCharCode(65 + x) : String.fromCharCode(66 + x);
  const row = size - y;
  return `${col}${row}`;
}
