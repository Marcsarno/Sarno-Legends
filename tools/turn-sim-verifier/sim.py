"""Throwaway sim for Sarno Legends combat draft 2. Assumptions are flagged with ASSUME."""
import random, statistics as st, sys

K = 110  # Lv1 attacker: 100 + 10*1

def dmg(atk, power, df, rng, crit=0.0, mult=1.0):
    d = atk * power * K / (K + df) * rng.uniform(0.95, 1.05) * mult
    if rng.random() < crit:
        d *= 1.5
    return d

class U:
    def __init__(s, name, hp, atk, df, spd, crit=0.0, side='z', bar=0, weak=()):
        s.name, s.max, s.hp, s.atk, s.df, s.spd, s.crit, s.side = name, hp, hp, atk, df, spd, crit, side
        s.av = 10000 / spd; s.bar = bar; s.barmax = bar; s.weak = weak
        s.broken = False; s.skip = False; s.turns = 0; s.real = 0; s.marked = False
        s.cd = {}; s.meter = 0; s.last_stand = True
    @property
    def alive(s): return s.hp > 0
    def base(s): return 10000 / s.spd

def defend_mult(rng, taps):
    """ASSUME tap skill: 'none' = no reduction (Auto with no taps); 'good' = always good (-30%, Story's auto);
    'avg' = 30% miss, 50% good, 20% perfect."""
    if taps == 'none': return 1.0, False
    if taps == 'good': return 0.7, False
    r = rng.random()
    if r < 0.3: return 1.0, False
    if r < 0.8: return 0.7, False
    return 0.4, True

def hit_hero(h, d, log):
    if h.last_stand and h.hp > 0.5 * h.max and d >= h.hp:
        h.hp = 1; h.last_stand = False; log['last_stand'] += 1
    else:
        h.hp -= d
    log['taken'] += d

# ---------------------------------------------------------------- 3 walkers
def walkers(seed, stagger_mult=2, taps='avg', crawler=True):
    rng = random.Random(seed)
    M = U('Marc', 400, 50, 30, 100, .10, 'h'); Y = U('Yola', 300, 40, 20, 108, .05, 'h')
    Z = [U(f'W{i}', 75, 50, 20, 85, 0, 'z', 3, ('Blunt',)) for i in range(3)]
    for i, z in enumerate(Z): z.av += i * 0.01
    grit = 3; log = dict(taken=0, last_stand=0, heals=0, cap_rounds=0, breaks=0, hits=0, crawlers=0, wasted=0)
    allu = [M, Y] + Z; t = 0
    def gain(n):
        nonlocal grit
        if grit + n > 5: log['wasted'] += grit + n - 5
        grit = min(5, grit + n)
    def stag(z, amt, typ):
        if typ in z.weak: amt *= stagger_mult
        z.bar -= amt
        if z.bar <= 0 and not z.broken:
            z.broken = True; z.skip = True; log['breaks'] += 1
    def kill_check(z, typ):
        if z.hp <= 0 and z.name.startswith('W') and typ == 'Blade' and crawler:
            # ASSUME crawler: 25 HP, ATK 50, Scratch at 60 power, SPD 85, DEF 20, enters at the walker's slot
            c = U('C' + z.name, 25, 50, 20, 85, 0, 'z', 2, ('Blunt',)); c.av = t + c.base(); c.scr = 0.6
            Z.append(c); allu.append(c); log['crawlers'] += 1
    while any(z.alive for z in Z) and M.alive and Y.alive:
        a = min((u for u in allu if u.alive), key=lambda u: u.av); t = a.av; a.av += a.base(); a.turns += 1
        live = [z for z in Z if z.alive]
        if a is Y:
            hurt = [h for h in (M, Y) if h.hp < 0.5 * h.max]
            if hurt and grit >= 2:
                grit -= 2; h = min(hurt, key=lambda h: h.hp / h.max); h.hp = min(h.max, h.hp + 80); log['heals'] += 1; continue
            # Scalpel a walker it won't kill (set up Marc), prefer the one acting soonest
            mult = lambda z: (1.5 if z.broken else 1) * (1.5 if z.broken else 1)  # ASSUME multiplicative stacking
            safe = [z for z in live if z.hp > 34 * 1.05 * mult(z)]
            z = min(safe or live, key=lambda z: (z.av))
            z.hp -= dmg(40, 1, 20, rng, .05, mult(z)); stag(z, 1, 'Blade'); gain(1); kill_check(z, 'Blade')
        elif a is M:
            m = lambda z: 1.5 if z.broken else 1
            kb = [z for z in live if z.hp <= 42.3 * .95 * m(z)]
            kh = [z for z in live if z.hp <= 76.1 * .95 * m(z)]
            if kb:
                z = kb[0]; z.hp -= dmg(50, 1, 20, rng, .1, m(z)); stag(z, 2, 'Blunt'); gain(1)
            elif kh and grit >= 2:
                z = kh[0]; grit -= 2; z.hp -= dmg(50, 1.8, 20, rng, .1, m(z)); stag(z, 4, 'Blunt'); z.av += 0.3 * z.base()
            else:  # bat the soonest-acting non-broken walker (breaks it under 2x)
                z = min(live, key=lambda z: (z.broken, z.av)); z.hp -= dmg(50, 1, 20, rng, .1, m(z)); stag(z, 2, 'Blunt'); gain(1)
        else:
            if a.skip:  # broken: loses this turn, then recovers, bar refills (ASSUME)
                a.skip = False; a.broken = False; a.bar = a.barmax; continue
            a.real += 1
            h = rng.choice([x for x in (M, Y) if x.alive])  # ASSUME random target
            p = getattr(a, 'scr', 1.0)
            if a.name.startswith('W') and a.real % 3 == 0: p = 1.6  # ASSUME Grab&Bite every 3rd real turn
            dm, perfect = defend_mult(rng, taps)
            d = dmg(a.atk, p, h.df, rng, 0, dm); hit_hero(h, d, log); log['hits'] += 1
            if p == 1.6: a.hp = min(a.max, a.hp + 20)  # ASSUME bite heals 20
            if h is M: M.meter += 10
            else: M.meter += 15
        if grit == 5: log['cap_rounds'] += 1
    log['time'] = t; log['rounds'] = t / 117.6; log['win'] = M.alive and Y.alive
    log['pct_round'] = log['taken'] / 700 / max(1, t / 117.6) * 100
    log['marc_meter'] = M.meter; log['grit_capped'] = log['cap_rounds'] > 0
    return log

