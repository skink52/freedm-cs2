# FreeDM for CS2 — current status and handover (16 Oct 2026, 15:50 Adelaide)

Repo: https://github.com/skink52/freedm-cs2 (source only). Build: `FREEDOOM_DIR=/path/to/freedoom sh tools/build_all.sh`
rebuilds the addon into out/addon (FREEDOOM_DIR not needed when the freedoom checkout is inside the repo).
Always rebuild the map from Zach's latest Hammer save: `FDM_CURRENT_VMAP=<his mg_freedm.vmap>` keeps his edits.

Zach's addon: `C:\Program Files (x86)\Steam\steamapps\common\Counter-Strike Global Offensive\content\csgo_addons\mg_freedm`
(PC linked to the chat). Changed files are written straight into it, only the files that changed. Zips only for bulk
model/material updates, and zips must NEVER contain maps/mg_freedm.vmap or maps/scripts/freedm.js (that overwrote a
newer script once). DELIVERY CHECK: the device write copies a delayed snapshot of /mnt/user-data/outputs, so a
write straight after `cp` can send the PREVIOUS version (happened 16 Oct: the 09:49 script landed hours late).
Copy, wait ~20 s, write, then stage the file back and compare sha1 before telling Zach it's there.
After a script/HUD change Zach must fully reload (`disconnect`, run the map again) so the script
and Panorama files recompile. Zach doesn't code: plain-language explanations, light code comments.

## Current version (16 Oct 09:50) — confirmed working in CS2 by Zach
- Map builds; script loads (`[freedm] v0.1.0 ready: 32 levels, 190 sprite models, HUD on, prop template on`).
- All 32 FreeDM levels render with correct textures, sky, animated water/slime/lava.
- Doom movement, doors, lifts, teleporters, pickups, all weapons, Doom HUD (status bar, face, numbers, weapon sprite,
  message line, top-right mode/score lines, centre messages).
- Modes: free-for-all, team deathmatch, team elimination, last man standing; up to 4 arenas, 16 per arena.
- Every Doom frag is a real CS2 kill (killfeed + scoreboard); CS2 bots play with the Doom bot AI (BOT_SKILL 0.35).
- CS2 round winner: the script fires FireWinCondition on `fdm_map_params` (info_map_parameters in the map) when the
  Doom round ends; T/CT round score ticks (confirmed 09:26). Side that won more arenas wins; FFA arena counts for
  the winner's side.
- Own body hidden (eye 15 units ahead).
- Chat commands (all confirmed): `!afk`, `!back`, `!spec`, `!doom`, `!hud`.
  - `!doom`: controls shown for 8 s on the typing player's own screen only (no chat broadcast).
  - `!hud`: per-player status bar size, cycles normal (85%, default) -> classic (100%) -> small (65%);
    `!hud normal|classic|small`. Status bar stays centred.
- Round messages in chat ("DOOM: <mode> - <maps>", "<map>: <result>", "DOOM round over - ..."), paced 1 s apart.
- TDM top-right line shows "TEAM DEATHMATCH - FIRST TO N" (was cut off before).
- Lobby status for players not in an arena: waiting for players n/2, starts in / after freeze time, Doom round time
  left, arena scores cycling every 3 s, AFK / join T or CT hints (Doom HUD text lines only, class Lobby on fdm_root).
- MIN_PLAYERS 2 (bots count); `!body` test command removed.
- Console diagnostics: `[freedm] chat command ...`, `[freedm] FireWinCondition <reason> (arenas won: T a, CT b)`,
  `[freedm] CS2 round ended: T win / CT win`, `[freedm] CS2 kill: killer (team, score) -> victim` for kills
  involving a human, and a warning when frags are skipped because of warmup.

## Update 16 Oct 15:10 (script + README_FREEDM.md written and verified by sha1)
- Scoreboard kills breaking when people join mid-game: found and fixed. When anyone between a scripted CS2 death
  and the CS2 respawn left the arena (CS2 kicking a bot to make room for a joining human, slot reuse, team change,
  disconnect), the 8 s respawn check failed and switched real kills off for the whole map. Now pending kills are
  dropped for leavers, kills by a leaver go to the world (a newcomer in the same slot never gets the credit), the
  check ignores anyone who left, and real kills only switch off after 3 genuine failures in a row.
