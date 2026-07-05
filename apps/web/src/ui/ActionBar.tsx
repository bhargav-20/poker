import { useEffect, useMemo, useState } from "react";
import { useGame } from "../store";
import { useOrientation } from "./useOrientation";

export function ActionBar() {
  const legal = useGame((s) => s.legal);
  const act = useGame((s) => s.act);
  const state = useGame((s) => s.state);
  const playerId = useGame((s) => s.playerId);
  const orientation = useOrientation();
  const [raiseTo, setRaiseTo] = useState(0);

  const min = legal?.minRaiseTo ?? 0;
  const max = legal?.maxRaiseTo ?? 0;

  useEffect(() => {
    if (legal) setRaiseTo(clamp(min, min, max));
  }, [legal, min, max]);

  // Pot-relative bet presets (approximate; play money).
  const presets = useMemo(() => {
    if (!legal) return [];
    const me = state?.players.find((p) => p.id === playerId);
    const toMatch = (me?.bet ?? 0) + legal.callAmount;
    const pot = state?.totalPot ?? 0;
    const out: { label: string; value: number }[] = [
      { label: "Min", value: min },
      { label: "½ Pot", value: clamp(toMatch + Math.round(pot * 0.5), min, max) },
      { label: "Pot", value: clamp(toMatch + pot, min, max) },
      { label: "All-in", value: max },
    ];
    // De-dupe collapsed values (e.g. short stacks where every preset is all-in).
    return out.filter((p, i) => out.findIndex((q) => q.value === p.value) === i);
  }, [legal, state, playerId, min, max]);

  if (!legal) return null;

  const canSlider = (legal.canBet || legal.canRaise) && max > min;
  const isAllInRaise = raiseTo >= max;
  const raiseVerb = legal.canBet ? "Bet" : "Raise";
  const pct = max > min ? ((raiseTo - min) / (max - min)) * 100 : 0;

  const wrapClass =
    orientation === "landscape"
      ? "pointer-events-auto absolute bottom-2 right-2 z-30 w-[340px] max-w-[45vw]"
      : "pointer-events-auto absolute inset-x-0 bottom-0 z-30 mx-auto w-full max-w-xl px-2 pb-2";

  return (
    <div className={wrapClass}>
      <div className="rounded-2xl border border-white/10 bg-black/60 p-2.5 shadow-2xl backdrop-blur-xl">
        {canSlider && (
          <>
            <div className="mb-2 flex items-center gap-2">
              <div className="flex flex-1 gap-1.5">
                {presets.map((p) => (
                  <button
                    key={p.label}
                    onClick={() => setRaiseTo(p.value)}
                    className={`flex-1 rounded-lg py-1.5 text-[11px] font-bold tabular-nums transition ${
                      raiseTo === p.value
                        ? "bg-emerald-400 text-emerald-950"
                        : "bg-white/8 text-white/70 hover:bg-white/15"
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <span className="w-14 text-right font-mono text-sm font-extrabold tabular-nums text-emerald-300">
                {raiseTo}
              </span>
            </div>
            <input
              type="range"
              min={min}
              max={max}
              step={state?.bigBlind ?? 10}
              value={raiseTo}
              onChange={(e) => setRaiseTo(Number(e.target.value))}
              aria-label="Bet amount"
              className="mb-2.5 h-1.5 w-full cursor-pointer appearance-none rounded-full accent-emerald-400"
              style={{
                background: `linear-gradient(90deg, #4fd6a6 ${pct}%, rgba(255,255,255,.14) ${pct}%)`,
              }}
            />
          </>
        )}

        <div className="flex gap-1.5">
          <button
            onClick={() => act("fold")}
            disabled={!legal.canFold}
            className="flex-[0.64] rounded-xl bg-gradient-to-b from-[#8f3040] to-[#6d1f2c] py-3 text-sm font-extrabold text-white transition enabled:active:brightness-90 disabled:opacity-30"
          >
            Fold
          </button>

          {legal.canCheck ? (
            <button
              onClick={() => act("check")}
              className="flex-1 rounded-xl bg-gradient-to-b from-slate-500 to-slate-600 py-3 text-sm font-extrabold text-white transition active:brightness-90"
            >
              Check
            </button>
          ) : (
            <button
              onClick={() => act("call")}
              disabled={!legal.canCall}
              className="flex-1 rounded-xl bg-gradient-to-b from-[#2f8f66] to-[#1f6f4d] py-3 text-sm font-extrabold text-white transition enabled:active:brightness-90 disabled:opacity-30"
            >
              Call <span className="font-mono tabular-nums opacity-85">{legal.callAmount}</span>
            </button>
          )}

          {canSlider ? (
            <button
              onClick={() => act(legal.canBet ? "bet" : "raise", raiseTo)}
              className="flex-[1.15] rounded-xl bg-gradient-to-b from-[#f4cd62] to-[#e0a92f] py-3 text-sm font-extrabold text-[#3a2c07] transition active:brightness-95"
            >
              {isAllInRaise ? (
                "All-in"
              ) : (
                <>
                  {raiseVerb} <span className="font-mono tabular-nums opacity-80">{raiseTo}</span>
                </>
              )}
            </button>
          ) : (
            <button
              onClick={() => act("allin", max)}
              className="flex-[1.15] rounded-xl bg-gradient-to-b from-[#f4cd62] to-[#e0a92f] py-3 text-sm font-extrabold text-[#3a2c07] transition active:brightness-95"
            >
              All-in
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
