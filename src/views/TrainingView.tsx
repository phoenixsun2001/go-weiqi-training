import { useEffect, useState, useCallback, useMemo } from "react";
import { api, TrainingMatchDto } from "../lib/api";

interface Task {
  id: number; week: number; day: number; category: string;
  title: string; description: string; target_module: string;
  difficulty: number; status: string; sort_order: number;
}

interface Progress {
  total: number; done: number; skipped: number; pending: number;
  completion_rate: number;
  weeks: Record<number, { total: number; done: number; pending: number }>;
}

interface WeaknessSummary {
  total_games: number;
  phase_scores: Record<string, number>;
  weaknesses: { issue: string; count: number; percentage: number }[];
}

interface JosekiItem {
  name: string; category: string; difficulty: number; explanation: string;
}

interface Props {
  onNavigate: (tab: string) => void;
  onReviewGame: (gameId: number, sgf: string) => void;
  onNavigateJoseki: (josekiName: string) => void;
  onNavigateProblem: (difficulty: number) => void;
}

const CATEGORY_COLORS: Record<string, string> = {
  "布局": "#1890ff", "序盘": "#722ed1", "中盘": "#fa8c16", "综合": "#52c41a", "官子": "#eb2f96", "死活": "#13c2c2", "定式": "#2f54eb",
};

const MODULE_LABELS: Record<string, string> = {
  problem: "题库", joseki: "定式", review: "复盘", practice: "实战",
};

