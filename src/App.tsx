import { useState } from "react";
import GameView from "./views/GameView";
import ReviewView from "./views/ReviewView";
import ReviewHistoryView from "./views/ReviewHistoryView";
import ProblemView from "./views/ProblemView";
import JosekiView from "./views/JosekiView";
import LibraryView from "./views/LibraryView";
import TrainingView from "./views/TrainingView";

type Tab = "game" | "review" | "review-detail" | "library" | "problem" | "joseki" | "training";

interface PendingReview {
  gameId: number;
  sgf: string;
}

export default function App() {
  const [tab, setTab] = useState<Tab>("game");
  const [pendingReview, setPendingReview] = useState<PendingReview | null>(null);

  const handleReviewGame = (gameId: number, sgf: string) => {
    setPendingReview({ gameId, sgf });
    setTab("review-detail");
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
          <button onClick={() => setTab("review")} style={tabBtn(tab === "review" || tab === "review-detail")}>
            复盘
          </button>
          <button onClick={() => setTab("library")} style={tabBtn(tab === "library")}>
            对局库
          </button>
          <button onClick={() => setTab("problem")} style={tabBtn(tab === "problem")}>
            题库
          </button>
          <button onClick={() => setTab("joseki")} style={tabBtn(tab === "joseki")}>
            定式
          </button>
          <button onClick={() => setTab("training")} style={tabBtn(tab === "training")}>
            训练
          </button>
        </nav>
      </header>
      {tab === "game" ? (
        <GameView />
      ) : tab === "review" ? (
        <ReviewHistoryView onReviewGame={handleReviewGame} />
      ) : tab === "review-detail" ? (
        <>
          <div style={{ padding: "8px 16px", borderBottom: "1px solid #eee" }}>
            <button onClick={() => setTab("review")} style={{ fontSize: 13 }}>← 返回复盘列表</button>
          </div>
          <ReviewView pendingReview={pendingReview} onReviewed={() => setPendingReview(null)} />
        </>
      ) : tab === "library" ? (
        <LibraryView onReviewGame={handleReviewGame} />
      ) : tab === "problem" ? (
        <ProblemView />
      ) : tab === "training" ? (
        <TrainingView onNavigate={(t) => setTab(t as Tab)} />
      ) : (
        <JosekiView />
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
