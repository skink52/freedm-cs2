// ---------------------------------------------------------------- main loop and CS2 round flow

let rm = null;
const views = new Map();          // Arena -> ArenaView
let ready = false;
let lastTime = 0, acc = 0;
let phase = "lobby";              // lobby | running | ending
let startAt = 0;                  // game time when we may start the next Doom round
let lastPeopleScan = 0;
const pendingKills = [];          // respawn modes: { at, victim, killer }
const elimKills = [];             // elimination modes: applied when the round ends
const allowDamage = new Set();
const specEdges = new Map();      // slot -> { next, prev, arena }
let realKillsBroken = false;
const centerMsgs = new Map();     // arena -> { text, until }

function buildCfg() {
  const c = JSON.parse(JSON.stringify(DEFAULT_CFG));
  c.modeWeights = Object.assign({}, CONFIG.MODE_WEIGHTS);
  c.ffaFrags = CONFIG.FFA_FRAGS; c.tdmFrags = CONFIG.TDM_FRAGS;
  c.arenaMax = CONFIG.ARENA_MAX; c.arenaMin = CONFIG.ARENA_MIN; c.maxArenas = CONFIG.MAX_ARENAS;
  c.minPlayersToStart = CONFIG.MIN_PLAYERS;
  c.friendlyFire = CONFIG.FRIENDLY_FIRE;
  c.mapBlacklist = CONFIG.MAP_BLACKLIST.slice();
  c.afkWarnTics = CONFIG.AFK_WARN * TICRATE; c.afkKickTics = CONFIG.AFK_KICK * TICRATE;
  c.elimTimeLimitTics = CONFIG.ELIM_SECONDS * TICRATE;
  c.arena.altdeath = CONFIG.ITEMS_RESPAWN;
  c.arena.freelookAim = CONFIG.FREELOOK_AIM;
  c.arena.botSkill = CONFIG.BOT_SKILL;
  // with real kills the CS2 respawn opens the gate; this is only the fallback
  c.autoRespawnTics = CONFIG.REAL_KILLS ? 8 * TICRATE : 3 * TICRATE;
  return c;
}

function cvars(list) { if (CONFIG.APPLY_CVARS) for (const c of list) Instance.ServerCommand(c); }

function init() {
  rm = new RoundManager(LEVELS, buildCfg());
  findPropTemplate();
  hud();
  scanPeople(true);
  cvars(CONFIG.CVARS_ALWAYS);
  ready = true;
  lastTime = Instance.GetGameTime();
  startAt = lastTime + 1;
  log(`v${VERSION} ready: ${LEVELS.length} levels, ${Object.keys(SPRITE_MODELS).length} sprite models, HUD ${hud() ? "on" : "MISSING"}, prop template ${findPropTemplate() ? "on" : "MISSING"}`);
}

function scanPeople(force) {
  const now = Instance.GetGameTime();
  if (!force && now - lastPeopleScan < 1) return;
  lastPeopleScan = now;
  const seen = new Set();
  for (const c of Instance.GetAllPlayerControllers()) {
    if (!c || !c.IsConnected()) continue;
    const slot = c.GetPlayerSlot();
    seen.add(slot);
    const bot = c.IsBot();
    if (bot && !CONFIG.CS2_BOTS_PLAY) continue;
    rm.addPerson(slot, c.GetPlayerName(), c.GetTeamNumber(), bot);
  }
  for (const slot of Array.from(rm.people.keys())) if (!seen.has(slot)) dropPerson(slot);
}

function dropPerson(slot) {
  rm.removePerson(slot);
  parked.delete(slot);
  hudCache.delete(slot);
  specEdges.delete(slot);
}

