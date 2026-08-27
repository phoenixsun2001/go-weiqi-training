import { useCallback, useEffect, useState } from "react";
import { ipc } from "../lib/ipc";
import type { ImportedGameDto } from "../types";
import SyncPanel from "./SyncPanel";

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
  const [filter] = useState("");
  const [sortKey, setSortKey] = useState<"played_date" | "move_count" | "black_name" | "white_name" | "result" | "reviewed">("played_date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  // 野狐导入面板状态
  const [showImportPanel, setShowImportPanel] = useState(false);
  const [showSyncPanel, setShowSyncPanel] = useState(false);
  const [foxNickname, setFoxNickname] = useState("");
  const [foxUid, setFoxUid] = useState("");
  const [foxDateFrom, setFoxDateFrom] = useState("");
  const [foxDateTo, setFoxDateTo] = useState("");
  const [foxLimit, setFoxLimit] = useState(50);
  const [importMsg, setImportMsg] = useState<string | null>(null);

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

  const handleFoxwqImport = async () => {
    if (!foxNickname && !foxUid) {
      setImportMsg("请输入昵称或UID");
      return;
    }
    setImporting(true);
    setImportMsg("正在从野狐下载棋谱并增量导入…");
    try {
      const res = await ipc.foxwqImport({
        nickname: foxNickname || undefined,
        uid: foxUid || undefined,
        limit: foxLimit,
        date_from: foxDateFrom || undefined,
        date_to: foxDateTo || undefined,
      });
      setImportMsg(res.message);
      await loadGames();
    } catch (e) {
      setImportMsg(`导入失败：${e}`);
    } finally {
      setImporting(false);
    }
  };

  const handleImportFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setImporting(true);
    setError(null);
    try {
      for (const file of Array.from(files)) {
        const text = await file.text();
        try { await ipc.importGame(text, "sgf_file"); } catch (e) { setError(`${file.name} 失败：${e}`); }
      }
      await loadGames();
    } finally { setImporting(false); }
  };

  const handleSaveMeta = async () => {
    if (!selected) return;
    try {
      const updated = await ipc.updateGameMeta(selected.id, undefined, tagsDraft, notesDraft);
      setSelected(updated);
      await loadGames();
    } catch (e) { setError(String(e)); }
  };

  const handleToggleReviewed = async () => {
    if (!selected) return;
    try {
      const updated = await ipc.updateGameMeta(selected.id, !selected.reviewed);
      setSelected(updated);
      await loadGames();
    } catch (e) { setError(String(e)); }
  };

  const filtered = filter
    ? games.filter((g) => g.black_name.includes(filter) || g.white_name.includes(filter) || g.tags.includes(filter))
    : games;

  const toggleSort = (key: typeof sortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const sortArrow = (key: typeof sortKey) => {
    if (sortKey !== key) return "";
    return sortDir === "asc" ? " ↑" : " ↓";
  };

  const sorted = [...filtered].sort((a, b) => {
    let av: string | number | boolean = a[sortKey];
    let bv: string | number | boolean = b[sortKey];
    if (typeof av === "boolean") av = av ? 1 : 0;
    if (typeof bv === "boolean") bv = bv ? 1 : 0;
    if (av < bv) return sortDir === "asc" ? -1 : 1;
    if (av > bv) return sortDir === "asc" ? 1 : -1;
    return 0;
  });
  const reviewedCount = games.filter((g) => g.reviewed).length;
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadGames();
    setRefreshing(false);
  };

  return (
    <div style={{ padding: 16, height: "calc(100vh - 50px)", display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2 style={{ margin: 0 }}>对局库（{games.length}局 · 已复盘{reviewedCount}）</h2>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={handleRefresh} disabled={refreshing} style={{ padding: "4px 12px" }}>
            {refreshing ? "🔄…" : "🔄 刷新"}
          </button>
          <button onClick={() => setShowImportPanel(!showImportPanel)} style={{ padding: "4px 12px" }}>
            {showImportPanel ? "收起导入" : "📥 野狐导入"}
          </button>
          <button onClick={() => setShowSyncPanel(!showSyncPanel)} style={{ padding: "4px 12px" }}>
            {showSyncPanel ? "收起同步" : "⏱ 定时同步"}
          </button>
          <label style={{ padding: "4px 12px", background: "#333", color: "#fff", borderRadius: 4, cursor: "pointer", fontSize: 13 }}>
            📁 导入SGF文件
            <input type="file" accept=".sgf" multiple style={{ display: "none" }}
              onChange={(e) => handleImportFiles(e.target.files)} disabled={importing} />
          </label>
        </div>
      </div>

      {/* 野狐定时同步面板 */}
      {showSyncPanel && (
        <SyncPanel onImported={loadGames} />
      )}

      {/* 野狐导入面板 */}
      {showImportPanel && (
        <div style={{ border: "1px solid #adc6ff", borderRadius: 6, padding: 12, background: "#f0f5ff", display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
          <label style={{ fontSize: 13 }}>
            昵称
            <input type="text" value={foxNickname} onChange={(e) => setFoxNickname(e.target.value)} placeholder="如 JadenSai" style={{ display: "block", padding: 4, width: 120 }} />
          </label>
          <label style={{ fontSize: 13 }}>
            或 UID
            <input type="text" value={foxUid} onChange={(e) => setFoxUid(e.target.value)} placeholder="数字ID" style={{ display: "block", padding: 4, width: 100 }} />
          </label>
          <label style={{ fontSize: 13 }}>
            开始日期
            <input type="date" value={foxDateFrom} onChange={(e) => setFoxDateFrom(e.target.value)} style={{ display: "block", padding: 4 }} />
          </label>
          <label style={{ fontSize: 13 }}>
            结束日期
            <input type="date" value={foxDateTo} onChange={(e) => setFoxDateTo(e.target.value)} style={{ display: "block", padding: 4 }} />
          </label>
          <label style={{ fontSize: 13 }}>
            数量上限
            <input type="number" value={foxLimit} onChange={(e) => setFoxLimit(Number(e.target.value))} min={1} max={500} style={{ display: "block", padding: 4, width: 60 }} />
          </label>
          <button onClick={handleFoxwqImport} disabled={importing} style={{ padding: "6px 16px", fontWeight: "bold" }}>
            {importing ? "导入中…" : "开始导入"}
          </button>
          {importMsg && <span style={{ fontSize: 13, color: importMsg.startsWith("导入完成") ? "#389e0d" : "#1890ff", alignSelf: "center" }}>{importMsg}</span>}
        </div>
      )}

      {error && <p style={{ color: "red", fontSize: 12 }}>{error}</p>}

      {/* 对局表格 */}
      <div style={{ flex: 1, overflow: "auto", borderTop: "1px solid #eee" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead style={{ position: "sticky", top: 0, background: "#fff", zIndex: 1 }}>
            <tr style={{ borderBottom: "2px solid #ddd", textAlign: "left" }}>
              <th style={{ padding: 6, cursor: "pointer", userSelect: "none" }} onClick={() => toggleSort("reviewed")}>
                状态{sortArrow("reviewed")}
              </th>
              <th style={{ padding: 6, cursor: "pointer", userSelect: "none" }} onClick={() => toggleSort("played_date")}>
                日期{sortArrow("played_date")}
              </th>
              <th style={{ padding: 6, cursor: "pointer", userSelect: "none" }} onClick={() => toggleSort("black_name")}>
                黑方{sortArrow("black_name")}
              </th>
              <th style={{ padding: 6, cursor: "pointer", userSelect: "none" }} onClick={() => toggleSort("white_name")}>
                白方{sortArrow("white_name")}
              </th>
              <th style={{ padding: 6, cursor: "pointer", userSelect: "none" }} onClick={() => toggleSort("result")}>
                结果{sortArrow("result")}
              </th>
              <th style={{ padding: 6, cursor: "pointer", userSelect: "none" }} onClick={() => toggleSort("move_count")}>
                手数{sortArrow("move_count")}
              </th>
              <th style={{ padding: 6 }}>来源</th>
              <th style={{ padding: 6 }}>操作</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={8} style={{ padding: 16, color: "#999", textAlign: "center" }}>
                暂无对局。点击"野狐导入"通过昵称批量导入。
              </td></tr>
            ) : sorted.map((g) => (
              <tr key={g.id} style={{ borderBottom: "1px solid #f0f0f0", cursor: "pointer" }}
                onClick={() => setSelected(g)}
                onMouseEnter={(e) => e.currentTarget.style.background = "#f6f8fa"}
                onMouseLeave={(e) => e.currentTarget.style.background = selected?.id === g.id ? "#e6f7ff" : ""}>
                <td style={{ padding: 6 }}>{g.reviewed ? "✅" : "🔴"}</td>
                <td style={{ padding: 6, color: "#888" }}>{g.played_date}</td>
                <td style={{ padding: 6 }}><strong>{g.black_name}</strong>{g.black_rank && <span style={{color:"#888"}}> {g.black_rank}</span>}</td>
                <td style={{ padding: 6 }}><strong>{g.white_name}</strong>{g.white_rank && <span style={{color:"#888"}}> {g.white_rank}</span>}</td>
                <td style={{ padding: 6 }}>{g.result || "—"}</td>
                <td style={{ padding: 6 }}>{g.move_count}</td>
                <td style={{ padding: 6, fontSize: 11, color: "#aaa" }}>{g.source}</td>
                <td style={{ padding: 6 }}>
                  <button onClick={(e) => { e.stopPropagation(); onReviewGame(g.id, g.sgf); }} style={{ fontSize: 12 }}>
                    {g.reviewed ? "复盘" : "复盘"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 详情/编辑面板（选中对局时底部展开） */}
      {selected && (
        <div style={{ borderTop: "2px solid #1890ff", padding: 12, background: "#f6f8fa", display: "flex", gap: 16, alignItems: "flex-end" }}>
          <div style={{ flex: 1 }}>
            <strong>{selected.black_name} vs {selected.white_name}</strong>
            <span style={{ marginLeft: 8, fontSize: 12, color: "#666" }}>{selected.result} · {selected.move_count}手 · {selected.played_date}</span>
          </div>
          <input type="text" value={tagsDraft} onChange={(e) => setTagsDraft(e.target.value)} placeholder="标签" style={{ padding: 4, width: 150 }} />
          <input type="text" value={notesDraft} onChange={(e) => setNotesDraft(e.target.value)} placeholder="笔记" style={{ padding: 4, width: 200 }} />
          <button onClick={handleSaveMeta} style={{ fontSize: 12 }}>保存</button>
          <button onClick={handleToggleReviewed} style={{ fontSize: 12 }}>{selected.reviewed ? "标记未复盘" : "标记已复盘"}</button>
          <button onClick={() => onReviewGame(selected.id, selected.sgf)} style={{ fontSize: 12, fontWeight: "bold" }}>开始复盘</button>
          <button onClick={() => { if (confirm("删除？")) { ipc.deleteImportedGame(selected.id); setSelected(null); loadGames(); } }} style={{ fontSize: 12, color: "#cf1322" }}>删除</button>
        </div>
      )}
    </div>
  );
}