export default function TrainingView({ onNavigate, onReviewGame, onNavigateJoseki, onNavigateProblem }: Props) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [weakness, setWeakness] = useState<WeaknessSummary | null>(null);
  const [matches, setMatches] = useState<Record<number, TrainingMatchDto[]>>({});
  const [concepts, setConcepts] = useState<Record<string, JosekiItem[]>>({});
  const [josekiNames, setJosekiNames] = useState<string[]>([]);
  const [games, setGames] = useState<{ id: number; sgf: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeWeek, setActiveWeek] = useState(1);
  const [hasPlan, setHasPlan] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [taskList, prog, weak, m, c, j, g] = await Promise.all([
        api.getTrainingTasks(),
        api.getTrainingProgress(),
        api.getTrainingWeakness(),
        api.getTrainingMatches(),
        api.getJosekiConcepts(),
        api.getJoseki(),
        api.listImportedGames(),
      ]);
      setTasks(taskList);
      setProgress(prog);
      setWeakness(weak);
      setMatches(m);
      setConcepts(c);
      setJosekiNames((j.joseki ?? []).map((x: { name: string }) => x.name));
      setGames(g);
      setHasPlan(taskList.length > 0);
    } catch {
      // ignore
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // 每个定式类任务的相关定式：概念匹配（任务文案提到的棋理概念）+ 名称模糊匹配
  const relatedJoseki = useMemo(() => {
    const map: Record<number, JosekiItem[]> = {};
    for (const t of tasks) {
      if (t.target_module !== "joseki") continue;
      const text = t.title + t.description;
      const found: JosekiItem[] = [];
      // 1. 概念匹配：任务文案包含概念名
      for (const [concept, items] of Object.entries(concepts)) {
        if (text.includes(concept)) {
          for (const it of items) {
            if (!found.some((f) => f.name === it.name)) found.push(it);
          }
        }
      }
      // 2. 名称匹配：任务文案包含定式名（含简称）
      for (const name of josekiNames) {
        const short = name.replace(/[（(].*?[）)]/g, "");
        if (text.includes(short) || text.includes(name)) {
          if (!found.some((f) => f.name === name)) found.push({ name, category: "", difficulty: 0, explanation: "" });
        }
      }
      map[t.id] = found.slice(0, 4);
    }
    return map;
  }, [tasks, concepts, josekiNames]);

  const handleGenerate = async () => {
    setLoading(true);
    try {
      await api.generateTrainingPlan();
      await loadData();
    } catch {
      setLoading(false);
    }
  };

  const handleStatusChange = async (taskId: number, status: string) => {
    await api.updateTrainingTaskStatus(taskId, status);
    await loadData();
  };

  const weekTasks = tasks.filter((t) => t.week === activeWeek);
  const weeks = [1, 2, 3, 4];
  const weekTitles = ["", "第1周：布局革命", "第2周：序盘过渡", "第3周：中盘减浮棋", "第4周：综合提升"];

  return (
    <div style={{ padding: 16, maxWidth: 900, margin: "0 auto" }}>
      <h2 style={{ margin: "0 0 12px" }}>🎯 专项强化计划</h2>

      {loading ? (
        <p style={{ color: "#999" }}>加载中…</p>
      ) : !hasPlan ? (
        <div style={{ textAlign: "center", padding: 40 }}>
          <p style={{ fontSize: 16, marginBottom: 16 }}>
            基于你的对局库（{weakness?.total_games || 0}局）AI复盘数据，<br />
            生成个性化4周训练计划（28个任务）
          </p>
          {weakness && weakness.phase_scores && (
            <div style={{ display: "flex", gap: 16, justifyContent: "center", marginBottom: 20 }}>
              {Object.entries(weakness.phase_scores).map(([phase, score]) => (
                <div key={phase} style={{
                  padding: "8px 16px", borderRadius: 8,
                  background: score >= 3 ? "#f6ffed" : score >= 2 ? "#fff7e6" : "#fff1f0",
                  border: `1px solid ${score >= 3 ? "#b7eb8f" : score >= 2 ? "#ffd591" : "#ffa39e"}`,
                }}>
                  <div style={{ fontSize: 12, color: "#666" }}>{phase}</div>
                  <div style={{ fontSize: 20, fontWeight: "bold", color: score >= 3 ? "#389e0d" : score >= 2 ? "#d4a017" : "#cf1322" }}>
                    {score}<span style={{ fontSize: 12, color: "#999" }}>/5</span>
                  </div>
                </div>
              ))}
            </div>
          )}
          <button onClick={handleGenerate} style={{ padding: "10px 24px", fontSize: 16, fontWeight: "bold", cursor: "pointer" }}>
            生成训练计划
          </button>
        </div>
      ) : (
        <>
          {/* 弱点摘要 */}
          {weakness && weakness.phase_scores && (
            <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
              {Object.entries(weakness.phase_scores).map(([phase, score]) => (
                <div key={phase} style={{
                  flex: 1, padding: "8px 12px", borderRadius: 8,
                  background: score >= 3 ? "#f6ffed" : score >= 2 ? "#fff7e6" : "#fff1f0",
                  border: `1px solid ${score >= 3 ? "#b7eb8f" : score >= 2 ? "#ffd591" : "#ffa39e"}`,
                  textAlign: "center",
                }}>
                  <div style={{ fontSize: 11, color: "#666" }}>{phase}</div>
                  <div style={{ fontSize: 18, fontWeight: "bold", color: score >= 3 ? "#389e0d" : score >= 2 ? "#d4a017" : "#cf1322" }}>
                    {score}/5
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* 进度条 */}
          {progress && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ fontSize: 13 }}>总体进度</span>
                <span style={{ fontSize: 13, fontWeight: "bold" }}>
                  {progress.done}/{progress.total} ({progress.completion_rate}%)
                </span>
              </div>
              <div style={{ height: 20, background: "#f0f0f0", borderRadius: 10, overflow: "hidden" }}>
                <div style={{
                  width: `${progress.completion_rate}%`, height: "100%",
                  background: "linear-gradient(90deg, #1890ff, #52c41a)", borderRadius: 10,
                  transition: "width 0.3s",
                }} />
              </div>
            </div>
          )}

          {/* 周选择 */}
          <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
            {weeks.map((w) => {
              const wp = progress?.weeks?.[w];
              const wDone = wp?.done || 0;
              const wTotal = wp?.total || 7;
              return (
                <button
                  key={w}
                  onClick={() => setActiveWeek(w)}
                  style={{
                    flex: 1, padding: "6px 8px", fontSize: 12, cursor: "pointer",
                    borderRadius: 6, border: `1px solid ${activeWeek === w ? "#1890ff" : "#d9d9d9"}`,
                    background: activeWeek === w ? "#1890ff" : "#fff",
                    color: activeWeek === w ? "#fff" : "#333",
                  }}
                >
                  第{w}周<br />
                  <span style={{ fontSize: 10 }}>{wDone}/{wTotal}</span>
                </button>
              );
            })}
          </div>

          {/* 周标题 */}
          <h3 style={{ margin: "0 0 8px", fontSize: 15 }}>{weekTitles[activeWeek]}</h3>

          {/* 任务列表 */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {weekTasks.map((t) => {
              const isDone = t.status === "done";
              const isSkipped = t.status === "skipped";
              const catColor = CATEGORY_COLORS[t.category] || "#666";
              const taskMatches = matches[t.id] ?? [];
              const taskJoseki = relatedJoseki[t.id] ?? [];
              return (
                <div
                  key={t.id}
                  style={{
                    padding: 12, borderRadius: 8, border: `1px solid ${isDone ? "#b7eb8f" : isSkipped ? "#d9d9d9" : "#e8e8e8"}`,
                    background: isDone ? "#f6ffed" : isSkipped ? "#fafafa" : "#fff",
                    opacity: isSkipped ? 0.6 : 1,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                        <span style={{ fontSize: 12, color: "#999" }}>第{t.day}天</span>
                        <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 8, background: catColor, color: "#fff" }}>
                          {t.category}
                        </span>
                        <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 8, background: "#f0f0f0", color: "#666" }}>
                          {MODULE_LABELS[t.target_module] || t.target_module}
                        </span>
                        {isDone && <span style={{ color: "#389e0d" }}>✅</span>}
                      </div>
                      <div style={{ fontWeight: "bold", fontSize: 14, marginBottom: 4, textDecoration: isDone ? "line-through" : "none" }}>
                        {t.title}
                      </div>
                      <div style={{ fontSize: 12, color: "#666", lineHeight: 1.5 }}>{t.description}</div>
                    </div>
                  </div>

                  {/* 复盘任务：匹配的典型对局 */}
                  {t.target_module === "review" && taskMatches.length > 0 && !isDone && (
                    <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
                      <div style={{ fontSize: 11, color: "#999" }}>已为你匹配典型对局（点击直接复盘）：</div>
                      {taskMatches.map((m) => {
                        const game = games.find((g) => g.id === m.game_id);
                        return (
                          <button
                            key={m.game_id}
                            onClick={() => onReviewGame(m.game_id, game?.sgf ?? "")}
                            style={{
                              textAlign: "left", fontSize: 12, padding: "5px 10px", border: "1px solid #d9d9d9",
                              borderRadius: 6, background: "#fafafa", cursor: "pointer", color: "#333",
                            }}
                          >
                            📅 {m.date || "?"} · vs {m.opponent}({m.opponent_rank || "?"}) · {m.result} ·{" "}
                            <span style={{ color: "#fa8c16" }}>{m.reason}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* 定式任务：相关定式 */}
                  {t.target_module === "joseki" && taskJoseki.length > 0 && !isDone && (
                    <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
                      <div style={{ fontSize: 11, color: "#999" }}>本任务相关的定式（点击直达学习）：</div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                        {taskJoseki.map((j) => (
                          <button
                            key={j.name}
                            onClick={() => onNavigateJoseki(j.name)}
                            style={{
                              fontSize: 11, padding: "4px 10px", border: "1px solid #2f54eb", color: "#2f54eb",
                              borderRadius: 12, cursor: "pointer", background: "#f0f5ff",
                            }}
                          >
                            {j.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 操作按钮 */}
                  <div style={{ display: "flex", gap: 6, marginTop: 8, justifyContent: "flex-end" }}>
                    {(t.target_module === "problem" || t.target_module === "joseki" || t.target_module === "review") && !isDone && (
                      <button
                        onClick={() =>
                          t.target_module === "problem"
                            ? onNavigateProblem(t.difficulty)
                            : t.target_module === "joseki"
                            ? onNavigate("joseki")
                            : onNavigate("review")
                        }
                        style={{ fontSize: 11, padding: "2px 8px", border: "1px solid #1890ff", color: "#1890ff", borderRadius: 4, cursor: "pointer" }}
                      >
                        去做 →
                      </button>
                    )}
                    {!isDone ? (
                      <button
                        onClick={() => handleStatusChange(t.id, "done")}
                        style={{ fontSize: 11, padding: "2px 8px", border: "1px solid #52c41a", color: "#52c41a", borderRadius: 4, cursor: "pointer" }}
                      >
                        ✓ 完成
                      </button>
                    ) : (
                      <button
                        onClick={() => handleStatusChange(t.id, "pending")}
                        style={{ fontSize: 11, padding: "2px 8px", border: "1px solid #d9d9d9", color: "#666", borderRadius: 4, cursor: "pointer" }}
                      >
                        撤销
                      </button>
                    )}
                    {!isSkipped && !isDone && (
                      <button
                        onClick={() => handleStatusChange(t.id, "skipped")}
                        style={{ fontSize: 11, padding: "2px 8px", border: "1px solid #d9d9d9", color: "#999", borderRadius: 4, cursor: "pointer" }}
                      >
                        跳过
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