// ---------------------------------------------------------------- round flow
function startDoomRound() {
  scanPeople(true);
  if (!rm.startRound()) { startAt = Instance.GetGameTime() + 5; return; }
  phase = "running";
  const respawn = MODES[rm.modeKey].respawn;
  cvars(["mp_ignore_round_win_conditions 1"]);
  cvars(respawn ? CONFIG.RESPAWN_CVARS_ON : CONFIG.RESPAWN_CVARS_OFF);
  cvars([MODES[rm.modeKey].teams ? "mp_teammates_are_enemies 0" : "mp_teammates_are_enemies 1"]);
  guard("roundtime", () => Instance.SetRoundRemainingTime(CONFIG.ROUND_SECONDS + CONFIG.ROUND_SLACK));
  pendingKills.length = 0; elimKills.length = 0;
  for (const a of rm.arenas) {
    views.set(a, new ArenaView(a));
    centerMsgs.set(a, { text: MODES[a.modeKey].name, until: Instance.GetGameTime() + 3 });
  }
  for (const pe of rm.people.values()) {
    if (pe.status !== "playing") continue;
    if (park(pe.slot) && pe.player && pe.player.mo) faceView(pe.slot, pe.player.mo.angle);
  }
  const desc = rm.arenas.map((a) => `${a.mapTitle} (${a.players.size})`).join(", ");
  sayAll(`DOOM: ${MODES[rm.modeKey].name} - ${desc}`);
}

function endDoomRound() {
  if (phase !== "running") return;
  phase = "ending";
  // elimination kills go to CS2 now, in the order they happened
  if (CONFIG.REAL_KILLS && !Instance.IsWarmupPeriod()) for (const k of elimKills) csKill(k.victim, k.killer);
  elimKills.length = 0;
  const lines = rm.arenas.map((a) => `${a.mapTitle}: ${a.result ? a.result.text : "-"}`);
  sayAll("DOOM round over - " + lines.join(" | "));
  cvars(["mp_ignore_round_win_conditions 0"]);
  // the CS2 round winner: the side that won more arenas (a free-for-all arena goes to its winner's side)
  const wins = { 2: 0, 3: 0 };
  for (const a of rm.arenas) {
    const r = a.result;
    if (!r) continue;
    if (r.team !== undefined) { if (r.team === 0) wins[2]++; else if (r.team === 1) wins[3]++; }
    else if (r.player && r.player.person && wins[r.player.person.csTeam] !== undefined) wins[r.player.person.csTeam]++;
  }
  const reason = wins[2] > wins[3] ? CSRoundEndReason.TERRORISTS_WIN : wins[3] > wins[2] ? CSRoundEndReason.CTS_WIN : CSRoundEndReason.DRAW;
  if (live(Instance.FindEntityByName(CONFIG.MAP_PARAMS))) {
    log(`FireWinCondition ${reason} (arenas won: T ${wins[2]}, CT ${wins[3]})`);
    guard("wincond", () => Instance.EntFireAtName({ name: CONFIG.MAP_PARAMS, input: "FireWinCondition", value: reason }));
  } else {
    warnOnce("nomapparams", "no " + CONFIG.MAP_PARAMS + " entity: rounds end on the clock as draws");
    guard("endround", () => Instance.SetRoundRemainingTime(1));
  }
}

function cleanupRound(entitiesGone) {
  for (const v of views.values()) {
    if (entitiesGone) { v.props.clear(); v.movers = []; v.anchors = null; }
    else { v.destroy(); if (v.anchors) v.anchors.release(); }
  }
  views.clear();
  for (const slot of Array.from(parked.keys())) unpark(slot);
  if (entitiesGone) { freeProps.length = 0; propTemplate = undefined; hudEnt = undefined; boothEnt = undefined; soundEnts.clear(); }
  rm.endRoundCleanup();
  rm.state = "idle";
  pendingKills.length = 0; elimKills.length = 0;
  phase = "lobby";
}

