interface StatsBarProps {
  totalMatches: number;
  highCount: number;
  medCount: number;
  lowCount: number;
  youtubeSearched: number;
  youtubeSampled: number;
  frameCount: number;
  hasAudio: boolean;
  duration: number;
}

export default function StatsBar({
  totalMatches,
  highCount,
  medCount,
  lowCount,
  youtubeSearched,
  youtubeSampled,
  frameCount,
  hasAudio,
  duration,
}: StatsBarProps) {
  const stats = [
    {
      label: "Matches Found",
      value: totalMatches,
      color: "text-indigo-400",
      icon: "🎯",
    },
    {
      label: "High Risk",
      value: highCount,
      color: "text-red-400",
      icon: "🔴",
    },
    {
      label: "Medium Risk",
      value: medCount,
      color: "text-yellow-400",
      icon: "🟡",
    },
    {
      label: "Low Risk",
      value: lowCount,
      color: "text-green-400",
      icon: "🟢",
    },
    {
      label: "YT Videos Searched",
      value: youtubeSearched,
      color: "text-cyan-400",
      icon: "📺",
    },
    {
      label: "Frames Analyzed",
      value: frameCount,
      color: "text-purple-400",
      icon: "🖼",
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
      {stats.map((stat) => (
        <div
          key={stat.label}
          className="rounded-xl p-4 transition-all"
          style={{
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
          }}
        >
          <div
            className="text-xs mb-1 flex items-center gap-1"
            style={{ color: "var(--text-muted)" }}
          >
            <span>{stat.icon}</span> {stat.label}
          </div>
          <div className={`text-2xl font-bold ${stat.color}`}>
            {stat.value}
          </div>
        </div>
      ))}
    </div>
  );
}
