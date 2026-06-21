import { useState } from "react";
import GameView from "./views/GameView";
import ReviewView from "./views/ReviewView";
import ProblemView from "./views/ProblemView";
import GuessView from "./views/GuessView";
import LibraryView from "./views/LibraryView";

type Tab = "game" | "review" | "library" | "problem" | "guess";

/** 从对局库传入复盘页的待分析对局 */
interface PendingReview {
  gameId: number;
  sgf: string;
}

export default function App() {
  const [tab, setTab] = useState<Tab>("game");
  const [pendingReview, setPendingReview] = useState<PendingReview | null>(null);

  const handleReviewGame = (gameId: number, sgf: string) => {
    setPendingReview({ gameId, sgf });
    setTab("review");
  };

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
          <button onClick={() => setTab("library")} style={tabBtn(tab === "library")}>
            对局库
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
        <ReviewView pendingReview={pendingReview} onReviewed={() => setPendingReview(null)} />
      ) : tab === "library" ? (
        <LibraryView onReviewGame={handleReviewGame} />
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
