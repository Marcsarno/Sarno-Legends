import random, statistics as st
src = open('sim.py').read().split('N = 2000')[0]
# variants: duo-first policy (no Home Run, save for Batter Up); masher policy for walkers; Hard ATK
src = src.replace("if grit >= 2 and grit != 3:", "if grit >= 2 and grit != 3 and use_duo != 'only':")
src = src.replace("if nxt in ('leap', 'dash') and boss_before(Y)", "if PASSIVE == 0 and nxt in ('leap', 'dash') and boss_before(Y)")
src = src.replace("if nxt == 'dash' and boss_before(M)", "if PASSIVE == 0 and nxt == 'dash' and boss_before(M)")
src = src.replace("def walkers(", "PASSIVE = 0\nATKM = 1.0\ndef walkers(")
src = src.replace("d = dmg(a.atk, p,", "d = dmg(a.atk * ATKM, p,")
src = src.replace("hit_hero(h, dmg(70, 2,", "hit_hero(h, dmg(70 * ATKM, 2,").replace("hit_hero(h, dmg(70, p,", "hit_hero(h, dmg(70 * ATKM, p,")
# masher walkers: Yola always Scalpel random, Marc always Bat random
src = src.replace("            safe = [z for z in live", "            if PASSIVE: z = rng.choice(live); z.hp -= dmg(40,1,20,rng,.05,mult(z)); stag(z,1,'Blade'); gain(1); kill_check(z,'Blade'); continue\n            safe = [z for z in live")
src = src.replace("            kb = [z for z in live", "            if PASSIVE: z = rng.choice(live); z.hp -= dmg(50,1,20,rng,.1,m(z)); stag(z,2,'Blunt'); gain(1); continue\n            kb = [z for z in live")
ns = {}; exec(src, ns)
def show(name, runs, keys):
    print(name, {k: (round(st.mean(r[k] for r in runs), 2) if not isinstance(runs[0][k], (list, type(None))) else
                     [r[k] for r in runs][:1]) for k in keys})
N = 2000
for sm in (1, 2):
    show(f'boss duo-only x{sm}', [ns['boss'](s, sm, 'avg', 'skip', 'only') for s in range(N)], ['time_rounds','boss_turns','boss_hp_left','taken','heals','breaks','yola_on_broken'])
ns['PASSIVE'] = 1
for sm in (1, 2):
    show(f'boss passive(no dodge/cover) taps=none x{sm}', [ns['boss'](s, sm, 'none', 'skip', True) for s in range(N)], ['time_rounds','boss_turns','boss_hp_left','taken','pct_round','heals','last_stand'])
ns['ATKM'] = 1.25
show('boss passive Hard taps=none x1', [ns['boss'](s, 1, 'none', 'skip', True) for s in range(N)], ['time_rounds','taken','pct_round','heals','last_stand'])
ns['ATKM'] = 1.0
for sm in (1, 2):
    for cr in (True, False):
        R = [ns['walkers'](s, sm, 'none', cr) for s in range(N)]
        show(f'walkers masher x{sm} crawler={cr} taps=none', R, ['rounds','taken','pct_round','hits','heals','breaks','crawlers','wasted','marc_meter','last_stand'])
        print('   grit capped in', sum(r['grit_capped'] for r in R) / N * 100, '% ; max taken', round(max(r['taken'] for r in R)))
ns['ATKM'] = 1.25
R = [ns['walkers'](s, 1, 'none', True) for s in range(N)]
show('walkers masher Hard ATK x1.25', R, ['rounds','taken','pct_round','hits','heals'])
