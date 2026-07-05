import { useState } from "react";
import { useGame } from "../store";

/** Cash-game rebuy + sit-out controls, plus the host's rebuy-approval panel. */
export function CashControls() {
  const state = useGame((s) => s.state);
  const playerId = useGame((s) => s.playerId);
  const requestRebuy = useGame((s) => s.requestRebuy);
  const rebuyDecision = useGame((s) => s.rebuyDecision);
  const sitOut = useGame((s) => s.sitOut);
  const sitIn = useGame((s) => s.sitIn);

  const me = state?.players.find((p) => p.id === playerId);
  const maxTopUp = Math.max(0, (state?.maxBuyIn ?? 0) - (me?.stack ?? 0));
  const [amount, setAmount] = useState(0);

  if (!state || state.mode !== "cash" || !me) return null;

  const isHost = state.hostId === playerId;
  const busted = me.stack <= 0;
  const myPending = state.pendingRebuys.some((r) => r.playerId === playerId);
  const rebuyAmt = amount > 0 ? amount : maxTopUp;

  return (
    <>
      {/* Host: pending rebuy approvals */}
      {isHost && state.pendingRebuys.length > 0 && (
        <div className="pointer-events-auto absolute left-1/2 top-14 z-30 w-[300px] max-w-[92vw] -translate-x-1/2">
          <div className="rounded-xl border border-amber-400/30 bg-black/70 p-2.5 backdrop-blur-xl">
            <p className="mb-2 text-center text-[11px] font-bold uppercase tracking-wide text-amber-300/80">
              Rebuy requests
            </p>
            <div className="space-y-1.5">
              {state.pendingRebuys.map((r) => (
                <div key={r.playerId} className="flex items-center gap-2">
                  <span className="flex-1 truncate text-sm text-white">
                    {r.name} <span className="font-mono text-amber-300">+{r.amount}</span>
                  </span>
                  <button
                    onClick={() => rebuyDecision(r.playerId, true)}
                    className="rounded-md bg-emerald-500 px-2.5 py-1 text-xs font-bold text-emerald-950"
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => rebuyDecision(r.playerId, false)}
                    className="rounded-md bg-white/10 px-2.5 py-1 text-xs font-bold text-white/70"
                  >
                    Deny
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Sit-out toggle (has chips, in a running game) */}
      {!busted && state.phase !== "lobby" && (
        <button
          onClick={() => (me.sittingOut ? sitIn() : sitOut())}
          className="pointer-events-auto absolute right-2 top-14 z-20 rounded-lg bg-black/45 px-2.5 py-1.5 text-xs font-semibold text-white/80 backdrop-blur active:bg-black/60"
        >
          {me.sittingOut ? "Sit in" : "Sit out"}
        </button>
      )}

      {/* Busted / sitting-out panel (occupies the action-bar zone) */}
      {(busted || me.sittingOut) && (
        <div className="pointer-events-auto absolute inset-x-0 bottom-0 z-30 mx-auto w-full max-w-md px-3 pb-3">
          <div className="rounded-2xl border border-white/10 bg-black/65 p-3 text-center shadow-2xl backdrop-blur-xl">
            {myPending ? (
              <p className="py-2 text-sm text-amber-300">Rebuy requested — waiting for host…</p>
            ) : (
              <>
                <p className="mb-2 text-sm font-semibold text-white">
                  {busted ? "Out of chips" : "Sitting out"}
                </p>
                {maxTopUp > 0 && (
                  <div className="mb-2 flex items-center gap-2">
                    <input
                      type="number"
                      min={0}
                      max={maxTopUp}
                      value={rebuyAmt}
                      onChange={(e) =>
                        setAmount(Math.max(0, Math.min(maxTopUp, Number(e.target.value))))
                      }
                      className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-center font-mono text-white outline-none focus:border-emerald-400/60"
                    />
                    <span className="whitespace-nowrap text-[11px] text-white/40">/ {state.maxBuyIn}</span>
                  </div>
                )}
                <div className="flex gap-2">
                  {maxTopUp > 0 && (
                    <button
                      onClick={() => requestRebuy(rebuyAmt)}
                      className="flex-1 rounded-xl bg-gradient-to-b from-emerald-400 to-emerald-600 py-2.5 text-sm font-extrabold text-emerald-950"
                    >
                      Request rebuy
                    </button>
                  )}
                  {me.sittingOut && !busted && (
                    <button
                      onClick={() => sitIn()}
                      className="flex-1 rounded-xl bg-white/10 py-2.5 text-sm font-bold text-white"
                    >
                      Sit back in
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
