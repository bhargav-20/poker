import { create } from "zustand";
import { PartySocket } from "partysocket";
import { playSound, soundForEvent } from "./sound";
import type {
  ActionType,
  Card,
  GameConfigMsg,
  GameEvent,
  LegalActions,
  PublicTableState,
  ServerMessage,
} from "@poker/shared";

const PARTY_HOST = import.meta.env.VITE_PARTYKIT_HOST ?? "127.0.0.1:1999";

// Stable per-browser identity so reconnects map back to the same seat.
function clientId(): string {
  const k = "poker.pid";
  let id = localStorage.getItem(k);
  if (!id) {
    id = "u_" + Math.random().toString(36).slice(2, 10);
    localStorage.setItem(k, id);
  }
  return id;
}

// ── Game-event bus (drives PixiJS animations, kept out of React state) ────────
type EventCb = (e: GameEvent) => void;
const eventSubs = new Set<EventCb>();
export function onGameEvent(cb: EventCb): () => void {
  eventSubs.add(cb);
  return () => eventSubs.delete(cb);
}

export type Screen = "home" | "table";

interface GameStore {
  screen: Screen;
  socket: PartySocket | null;
  connected: boolean;
  playerId: string;
  code: string | null;
  name: string;
  state: PublicTableState | null;
  hole: [Card, Card] | null;
  legal: LegalActions | null;
  error: string | null;

  join(code: string, name: string, config?: GameConfigMsg): void;
  leave(): void;
  start(): void;
  nextHand(): void;
  endGame(): void;
  act(action: ActionType, amount?: number): void;
  requestRebuy(amount: number): void;
  rebuyDecision(playerId: string, approve: boolean): void;
  sitOut(): void;
  sitIn(): void;
  clearError(): void;
}

export const useGame = create<GameStore>((set, get) => ({
  screen: "home",
  socket: null,
  connected: false,
  playerId: clientId(),
  code: null,
  name: "",
  state: null,
  hole: null,
  legal: null,
  error: null,

  join(code, name, config) {
    get().socket?.close();
    const room = code.toUpperCase();
    const socket = new PartySocket({
      host: PARTY_HOST,
      room,
      id: get().playerId,
    });

    socket.addEventListener("open", () => {
      set({ connected: true });
      socket.send(JSON.stringify({ t: "join", name }));
      // Host declares the game config right after joining (server ignores it
      // from non-hosts and once the game has started).
      if (config) socket.send(JSON.stringify({ t: "config", ...config }));
    });
    socket.addEventListener("close", () => set({ connected: false }));
    socket.addEventListener("message", (ev) => {
      let msg: ServerMessage;
      try {
        msg = JSON.parse(ev.data as string) as ServerMessage;
      } catch {
        return;
      }
      switch (msg.t) {
        case "welcome":
          set({ playerId: msg.playerId, state: msg.state });
          break;
        case "state":
          // Once a game is over, stop auto-rejoining it on next load.
          if (msg.state.phase === "ended") localStorage.removeItem("poker.room");
          set({ state: msg.state });
          break;
        case "hole":
          set({ hole: msg.cards });
          break;
        case "legal":
          if (msg.actions && !get().legal) playSound("turn"); // your turn
          set({ legal: msg.actions });
          break;
        case "event": {
          for (const cb of eventSubs) cb(msg.event);
          const s = soundForEvent(msg.event);
          if (s) playSound(s);
          break;
        }
        case "error":
          set({ error: msg.message });
          break;
      }
    });

    // Remember the table so a tab-close/refresh can auto-rejoin.
    localStorage.setItem("poker.room", room);
    localStorage.setItem("poker.name", name);
    set({ socket, code: room, name, screen: "table", hole: null, legal: null });
  },

  leave() {
    get().socket?.close();
    localStorage.removeItem("poker.room");
    set({
      socket: null,
      connected: false,
      code: null,
      state: null,
      hole: null,
      legal: null,
      screen: "home",
    });
  },

  start() {
    get().socket?.send(JSON.stringify({ t: "start" }));
  },
  nextHand() {
    get().socket?.send(JSON.stringify({ t: "nextHand" }));
  },
  endGame() {
    get().socket?.send(JSON.stringify({ t: "endGame" }));
  },
  act(action, amount) {
    get().socket?.send(JSON.stringify({ t: "action", action, amount }));
    set({ legal: null }); // optimistic: hide controls until server responds
  },
  requestRebuy(amount) {
    get().socket?.send(JSON.stringify({ t: "requestRebuy", amount }));
  },
  rebuyDecision(playerId, approve) {
    get().socket?.send(JSON.stringify({ t: "rebuyDecision", playerId, approve }));
  },
  sitOut() {
    get().socket?.send(JSON.stringify({ t: "sitOut" }));
  },
  sitIn() {
    get().socket?.send(JSON.stringify({ t: "sitIn" }));
  },
  clearError() {
    set({ error: null });
  },
}));

if (import.meta.env.DEV) {
  (globalThis as unknown as { __game: typeof useGame }).__game = useGame;
}

/** Generate a short, human-friendly table code. */
export function makeCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 5; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}
