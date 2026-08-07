import { useState } from "react";
import { GO_PRINCIPLES, MATCH_GUIDE, MATERIAL_ALBUMS } from "../data/goWisdom";

export default function GoWisdomView() {
  const [section, setSection] = useState<"principles" | "guide" | "materials">("principles");
  const [zoom, setZoom] = useState<{ src: string; label: string } | null>(null);

  const tabBtn = (active: boolean) => ({
    padding: "6px 14px",
    borderRadius: 6,
    border: "none",
    cursor: "pointer",
    background: active ? "#333" : "#f0f0f0",
    color: active ? "#fff" : "#333",
    fontSize: 13,
  });

  return (
    <div style={{ padding: 16, maxWidth: 960, margin: "0 auto" }}>
      <h2 style={{ margin: "0 0 12px" }}>📚 棋理课堂</h2>

      {/* 区块切换 */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <button onClick={() => setSection("principles")} style={tabBtn(section === "principles")}>
          棋理十诀
        </button>
        <button onClick={() => setSection("guide")} style={tabBtn(section === "guide")}>
          升段赛指南
        </button>
        <button onClick={() => setSection("materials")} style={tabBtn(section === "materials")}>
          战术图集
        </button>
      </div>

      {/* ===== 棋理十诀 ===== */}
      {section === "principles" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <p style={{ color: "#666", fontSize: 13, margin: 0 }}>
            段位班实战棋理总结——实战中不能忽略、又经常忽略的棋理。每条都对应训练计划中的某个模块。
          </p>
          {GO_PRINCIPLES.map((p) => (
            <div
              key={p.id}
              style={{
                padding: 12, borderRadius: 8, border: "1px solid #e8e8e8", background: "#fff",
              }}
            >
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 4 }}>
                <span style={{
                  fontSize: 11, padding: "2px 8px", borderRadius: 10, background: "#2f54eb", color: "#fff",
                  fontWeight: "bold", flexShrink: 0,
                }}>
                  {p.id}
                </span>
                <span style={{ fontWeight: "bold", fontSize: 14 }}>{p.title}</span>
                <span style={{ fontSize: 10, color: "#999", marginLeft: "auto", flexShrink: 0 }}>📌 {p.training}</span>
              </div>
              <div style={{ fontSize: 12, color: "#666", lineHeight: 1.6 }}>{p.detail}</div>
            </div>
          ))}
        </div>
      )}

      {/* ===== 升段赛指南 ===== */}
      {section === "guide" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <p style={{ color: "#666", fontSize: 13, margin: 0 }}>
            根据历届升段赛经验总结（2025 版）——从赛前热身到赛后汇报的完整执行手册。
          </p>
          {MATCH_GUIDE.map((sec) => (
            <div key={sec.stage} style={{ borderRadius: 8, border: "1px solid #e8e8e8", background: "#fff", overflow: "hidden" }}>
              <div style={{
                padding: "8px 12px", background: "#fafafa", fontWeight: "bold", fontSize: 14,
                borderBottom: "1px solid #eee",
              }}>
                {sec.icon} {sec.stage}
              </div>
              <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
                {sec.items.map((it) => (
                  <div key={it.title}>
                    <div style={{ fontSize: 13, fontWeight: "bold", marginBottom: 2 }}>· {it.title}</div>
                    <div style={{ fontSize: 12, color: "#666", lineHeight: 1.6, paddingLeft: 14 }}>{it.detail}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ===== 战术图集 ===== */}
      {section === "materials" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {MATERIAL_ALBUMS.map((album) => (
            <div key={album.key} style={{ borderRadius: 8, border: "1px solid #e8e8e8", background: "#fff", padding: 12 }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 2 }}>
                <span style={{ fontWeight: "bold", fontSize: 14 }}>{album.title}</span>
                <span style={{ fontSize: 11, color: "#fa8c16" }}>{album.totalHint}</span>
              </div>
              <div style={{ fontSize: 12, color: "#666", marginBottom: 10 }}>{album.desc}</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                {Array.from({ length: album.count }, (_, i) => i + 1).map((n) => (
                  <div key={n} style={{ textAlign: "center" }}>
                    <img
                      src={`/materials/${album.key}/board${n}.png`}
                      alt={`${album.title} 第${n}题`}
                      onClick={() => setZoom({ src: `/materials/${album.key}/board${n}.png`, label: `${album.title} · 第${n}题${album.boardCount > 1 ? `（本图${album.boardCount}题）` : ""}` })}
                      style={{
                        width: album.key === "shunshi" ? 150 : 165,
                        border: "1px solid #ddd", borderRadius: 6, cursor: "zoom-in",
                        background: "#fafafa",
                      }}
                    />
                    <div style={{ fontSize: 11, color: "#999", marginTop: 2 }}>第{n}题</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
          <p style={{ fontSize: 11, color: "#999", margin: 0 }}>
            提示：点击图片放大。建议配合棋盘在纸质棋盘上摆题练习，再对照图上标注的答案检查。
          </p>
        </div>
      )}

      {/* 放大预览 */}
      {zoom && (
        <div
          onClick={() => setZoom(null)}
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 1000,
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          }}
        >
          <div style={{ color: "#fff", marginBottom: 8, fontSize: 14 }}>{zoom.label}</div>
          <img
            src={zoom.src}
            alt={zoom.label}
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: "92vw", maxHeight: "82vh", borderRadius: 8, background: "#fff", padding: 4 }}
          />
          <div style={{ color: "#aaa", marginTop: 10, fontSize: 12 }}>点击任意处关闭</div>
        </div>
      )}
    </div>
  );
}
