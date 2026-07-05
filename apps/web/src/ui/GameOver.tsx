import type { PublicTableState } from "@poker/shared";
import { useGame } from "../store";

const MEDAL = ["🥇", "🥈", "🥉"];

/** Final money leaderboard shown when the host ends the game. */
export function GameOver({ state }: { state: PublicTableState }) {
  const leave = useGame((s) => s.leave);
  if (state.phase !== "ended") return null;
  if (state.tournament?.isComplete) return null; // tournament shows its own standings

  const isCash = state.mode === "cash";
  const ranked = [...state.players].sort((a, b) => b.stack - a.stack);

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-2xl border border-emerald-400/30 bg-gradient-to-b from-[#0e1a14] to-[#080d0a] p-6 shadow-2xl">
        <div className="mb-1 text-center text-sm uppercase tracking-widest text-emerald-300/70">
          Game over
        </div>
        <div className="mb-5 text-center text-2xl font-black text-emerald-300">
          Final leaderboard
        </div>
        <div className="space-y-1.5">
          {ranked.map((p, i) => (
            <div
              key={p.id}
              className={`flex items-center justify-between gap-3 rounded-lg px-3 py-2.5 ${
                i === 0 ? "bg-emerald-400/15" : "bg-white/5"
              }`}
            >
              <span className="flex min-w-0 items-center gap-2 text-white/90">
                <span className="w-6 shrink-0 text-center">{MEDAL[i] ?? i + 1}</span>
                <span className="truncate">{p.name}</span>
              </span>
              <span className="flex shrink-0 items-baseline gap-2">
                <span className="font-mono font-bold tabular-nums text-amber-300">{p.stack}</span>
                {isCash && (
                  <span
                    className={`font-mono text-xs tabular-nums ${
                      p.net > 0 ? "text-emerald-400" : p.net < 0 ? "text-rose-400" : "text-white/40"
                    }`}
                  >
                    {p.net > 0 ? `+${p.net}` : p.net}
                  </span>
                )}
              </span>
            </div>
          ))}
        </div>
        <button
          onClick={leave}
          className="mt-6 w-full rounded-xl bg-gradient-to-r from-emerald-400 to-teal-500 py-3 font-bold text-emerald-950 hover:brightness-110"
        >
          Back to lobby
        </button>
      </div>
    </div>
  );
}