// ---------------------------------------------------------------- CS2 kills
function csKill(victimSlot, killerSlot) {
  const vp = pawnOf(victimSlot);
  if (!vp || !vp.IsAlive()) return false;
  let attacker = killerSlot !== undefined && killerSlot !== victimSlot ? pawnOf(killerSlot) : vp;
  if (attacker && !attacker.IsAlive()) attacker = controllerOf(killerSlot) || undefined;
  allowDamage.add(victimSlot);
  guard("cskill", () => vp.TakeDamage({
    damage: 1000, attacker, inflictor: attacker,
    damageTypes: CSDamageTypes.BULLET, damageFlags: CSDamageFlags.FORCE_DEATH | CSDamageFlags.IGNORE_ARMOR,
  }));
  allowDamage.delete(victimSlot);
  const died = !live(vp) || !vp.IsAlive();
  const vc = controllerOf(victimSlot), kc = killerSlot !== victimSlot ? controllerOf(killerSlot) : undefined;
  if ((vc && !vc.IsBot()) || (kc && !kc.IsBot())) guard("killlog", () => log(`CS2 kill: ${kc ? kc.GetPlayerName() + " (team " + kc.GetTeamNumber() + ", score " + kc.GetScore() + ")" : "self/world"} -> ${vc ? vc.GetPlayerName() + " (team " + vc.GetTeamNumber() + ")" : victimSlot}${died ? "" : " BLOCKED"}`));
  if (!died) warnOnce("killblocked", "a scripted CS2 kill was blocked (plugin or damage settings?) - frags still count in Doom");
  return died;
}

function onDoomKill(arena, e) {
  const v = e.victim, k = e.killer;
  // obituary on the message line of the two players involved (the CS2 killfeed shows everyone)
  for (const p of [v, k]) if (p) { p.message = e.text; p.messageTime = arena.leveltime; }
  if (CONFIG.REAL_KILLS && Instance.IsWarmupPeriod()) warnOnce("warmupkills", "warmup: Doom frags are not sent to the CS2 scoreboard until warmup ends");
  if (!CONFIG.REAL_KILLS || realKillsBroken || Instance.IsWarmupPeriod()) {
    if (CONFIG.ADD_SCORE) {
      const c = controllerOf(k ? k.slot : v.slot);
      if (c) guard("addscore", () => c.AddScore(k ? 1 : -1));
    }
    return;
  }
  if (arena.mode.respawn) {
    v.respawnGate = false;
    pendingKills.push({ at: Instance.GetGameTime() + CONFIG.KILL_DELAY, victim: v.slot, killer: k ? k.slot : v.slot, player: v, since: Instance.GetGameTime() });
  } else {
    elimKills.push({ victim: v.slot, killer: k ? k.slot : v.slot });
  }
}

function processKills(now) {
  for (let i = pendingKills.length - 1; i >= 0; i--) {
    const k = pendingKills[i];
    if (k.done) {
      // waiting for CS2 to respawn the pawn
      if (now - k.at > 8) {
        k.player.respawnGate = true; pendingKills.splice(i, 1);
        if (!realKillsBroken) { realKillsBroken = true; log("CS2 did not respawn a killed player within 8 s - check mp_respawn_on_death_t/ct. Real kills are off until the map changes."); }
      }
      continue;
    }
    if (now < k.at) continue;
    const pe = rm.person(k.victim);
    if (!pe || !pe.player || pe.player !== k.player) { pendingKills.splice(i, 1); continue; }
    if (csKill(k.victim, k.killer)) { k.done = true; parked.delete(k.victim); }
    else { k.player.respawnGate = true; pendingKills.splice(i, 1); }
  }
}

// ---------------------------------------------------------------- events from the playsim
function handleArenaEvents(a) {
  const view = views.get(a);
  for (const e of a.events) {
    switch (e.type) {
      case "sound": if (view) playSound(view, e); break;
      case "localsound": if (view && e.player.mo) playSound(view, { sfx: e.sfx, mo: e.player.mo, x: e.player.mo.x, y: e.player.mo.y, z: e.player.mo.z + 40 }); break;
      case "msg": e.player.message = e.text; e.player.messageTime = a.leveltime; break;
      case "kill": onDoomKill(a, e); break;
      case "teleport": case "spawn": faceView(e.player.slot, e.angle); break;
      case "fight": centerMsgs.set(a, { text: "FIGHT!", until: Instance.GetGameTime() + 1.2 }); break;
    }
  }
  a.events.length = 0;
}

