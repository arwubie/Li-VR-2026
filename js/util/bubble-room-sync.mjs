import { initialRoom, applyAction, stepRoom, roomLeader } from './bubble-room.mjs';

// A scene-local host owns physics and grab locks. Transport is the course Server.send/sync API.
export class BubbleSession {
   constructor(actor, now) {
      this.actor = actor;
      this.started = now;
      this.peers = new Map([[actor, now]]);
      this.state = initialRoom();
      this.queue = [];
      this.actions = new Map();
      this.snapshots = new Map();
      this.serial = 0;
      this.snapshotSerial = 0;
   }
   command(action) { return { kind: 'action', actor: this.actor, seq: ++this.serial, action }; }
   receive(m, now) {
      if (!m || typeof m.actor !== 'string') return;
      if (m.kind === 'leave') { this.peers.delete(m.actor); return; }
      this.peers.set(m.actor, now);
      if (m.kind === 'action' && Number.isInteger(m.seq)) this.queue.push(m);
      if (m.kind === 'snapshot' && m.actor !== this.actor && m.actor === roomLeader(this.peers, now)
          && m.seq > (this.snapshots.get(m.actor) || 0) && Array.isArray(m.state?.bubbles)) {
         this.snapshots.set(m.actor, m.seq);
         this.state = structuredClone(m.state);
         // Preserve processed command watermarks during host migration.
         this.actions = new Map(m.actions || []);
      }
   }
   tick(dt, now) {
      this.peers.set(this.actor, now);
      const previousLeader = this.leader;
      this.leader = roomLeader(this.peers, now);
      this.count = [...this.peers.values()].filter(t => now - t < 3500).length;
      const host = this.leader === this.actor && now - this.started > 700;
      if (host) {
         // Lease timestamps belong to the previous host's clock. Release its grabs on takeover.
         if (previousLeader && previousLeader !== this.actor)
            for (const b of this.state.bubbles) { b.owner = null; b.hand = null; b.touched = now; }
         for (const m of this.queue) {
            if (m.seq <= (this.actions.get(m.actor) || 0)) continue;
            this.actions.set(m.actor, m.seq);
            applyAction(this.state, m.action, m.actor, now);
         }
         stepRoom(this.state, dt, now);
      }
      this.queue = [];
      return host;
   }
   snapshot() {
      return { kind: 'snapshot', actor: this.actor, seq: ++this.snapshotSerial,
         state: structuredClone(this.state), actions: [...this.actions] };
   }
}
