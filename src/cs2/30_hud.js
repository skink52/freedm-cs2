// ---------------------------------------------------------------- Doom status bar HUD
// The layout (panorama/layout/custom_game/freedm.xml) has fixed panels; the script swaps one
// CSS class per panel per player. Every change is cached so only real changes are sent.

let hudEnt;
const hudCache = new Map();   // slot -> Map(panelId -> class)

function hud() {
  if (live(hudEnt)) return hudEnt;
  hudEnt = live(Instance.FindEntityByName(CONFIG.HUD));
  if (!hudEnt) { warnOnce("hud", "no custom_hud_layout named " + CONFIG.HUD + " - no Doom HUD"); return hudEnt; }
  // a (re)found HUD entity doesn't know what we sent before: clear it and resend everything
  for (const slot of hudCache.keys()) { try { hudEnt.ResetForPlayer(slot); } catch (err) { /* ignore */ } }
  hudCache.clear();
  return hudEnt;
}

function hudSwap(slot, panel, cls) {
  let c = hudCache.get(slot);
  if (!c) { c = new Map(); hudCache.set(slot, c); }
  const old = c.get(panel);
  if (old === cls) return;
  const h = hud();
  if (!h) return;
  if (old) h.SetHasClassForPlayer(slot, panel, old, false);
  if (cls) h.SetHasClassForPlayer(slot, panel, cls, true);
  c.set(panel, cls);
}

function hudReset(slot) {
  hudCache.delete(slot);
  const h = hud();
  if (h) { try { h.ResetForPlayer(slot); } catch (err) { /* ignore */ } }
}

// Doom font text: one panel per character, classes c<ascii code>
function hudText(slot, prefix, len, text) {
  text = String(text || "").toUpperCase();
  const pre = HUD_STRING_INDEX.get(text);
  hudSwap(slot, prefix + "img", pre === undefined ? null : "t" + pre);
  if (pre !== undefined) text = "";
  for (let i = 0; i < len; i++) {
    const ch = i < text.length ? text.charCodeAt(i) : 0;
    let cls = null;
    if (ch === 32) cls = "csp";
    else if (ch >= 33 && ch <= 95) cls = "c" + ch;
    else if (ch) cls = "csp";
    hudSwap(slot, prefix + i, cls);
  }
}

function hudNumber(slot, prefix, digits, value, kind, showZero) {
  // right-aligned digits; kind: "b" big red, "y" small yellow, "g" small grey
  let v = Math.max(-99, Math.min(Math.pow(10, digits) - 1, Math.floor(value)));
  const neg = v < 0; if (neg) v = -v;
  const s = String(v);
  for (let i = 0; i < digits; i++) {
    const di = s.length - digits + i;
    let cls = null;
    if (di >= 0) cls = kind + "n" + s[di];
    else if (neg && di === -1) cls = kind + "nm";
    if (value === null) cls = null;
    hudSwap(slot, prefix + i, cls);
  }
}

// ---------------------------------------------------------------- face (ST_updateFaceWidget)
const ST_FACESTRIDE = 8, ST_NUMPAINFACES = 5, ST_TURNOFFSET = 3, ST_OUCHOFFSET = 5, ST_EVILGRINOFFSET = 6, ST_RAMPAGEOFFSET = 7;
const ST_GODFACE = ST_NUMPAINFACES * ST_FACESTRIDE, ST_DEADFACE = ST_GODFACE + 1;

function faceState(p) {
  if (!p.face) p.face = { priority: 0, count: 0, index: 0, lastattackdown: -1, oldhealth: -1, oldweapons: p.weaponowned.slice(), rnd: 0 };
  return p.face;
}

function calcPainOffset(p) {
  const health = Math.min(100, p.health);
  return ST_FACESTRIDE * Math.floor(((100 - health) * ST_NUMPAINFACES) / 101);
}

function updateFace(p) {
  const f = faceState(p);
  if (f.oldhealth < 0) f.oldhealth = p.health;
  if (f.priority < 10 && !p.health) { f.priority = 9; f.index = ST_DEADFACE; f.count = 1; }
  if (f.priority < 9 && p.bonuscount) {
    let doevil = false;
    for (let i = 0; i < NUMWEAPONS; i++) if (f.oldweapons[i] !== p.weaponowned[i]) { doevil = true; f.oldweapons[i] = p.weaponowned[i]; }
    if (doevil) { f.priority = 8; f.count = 2 * TICRATE; f.index = calcPainOffset(p) + ST_EVILGRINOFFSET; }
  }
  if (f.priority < 8 && p.damagecount && p.attacker && p.attacker !== p.mo && !p.attacker.removed && p.mo) {
    f.priority = 7;
    if (p.health - f.oldhealth > 20 || f.oldhealth - p.health > 20) { f.count = TICRATE; f.index = calcPainOffset(p) + ST_OUCHOFFSET; }
    else {
      const bad = pointToAngle(p.mo.x, p.mo.y, p.attacker.x, p.attacker.y);
      const d = angleDiff(p.mo.angle, bad);
      f.count = TICRATE; f.index = calcPainOffset(p);
      if (Math.abs(d) < 45) f.index += ST_RAMPAGEOFFSET;
      else if (d > 0) f.index += ST_TURNOFFSET + 1;     // attacker on the left
      else f.index += ST_TURNOFFSET;
    }
  }
  if (f.priority < 7 && p.damagecount) {
    if (f.oldhealth - p.health > 20) { f.priority = 7; f.count = TICRATE; f.index = calcPainOffset(p) + ST_OUCHOFFSET; }
    else { f.priority = 6; f.count = TICRATE; f.index = calcPainOffset(p) + ST_RAMPAGEOFFSET; }
  }
  if (f.priority < 6) {
    if (p.attackdown) {
      if (f.lastattackdown === -1) f.lastattackdown = 2 * TICRATE;
      else if (!--f.lastattackdown) { f.priority = 5; f.index = calcPainOffset(p) + ST_RAMPAGEOFFSET; f.count = 1; f.lastattackdown = 1; }
    } else f.lastattackdown = -1;
  }
  if (f.priority < 5 && p.powers[PW_INVULN]) { f.priority = 4; f.index = ST_GODFACE; f.count = 1; }
  if (!f.count) { f.index = calcPainOffset(p) + (P_Random() % 3); f.count = TICRATE / 2; f.priority = 0; }
  f.count--;
  f.oldhealth = p.health;
  return f.index;
}

