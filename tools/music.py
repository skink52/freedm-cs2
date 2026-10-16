"""Background music: renders the chosen FreeDM level tracks (MIDI) with an OPL3 FM synth (Nuked OPL3, DMXOPL3
instrument bank) and writes them as MP3s, plus _gen/music.json (id, pool, seconds, title) for the sound events, the
map and the script. Long tracks play in respawn rounds (free for all, team deathmatch), short ones in one-life rounds.

usage: music.py <addon_out>
Renders need adlmidiplay ($ADLMIDI, or build/libADLMIDI/build/adlmidiplay from tools/get_adlmidi.sh). Rendered
tracks are kept in build/music, so later builds just copy them.
"""
import json, os, re, shutil, subprocess, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import assets

OUT = sys.argv[1]
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(ROOT, 'build/music')
ADLMIDI = os.environ.get('ADLMIDI') or os.path.join(ROOT, 'build/libADLMIDI/build/adlmidiplay')
BANK, CHIPS = '72', '2'           # DMXOPL3 (Sneakernets, MIT), two OPL3 chips so no notes drop
TARGET = 'I=-16:TP=-1.5:LRA=11'
POOLS = {
    'long': ['dm05', 'dm10', 'dm17', 'dm21', 'dm26'],
    'short': ['dm02', 'dm14', 'dm23', 'dm29'],
}

def titles():
    txt = open(os.path.join(assets.FD, 'CREDITS-MUSIC'), encoding='utf-8').read()
    sec = txt.split('--FreeDM--', 1)[1].split('\n--', 1)[0]
    return {m.group(1).lower(): (m.group(2), m.group(3).strip()) for m in re.finditer(r'(DM\d\d): "([^"]+)" by (.+)', sec)}

def render(tid):
    os.makedirs(CACHE, exist_ok=True)
    mp3 = os.path.join(CACHE, tid + '.mp3')
    if os.path.exists(mp3): return mp3
    if not os.path.exists(ADLMIDI):
        print('music: no adlmidiplay (run tools/get_adlmidi.sh) and no rendered copy of', tid); return None
    tmp = os.path.join(CACHE, 'tmp'); os.makedirs(tmp, exist_ok=True)
    mid = os.path.join(tmp, tid + '.mid')
    shutil.copy(os.path.join(assets.FD, 'musics/d_%s.mid' % tid), mid)
    subprocess.run([ADLMIDI, mid, '--emu-nuked', '-vm', '3', '--gain', '1.0', BANK, CHIPS], cwd=tmp,
                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
    wav = mid + '.wav'
    err = subprocess.run(['ffmpeg', '-hide_banner', '-nostats', '-i', wav, '-af', 'loudnorm=%s:print_format=json' % TARGET,
                          '-f', 'null', '-'], capture_output=True, text=True).stderr
    m = json.loads(err[err.rindex('{'):err.rindex('}') + 1])
    af = ('loudnorm=%s:measured_I=%s:measured_TP=%s:measured_LRA=%s:measured_thresh=%s:offset=%s:linear=true'
          % (TARGET, m['input_i'], m['input_tp'], m['input_lra'], m['input_thresh'], m['target_offset']))
    subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', wav, '-af', af, '-ar', '44100',
                    '-c:a', 'libmp3lame', '-b:a', '128k', mp3], check=True)
    os.remove(wav); os.remove(mid)
    return mp3

def seconds(path):
    return float(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path]))

names = titles()
d = os.path.join(OUT, 'sounds/fdm/music'); os.makedirs(d, exist_ok=True)
tracks = []
for pool, ids in POOLS.items():
    for tid in ids:
        src = render(tid)
        if not src: continue
        shutil.copy(src, os.path.join(d, tid + '.mp3'))
        title, by = names.get(tid, (tid.upper(), ''))
        tracks.append({'id': tid, 'pool': pool, 'seconds': round(seconds(src), 1), 'title': title, 'by': by})
os.makedirs(os.path.join(OUT, '_gen'), exist_ok=True)
json.dump(tracks, open(os.path.join(OUT, '_gen/music.json'), 'w'), indent=1)
lines = ['FreeDM Arena music: Freedoom (FreeDM) level tracks, BSD licence like the rest of Freedoom.',
         'Rendered from the original MIDI with libADLMIDI (Nuked OPL3 emulator) and the DMXOPL3 FM instrument bank',
         'by Shannon "Sneakernets" Freeman (MIT licence).', '']
lines += ['%s  %-34s %s' % (t['id'].upper(), t['title'], t['by']) for t in tracks]
open(os.path.join(OUT, 'MUSIC_CREDITS.txt'), 'w', newline='\n').write('\n'.join(lines) + '\n')
print('music: %d tracks (%s), %.1f MB' % (len(tracks), ', '.join('%s %d' % (p, sum(1 for t in tracks if t['pool'] == p)) for p in POOLS),
      sum(os.path.getsize(os.path.join(d, t['id'] + '.mp3')) for t in tracks) / 1e6))
