// ===================================================================================
// Part 7: round manager - splits players into arenas, picks modes and maps, scores,
// spectating, late joiners, leavers and AFK handling. Engine-agnostic.
// ===================================================================================

const MODES = {
  ffa: { name: 'FREE FOR ALL', teams: false, respawn: true, minPlayers: 2 },
  tdm: { name: 'TEAM DEATHMATCH', teams: true, respawn: true, minPlayers: 4 },
  elim: { name: 'TEAM ELIMINATION', teams: true, respawn: false, minPlayers: 4 },
  lms: { name: 'LAST MAN STANDING', teams: false, respawn: false, minPlayers: 2 },
};
const TEAM_NAMES = ['RED', 'BLUE'];

// arena sizes: fill to 16 first, minimum 6, unless the other three arenas are full
function arenaSizes(n, cfg) {
  const max = cfg.arenaMax, min = cfg.arenaMin, maxArenas = cfg.maxArenas;
  if (n <= 0) return [];
  if (n <= max) return [n];
  const count = Math.min(maxArenas, Math.ceil(n / max));
  const sizes = new Array(count).fill(0);
  let left = Math.min(n, max * count);
  for (let i = 0; i < count; i++) { sizes[i] = Math.min(max, left); left -= sizes[i]; }
  const last = count - 1;
  if (sizes[last] < min && count < maxArenas) {
    // borrow from earlier arenas until the last reaches the minimum
    for (let i = last - 1; i >= 0 && sizes[last] < min; i--) {
      while (sizes[last] < min && sizes[i] > min) { sizes[i]--; sizes[last]++; }
    }
  }
  if (sizes[last] < 2 && count > 1) {
    // a single leftover player can't play alone: take one from the previous arena
    sizes[last - 1]--; sizes[last]++;
  }
  return sizes;
}

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

class RoundManager {
  constructor(levelData, cfg) {
    this.levels = levelData;      // array of converted level records
    this.cfg = cfg;
    this.arenas = [];
    this.state = 'idle';          // idle | running | over
    this.time = 0;                // tics since round start
    this.modeKey = null;
    this.modeHistory = [];
    this.mapHistory = [];
    this.people = new Map();      // slot -> { slot, name, csTeam, bot, arena, player, status, lastActive, afk }
    this.events = [];
    this.roundNumber = 0;
  }

  // ------------------------------------------------------------------ people
  person(slot) { return this.people.get(slot); }

  addPerson(slot, name, csTeam, bot) {
    let pe = this.people.get(slot);
    if (!pe) {
      pe = { slot, name, csTeam, bot: !!bot, arena: null, player: null, status: 'none', lastActive: this.time, afk: false, spec: null };
      this.people.set(slot, pe);
    } else { pe.name = name; pe.csTeam = csTeam; pe.bot = !!bot; }
    return pe;
  }

  removePerson(slot) {
    const pe = this.people.get(slot);
    if (!pe) return;
    this.leaveArena(pe, 'left');
    this.people.delete(slot);
    this.checkAllEnds();
  }

  markActive(slot) {
    const pe = this.people.get(slot);
    if (!pe) return;
    pe.lastActive = this.time;
    if (pe.afk) { pe.afk = false; this.events.push({ type: 'afkClear', person: pe }); }
  }

  // ------------------------------------------------------------------ round start
  pickMode(arenaSizesList) {
    const w = Object.assign({}, this.cfg.modeWeights);
    const h = this.modeHistory;
    if (h.length >= 2 && h[h.length - 1] === h[h.length - 2]) w[h[h.length - 1]] = 0;
    const largest = Math.max(...arenaSizesList);
    for (const k of Object.keys(w)) if (largest < MODES[k].minPlayers) w[k] = 0;
    let total = 0; for (const k in w) total += w[k];
    if (total <= 0) return 'ffa';
    let r = Math.random() * total;
    for (const k in w) { r -= w[k]; if (r <= 0) return k; }
    return 'ffa';
  }