// ---------------------------------------------------------------- per player HUD refresh
function weaponClass(psp) {
  if (!psp || psp.state === S_NULL) return null;
  const st = STATES[psp.state];
  return "w_" + st.sprite.toLowerCase() + "_" + String.fromCharCode(97 + st.frame);
}

function hudPlayer(slot, p, arena, info) {
  hudSwap(slot, "fdm_root", "On");
  hudSwap(slot, "fdm_sbarbox", info && info.sbar && info.sbar !== "centre" ? info.sbar : null);
  // weapon sprite + flash
  const wp = p.psprites[0], fp = p.psprites[1];
  const alive = p.playerstate === "live";
  hudSwap(slot, "fdm_wspr", alive || wp.state !== S_NULL ? weaponClass(wp) : null);
  hudSwap(slot, "fdm_wflash", weaponClass(fp));
  // raising/lowering moves the gun in steps; the walking bob is a CSS animation on the client
  const ready = wp.state !== S_NULL && STATES[wp.state].action === "A_WeaponReady";
  const sy = ready ? 0 : Math.max(0, Math.min(24, Math.round((wp.sy - WEAPONTOP) / 4)));
  hudSwap(slot, "fdm_wpn", "sy" + sy);
  const moving = p.mo && p.bob > 4 && p.mo.z <= p.mo.floorz;
  hudSwap(slot, "fdm_wbob", ready && moving ? (p.bob > 10 ? "bob2" : "bob1") : null);
  // numbers
  const ammoType = WEAPONINFO[p.readyweapon].ammo;
  hudNumber(slot, "fdm_ammo", 3, ammoType === AM_NOAMMO ? null : p.ammo[ammoType], "b");
  hudNumber(slot, "fdm_hp", 3, p.health, "b");
  hudNumber(slot, "fdm_ar", 3, p.armorpoints, "b");
  const fragVal = arena && arena.teamsActive && p.team >= 0 ? arena.teamScore[p.team] : p.frags;
  hudNumber(slot, "fdm_frag", 3, fragVal, "b");
  for (let i = 0; i < 4; i++) {
    hudNumber(slot, "fdm_am" + i + "c", 3, p.ammo[i], "y");
    hudNumber(slot, "fdm_am" + i + "m", 3, p.maxammo[i], "y");
  }
  if (p.faceTic !== (arena ? arena.leveltime : 0)) { p.faceIdx = updateFace(p); p.faceTic = arena ? arena.leveltime : 0; }
  hudSwap(slot, "fdm_face", "f" + p.faceIdx);
  hudSwap(slot, "fdm_faceb", "fb" + (p.color & 15));
  // screen tint (Doom's palette shifts)
  let tint = null;
  let cnt = p.damagecount;
  if (p.powers[PW_STRENGTH]) { const bzc = 12 - (p.powers[PW_STRENGTH] >> 6); if (bzc > cnt) cnt = bzc; }
  if (cnt) tint = "red" + Math.min(8, (cnt + 7) >> 3);
  else if (p.bonuscount) tint = "gold" + Math.min(4, (p.bonuscount + 7) >> 3);
  else if (p.powers[PW_INVULN] > 4 * 32 || (p.powers[PW_INVULN] & 8)) tint = "invul";
  hudSwap(slot, "fdm_flash", tint);
  hudSwap(slot, "fdm_team", arena && arena.teamsActive && p.team >= 0 ? (p.team === 0 ? "teamred" : "teamblue") : null);
  // message line (4 seconds, like Doom)
  const msg = p.message && arena && arena.leveltime - p.messageTime < 4 * TICRATE ? p.message : "";
  hudText(slot, "fdm_msg", 40, msg);
  if (info) {
    hudText(slot, "fdm_inf1_", 32, info.line1 || "");
    hudText(slot, "fdm_inf2_", 32, info.line2 || "");
    hudText(slot, "fdm_ctr", 24, info.center || "");
    hudText(slot, "fdm_spec", 32, info.spec || "");
  }
}

function hudOff(slot) {
  hudSwap(slot, "fdm_root", null);
}

// lobby: only the text lines (top right, centre, bottom)
function hudLobby(slot, info) {
  hudSwap(slot, "fdm_root", "Lobby");
  hudText(slot, "fdm_inf1_", 32, info.line1 || "");
  hudText(slot, "fdm_inf2_", 32, info.line2 || "");
  hudText(slot, "fdm_ctr", 24, info.center || "");
  hudText(slot, "fdm_spec", 32, info.spec || "");
}