# ---------------------------------------------------------------- Shield Guard
def boss(seed, stagger_mult=1, taps='avg', broken_rule='skip', use_duo=True, stopper_cancels_leap=False):
    rng = random.Random(seed)
    M = U('Marc', 400, 50, 30, 100, .10, 'h'); Y = U('Yola', 300, 40, 20, 108, .05, 'h')
    B = U('Guard', 1000, 70, 40, 95, 0, 'z', 12, ('Blunt', 'Gun'))
    grit = 3; log = dict(taken=0, last_stand=0, heals=0, breaks=[], hits=0, leaps=0, wasted=0, ult_M=None, ult_Y=None,
                         yola_on_broken=0, yola_turns=0, dead=None, stop_cancels=0)
    arm = False; t = 0; broken_left = 0; cover = False; dodge = False; charged = False
    Y.meter = 0; M.meter = 0
    def gain(n):
        nonlocal grit
        if grit + n > 5: log['wasted'] += grit + n - 5
        grit = min(5, grit + n)
    def stag(amt, typ):
        nonlocal broken_left
        if typ not in B.weak: return  # shield: Blunt/Gun only stagger
        B.bar -= amt * stagger_mult
        if B.bar <= 0 and not B.broken:
            B.broken = True; B.skip = True; B.bar = B.barmax  # ASSUME bar refills
            broken_left = 2 if broken_rule == 'nextreal' else 1
            log['breaks'].append(round(t / 100, 2))
    def bmult(src):
        if not B.broken: return 1
        return 1.5 * (1.5 if src is Y else 1)
    def intent():
        # ASSUME: every 3rd REAL turn is Leap Slam; otherwise alternate Bash(Marc)/Dash(Yola); after arm-off only Dash
        n = B.real + 1
        if n % 3 == 0: return 'leap'
        if arm: return 'dash'
        return 'bash' if n % 3 == 1 else 'dash'
    while B.alive and M.alive and Y.alive and len(log['breaks']) < 2:
        a = min((u for u in (M, Y, B) if u.alive), key=lambda u: u.av); t = a.av; a.av += a.base()
        nxt = intent()
        boss_before = lambda u: B.av < u.av
        if a is M:
            if M.meter >= 100:  # Sarno Slam
                M.meter = 0; log['ult_M'] = log['ult_M'] or round(t / 100, 2)
                B.hp -= dmg(50, 3, 40, rng, .1, bmult(M)); stag(6, 'Blunt'); continue
            if nxt == 'dash' and boss_before(M) and Y.hp < 0.6 * Y.max and M.cd.get('cover', 0) <= 0:
                cover = True; M.cd['cover'] = 2; continue
            M.cd['cover'] = M.cd.get('cover', 0) - 1
            if use_duo and grit >= 3 and not B.broken:  # Batter Up
                grit -= 3; B.hp -= dmg(50, 2.5, 40, rng, .1, bmult(M)); stag(8, 'Blunt'); Y.av += 0.5 * Y.base(); continue
            if grit >= 2 and grit != 3:
                grit -= 2; mk = 1.5 if B.marked else 1; B.marked = False
                B.hp -= dmg(50, 1.8, 40, rng, 1 if mk > 1 else .1, bmult(M)); stag(4, 'Blunt'); B.av += 0.3 * B.base()
            else:
                B.hp -= dmg(50, 1, 40, rng, 1 if B.marked else .1, bmult(M)); B.marked = False; stag(2, 'Blunt'); gain(1)
        elif a is Y:
            log['yola_turns'] += 1
            if B.broken: log['yola_on_broken'] += 1
            for k in list(Y.cd): Y.cd[k] -= 1
            if Y.meter >= 100 and (M.hp < .5 * M.max or Y.hp < .5 * Y.max):
                Y.meter = 0; log['ult_Y'] = log['ult_Y'] or round(t / 100, 2)
                for h in (M, Y): h.hp = min(h.max, h.hp + .5 * h.max)
                gain(2); continue
            hurt = [h for h in (M, Y) if h.hp < 0.5 * h.max]
            if hurt and grit >= 2:
                grit -= 2; h = min(hurt, key=lambda h: h.hp / h.max); h.hp = min(h.max, h.hp + 80); log['heals'] += 1
                Y.meter += 20; continue
            if nxt == 'leap' and boss_before(Y) and stopper_cancels_leap and Y.cd.get('stop', 0) <= 0 and grit >= 1:
                grit -= 1; Y.cd['stop'] = 3; charged = True; log['stop_cancels'] += 1
                B.hp -= dmg(40, .7, 40, rng, .05, bmult(Y)); stag(2, 'Gun'); continue
            if nxt in ('leap', 'dash') and boss_before(Y) and Y.cd.get('side', 0) <= 0:
                dodge = True; Y.cd['side'] = 2; continue
            if Y.cd.get('stop', 0) <= 0 and grit >= 1:
                grit -= 1; Y.cd['stop'] = 3; B.hp -= dmg(40, .7, 40, rng, .05, bmult(Y)); stag(2, 'Gun')
            else:
                B.hp -= dmg(40, 1, 40, rng, .05, bmult(Y)); gain(1)  # Scalpel: blade, no shield stagger
        else:
            if B.skip:
                B.skip = False
                if broken_rule == 'skip': B.broken = False
                continue
            if B.broken and broken_rule == 'nextreal':
                B.broken = False
            mv = intent(); B.real += 1
            if charged and mv == 'leap':
                charged = False; continue
            if mv == 'leap':
                log['leaps'] += 1
                for h in (M, Y):
                    if h is Y and dodge:
                        dodge = False; continue
                    dm, perf = defend_mult(rng, taps)
                    hit_hero(h, dmg(70, 2, h.df, rng, 0, dm), log); log['hits'] += 1
                    M.meter += 10 if h is M else 15
            else:
                h = M if mv == 'bash' else Y
                p = 1.2 if mv == 'bash' else 1.5
                cm = 1.0
                if mv == 'dash' and cover: h = M; cm = 0.6
                if h is Y and dodge:
                    dodge = False; continue
                dm, perf = defend_mult(rng, taps)
                hit_hero(h, dmg(70, p, h.df, rng, 0, dm * cm), log); log['hits'] += 1
                M.meter += 10 if h is M else 15
            cover = False
    log['time_rounds'] = round(t / 100, 2); log['boss_hp_left'] = round(max(0, B.hp)); log['win'] = M.alive and Y.alive
    log['boss_turns'] = B.real; log['pct_round'] = log['taken'] / 700 / max(1, t / 100) * 100
    return log