function handleRoundEvents() {
  for (const e of rm.events) {
    switch (e.type) {
      case "arenaEnd":
        centerMsgs.set(e.arena, { text: e.result.text, until: Instance.GetGameTime() + 4 });
        sayAll(`${e.arena.mapTitle}: ${e.result.text}`);
        break;
      case "afkWarn":
        if (e.person.player) { e.person.player.message = "MOVE OR YOU WILL BE MARKED AFK"; e.person.player.messageTime = e.person.arena ? e.person.arena.leveltime : 0; }
        break;
      case "afk":
        sayAll(`${e.person.name} is AFK and now spectating (type !back to play next round)`);
        break;
      case "roundOver":
        endDoomRound();
        break;
    }
  }
  rm.events.length = 0;
}

// ---------------------------------------------------------------- per-tick work
function infoFor(pe, now) {
  const a = pe.arena || (pe.spec ? rm.arenas[pe.spec.arena] : null);
  if (!a) return { line1: "", line2: "", center: "", spec: "" };
  const mode = MODES[a.modeKey];
  let line1 = mode.name;
  if (a.target) line1 += " - FIRST TO " + a.target;
  else if (!mode.respawn && rm.cfg.elimTimeLimitTics) {
    const left = Math.max(0, Math.ceil((rm.cfg.elimTimeLimitTics - a.time) / TICRATE));
    line1 += " " + Math.floor(left / 60) + ":" + String(left % 60).padStart(2, "0");
  }
  let line2 = "";
  if (a.teamsActive) {
    if (a.modeKey === "elim") {
      const alive = [0, 0];
      for (const p of a.players.values()) if (!p.spectating && p.playerstate === "live") alive[p.team]++;
      line2 = `RED ${alive[0]} ALIVE  BLUE ${alive[1]} ALIVE`;
    } else line2 = `RED ${a.teamScore[0]}  BLUE ${a.teamScore[1]}`;
  } else if (a.modeKey === "lms") {
    line2 = `${Array.from(a.players.values()).filter((p) => !p.spectating && p.playerstate === "live").length} LEFT`;
  } else {
    let best = null;
    for (const p of a.players.values()) if (!best || p.frags > best.frags) best = p;
    if (best) line2 = `LEADER ${best.name.slice(0, 16)} ${best.frags}`;
  }
  let center = "";
  const cm = centerMsgs.get(a);
  if (a.countdown > 0) center = String(Math.ceil(a.countdown / TICRATE));
  else if (cm && now < cm.until) center = cm.text;
  else if (a.finished && a.result) center = a.result.text;
  let spec = "";
  if (pe.status === "spectating" && pe.spec) {
    const t = a.players.get(pe.spec.target);
    spec = t ? "SPECTATING " + t.name.slice(0, 20) : "SPECTATING";
  } else if (pe.player && pe.player.playerstate === "dead" && a.mode.respawn) spec = "RESPAWNING...";
  if (!spec && pe.helpUntil > now) spec = "CHAT: !SPEC  !AFK  !BACK  !HUD";
  return { line1, line2, center, spec, sbar: pe.hudPos };
}

