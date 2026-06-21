import { useCallback, useEffect, useState } from "react";
import { ipc } from "../lib/ipc";
import type { ImportedGameDto } from "../types";

interface Props {
  onReviewGame: (gameId: number, sgf: string) => void;
}

export default function LibraryView({ onReviewGame }: Props) {
  const [games, setGames] = useState<ImportedGameDto[]>([]);
  const [selected, setSelected] = useState<ImportedGameDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [tagsDraft, setTagsDraft] = useState("");
  const [notesDraft, setNotesDraft] = useState("");
  const [filter, setFilter] = useState("");

  const loadGames = useCallback(async () => {
    try {
      const list = await ipc.listImportedGames();
      setGames(list);
      setError(null);
    } catch (e) {
      setError(String(e));
    }
  }, []);

  useEffect(() => {
    loadGames();
  }, [loadGames]);

  useEffect(() => {
    if (selected) {
      setTagsDraft(selected.tags);
      setNotesDraft(selected.notes);
    }
  }, [selected]);

  const handleImportFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setImporting(true);
    setError(null);
    try {
      for (const file of Array.from(files)) {
        const text = await file.text();
        try {
          await ipc.importGame(text, "foxwq");
        } catch (e) {
          setError(`${file.name} 导入失败：${e}`);
        }
      }
      await loadGames();
    } finally {
      setImporting(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("确认删除这局棋谱？")) return;
    try {
      await ipc.deleteImportedGame(id);
      if (selected?.id === id) setSelected(null);
      await loadGames();
    } catch (e) {
      setError(String(e));
    }
  };

  const handleSaveMeta = async () => {
    if (!selected) return;
    try {
      const updated = await ipc.updateGameMeta(selected.id, undefined, tagsDraft, notesDraft);
      setSelected(updated);
      await loadGames();
    } catch (e) {
      setError(String(e));
    }
  };

  const handleToggleReviewed = async () => {
    if (!selected) return;
    try {
      const updated = await ipc.updateGameMeta(selected.id, !selected.reviewed);
      setSelected(updated);
      await loadGames();
    } catch (e) {
      setError(String(e));
    }
  };

  const filtered = filter
    ? games.filter(
        (g) =>
          g.black_name.includes(filter) ||
          g.white_name.includes(filter) ||
          g.tags.includes(filter)
      )
    : games;

  const reviewedCount = games.filter((g) => g.reviewed).length;

  return (
    <div style={{ display: "flex", gap: 16, padding: 16, height: "calc(100vh - 50px)" }}>
      {/* 左侧：对局列表 */}
      <div style={{ width: 400, display: "flex", flexDirection: "column", gap: 8 }}>
        <h2 style={{ margin: 0 }}>对局库</h2>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <label
            style={{
              padding: "6px 12px",
              background: "#333",
              color: "#fff",
              borderRadius: 4,
              cursor: importing ? "wait" : "pointer",
              fontSize: 13,
            }}
          >
            {importing ? "导入中…" : "📁 导入野狐 SGF"}
            <input
              type="file"
              accept=".sgf"
              multiple
              style={{ display: "none" }}
              onChange={(e) => handleImportFiles(e.target.files)}
              disabled={importing}
            />
          </label>
          <input
            type="text"
            placeholder="搜索名字/标签…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            style={{ flex: 1, padding: 4 }}
          />
        </div>
        <div style={{ fontSize: 12, color: "#666" }}>
          共 {games.length} 局 · 已复盘 {reviewedCount} · 未复盘 {games.length - reviewedCount}
        </div>
        {error && <p style={{ color: "red", fontSize: 12 }}>{error}</p>}
        <div style={{ flex: 1, overflowY: "auto", borderTop: "1px solid #eee" }}>
          {filtered.length === 0 ? (
            <p style={{ color: "#999", padding: 16, fontSize: 13 }}>
              暂无对局。点击"导入野狐 SGF"导入棋谱（支持多选）。
            </p>
          ) : (
            filtered.map((g) => (
              <div
                key={g.id}
                onClick={() => setSelected(g)}
                style={{
                  padding: "8px 10px",
                  borderBottom: "1px solid #f0f0f0",
                  cursor: "pointer",
                  background: selected?.id === g.id ? "#e6f7ff" : "transparent",
                  fontSize: 13,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>
                    <strong>{g.black_name || "?"}</strong>
                    {g.black_rank && `(${g.black_rank})`} vs{" "}
                    <strong>{g.white_name || "?"}</strong>
                    {g.white_rank && `(${g.white_rank})`}
                  </span>
                  <span>{g.reviewed ? "✅" : "🔴"}</span>
                </div>
                <div style={{ color: "#888", fontSize: 11, marginTop: 2 }}>
                  {g.result || "未记录"} · {g.move_count}手 · {g.played_date || "日期未知"}
                </div>
                {g.tags && (
                  <div style={{ marginTop: 2 }}>
                    {g.tags
                      .split(",")
                      .filter(Boolean)
                      .map((t) => (
                        <span
                          key={t}
                          style={{
                            fontSize: 10,
                            background: "#f0f0f0",
                            padding: "1px 6px",
                            borderRadius: 8,
                            marginRight: 4,
                          }}
                        >
                          {t}
                        </span>
                      ))}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* 右侧：详情面板 */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {!selected ? (
          <p style={{ color: "#999", padding: 24 }}>← 从左侧选择一局棋查看详情</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <h3 style={{ margin: 0 }}>对局详情</h3>
            <table style={{ fontSize: 13, borderCollapse: "collapse" }}>
              <tbody>
                <tr>
                  <td style={{ padding: "4px 12px 4px 0", color: "#888" }}>黑方</td>
                  <td>
                    <strong>{selected.black_name || "未知"}</strong>
                    {selected.black_rank && ` · ${selected.black_rank}`}
                  </td>
                </tr>
                <tr>
                  <td style={{ padding: "4px 12px 4px 0", color: "#888" }}>白方</td>
                  <td>
                    <strong>{selected.white_name || "未知"}</strong>
                    {selected.white_rank && ` · ${selected.white_rank}`}
                  </td>
                </tr>
                <tr>
                  <td style={{ padding: "4px 12px 4px 0", color: "#888" }}>结果</td>
                  <td>{selected.result || "未记录"}</td>
                </tr>
                <tr>
                  <td style={{ padding: "4px 12px 4px 0", color: "#888" }}>信息</td>
                  <td>
                    {selected.board_size}路 · {selected.move_count}手 ·{" "}
                    {selected.played_date || "日期未知"}
                  </td>
                </tr>
                <tr>
                  <td style={{ padding: "4px 12px 4px 0", color: "#888" }}>复盘</td>
                  <td>
                    {selected.reviewed ? "✅ 已复盘" : "🔴 未复盘"}
                    <button
                      onClick={handleToggleReviewed}
                      style={{ marginLeft: 8, fontSize: 12 }}
                    >
                      {selected.reviewed ? "标记为未复盘" : "标记为已复盘"}
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>

            <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
              <button
                onClick={() => onReviewGame(selected.id, selected.sgf)}
                style={{ padding: "8px 16px", background: "#333", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer" }}
              >
                ▶ 开始复盘分析
              </button>
              <button
                onClick={() => handleDelete(selected.id)}
                style={{ padding: "8px 16px", color: "#cf1322", border: "1px solid #cf1322", borderRadius: 4, cursor: "pointer" }}
              >
                删除
              </button>
            </div>

            <div>
              <label style={{ fontSize: 13, display: "block", marginBottom: 4 }}>标签（逗号分隔）</label>
              <input
                type="text"
                value={tagsDraft}
                onChange={(e) => setTagsDraft(e.target.value)}
                placeholder="如：布局问题,官子失误,胜局"
                style={{ width: "100%", padding: 6 }}
              />
            </div>

            <div>
              <label style={{ fontSize: 13, display: "block", marginBottom: 4 }}>复盘笔记</label>
              <textarea
                value={notesDraft}
                onChange={(e) => setNotesDraft(e.target.value)}
                rows={5}
                style={{ width: "100%", padding: 6 }}
                placeholder="记录这局棋的要点、失误、心得…"
              />
            </div>
            <button
              onClick={handleSaveMeta}
              style={{ alignSelf: "flex-start", padding: "6px 16px" }}
            >
              保存标签与笔记
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
