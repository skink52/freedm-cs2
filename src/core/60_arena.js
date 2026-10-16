// ===================================================================================
// Part 6: Arena - one running Doom level with its own players, things and rules
// ===================================================================================

const OBITS = {
  fist: '%o was punched out by %k.', berserk: '%o was ripped apart by %k\'s fists.',
  chainsaw: '%o was mowed down by %k\'s ripsaw.', pistol: '%o was tickled by %k\'s pistol.',
  shotgun: '%o chewed on %k\'s shotgun.', ssg: '%o was splattered by %k\'s super shotgun.',
  chaingun: '%o was mowed down by %k\'s chaingun.', rocket: '%o rode %k\'s rocket.',
  rocketsplash: '%o almost dodged %k\'s rocket.', plasma: '%o was melted by %k\'s plasma rifle.',
  bfg: '%o was disintegrated by %k\'s SKAG 1337.', telefrag: '%o was telefragged by %k.', barrel: '%o was blown up by %k\'s barrel.',
  selfrocket: '%o should have stood back.', selfbfg: '%o got too close to their own SKAG 1337.', selfbarrel: '%o went boom.',
  slime: '%o melted.', crush: '%o was squished.', world: '%o died.', suicide: '%o suicides.',
};

class Arena {
  constructor(index, cfg) {
    this.index = index;
    this.cfg = cfg;
    this.level = null;
    this.players = new Map();   // slot -> player
    this.events = [];
    this.mobjs = new Set();
    this.removedMobjs = [];
    this.thinkers = [];
    this.activeplats = new Set();
    this.activeceilings = new Set();
    this.itemRespawnQueue = [];
    this.leveltime = 0;
    this.validcount = 1;
    this.dmstarts = [];
    this.teamsActive = false;
    this.friendlyFire = false;
    this.mode = null;            // set by the round manager
    this.teamScore = [0, 0];
    this.finished = false;
    this.result = null;
    this.damageCtx = null;
    this.modeKey = ''; this.mapId = ''; this.mapTitle = '';
    this.target = 0; this.startTime = 0; this.countdown = 0; this.time = 0; this.finishedAt = 0;
    this.bodyque = [];
    this.coopStarts = null;
  }

  run(fn) { const prev = G; G = this; try { return fn(); } finally { G = prev; } }

  load(data) {
    this.run(() => {
      this.level = new Level(data);
      const n = this.level.bmapwidth * this.level.bmapheight;
      this.blockThings = new Array(n);
      for (let i = 0; i < n; i++) this.blockThings[i] = [];
      for (const t of this.level.things) {
        const [x, y, angle, type, flags] = t;
        if (type === 11) { this.dmstarts.push({ x, y, angle }); continue; }
        if (type >= 1 && type <= 4) { this.coopStarts = this.coopStarts || []; this.coopStarts.push({ x, y, angle }); continue; }
        if (!(flags & 4)) continue; // not on the hard-skill set used for deathmatch
        const mt = DOOMEDNUM[type];
        if (mt === undefined) continue;
        const info = MOBJINFO[mt];
        if (info.kind === 'item' && info.pickup && info.pickup.startsWith('key')) continue;
        const mo = spawnMobj(x, y, (info.flags & MF_SPAWNCEILING) ? ONCEILINGZ : ONFLOORZ, mt);
        mo.angle = angle; mo.pangle = angle;
        mo.spawnpoint = t;
        if (mo.tics > 0) mo.tics = 1 + (P_Random() % mo.tics);
      }
      if (!this.dmstarts.length && this.coopStarts) this.dmstarts = this.coopStarts.slice();
    });
  }

  // ---------------------------------------------------------------- players
  addPlayer(slot, name, team, color) {
    const p = newPlayer(slot, name);
    p.team = team; p.color = color;
    p.arena = this;
    this.players.set(slot, p);
    return p;
  }

