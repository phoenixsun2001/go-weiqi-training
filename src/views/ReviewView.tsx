import { useState } from "react";
import Board from "../components/Board";
import WinRateChart from "./WinRateChart";
import type { BoardSnapshot } from "../types";

// MVP 阶段：复盘界面支持浏览胜率曲线占位。
// 真实 KataGo 胜率数据通过 review_pipeline（后端）在引擎就绪后注入。
export default function ReviewView() {
  const [winrates, setWinrates] = useState<number[]>([0.5, 0.52, 0.48, 0.55, 0.53]);
  const [current, setCurrent] = useState<number | null>(null);
  const [snapshot] = useState<BoardSnapshot>({
    size: 9,
    stones: Array(81).fill(null),
    turn: "black",
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: 16 }}>
      <h2>AI 复盘分析</h2>
      <div style={{ display: "flex", gap: 24 }}>
        <Board snapshot={snapshot} interactive={false} size={480} />
        <div style={{ flex: 1 }}>
          <h3>胜率曲线</h3>
          <WinRateChart winrates={winrates} currentIndex={current} onJump={setCurrent} />
          <p style={{ fontSize: 12, color: "#666", marginTop: 12 }}>
            导入 SGF 棋谱后，KataGo 将逐手分析并填充真实胜率。失误手（胜率损失 &gt; 3%）会标红。
          </p>
          <button onClick={() => setWinrates([...winrates, 0.5])}>模拟添加一手</button>
        </div>
      </div>
    </div>
  );
}
