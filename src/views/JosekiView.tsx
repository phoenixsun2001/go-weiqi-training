import { useEffect, useState } from "react";
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

  useEffect(() => {
    api.getJoseki()
      .then((data: { joseki: Joseki[]; categories: string[] }) => {
        setJosekiList(data.joseki);
        setCategories(data.categories);
        if (data.joseki.length > 0) setSelected(data.joseki[0]);
      })
      .catch((e: unknown) => setError(String(e)));
  }, []);

  const handleCategoryClick = async (cat: string) => {
    setActiveCategory(cat);
    const data = await api.getJoseki(cat ? { category: cat } : undefined);
    setJosekiList(data.joseki);
  };

  const snapshot = selected ? sgfToSnapshot(selected.moves_sgf) : null;

  const diffStars = (d: number) => "⭐".repeat(d) + "☆".repeat(5 - d);

  return (
    <div style={{ display: "flex", gap: 16, padding: 16, alignItems: "flex-start" }}>
      {/* 左侧：定式列表 */}
      <div style={{ width: 260, flexShrink: 0 }}>
        <h2 style={{ margin: "0 0 8px" }}>定式学习</h2>

        {/* 分类筛选 */}
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 12 }}>
          <button
            onClick={() => { setActiveCategory(""); handleCategoryClick(""); }}
            style={{
              padding: "4px 10px", fontSize: 12, borderRadius: 12, border: "1px solid #d9d9d9",
              background: !activeCategory ? "#1890ff" : "#fff", color: !activeCategory ? "#fff" : "#333",
              cursor: "pointer",
            }}
          >
            全部
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => handleCategoryClick(cat)}
              style={{
                padding: "4px 10px", fontSize: 12, borderRadius: 12, border: "1px solid #d9d9d9",
                background: activeCategory === cat ? "#1890ff" : "#fff", color: activeCategory === cat ? "#fff" : "#333",
                cursor: "pointer",
              }}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* 定式列表 */}
        <div style={{ maxHeight: "calc(100vh - 180px)", overflowY: "auto", borderTop: "1px solid #eee" }}>
          {josekiList.map((j, i) => (
            <div
              key={i}
              onClick={() => setSelected(j)}
              style={{
                padding: "8px 10px",
                cursor: "pointer",
                borderBottom: "1px solid #f0f0f0",
                background: selected?.name === j.name ? "#e6f7ff" : "transparent",
              }}
            >
              <div style={{ fontWeight: selected?.name === j.name ? "bold" : "normal", fontSize: 13 }}>{j.name}</div>
              <div style={{ fontSize: 11, color: "#999", marginTop: 2 }}>
                {j.category} · 难度{j.difficulty}
              </div>
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
            {/* 棋盘 */}
            <div style={{ flexShrink: 0 }}>
              {snapshot && (
                <Board snapshot={snapshot} interactive={false} showCoords />
              )}
            </div>

            {/* 说明 */}
            <div style={{ flex: 1, minWidth: 250 }}>
              <h3 style={{ margin: "0 0 4px" }}>{selected.name}</h3>
              <div style={{ fontSize: 12, color: "#999", marginBottom: 8 }}>
                <span style={{ background: "#f0f0f0", padding: "1px 8px", borderRadius: 8, marginRight: 8 }}>
                  {selected.category}
                </span>
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

              {/* 棋理解读 */}
              {selected.principles && selected.principles.length > 0 && (
                <div style={{ padding: 12, background: "#f6ffed", borderRadius: 6, border: "1px solid #b7eb8f", marginTop: 8 }}>
                  <strong>🧠 棋理解读（为什么这么下）</strong>
                  {selected.principles.map((p, pi) => (
                    <div key={pi} style={{ marginTop: 10, paddingBottom: pi < selected.principles.length - 1 ? 10 : 0, borderBottom: pi < selected.principles.length - 1 ? "1px dashed #d9f7be" : "none" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                        <span style={{ fontSize: 11, background: "#52c41a", color: "#fff", padding: "1px 8px", borderRadius: 8, fontWeight: "bold" }}>
                          {p.concept}
                        </span>
                      </div>
                      <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: "#333" }}>{p.explanation}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* 前后切换 */}
              <div style={{ display: "flex", gap: 8, marginTop: 12, justifyContent: "center" }}>
                <button
                  onClick={() => {
                    const idx = josekiList.findIndex((j) => j.name === selected.name);
                    if (idx > 0) setSelected(josekiList[idx - 1]);
                  }}
                  disabled={josekiList.findIndex((j) => j.name === selected.name) === 0}
                >
                  ← 上一个
                </button>
                <button
                  onClick={() => {
                    const idx = josekiList.findIndex((j) => j.name === selected.name);
                    if (idx < josekiList.length - 1) setSelected(josekiList[idx + 1]);
                  }}
                  disabled={josekiList.findIndex((j) => j.name === selected.name) === josekiList.length - 1}
                >
                  下一个 →
                </button>
              </div>
            </div>
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
    if (x >= 0 && x < size && y >= 0 && y < size) stones[y * size + x] = color;
  }
  return { size, stones, turn: "black" };
}