  spawnPlayer(p, spot) {
    this.run(() => {
      if (p.mo && !p.mo.removed) {
        // Doom's body queue: keep the last 32 corpses
        this.bodyque = this.bodyque || [];
        this.bodyque.push(p.mo);
        if (this.bodyque.length > 32) { const old = this.bodyque.shift(); if (!old.removed) removeMobj(old); }
      }
      playerReborn(p);
      if (this.loadout) applyLoadout(p, this.loadout);
      if (!spot) spot = this.pickSpawnSpot(p);
      spawnPlayerAt(p, spot.x, spot.y, spot.angle);
      p.protectUntil = this.leveltime + (this.cfg.spawnProtectTics || 0);
      p.cmd.angle = spot.angle;
      this.events.push({ type: 'spawn', player: p, angle: spot.angle });
      if (!spot.silent) {
        const fog = spawnMobj(spot.x + 20 * Math.cos(spot.angle * DEG), spot.y + 20 * Math.sin(spot.angle * DEG), p.mo.z, MT.TFOG);
        startSound(fog, 'telept');
      }
    });
  }

  spotFree(spot, p) {
    for (const q of this.players.values()) {
      if (q === p || !q.mo || q.mo.removed || q.playerstate !== 'live' || q.spectating) continue;
      if (Math.abs(q.mo.x - spot.x) < 40 && Math.abs(q.mo.y - spot.y) < 40) return false;
    }
    return true;
  }

  pickSpawnSpot(p) {
    const starts = this.dmstarts;
    if (!starts.length) return { x: 0, y: 0, angle: 0 };
    // prefer free spots far from living enemies, with some randomness
    const scored = starts.map((s) => {
      let near = 1e9;
      for (const q of this.players.values()) {
        if (q === p || !q.mo || q.playerstate !== 'live' || q.spectating) continue;
        if (this.teamsActive && q.team === p.team) continue;
        near = Math.min(near, Math.hypot(q.mo.x - s.x, q.mo.y - s.y));
      }
      return { s, free: this.spotFree(s, p), near };
    });
    const free = scored.filter((e) => e.free);
    const pool = free.length ? free : scored;
    pool.sort((a, b) => b.near - a.near);
    const top = pool.slice(0, Math.max(1, Math.ceil(pool.length / 2)));
    return top[(P_Random() * top.length) >> 8].s;
  }

  // distinct spots for a round start; teams get starts on opposite halves when possible
  roundStartSpots(list) {
    const starts = this.dmstarts.slice();
    for (let i = starts.length - 1; i > 0; i--) { const j = (P_Random() * (i + 1)) >> 8; [starts[i], starts[j]] = [starts[j], starts[i]]; }
    const out = new Map();
    if (this.teamsActive && starts.length >= 2) {
      // split starts along the axis of greatest spread
      const xs = starts.map((s) => s.x), ys = starts.map((s) => s.y);
      const useX = (Math.max(...xs) - Math.min(...xs)) >= (Math.max(...ys) - Math.min(...ys));
      const sorted = starts.slice().sort((a, b) => useX ? a.x - b.x : a.y - b.y);
      const half = Math.ceil(sorted.length / 2);
      const sides = [sorted.slice(0, half), sorted.slice(half)];
      const used = [0, 0];
      for (const p of list) {
        const t = p.team === 1 ? 1 : 0;
        const side = sides[t];
        const s = side[used[t]++ % side.length];
        const jitter = used[t] > side.length ? 48 : 0;
        out.set(p, { x: s.x + (jitter ? (P_Random() - 128) / 128 * jitter : 0), y: s.y, angle: s.angle, silent: true });
      }
    } else {
      list.forEach((p, i) => {
        const s = starts[i % starts.length];
        out.set(p, { x: s.x, y: s.y, angle: s.angle, silent: true });
      });
    }
    // more players than starts: nudge the extra ones so they don't telefrag at the start
    const taken = [];
    for (const [p, s] of out) {
      for (let k = 0; k < 8 && taken.some((t) => Math.abs(t.x - s.x) < 34 && Math.abs(t.y - s.y) < 34); k++) {
        const ang = (k * 45 + s.angle) * DEG;
        const nx = s.x + 40 * Math.cos(ang), ny = s.y + 40 * Math.sin(ang);
        const ok = this.run(() => {
          const probe = { x: nx, y: ny, radius: 16, height: 56, flags: MF_SOLID | MF_SHOOTABLE | MF_PICKUP, z: 0 };
          return this.level.sectorAt(nx, ny) === this.level.sectorAt(s.x, s.y) && checkPositionProbe(probe, nx, ny);
        });
        if (ok) { s.x = nx; s.y = ny; }
      }
      taken.push(s);
    }
    return out;
  }

