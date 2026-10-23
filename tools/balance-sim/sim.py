"""Draft-3 chapter-1 combat sim (throwaway). Rules:
Grit start 2 max 4; basic +1, defend +1. Break: enemy skips its next turn, stays broken (+50% dmg taken) until its
following turn, then bar refills. No damage types in ch1. Ult meter 100: +0.3 per damage dealt, +10 per hit taken,
carries over. Second Wind: once per fight per hero, a lethal hit leaves 1 HP. Zombies pick target when intent shows."""
import random, statistics as st, sys
def K(lv=1): return 100 + 10 * lv
def dmg(atk, pw, df, rng, crit=0, mult=1.0):
    d = atk * pw * K() / (K() + df) * rng.uniform(.95, 1.05) * mult
    return d * 1.5 if rng.random() < crit else d
class U:
    def __init__(s, n, hp, atk, df, spd, crit=0, bar=0, kind=''):
        s.n, s.max, s.hp, s.atk, s.df, s.spd, s.crit = n, hp, hp, atk, df, spd, crit
        s.av = 10000 / spd; s.bar = s.barmax = bar; s.kind = kind
        s.broken = 0; s.real = 0; s.meter = 0; s.sw = True; s.tgt = None; s.cd = 0
    alive = property(lambda s: s.hp > 0)
    base = lambda s: 10000 / s.spd
def tapm(rng, taps):
    if taps == 'none': return 1.0
    if taps == 'story': return 0.7
    r = rng.random(); return 1.0 if r < .3 else (.7 if r < .8 else .4)

