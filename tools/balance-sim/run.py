import sys, random, statistics as st; sys.path.insert(0, '.')
import sim
from sim import run, fight, SETS
sim.SHIELD = 0.7
B800 = [('Guard', 800, 60, 40, 95, 0, 14, 'boss')]
for k, v in SETS.items():
    for taps in ('none', 'avg'): run(f'{k} {taps}', v, n=800, taps=taps)
for taps in ('none', 'avg'): run(f'BOSS 800/60 Normal {taps}', B800, n=800, taps=taps)
sim.SHIELD = 0.7
B = [('Guard', 900, 60, 40, 95, 0, 14, 'boss')]
for d, name in ((0.7, 'Story'), (1.0, 'Normal'), (1.25, 'Hard')):
    for taps in ('none', 'avg'):
        run(f'BOSS 900/60 {name} {taps}', B, n=800, taps=taps, diff=d)
# a 3-fight stretch between checkpoints, HP and ult meters carry over
for taps in ('none', 'avg'):
    R = []
    for s in range(800):
        hp = (1, 1); m = (0, 0); heals = 0; ok = True
        for i, k in enumerate(('3 walkers', '2 walkers + nurse', 'sprinter + 2 walkers')):
            L = fight(s * 7 + i, [tuple(f) for f in SETS[k]], taps=taps, hp0=hp, meters=m)
            heals += L['heals'] + L['ultY']; hp = L['end']; m = L['meters']; ok = ok and L['both']
        R.append((heals, min(hp), ok))
    print(f'3-fight stretch taps {taps}: heals+CodeBlue {st.mean(r[0] for r in R):.2f}, lowest hero HP at end {100*st.mean(r[1] for r in R):.0f}%, nobody KO {100*st.mean(r[2] for r in R):.0f}%')
