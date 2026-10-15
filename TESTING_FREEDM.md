# FreeDM first test: what to check

Nothing here has run inside CS2 yet. Everything below is built from Valve's API definitions and has been tested in a simulation. Each line says what to look for. If it fails, tell me what you saw and I'll fix it with that information.

## A. Open and build
- [ ] `maps/mg_freedm.vmap` opens in Hammer without errors. You should see the three lobby rooms far below and the 32 levels laid out above.
- [ ] Select the `point_script` and the `custom_hud_layout` and check that their file fields aren't red (missing). If one is, pick the file again in the asset browser and tell me what path it chose.
- [ ] The materials compile, both the walls and `materials/fdm/pal/*`. A pink/black checker means a material failed: send me the name.
- [ ] The models compile (`models/fdm/m01/*`, `models/fdm/spr/*`). If one fails, open it in ModelDoc and send the error.
- [ ] The map builds.

## B. Local test (listen server)
Run `map mg_freedm` with `bot_quota 5`, or invite a friend. Start the game normally, not in warmup.
- [ ] Console line `[freedm] v0.1.0 ready: 32 levels, 190 sprite models, HUD on, prop template on`.
- [ ] After freeze time you're in a Doom level and your view moves with WASD.
- [ ] The textures look sharp and pixelated, not blurry or dark/black.
- [ ] Movement feels like Doom: fast running, sliding along walls, stairs.
- [ ] The status bar shows at the bottom (face, numbers, gun sprite).
- [ ] Shooting works. Other players and bots look like blocky green/red/blue Doom marines.
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
6. **Kill credit.** Does a Doom frag show in the CS2 killfeed with the right killer? About 2 s later, does the victim respawn into Doom?
7. **Round end.** Does the CS2 round end a few seconds after every arena finishes?
8. **Teleporters** (MAP01). Does your view face the new direction after teleporting?

## D. Server (CounterStrikeSharp)
Use `claude/freedm_cs2_server_issues.md` in the project. The biggest risks are AFK managers, no-respawn plugins, spawn protection and teamkill punishment.

## Known gaps (planned next)
- Animated floors and walls (slime, lava, water) are still images. Flickering lights are steady.
- Bots navigate doors, lifts and teleporters but are still simple. Elimination rounds end after 4 minutes at most.
- Music: not in yet (Freedoom's music is MIDI).
- Weapon keys: only next/previous (R, mouse 2, F). CS2 doesn't give scripts the number keys.
