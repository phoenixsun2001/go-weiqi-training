import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";

interface Props {
  winrates: number[]; // 每手黑方胜率 0..1
  currentIndex: number | null;
  onJump: (index: number) => void;
}

export default function WinRateChart({ winrates, currentIndex, onJump }: Props) {
  if (winrates.length === 0) {
    return <div style={{ color: "#999", padding: 8 }}>暂无胜率数据</div>;
  }
  const data = winrates.map((wr, i) => ({ idx: i, wr: wr * 100 }));
  return (
    <div
      style={{ height: 180, cursor: "pointer" }}
      onClick={(e) => {
        const target = e.currentTarget.getBoundingClientRect();
        const ratio = (e.clientX - target.left) / target.width;
        const idx = Math.round(ratio * (winrates.length - 1));
        if (idx >= 0 && idx < winrates.length) onJump(idx);
      }}
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
          <XAxis dataKey="idx" domain={[0, Math.max(0, winrates.length - 1)]} />
          <YAxis domain={[0, 100]} />
          <Tooltip formatter={(v: number) => `${v.toFixed(1)}%`} />
          <ReferenceLine y={50} stroke="#999" strokeDasharray="3 3" />
          <Line type="monotone" dataKey="wr" stroke="#333" strokeWidth={2} dot={false} />
          {currentIndex !== null && <ReferenceLine x={currentIndex} stroke="red" />}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
