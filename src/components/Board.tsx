import { useEffect, useRef, useState } from "react";
import type { BoardSnapshot, Color } from "../types";

interface Props {
  snapshot: BoardSnapshot;
  onPlay?: (x: number, y: number) => void;
  interactive: boolean;
  size?: number;
  showCoords?: boolean;
  marks?: { x: number; y: number; label: string; color?: string }[];
  /** 最新一手棋的坐标，在棋子下方画红色三角标记 */
  lastMove?: { x: number; y: number } | null;
  /** 每颗棋子上显示的手数（数字），key = "x,y" */
  moveNumbers?: Record<string, number>;
}

export default function Board({
  snapshot,
  onPlay,
  interactive,
  size,
  showCoords = true,
  marks = [],
  lastMove = null,
  moveNumbers,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // 当前尺寸档位索引
  const SIZES = [360, 420, 480, 540, 600, 660, 720, 780, 840, 960, 1080, 1200];
  const [sizeIdx, setSizeIdx] = useState(4); // 默认 600px

  // 初始化：尝试根据窗口高度选合适档位
  useEffect(() => {
    if (size !== undefined) return;
    const maxH = window.innerHeight - 100;
    let idx = 0;
    for (let i = 0; i < SIZES.length; i++) {
      if (SIZES[i] <= maxH && SIZES[i] <= window.innerWidth - 360) idx = i;
    }
    setSizeIdx(idx);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleZoomIn = () => setSizeIdx((i) => Math.min(SIZES.length - 1, i + 1));
  const handleZoomOut = () => setSizeIdx((i) => Math.max(0, i - 1));

  const renderSize = size ?? SIZES[sizeIdx];

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
          // 手数显示
          if (moveNumbers) {
            const num = moveNumbers[`${x},${y}`];
            if (num !== undefined) {
              ctx.font = `bold ${cell * 0.32}px sans-serif`;
              ctx.textAlign = "center";
              ctx.textBaseline = "middle";
              ctx.fillStyle = s === "black" ? "#fff" : "#111";
              ctx.fillText(String(num), cx, cy);
            }
          }
        }
      }
    }

    // 最新一手棋：红色小三角标记
    if (lastMove && lastMove.x >= 0 && lastMove.x < n && lastMove.y >= 0 && lastMove.y < n) {
      const cx = margin + cell * (lastMove.x + 0.5);
      const cy = margin + cell * (lastMove.y + 0.5);
      const r = cell * 0.18;
      // 红色等边三角形（向下），画在棋子下方偏移位置
      ctx.fillStyle = "#e22";
      ctx.beginPath();
      ctx.moveTo(cx, cy + r);         // 上顶点
      ctx.lineTo(cx - r, cy + r * 2.4); // 左下
      ctx.lineTo(cx + r, cy + r * 2.4); // 右下
      ctx.closePath();
      ctx.fill();
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
  }, [snapshot, renderSize, showCoords, marks, lastMove, moveNumbers]);

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
    <div style={{ display: "inline-block" }}>
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
      {size === undefined && (
        <div style={{ display: "flex", gap: 4, justifyContent: "center", marginTop: 6, alignItems: "center" }}>
          <button
            onClick={handleZoomOut}
            disabled={sizeIdx === 0}
            style={{ fontSize: 16, padding: "2px 10px", cursor: sizeIdx === 0 ? "default" : "pointer" }}
            title="缩小棋盘"
          >
            −
          </button>
          <span style={{ fontSize: 11, color: "#999", minWidth: 40, textAlign: "center" }}>
            {renderSize}px
          </span>
          <button
            onClick={handleZoomIn}
            disabled={sizeIdx === SIZES.length - 1}
            style={{ fontSize: 16, padding: "2px 10px", cursor: sizeIdx === SIZES.length - 1 ? "default" : "pointer" }}
            title="放大棋盘"
          >
            +
          </button>
        </div>
      )}
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