let lobbyNext = 0, lobbyCycle = 0, lobbyWaiting = 0;   // lobbyCycle: which arena the lobby status shows (changes every 3 s)
function lobbyInfo(pe, now) {
  const info = { line1: "", line2: "", center: "", spec: "" };
  if (phase === "running") {
    const rem = guard("remaining", () => Instance.GetRoundRemainingTime());
    const left = rem === undefined ? 0 : Math.max(0, Math.ceil(rem - CONFIG.ROUND_SLACK));
    info.line1 = `DOOM ROUND ${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")} LEFT`;
    const open = rm.arenas.filter((a) => !a.finished);
    const a = rm.arenas[lobbyCycle % Math.max(1, rm.arenas.length)];
    if (a) {
      let s;
      if (a.finished) s = a.result ? a.result.text : "FINISHED";
      else if (a.teamsActive && a.modeKey !== "elim") s = `RED ${a.teamScore[0]} BLUE ${a.teamScore[1]}`;
      else s = `${Array.from(a.players.values()).filter((p) => !p.spectating).length} PLAYING`;
      info.line2 = `${a.mapTitle}: ${s}`.slice(0, 32);
    }
    if (pe.afk) info.spec = "AFK - TYPE !BACK TO PLAY";
    else if (pe.csTeam !== 2 && pe.csTeam !== 3) info.spec = "JOIN T OR CT TO PLAY";
    else info.spec = open.some((x) => x.mode.respawn) ? "JOINING..." : "YOU PLAY NEXT ROUND";
  } else if (phase === "ending") {
    info.line1 = "DOOM ROUND OVER";
    info.center = "NEXT ROUND SOON";
  } else {
    const need = CONFIG.MIN_PLAYERS - lobbyWaiting;
    if (need > 0) {
      info.line1 = `WAITING FOR PLAYERS ${lobbyWaiting}/${CONFIG.MIN_PLAYERS}`;
      info.line2 = `NEED ${need} MORE ON T OR CT`;
    } else {
      const t = Math.max(0, Math.ceil(startAt - now));
      info.line1 = Instance.IsFreezePeriod() ? "DOOM STARTS AFTER FREEZE TIME" : t > 0 ? `DOOM STARTS IN ${t}` : "DOOM STARTING...";
    }
    if (pe.afk) info.spec = "AFK - TYPE !BACK TO PLAY";
    else if (pe.csTeam !== 2 && pe.csTeam !== 3) info.spec = "JOIN T OR CT TO PLAY";
  }
  if (pe.helpUntil > now) { info.center = "R NEXT  F PREV  E USE"; info.spec = "SHIFT WALK !SPEC !AFK !BACK !HUD"; }
  return info;
}

function lobbyHud(now) {
  if (now < lobbyNext) return;
  lobbyNext = now + 0.25;
  lobbyCycle = Math.floor(now / 3);
  lobbyWaiting = 0;
  for (const pe of rm.people.values()) if ((pe.csTeam === 2 || pe.csTeam === 3) && !(pe.afk && !pe.bot)) lobbyWaiting++;
  for (const pe of rm.people.values()) {
    if (pe.bot || parked.has(pe.slot)) continue;
    if (phase === "running" && pe.status !== "none") continue;
    guard("lobbyhud", () => hudLobby(pe.slot, lobbyInfo(pe, now)));
  }
}

function spectatorInput(pe, pk) {
  const pawn = pk.pawn;
  if (!live(pawn)) return;
  let ed = specEdges.get(pe.slot);
  if (!ed) { ed = { next: false, prev: false, arena: false }; specEdges.set(pe.slot, ed); }
  if (pawn.WasInputJustPressed(CSInputs.ATTACK)) ed.next = true;
  if (pawn.WasInputJustPressed(CSInputs.ATTACK2)) ed.prev = true;
  if (pawn.WasInputJustPressed(CSInputs.USE) || pawn.WasInputJustPressed(CSInputs.JUMP)) ed.arena = true;
  if (ed.next) { rm.fixSpectate(pe, 1); ed.next = false; }
  if (ed.prev) { rm.fixSpectate(pe, -1); ed.prev = false; }
  if (ed.arena) { rm.fixSpectate(pe, "arena"); ed.arena = false; }
  const ang = pawn.GetEyeAngles();
  if (Math.abs(angleDiff(pk.lastYaw, ang.yaw)) > 2) rm.markActive(pe.slot);
  pk.lastYaw = normAngle(ang.yaw);
}