  pickMap(players, used) {
    const want = Math.max(4, players) * this.cfg.areaPerPlayer;
    const recent = this.mapHistory.slice(-this.cfg.mapRepeatGap);
    let cands = this.levels.filter((L) => !used.has(L.id) && !recent.includes(L.id) && !(this.cfg.mapBlacklist || []).includes(L.id));
    if (!cands.length) cands = this.levels.filter((L) => !used.has(L.id));
    if (!cands.length) cands = this.levels.slice();
    const area = (L) => (L.bb[2] - L.bb[0]) * (L.bb[3] - L.bb[1]);
    cands.sort((a, b) => Math.abs(Math.log(area(a) / want)) - Math.abs(Math.log(area(b) / want)));
    const top = cands.slice(0, Math.min(5, cands.length));
    return top[Math.floor(Math.random() * top.length)];
  }

  startRound(forceMode) {
    this.endRoundCleanup();
    const eligible = [];
    for (const pe of this.people.values()) {
      if (pe.csTeam !== 2 && pe.csTeam !== 3) continue;
      if (pe.afk && !pe.bot) { pe.status = 'none'; continue; }
      if (pe.notReady) continue;
      eligible.push(pe);
    }
    this.roundNumber++;
    this.time = 0;
    if (eligible.length < this.cfg.minPlayersToStart) {
      this.state = 'idle';
      this.events.push({ type: 'notEnough', count: eligible.length });
      return false;
    }
    const sizes = arenaSizes(eligible.length, this.cfg);
    const modeKey = forceMode || this.pickMode(sizes);
    this.modeKey = modeKey;
    this.modeHistory.push(modeKey); if (this.modeHistory.length > 10) this.modeHistory.shift();
    const mode = MODES[modeKey];
    // split players
    let groups;
    if (mode.teams) {
      const ts = shuffle(eligible.filter((p) => p.csTeam === 2));
      const cts = shuffle(eligible.filter((p) => p.csTeam === 3));
      groups = sizes.map(() => []);
      // proportional T quota per arena, remainder to the last
      let tLeft = ts.length, ctLeft = cts.length;
      sizes.forEach((sz, i) => {
        let tq = i === sizes.length - 1 ? tLeft : Math.round(sz * ts.length / eligible.length);
        tq = Math.max(0, Math.min(tq, tLeft, sz));
        let cq = sz - tq;
        if (cq > ctLeft) { tq += cq - ctLeft; cq = ctLeft; }
        tq = Math.min(tq, tLeft);
        for (let k = 0; k < tq; k++) groups[i].push(ts.pop());
        for (let k = 0; k < cq; k++) groups[i].push(cts.pop());
        tLeft -= tq; ctLeft -= cq;
      });
      const rest = ts.concat(cts);
      for (const p of rest) { groups.sort((a, b) => a.length - b.length); groups[0].push(p); }
    } else {
      const all = shuffle(eligible.slice());
      groups = []; let k = 0;
      for (const sz of sizes) { groups.push(all.slice(k, k + sz)); k += sz; }
    }
    // build arenas
    this.arenas = [];
    const used = new Set();
    groups.forEach((grp, i) => {
      if (!grp.length) return;
      let mk = modeKey;
      const tCount = grp.filter((p) => p.csTeam === 2).length, ctCount = grp.length - tCount;
      if (MODES[mk].teams && (grp.length < MODES[mk].minPlayers || !tCount || !ctCount)) mk = MODES[mk].respawn ? 'ffa' : 'lms';
      if (grp.length < 2) mk = 'ffa';
      const L = this.pickMap(grp.length, used);
      used.add(L.id);
      this.mapHistory.push(L.id); if (this.mapHistory.length > 40) this.mapHistory.shift();
      const arena = new Arena(i, Object.assign({}, this.cfg.arena));
      arena.load(L);
      arena.modeKey = mk; arena.mode = MODES[mk];
      arena.teamsActive = MODES[mk].teams;
      arena.friendlyFire = this.cfg.friendlyFire;
      arena.mapId = L.id; arena.mapTitle = L.title;
      const n = grp.length;
      arena.target = mk === 'ffa' ? Math.min(this.cfg.ffaFrags, 6 + 2 * n) : mk === 'tdm' ? Math.min(this.cfg.tdmFrags, 4 * n) : 0;
      arena.startTime = this.time;
      arena.countdown = this.cfg.countdownTics;
      this.arenas.push(arena);
      grp.forEach((pe, k) => this.joinArena(pe, arena, true));
      const spots = arena.roundStartSpots(grp.map((pe) => pe.player));
      for (const pe of grp) arena.spawnPlayer(pe.player, spots.get(pe.player));
      // the round starts frozen until the countdown ends
      for (const pe of grp) pe.player.frozen = true;
    });
    this.arenas.forEach((a, i) => { a.index = i; });
    this.state = 'running';
    this.events.push({ type: 'roundStart', mode: modeKey, arenas: this.arenas });
    return true;
  }

