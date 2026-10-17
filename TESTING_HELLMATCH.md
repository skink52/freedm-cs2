# Hellmatch CS2 test: what to check

Each line says what to look for. If something fails, tell me what you saw and I'll fix it with that information. (The game was called "FreeDM Arena" before 17 Oct 2026; the map is now `mg_hellmatch`.)

## A. Open and build
- [ ] `maps/mg_hellmatch.vmap` opens in Hammer without errors. You should see the three lobby rooms far below and the 32 levels laid out above.
- [ ] Select the `point_script` and the `custom_hud_layout` and check that their file fields aren't red (missing). If one is, pick the file again in the asset browser and tell me what path it chose.
- [ ] The materials compile, both the walls and `materials/fdm/pal/*`. A pink/black checker means a material failed: send me the name.
- [ ] The models compile (`models/fdm/m01/*`, `models/fdm/spr/*`). If one fails, open it in ModelDoc and send the error.
- [ ] The map builds.

## B. Local test (listen server)
Run `map mg_hellmatch` with `bot_quota 5`, or invite a friend. Start the game normally, not in warmup.
- [ ] Console line `[hellmatch] v0.2.0 ready: 32 levels, 502 sprite models, HUD on, prop template on`.
- [ ] After freeze time you're in an arena level and your view moves with WASD.
- [ ] The textures look sharp and pixelated, not blurry or dark/black.
- [ ] Movement feels old-school: fast running, sliding along walls, stairs.
- [ ] The status bar shows at the bottom (face, numbers, gun sprite).
- [ ] Shooting works. Other players and bots look like blocky green/red/blue marines.
- [ ] Items are 3D and pickups work (message top-left, yellow flash).
- [ ] Sounds play and come from the right direction. If you hear nothing, check whether they play quietly from far away. That would mean the listener is at your parked body, not your view.
- [ ] Doors open with E. Lifts work, for example the MAP04 platforms.
- [ ] Sky: brown cloudy sky through openings.
- [ ] Fog: distant areas fade to black.

## C. Engine questions only a real run can answer
1. **Does `cl_draw_only_deathnotices 1` hide the CS2 HUD?** If the radar, health or timer still show, tell me.
2. **Is your own body in the way?** Look down while walking: you may see the top of your own marine. If it's distracting I can hide it.
3. **Player colours.** Bots should be different colours in free-for-all and red/blue in team modes. If everyone is green, the model skins aren't switching.
4. **Invisibility powerup.** The player should turn into a dark see-through shape.
5. **Scrolling walls** (MAP13, MAP20). Do they scroll, and in the right direction?
6. **Kill credit.** Does an arena frag show in the CS2 killfeed with the right killer? About 2 s later, does the victim respawn into the arena?
7. **Round end.** Does the CS2 round end a few seconds after every arena finishes?
8. **Teleporters** (MAP01). Does your view face the new direction after teleporting?
9. **Music.** A track should start when the round starts (console: `[hellmatch] music: DM.. <title>`), play for everyone, follow `snd_musicvolume`, move on to another track when it ends, and stop when the round ends.
10. **Rename.** The loading screen shows the HELLMATCH title and the new map icon; the chat says "HELLMATCH: <mode> - ..." at round start; `!help` shows the controls.
11. **Lobby.** The bhop area is gone and the lobby is a plain room again (east wall at the original spot, no holes).
12. **Kill messages.** A long kill message at the top left (for example "...WAS MOWED DOWN BY ...'S CHAINGUN.") wraps onto a second line instead of being cut off. Names longer than 12 characters are shortened on the game HUD only; chat and the scoreboard show the full name.
13. **Walls up close** (MAP28 especially). Press against walls, ledges too high to step onto, pillars and closed doors while looking around. You should keep seeing wall, never the sky or the room behind it.
14. **Spectating.** In a free for all or team deathmatch round, type `!spec`. Above the status bar you should see "SPECTATING <name>" and under it "TYPE !BACK TO PLAY" (the two lines must not overlap). Type `!help`: for 8 seconds the keys and chat commands replace those lines, and the controls show top left. Type `!back`: you're back in. In team elimination or last man standing the bottom line says "YOU PLAY NEXT ROUND" instead and `!back` keeps you watching.
15. **Joining mid-round.** Join a running round from a second account or have a friend join. Within about a second of picking T or CT you should be in an arena (or watching, in a one-life round), never standing in the lobby with a knife, and every line on the HUD should be complete (no missing letters).
16. **Theme music.** Every round should open with the Hellmatch theme (console: `[hellmatch] music: THEME Hellmatch Theme (trailer)`), then a track from the pool follows after a 2-second gap. The generated tracks (GEN01-GEN04) play in free-for-all, team deathmatch and Boss Battle rounds; tell me which ones you like and which to drop.
17. **Boss Battle** (18 Oct build). Force it for a test: in `maps/scripts/freedm.js` set `MODE_WEIGHTS` to `{ ffa: 0, tdm: 0, boss: 100, elim: 0, lms: 0 }` (then `disconnect` and run the map again). Check: the round starts with a weapon; "WAVE 1 OF 5" shows in the centre and the top right says "WAVE 1 OF 5" / "N MONSTERS  LIVES 3"; monsters appear with a teleport flash and sound, walk, open doors, shoot and bite; they look like blocky 3D versions of the Freedoom creatures and face the way they walk; the frag box counts your kills; a death takes a life ("LIVES 2") and you respawn; waves follow each other ("WAVE CLEARED", 6 s pause); the 5th wave says "BOSS INCOMING" (chat names the boss); killing it ends the arena with "VICTORY"; the CS2 round score goes to the side with more monster kills. Also check: nobody can hurt a teammate (T or CT) in this mode; being killed by a monster shows in the killfeed as a death with no killer (no -1); the console has no `point_script ... thinking for` spikes when a wave arrives; a spectre (stealth worm) is a dark see-through shape; the arch-vile's (flame bringer's) fire column shows on its target.
18. **Monsters in deathmatch.** Set `MONSTER_CHANCE: 1` the same way: every arena then has a few monsters loose in the level ("+ MONSTERS" in the round's chat line). Killing one gives no frag; dying to one costs none and shows a world death in the killfeed. Watch for monsters stuck in walls or floating; tell me the level and where.
19. **Frame rate.** With 4 arenas of 16 (bot_quota 60) and Boss Battle, props per arena go up to ~40 monsters plus their shots; tell me if the `script time` console line goes over ~5 ms or the fps drops at wave arrivals.

## D. Server (CounterStrikeSharp)
Use `claude/freedm_cs2_server_issues.md` in the project. The biggest risks are AFK managers, no-respawn plugins, spawn protection and teamkill punishment.

## Known gaps (planned next)
- Monster kills are not CS2 kills (nothing to kill in CS2), so rank plugins don't count them; Boss Battle rounds still credit the CS2 round to a side.
- The Boss Battle difficulty (wave sizes, boss health) is tuned on bots only; expect to adjust `MONSTERS` and the budget in `36_monsters.js` after real games.
- Monster corpses stay only while they are among the last 24 (each is a prop in CS2).
- Flickering lights are steady.
- Bots navigate doors, lifts and teleporters but are still simple. Elimination rounds end after 4 minutes at most.
- Weapon keys: only next/previous (R, mouse 2, F). CS2 doesn't give scripts the number keys.