function frame(dt) {
  const now = Instance.GetGameTime();
  soundsThisTick = 0;
  spawnBudget = 40;
  scanPeople(false);
  lobbyHud(now);
  if (phase === "lobby") {
    if (now >= startAt && !Instance.IsFreezePeriod()) startDoomRound();
    return;
  }
  if (phase !== "running") return;
  // input for everyone in an arena (every server tick, so short presses are never missed)
  for (const pe of rm.people.values()) {
    if (pe.status === "playing" && pe.player && !pe.player.isBot) {
      let pk = parked.get(pe.slot);
      if (!pk || !live(pk.pawn)) pk = pe.player.respawnGate === false ? undefined : park(pe.slot);
      if (pk && sampleInput(pe.slot, pe.player, pk)) rm.markActive(pe.slot);
      if (pk) applyEdges(pe.player, pk);
    } else if (pe.status === "spectating") {
      let pk = parked.get(pe.slot);
      if (!pk || !live(pk.pawn)) pk = park(pe.slot);
      if (pk) spectatorInput(pe, pk);
    } else if (pe.bot && pe.status === "playing") {
      if (!parked.has(pe.slot) && pe.player.respawnGate !== false) park(pe.slot);
    }
  }
  // Doom tics at 35 Hz
  acc += dt;
  let ran = 0;
  const remaining = guard("remaining", () => Instance.GetRoundRemainingTime());
  while (acc >= 1 / TICRATE && ran < 4) {
    acc -= 1 / TICRATE; ran++;
    rm.tic(remaining === undefined ? undefined : remaining - CONFIG.ROUND_SLACK);
    for (const a of rm.arenas) handleArenaEvents(a);
    handleRoundEvents();
    if (phase !== "running") return;
  }
  if (acc > 4 / TICRATE) acc = 0;
  const alpha = CONFIG.TICK_INTERP ? Math.min(1, acc * TICRATE) : 1;
  processKills(now);
  // world
  for (const v of views.values()) guard("render", () => v.update(alpha));
  // cameras and HUD
  for (const pe of rm.people.values()) {
    const pk = parked.get(pe.slot);
    if (!pk) continue;
    guard("view", () => {
      if (pe.status === "playing" && pe.player && pe.arena) {
        const view = { player: pe.player, self: pe.player, arenaView: views.get(pe.arena) };
        if (view.arenaView) placeCamera(pk, view, alpha, pe.player.playerstate === "dead");
        if (ran) hudPlayer(pe.slot, pe.player, pe.arena, infoFor(pe, now));
      } else if (pe.status === "spectating" && pe.spec) {
        const a = rm.arenas[pe.spec.arena];
        const t = a && a.players.get(pe.spec.target);
        if (!t || !t.mo || t.spectating) { rm.fixSpectate(pe, 0); return; }
        placeCamera(pk, { player: t, self: null, arenaView: views.get(a) }, alpha, true);
        if (ran) hudPlayer(pe.slot, t, a, infoFor(pe, now));
      }
    });
  }
}

function think() {
  flushSays();
  const now = Instance.GetGameTime();
  let dt = now - lastTime;
  lastTime = now;
  if (!(dt > 0) || dt > 0.25) dt = 1 / 64;
  if (ready) guard("frame", () => frame(dt));
  Instance.SetNextThink(now);
}