  joinArena(pe, arena, atStart) {
    const team = arena.teamsActive ? (pe.csTeam === 3 ? 1 : 0) : -1;
    const color = arena.teamsActive ? (team === 0 ? 3 : 1) : this.colorFor(arena);
    const p = arena.addPlayer(pe.slot, pe.name, team, color);
    p.person = pe; p.isBot = pe.bot;
    pe.arena = arena; pe.player = p; pe.status = 'playing'; pe.spec = null;
    pe.lastActive = this.time;
    if (!atStart) {
      arena.spawnPlayer(p);
      this.events.push({ type: 'join', person: pe, arena });
    }
    return p;
  }

  colorFor(arena) {
    const used = new Set(Array.from(arena.players.values()).map((p) => p.color));
    for (let c = 0; c < 16; c++) if (!used.has(c)) return c;
    return 0;
  }

  leaveArena(pe, why) {
    const a = pe.arena;
    if (a && pe.player) {
      const p = pe.player;
      if (p.playerstate === 'live' && !p.spectating && a.mode && !a.mode.respawn && !a.finished) {
        // leaving an elimination arena counts as eliminated
        a.events.push({ type: 'eliminated', victim: p, why });
      }
      a.removePlayer(pe.slot);
      this.events.push({ type: 'leave', person: pe, arena: a, why });
    }
    pe.arena = null; pe.player = null; pe.status = 'none'; pe.spec = null;
  }

  lateJoin(pe) {
    if (this.state !== 'running') return false;
    if (pe.arena) return true;
    const cands = this.arenas.filter((a) => !a.finished && a.mode.respawn && a.players.size < this.cfg.arenaMax &&
      (!a.teamsActive || pe.csTeam === 2 || pe.csTeam === 3));
    if (!cands.length) { this.spectate(pe); return false; }
    cands.sort((a, b) => a.players.size - b.players.size);
    this.joinArena(pe, cands[0], false);
    return true;
  }

  spectate(pe, arena) {
    pe.status = 'spectating';
    if (!pe.spec) pe.spec = { arena: arena ? arena.index : (pe.arena ? pe.arena.index : 0), target: null };
    this.fixSpectate(pe, 0);
  }

  // pick a living player to watch: dir 0 = keep if valid, 1/-1 = cycle, 'arena' = next running arena
  fixSpectate(pe, dir) {
    if (!pe.spec) pe.spec = { arena: 0, target: null };
    const running = this.arenas.filter((a) => !a.finished);
    const pool = running.length ? running : this.arenas;
    if (!pool.length) { pe.spec.target = null; return; }
    let ai = pool.findIndex((a) => a.index === pe.spec.arena);
    if (ai < 0) ai = 0;
    if (dir === 'arena') { ai = (ai + 1) % pool.length; pe.spec.target = null; dir = 0; }
    const arena = pool[ai];
    pe.spec.arena = arena.index;
    const alive = Array.from(arena.players.values()).filter((p) => !p.spectating && p.mo && !p.mo.removed);
    if (!alive.length) { pe.spec.target = null; return; }
    let i = alive.findIndex((p) => p.slot === pe.spec.target);
    if (i < 0) i = 0;
    else if (dir) i = (i + dir + alive.length) % alive.length;
    pe.spec.target = alive[i].slot;
  }