- Team split bug (old): each arena's T share was computed from the Ts still unassigned, so with 32T/32CT the
  arenas came out 8v8, 6v10, 5v11, 13v3. Now worked out from the totals: even teams.
- One mode for every arena: picked so the smallest arena qualifies, and a team mode only when every arena gets
  both sides (else re-picked without team modes). mp_teammates_are_enemies is 1 whenever any arena has no teams.
- Arena sizes (15:50, Zach's rule): one arena up to 15, two from 16 (8+8 .. 16+15), four from 32 (8 each .. 16 each),
  always even (ARENA_MIN 8). Never 3 arenas.
- FINISH_GRACE 120: once the first arena finishes, the rest get 2 minutes (centre "120 SECONDS LEFT", top-right
  clock), then the leader wins.
- Weapon starts (15:50): rolled PER ARENA, LOADOUT_CHANCE 0.12 each; START_WEAPONS weights shotgun 3, ssg 3,
  chaingun 3, rocket 2, plasma 2, chainsaw 2, bfg 1, with extra ammo (rockets 25, cells 200, bullets 200, shells 30);
  given on every (re)spawn. Round chat line lists it per map; bottom line shows it during the countdown.
- Round-start hitch fixed (15:50): arenas are planned at round start and built one per Doom tic (core
  staggerArenas, events arenaBuilt -> onArenaBuilt parks that arena's players); HUD changes capped at HUD_BUDGET 600
  per server tick; new props capped at SPAWN_BUDGET 20 per tick. Mock: 64 players max ~20 ms (was 128 ms),
  10 players max 13 ms (was 22 ms). Players waiting for their arena have status 'planned'.
- Chat commands accept `/` as well as `!` (/doom, /hud, /afk, /back, /spec).
- AFK notice is no longer said in chat; the AFK player's own HUD shows "AFK - TYPE !BACK TO PLAY".
- Console: `[freedm] round N: <mode>[ + loadout], arenas <mode>:<players> ...`.
- Tests: test/mock_cs2.mjs `churn` option (joins with bot kicks and slot reuse, team swaps, leavers, CS2-style
  scoreboard incl. teamkill -1). 64 players, 700 s: kills stayed on, 0 teamkill penalties, modes consistent.
  test/sim.cjs shows rounds of ~2-6 minutes with 64 bots. Script cost ~4 ms per server tick at 64 players in Node,
  spikes up to ~50-90 ms at round start (arena build) — real CS2 cost unknown, watch "point_script thinking for".

## Open issues
1. Confirm in CS2 that scoreboard kills keep counting when people join mid-round (fixed in the sim, 15:10 build).
   Frags during CS2 warmup are deliberately not sent (console warning says so).
3. Check the CS2 console at round start for "point_script ... thinking for" lines (spread out at 15:50).
2. Zach's own map additions (triggers, teleports, trigger_hurts, meshes) were last captured in
   ref/mg_freedm_hammer_saved_4.vmap (his 22:33 15 Oct save); the map in his addon was regenerated from it 16 Oct 08:02.
   The map hasn't changed since. Rebuild only from his latest Hammer save.

## Ideas / not done
- Late joiner replaces a bot in a full arena.
- Radar image and loading-screen screenshot (harmless "Failed loading resource ... overheadmaps / screenshots" lines);
  controls on the loading screen.
- Hide the Doom HUD while the CS2 scoreboard is open (custom_hud_layout sets HUD_SCOREBOARD_VISIBLE on an ancestor).

## Known CS2 limits found
- cl_draw_only_deathnotices can't be set from a script (CS2 refuses); only sv_disable_radar works server-side.
  The CS2 health box and chat box can't be hidden, moved or resized from a map.
- `say` from a script speaks as the listen-server host and hits the chat flood limit if lines go out together.
  Scripts can't send private chat and can't hide a player's own chat line.
- Panorama: moving a panel by changing horizontal-align through a class doesn't re-place it (transform/size changes
  do work); keyframe names must be quoted; the root HUD panel may not have an id; HUD text lines hold 32 characters.
- Alpha-tested textures must be power-of-two; CS2 draws both faces of model polygons.
- Bots need a func_nav_markup WALKABLESEED volume in the lobby (present).

## Workshop
Uploaded as game type Custom, map mg_freedm. Description (updated 16 Oct) includes the full Freedoom BSD licence —
it has to, because the Workshop upload carries the compiled game folder, not the licence text files in the content
folder. Source repo link: https://github.com/skink52/freedm-cs2
