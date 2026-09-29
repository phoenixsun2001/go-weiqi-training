/**
 * 前端围棋规则工具：落子提子/棋块气计算/SGF 序列构建
 * 与后端 game_state.py 逻辑一致（无劫禁手，用于复盘回放的静态推演）
 */
import type { BoardSnapshot } from "../types";

type Cell = "black" | "white" | null;

function neighbors(x: number, y: number, size: number): [number, number][] {
  const v: [number, number][] = [];
  if (x > 0) v.push([x - 1, y]);
  if (x + 1 < size) v.push([x + 1, y]);
  if (y > 0) v.push([x, y - 1]);
  if (y + 1 < size) v.push([x, y + 1]);
  return v;
}

/** 求连通块与气数 */
export function groupAndLiberties(
  stones: Cell[], size: number, x: number, y: number
): { group: [number, number][]; libs: number } {
  const color = stones[y * size + x];
  if (!color) return { group: [], libs: 0 };
  const group: [number, number][] = [];
  const visited = new Set<number>();
  const libs = new Set<number>();
  const stack: [number, number][] = [[x, y]];
  while (stack.length) {
    const [cx, cy] = stack.pop()!;
    const idx = cy * size + cx;
    if (visited.has(idx)) continue;
    visited.add(idx);
    group.push([cx, cy]);
    for (const [nx, ny] of neighbors(cx, cy, size)) {
      const val = stones[ny * size + nx];
      if (val === null) libs.add(ny * size + nx);
      else if (val === color && !visited.has(ny * size + nx)) stack.push([nx, ny]);
    }
  }
  return { group, libs: libs.size };
}

/**
 * 落子（含提子）。返回新棋盘数组；目标已有子时返回原数组。
 */
export function applyMove(
  stones: Cell[], size: number, x: number, y: number, color: "black" | "white"
): Cell[] {
  if (x < 0 || y < 0 || x >= size || y >= size) return stones;
  if (stones[y * size + x]) return stones;
  const next = [...stones];
  next[y * size + x] = color;
  const opp: Cell = color === "black" ? "white" : "black";
  for (const [nx, ny] of neighbors(x, y, size)) {
    if (next[ny * size + nx] !== opp) continue;
    const { group, libs } = groupAndLiberties(next, size, nx, ny);
    if (libs === 0) {
      for (const [gx, gy] of group) next[gy * size + gx] = null;
    }
  }
  // 自杀（不复盘场景罕见）：整块无气则撤销
  const { libs } = groupAndLiberties(next, size, x, y);
  if (libs === 0) return stones;
  return next;
}

/**
 * SGF → 逐步棋盘快照（正确处理提子；支持 AB/AW 初始摆子与 B[]空着）
 */
export function buildBoardSequence(sgf: string): BoardSnapshot[] {
  const sizeMatch = sgf.match(/SZ\[(\d+)\]/);
  const size = sizeMatch ? Number(sizeMatch[1]) : 19;
  let stones: Cell[] = Array(size * size).fill(null);

  // 初始摆子 AB/AW
  for (const [attr, color] of [["AB", "black"], ["AW", "white"]] as const) {
    const m = sgf.match(new RegExp(`\\b${attr}((?:\\[[a-z]{2}\\])+)`));
    if (!m) continue;
    for (const mm of m[1].matchAll(/\[([a-z]{2})\]/g)) {
      const x = mm[1].charCodeAt(0) - 97;
      const y = mm[1].charCodeAt(1) - 97;
      if (x >= 0 && x < size && y >= 0 && y < size) stones[y * size + x] = color;
    }
  }

  const snapshots: BoardSnapshot[] = [{ size, stones: [...stones], turn: "black" }];
  const re = /;([BW])\[([a-z]{2}|)\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(sgf)) !== null) {
    const color = m[1] === "B" ? ("black" as const) : ("white" as const);
    if (m[2].length === 2) {
      const x = m[2].charCodeAt(0) - 97;
      const y = m[2].charCodeAt(1) - 97;
      stones = applyMove(stones, size, x, y, color);
    }
    snapshots.push({ size, stones: [...stones], turn: color === "black" ? "white" : "black" });
  }
  return snapshots;
}
