import { useCallback, useEffect, useState } from "react";
import { api, type SyncConfigDto, type SyncLogDto } from "../lib/api";

/** 野狐定时同步面板：配置 + 立即同步 + 运行日志 */
export default function SyncPanel({ onImported }: { onImported?: () => void }) {
  const [config, setConfig] = useState<SyncConfigDto | null>(null);
  const [lastRun, setLastRun] = useState<SyncLogDto | null>(null);
  const [logs, setLogs] = useState<SyncLogDto[]>([]);
  const [nickname, setNickname] = useState("");
  const [intervalHours, setIntervalHours] = useState(24);
  const [limitCount, setLimitCount] = useState(30);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const loadState = useCallback(async () => {
    try {
      const info = await api.getSyncConfig();
      setConfig(info.config);
      setLastRun(info.last_run);
      setNickname(info.config.nickname || "");
      setIntervalHours(info.config.interval_hours || 24);
      setLimitCount(info.config.limit_count || 30);
      setLogs(await api.getSyncLogs());
    } catch (e) {
      setMsg(`加载失败：${e}`);
    }
  }, []);

  useEffect(() => { loadState(); }, [loadState]);

  const handleSave = async () => {
    setSaving(true);
    setMsg(null);
    try {
      const r = await api.setSyncConfig({
        enabled: true,
        nickname: nickname.trim() || undefined,
        interval_hours: intervalHours,
        limit_count: limitCount,
      });
      setConfig(r.config);
      setMsg("已保存，调度器将按周期自动同步");
    } catch (e) {
      setMsg(`保存失败：${e}`);
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async () => {
    if (!config) return;
    try {
      const r = await api.setSyncConfig({ enabled: !config.enabled });
      setConfig(r.config);
    } catch (e) {
      setMsg(`操作失败：${e}`);
    }
  };

  const handleRunNow = async () => {
    setRunning(true);
    setMsg("正在从野狐拉取新棋谱并自动补算 AI 复盘…");
    try {
      const r = await api.runFoxwqSync();
      if (r.ok) {
        setMsg(`同步完成：新增 ${r.imported} 局，已存在 ${r.skipped} 局，失败 ${r.failed}` +
          (r.ai_backfill ? `；AI复盘补算 ${r.ai_backfill} 局` : ""));
        onImported?.();
      } else {
        setMsg(`同步失败：${r.message}`);
      }
      await loadState();
    } catch (e) {
      setMsg(`同步失败：${e}`);
    } finally {
      setRunning(false);
    }
  };

  const statusColor: Record<string, string> = {
    success: "#389e0d", empty: "#faad14", failed: "#cf1322", running: "#1890ff",
  };

  return (
    <div style={{ border: "1px solid #b7eb8f", borderRadius: 6, padding: 12, background: "#f6ffed", display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
        <label style={{ fontSize: 13 }}>
          昵称
          <input type="text" value={nickname} onChange={(e) => setNickname(e.target.value)}
            placeholder="如 JadenSai" style={{ display: "block", padding: 4, width: 120 }} />
        </label>
        <label style={{ fontSize: 13 }}>
          同步周期
          <select value={intervalHours} onChange={(e) => setIntervalHours(Number(e.target.value))}
            style={{ display: "block", padding: 4 }}>
            {[6, 12, 24, 72, 168].map((h) => (
              <option key={h} value={h}>{h >= 24 && h % 24 === 0 ? `${h / 24} 天` : `${h} 小时`}</option>
            ))}
          </select>
        </label>
        <label style={{ fontSize: 13 }}>
          每次上限
          <input type="number" value={limitCount} min={1} max={100}
            onChange={(e) => setLimitCount(Number(e.target.value))}
            style={{ display: "block", padding: 4, width: 60 }} />
        </label>
        <button onClick={handleSave} disabled={saving} style={{ padding: "6px 12px" }}>
          {saving ? "保存中…" : "保存配置"}
        </button>
        <button onClick={handleRunNow} disabled={running}
          style={{ padding: "6px 16px", fontWeight: "bold", background: "#52c41a", color: "#fff", border: "none", borderRadius: 4 }}>
          {running ? "同步中…" : "⚡ 立即同步"}
        </button>
        <button onClick={handleToggle} disabled={!config} style={{ padding: "6px 12px" }}>
          {config?.enabled ? "⏸ 停用定时" : "▶ 启用定时"}
        </button>
        {msg && <span style={{ fontSize: 13, alignSelf: "center" }}>{msg}</span>}
      </div>

      <div style={{ fontSize: 12, color: "#555", display: "flex", gap: 16, flexWrap: "wrap" }}>
        <span>
          状态：
          {config?.enabled
            ? <strong style={{ color: "#389e0d" }}>定时启用（每 {config.interval_hours} 小时）</strong>
            : <span>定时未启用（可手动点"立即同步"）</span>}
        </span>
        {lastRun?.finished_at && (
          <span>
            上次运行：<span style={{ color: statusColor[lastRun.status] || "#666" }}>
              [{lastRun.status}]
            </span>{" "}
            {lastRun.message}（{lastRun.trigger_type === "auto" ? "定时" : "手动"}）
          </span>
        )}
      </div>

      {logs.length > 0 && (
        <details style={{ fontSize: 12 }}>
          <summary style={{ cursor: "pointer", color: "#888" }}>同步历史（{logs.length} 条）</summary>
          <table style={{ marginTop: 6, borderCollapse: "collapse", width: "100%" }}>
            <thead>
              <tr style={{ color: "#999", textAlign: "left" }}>
                <th style={{ padding: "2px 8px" }}>时间</th><th style={{ padding: "2px 8px" }}>方式</th>
                <th style={{ padding: "2px 8px" }}>状态</th><th style={{ padding: "2px 8px" }}>结果</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((l) => (
                <tr key={l.id}>
                  <td style={{ padding: "2px 8px", whiteSpace: "nowrap" }}>{(l.finished_at || l.started_at).slice(0, 16).replace("T", " ")}</td>
                  <td style={{ padding: "2px 8px" }}>{l.trigger_type === "auto" ? "⏱" : "👆"}</td>
                  <td style={{ padding: "2px 8px", color: statusColor[l.status] || "#666" }}>{l.status}</td>
                  <td style={{ padding: "2px 8px" }}>{l.message || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}
    </div>
  );
}