  removePlayer(slot) {
    const p = this.players.get(slot);
    if (!p) return;
    this.run(() => {
      if (p.mo && !p.mo.removed) {
        p.mo.player = null;
        removeMobj(p.mo);
      }
    });
    p.mo = null;
    this.players.delete(slot);
  }

  makeSpectator(p) {
    this.run(() => {
      if (p.mo && !p.mo.removed) {
        // leave the corpse where it lies
        p.mo.player = null;
        p.mo.flags &= ~(MF_SOLID | MF_SHOOTABLE);
      }
    });
    p.spectating = true;
  }

  // ---------------------------------------------------------------- per-tic
  tic() {
    this.run(() => {
      this.leveltime++;
      this.removedMobjs.length = 0;
      for (const p of this.players.values()) {
        if (p.spectating) continue;
        p.pviewz = p.viewz;
        playerThink(p);
      }
      const list = Array.from(this.mobjs);
      for (const mo of list) if (!mo.removed) mobjThinker(mo);
      runThinkers();
      respawnSpecials();
      for (const s of this.level.sectors) { s.renderFloor = s.floorheight; s.renderCeil = s.ceilingheight; }
    });
  }

  // ---------------------------------------------------------------- hooks used by the playsim
  message(p, text) { this.events.push({ type: 'msg', player: p, text }); }
  isProtected(p) { return this.finished || this.leveltime < p.protectUntil; }
  onTeleport(p, angle) { this.events.push({ type: 'teleport', player: p, angle }); }
  onExitLine(p) {
    if (p) this.message(p, 'Exits are disabled in this game.');
    return false;
  }

  onPlayerKilled(victim, killer, inflictor, source) {
    let kind = 'world';
    const ctx = this.damageCtx;
    const self = !killer || killer === victim;
    if (ctx === 'telefrag') kind = 'telefrag';
    else if (ctx === 'crush') kind = 'crush';
    else if (ctx === 'slime') kind = 'slime';
    else if (inflictor && inflictor.type === MT.BARREL) kind = self ? 'selfbarrel' : 'barrel';
    else if (inflictor && inflictor.type === MT.ROCKET) kind = self ? 'selfrocket' : (ctx === 'direct' ? 'rocket' : 'rocketsplash');
    else if (inflictor && inflictor.type === MT.PLASMA) kind = 'plasma';
    else if (inflictor && (inflictor.type === MT.BFG || ctx === 'bfgspray')) kind = self ? 'selfbfg' : 'bfg';
    else if (killer && !self) {
      const w = killer.readyweapon;
      kind = ['fist', 'pistol', 'shotgun', 'chaingun', 'rocket', 'plasma', 'bfg', 'chainsaw', 'ssg'][w] || 'world';
      if (w === WP_FIST && killer.powers[PW_STRENGTH]) kind = 'berserk';
    } else if (self && source === victim.mo) kind = 'suicide';
    if (self) victim.frags--; else killer.frags++;
    victim.deaths++;
    if (this.teamsActive) {
      if (self) { if (victim.team >= 0 && this.cfg.teamSuicidePenalty) this.teamScore[victim.team] = Math.max(0, this.teamScore[victim.team] - 1); }
      else if (killer.team !== victim.team && killer.team >= 0) this.teamScore[killer.team]++;
    }
    const text = (OBITS[kind] || OBITS.world).replace('%o', victim.name).replace('%k', killer ? killer.name : '');
    this.events.push({ type: 'kill', victim, killer: self ? null : killer, kind, text, time: this.leveltime });
  }
}

function checkPositionProbe(probe, x, y) {
  probe.sector = G.level.sectorAt(x, y);
  return checkPosition(probe, x, y) && TM.ceilingz - TM.floorz >= probe.height;
}

// sound and message plumbing
function startSound(origin, sfx) {
  if (!G) return;
  if (!origin) { G.events.push({ type: 'sound', sfx, x: 0, y: 0, z: 0, mo: null, global: true }); return; }
  const isMo = origin.info !== undefined;
  G.events.push({ type: 'sound', sfx, x: origin.x, y: origin.y, z: isMo ? origin.z + origin.height / 2 : origin.z, mo: isMo ? origin : null });
}

function startLocalSound(player, sfx) {
  if (!G) return;
  G.events.push({ type: 'localsound', sfx, player });
}
