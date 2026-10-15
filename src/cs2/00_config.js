// ===================================================================================
// FreeDM for CS2 - CS2 side. Settings you may want to change are in CONFIG.
// ===================================================================================

const CONFIG = {
  // ---- game rules
  MODE_WEIGHTS: { ffa: 35, tdm: 35, elim: 20, lms: 10 },
  FFA_FRAGS: 20,                 // first to this many (scaled down for small arenas)
  TDM_FRAGS: 32,                 // team total (scaled down for small arenas)
  ARENA_MAX: 16, ARENA_MIN: 6, MAX_ARENAS: 4,
  MIN_PLAYERS: 1,                // fewer than this on T/CT: no Doom round, players stay in the lobby
  ROUND_SECONDS: 600,            // the script sets the CS2 round timer to this at round start
  ELIM_SECONDS: 240,             // elimination / last man standing arenas end after this (most alive wins)
  ITEMS_RESPAWN: true,           // Doom "deathmatch 2.0": items respawn, weapons are picked up
  FRIENDLY_FIRE: false,
  FREELOOK_AIM: true,            // aim up/down with the mouse when autoaim finds nothing
  MAP_BLACKLIST: [],             // e.g. ["m24"] to never pick MAP24

  // ---- kill credit
  REAL_KILLS: true,              // every Doom frag is also a real CS2 kill (killfeed, scoreboard, rank plugins)
  KILL_DELAY: 1.0,               // seconds between the Doom death and the CS2 kill in respawn modes
  ADD_SCORE: false,              // add frags with AddScore instead (only used when REAL_KILLS is false)

  // ---- AFK
  AFK_WARN: 20, AFK_KICK: 30,    // seconds without input

  // ---- bots
  CS2_BOTS_PLAY: true,           // CS2 bots in the server are driven by the Doom bot AI
  BOT_SKILL: 0.35,              // 0 = hopeless, 1 = deadly; each bot varies a little around this

  // ---- server settings the map applies (set APPLY_CVARS false to leave the server's own config alone)
  APPLY_CVARS: true,
  CVARS_ALWAYS: [
    "mp_respawn_immunitytime 0",
    "mp_death_drop_gun 0",
    "mp_buy_anywhere 0",
    "mp_buytime 0",
    "sv_disable_radar 1",          // the CS2 radar can't be hidden per client from a script; this is the server-side switch
  ],
  RESPAWN_CVARS_ON: ["mp_respawn_on_death_t 1", "mp_respawn_on_death_ct 1"],
  RESPAWN_CVARS_OFF: ["mp_respawn_on_death_t 0", "mp_respawn_on_death_ct 0"],
  EYE_FORWARD: 15,               // Doom units the camera sits ahead of the player centre (keeps the eye outside the marine model)
  OWN_BODY: "move",            // own Doom marine: "move" (smoothed), "snap" (teleport each tick), "off" (invisible to everyone); !body <mode> switches live
  HIDE_OWN_BODY: true,           // make the parked CS2 pawn invisible (its body otherwise shows under the Doom view)
  HIDE_CS_HUD: false,            // cl_draw_only_deathnotices can't be set from a server script (CS2 refuses it); kept for servers that allow it

  // ---- input
  // CS2 gives scripts no number keys, so: R = next weapon, F (inspect) = previous, right click = next
  NEXT_WEAPON: ["RELOAD", "ATTACK2"],
  PREV_WEAPON: ["LOOK_AT_WEAPON"],
  USE_KEYS: ["USE", "JUMP"],
  WALK_KEY: "WALK",              // hold to walk (Doom's default is to run)
  CHAT_COMMANDS: true,

  // ---- rendering
  TICK_INTERP: true,
  MAX_EFFECT_PROPS: 120,         // per arena: puffs, blood, explosions...
  MAX_SOUNDS_PER_TICK: 24,

  // ---- entity names in the map
  HUD: "fdm_hud",
  PROP_TEMPLATE: "fdm_tpl_prop",
  BOOTH: "fdm_booth",
  SOUND_PREFIX: "fdm_snd_",
  MAP_PARAMS: "fdm_map_params",  // info_map_parameters: its FireWinCondition input ends the CS2 round with a winner
  ROUND_SLACK: 15,               // CS2 round clock runs this much longer than the Doom clock, so the script ends the round

  DEBUG: false,
};

const ZSCALE = 1.2;
const VERSION = "0.1.0";