def summarize(name, runs, keys):
    print(f'\n== {name} (n={len(runs)})')
    for k in keys:
        v = [r[k] for r in runs if r[k] is not None]
        if not v: print(f'  {k}: never'); continue
        if isinstance(v[0], bool): print(f'  {k}: {sum(v)/len(runs)*100:.0f}%'); continue
        if isinstance(v[0], list): print(f'  {k}: e.g. {v[0]}  mean#={st.mean(len(x) for x in v):.2f}'); continue
        print(f'  {k}: mean {st.mean(v):.2f}  min {min(v):.2f}  max {max(v):.2f}  (present in {len(v)}/{len(runs)})')

N = 2000
wk = ['win', 'rounds', 'taken', 'pct_round', 'hits', 'heals', 'breaks', 'crawlers', 'grit_capped', 'wasted', 'marc_meter', 'last_stand']
for sm in (2, 1):
    for taps in ('none', 'avg'):
        summarize(f'3 walkers, stagger x{sm}, taps={taps}', [walkers(s, sm, taps) for s in range(N)], wk)
bk = ['win', 'time_rounds', 'boss_turns', 'boss_hp_left', 'taken', 'pct_round', 'hits', 'heals', 'leaps', 'breaks',
      'yola_on_broken', 'yola_turns', 'ult_M', 'ult_Y', 'last_stand', 'wasted', 'stop_cancels']
for sm in (1, 2):
    for duo in (True, False):
        for rule in ('skip', 'nextreal'):
            summarize(f'Guard, stagger x{sm}, duo={duo}, broken={rule}, taps=avg',
                      [boss(s, sm, 'avg', rule, duo) for s in range(N)], bk)
summarize('Guard, stagger x1, duo, skip, taps=none', [boss(s, 1, 'none', 'skip', True) for s in range(N)], bk)
summarize('Guard, stagger x1, duo, skip, Stopper cancels Leap', [boss(s, 1, 'avg', 'skip', True, True) for s in range(N)], bk)
