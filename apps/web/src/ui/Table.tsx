import { useEffect, useRef, useState } from "react";
import { useGame } from "../store";
import { THEMES, DEFAULT_THEME } from "../themes";
import { PokerTable } from "../game/PokerTable";
import { ActionBar } from "./ActionBar";
import { BlindClock, Standings } from "./TournamentHud";
import { CashControls } from "./CashControls";
import { GameOver } from "./GameOver";
import { isMuted, toggleMuted } from "../sound";

export function Table() {
  const mountRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<PokerTable | null>(null);
  const [renderer, setRenderer] = useState<string>("…");
  const [themeId, setThemeId] = useState(DEFAULT_THEME);
  const [menuOpen, setMenuOpen] = useState(false);
  const [muted, setMuted] = useState(isMuted());

  const state = useGame((s) => s.state);
  const hole = useGame((s) => s.hole);
  const playerId = useGame((s) => s.playerId);
  const code = useGame((s) => s.code);
  const leave = useGame((s) => s.leave);
  const start = useGame((s) => s.start);
  const nextHand = useGame((s) => s.nextHand);
  const endGame = useGame((s) => s.endGame);
  const spectating = useGame((s) => s.spectating);
  const sitDown = useGame((s) => s.sitDown);

  // Init PixiJS once.
  useEffect(() => {
    let disposed = false;
    const table = new PokerTable();
    (async () => {
      if (!mountRef.current) return;
      await table.init(mountRef.current, THEMES[DEFAULT_THEME]!, playerId);
      if (disposed) {
        table.destroy();
        return;
      }
      tableRef.current = table;
      if (import.meta.env.DEV) (window as unknown as { __pt: PokerTable }).__pt = table;
      setRenderer(table.rendererType);
      const st = useGame.getState();
      if (st.state) table.render(st.state, st.hole);
    })();
    return () => {
      disposed = true;
      tableRef.current?.destroy();
      tableRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Push state into the renderer.
  useEffect(() => {
    if (state) tableRef.current?.render(state, hole);
  }, [state, hole]);

  useEffect(() => {
    tableRef.current?.setTheme(THEMES[themeId]!);
  }, [themeId]);

  const me = state?.players.find((p) => p.id === playerId);
  const isHost = state?.hostId === playerId;
  const canStart = (state?.players.length ?? 0) >= 2;
  const canSit =
    !!state &&
    state.players.length < 6 &&
    (state.mode === "cash" || state.phase === "lobby") &&
    state.phase !== "ended";
  const inLobby = state?.phase === "lobby";
  const handOver = state?.phase === "hand_over";
  const isTournament = state?.mode === "tournament";

  return (
    <div className="relative h-full w-full">
      <div ref={mountRef} className="absolute inset-0" />

      {/* Top bar */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-center justify-between gap-2 p-2">
        <button
          onClick={leave}
          aria-label="Leave table"
          className="pointer-events-auto grid h-9 w-9 place-items-center rounded-lg bg-black/45 text-lg text-white/80 backdrop-blur hover:bg-black/60"
        >
          ←
        </button>

        <button
          onClick={() => navigator.clipboard?.writeText(code ?? "")}
          className="pointer-events-auto flex items-center gap-1.5 rounded-lg bg-black/45 px-2.5 py-1.5 backdrop-blur active:bg-black/60"
        >
          <span className="text-[10px] uppercase tracking-wide text-white/45">Table</span>
          <span className="font-mono text-base font-bold tracking-[0.18em] text-emerald-300">{code}</span>
          <span className="text-xs text-white/40">⧉</span>
        </button>

        <div className="pointer-events-auto relative flex items-center gap-1.5">
          <button
            onClick={() => setMuted(toggleMuted())}
            aria-label={muted ? "Unmute" : "Mute"}
            className="grid h-9 w-9 place-items-center rounded-lg bg-black/45 text-base backdrop-blur active:bg-black/60"
          >
            {muted ? "🔇" : "🔊"}
          </button>
          <button
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="Menu"
            className="grid h-9 w-9 place-items-center rounded-lg bg-black/45 text-lg text-white/80 backdrop-blur active:bg-black/60"
          >
            ⋯
          </button>

          {menuOpen && (
            <div className="absolute right-0 top-11 w-52 rounded-xl border border-white/10 bg-black/80 p-3 shadow-2xl backdrop-blur-xl">
              <label className="mb-1 block text-[10px] uppercase tracking-wide text-white/40">
                Theme
              </label>
              <select
                value={themeId}
                onChange={(e) => setThemeId(e.target.value)}
                className="mb-3 w-full rounded-lg bg-white/10 px-2 py-2 text-sm text-white"
              >
                {Object.values(THEMES).map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>

              <div className="mb-3 flex items-center justify-between text-xs text-white/50">
                <span>Renderer</span>
                <span
                  className={`rounded px-1.5 py-0.5 font-bold uppercase ${
                    renderer === "webgpu" ? "text-emerald-300" : "text-amber-300"
                  }`}
                >
                  {renderer}
                </span>
              </div>

              {isHost && state?.phase !== "lobby" && state?.phase !== "ended" && (
                <button
                  onClick={() => {
                    endGame();
                    setMenuOpen(false);
                  }}
                  disabled={state?.endingAfterHand}
                  className="w-full rounded-lg bg-gradient-to-b from-rose-600 to-rose-700 py-2 text-sm font-bold text-white disabled:opacity-50"
                >
                  {state?.endingAfterHand ? "Ending after this hand…" : "End game"}
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Lobby overlay */}
      {inLobby && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
          <div className="pointer-events-auto rounded-2xl border border-white/10 bg-black/60 p-6 text-center shadow-2xl backdrop-blur-xl">
            <div className="mb-3 inline-block rounded-full bg-white/10 px-3 py-1 text-xs font-bold uppercase tracking-wide text-emerald-300">
              {isTournament ? "🏆 Tournament" : "💵 Cash game"}
            </div>
            <p className="mb-1 text-sm text-white/50">Share this code to invite players</p>
            <p className="mb-4 font-mono text-4xl font-black tracking-[0.3em] text-emerald-300">{code}</p>
            <p className="mb-1 text-white/70">
              {state?.players.length ?? 0} player{(state?.players.length ?? 0) === 1 ? "" : "s"} seated
            </p>
            {state && !isTournament && (
              <p className="mb-4 font-mono text-sm text-white/50">
                Blinds {state.smallBlind}/{state.bigBlind}
                {state.ante > 0 ? ` · ante ${state.ante}` : ""}
              </p>
            )}
            {isTournament && <div className="mb-4" />}
            {isHost ? (
              <button
                onClick={start}
                disabled={!canStart}
                className="rounded-xl bg-gradient-to-r from-emerald-400 to-teal-500 px-8 py-3 font-bold text-emerald-950 shadow-lg transition enabled:hover:brightness-110 disabled:opacity-40"
              >
                {!canStart
                  ? "Waiting for players…"
                  : isTournament
                    ? "Start tournament"
                    : "Deal cards"}
              </button>
            ) : (
              <p className="text-white/50">Waiting for the host to start…</p>
            )}
          </div>
        </div>
      )}

      {/* Hand-over banner */}
      {handOver && state?.lastResult && (
        <div className="pointer-events-none absolute inset-x-0 top-1/3 z-20 flex flex-col items-center gap-3">
          <div className="rounded-xl border border-amber-400/30 bg-black/70 px-6 py-3 text-center backdrop-blur-xl">
            {state.lastResult.winners.map((w) => {
              const p = state.players.find((pl) => pl.id === w.playerId);
              return (
                <div key={w.playerId} className="text-amber-300">
                  <span className="font-bold">{p?.name}</span> wins {w.amount}
                  {w.handName ? <span className="text-white/60"> · {w.handName}</span> : null}
                </div>
              );
            })}
          </div>
          {isHost && !isTournament && (
            <button
              onClick={nextHand}
              className="pointer-events-auto rounded-xl bg-gradient-to-r from-emerald-400 to-teal-500 px-6 py-2.5 font-bold text-emerald-950 shadow-lg hover:brightness-110"
            >
              Next hand
            </button>
          )}
          {isTournament && !state.tournament?.isComplete && (
            <p className="text-sm text-white/50">Next hand starting…</p>
          )}
        </div>
      )}

      {/* Tournament clock + final standings + end-game leaderboard */}
      {state && <BlindClock state={state} />}
      {state && <Standings state={state} />}
      {state && <GameOver state={state} />}

      {/* "Ending after this hand" notice */}
      {state?.endingAfterHand && state.phase === "in_hand" && (
        <div
          className={`pointer-events-none absolute left-1/2 z-20 -translate-x-1/2 ${
            isTournament ? "top-28" : "top-16"
          }`}
        >
          <div className="rounded-full border border-rose-400/40 bg-rose-950/80 px-3 py-1.5 text-xs font-semibold text-rose-100 backdrop-blur">
            Game ends after this hand
          </div>
        </div>
      )}

      {/* Cash rebuy / sit-out + host approvals (players only) */}
      {!spectating && <CashControls />}

      {/* Action bar (only on your turn) */}
      {!spectating && me && !me.hasFolded && !me.isOut && !me.sittingOut && me.stack > 0 && (
        <ActionBar />
      )}

      {/* Spectator bar */}
      {spectating && (
        <div className="pointer-events-auto absolute inset-x-0 bottom-0 z-30 mx-auto flex w-full max-w-md items-center justify-center gap-3 p-3">
          <span className="rounded-full border border-white/10 bg-black/60 px-3 py-2 text-sm font-semibold text-white/80 backdrop-blur">
            👁 Spectating
          </span>
          {canSit && (
            <button
              onClick={() => sitDown(localStorage.getItem("poker.name") || "Guest")}
              className="rounded-xl bg-gradient-to-b from-emerald-400 to-emerald-600 px-5 py-2.5 text-sm font-extrabold text-emerald-950 shadow-lg"
            >
              Take a seat
            </button>
          )}
        </div>
      )}
    </div>
  );
}
