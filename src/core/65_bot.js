// ===================================================================================
// Part 6b: simple deathmatch bots (testing and filling small rounds)
// ===================================================================================

// ---------------------------------------------------------------- navigation: sector graph
const NAV_DOORS = new Set([1, 26, 27, 28, 31, 32, 33, 34, 117, 118]);
function buildNav(level) {
  if (level.nav) return level.nav;
  const nav = level.sectors.map(() => []);
  const passable = (a, b, l) => {
    if (NAV_DOORS.has(l.special) && b === l.backsector) return true;   // closed doors open on use
    if (b.floorheight - a.floorheight > MAXSTEP) return false;
    return Math.min(a.ceilingheight, b.ceilingheight) - Math.max(a.floorheight, b.floorheight) >= 56;
  };
  const LIFT_LINES = new Set([62, 123, 21, 122, 88, 120, 10, 121]);
  for (const l of level.lines) {
    // teleporters: walking over the line moves you to the destination sector
    if ((l.special === 97 || l.special === 39) && l.frontsector) {
      for (const t of level.things) {
        if (t[3] !== 14) continue;
        const ds = level.sectorAt(t[0], t[1]);
        if (ds.tag === l.tag) { nav[l.frontsector.id].push({ to: ds.id, line: l, len: 64, teleport: true }); break; }
      }
    }
    // lifts: a lift that is up can be reached from below by triggering it
    if (LIFT_LINES.has(l.special) && l.tag) {
      for (const lift of level.sectors) {
        if (lift.tag !== l.tag) continue;
        for (const l2 of lift.lines) {
          const o = l2.frontsector === lift ? l2.backsector : l2.frontsector;
          if (!o || o === lift || o.floorheight >= lift.floorheight) continue;
          if (Math.hypot(l2.dx, l2.dy) < 34) continue;
          nav[o.id].push({ to: lift.id, line: l2, len: 64, lift: true, trigger: l });
        }
      }
    }
    if (!l.backsector || !l.frontsector || l.backsector === l.frontsector) continue;
    if (l.flags & ML_BLOCKING) continue;
    const len = Math.hypot(l.dx, l.dy);
    if (len < 34) continue;
    const a = l.frontsector, b = l.backsector;
    const e = { line: l, len };
    if (passable(a, b, l)) nav[a.id].push(Object.assign({ to: b.id }, e));
    if (passable(b, a, l)) nav[b.id].push(Object.assign({ to: a.id }, e));
  }
  level.nav = nav;
  return nav;
}

function portalPoint(l, x, y) {
  // closest point on the portal line to (x, y), kept 20 units from its ends
  const len = Math.hypot(l.dx, l.dy);
  let t = ((x - l.x1) * l.dx + (y - l.y1) * l.dy) / (len * len);
  const m = Math.min(0.5, 20 / len);
  t = Math.max(m, Math.min(1 - m, t));
  return { x: l.x1 + l.dx * t, y: l.y1 + l.dy * t };
}

// first portal on the shortest sector path from (fx,fy) to (tx,ty); null if none / same sector
function navNext(level, fx, fy, tx, ty) {
  const nav = buildNav(level);
  const from = level.sectorAt(fx, fy).id, to = level.sectorAt(tx, ty).id;
  if (from === to) return null;
  const n = level.sectors.length;
  const dist = new Float64Array(n).fill(Infinity), px = new Float64Array(n), py = new Float64Array(n);
  const first = new Array(n).fill(null);
  const done = new Uint8Array(n);
  dist[from] = 0; px[from] = fx; py[from] = fy;
  for (let iter = 0; iter < n; iter++) {
    let u = -1, best = Infinity;
    for (let i = 0; i < n; i++) if (!done[i] && dist[i] < best) { best = dist[i]; u = i; }
    if (u < 0) break;
    if (u === to) break;
    done[u] = 1;
    for (const e of nav[u]) {
      if (done[e.to]) continue;
      const pp = portalPoint(e.line, px[u], py[u]);
      const d = dist[u] + Math.hypot(pp.x - px[u], pp.y - py[u]);
      if (d < dist[e.to]) { dist[e.to] = d; px[e.to] = pp.x; py[e.to] = pp.y; first[e.to] = u === from ? e : first[u]; }
    }
  }
  return first[to];
}

