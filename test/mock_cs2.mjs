// Runs the real scripts/freedm.js against a stand-in for CS2's cs_script API.
// Simulates players (humans with random input + CS2 bots), the round timer, freeze time,
// scripted kills and respawns, and checks the script keeps working.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const HUMANS = +(process.argv[2] || 10), BOTS = +(process.argv[3] || 6), SECONDS = +(process.argv[4] || 240);
const OPTS = process.argv[5] || '';

const CSInputs = { NONE: 0, FORWARD: 1, BACK: 2, LEFT: 4, RIGHT: 8, WALK: 16, DUCK: 32, JUMP: 64, USE: 128, ATTACK: 256, ATTACK2: 512, RELOAD: 1024, SHOW_SCORES: 2048, LOOK_AT_WEAPON: 4096 };
for (const [k, v] of Object.entries({ ...CSInputs })) CSInputs[v] = k;
const CustomCameraMode = { DISABLED: 0, CONTROLLED: 1, CONTROLLED_POSITION: 2, FOLLOW_POSITION: 3 };
const CSRoundEndReason = { UNKNOWN: -1, IN_PROGRESS: 0, GAME_COMMENCING: 1, DRAW: 2, CTS_WIN: 8, TERRORISTS_WIN: 9 };
const CSMoveType = { INVALID: -1, NONE: 0, WALK: 1, FLYGRAVITY: 2, VPHYSICS: 3, NOCLIP: 4, OBSERVER: 5, LADDER: 6, CUSTOM: 7 };
const CSDamageTypes = { GENERIC: 0, BULLET: 2, BLAST: 64 };
const CSDamageFlags = { NONE: 0, PREVENT_DEATH: 8, FORCE_DEATH: 16, IGNORE_ARMOR: 64 };

let time = 0;
const stats = { teamkills: 0, churn: { join: 0, kick: 0, kickDead: 0, swap: 0, leave: 0 }, moves: 0, teleports: 0, setModel: 0, hudCalls: 0, sounds: 0, skins: 0, spawned: 0, kills: 0, scriptKills: 0, errors: [], msgs: [], cvars: {}, says: [] };

class Entity {
  constructor(name, cls, pos) { this.name = name; this.cls = cls; this.pos = pos || { x: 0, y: 0, z: 0 }; this.ang = { pitch: 0, yaw: 0, roll: 0 }; this.valid = true; }
  IsValid() { return this.valid; }
  GetAbsOrigin() { return { ...this.pos }; }
  GetAbsAngles() { return { ...this.ang }; }
  GetEntityName() { return this.name; }
  SetEntityName(n) { this.name = n; }
  GetClassName() { return this.cls; }
  Teleport(o) { stats.teleports++; if (o.position) this.pos = { ...o.position }; if (o.angles) this.ang = { ...o.angles }; check(o.position); }
  Move(o) { stats.moves++; if (o.position) this.pos = { ...o.position }; if (o.angles) this.ang = { ...o.angles }; check(o.position); }
  SetModel(m) { stats.setModel++; if (!fs.existsSync(path.join(root, 'out/addon', m))) throw new Error('missing model ' + m); this.model = m; }
  SetColor(c) { this.color = c; }
  SetParent(p) { this.parent = p; }
  Kill() { this.valid = false; }
  Remove() { this.valid = false; }
}
let badShown = 0;
function check(p) {
  if (p && [p.x, p.y, p.z].some((v) => !Number.isFinite(v) || Math.abs(v) > 16384)) {
    if (OPTS.includes('dbg') && !badShown++ && ctx.__dbg) {
      const { rm } = ctx.__dbg();
      for (const a of rm.arenas) for (const pl of a.players.values()) if (pl.mo) {
        const w = { x: a.level.off[0] + pl.mo.x };
        if (Math.abs(w.x) > 16000) console.log('DBG', a.mapId, pl.name, 'slot', pl.slot, 'isBot', pl.isBot, 'doom pos', Math.round(pl.mo.x), Math.round(pl.mo.y), 'sector', a.level.sectorAt(pl.mo.x, pl.mo.y).id, 'state', pl.playerstate, 'person', pl.person && pl.person.name, pl.person && pl.person.status, 'off', a.level.off.join(','));
      }
    }
    throw new Error('bad position ' + JSON.stringify(p));
  }
}

