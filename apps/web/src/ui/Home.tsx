import { useState } from "react";
import type { GameMode } from "@poker/shared";
import { PAYOUT_PRESETS } from "@poker/shared";
import { makeCode, useGame } from "../store";

const ANTE_OPTIONS = [0, 10, 25, 50, 100];
const TURN_OPTIONS = [0, 15, 30, 45, 60];

type Mode = "host" | "join" | "watch";

export function Home() {
  const join = useGame((s) => s.join);
  const spectate = useGame((s) => s.spectate);
  const initialCode = useGame((s) => s.code) ?? "";
  const [name, setName] = useState(localStorage.getItem("poker.name") ?? "");
  const [code, setCode] = useState(initialCode);
  const [mode, setMode] = useState<Mode>(initialCode ? "join" : "host");
  const [gameMode, setGameMode] = useState<GameMode>("cash");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [startingStack, setStartingStack] = useState(1000);
  const [smallBlind, setSmallBlind] = useState(5);
  const [bigBlind, setBigBlind] = useState(10);
  const [antePctOfBB, setAntePctOfBB] = useState(0);
  const [turnSeconds, setTurnSeconds] = useState(30);
  const [buyIn, setBuyIn] = useState(100);
  const [payoutId, setPayoutId] = useState("wta");

  const needsCode = mode !== "host";
  const needsName = mode !== "watch";
  const canGo =
    (!needsName || name.trim().length > 0) && (!needsCode || code.trim().length >= 4);

  function go() {
    if (!canGo) return;
    if (name.trim()) localStorage.setItem("poker.name", name.trim());
    if (mode === "watch") {
      spectate(code.trim().toUpperCase(), name.trim() || undefined);
      return;
    }
    const room = mode === "host" ? makeCode() : code.trim().toUpperCase();
    const config =
      mode === "host"
        ? {
            mode: gameMode,
            startingStack,
            antePctOfBB,
            turnSeconds,
            ...(gameMode === "tournament"
              ? {
                  buyIn,
                  payout: PAYOUT_PRESETS.find((p) => p.id === payoutId)?.pct ?? [100],
                }
              : { smallBlind, bigBlind }),
          }
        : undefined;
    join(room, name.trim(), config);
  }

  return (
    <div className="relative flex h-full w-full items-center justify-center overflow-y-auto bg-gradient-to-b from-[#0d1512] to-[#05201a] p-4 sm:p-6">
      {/* Ambient felt glow */}
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-[70vmin] w-[70vmin] -translate-x-1/2 -translate-y-1/2 rounded-full bg-emerald-500/10 blur-3xl" />

      <div className="relative flex w-full max-w-md flex-col landscape:max-w-4xl landscape:flex-row landscape:items-center landscape:gap-12">
        <div className="mb-6 text-center landscape:mb-0 landscape:flex-1 landscape:text-left">
          <div className="mb-2 text-5xl landscape:text-6xl">♠️♥️♦️♣️</div>
          <h1 className="bg-gradient-to-r from-emerald-300 to-teal-400 bg-clip-text text-4xl font-black tracking-tight text-transparent landscape:text-5xl">
            All-In
          </h1>
          <p className="mt-1 text-sm text-emerald-200/60">
            Real-time Texas Hold'em — host or join a table
          </p>
        </div>

        <div className="w-full landscape:max-w-md landscape:flex-1">

        <div className="rounded-2xl border border-white/10 bg-white/5 p-6 shadow-2xl backdrop-blur-xl">
          {/* Mode toggle */}
          <div className="mb-5 grid grid-cols-3 gap-1 rounded-xl bg-black/30 p-1">
            {(["host", "join", "watch"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`rounded-lg py-2 text-sm font-semibold capitalize transition ${
                  mode === m
                    ? "bg-emerald-500 text-emerald-950 shadow"
                    : "text-emerald-100/70 hover:text-white"
                }`}
              >
                {m}
              </button>
            ))}
          </div>

          {mode === "host" && (
            <div className="mb-4">
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-emerald-200/60">
                Game type
              </label>
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    { id: "cash", label: "Cash game", desc: "Chips, rebuy anytime" },
                    { id: "tournament", label: "Tournament", desc: "Rising blinds, last one standing" },
                  ] as const
                ).map((g) => (
                  <button
                    key={g.id}
                    onClick={() => setGameMode(g.id)}
                    className={`rounded-xl border p-3 text-left transition ${
                      gameMode === g.id
                        ? "border-emerald-400/70 bg-emerald-500/15"
                        : "border-white/10 bg-black/20 hover:border-white/25"
                    }`}
                  >
                    <div className="text-sm font-bold text-white">{g.label}</div>
                    <div className="text-[11px] leading-tight text-white/50">{g.desc}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {mode === "host" && (
            <div className="mb-4">
              <button
                type="button"
                onClick={() => setShowAdvanced((v) => !v)}
                className="mb-2 flex w-full items-center justify-between text-xs font-medium uppercase tracking-wide text-emerald-200/60 hover:text-emerald-200"
              >
                <span>Table settings</span>
                <span>{showAdvanced ? "−" : "+"}</span>
              </button>
              {showAdvanced && (
                <div className="space-y-3 rounded-xl border border-white/10 bg-black/20 p-3">
                  <label className="block">
                    <span className="mb-1 block text-[11px] text-white/50">
                      Starting stack (chips)
                    </span>
                    <input
                      type="number"
                      min={100}
                      step={100}
                      value={startingStack}
                      onChange={(e) => setStartingStack(Math.max(100, Number(e.target.value)))}
                      className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400/60"
                    />
                  </label>

                  {gameMode === "cash" && (
                    <div className="grid grid-cols-2 gap-2">
                      <label className="block">
                        <span className="mb-1 block text-[11px] text-white/50">Small blind</span>
                        <input
                          type="number"
                          min={1}
                          value={smallBlind}
                          onChange={(e) => setSmallBlind(Math.max(1, Number(e.target.value)))}
                          className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400/60"
                        />
                      </label>
                      <label className="block">
                        <span className="mb-1 block text-[11px] text-white/50">Big blind</span>
                        <input
                          type="number"
                          min={2}
                          value={bigBlind}
                          onChange={(e) => setBigBlind(Math.max(2, Number(e.target.value)))}
                          className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400/60"
                        />
                      </label>
                    </div>
                  )}

                  <div>
                    <span className="mb-1 block text-[11px] text-white/50">
                      Ante (% of big blind)
                    </span>
                    <div className="flex gap-1.5">
                      {ANTE_OPTIONS.map((a) => (
                        <button
                          key={a}
                          type="button"
                          onClick={() => setAntePctOfBB(a)}
                          className={`flex-1 rounded-lg py-1.5 text-xs font-semibold transition ${
                            antePctOfBB === a
                              ? "bg-emerald-500 text-emerald-950"
                              : "bg-white/8 text-white/70 hover:bg-white/15"
                          }`}
                        >
                          {a === 0 ? "Off" : `${a}%`}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <span className="mb-1 block text-[11px] text-white/50">
                      Turn timer (seconds)
                    </span>
                    <div className="flex gap-1.5">
                      {TURN_OPTIONS.map((tsec) => (
                        <button
                          key={tsec}
                          type="button"
                          onClick={() => setTurnSeconds(tsec)}
                          className={`flex-1 rounded-lg py-1.5 text-xs font-semibold transition ${
                            turnSeconds === tsec
                              ? "bg-emerald-500 text-emerald-950"
                              : "bg-white/8 text-white/70 hover:bg-white/15"
                          }`}
                        >
                          {tsec === 0 ? "Off" : `${tsec}s`}
                        </button>
                      ))}
                    </div>
                  </div>

                  {gameMode === "tournament" && (
                    <>
                      <label className="block">
                        <span className="mb-1 block text-[11px] text-white/50">
                          Entry buy-in (credits)
                        </span>
                        <input
                          type="number"
                          min={0}
                          step={10}
                          value={buyIn}
                          onChange={(e) => setBuyIn(Math.max(0, Number(e.target.value)))}
                          className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400/60"
                        />
                      </label>
                      <label className="block">
                        <span className="mb-1 block text-[11px] text-white/50">Prize split</span>
                        <select
                          value={payoutId}
                          onChange={(e) => setPayoutId(e.target.value)}
                          className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400/60"
                        >
                          {PAYOUT_PRESETS.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                      </label>
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-emerald-200/60">
            Your name{mode === "watch" && <span className="text-white/30"> (optional)</span>}
          </label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={20}
            placeholder="e.g. Doyle"
            className="mb-4 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none placeholder:text-white/30 focus:border-emerald-400/60"
          />

          {needsCode && (
            <>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-emerald-200/60">
                Table code
              </label>
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                maxLength={6}
                placeholder="ABCDE"
                className="mb-4 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 font-mono text-2xl tracking-[0.3em] text-white outline-none placeholder:text-white/20 focus:border-emerald-400/60"
                onKeyDown={(e) => e.key === "Enter" && go()}
              />
            </>
          )}

          <button
            onClick={go}
            disabled={!canGo}
            className="w-full rounded-xl bg-gradient-to-r from-emerald-400 to-teal-500 py-3.5 font-bold text-emerald-950 shadow-lg transition enabled:hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {mode === "host" ? "Create table" : mode === "watch" ? "Watch table" : "Join table"}
          </button>
        </div>

          <p className="mt-4 text-center text-xs text-white/30">
            Play money · WebGPU rendering · No sign-up
          </p>
        </div>
      </div>
    </div>
  );
}
