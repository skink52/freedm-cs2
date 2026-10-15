// ---------------------------------------------------------------- CS2 pawns: parking, camera, input
// While someone plays, their CS2 pawn stands frozen in a sealed booth, the script reads its
// buttons and eye angles, and their view is a custom camera moved to the Doom player's eyes.

const parked = new Map();     // slot -> { pawn, cam, booth, camMode, lastYaw, lastPitch, edges }
let boothEnt;

function boothPos(slot) {
  boothEnt = live(boothEnt) || live(Instance.FindEntityByName(CONFIG.BOOTH));
  const o = boothEnt ? boothEnt.GetAbsOrigin() : { x: 0, y: 0, z: -14000 };
  const col = slot % 8, row = Math.floor(slot / 8) % 8;
  return { x: o.x + (col - 3.5) * 80, y: o.y + (row - 3.5) * 80, z: o.z + 4 };
}

function park(slot) {
  const pawn = pawnOf(slot);
  if (!pawn) return undefined;
  let pk = parked.get(slot);
  if (pk && pk.pawn === pawn && live(pk.cam)) return pk;
  const booth = boothPos(slot);
  guard("park", () => {
    pawn.Teleport({ position: booth, velocity: { x: 0, y: 0, z: 0 } });
    pawn.SetMoveType(CSMoveType.NONE);
    pawn.DestroyWeapons();
  });
  // the engine draws the local player's own body under a custom camera: make the pawn fully transparent
  if (CONFIG.HIDE_OWN_BODY) guard("hidebody", () => pawn.SetColor({ r: 255, g: 255, b: 255, a: 0 }));
  let cam;
  guard("camera", () => {
    cam = live(pawn.GetCustomCamera());
    if (cam) { cam.SetParent(undefined); cam.SetMode(CustomCameraMode.CONTROLLED_POSITION); }
  });
  if (!cam) warnOnce("nocam", "GetCustomCamera returned nothing - players will see their pawn's own view");
  pk = { pawn, cam, booth, camMode: CustomCameraMode.CONTROLLED_POSITION, lastYaw: 0, lastPitch: 0, edges: { next: false, prev: false }, lockYaw: null, lockUntil: 0 };
  parked.set(slot, pk);
  if (CONFIG.HIDE_CS_HUD) guard("hidehud", () => Instance.ClientCommand(slot, "cl_draw_only_deathnotices 1"));
  return pk;
}

function unpark(slot) {
  const pk = parked.get(slot);
  parked.delete(slot);
  hudOff(slot);
  if (CONFIG.HIDE_CS_HUD) guard("showhud", () => Instance.ClientCommand(slot, "cl_draw_only_deathnotices 0"));
  if (!pk) return;
  guard("unpark", () => {
    if (live(pk.cam)) { pk.cam.SetMode(CustomCameraMode.DISABLED); if (live(pk.pawn)) pk.cam.SetParent(pk.pawn); }
    if (live(pk.pawn) && pk.pawn.IsAlive()) pk.pawn.SetMoveType(CSMoveType.WALK);
    if (CONFIG.HIDE_OWN_BODY && live(pk.pawn)) pk.pawn.SetColor({ r: 255, g: 255, b: 255, a: 255 });
  });
}

function setCamMode(pk, mode) {
  if (pk.camMode === mode || !live(pk.cam)) return;
  pk.cam.SetMode(mode); pk.camMode = mode;
}

// called every server tick for players in an arena: sample input
function sampleInput(slot, p, pk) {
  const pawn = pk.pawn;
  if (!live(pawn)) return;
  const pressed = (n) => pawn.IsInputPressed(CSInputs[n]);
  const just = (n) => pawn.WasInputJustPressed(CSInputs[n]);
  const fwd = pressed("FORWARD") ? 1 : 0, back = pressed("BACK") ? 1 : 0;
  const left = pressed("LEFT") ? 1 : 0, right = pressed("RIGHT") ? 1 : 0;
  const walk = pressed(CONFIG.WALK_KEY);
  p.cmd.forwardmove = (fwd - back) * (walk ? 25 : 50);
  p.cmd.sidemove = (right - left) * (walk ? 24 : 40);
  let buttons = 0;
  if (pressed("ATTACK")) buttons |= BT_ATTACK;
  for (const k of CONFIG.USE_KEYS) if (pressed(k)) buttons |= BT_USE;
  p.cmd.buttons = buttons;
  for (const k of CONFIG.NEXT_WEAPON) if (just(k)) pk.edges.next = true;
  for (const k of CONFIG.PREV_WEAPON) if (just(k)) pk.edges.prev = true;
  const ang = pawn.GetEyeAngles();
  let yaw = normAngle(ang.yaw);
  const now = Instance.GetGameTime();
  if (pk.lockYaw !== null) {
    // after a teleport the client needs a moment to accept the new view angle
    if (now < pk.lockUntil && Math.abs(angleDiff(yaw, pk.lockYaw)) > 2) yaw = pk.lockYaw;
    else pk.lockYaw = null;
  }
  p.cmd.angle = yaw;
  p.pitch = ang.pitch;
  const active = fwd || back || left || right || buttons || Math.abs(angleDiff(pk.lastYaw, yaw)) > 2 || Math.abs(ang.pitch - pk.lastPitch) > 2;
  pk.lastYaw = yaw; pk.lastPitch = ang.pitch;
  return active;
}

function applyEdges(p, pk) {
  if (pk.edges.next) { cycleWeapon(p, 1); pk.edges.next = false; }
  if (pk.edges.prev) { cycleWeapon(p, -1); pk.edges.prev = false; }
}

function faceView(slot, yaw) {
  const pk = parked.get(slot);
  if (!pk || !live(pk.pawn)) return;
  guard("eyeangles", () => pk.pawn.SetEyeAngles({ pitch: 0, yaw, roll: 0 }));
  pk.lockYaw = normAngle(yaw);
  pk.lockUntil = Instance.GetGameTime() + 0.35;
}

// camera placement for a player looking through a Doom player's eyes (their own or a spectated one)
function placeCamera(pk, view, alpha, controlled) {
  if (!live(pk.cam)) return;
  const mo = view.player.mo;
  if (!mo) return;
  const v = view.arenaView;
  let x = mo.x, y = mo.y, z = view.player.viewz;
  if (!mo.teleported && alpha < 1) {
    x = mo.px + (mo.x - mo.px) * alpha;
    y = mo.py + (mo.y - mo.py) * alpha;
    const pz = view.player.pviewz !== undefined ? view.player.pviewz : z;
    z = pz + (z - pz) * alpha;
  }
  // the eye sits a little in front of the marine's chest so players never look out through their own model
  if (CONFIG.EYE_FORWARD) { const a = mo.angle * Math.PI / 180; x += Math.cos(a) * CONFIG.EYE_FORWARD; y += Math.sin(a) * CONFIG.EYE_FORWARD; }
  const pos = v.world(x, y, z);
  if (controlled) {
    setCamMode(pk, CustomCameraMode.CONTROLLED);
    const pitch = view.player === view.self ? 0 : Math.max(-60, Math.min(60, view.player.pitch || 0));
    pk.cam.Move({ position: pos, angles: { pitch, yaw: mo.angle, roll: 0 } });
  } else {
    setCamMode(pk, CustomCameraMode.CONTROLLED_POSITION);
    pk.cam.Move({ position: pos });
  }
}