  // ------------------------------------------------------------------ per tic (35 Hz)
  tic(remainingSeconds) {
    if (this.state !== 'running') return;
    this.time++;
    for (const a of this.arenas) {
      if (a.finished && a.time >= a.finishedAt + this.cfg.arenaEndHoldTics) continue;
      a.time = (a.time || 0) + 1;
      if (a.countdown > 0) {
        a.countdown--;
        if (a.countdown === 0) {
          for (const p of a.players.values()) { p.frozen = false; p.protectUntil = a.leveltime + this.cfg.arena.spawnProtectTics; }
          a.events.push({ type: 'fight' });
        }
      }
      for (const p of a.players.values()) {
        if (p.isBot) botThink(a, p);
        if (p.frozen || a.finished) { p.cmd.forwardmove = 0; p.cmd.sidemove = 0; p.cmd.buttons = 0; }
      }
      a.tic();
      this.arenaRules(a);
    }
    this.checkAfk();
    if (remainingSeconds !== undefined && remainingSeconds <= 0) this.timeUp();
    this.checkAllEnds();
  }

  arenaRules(a) {
    if (a.finished) return;
    // drain kill events for elimination bookkeeping
    for (const p of a.players.values()) {
      if (p.spectating) continue;
      if (p.playerstate === 'dead') {
        const deadFor = a.leveltime - p.deathTime;
        if (a.mode.respawn) {
          const gateOk = p.respawnGate !== false;
          const wantEarly = (p.respawnNow || (p.cmd.buttons & (BT_USE | BT_ATTACK))) && deadFor > this.cfg.minRespawnTics;
          if (gateOk && (wantEarly || deadFor > this.cfg.autoRespawnTics)) {
            p.respawnNow = false;
            a.spawnPlayer(p);
            this.events.push({ type: 'respawn', player: p, arena: a });
          }
        } else if (deadFor > this.cfg.elimSpectateTics) {
          a.makeSpectator(p);
          const pe = p.person;
          if (pe) { pe.status = 'spectating'; pe.spec = { arena: a.index, target: p.attacker && p.attacker.player ? p.attacker.player.slot : null }; this.fixSpectate(pe, 0); }
        }
      }
    }
    const players = Array.from(a.players.values());
    const active = players.filter((p) => !p.spectating);
    let winner = null;
    switch (a.modeKey) {
      case 'ffa': {
        const top = players.reduce((b, p) => (!b || p.frags > b.frags ? p : b), null);
        if (top && top.frags >= a.target) winner = { player: top };
        else if (active.length < 2 && this.time > this.cfg.countdownTics) winner = { player: active[0] || top, forfeit: true };
        break;
      }
      case 'tdm': {
        if (a.teamScore[0] >= a.target) winner = { team: 0 };
        else if (a.teamScore[1] >= a.target) winner = { team: 1 };
        else {
          const has = [active.some((p) => p.team === 0), active.some((p) => p.team === 1)];
          if (!has[0] || !has[1]) winner = { team: has[0] ? 0 : has[1] ? 1 : -1, forfeit: true };
        }
        break;
      }
      case 'elim': {
        const alive = [0, 0];
        for (const p of active) if (p.playerstate === 'live') alive[p.team]++;
        const pendingDead = active.some((p) => p.playerstate === 'dead');
        if (!alive[0] || !alive[1]) {
          if (!pendingDead || (!alive[0] && !alive[1])) winner = { team: alive[0] ? 0 : alive[1] ? 1 : -1 };
          else if (a.leveltime > 0) winner = { team: alive[0] ? 0 : 1 };
        }
        break;
      }
      case 'lms': {
        const alive = active.filter((p) => p.playerstate === 'live');
        if (alive.length <= 1 && this.time > this.cfg.countdownTics) winner = { player: alive[0] || null };
        break;
      }
    }
    // elimination rounds have their own clock so a hiding last player can't stall the round
    if (!winner && !a.mode.respawn && this.cfg.elimTimeLimitTics && a.time > this.cfg.elimTimeLimitTics) {
      if (a.teamsActive) {
        const alive = [0, 0], hp = [0, 0];
        for (const p of active) if (p.playerstate === 'live') { alive[p.team]++; hp[p.team] += p.health; }
        winner = { team: alive[0] !== alive[1] ? (alive[0] > alive[1] ? 0 : 1) : hp[0] !== hp[1] ? (hp[0] > hp[1] ? 0 : 1) : -1, timeout: true };
      } else {
        const alive = active.filter((p) => p.playerstate === 'live').sort((x, y) => y.health - x.health);
        winner = { player: alive.length && (alive.length === 1 || alive[0].health > alive[1].health) ? alive[0] : null, timeout: true };
      }
    }
    if (winner) this.finishArena(a, winner);
  }