def fight(seed, foes, taps='none', diff=1.0, hp0=(1, 1), meters=(0, 0), boss=False):
    rng = random.Random(seed)
    M = U('Marc', 400, 50, 30, 100, .10); Y = U('Yola', 300, 40, 20, 108, .05)
    M.hp *= hp0[0]; Y.hp *= hp0[1]; M.meter, Y.meter = meters
    Z = [U(*f) for f in foes]
    for i, z in enumerate(Z): z.av += i * .3; z.atk *= diff
    H = (M, Y); grit = 2; L = dict(taken=0, heals=0, ultM=0, ultY=0, breaks=0, duo=0, sw=0, covers=0, hits=0)
    cover = False; phase = 1; t = 0
    def pick_target(z):
        if z.kind == 'sprint': return min((h for h in H if h.alive), key=lambda h: h.hp / h.max)
        if z.kind == 'boss': return None
        return rng.choice([h for h in H if h.alive])
    def intent(z):
        if z.kind == 'boss':
            n = z.real + 1
            if phase == 1: return 'leap' if n % 3 == 0 else ('bash' if n % 3 == 1 else 'dash')
            return 'leap' if n % 2 == 0 else 'dash'
        if z.kind == 'walker' and (z.real + 1) % 3 == 0: return 'bite'
        if z.kind == 'nurse' and any(not w.alive and not getattr(w, 'raised', 0) for w in Z if w.kind == 'walker'): return 'revive'
        return 'hit'
    for z in Z: z.tgt = pick_target(z)
    def gain(n):
        nonlocal grit; grit = min(4, grit + n)
    def hurt(z, d, stag, src):
        nonlocal phase
        if z.broken: d *= 1.5
        if z.kind == 'boss' and phase == 1: d *= SHIELD          # shield up
        z.hp -= d; src.meter = min(100, src.meter + .3 * d)
        z.bar -= stag
        if z.bar <= 0 and not z.broken and z.alive:
            z.broken = 2; L['breaks'] += 1
            if z.kind == 'boss' and phase == 1:
                phase = 2; z.barmax = 18                      # arm off: shield gone, faster slams
    def hit_hero(h, d):
        nonlocal cover
        if h is Y and cover: h = M; d *= .6; L['covers'] += 1
        d *= tapm(rng, taps)
        if d >= h.hp and h.sw: h.hp = 1; h.sw = False; L['sw'] += 1
        else: h.hp -= d
        L['taken'] += d; L['hits'] += 1; h.meter = min(100, h.meter + 10)
    while any(z.alive for z in Z) and (M.alive or Y.alive):
        a = min([u for u in (M, Y) + tuple(Z) if u.alive], key=lambda u: u.av); t = a.av; a.av += a.base()
        live = [z for z in Z if z.alive]
        if a in H:
            if not a.alive: continue
            focus = min(live, key=lambda z: (z.kind not in ('nurse', 'sprint'), z.broken == 0, z.hp))
            if a is M:
                cover = False
                if M.meter >= 100:
                    M.meter = 0; L['ultM'] += 1; tg = max(live, key=lambda z: z.hp); hurt(tg, dmg(50, 2.5, tg.df, rng, .1), 6, M); continue
                big = any(z.alive and intent(z) in ('dash', 'bite', 'leap') and (z.tgt is Y or intent(z) in ('dash',)) for z in live)
                if Y.alive and big and M.cd <= 0:
                    cover = True; M.cd = 2; gain(1); continue
                M.cd -= 1
                if grit == 4 and Y.alive:
                    grit = 0; L['duo'] += 1; tg = focus; hurt(tg, dmg(50, 2.5, tg.df, rng, .1), 8 if tg.kind != 'boss' else 4, M)
                    Y.av += .5 * Y.base(); continue
                if grit >= 2 and focus.hp > dmg(50, 1, focus.df, rng) * 1.1:
                    grit -= 2; hurt(focus, dmg(50, 1.8, focus.df, rng, .1), 4, M)
                    focus.av += (.15 if focus.kind == 'boss' else .3) * focus.base(); continue
                hurt(focus, dmg(50, 1, focus.df, rng, .1), 2, M); gain(1)
            else:
                if Y.meter >= 100 and (M.hp < .5 * M.max or Y.hp < .5 * Y.max or not M.alive):
                    Y.meter = 0; L['ultY'] += 1; gain(2)
                    for h in H: h.hp = min(h.max, max(h.hp, 0) + .5 * h.max)
                    continue
                low = [h for h in H if h.alive and h.hp < .5 * h.max]
                if low and grit >= 2:
                    grit -= 2; h = min(low, key=lambda h: h.hp / h.max); amt = .25 * h.max
                    h.hp = min(h.max, h.hp + amt); L['heals'] += 1; Y.meter = min(100, Y.meter + 20); continue
                hurt(focus, dmg(40, 1.1, focus.df, rng, .05), 1, Y); gain(1)
        else:
            if a.broken == 2: a.broken = 1; continue                      # skipped turn
            if a.broken == 1: a.broken = 0; a.bar = a.barmax
            mv = intent(a); a.real += 1
            if mv == 'revive':
                w = next(w for w in Z if w.kind == 'walker' and not w.alive and not getattr(w, 'raised', 0))
                w.hp = w.max * .5; w.raised = 1; w.av = t + w.base()
            elif a.kind == 'boss':
                if mv == 'leap':
                    for h in H:
                        if h.alive: hit_hero(h, dmg(a.atk, 2.0, h.df, rng))
                elif mv == 'bash' and M.alive: hit_hero(M, dmg(a.atk, 1.2, M.df, rng))
                elif Y.alive: hit_hero(Y, dmg(a.atk, 1.5, Y.df, rng))
                else: hit_hero(M, dmg(a.atk, 1.5, M.df, rng))
            else:
                h = a.tgt if a.tgt and a.tgt.alive else next(h for h in H if h.alive)
                pw = {'bite': 1.5}.get(mv, a.pw)
                hit_hero(h, dmg(a.atk, pw, h.df, rng))
            a.tgt = pick_target(a) if (M.alive or Y.alive) else None
    L['rounds'] = t / 100; L['win'] = M.alive or Y.alive; L['both'] = M.alive and Y.alive
    L['pct'] = L['taken'] / 700 * 100; L['end'] = ((max(M.hp, 0)) / 400, (max(Y.hp, 0)) / 300)
    L['meters'] = (M.meter, Y.meter)
    return L
def W(i, hp=110, spd=95): u = ('W%d' % i, hp, 50, 20, spd, 0, 5, 'walker'); return u
SETS = {
 '3 walkers': [W(i) for i in range(3)],
 '2 walkers + nurse': [W(0), W(1), ('Nurse', 90, 35, 15, 100, 0, 4, 'nurse')],
 'sprinter + 2 walkers': [W(0), W(1), ('Sprinter', 80, 45, 10, 125, 0, 3, 'sprint')],
 'elite + 2 walkers': [('Elite', 300, 60, 35, 100, 0, 10, 'walker'), W(0), W(1)],
}
def run(name, foes, n=1500, **kw):
    R = []
    for s in range(n):
        Zs = [list(f) for f in foes]
        L = fight(s, [tuple(f) for f in Zs], **kw); R.append(L)
    g = lambda k: st.mean(r[k] for r in R)
    print(f"{name:34s} rounds {g('rounds'):4.1f} | lost {g('pct'):4.1f}% ({g('pct')/max(g('rounds'),.1):4.1f}%/rd) | heals {g('heals'):.2f}"
          f" | breaks {g('breaks'):.1f} duo {g('duo'):.2f} ultM {g('ultM'):.2f} ultY {g('ultY'):.2f} | 2ndWind {g('sw'):.2f}"
          f" | win {100*g('win'):.0f}% both-up {100*g('both'):.0f}% | covers {g('covers'):.2f}")
    return R
U.pw = 1.0
SHIELD = 0.5
