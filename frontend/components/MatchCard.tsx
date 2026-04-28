interface MatchResult {
  title: string;
  thumbnail: string;
  url: string;
  channel: string;
  youtube_id: string;
  confidence: number;
  confidence_label: string;
  visual_similarity: number;
  audio_similarity: number;
  match_type: string;
  category: string;
}

export default function MatchCard({ match }: { match: MatchResult }) {
  const confColor =
    match.confidence >= 0.75
      ? "text-red-400"
      : match.confidence >= 0.5
      ? "text-yellow-400"
      : "text-green-400";

  const confBg =
    match.confidence >= 0.75
      ? "bg-red-500/15 border-red-500/30"
      : match.confidence >= 0.5
      ? "bg-yellow-500/15 border-yellow-500/30"
      : "bg-green-500/15 border-green-500/30";

  const barColor =
    match.confidence >= 0.75
      ? "bg-red-500"
      : match.confidence >= 0.5
      ? "bg-yellow-500"
      : "bg-green-500";

  const categoryColors: Record<string, string> = {
    Highlight: "bg-purple-500/15 text-purple-400 border-purple-500/30",
    Reaction: "bg-blue-500/15 text-blue-400 border-blue-500/30",
    News: "bg-cyan-500/15 text-cyan-400 border-cyan-500/30",
    Meme: "bg-pink-500/15 text-pink-400 border-pink-500/30",
    "Full Match": "bg-red-500/15 text-red-400 border-red-500/30",
    Clip: "bg-indigo-500/15 text-indigo-400 border-indigo-500/30",
    Other: "bg-gray-500/15 text-gray-400 border-gray-500/30",
  };

  return (
    <div
      className="rounded-2xl overflow-hidden transition-all duration-300 hover:shadow-lg hover:shadow-indigo-500/5 group"
      style={{
        background: "var(--bg-card)",
        border: "1px solid var(--border)",
      }}
    >
      {/* Thumbnail */}
      <div
        className="relative aspect-video overflow-hidden"
        style={{ background: "var(--bg-primary)" }}
      >
        {match.thumbnail ? (
          <img
            src={match.thumbnail}
            alt={match.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          />
        ) : (
          <div
            className="w-full h-full flex items-center justify-center"
            style={{ color: "var(--text-muted)" }}
          >
            No Thumbnail
          </div>
        )}

        {/* Confidence badge overlay */}
        <div className="absolute top-3 right-3">
          <span
            className={`px-2.5 py-1 rounded-lg text-xs font-bold border backdrop-blur-sm ${confBg} ${confColor}`}
          >
            {(match.confidence * 100).toFixed(0)}%
          </span>
        </div>

        {/* Category badge */}
        {match.category && (
          <div className="absolute top-3 left-3">
            <span
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold border backdrop-blur-sm ${
                categoryColors[match.category] || categoryColors.Other
              }`}
            >
              {match.category}
            </span>
          </div>
        )}

        {/* Match type badge */}
        <div className="absolute bottom-3 left-3">
          <span className="px-2.5 py-1 rounded-lg text-xs font-medium bg-black/60 text-white backdrop-blur-sm border border-white/10">
            {match.match_type}
          </span>
        </div>
      </div>

      {/* Content */}
      <div className="p-4">
        {/* Title */}
        <h3 className="font-semibold text-sm leading-snug mb-1 line-clamp-2 group-hover:text-indigo-300 transition-colors">
          {match.title}
        </h3>
        <p className="text-xs mb-4" style={{ color: "var(--text-muted)" }}>
          {match.channel}
        </p>

        {/* Similarity bars */}
        <div className="space-y-2.5 mb-4">
          <div>
            <div className="flex justify-between text-xs mb-1">
              <span style={{ color: "var(--text-muted)" }}>🖼 Visual Match</span>
              <span className="font-medium">
                {(match.visual_similarity * 100).toFixed(1)}%
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
              <div
                className={`h-full rounded-full ${barColor} transition-all duration-700`}
                style={{ width: `${match.visual_similarity * 100}%` }}
              />
            </div>
          </div>
          <div>
            <div className="flex justify-between text-xs mb-1">
              <span style={{ color: "var(--text-muted)" }}>🎵 Audio Match</span>
              <span className="font-medium">
                {(match.audio_similarity * 100).toFixed(1)}%
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
              <div
                className={`h-full rounded-full ${barColor} transition-all duration-700`}
                style={{ width: `${match.audio_similarity * 100}%` }}
              />
            </div>
          </div>
        </div>

        {/* YouTube link */}
        <a
          href={match.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-sm font-medium transition-all"
          style={{
            background: "var(--bg-elevated)",
            border: "1px solid var(--border)",
            color: "var(--text-secondary)",
          }}
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
            <path d="M23.5 6.2a3 3 0 00-2.1-2.1C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.4.6A3 3 0 00.5 6.2 31.5 31.5 0 000 12a31.5 31.5 0 00.5 5.8 3 3 0 002.1 2.1c1.9.6 9.4.6 9.4.6s7.5 0 9.4-.6a3 3 0 002.1-2.1c.4-1.9.5-5.8.5-5.8s0-3.9-.5-5.8zM9.5 15.5V8.5l6.3 3.5-6.3 3.5z" />
          </svg>
          View on YouTube
        </a>
      </div>
    </div>
  );
}
