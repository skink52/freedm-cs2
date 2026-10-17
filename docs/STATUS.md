# Hellmatch CS2 (formerly FreeDM Arena) — current status and handover (17 Oct 2026, 17:35 Adelaide)

Repo: https://github.com/skink52/hellmatch-cs2 (renamed from freedm-cs2 by Zach 17 Oct; source only). Build: `FREEDOOM_DIR=/path/to/freedoom sh tools/build_all.sh`
rebuilds the addon into out/addon (FREEDOOM_DIR not needed when the freedoom checkout is inside the repo).
Always rebuild the map from Zach's latest Hammer save: `FDM_CURRENT_VMAP=<his mg_hellmatch.vmap>` keeps his edits.
Renamed 17 Oct 09:05: public name Hellmatch, map mg_hellmatch (tools/names.py). Internal names stay: addon folder
mg_freedm, maps/scripts/freedm.js, panorama freedm.xml/css, fdm_* entities, models/materials/sounds under fdm/.

Zach's addon: `C:\Program Files (x86)\Steam\steamapps\common\Counter-Strike Global Offensive\content\csgo_addons\mg_freedm`
(PC linked to the chat). Changed files are written straight into it, only the files that changed. Zips only for bulk
model/material updates, and zips must NEVER contain maps/mg_hellmatch.vmap or maps/scripts/freedm.js (that overwrote a
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

## Update 16 Oct 17:15 (script, HUD xml/css, loading/radar/icon images, README; overview txt in the GAME folder)
- Late joiners: when no arena has room (all full, or one-life round) a human takes a CS2 bot's place
  (RoundManager.replaceBot; REPLACE_BOTS). Respawn rounds: a dead / lowest-frag bot of the joiner's team leaves and
  the human spawns fresh. One-life rounds: the human takes over a living bot's marine (health, weapons, spot).
  The bot spectates. CS2 respawning now stays ON in one-life rounds when REPLACE_BOTS is on, so a joiner gets a
  pawn (Doom deaths there only reach CS2 at round end, so nothing else changes). Console: "<name> took <bot>'s place".
- Spawns in walls fixed: 32 of 305 deathmatch starts sat exactly against a wall (our collision = stuck); every start
  is moved clear at level load (Arena.fitSpot), respawns step to the nearest clear spot, the unchecked team "jitter"
  at round start is gone, crowded starts fall back to other starts. Before: 14% of spawns stuck in a 64-bot test;
  after: 0 in ~6,500. fitSpot only accepts spots reachable in a straight line (walkableLine) inside the level
  outline - an earlier version could pick a point behind the outer wall (void) and a marine walked out of the map.
  Safety net: Arena.rescueOutside teleports anyone outside the level outline back to a spawn spot (every 32 tics).
- Bots stuck either side of a wall: not the camera (bots have none; EYE_FORWARD only affects spectators watching
  them). Cause: bots with nobody in sight walked straight at the nearest enemy when the route finder had no path
  or the enemy was round a corner in the same sector. Now bots only hunt enemies they can reach (route, or in
  sight), otherwise items / a random reachable start; blocked for ~1 s -> turn away 2 s and skip that enemy a few
  seconds; blocked by a player -> step away from them. Stuck 5 s+ without a target: 79 -> ~15 per 4 rounds.
  Route answers cached per level. Bot logic costs ~0.37 ms per tic for 64 bots (unchanged); zero without bots.
- Loading screen + radar + icon (tools/loading.py, part of build_all.sh): FreeDM title art + logo + controls in the
  Doom font (map_icons/screenshots/1080p/mg_freedm.png), a Doom-automap overview of all 32 levels as a flat PSD
  (overheadmaps/mg_freedm_radar.psd), a white map icon (map_icons/map_icon_mg_freedm.svg), and
  game/csgo_addons/mg_freedm/resource/overviews/mg_freedm.txt (pos_x -15856, pos_y 10458, scale 29.188).
  The HUD stylesheet references the images from hidden panels so CS2 compiles them with the HUD.
  20:44 test: icon shows on the loading screen and all three compiled, but the loading screen kept CS2's default
  art - it cycles NUMBERED screenshots (Valve maps have <map>_1.._4 plus the plain one). Added mg_freedm_1.png
  (controls) and mg_freedm_2.png (overview + modes), both preloaded too. Recheck.
  No in-game minimap is expected: sv_disable_radar 1 stays (CS2 pawns sit parked in the booth, so the radar would
  show everyone there, not their Doom positions).
  NOT YET VERIFIED IN CS2: check the "Failed loading resource ... overheadmaps / screenshots / map_icon" and
  "CMapOverview::SetMap" lines are gone and the loading screen shows the picture.
- Scoreboard: per-player option `!hud scores` hides the Doom HUD while the scoreboard (or end-of-match) is open;
  default keeps it (HIDE_HUD_ON_SCOREBOARD false). Panel fdm_opts (class hidescores) wraps fdm_root.
- Note for tools: the output folder adds C2PA "content credentials" metadata to PNG/SVG files; pixels/shapes unchanged,
  so compare those two by content, not sha1.

## Update 17 Oct 00:30 - seeing through walls when pressed against them
Cause: the eye sits 15 units ahead of the player centre (keeps the own marine model out of view) and the player's
collision radius is 16, so against a wall the camera is ~1 unit from it - closer than CS2's near clip plane, which
cuts the wall away. Scripts can't change the near plane or hide a prop per player. Fix in the level meshes
(tools/convert.py, WALL_BACKING 16): every one-sided wall gets a hidden copy up to 16 units behind it in the void
(1.5 short of whatever is behind, shrunk/dropped if it would cross another line - checked: 9,539 copies, none
crossing). Same unlit material, so through the clipped area you see wall. Simulated camera pressed against walls:
see-through ~99% -> <1% (assumed near plane 4 or 7). Render-only (no physics). Model names, props and level data
unchanged, so the map needs no edit; 233 level .smd files written to the addon (spot-checked 8 by content).
Zach must rebuild the map in Hammer (models recompile) before uploading. Not yet tested in CS2.

## Update 17 Oct 08:30 - music, no money, own title art, Workshop images
Written to the addon and verified (sha1; PNGs by pixels, MP3s by decoded audio - the outputs folder adds a metadata
block to PNG/MP3 headers): maps/mg_freedm.vmap (rebuilt from Zach's 16 Oct 08:01 Hammer save, kept as
ref/mg_freedm_hammer_saved_5.vmap; only change: 9 music point_soundevents), maps/scripts/freedm.js,
soundevents_addon.vsndevts, sounds/fdm/music/*.mp3 (9), the three loading screenshots, README_FREEDM.md,
TESTING_FREEDM.md, MUSIC_CREDITS.txt; GAME folder: MUSIC_CREDITS.txt, README_FREEDM.md.
- Music (Zach picked "classic, improved FM" from a 3-way test render): FreeDM's own level tracks rendered from MIDI
  with libADLMIDI (Nuked OPL3, DMXOPL3 bank by Sneakernets, MIT), loudness-matched to -16 LUFS, MP3 128k, 22 MB.
  tools/music.py (cache in build/music; tools/get_adlmidi.sh builds the renderer). Long pool for respawn rounds
  (FFA/TDM): DM05 Music for Freedoom 9, DM10 Paranoia, DM17 Panic, DM21 Friendly Fire, DM26 World of Pain (3-4 min).
  Short pool for one-life rounds (elim/LMS): DM02 Descent from Grace, DM14 The Heroic Battle, DM23 Shells,
  DM29 SevenFour (75-103 s). Sound events fdm_music.<id> are type csgo_music (everyone hears it, scaled by each
  player's snd_musicvolume), volume 0.7 (tools/extras.py MUSIC_VOLUME). Map: point_soundevent fdm_mus_<id> in the
  lobby (vmap_env.py, group fdm_env). Script src/cs2/55_music.js: shuffled playlist per round, next track 2 s after
  one ends (MUSIC_GAP), StopSound at round end / cleanup; console "[freedm] music: DM.. <title>". CONFIG.MUSIC.
  Players joining mid-track hear music from the next track. Not yet heard in CS2: the volume level, and whether a
  csgo_music event started from a lobby point_soundevent reaches everyone.
- Kill money off: CVARS_ALWAYS adds mp_playercashawards 0, mp_teamcashawards 0, mp_startmoney 0, mp_maxmoney 0.
- Freedoom endorsement check (Freedoom's BSD licence: keep the notice in docs; don't use the Freedoom name to
  endorse/promote): the loading screens used Freedoom's own FreeDM logo and title-screen art - replaced by our own
  title (tools/title.py; Russo One at first, replaced 09:05 by the in-game HUD font) over a level render (ref/art/render_*.png, made with
  preview/view.html, which now takes w/h/nearest/clear and marine skins). Footer on both screens: "UNOFFICIAL. USES
  FREEDOOM CONTENT UNDER ITS BSD LICENCE; NOT AFFILIATED WITH OR ENDORSED BY THE FREEDOOM PROJECT." README_FREEDM.md
  says the same. Licence + credits + music credits now copied into out/game (shipped in the Workshop upload).
  Still Zach's call: the name "FreeDM Arena" uses Freedoom's product name (FreeDM). Some FreeDM levels show
  Freedoom's FreeDM logo as a wall texture (their unmodified level art) - keep those out of promo screenshots.
  The chat labels "DOOM: ..." / "!doom" use id's trademark descriptively (README already disclaims id/Bethesda).
- Workshop images: tools/workshop_art.py -> dist/workshop_square.jpg (1080x1080 thumbnail) and dist/workshop_wide.jpg
  (1920x1080 gallery, with the unofficial line), both under 1 MB, sent to Zach.

## Update 17 Oct 09:05 - renamed Hellmatch CS2, lobby bhop removed, title in the in-game font
Written and verified (sha1; PNGs by pixels, SVG by shapes): content maps/mg_hellmatch.vmap (NEW map file),
maps/scripts/freedm.js, panorama/images/map_icons/screenshots/1080p/mg_hellmatch(.png,_1,_2), overheadmaps/
mg_hellmatch_radar.psd, map_icons/map_icon_mg_hellmatch.svg, styles/custom_game/freedm.css (preload names),
README_HELLMATCH.md, TESTING_HELLMATCH.md, MUSIC_CREDITS.txt; GAME folder resource/overviews/mg_hellmatch.txt,
README_HELLMATCH.md, MUSIC_CREDITS.txt.
- Name: Zach chose "Hellmatch CS2" (Workshop title). Map renamed mg_hellmatch so players/servers never see FreeDM.
  Chat: "HELLMATCH: <mode> - <maps>", "Round over - ..."; lobby lines "ROUND 4:32 LEFT", "ROUND STARTS IN n";
  console prefix [hellmatch]; help command !help (also !controls, !hm; old !doom / !fdm still work).
  Loading screens/overview: "32 DEATHMATCH LEVELS", "RETRO FM SOUNDTRACK", "!HELP", footer "USES CONTENT FROM THE
  FREEDOOM PROJECT (BSD LICENCE). NOT AFFILIATED WITH OR ENDORSED BY THE FREEDOOM PROJECT." Map icon: H in a crosshair.
- Title art: Zach asked for the in-game font - "HELLMATCH" is drawn in STCFN (the HUD message font) with a fire
  gradient, dark outline, shadow and orange glow (tools/title.py logo); Workshop taglines use the same font
  (title.hud_text). Russo One removed from the repo.
- Lobby bhop minigame removed (Zach: late joiners are handled by the script now). tools/strip_bhop.py (one-off) took
  ref/mg_freedm_hammer_saved_5.vmap -> ref/mg_hellmatch_base.vmap: removed 48 bhop entities (teleports, triggers,
  relays, sensors, hurt triggers), 57 meshes (platforms, clips, course walls, ladder, trigger leftovers, finish
  platform), the pinv/tree props out there, a small 32-unit jump-test block by the west wall, and the
  sv_bhop_time_window command from logic_auto. The stretched lobby room (to x=2200) is back to 1536x1536 with Zach's
  floor texture (lobby_ceil). Kept: his lobby torches (10 smrt props), logic_auto (mp_freezetime 0, mp_roundtime 600),
  light_environment, nav data, booth and cache rooms.
- Zach must delete the old files (Explorer search "mg_freedm" inside both mg_freedm addon folders, files only):
  content maps/mg_freedm.vmap (old map; keep a backup if wanted), the mg_freedm*.png / _radar.psd / map_icon svg,
  README_FREEDM.md, TESTING_FREEDM.md; game maps/mg_freedm.vpk (+ _cameras.txt, _retakes.txt), resource/overviews/
  mg_freedm.txt, the compiled mg_freedm* panorama images, README_FREEDM.md. Must happen before the Workshop upload,
  or the old map ships too. Then open maps/mg_hellmatch.vmap in Hammer and do a full build.
- Workshop: full description with the licence in docs/WORKSHOP_DESCRIPTION.txt (4.8k chars); images dist/workshop_*.jpg.
- GitHub repo renamed to hellmatch-cs2 by Zach (the session proxy refuses repository-settings writes, HTTP 403).
  Pushing to the new name needs the repo attached to the session (add_repo skink52/hellmatch-cs2, access push).
  Working copy with build caches: /home/claude/freedm-cs2 (remote now hellmatch-cs2).

## Update 17 Oct 09:45 - visibility compile took 30+ minutes
Zach's full build sat in the vis step: "Generated clusters for 1814535 regions in 1013 s, 18442235 clusters".
Cause: a Low visibility hint over every level box (36 hints, ~5.7e11 cubic units = ~2.2 million 64-unit cells).
Nothing inside the levels blocks sight (level props are not occluders), so the fine vis bought nothing. Now only
the whole-map Lowest hint + Low over the 3 lobby rooms (4 hints). maps/mg_hellmatch.vmap re-delivered (sha1 checked).
Same lesson as Space Racer: keep Low hints off big empty volumes.

## Update 17 Oct 10:15 - kill messages cut off, see-through walls on MAP28
Written to the addon and verified (sha1, 10 sampled): maps/scripts/freedm.js, panorama freedm.xml + freedm.css,
253 level .smd files (models/fdm/mXX), TESTING_HELLMATCH.md. The map file is unchanged (not re-sent). Zach must
rebuild in Hammer (the level models recompile) and fully reload.
- Kill messages (top-left message line) were cut at 40 characters ("...SKINK52'S CHAIN"). The message line is now two
  rows of 56 character slots (fdm_msg, fdm_msgb; tools/hud.py MsgLine2 sits 10 Doom px lower). The script splits at a
  space so each row fits the 320-px Doom screen (30_hud.js hudWrap), using the real STCFN glyph widths that
  tools/hud.py writes to build/hud_glyph_w.json and tools/build.mjs bakes in as HUD_GLYPH_W.
- Names on the game HUD are cut to 12 characters (core hudName, HUD_NAME_MAX): kill messages, "YOU TOOK x'S PLACE",
  LEADER, SPECTATING, "<name> WINS" in the centre and lobby lines. Characters the HUD font lacks are dropped (empty
  name -> PLAYER). Chat lines, console and CS2's own killfeed/scoreboard keep the full name. Worst case (two 12-char
  names of wide letters, longest obituary) fits in the two rows with nothing lost (mock check).
- See-through walls, MAP28: the 00:30 fix only covered one-sided (outer) walls. MAP28's walls are mostly two-sided:
  raised blocks, pillars and closed doors are sectors whose LOWER/UPPER faces form the wall, and those had no copy
  (m28: 0 of 101 lower, 0 of 10 upper). tools/convert.py (Level.backing) now also backs:
  - lower faces taller than a step (X_fmax - Y_fmin > STEP 24): copy inside the solid column under the higher floor,
    in the same mover bucket (lifts carry it);
  - upper faces of openings too low to walk under (X_cmin - Y_fmax < PASS 64: closed doors, low lintels): copy inside
    the solid column above the lower ceiling; none under sky ceilings (nothing would hide it there);
  - at slanted corners (octagonal pillars, angled walls) a copy is shortened at both ends (inset, UVs adjusted) before
    it is moved closer, so far fewer get dropped. Walls with no texture on that face get no copy (nothing to draw).
  Coverage, all 32 levels: one-sided 9,422/9,629, lower 2,702/2,917, upper 353/389; 12,477 copies (was 9,539).
  m28: one-sided 113/116, lower 97/101, upper 8/10. Left uncovered: faces with no room behind them (thin sectors) or
  whose copy would cross another line. props.json changed only in tri counts; levels.json and the vmap unchanged.
  NOT YET TESTED IN CS2.

## Update 17 Oct 10:50 - spectator lines, !help while spectating, one life per round
Zach: /help and /doom did nothing while spectating; wanted "type !back to play" on the spectator line and !help to
replace the "SPECTATING <name>" line. Written and verified (sha1): maps/scripts/freedm.js, panorama freedm.xml +
freedm.css, TESTING_HELLMATCH.md, README_HELLMATCH.md (content and game folders). Map and models unchanged.
- Cause: the help text only went on the bottom line when nothing else was there, so "SPECTATING <name>" always won;
  the controls went on pe.player's message line, and spectators have no player of their own on screen.
- New HUD row fdm_spec2_ (40 slots, .SpecLine.SpecLine2 at y 149, just above the bottom line fdm_spec at y 158).
  Spectators: top "SPECTATING <name>", bottom "TYPE !BACK TO PLAY" when !back would put them in right now
  (RoundManager.canJoin), else "YOU PLAY NEXT ROUND"; "AFK - TYPE !BACK TO PLAY" and "JOIN T OR CT TO PLAY" as before.
  !help (8 s, everyone): controls on the message line via info.msg (replaces the old messageTime trick), bottom line
  "CHAT: !SPEC  !AFK  !BACK  !HUD" over whatever was there; spectators also get "MOUSE1/2 SWITCH PLAYER  E NEXT ARENA"
  (the arena part only with 2+ arenas) on the top row. .MsgLine2 is now .MsgLine.MsgLine2 (wins on specificity).
- Bug fixed: !back from someone knocked out of a one-life round (or whose arena was over) set status 'none' while they
  were still in the arena, and lateJoin returned early: stuck on the lobby text until the round ended. !back now only
  acts when canJoin is true, and calls faceView after joining.
- One life per round (core): leaving a one-life arena for any reason (!spec, AFK, team change, knocked out then
  leaving) sets pe.outRound; botToReplace skips one-life arenas for them, so !spec then !back can no longer swap a
  dying marine for a bot's. Newcomers still take a bot's place. README says so.
- infoFor now takes a spectator's arena from pe.spec (the arena they watch), so after E / jump the top-right lines and
  the name match the arena on screen (it used their own arena before and showed just "SPECTATING").
- Mock: test/mock_cs2.mjs reads HUD text back (hudLine) and has a `spec` option (human0 !spec, /help, !back, !spec,
  !doom, !back; other spectators type !back and it must join exactly when canJoin says so). Runs: spec, spec+churn,
  spec+churn+elimonly - 0 problems, no one stuck. NOT YET TESTED IN CS2 (check the two rows don't overlap).

## Update 17 Oct 17:35 - "will it be too laggy on a server?": HUD cost halved, timing line in the console
Written and verified (sha1): maps/scripts/freedm.js only. No visible change.
- Profile (node --cpu-prof, mock 32 humans + 32 bots): hudPlayer 54% of script time (hudText 34%, hudSwap 20%,
  hudNumber 11%) - every tic re-checked ~270 text panels per player that had not changed. Doom sim 22%, prop
  updates 15%.
- Fix (30_hud.js): hudLines remembers what each text line / number last showed in full; unchanged ones are skipped
  (hudSame/hudDrawn). Only recorded when every change went out (HUD budget not exhausted, HUD entity not re-found
  halfway: hudGen). Cleared with hudCache (hudReset, hud() re-find). Mock option `hudcheck` still compares every
  skipped line panel by panel: 0 differences (default, churn, spec, spec+churn+elimonly, afk, round restarts).
  Mock option `nolinecache` = old behaviour, `perf` = per-tick stats.
- Script time per server tick (mock, Node, before -> after): 16 players avg 1.38 -> 0.79 ms (p99 4.3 -> 2.5);
  32 players 2.95 -> 1.60 (p99 8.7 -> 4.9); 64 players 6.2 -> 2.9 (p99 17.6 -> 8.2, ticks over 16 ms in 7 min
  551 -> 9, all at round start: arena build spikes 20-30 ms). Not measured: CS2's own cost of ~145 prop moves per
  tick at 64 players (~90 sounds/s, ~90 HUD class changes per tick) and networking them to every client.
- Console (60_main.js think): once a minute during a round "[hellmatch] script time: avg X ms, max Y ms per server
  tick (N players, A arenas)" (Date.now, 1 ms steps; skipped if Date is missing).
- Lag on a server, for the record: the camera is CONTROLLED_POSITION while alive, so mouse look stays client-side
  (instant); movement and shots are simulated on the server, so they arrive one round trip late (ping + up to one
  35 Hz Doom tic + interpolation). No lag compensation (shots use the server's current positions): lead targets by
  about your ping. A map script can't do client-side prediction.

## Open issues
1. Confirm in CS2 that scoreboard kills keep counting when people join mid-round (fixed in the sim, 15:10 build).
   Frags during CS2 warmup are deliberately not sent (console warning says so).
3. Check the CS2 console at round start for "point_script ... thinking for" lines (spread out at 15:50).
2. Map base: ref/mg_hellmatch_base.vmap (his 16 Oct 08:01 save minus the bhop course). From now on his Hammer saves
   of maps/mg_hellmatch.vmap are the base (stage it, keep a copy in ref/, build with FDM_CURRENT_VMAP).
   Rebuild only from his latest Hammer save.

## Ideas / not done
- Per-player music on/off (csgo_music plays to everyone; players use snd_musicvolume).
- Intermission music between rounds (d_fdmint).

## Known CS2 limits found
- cl_draw_only_deathnotices can't be set from a script (CS2 refuses); only sv_disable_radar works server-side.
  The CS2 health box and chat box can't be hidden, moved or resized from a map.
- `say` from a script speaks as the listen-server host and hits the chat flood limit if lines go out together.
  Scripts can't send private chat and can't hide a player's own chat line.
- Panorama: moving a panel by changing horizontal-align through a class doesn't re-place it (transform/size changes
  do work); keyframe names must be quoted; the root HUD panel may not have an id; HUD text lines are fixed rows of character
  panels (32 per line; the message line 2 x 56; spectator top row 40). Line prefixes must not end in a digit
  (fdm_spec2 + "0" would clash with fdm_spec + "20"), hence fdm_inf1_, fdm_spec2_.
- Alpha-tested textures must be power-of-two; CS2 draws both faces of model polygons.
- Bots need a func_nav_markup WALKABLESEED volume in the lobby (present).

## Workshop
Uploaded as game type Custom, map mg_hellmatch. Description (updated 16 Oct) includes the full Freedoom BSD licence —
it has to, because the Workshop upload carries the compiled game folder, not the licence text files in the content
folder (the build now also copies the licence and credits into out/game). Source repo link:
https://github.com/skink52/hellmatch-cs2 (was freedm-cs2). Workshop title "Hellmatch CS2" (was "FreeDM Arena CS2"). Description: docs/WORKSHOP_DESCRIPTION.txt.
Preview images: dist/workshop_*.jpg (tools/workshop_art.py).
