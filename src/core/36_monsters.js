// ===================================================================================
// Part 3c: the monster director - who appears where and when.
//   boss:  waves of monsters, then a boss (co-op Boss Battle rounds)
//   roam:  a handful of monsters loose in a deathmatch level, replaced as they die (chance per arena)
// Freedoom's creature names (info.name) are used in messages.
// ===================================================================================

// cost = how much of a wave's budget one takes; tier = the first wave it may show up in (0 = wave 1)
const MONSTER_ROSTER = {
  ZOMBIE: { cost: 1, tier: 0, roam: 24 }, SHOTGUY: { cost: 1.5, tier: 0, roam: 16 }, IMP: { cost: 2, tier: 0, roam: 24 },
  LOSTSOUL: { cost: 2, tier: 1, roam: 8 }, DEMON: { cost: 3, tier: 1, roam: 12 }, SPECTRE: { cost: 3.5, tier: 1, roam: 6 },
  CHAINGUY: { cost: 3.5, tier: 1, roam: 6 }, CACO: { cost: 5, tier: 2, roam: 8 }, KNIGHT: { cost: 6, tier: 2, roam: 4 },
  REVENANT: { cost: 7, tier: 2, roam: 3 }, PAINELEMENTAL: { cost: 8, tier: 3, roam: 0 }, MANCUBUS: { cost: 8, tier: 3, roam: 1 },
  ARACHNOTRON: { cost: 9, tier: 3, roam: 1 }, BARON: { cost: 10, tier: 3, roam: 1 }, ARCHVILE: { cost: 12, tier: 4, roam: 0 },
};

// what a monster did to you, for the message line and the chat
const MONSTER_OBITS = {
  ZOMBIE: '%o was shot by a %m.', SHOTGUY: '%o was shot by a %m.', CHAINGUY: '%o was perforated by a %m.',
  IMP: '%o was burned by a %m.', DEMON: '%o was bitten by a %m.', SPECTRE: '%o was eaten by a %m.',
  LOSTSOUL: '%o was spooked by a %m.', CACO: '%o was smitten by a %m.', KNIGHT: '%o was bruised by a %m.',
  BARON: '%o was bruised by a %m.', REVENANT: '%o couldn\'t evade a %m.', MANCUBUS: '%o was squashed by a %m.',
  ARACHNOTRON: '%o let a %m get them.', PAINELEMENTAL: '%o was spooked by a %m.', ARCHVILE: '%o was incinerated by a %m.',
  CYBERDEMON: '%o was splattered by an %m.', MASTERMIND: '%o stood in front of a %m.',
};

function weightedPick(entries) {
  // entries: [key, weight]
  let total = 0;
  for (const [, w] of entries) total += w;
  if (total <= 0) return null;
  let r = Math.random() * total;
  for (const [k, w] of entries) { r -= w; if (r <= 0) return k; }
  return entries[entries.length - 1][0];
}

class MonsterDirector {
  constructor(arena, mode, opts) {
    this.a = arena;
    this.mode = mode;                 // 'boss' | 'roam'
    this.cfg = Object.assign({ waves: 5, lives: 3, maxAlive: 36, roamCount: 0, spawnGap: 1.2 * TICRATE, waveGap: 6 * TICRATE }, opts || {});
    this.wave = 0;                    // boss: 1..waves (waves = the boss wave)
    this.queue = [];                  // monster type keys still to appear in this wave
    this.spawned = 0; this.killed = 0; this.bossKilled = 0; this.bossCount = 0;
    this.nextSpawn = 0; this.nextWave = 0;
    this.won = false; this.started = false;
    this.spots = null;
    this.events = arena.events;
  }

  // ---------------------------------------------------------------- planning
  alive() {
    let n = 0;
    for (const m of this.a.mobjs) if (m.info.kind === 'monster' && m.health > 0) n++;
    return n;
  }

  players() { return Array.from(this.a.players.values()).filter((p) => !p.spectating && p.mo && !p.mo.removed); }

  levelArea() { const bb = this.a.level.data.bb; return bb ? (bb[2] - bb[0]) * (bb[3] - bb[1]) : 1e6; }

