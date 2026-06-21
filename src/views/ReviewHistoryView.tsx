import { useCallback, useEffect, useState } from "react";
import { ipc } from "../lib/ipc";
import type { ImportedGameDto } from "../types";

interface Props {
  onReviewGame: (gameId: number, sgf: string) => void;
}

type StatusFilter = "all" | "reviewed" | "pending";
type ResultFilter = "all" | "win" | "loss";

export default function ReviewHistoryView({ onReviewGame }: Props) {
  const [games, setGames] = useState<ImportedGameDto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [resultFilter, setResultFilter] = useState<ResultFilter>("all");
  const [tagFilter, setTagFilter] = useState("");

  const load = useCallback(async () => {
    try {
      const list = await ipc.listImportedGames();
      setGames(list);
    } catch (e) {
      setError(String(e));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = games.filter((g) => {
    if (statusFilter === "reviewed" && !g.reviewed) return false;
    if (statusFilter === "pending" && g.reviewed) return false;
    if (resultFilter === "win" && !g.result.startsWith("B+") && !g.result.startsWith("W+")) return false;
    if (resultFilter === "loss" && g.result !== "") return false;
    if (search) {
      const q = search.toLowerCase();
      if (!g.black_name.toLowerCase().includes(q) && !g.white_name.toLowerCase().includes(q)) return false;
    }
    if (tagFilter && !g.tags.includes(tagFilter)) return false;
    return true;
  });

  // 收集所有标签
  const allTags = Array.from(new Set(games.flatMap((g) => g.tags.split(",").filter(Boolean))));

  const reviewedCount = games.filter((g) => g.reviewed).length;

  return (
    <div style={{ padding: 16 }}>
      <h2 style={{ marginTop: 0 }}>复盘历史</h2>

      {/* 检索筛选栏 */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 12, alignItems: "flex-end" }}>
        <label style={{ fontSize: 13 }}>
          搜索名字
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="黑方/白方" style={{ display: "block", padding: 4, width: 140 }} />
        </label>
        <label style={{ fontSize: 13 }}>
          复盘状态
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as StatusFilter)} style={{ display: "block", padding: 4 }}>
            <option value="all">全部</option>
            <option value="pending">🔴 未复盘</option>
            <option value="reviewed">✅ 已复盘</option>
          </select>
        </label>
        <label style={{ fontSize: 13 }}>
          结果
          <select value={resultFilter} onChange={(e) => setResultFilter(e.target.value as ResultFilter)} style={{ display: "block", padding: 4 }}>
            <option value="all">全部</option>
            <option value="win">胜局</option>
            <option value="loss">负局</option>
          </select>
        </label>
        {allTags.length > 0 && (
          <label style={{ fontSize: 13 }}>
            标签
            <select value={tagFilter} onChange={(e) => setTagFilter(e.target.value)} style={{ display: "block", padding: 4 }}>
              <option value="">全部</option>
              {allTags.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </label>
        )}
      </div>

      <div style={{ fontSize: 12, color: "#666", marginBottom: 12 }}>
        共 {games.length} 局 · 已复盘 {reviewedCount} · 筛选后 {filtered.length} 局
      </div>

      {error && <p style={{ color: "red" }}>{error}</p>}

      {/* 对局列表表格 */}
      {filtered.length === 0 ? (
        <p style={{ color: "#999" }}>暂无对局。请在"对局库"中导入野狐棋谱。</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: "2px solid #ddd", textAlign: "left" }}>
              <th style={{ padding: 6 }}>状态</th>
              <th style={{ padding: 6 }}>黑方</th>
              <th style={{ padding: 6 }}>白方</th>
              <th style={{ padding: 6 }}>结果</th>
              <th style={{ padding: 6 }}>手数</th>
              <th style={{ padding: 6 }}>日期</th>
              <th style={{ padding: 6 }}>标签</th>
              <th style={{ padding: 6 }}>操作</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((g) => (
              <tr key={g.id} style={{ borderBottom: "1px solid #f0f0f0" }}>
                <td style={{ padding: 6 }}>{g.reviewed ? "✅" : "🔴"}</td>
                <td style={{ padding: 6 }}>
                  <strong>{g.black_name || "?"}</strong>
                  {g.black_rank && <span style={{ color: "#888" }}> {g.black_rank}</span>}
                </td>
                <td style={{ padding: 6 }}>
                  <strong>{g.white_name || "?"}</strong>
                  {g.white_rank && <span style={{ color: "#888" }}> {g.white_rank}</span>}
                </td>
                <td style={{ padding: 6 }}>{g.result || "—"}</td>
                <td style={{ padding: 6 }}>{g.move_count}</td>
                <td style={{ padding: 6, color: "#888" }}>{g.played_date || "—"}</td>
                <td style={{ padding: 6 }}>
                  {g.tags.split(",").filter(Boolean).map((t) => (
                    <span key={t} style={{ fontSize: 10, background: "#f0f0f0", padding: "1px 6px", borderRadius: 8, marginRight: 4 }}>{t}</span>
                  ))}
                </td>
                <td style={{ padding: 6 }}>
                  <button onClick={() => onReviewGame(g.id, g.sgf)} style={{ fontSize: 12 }}>
                    {g.reviewed ? "查看复盘" : "开始复盘"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
