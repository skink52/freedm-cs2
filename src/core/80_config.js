// ===================================================================================
// Part 8: default settings (the CS2 script copies these and applies its own overrides)
// ===================================================================================
const DEFAULT_CFG = {
  arenaMax: 16, arenaMin: 6, maxArenas: 4, minPlayersToStart: 2,
  modeWeights: { ffa: 35, tdm: 35, elim: 20, lms: 10 },
  ffaFrags: 20, tdmFrags: 32,
  areaPerPlayer: 420000, mapRepeatGap: 8, mapBlacklist: [],
  friendlyFire: false,
  countdownTics: 3 * TICRATE, arenaEndHoldTics: 4 * TICRATE,
  minRespawnTics: TICRATE, autoRespawnTics: 3 * TICRATE, elimSpectateTics: 3 * TICRATE,
  afkWarnTics: 20 * TICRATE, afkKickTics: 30 * TICRATE,
  elimTimeLimitTics: 240 * TICRATE,
  arena: { altdeath: true, itemRespawnTics: 30 * TICRATE, spawnProtectTics: 2 * TICRATE, freelookAim: true, viewBob: true, botSkill: 0.35, teamSuicidePenalty: true },
};