function botWeaponFor(p, dist) {
  const has = (w, am, n) => p.weaponowned[w] && (am === AM_NOAMMO || p.ammo[am] >= n);
  if (dist < 300 && has(WP_SUPERSHOTGUN, AM_SHELL, 2)) return WP_SUPERSHOTGUN;
  if (dist > 200 && has(WP_MISSILE, AM_MISL, 1)) return WP_MISSILE;
  if (has(WP_PLASMA, AM_CELL, 1)) return WP_PLASMA;
  if (has(WP_CHAINGUN, AM_CLIP, 1)) return WP_CHAINGUN;
  if (has(WP_SUPERSHOTGUN, AM_SHELL, 2)) return WP_SUPERSHOTGUN;
  if (has(WP_SHOTGUN, AM_SHELL, 1)) return WP_SHOTGUN;
  if (dist < 80 && has(WP_CHAINSAW, AM_NOAMMO, 0)) return WP_CHAINSAW;
  if (has(WP_PISTOL, AM_CLIP, 1)) return WP_PISTOL;
  return WP_FIST;
}

function botThink(arena, p) {
  const cmd = p.cmd;
  const mo = p.mo;
  cmd.forwardmove = 0; cmd.sidemove = 0; cmd.buttons = 0;
  if (!mo || mo.removed || p.spectating) return;
  if (p.playerstate === 'dead') { if ((arena.leveltime & 15) === 0) cmd.buttons = BT_USE; return; }
  const b = p.bot || (p.bot = { target: null, retarget: 0, lastx: mo.x, lasty: mo.y, stuck: 0, strafe: 1, wanderAngle: mo.angle, goal: null });
  if (b.skill === undefined) b.skill = Math.max(0, Math.min(1, (arena.cfg.botSkill || 0.35) + ((p.slot * 37) % 7 - 3) * 0.04));
  const skill = b.skill;
  if (--b.retarget <= 0) {
    b.retarget = 6 + Math.round((1 - skill) * 8);
    b.aimErr = (P_Random() - 128) / 128 * (1 - skill) * 28;   // a fresh aiming error each time, held until the next
    let best = null, bestd = 2500;
    arena.run(() => {
      for (const q of arena.players.values()) {
        if (q === p || q.spectating || q.playerstate !== 'live' || !q.mo) continue;
        if (arena.teamsActive && q.team === p.team) continue;
        const d = Math.hypot(q.mo.x - mo.x, q.mo.y - mo.y);
        if (d < bestd && checkSight(mo, q.mo)) { best = q; bestd = d; }
      }
      if (!best && (!b.goal || b.goal.removed || (arena.leveltime & 63) === 0)) {
        let gi = null, gd = 900;
        for (const m of arena.mobjs) {
          if (!(m.flags & MF_SPECIAL)) continue;
          const d = Math.hypot(m.x - mo.x, m.y - mo.y);
          if (d < gd && Math.abs(m.z - mo.z) < 40 && checkSight(mo, m)) { gi = m; gd = d; }
        }
        if (b.goal && b.goal.isStart && Math.hypot(b.goal.x - mo.x, b.goal.y - mo.y) > 64) gi = gi || b.goal;
        if (!gi) {
          // no item in sight: head for a visible deathmatch start, which spreads bots around the map
          const starts = arena.dmstarts.filter((st) => Math.hypot(st.x - mo.x, st.y - mo.y) > 200);
          for (let k = 0; k < 4 && starts.length; k++) {
            const st = starts[(P_Random() * starts.length) >> 8];
            const probe = { x: st.x, y: st.y, z: mo.z, height: 56, sector: arena.level.sectorAt(st.x, st.y) };
            if (checkSight(mo, probe)) { gi = { x: st.x, y: st.y, z: mo.z, removed: false, isStart: true }; break; }
          }
        }
        b.goal = gi;
      }
    });
    if (best !== b.target) b.reactUntil = arena.leveltime + Math.round((1 - skill) * 30);   // reaction time on a new target
    b.target = best;
  }
  let desired = b.wanderAngle;
  const t = b.target;
  if (t && t.mo && t.playerstate === 'live') {
    const dist = Math.hypot(t.mo.x - mo.x, t.mo.y - mo.y);
    desired = pointToAngle(mo.x, mo.y, t.mo.x, t.mo.y) + (b.aimErr || 0);
    const w = botWeaponFor(p, dist);
    if (w !== p.readyweapon && p.pendingweapon === WP_NOCHANGE) p.wantWeapon = w;
    const diff = Math.abs(angleDiff(mo.angle, desired));
    // fire in bursts: low-skill bots hold the trigger less often and not before their reaction time is up
    if (diff < 12 && arena.leveltime >= (b.reactUntil || 0) && P_Random() < 70 + skill * 185) cmd.buttons |= BT_ATTACK;
    cmd.forwardmove = dist > 380 ? 50 : dist < 160 ? -40 : 0;
    if ((arena.leveltime % 40) === 0) b.strafe = P_Random() & 1 ? 1 : -1;
    cmd.sidemove = 40 * b.strafe;
  } else {
    // hunt: path towards the nearest enemy through the sector graph, otherwise towards an item/start
    if ((arena.leveltime % 17) === (p.slot % 17)) {
      let hunt = null, hd = Infinity;
      for (const q of arena.players.values()) {
        if (q === p || q.spectating || q.playerstate !== 'live' || !q.mo) continue;
        if (arena.teamsActive && q.team === p.team) continue;
        const d = Math.hypot(q.mo.x - mo.x, q.mo.y - mo.y);
        if (d < hd) { hd = d; hunt = q; }
      }
      const wantHunt = hunt && (!b.goal || b.goal.isStart || P_Random() < 96 || !arena.mode || !arena.mode.respawn);
      const tgt = wantHunt ? hunt.mo : (b.goal && !b.goal.removed ? b.goal : null);
      b.portal = tgt ? arena.run(() => navNext(arena.level, mo.x, mo.y, tgt.x, tgt.y)) : null;
      b.huntPos = tgt ? { x: tgt.x, y: tgt.y } : null;
    }
    cmd.forwardmove = 50;
    if (b.portal) {
      const pp = portalPoint(b.portal.line, mo.x, mo.y);
      // aim a little past the portal so the bot walks through it
      const ang = pointToAngle(mo.x, mo.y, pp.x, pp.y);
      desired = ang;
      const near = Math.hypot(pp.x - mo.x, pp.y - mo.y);
      if (b.portal.lift && b.portal.line.frontsector && Math.abs(b.portal.line.frontsector.floorheight - b.portal.line.backsector.floorheight) > MAXSTEP) {
        // the lift is up: walk to its trigger and press use, then wait for it
        const tl = b.portal.trigger;
        const tp = portalPoint(tl, mo.x, mo.y);
        desired = pointToAngle(mo.x, mo.y, tp.x, tp.y);
        if (Math.hypot(tp.x - mo.x, tp.y - mo.y) < 56) { cmd.buttons |= BT_USE; cmd.forwardmove = 0; }
      } else if (near < 40) {
        desired = b.huntPos ? pointToAngle(mo.x, mo.y, b.huntPos.x, b.huntPos.y) : ang;
        if (NAV_DOORS.has(b.portal.line.special) && (arena.leveltime & 15) === 0) cmd.buttons |= BT_USE;
      }
    } else if (b.huntPos) desired = pointToAngle(mo.x, mo.y, b.huntPos.x, b.huntPos.y);
    else if (b.goal && !b.goal.removed) desired = pointToAngle(mo.x, mo.y, b.goal.x, b.goal.y);

    const moved = Math.hypot(mo.x - b.lastx, mo.y - b.lasty);
    if ((arena.leveltime % 10) === 0) {
      if (moved < 20) {
        b.stuck++;
        b.wanderAngle = normAngle(mo.angle + 90 + (P_Random() & 127) * (P_Random() & 1 ? 1 : -1));
        b.goal = null;
      } else b.stuck = 0;
      b.lastx = mo.x; b.lasty = mo.y;
      if (b.stuck > 0) { b.portal = null; desired = b.wanderAngle; }
    }
  }
  const turn = angleDiff(mo.angle, desired);
  const maxTurn = 10 + 20 * skill;
  cmd.angle = normAngle(mo.angle + Math.max(-maxTurn, Math.min(maxTurn, turn)));
  if (!t && !b.goal) b.wanderAngle = normAngle(b.wanderAngle);
}
