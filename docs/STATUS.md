# FreeDM for CS2 — current status and handover (16 Oct 2026, 08:05 Adelaide)

Repo: https://github.com/skink52/freedm-cs2 (source only; `sh tools/build_all.sh` rebuilds the addon into out/addon,
needs a `freedoom` checkout next to the repo). Zach's addon: `content\csgo_addons\mg_freedm` (PC linked to the chat;
files are written straight into it, zips only for bulk model/material updates — and zips must NOT contain
maps/mg_freedm.vmap or maps/scripts/freedm.js, that overwrote newer files once).

## What works in CS2 (confirmed by Zach, 15 Oct)
Map builds, script loads (`[freedm] v0.1.0 ready` in console), Doom levels render with correct textures and sky,
movement, doors, pickups, shooting, Doom HUD (status bar, face, numbers, weapon sprite), bots play (need the nav seed
volume in the lobby, present), kills show in the killfeed, team deathmatch / LMS rounds run, LMS round ended
"CTs won by ELIMINATION", animated water/slime/lava (update 4), own body hidden (eye 15 units ahead, player models
carved no further than 13 units forward), bots toned down (BOT_SKILL 0.35).

## Open problems (as of 08:05 16 Oct)
1. `!doom` prints nothing, while `!afk` / `!back` / `!spec` work. Chat replies are now queued and sent from the think
   loop (a `say` from inside OnPlayerChat looked like it was dropped) and every `!` command logs
   `[freedm] chat command "..." from slot N` to the console. NOT YET VERIFIED WITH THE NEW SCRIPT: every test so far
   ran an older script (update-4 zip overwrote the newer freedm.js; the console still showed
   `Cannot set convar 'cl_draw_only_deathnotices'`, which the current script no longer sends). Next: run the map
   with the current script (reload the map: the vjs is recompiled on map load in tools mode), type !doom, read the
   console for the "[freedm] chat command" line. If the line is there but no chat appears, the `say` ServerCommand
   is being filtered; try Instance.Msg-only or a HUD message instead.
2. CS2 rounds end as draws for FFA / TDM (team wins don't tick). Fix in the current script: an
   `info_map_parameters` entity named `fdm_map_params` in the map (written by tools/vmap_env.py) and
   `EntFireAtName({name:"fdm_map_params", input:"FireWinCondition", value: CSRoundEndReason.TERRORISTS_WIN/CTS_WIN/DRAW})`
   at endDoomRound (same method as Valve's rush_001.js), with the CS2 clock 15 s longer than the Doom clock
   (CONFIG.ROUND_SLACK). ALSO NOT YET VERIFIED for the same reason (old script). If still draws with the current
   script + rebuilt map: check console for `[freedm] WARNING: no fdm_map_params entity`.
3. Zach's own additions to the map (triggers, teleports, trigger_hurts, meshes) exist in ref/mg_freedm_hammer_saved_4.vmap
   (his 22:33 save); the map was regenerated from it at 08:02. Anything he added after 22:33 is lost.
4. Scoreboard kill counter reportedly not increasing when playing with another human (unconfirmed; bots' kills do count).
   Suspect: same-CS2-team kills in FFA counted as teamkills despite mp_teammates_are_enemies 1. Needs details.

## Requested next
- Lobby countdown/status for players waiting in the lobby (time left in the CS2 round, what arenas are doing).
- Remove the `!body` test command before release; MIN_PLAYERS is 1 for testing (Zach wants 2 for release, ARENA_MIN 6).
- Optional: late joiner replaces a bot in a full arena.
- Radar image / loading screenshot (harmless "Failed loading resource ... overheadmaps" lines).
- Known CS2 limits found: cl_draw_only_deathnotices can't be set from a script (only sv_disable_radar); alpha-tested
  textures must be power-of-two; Panorama keyframe names must be quoted; root HUD panel may not have an id; nav needs a
  func_nav_markup WALKABLESEED volume; CS2 draws both faces of model polygons.

## Workshop
Zach is uploading as game type Custom. Description text with the Freedoom BSD licence was provided; repo link to add.
