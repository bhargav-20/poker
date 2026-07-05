import { useEffect, useState } from "react";
import type { PublicTableState } from "@poker/shared";
import { useGame } from "../store";

function useNow(active: boolean) {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [active]);
  return Date.now();
}

function fmt(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

export function BlindClock({ state }: { state: PublicTableState }) {
  const now = useNow(state.mode === "tournament");
  if (state.mode !== "tournament" || state.phase === "lobby") return null;

  const t = state.tournament;
  const remaining = state.nextBlindAt ? state.nextBlindAt - now : null;

  return (
    <div className="pointer-events-none absolute left-1/2 top-16 z-20 -translate-x-1/2">
      <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/50 px-4 py-2 text-sm backdrop-blur-xl">
        <span className="font-bold text-emerald-300">Lvl {state.level + 1}</span>
        <span className="text-white/40">|</span>
        <span className="text-white/80">
          Blinds <b className="text-white">{state.blinds.current.sb}/{state.blinds.current.bb}</b>
          {state.ante > 0 && (
            <>
              {" "}
              · ante <b className="text-white">{state.ante}</b>
            </>
          )}
        </span>
        {remaining !== null && (
          <>
            <span className="text-white/40">|</span>
            <span className="tabular-nums text-amber-300">⏱ {fmt(remaining)}</span>
            {state.blinds.next && (
              <span className="text-white/40">
                → {state.blinds.next.sb}/{state.blinds.next.bb}
              </span>
            )}
          </>
        )}
        {t && (
          <>
            <span className="text-white/40">|</span>
            <span className="text-white/80">
              <b className="text-white">{t.playersLeft}</b>/{t.totalPlayers} left
            </span>
          </>
        )}
        {t && t.prizePool > 0 && (
          <>
            <span className="text-white/40">|</span>
            <span className="text-amber-300">
              Pool <b>{t.prizePool}</b>
            </span>
          </>
        )}
      </div>
    </div>
  );
}

export function Standings({ state }: { state: PublicTableState }) {
  const leave = useGame((s) => s.leave);
  const t = state.tournament;
  if (!t?.isComplete) return null;

  const nameOf = (id: string) => state.players.find((p) => p.id === id)?.name ?? "—";
  const medal = ["🥇", "🥈", "🥉"];

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-2xl border border-amber-400/30 bg-gradient-to-b from-[#12160f] to-[#0a0d08] p-6 shadow-2xl">
        <div className="mb-1 text-center text-sm uppercase tracking-widest text-amber-300/70">
          Tournament complete
        </div>
        <div className="mb-5 text-center text-2xl font-black text-amber-300">
          🏆 {nameOf(t.winnerId ?? "")} wins!
        </div>
        <div className="space-y-1.5">
          {t.placements.map((pl) => (
            <div
              key={pl.playerId}
              className={`flex items-center justify-between rounded-lg px-3 py-2 ${
                pl.place === 1 ? "bg-amber-400/15" : "bg-white/5"
              }`}
            >
              <span className="flex items-center gap-2 text-white/90">
                <span className="w-6 text-center">{medal[pl.place - 1] ?? pl.place}</span>
                {nameOf(pl.playerId)}
              </span>
              <span className="flex items-center gap-2 text-xs">
                <span className="text-white/40">
                  {pl.place === 1 ? "Champion" : `${ordinal(pl.place)}`}
                </span>
                {pl.prize > 0 && (
                  <span className="font-mono font-bold tabular-nums text-amber-300">
                    +{pl.prize}
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

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]!);
}
