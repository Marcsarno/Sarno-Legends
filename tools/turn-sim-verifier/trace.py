
src = open('sim.py').read().split('N = 2000')[0]
# instrument: print each action
src = src.replace("a.turns += 1", "a.turns += 1; print(f'  t={t:6.1f} {a.name:5s} grit={grit} ' + ' '.join(f'{u.name}:{u.hp:.0f}{\"B\" if u.broken else \"\"}' for u in allu if u.alive))")
src = src.replace("t = a.av; a.av += a.base()\n        nxt", "t = a.av; a.av += a.base(); print(f'  t={t:6.1f} {a.name:5s} grit={grit} M{M.hp:.0f} Y{Y.hp:.0f} B{B.hp:.0f}{\"BRK\" if B.broken else \"\"} bar{B.bar} intent={intent()}')\n        nxt")
ns = {}; exec(src, ns)
print('walkers x1'); print(ns['walkers'](1, 1, 'none'))
print('walkers x2'); print(ns['walkers'](1, 2, 'none'))
print('boss x1 duo'); print(ns['boss'](1, 1, 'none', 'skip', True))