const world = new Map();
function addEnt(e) { world.set(e.name, e); return e; }
class PointTemplate extends Entity { ForceSpawn(pos) { stats.spawned++; const e = new Entity('tplspawn' + stats.spawned, 'prop_dynamic', pos); spawnedEnts.push(e); return [e]; } }
class CustomHudLayout extends Entity {
  SetHasClassForPlayer(slot, panel, cls, on) { stats.hudCalls++; const k = panel.replace(/\d+$/, "#"); (stats.hudBy ||= {})[k] = ((stats.hudBy[k]) || 0) + 1; if (!hudIds.has(panel)) throw new Error("unknown HUD panel " + panel); }
  SetDialogVariableStringForPlayer() { stats.hudCalls++; }
  ResetForPlayer() {}
}
const spawnedEnts = [];
const hudXml = fs.readFileSync(path.join(root, 'out/addon/panorama/layout/custom_game/freedm.xml'), 'utf8');
const hudIds = new Set([...hudXml.matchAll(/id="([^"]+)"/g)].map((m) => m[1]));
const hudCss = fs.readFileSync(path.join(root, 'out/addon/panorama/styles/custom_game/freedm.css'), 'utf8');

// map entities from the VMF
const vmf = fs.readFileSync(path.join(root, 'build/freedm.vmf'), 'utf8');
for (const block of vmf.split('entity\n{').slice(1)) {
  const kv = Object.fromEntries([...block.matchAll(/"([^"]+)" "([^"]*)"/g)].map((m) => [m[1], m[2]]));
  if (!kv.targetname) continue;
  const o = kv.origin.split(' ').map(Number);
  const pos = { x: o[0], y: o[1], z: o[2] };
  if (kv.classname === 'point_template') addEnt(new PointTemplate(kv.targetname, kv.classname, pos));
  else if (kv.classname === 'custom_hud_layout') addEnt(new CustomHudLayout(kv.targetname, kv.classname, pos));
  else addEnt(new Entity(kv.targetname, kv.classname, pos));
}

// ---------------------------------------------------------------- players
const cvar = (k) => stats.cvars[k];
class Camera extends Entity { constructor(p) { super('cam', 'camera'); this.mode = 0; this.pawn = p; } SetMode(m) { this.mode = m; } GetMode() { return this.mode; } GetPlayer() { return this.pawn; } SetFollowConfig() {} }
class Pawn extends Entity {
  constructor(ctrl) { super('pawn' + ctrl.slot, 'player'); this.ctrl = ctrl; this.alive = true; this.buttons = 0; this.prev = 0; this.eye = { pitch: 0, yaw: Math.random() * 360, roll: 0 }; this.cam = null; this.movetype = 1; }
  GetPlayerController() { return this.ctrl; }
  GetOriginalPlayerController() { return this.ctrl; }
  IsAlive() { return this.alive; }
  IsInputPressed(b) { return !!(this.buttons & b); }
  WasInputJustPressed(b) { return !!(this.buttons & b) && !(this.prev & b); }
  WasInputJustReleased(b) { return !(this.buttons & b) && !!(this.prev & b); }
  GetEyeAngles() { return { ...this.eye }; }
  SetEyeAngles(a) { this.eye = { ...a }; }
  SetMoveType(t) { this.movetype = t; }
  DestroyWeapons() {}
  GetCustomCamera() { if (!this.cam) this.cam = new Camera(this); return this.cam; }
  TakeDamage(d) {
    if (!this.alive) return 0;
    const r = hooks.OnModifyPlayerDamage && hooks.OnModifyPlayerDamage({ player: this, damage: d.damage, attacker: d.attacker });
    if (r && r.abort) return 0;
    stats.scriptKills++;
    this.die(d.attacker);
    return d.damage;
  }
  die(attacker) {
    this.alive = false; this.valid = false;
    stats.kills++;
    // scoreboard like CS2: kill +1, teamkill -1 unless teammates are enemies, self/world = death only
    const k = attacker && attacker.ctrl ? attacker.ctrl : attacker instanceof Controller ? attacker : null;
    this.ctrl.deaths++;
    if (k && k !== this.ctrl) {
      if (k.team === this.ctrl.team && cvar('mp_teammates_are_enemies') !== '1') { k.kills--; stats.teamkills++; }
      else k.kills++;
    }
    hooks.OnPlayerKill && hooks.OnPlayerKill({ player: this, attacker });
    const team = this.ctrl.team;
    const respawn = cvar(team === 2 ? 'mp_respawn_on_death_t' : 'mp_respawn_on_death_ct') === '1';
    if (respawn) later(1.5, () => this.ctrl.respawn());
  }
}
class Controller {
  constructor(slot, name, team, bot, noPawn) { this.slot = slot; this.name = name; this.team = team; this.bot = bot; this.connected = true; this.pawn = noPawn ? null : new Pawn(this); this.score = 0; this.kills = 0; this.deaths = 0; this.brain = { turn: 0 }; }
  GetPlayerSlot() { return this.slot; } GetPlayerName() { return this.name; } GetPlayerPawn() { return this.pawn && this.pawn.valid ? this.pawn : undefined; }
  IsBot() { return this.bot; } IsConnected() { return this.connected; } GetTeamNumber() { return this.team; }
  AddScore(n) { this.score += n; } GetScore() { return this.score || 0; } JoinTeam(t) { this.team = t; } IsValid() { return this.connected; }
  respawn() { if (!this.connected) return; this.pawn = new Pawn(this); hooks.OnPlayerReset && hooks.OnPlayerReset({ player: this.pawn }); }
}
const players = [];
for (let i = 0; i < HUMANS + BOTS; i++) players.push(new Controller(i, (i < HUMANS ? 'human' : 'bot') + i, i % 2 ? 3 : 2, i >= HUMANS));

// ---------------------------------------------------------------- Instance
const hooks = {};
let thinkFn = null, nextThink = 0;
const timers = [];
function later(dt, fn) { timers.push({ at: time + dt, fn }); }
let freezeUntil = 2, roundEnd = 600, roundEnded = false, warmup = false, winFired = null; const winReasons = {};
const Instance = {
  Msg: (m) => { const s = String(m); stats.msgs.push(s); if (/error|WARNING/.test(s)) stats.errors.push(s); if (OPTS.includes('v')) console.log(s); },
  GetGameTime: () => time,
  SetThink: (fn) => { thinkFn = fn; },
  SetNextThink: (t) => { nextThink = t; },
  OnActivate: (f) => { hooks.OnActivate = f; },
  OnScriptReload: () => {},
  OnRoundStart: (f) => { hooks.OnRoundStart = f; }, OnRoundEnd: (f) => { hooks.OnRoundEnd = f; }, OnBeginRoundRestart: (f) => { hooks.OnBeginRoundRestart = f; },
  OnPlayerDisconnect: (f) => { hooks.OnPlayerDisconnect = f; }, OnPlayerActivate: (f) => { hooks.OnPlayerActivate = f; },
  OnPlayerTeamChanged: (f) => { hooks.OnPlayerTeamChanged = f; }, OnPlayerReset: (f) => { hooks.OnPlayerReset = f; }, OnPlayerKill: (f) => { hooks.OnPlayerKill = f; },
  OnModifyPlayerDamage: (f) => { hooks.OnModifyPlayerDamage = f; }, OnPlayerChat: (f) => { hooks.OnPlayerChat = f; },
  FindEntityByName: (n) => world.get(n),
  FindEntitiesByName: (n) => (world.get(n) ? [world.get(n)] : []),
  GetAllPlayerControllers: () => players.filter((p) => p.connected),
  GetPlayerController: (s) => players.find((p) => p.slot === s && p.connected),
  ServerCommand: (c) => { const [k, v] = c.split(' '); if (k === 'say') stats.says.push(c.slice(4)); else stats.cvars[k] = v; },
  ClientCommand: () => {},
  EntFireAtTarget: ({ target, input, value }) => {
    if (input === 'Skin') stats.skins++;
    else if (input === 'StartSound') { stats.sounds++; if (!target.name.startsWith('fdm_snd_')) throw new Error('sound on ' + target.name); }
    else if (input === 'SetSourceEntity') { if (![...spawnedEnts].some((e) => e.name === value)) throw new Error('unknown sound source ' + value); }
    else throw new Error('unexpected input ' + input);
  },
  EntFireAtName: ({ name, input, value }) => { if (input === 'FireWinCondition') { winFired = value; roundEnd = time; } },
  IsFreezePeriod: () => time < freezeUntil,
  IsWarmupPeriod: () => warmup,
  GetRoundRemainingTime: () => roundEnd - time,
  SetRoundRemainingTime: (t) => { roundEnd = time + t; },
};
const api = { Instance, CSInputs, CustomCameraMode, CSMoveType, CSRoundEndReason, CSDamageTypes, CSDamageFlags, CSPlayerPawn: Pawn, CSPlayerController: Controller, BaseModelEntity: Entity, PointTemplate, CustomHudLayout, Entity };

let src = fs.readFileSync(path.join(root, 'out/addon/maps/scripts/freedm.js'), 'utf8');
src = src.replace(/^import \{[^}]+\} from "cs_script\/point_script";/m, 'const { Instance, CSInputs, CSPlayerPawn, CSPlayerController, BaseModelEntity, PointTemplate, CustomHudLayout, CSDamageFlags, CSDamageTypes, CustomCameraMode, CSMoveType, CSRoundEndReason, Entity } = __api;');
if (OPTS.includes('elimonly')) src = src.replace(/MODE_WEIGHTS: \{[^}]*\}/, 'MODE_WEIGHTS: { ffa: 0, tdm: 0, elim: 100, lms: 0 }');
src += '\nglobalThis.__dbg = () => ({ rm, views, parked });\n';
const ctx = vm.createContext({ __api: api, console, Math, Date, JSON, Map, Set, Array, Object, String, Number, Error, Infinity, NaN });
vm.runInContext(src, ctx, { filename: 'freedm.js' });

