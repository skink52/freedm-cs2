// ---------------------------------------------------------------- music
// One point_soundevent per track (fdm_mus_<id>, a csgo_music sound: everyone hears it, at their own music volume).
// Each round plays its pool in a shuffled order, one track after another, and stops when the round ends.

const music = { pool: "", list: [], cur: null, last: "", endsAt: 0 };

function musicEnt(id) {
  const e = live(Instance.FindEntityByName(CONFIG.MUSIC_PREFIX + id));
  if (!e) warnOnce("mus" + id, "no point_soundevent named " + CONFIG.MUSIC_PREFIX + id);
  return e;
}

function musicStart(pool) {
  musicStop();
  if (!CONFIG.MUSIC || !MUSIC_TRACKS.some((t) => t.pool === pool)) return;
  music.pool = pool;
  musicNext();
}

function musicNext() {
  if (!music.list.length) {
    music.list = MUSIC_TRACKS.filter((t) => t.pool === music.pool);
    for (let i = music.list.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [music.list[i], music.list[j]] = [music.list[j], music.list[i]];
    }
    if (music.list.length > 1 && music.list[0].id === music.last) music.list.push(music.list.shift());
  }
  const t = music.list.shift();
  music.cur = t; music.last = t.id;
  music.endsAt = Instance.GetGameTime() + t.seconds + CONFIG.MUSIC_GAP;
  const e = musicEnt(t.id);
  if (!e) return;
  Instance.EntFireAtTarget({ target: e, input: "StartSound" });
  log(`music: ${t.id.toUpperCase()} ${t.title}`);
}

function musicTick(now) {
  if (music.cur && now >= music.endsAt) musicNext();
}

function musicStop() {
  if (music.cur) {
    const e = live(Instance.FindEntityByName(CONFIG.MUSIC_PREFIX + music.cur.id));
    if (e) Instance.EntFireAtTarget({ target: e, input: "StopSound" });
  }
  music.pool = ""; music.list = []; music.cur = null;
}