  // the monsters of a wave, picked from the tiers open so far; later waves lean towards the big ones
  planWave(w, n) {
    const base = 4 + 2.5 * Math.min(16, n);
    const budget = base * (0.7 + 0.4 * w);
    const maxTier = Math.min(4, w - 1 + (w >= 3 ? 1 : 0));
    const list = [];
    let spent = 0, guard = 0;
    while (spent < budget && guard++ < 200) {
      const entries = Object.entries(MONSTER_ROSTER).filter(([, r]) => r.tier <= maxTier).map(([k, r]) => {
        // weight: cheap ones common early, the tier of the week more likely later
        const w0 = r.tier === maxTier ? 4 : r.tier === maxTier - 1 ? 3 : 2;
        return [k, w0 / Math.sqrt(r.cost)];
      });
      const k = weightedPick(entries);
      if (!k) break;
      if (spent + MONSTER_ROSTER[k].cost > budget * 1.15) continue;
      list.push(k); spent += MONSTER_ROSTER[k].cost;
    }
    return list;
  }

  // the boss (and an escort) for this arena: whoever actually fits in the level
  planBoss(n) {
    const m = Math.max(0.5, Math.min(2.5, 0.4 + 0.12 * Math.min(16, n)));   // health scale by player count
    const fits = (key) => !!this.findSpot(MOBJINFO[MT[key]], 0, true);
    const options = [];
    if (fits('CYBERDEMON')) options.push({ key: 'cyber', weight: 5 });
    if (n >= 6 && fits('MASTERMIND')) options.push({ key: 'spider', weight: 3 });
    options.push({ key: 'lords', weight: fits('CYBERDEMON') ? 2 : 5 });
    const pick = weightedPick(options.map((o) => [o.key, o.weight]));
    const bosses = [];
    if (pick === 'cyber') bosses.push({ type: 'CYBERDEMON', health: Math.round(4000 * m) });
    else if (pick === 'spider') bosses.push({ type: 'MASTERMIND', health: Math.round(3000 * m) });
    else { const k = 1 + Math.ceil(n / 4); for (let i = 0; i < k; i++) bosses.push({ type: 'BARON', health: Math.round(1000 * (1 + m / 2)) }); }
    const escort = this.planWave(2, n).slice(0, 3 + Math.floor(n / 2));
    return { bosses, escort, name: pick === 'lords' ? 'PAIN LORDS' : MOBJINFO[MT[bosses[0].type]].name.toUpperCase() };
  }

  // ---------------------------------------------------------------- spawn spots
  candidateSpots() {
    if (this.spots) return this.spots;
    const L = this.a.level;
    const pts = [];
    for (const s of this.a.dmstarts) pts.push({ x: s.x, y: s.y });
    for (const t of L.things) {
      const mt = DOOMEDNUM[t[3]];
      if (mt === undefined) continue;
      const k = MOBJINFO[mt].kind;
      if (k === 'item' || k === 'teleportdest') pts.push({ x: t[0], y: t[1] });
    }
    // only places a walker can reach from the deathmatch starts (no pits, no closed-off corners), at least 96 apart
    const reach = this.reachable();
    const out = [];
    for (const p of pts) {
      if (reach && !reach.has(L.sectorAt(p.x, p.y).id)) continue;
      if (!out.some((q) => Math.abs(q.x - p.x) < 96 && Math.abs(q.y - p.y) < 96)) out.push(p);
    }
    this.spots = out;
    return out;
  }

  // sectors connected to the deathmatch starts through the bots' sector graph (doors, lifts and teleporters included)
  reachable() {
    const L = this.a.level;
    if (!this.a.dmstarts.length) return null;
    const nav = buildNav(L);
    const seen = new Set();
    const stack = this.a.dmstarts.map((s) => L.sectorAt(s.x, s.y).id);
    while (stack.length) {
      const id = stack.pop();
      if (seen.has(id)) continue;
      seen.add(id);
      for (const e of nav[id]) if (!seen.has(e.to)) stack.push(e.to);
    }
    return seen;
  }