// ---------------------------------------------------------------- run
const TICK = 1 / 64;
hooks.OnActivate();
let rounds = 0;
const t0 = Date.now();
let thinkMs = 0, maxThink = 0;
const CHATS = { 20: "!hud", 30: "/doom", 40: "/hud small", 50: "!hud", 60: "!hud center", 70: "!hud scores" };
while (time < SECONDS) {
  time += TICK;
  for (const [at, text] of Object.entries(CHATS)) if (Math.abs(time - +at) < TICK / 2 && players[0] && hooks.OnPlayerChat) hooks.OnPlayerChat({ player: players[0], text, team: 0 });
  // fake human input: move, strafe, turn, shoot, switch weapons
  for (const c of players) {
    const p = c.pawn;
    if (!p || !p.valid || c.bot) continue;
    p.prev = p.buttons;
    const b = c.brain;
    if (Math.random() < 0.02) b.turn = (Math.random() - 0.5) * 6;
    p.eye.yaw = (p.eye.yaw + b.turn + 360) % 360;
    let bt = CSInputs.FORWARD;
    if (Math.random() < 0.6) bt |= CSInputs.ATTACK;
    if (Math.random() < 0.3) bt |= CSInputs.LEFT;
    if (Math.random() < 0.02) bt |= CSInputs.RELOAD;
    if (Math.random() < 0.05) bt |= CSInputs.USE;
    if (OPTS.includes('afk') && c.slot === 0) bt = 0, b.turn = 0;
    p.buttons = bt;
  }
  for (let i = timers.length - 1; i >= 0; i--) if (timers[i].at <= time) { const t = timers.splice(i, 1)[0]; t.fn(); }
  // round timer
  if (!roundEnded && time >= roundEnd && (winFired !== null || cvar('mp_ignore_round_win_conditions') !== '1')) {
    roundEnded = true; rounds++; winReasons[winFired] = (winReasons[winFired] || 0) + 1;
    hooks.OnRoundEnd && hooks.OnRoundEnd({ winningTeam: winFired === 9 ? 2 : winFired === 8 ? 3 : 0, reason: winFired === null ? 0 : winFired }); winFired = null;
    later(3, () => {
      hooks.OnBeginRoundRestart && hooks.OnBeginRoundRestart();
      for (const e of spawnedEnts) e.valid = false;
      spawnedEnts.length = 0;
      for (const c of players) if (c.connected) { c.pawn = new Pawn(c); hooks.OnPlayerReset && hooks.OnPlayerReset({ player: c.pawn }); }
      freezeUntil = time + 2; roundEnd = time + 600; roundEnded = false;
      hooks.OnRoundStart && hooks.OnRoundStart();
    });
  }
  if (thinkFn && nextThink <= time + 1e-9) {
    const s = performance.now();
    try { thinkFn(); } catch (err) { stats.errors.push('THROW ' + err.stack); break; }
    const d = performance.now() - s; thinkMs += d; maxThink = Math.max(maxThink, d);
    if (d > 16) (stats.slow ||= []).push(`${time.toFixed(1)}s:${d.toFixed(0)}ms`);
    if (OPTS.includes('prof')) { const now = { hud: stats.hudCalls, tp: stats.teleports + stats.moves, sp: stats.spawned, mdl: stats.setModel }; const pv = stats.prev || now; if (d > 8) console.log(`t=${time.toFixed(2)} ${d.toFixed(1)}ms hud+${now.hud - pv.hud} moves+${now.tp - pv.tp} spawned+${now.sp - pv.sp} setModel+${now.mdl - pv.mdl}`); stats.prev = now; }
  }
  if (OPTS.includes('disc') && Math.abs(time - 60) < TICK / 2) { const c = players[3]; c.connected = false; hooks.OnPlayerDisconnect({ playerSlot: c.slot }); }
  // churn: people joining mid-round (CS2 kicks a bot to make room and the newcomer reuses its slot), team swaps, leavers
  if (OPTS.includes('churn') && time > 15 && Math.floor(time / 5) !== Math.floor((time - TICK) / 5)) churn();
}
function disconnect(c) { c.connected = false; if (c.pawn) c.pawn.valid = false; hooks.OnPlayerDisconnect && hooks.OnPlayerDisconnect({ playerSlot: c.slot }); }
function churn() {
  const live = players.filter((c) => c.connected);
  const r = Math.random();
  if (r < 0.5) {
    // a human joins: kick a bot (often one that is dead and waiting to respawn) and reuse the slot
    const bots = live.filter((c) => c.bot);
    let slot = -1;
    if (bots.length) {
      const dead = bots.filter((c) => !c.pawn || !c.pawn.alive);
      const victim = (dead.length && Math.random() < 0.7 ? dead : bots)[Math.floor(Math.random() * (dead.length && Math.random() < 0.7 ? dead.length : bots.length))] || bots[0];
      if (!victim.pawn || !victim.pawn.alive) stats.churn.kickDead++;
      disconnect(victim); stats.churn.kick++; slot = victim.slot;
    } else { const used = new Set(live.map((c) => c.slot)); for (let i = 0; i < 64; i++) if (!used.has(i)) { slot = i; break; } }
    if (slot < 0) return;
    const c = new Controller(slot, 'late' + slot, 0, false, true);
    players.push(c); stats.churn.join++;
    hooks.OnPlayerActivate && hooks.OnPlayerActivate({ player: c });
    later(2, () => { if (!c.connected) return; c.team = Math.random() < 0.5 ? 2 : 3; hooks.OnPlayerTeamChanged && hooks.OnPlayerTeamChanged({ player: c, newTeam: c.team }); later(1, () => c.respawn()); });
  } else if (r < 0.75) {
    const humans = live.filter((c) => !c.bot && c.slot !== 0);
    const c = humans[Math.floor(Math.random() * humans.length)] || live[Math.floor(Math.random() * live.length)];
    if (!c || c.slot === 0) return;
    stats.churn.swap++;
    if (c.pawn) { c.pawn.alive = false; c.pawn.valid = false; }
    c.team = c.team === 2 ? 3 : 2;
    hooks.OnPlayerTeamChanged && hooks.OnPlayerTeamChanged({ player: c, newTeam: c.team });
    const respawn = cvar(c.team === 2 ? 'mp_respawn_on_death_t' : 'mp_respawn_on_death_ct') === '1';
    if (respawn) later(1, () => c.respawn());
  } else {
    const humans = live.filter((c) => !c.bot && c.slot !== 0);
    const c = humans[Math.floor(Math.random() * humans.length)];
    if (c) { disconnect(c); stats.churn.leave++; }
  }
}
const cams = players.filter((c) => c.pawn && c.pawn.cam).map((c) => c.pawn.cam.mode);
console.log('round end reasons', JSON.stringify(winReasons));
console.log(`simulated ${SECONDS}s with ${HUMANS} humans + ${BOTS} bots: ${rounds} CS2 rounds ended`);
console.log(`props spawned ${stats.spawned}, moves ${stats.moves}, teleports ${stats.teleports}, setModel ${stats.setModel}, skins ${stats.skins}, hud calls ${stats.hudCalls}, sounds ${stats.sounds}`);
console.log(`CS2 kills ${stats.kills} (scripted ${stats.scriptKills}), camera modes ${JSON.stringify(cams)}`);
console.log(`think time: avg ${(thinkMs / (SECONDS * 64)).toFixed(3)} ms, max ${maxThink.toFixed(1)} ms`);
console.log('think ticks over 16 ms:', (stats.slow || []).length, (stats.slow || []).slice(0, 12).join(' '));
console.log('cvars', JSON.stringify(stats.cvars));
console.log('says:', stats.says.slice(0, 8).join('\n      '));
console.log('scores', players.map((c) => c.score).join(','));
const live = players.filter((c) => c.connected);
console.log(`scoreboard kills ${players.reduce((n, c) => n + c.kills, 0)} (teamkill penalties ${stats.teamkills}), connected ${live.length} (${live.filter((c) => !c.bot).length} humans), churn ${JSON.stringify(stats.churn)}`);
const off = stats.msgs.find((m) => /Real kills are off/.test(m));
console.log(off ? 'REAL KILLS SWITCHED OFF: ' + off : 'real kills stayed on');
if (stats.errors.length) { console.log('ERRORS/WARNINGS:'); for (const e of [...new Set(stats.errors)].slice(0, 20)) console.log('  ' + e); }
console.log("hud by panel", JSON.stringify(Object.entries(stats.hudBy || {}).sort((a,b)=>b[1]-a[1]).slice(0,14)));
console.log("status bar swaps", (stats.hudBy || {}).fdm_sbarbox || 0);
console.log('log:', stats.msgs.slice(0, 5).join(' | '));