  finishArena(a, winner) {
    if (a.finished) return;
    a.finished = true;
    a.finishedAt = a.time;
    let text;
    if (winner.team !== undefined) text = winner.team >= 0 ? TEAM_NAMES[winner.team] + ' TEAM WINS' : 'DRAW';
    else text = winner.player ? winner.player.name + ' WINS' : 'DRAW';
    a.result = Object.assign({ text }, winner);
    for (const p of a.players.values()) { p.frozenEnd = true; }
    this.events.push({ type: 'arenaEnd', arena: a, result: a.result });
  }

  timeUp() {
    for (const a of this.arenas) {
      if (a.finished) continue;
      const players = Array.from(a.players.values());
      if (a.mode.teams) {
        let s0, s1;
        if (a.modeKey === 'elim') {
          s0 = players.filter((p) => p.team === 0 && p.playerstate === 'live' && !p.spectating).length;
          s1 = players.filter((p) => p.team === 1 && p.playerstate === 'live' && !p.spectating).length;
        } else { s0 = a.teamScore[0]; s1 = a.teamScore[1]; }
        this.finishArena(a, { team: s0 > s1 ? 0 : s1 > s0 ? 1 : -1, timeout: true });
      } else {
        const pool = a.modeKey === 'lms' ? players.filter((p) => p.playerstate === 'live' && !p.spectating) : players;
        const top = pool.slice().sort((x, y) => y.frags - x.frags);
        const tie = top.length > 1 && top[0].frags === top[1].frags && a.modeKey === 'ffa';
        this.finishArena(a, { player: tie ? null : top[0] || null, timeout: true });
      }
    }
  }

  checkAllEnds() {
    if (this.state !== 'running') return;
    // move players of finished arenas to spectating once the hold time has passed
    for (const a of this.arenas) {
      if (!a.finished || a.time < a.finishedAt + this.cfg.arenaEndHoldTics) continue;
      for (const p of a.players.values()) {
        const pe = p.person;
        if (pe && pe.status === 'playing') { pe.status = 'spectating'; pe.spec = { arena: a.index, target: null }; this.fixSpectate(pe, 'arena'); }
      }
    }
    if (this.arenas.length && this.arenas.every((a) => a.finished)) {
      if (this.arenas.every((a) => a.time >= a.finishedAt + this.cfg.arenaEndHoldTics)) {
        this.state = 'over';
        this.events.push({ type: 'roundOver', arenas: this.arenas });
      }
    }
  }

  checkAfk() {
    if (!this.cfg.afkKickTics) return;
    for (const pe of this.people.values()) {
      if (pe.bot || pe.status !== 'playing') continue;
      const idle = this.time - pe.lastActive;
      if (idle === this.cfg.afkWarnTics) this.events.push({ type: 'afkWarn', person: pe });
      if (idle >= this.cfg.afkKickTics) {
        pe.afk = true;
        const a = pe.arena;
        this.leaveArena(pe, 'afk');
        this.events.push({ type: 'afk', person: pe });
        this.spectate(pe, a);
      }
    }
  }

  endRoundCleanup() {
    for (const pe of this.people.values()) { pe.arena = null; pe.player = null; pe.status = 'none'; pe.spec = null; }
    this.arenas = [];
  }
}