// ---------------------------------------------------------------- CS2 hooks
Instance.SetThink(think);
Instance.OnActivate(() => { guard("init", init); Instance.SetNextThink(Instance.GetGameTime()); });
Instance.OnScriptReload({
  before: () => { guard("reload", () => cleanupRound(false)); return null; },
  after: () => { guard("init", init); Instance.SetNextThink(Instance.GetGameTime()); },
});
Instance.OnRoundStart(() => guard("roundstart", () => {
  if (phase !== "lobby") cleanupRound(true);
  startAt = Instance.GetGameTime() + 0.5;
  cvars(["mp_ignore_round_win_conditions 1"]);
}));
Instance.OnRoundEnd((ev) => guard("roundend", () => {
  if (phase === "running") endDoomRound();
  const w = ev && ev.winningTeam;
  log(`CS2 round ended: ${w === 2 ? "T win" : w === 3 ? "CT win" : "no winner (team " + w + ")"}, reason ${ev ? ev.reason : "?"}`);
}));
Instance.OnBeginRoundRestart(() => guard("restart", () => cleanupRound(true)));
Instance.OnPlayerDisconnect(({ playerSlot }) => guard("disconnect", () => dropPerson(playerSlot)));
Instance.OnPlayerActivate(({ player }) => guard("activate", () => scanPeople(true)));
Instance.OnPlayerTeamChanged(({ player }) => guard("team", () => {
  const slot = slotOfEntity(player);
  if (slot === undefined) return;
  const pe = rm.person(slot);
  if (pe && pe.status !== "none") { rm.leaveArena(pe, "team change"); unpark(slot); }
  scanPeople(true);
}));
Instance.OnPlayerReset(({ player }) => guard("reset", () => {
  const slot = slotOfEntity(player);
  if (slot === undefined || phase !== "running") return;
  const pe = rm.person(slot);
  if (!pe) return;
  if (pe.status === "playing" && pe.player) {
    park(slot);
    const k = pendingKills.findIndex((x) => x.victim === slot && x.done);
    if (k >= 0) pendingKills.splice(k, 1);
    pe.player.respawnGate = true; pe.player.respawnNow = true;
  } else if (pe.status === "none" && phase === "running") {
    if (rm.lateJoin(pe)) { park(slot); if (pe.player && pe.player.mo) faceView(slot, pe.player.mo.angle); }
    else if (pe.status === "spectating") park(slot);
  }
}));
Instance.OnPlayerKill(({ player }) => guard("cskilled", () => {
  const slot = slotOfEntity(player);
  if (slot === undefined) return;
  parked.delete(slot);
  const pe = rm.person(slot);
  if (!pe || pe.status !== "playing" || !pe.player || allowDamage.has(slot)) return;
  // killed by something outside Doom (admin slay, world): kill the Doom player too
  const p = pe.player;
  if (p.playerstate === "live" && pe.arena) {
    p.respawnGate = false;
    pe.arena.run(() => damageMobj(p.mo, null, null, 10000));
  }
}));
Instance.OnModifyPlayerDamage((event) => {
  const slot = slotOfEntity(event.player);
  if (slot !== undefined && allowDamage.has(slot)) return;
  if (phase === "running" || parked.has(slot)) return { abort: true };
});
Instance.OnPlayerChat(({ player, text }) => guard("chat", () => {
  if (!CONFIG.CHAT_COMMANDS || !player) return;
  const slot = player.GetPlayerSlot();
  const pe = rm.person(slot);
  const t = text.trim().toLowerCase();
  if (!player.IsBot()) sayHold();
  if (t.startsWith("!")) log(`chat command "${t}" from slot ${slot}`);
  if (t === "!spec" || t === "!spectate") {
    if (pe && pe.status === "playing") { const a = pe.arena; rm.leaveArena(pe, "spectate"); rm.spectate(pe, a); }
  } else if (t === "!afk") {
    if (pe) { pe.afk = true; if (pe.status === "playing") { const a = pe.arena; rm.leaveArena(pe, "afk"); rm.spectate(pe, a); } }
  } else if (t === "!back") {
    if (pe) { pe.afk = false; rm.markActive(slot); if (pe.status === "spectating" && phase === "running") { pe.status = "none"; rm.lateJoin(pe); } }
  } else if (t === "!hud" || t.startsWith("!hud ")) {
    // status bar position for this player: centre (default) -> right -> classic (full size) -> small
    const order = ["centre", "right", "classic", "small"];
    const alias = { center: "centre", middle: "centre", full: "classic", big: "classic" };
    const want = alias[t.slice(5).trim()] || t.slice(5).trim();
    if (pe) {
      pe.hudPos = order.includes(want) ? want : order[(order.indexOf(pe.hudPos || "centre") + 1) % order.length];
      if (pe.player) { pe.player.message = "STATUS BAR: " + pe.hudPos.toUpperCase() + "  (!HUD TO CHANGE)"; pe.player.messageTime = pe.arena ? pe.arena.leveltime : 0; }
    }
  } else if (t === "!doom" || t === "!fdm") {
    // shown only on the HUD of whoever typed it (CS2 scripts can't send a private chat line)
    if (pe) pe.helpUntil = Instance.GetGameTime() + CONFIG.HELP_SECONDS;
    if (pe && pe.player) { pe.player.message = "R NEXT  F PREV  E USE  SHIFT WALK"; pe.player.messageTime = (pe.arena ? pe.arena.leveltime : 0) + (CONFIG.HELP_SECONDS - 4) * TICRATE; }
  }
}));
