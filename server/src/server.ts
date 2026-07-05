import { Server, type Connection, routePartykitRequest } from "partyserver";
import { PokerGame } from "@poker/engine";
import {
  DEFAULTS,
  type ClientMessage,
  type GameEvent,
  type ServerMessage,
} from "@poker/shared";

interface Env {
  PokerRoom: DurableObjectNamespace<PokerRoom>;
}

/**
 * One Durable Object per poker table (its name = the table code). The PokerGame
 * is the single source of truth; hidden hole cards are only sent to their owner.
 * Hibernation is disabled so the in-memory game survives between messages.
 */
export class PokerRoom extends Server<Env> {
  static options = { hibernate: false };

  game!: PokerGame;
  private levelSeconds: number = DEFAULTS.LEVEL_SECONDS;
  private blindTimer: ReturnType<typeof setTimeout> | null = null;
  private handTimer: ReturnType<typeof setTimeout> | null = null;
  private turnTimer: ReturnType<typeof setTimeout> | null = null;
  private blindClockStarted = false;

  onStart() {
    this.game = new PokerGame({ code: this.name });
  }

  onConnect(conn: Connection) {
    if (this.game.hasPlayer(conn.id)) {
      this.game.setConnected(conn.id, true);
      this.broadcastState();
    }
    this.send(conn, { t: "welcome", playerId: conn.id, state: this.game.toPublic() });
    if (this.game.hasPlayer(conn.id)) this.syncPlayer(conn.id);
  }

  onClose(conn: Connection) {
    if (this.game.hasPlayer(conn.id)) {
      this.game.setConnected(conn.id, false);
      this.broadcastState();
    }
  }

  onMessage(sender: Connection, message: string | ArrayBuffer) {
    if (typeof message !== "string") return;
    let msg: ClientMessage;
    try {
      msg = JSON.parse(message) as ClientMessage;
    } catch {
      return;
    }

    switch (msg.t) {
      case "join": {
        const res = this.game.addPlayer(sender.id, msg.name.slice(0, 20) || "Player");
        if (!res.ok) return this.send(sender, { t: "error", message: res.error! });
        this.send(sender, { t: "welcome", playerId: sender.id, state: this.game.toPublic() });
        this.broadcastState();
        break;
      }
      case "config": {
        if (sender.id !== this.game.hostId) return;
        if (msg.levelSeconds) {
          this.levelSeconds = Math.max(15, Math.min(3600, msg.levelSeconds));
        }
        this.game.configure({
          mode: msg.mode,
          startingStack: msg.startingStack,
          minBuyIn: msg.minBuyIn,
          maxBuyIn: msg.maxBuyIn,
          buyIn: msg.buyIn,
          antePctOfBB: msg.antePctOfBB,
          payout: msg.payout,
          turnSeconds: msg.turnSeconds,
          smallBlind: msg.smallBlind,
          bigBlind: msg.bigBlind,
        });
        this.broadcastState();
        break;
      }
      case "start":
      case "nextHand": {
        const { events, error } = this.game.startHand(sender.id);
        if (error) return this.send(sender, { t: "error", message: error });
        if (this.game.mode === "tournament" && !this.blindClockStarted) {
          this.startBlindClock();
        }
        this.dispatch(events);
        break;
      }
      case "action": {
        const { events, error } = this.game.act(sender.id, {
          type: msg.action,
          amount: msg.amount,
        });
        if (error) return this.send(sender, { t: "error", message: error });
        this.dispatch(events);
        break;
      }
      case "requestRebuy": {
        const r = this.game.requestRebuy(sender.id, msg.amount);
        if (!r.ok) return this.send(sender, { t: "error", message: r.error! });
        this.broadcastState();
        break;
      }
      case "rebuyDecision": {
        const r = this.game.resolveRebuy(sender.id, msg.playerId, msg.approve);
        if (!r.ok) return this.send(sender, { t: "error", message: r.error! });
        this.dispatch(r.event ? [r.event] : []);
        break;
      }
      case "sitOut":
      case "sitIn": {
        const r = this.game.setSitOut(sender.id, msg.t === "sitOut");
        if (!r.ok) return this.send(sender, { t: "error", message: r.error! });
        this.broadcastState();
        break;
      }
      case "endGame": {
        const r = this.game.endGame(sender.id);
        if (!r.ok) return this.send(sender, { t: "error", message: r.error! });
        this.dispatch([]);
        break;
      }
    }
  }

