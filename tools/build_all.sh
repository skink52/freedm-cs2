#!/bin/sh
# Rebuilds the whole addon from the Freedoom sources into out/addon
set -e
cd "$(dirname "$0")/.."
rm -rf out/addon && mkdir -p out/addon/maps
python3 -I tools/convert.py out/addon            # levels -> models, materials, level data
node tools/build.mjs                             # core test module (needed for frame lists)
node -e "
const C=require('./build/core_test.cjs');
const hud=new Set(['PUNG','PISG','PISF','SHTG','SHTF','SHT2','CHGG','CHGF','MISG','MISF','SAWG','PLSG','PLSF','BFGG','BFGF']);
const w=new Map(), h=new Set();
for (const st of C.STATES) { if (st.sprite==='TROO') continue; const k=st.sprite+'_'+String.fromCharCode(97+st.frame); if (hud.has(st.sprite)) h.add(st.sprite+String.fromCharCode(65+st.frame)+'0'); else w.set(k,(w.get(k)||false)||st.bright); }
require('fs').writeFileSync('build/world_frames.json', JSON.stringify([...w.entries()]));
require('fs').writeFileSync('build/hud_frames.json', JSON.stringify([...h]));
"
python3 -I tools/sprites.py out/addon build/world_frames.json
python3 - <<'PY'
import re, json
src = open('src/core/00_defs.js').read()
msgs = re.findall(r"GOT[A-Z0-9]+: '([^']+)'", src)
fixed = msgs + ['FIGHT!', 'RESPAWNING...', 'SPECTATING', '1', '2', '3', 'RED TEAM WINS', 'BLUE TEAM WINS', 'DRAW',
  'Exits are disabled in this game.', 'MOVE OR YOU WILL BE MARKED AFK', 'FREE FOR ALL', 'TEAM DEATHMATCH', 'TEAM ELIMINATION', 'LAST MAN STANDING']
json.dump(sorted(set(s.upper() for s in fixed)), open('build/hud_strings.json', 'w'))
PY
python3 -I tools/hud.py out/addon build/hud_frames.json
python3 -I tools/extras.py out/addon SKY1
python3 tools/lobby.py
mkdir -p build && python3 -I tools/vmf.py out/addon
# the user's own Hammer map is the template: entities and lobby go straight into it, then the environment
# (moondomes + vis hints) is layered on. CURRENT_VMAP = the map as last saved by Hammer (keeps hand edits).
TEMPLATE=${FDM_TEMPLATE:-ref/mg_freedm_template.vmap}
CURRENT=${FDM_CURRENT_VMAP:-}
python3 -I tools/merge_snd.py ref/soundevents_addon_template.vsndevts out/addon/soundevents/soundevents_addon.vsndevts
if [ -n "$CURRENT" ] && [ -f "$CURRENT" ]; then
  python3 -I tools/vmap_env.py "$CURRENT" out/addon/maps/mg_freedm.vmap out/addon
else
  python3 -I tools/vmap.py "$TEMPLATE" build/mg_freedm_base.vmap out/addon
  python3 -I tools/vmap_env.py build/mg_freedm_base.vmap out/addon/maps/mg_freedm.vmap out/addon
fi
node tools/build.mjs
cp README_FREEDM.md TESTING_FREEDM.md out/addon/
cp test/types/point_script.d.ts out/addon/maps/scripts/ 2>/dev/null || true
cp "${FREEDOOM_DIR:-freedoom}/COPYING.adoc" out/addon/FREEDOOM_LICENSE.txt
cp "${FREEDOOM_DIR:-freedoom}/CREDITS" out/addon/FREEDOOM_CREDITS.txt
