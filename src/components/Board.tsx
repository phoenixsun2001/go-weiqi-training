import { useEffect, useRef, useState } from "react";
import type { BoardSnapshot, Color } from "../types";

interface Props {
  snapshot: BoardSnapshot;
  onPlay?: (x: number, y: number) => void;
  interactive: boolean;
  /** 最大像素尺寸；不传则自适应容器宽度 */
  size?: number;
  showCoords?: boolean;
  marks?: { x: number; y: number; label: string; color?: string }[];
}

export default function Board({
  snapshot,
  onPlay,
  interactive,
  size,
  showCoords = true,
  marks = [],
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // 自适应模式下的实际渲染尺寸（从固定档位中选取）
  const [adaptiveSize, setAdaptiveSize] = useState(size ?? 600);

  // 固定档位：保证 cell（格子像素）能被棋盘线数整除，避免对齐偏差
  // 19路：cell = size/20（含边距），选 size 为 20 的倍数最理想
  const SIZES = [360, 420, 480, 540, 600, 660, 720, 780, 840];

  // 监听容器宽度变化，从固定档位中选最接近（不超过）的尺寸
  useEffect(() => {
    if (size !== undefined) {
      setAdaptiveSize(size);
      return;
    }
    const container = containerRef.current;
    if (!container) return;
    const updateSize = () => {
      const w = container.clientWidth;
      const maxH = window.innerHeight - 100;
      const target = Math.min(w, maxH);
      // 从档位中选不超过 target 的最大值；若都比 target 大则选最小的
      let best = SIZES[0];
      for (const s of SIZES) {
        if (s <= target) best = s;
      }
      setAdaptiveSize(best);
    };
    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(container);
    window.addEventListener("resize", updateSize);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateSize);
    };
  }, [size]);

  const renderSize = size ?? adaptiveSize;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const n = snapshot.size;

    const margin = showCoords ? renderSize * 0.05 : renderSize / (n + 1);
    const boardArea = renderSize - 2 * margin;
    const cell = boardArea / n;

    // 背景
    ctx.fillStyle = "#ddb86b";
    ctx.fillRect(0, 0, renderSize, renderSize);

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
        ctx.fillText(cols[i], p, margin * 0.4);
        ctx.fillText(cols[i], p, renderSize - margin * 0.4);
        ctx.fillText(String(n - i), margin * 0.4, p);
        ctx.fillText(String(n - i), renderSize - margin * 0.4, p);
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

    // 标记
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
  }, [snapshot, renderSize, showCoords, marks]);

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!interactive || !onPlay) return;
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const scale = renderSize / rect.width;
    const px = (e.clientX - rect.left) * scale;
    const py = (e.clientY - rect.top) * scale;
    const n = snapshot.size;
    const margin = showCoords ? renderSize * 0.05 : renderSize / (n + 1);
    const boardArea = renderSize - 2 * margin;
    const cell = boardArea / n;
    const x = Math.floor((px - margin) / cell);
    const y = Math.floor((py - margin) / cell);
    if (x >= 0 && x < n && y >= 0 && y < n) {
      onPlay(x, y);
    }
  };

  return (
    <div ref={containerRef} style={{ display: "inline-block", width: renderSize, height: renderSize }}>
      <canvas
        ref={canvasRef}
        width={renderSize}
        height={renderSize}
        onClick={handleClick}
        style={{
          cursor: interactive ? "pointer" : "default",
          background: "#ddb86b",
          display: "block",
          width: renderSize,
          height: renderSize,
        }}
      />
    </div>
  );
}

function gtpColumns(n: number): string[] {
  const cols: string[] = [];
  for (let i = 0; i < n; i++) {
    const code = i < 8 ? 65 + i : 66 + i;
    cols.push(String.fromCharCode(code));
  }
  return cols;
}

function starPoints(n: number): [number, number][] {
  if (n === 9) {
    return [[2, 2], [2, 6], [6, 2], [6, 6], [4, 4]];
  }
  if (n === 19) {
    return [[3, 3], [3, 9], [3, 15], [9, 3], [9, 9], [9, 15], [15, 3], [15, 9], [15, 15]];
  }
  return [];
}

export function turnLabel(turn: Color): string {
  return turn === "black" ? "黑方" : "白方";
}

export function xyToGtp(x: number, y: number, size: number): string {
  const col = x < 8 ? String.fromCharCode(65 + x) : String.fromCharCode(66 + x);
  const row = size - y;
  return `${col}${row}`;
}