  // ── Timers ─────────────────────────────────────────────────────────────────
  private startBlindClock() {
    this.blindClockStarted = true;
    this.game.nextBlindAt = Date.now() + this.levelSeconds * 1000;
    this.blindTimer = setTimeout(() => this.escalate(), this.levelSeconds * 1000);
  }

  private escalate() {
    const ev = this.game.escalateBlinds();
    if (this.game.level < this.game.blindSchedule.length - 1) {
      this.game.nextBlindAt = Date.now() + this.levelSeconds * 1000;
      this.blindTimer = setTimeout(() => this.escalate(), this.levelSeconds * 1000);
    } else {
      this.game.nextBlindAt = null;
      this.blindTimer = null;
    }
    this.dispatch(ev ? [ev] : []);
  }

  private autoAct() {
    const st = this.game.toPublic();
    if (st.phase !== "in_hand" || st.activeSeat === null) return;
    const active = st.players.find((p) => p.seat === st.activeSeat);
    if (!active) return;
    const legal = this.game.legalActions(active.id);
    const { events } = this.game.act(active.id, { type: legal?.canCheck ? "check" : "fold" });
    this.dispatch(events);
  }

  private autoNextHand() {
    const { events, error } = this.game.startHand();
    if (!error) this.dispatch(events);
  }

  private arm() {
    if (this.turnTimer) clearTimeout(this.turnTimer);
    if (this.handTimer) clearTimeout(this.handTimer);
    this.turnTimer = null;
    this.handTimer = null;

    const g = this.game;
    if (g.isComplete() || g.phase === "ended") {
      if (this.blindTimer) clearTimeout(this.blindTimer);
      this.blindTimer = null;
      g.nextBlindAt = null;
      g.turnEndsAt = null;
      return;
    }

    if (g.turnSeconds > 0 && g.phase === "in_hand" && g.activeSeat !== null) {
      g.turnEndsAt = Date.now() + g.turnSeconds * 1000;
      this.turnTimer = setTimeout(() => this.autoAct(), g.turnSeconds * 1000);
    } else {
      g.turnEndsAt = null;
    }

    if (g.mode === "tournament" && g.phase === "hand_over") {
      this.handTimer = setTimeout(() => this.autoNextHand(), DEFAULTS.HAND_DELAY_SECONDS * 1000);
    }
  }

  // ── Broadcast helpers ──────────────────────────────────────────────────────
  private dispatch(events: GameEvent[]) {
    for (const event of events) this.emit({ t: "event", event });
    this.arm();
    this.broadcastState();
    this.syncAll();
  }

  private broadcastState() {
    this.emit({ t: "state", state: this.game.toPublic() });
  }

  private syncAll() {
    for (const conn of this.getConnections()) {
      if (this.game.hasPlayer(conn.id)) this.syncPlayer(conn.id);
    }
  }

  private syncPlayer(id: string) {
    const conn = this.getConnection(id);
    if (!conn) return;
    const hole = this.game.getHole(id);
    if (hole) this.send(conn, { t: "hole", cards: hole });
    this.send(conn, { t: "legal", actions: this.game.legalActions(id) });
  }

  private emit(msg: ServerMessage) {
    this.broadcast(JSON.stringify(msg));
  }

  private send(conn: Connection, msg: ServerMessage) {
    conn.send(JSON.stringify(msg));
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const routed = await routePartykitRequest(
      request,
      env as unknown as Record<string, unknown>,
    );
    return routed ?? new Response("Not found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;