  // a spot where this monster fits, as far from players as possible and preferably out of their sight
  findSpot(info, minDist, quiet, close) {
    const players = this.players();
    let cands = this.candidateSpots().map((s) => {
      let near = 1e9;
      for (const p of players) near = Math.min(near, Math.hypot(p.mo.x - s.x, p.mo.y - s.y));
      return { s, near };
    });
    // close: the nearest spots to the players that still keep minDist (stragglers are brought to the fight)
    if (close) { const ok = cands.filter((c) => c.near >= (minDist || 0)); cands = (ok.length ? ok : cands).sort((a, b) => a.near - b.near); }
    else cands.sort((a, b) => b.near - a.near);
    const tries = cands.slice(0, 24);
    let best = null;
    for (const c of tries) {
      if (c.near < (minDist || 0) && best) break;
      // step aside from whoever already stands there (a wave arrives at the same few far-away spots)
      const f = this.a.fitSpot(c.s.x, c.s.y, 128, null, info.radius, info.height);
      if (!f) continue;
      let visible = false;
      if (!quiet && players.length) {
        const probe = { x: f.x, y: f.y, z: this.a.level.sectorAt(f.x, f.y).floorheight, height: info.height, sector: null };
        for (const p of players) if (checkSight(p.mo, probe)) { visible = true; break; }
      }
      const score = close ? -c.near : c.near + (visible ? -500 : 0);
      if (!best || score > best.score) best = { x: f.x, y: f.y, score, near: c.near };
      if (close || (!visible && c.near >= (minDist || 0))) break;
    }
    return best;
  }

  spawn(type, opts) {
    const info = MOBJINFO[MT[type]];
    const spot = this.findSpot(info, opts && opts.minDist !== undefined ? opts.minDist : 500, false, !!(opts && opts.close));
    if (!spot) return null;
    const a = this.a;
    const mo = spawnMobj(spot.x, spot.y, ONFLOORZ, MT[type]);
    // the spot was checked with a probe; check again with the real thing (a step or a ledge inside its radius is fine)
    if (!checkPosition(mo, spot.x, spot.y) || TM.ceilingz - TM.floorz < mo.height) { removeMobj(mo); return null; }
    mo.floorz = TM.floorz; mo.ceilingz = TM.ceilingz; mo.z = TM.floorz; mo.pz = mo.z;
    mo.angle = mo.pangle = Math.floor(Math.random() * 8) * 45;
    if (opts && opts.health) { mo.health = opts.health; mo.maxHealth = opts.health; }
    if (opts && opts.boss) { mo.boss = true; this.bossCount++; }
    mo.wave = this.wave;
    // monsters appear through a teleporter, like in Doom
    const fog = spawnMobj(spot.x, spot.y, mo.z, MT.TFOG);
    startSound(fog, 'telept');
    // most arrive awake: a player somewhere in the level is their target straight away
    const list = this.players();
    if (list.length && !(opts && opts.sleep)) {
      const t = list[Math.floor(Math.random() * list.length)];
      mo.target = t.mo; mo.threshold = BASETHRESHOLD;
      setMobjState(mo, info.seestate);
    }
    this.spawned++;
    a.onMonsterSpawned(mo, null);
    return mo;
  }

  // ---------------------------------------------------------------- per tic
  tic() {
    const a = this.a;
    if (a.finished) return;
    if (this.mode === 'roam') return this.ticRoam();
    return this.ticBoss();
  }

  ticRoam() {
    const a = this.a;
    if (!this.started) { this.started = true; this.nextSpawn = a.leveltime; }
    if (a.leveltime < this.nextSpawn) return;
    const alive = this.alive();
    const want = this.cfg.roamCount;
    if (alive >= want) { this.nextSpawn = a.leveltime + TICRATE; return; }
    const entries = Object.entries(MONSTER_ROSTER).filter(([, r]) => r.roam > 0).map(([k, r]) => [k, r.roam]);
    const type = weightedPick(entries);
    // the first few come at once (before the countdown ends), later ones one at a time
    const first = this.spawned < want;
    if (this.spawn(type, { minDist: 600, sleep: first })) this.nextSpawn = a.leveltime + (first ? 2 : 15 * TICRATE + Math.floor(Math.random() * 10 * TICRATE));
    else this.nextSpawn = a.leveltime + 2 * TICRATE;
  }

