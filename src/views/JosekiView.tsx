import { useEffect, useState, useMemo } from "react";
import Board from "../components/Board";
import { api } from "../lib/api";
import type { BoardSnapshot } from "../types";

interface Joseki {
  name: string;
  category: string;
  difficulty: number;
  description: string;
  key_points: string;
  moves_sgf: string;
  principles: { concept: string; explanation: string }[];
}

export default function JosekiView() {
  const [josekiList, setJosekiList] = useState<Joseki[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [activeCategory, setActiveCategory] = useState<string>("");
  const [selected, setSelected] = useState<Joseki | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 逐步浏览 + 试下
  const [currentStep, setCurrentStep] = useState<number>(0); // 当前展示到第几手（0=空盘）
  const [showMoveNumbers, setShowMoveNumbers] = useState(true);
  const [tryMode, setTryMode] = useState(false); // 试下模式
  const [extraStones, setExtraStones] = useState<{ x: number; y: number; color: "black" | "white" }[]>([]);

  useEffect(() => {
    api.getJoseki()
      .then((data: { joseki: Joseki[]; categories: string[] }) => {
        setJosekiList(data.joseki);
        setCategories(data.categories);
        if (data.joseki.length > 0) selectJoseki(data.joseki[0]);
      })
      .catch((e: unknown) => setError(String(e)));
  }, []);

  const selectJoseki = (j: Joseki) => {
    setSelected(j);
    setCurrentStep(0);
    setTryMode(false);
    setExtraStones([]);
  };

  const handleCategoryClick = async (cat: string) => {
    setActiveCategory(cat);
    const data = await api.getJoseki(cat ? { category: cat } : undefined);
    setJosekiList(data.joseki);
  };

  // 解析定式 SGF 为逐步序列
  const baseSnapshots = useMemo(() => {
    if (!selected) return [];
    return buildBoardSequence(selected.moves_sgf);
  }, [selected]);

  const totalSteps = baseSnapshots.length - 1; // 不含空盘
  const displayStep = Math.min(currentStep, totalSteps);

  // 当前棋盘快照（定式手数 + 试下的额外棋子）
  const snapshot: BoardSnapshot | null = useMemo(() => {
    if (!selected || baseSnapshots.length === 0) return null;
    const base = baseSnapshots[Math.min(displayStep, baseSnapshots.length - 1)];
    if (!base) return null;
    if (extraStones.length === 0) return base;
    const stones = [...base.stones];
    for (const s of extraStones) {
      stones[s.y * base.size + s.x] = s.color;
    }
    return { ...base, stones };
  }, [selected, baseSnapshots, displayStep, extraStones]);

  // 手数映射
  const moveNumbers = useMemo(() => {
    if (!showMoveNumbers || !selected) return undefined;
    const map: Record<string, number> = {};
    const re = /;([BW])\[([a-z]{2})\]/g;
    let m: RegExpExecArray | null;
    let num = 1;
    while ((m = re.exec(selected.moves_sgf)) !== null) {
      if (num > displayStep + 1) break;
      const x = m[2].charCodeAt(0) - 97;
      const y = m[2].charCodeAt(1) - 97;
      map[`${x},${y}`] = num;
      num++;
    }
    // 试下的棋子也标注手数
    const nextNum = displayStep + 1;
    extraStones.forEach((s, i) => {
      map[`${s.x},${s.y}`] = nextNum + i;
    });
    return map;
  }, [showMoveNumbers, selected, displayStep, extraStones]);

  // 试下：点击棋盘落子
  const handlePlay = (x: number, y: number) => {
    if (!tryMode || !snapshot) return;
    const size = snapshot.size;
    if (snapshot.stones[y * size + x]) return; // 已有子
    const nextColor = (displayStep + extraStones.length) % 2 === 0 ? "black" : "white";
    setExtraStones([...extraStones, { x, y, color: nextColor }]);
  };

  const toggleTryMode = () => {
    if (!tryMode) {
      // 进入试下：先展示完整定式
      setCurrentStep(totalSteps);
      setTryMode(true);
      setExtraStones([]);
    } else {
      setTryMode(false);
      setExtraStones([]);
    }
  };

  const resetBoard = () => {
    setExtraStones([]);
    if (tryMode) setTryMode(false);
    setCurrentStep(0);
  };

  const diffStars = (d: number) => "⭐".repeat(d) + "☆".repeat(5 - d);

  return (
    <div style={{ display: "flex", gap: 16, padding: 16, alignItems: "flex-start" }}>
      {/* 左侧：定式列表 */}
      <div style={{ width: 260, flexShrink: 0 }}>
        <h2 style={{ margin: "0 0 8px" }}>定式学习</h2>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 12 }}>
          <button onClick={() => { setActiveCategory(""); handleCategoryClick(""); }}
            style={{ padding: "4px 10px", fontSize: 12, borderRadius: 12, border: "1px solid #d9d9d9", background: !activeCategory ? "#1890ff" : "#fff", color: !activeCategory ? "#fff" : "#333", cursor: "pointer" }}>
            全部
          </button>
          {categories.map((cat) => (
            <button key={cat} onClick={() => handleCategoryClick(cat)}
              style={{ padding: "4px 10px", fontSize: 12, borderRadius: 12, border: "1px solid #d9d9d9", background: activeCategory === cat ? "#1890ff" : "#fff", color: activeCategory === cat ? "#fff" : "#333", cursor: "pointer" }}>
              {cat}
            </button>
          ))}
        </div>
        <div style={{ maxHeight: "calc(100vh - 180px)", overflowY: "auto", borderTop: "1px solid #eee" }}>
          {josekiList.map((j, i) => (
            <div key={i} onClick={() => selectJoseki(j)}
              style={{ padding: "8px 10px", cursor: "pointer", borderBottom: "1px solid #f0f0f0", background: selected?.name === j.name ? "#e6f7ff" : "transparent" }}>
              <div style={{ fontWeight: selected?.name === j.name ? "bold" : "normal", fontSize: 13 }}>{j.name}</div>
              <div style={{ fontSize: 11, color: "#999", marginTop: 2 }}>{j.category} · 难度{j.difficulty}</div>
            </div>
          ))}
        </div>
      </div>

      {/* 右侧：定式详情 */}
      <div style={{ flex: 1, minWidth: 300 }}>
        {error && <p style={{ color: "red" }}>{error}</p>}
        {!selected ? (
          <p style={{ color: "#999", padding: 24 }}>← 从左侧选择一个定式</p>
        ) : (
          <div style={{ display: "flex", gap: 16 }}>
            {/* 棋盘 + 控制 */}
            <div style={{ flexShrink: 0 }}>
              {snapshot && (
                <>
                  <Board
                    snapshot={snapshot}
                    onPlay={handlePlay}
                    interactive={tryMode}
                    showCoords
                    moveNumbers={moveNumbers}
                  />
                  {/* 导航控件 */}
                  <div style={{ display: "flex", gap: 4, justifyContent: "center", marginTop: 8 }}>
                    <button onClick={resetBoard} title="重置">⏮</button>
                    <button onClick={() => setCurrentStep((s) => Math.max(0, s - 1))} disabled={tryMode} title="上一手">◀</button>
                    <button onClick={() => setCurrentStep((s) => Math.min(totalSteps, s + 1))} disabled={tryMode} title="下一手">▶</button>
                    <button onClick={() => { setCurrentStep(totalSteps); setExtraStones([]); }} disabled={tryMode} title="末手">⏭</button>
                  </div>
                  <p style={{ textAlign: "center", fontSize: 12, color: "#666", marginTop: 4 }}>
                    第 {displayStep} / {totalSteps} 手{extraStones.length > 0 ? ` +${extraStones.length}手试下` : ""}
                  </p>
                  {/* 模式切换 */}
                  <div style={{ display: "flex", gap: 6, justifyContent: "center", marginTop: 4 }}>
                    <button
                      onClick={toggleTryMode}
                      style={{ fontSize: 12, padding: "4px 12px", background: tryMode ? "#52c41a" : "#f0f0f0", color: tryMode ? "#fff" : "#333", border: tryMode ? "1px solid #52c41a" : "1px solid #d9d9d9", borderRadius: 4 }}
                    >
                      {tryMode ? "✓ 试下中（点击棋盘落子）" : "♟ 试下"}
                    </button>
                    <label style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 2 }}>
                      <input type="checkbox" checked={showMoveNumbers} onChange={(e) => setShowMoveNumbers(e.target.checked)} /> 手数
                    </label>
                  </div>
                  {tryMode && (
                    <p style={{ textAlign: "center", fontSize: 11, color: "#52c41a", marginTop: 4 }}>
                      在棋盘上点击落子，自由探索变化
                    </p>
                  )}
                </>
              )}
            </div>

            {/* 说明 */}
            <div style={{ flex: 1, minWidth: 250 }}>
              <h3 style={{ margin: "0 0 4px" }}>{selected.name}</h3>
              <div style={{ fontSize: 12, color: "#999", marginBottom: 8 }}>
                <span style={{ background: "#f0f0f0", padding: "1px 8px", borderRadius: 8, marginRight: 8 }}>{selected.category}</span>
                难度 {diffStars(selected.difficulty)}
              </div>

              <div style={{ padding: 12, background: "#f6f8fa", borderRadius: 6, marginBottom: 8 }}>
                <strong>📖 定式说明</strong>
                <p style={{ margin: "6px 0 0", fontSize: 13, lineHeight: 1.6 }}>{selected.description}</p>
              </div>

              <div style={{ padding: 12, background: "#fff7e6", borderRadius: 6, border: "1px solid #ffd591" }}>
                <strong>🔑 要点</strong>
                <p style={{ margin: "6px 0 0", fontSize: 13, lineHeight: 1.6 }}>{selected.key_points}</p>
              </div>

              {selected.principles && selected.principles.length > 0 && (
                <div style={{ padding: 12, background: "#f6ffed", borderRadius: 6, border: "1px solid #b7eb8f", marginTop: 8 }}>
                  <strong>🧠 棋理解读（为什么这么下）</strong>
                  {selected.principles.map((p, pi) => (
                    <div key={pi} style={{ marginTop: 10, paddingBottom: pi < selected.principles.length - 1 ? 10 : 0, borderBottom: pi < selected.principles.length - 1 ? "1px dashed #d9f7be" : "none" }}>
                      <div style={{ marginBottom: 4 }}>
                        <span style={{ fontSize: 11, background: "#52c41a", color: "#fff", padding: "1px 8px", borderRadius: 8, fontWeight: "bold" }}>{p.concept}</span>
                      </div>
                      <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: "#333" }}>{p.explanation}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* 前后切换 */}
              <div style={{ display: "flex", gap: 8, marginTop: 12, justifyContent: "center" }}>
                <button onClick={() => {
                  const idx = josekiList.findIndex((j) => j.name === selected.name);
                  if (idx > 0) selectJoseki(josekiList[idx - 1]);
                }} disabled={josekiList.findIndex((j) => j.name === selected.name) === 0}>← 上一个</button>
                <button onClick={() => {
                  const idx = josekiList.findIndex((j) => j.name === selected.name);
                  if (idx < josekiList.length - 1) selectJoseki(josekiList[idx + 1]);
                }} disabled={josekiList.findIndex((j) => j.name === selected.name) === josekiList.length - 1}>下一个 →</button>
              </div>
            </div>
          </div>
        )}
      </div>
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
