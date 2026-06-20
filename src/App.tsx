import { useState } from "react";
import GameView from "./views/GameView";
import ReviewView from "./views/ReviewView";
import ProblemView from "./views/ProblemView";
import GuessView from "./views/GuessView";

type Tab = "game" | "review" | "problem" | "guess";

export default function App() {
  const [tab, setTab] = useState<Tab>("game");
  return (
    <div style={{ fontFamily: "sans-serif" }}>
      <header
        style={{
          padding: 12,
          borderBottom: "1px solid #ddd",
          display: "flex",
          justifyContent: "space-between",
        }}
      >
        <strong>围棋棋力训练</strong>
        <nav style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button onClick={() => setTab("game")} style={tabBtn(tab === "game")}>
            对战
          </button>
          <button onClick={() => setTab("review")} style={tabBtn(tab === "review")}>
            复盘
          </button>
          <button onClick={() => setTab("problem")} style={tabBtn(tab === "problem")}>
            题库
          </button>
          <button onClick={() => setTab("guess")} style={tabBtn(tab === "guess")}>
            猜棋
          </button>
        </nav>
      </header>
      {tab === "game" ? (
        <GameView />
      ) : tab === "review" ? (
        <ReviewView />
      ) : tab === "problem" ? (
        <ProblemView />
      ) : (
        <GuessView />
      )}
    </div>
  );
}

function tabBtn(active: boolean): React.CSSProperties {
  return {
    border: "none",
    background: active ? "#333" : "transparent",
    color: active ? "#fff" : "#333",
    padding: "6px 12px",
    cursor: "pointer",
    borderRadius: 4,
  };
}