  ticBoss() {
    const a = this.a;
    const n = Math.max(1, this.players().length);
    if (!this.started) {
      this.started = true;
      this.nextWave = a.leveltime + a.countdown + TICRATE;   // the first wave comes right after the countdown
      return;
    }
    if (this.nextWave) {
      if (a.leveltime >= this.nextWave) this.startWave(n);
      return;
    }
    const alive = this.alive();
    if (this.queue.length) {
      if (a.leveltime < this.nextSpawn) return;
      // trickle the wave in, up to the alive cap (the first few arrive quickly, the rest more slowly)
      const cap = Math.min(this.cfg.maxAlive, 8 + 2 * n, 6 + Math.round(this.levelArea() / 120000));
      if (alive >= cap) { this.nextSpawn = a.leveltime + TICRATE; return; }
      const item = this.queue[0];
      const mo = this.spawn(item.type, { health: item.health, boss: item.boss, minDist: item.boss ? 700 : 500 });
      if (mo) { this.queue.shift(); this.spawnFails = 0; }
      else if (++this.spawnFails > 3) { this.queue.shift(); this.spawnFails = 0; }   // nowhere to put it: skip it
      this.nextSpawn = a.leveltime + (alive < Math.min(cap, 4 + n) ? 6 : this.cfg.spawnGap);
      return;
    }
    if ((a.leveltime % (5 * TICRATE)) === 0) this.unstick();
    // the whole wave is out
    if (this.wave >= this.cfg.waves) {
      if (!this.won && (this.bossCount === 0 || this.bossKilled >= this.bossCount) && (this.bossCount > 0 || alive === 0)) {
        this.won = true;
        this.events.push({ type: 'bossDown' });
      }
    } else if (alive === 0) {
      this.nextWave = a.leveltime + this.cfg.waveGap;
      this.events.push({ type: 'waveCleared', wave: this.wave, next: this.wave + 1 });
    }
  }

  startWave(n) {
    this.nextWave = 0;
    this.wave++;
    this.spawnFails = 0;
    if (this.wave >= this.cfg.waves) {
      const plan = this.planBoss(n);
      this.bossPlan = plan;
      /** @type {any[]} */ const q = plan.bosses.map((b) => ({ type: b.type, health: b.health, boss: true }));
      this.queue = q.concat(plan.escort.map((t) => ({ type: t })));
      this.events.push({ type: 'bossWave', wave: this.wave, name: plan.name });
    } else {
      this.queue = this.planWave(this.wave, n).map((t) => ({ type: t }));
      this.events.push({ type: 'wave', wave: this.wave, of: this.cfg.waves, count: this.queue.length });
    }
    this.nextSpawn = this.a.leveltime;
    this.waveStart = this.a.leveltime; this.lastKill = 0;
  }

  // a monster that has not moved for 25 s while its players are far away is somewhere it can't get out of (a pit, a
  // closed-off corner): it comes back through a teleporter near the players
  unstick() {
    const a = this.a;
    const players = this.players();
    for (const m of Array.from(a.mobjs)) {
      if (m.info.kind !== 'monster' || m.health <= 0) continue;
      const moved = m.lastPos ? Math.hypot(m.x - m.lastPos.x, m.y - m.lastPos.y) : 1e9;
      if (moved > 48) { m.lastPos = { x: m.x, y: m.y }; m.stillSince = a.leveltime; continue; }
      if (!m.lastPos) { m.lastPos = { x: m.x, y: m.y }; m.stillSince = a.leveltime; continue; }
      let near = 1e9;
      for (const p of players) near = Math.min(near, Math.hypot(p.mo.x - m.x, p.mo.y - m.y));
      if (near < 400 || a.leveltime - m.stillSince < 25 * TICRATE) continue;
      const re = this.spawn(m.info.key, { health: m.health, boss: m.boss, minDist: 350, close: true });
      if (re) { if (m.boss) this.bossCount--; this.spawned--; removeMobj(m); }
      else m.stillSince = a.leveltime;
    }
  }

  left() { return this.queue.length + this.alive(); }

  onKilled(mo, source) {
    this.killed++;
    this.lastKill = this.a.leveltime;
    if (mo.boss) this.bossKilled++;
  }
}
