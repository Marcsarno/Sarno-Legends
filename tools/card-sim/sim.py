"""Throwaway card-fight sim for the Sarno Legends deckbuilder plan (verification only)."""
import random, itertools, sys, statistics as st

MAXHP = {'M': 80, 'Y': 60}

def starter():
    d = []
    d += [dict(n='Bat', h='M', c=1, dmg=6, stg=2)] * 3
    d += [dict(n='Brace', h='M', c=1, blk=6, on='M')] * 2
    d += [dict(n='HomeRun', h='M', c=2, dmg=14, stg=4, push=True)]
    d += [dict(n='Pistol', h='Y', c=1, dmg=5, stg=1)] * 3
    d += [dict(n='Sidestep', h='Y', c=1, blk=5, on='Y')] * 2
    d += [dict(n='PatchUp', h='Y', c=1, heal=True)]
    return [dict(x) for x in d]

TABLES = {
    'a': dict(scratch=8, bite=12, nurse=6, sprint=8, bash=11, dash=15, leapM=19, leapY=20),
    'b': dict(scratch=5, bite=6, nurse=4, sprint=7, bash=8, dash=10, leapM=12, leapY=12),
}

class Z:
    def __init__(s, kind, T, boss_push=False):
        s.kind = kind; s.T = T; s.acts = 0; s.broken = False; s.delayed = False
        s.revived = False; s.kneel = False
        hp = dict(walker=22, nurse=18, sprinter=16, guard=160)[kind]
        s.hp = s.maxhp = hp
        s.bar = dict(walker=5, nurse=4, sprinter=3, guard=14)[kind]; s.stg = s.bar
        s.shield = kind == 'guard'; s.boss_push = boss_push
    def alive(s): return s.hp > 0
    def intent(s, zs):
        T = s.T; a = s.acts
        if s.kind == 'walker':
            return [('M', T['bite'] if a % 3 == 2 else T['scratch'])]
        if s.kind == 'sprinter':
            return [('Y', T['sprint'])]
        if s.kind == 'nurse':
            if s.kneel or (not s.revived and any(z.kind == 'walker' and not z.alive() for z in zs)):
                return []  # kneel / revive turn
            return [('M', T['nurse'])]
        if s.kind == 'guard':
            if s.shield:
                m = ['bash', 'dash', 'leap'][a % 3]
            else:
                m = ['leap', 'dash'][a % 2]
            return {'bash': [('M', T['bash'])], 'dash': [('Y', T['dash'])],
                    'leap': [('M', T['leapM']), ('Y', T['leapY'])]}[m]
    def is_leap(s, zs):
        it = s.intent(zs); return len(it) == 2
    def cancelled(s, zs):
        if s.broken and not (s.kind == 'guard' and s.is_leap(zs)): return True
        if s.delayed: return True
        return False
    def take(s, dmg, stg):
        mult = 1.0
        if s.shield: mult -= 0.3
        if s.broken: mult += 0.5
        d = int(round(dmg * mult)); s.hp -= d
        newly = False
        if not s.broken and s.hp > 0:
            s.stg -= stg
            if s.stg <= 0:
                s.broken = True; newly = True
                if s.kind == 'guard' and s.shield:
                    s.shield = False; s.bar = 18; s.acts = 1
        return d, newly

def clone(zs):
    out = []
    for z in zs:
        c = Z.__new__(Z); c.__dict__ = dict(z.__dict__); out.append(c)
    return out

class Fight:
    def __init__(s, kinds, T, heal_frac=0.25, heal_flat=None, rng=None, stagger_reset=False,
                 push=True, dw=0.5, stall=False, hp=None, maxturns=60):
        s.rng = rng or random.Random()
        s.T = T; s.zs = [Z(k, T) for k in kinds]
        s.hp = dict(hp or MAXHP); s.heal_frac = heal_frac; s.heal_flat = heal_flat
        s.stagger_reset = stagger_reset; s.push = push; s.dw = dw; s.stall = stall
        s.draw = starter(); s.rng.shuffle(s.draw); s.disc = []
        s.turns = 0; s.maxturns = maxturns
        s.stats = dict(hands=0, nobrace=0, dead=0, cards=0, heals=0, healed=0, hr_cancel=0, taken=0, raw=0)
    def drawn(s, n):
        h = []
        for _ in range(n):
            if not s.draw:
                s.draw = s.disc; s.disc = []; s.rng.shuffle(s.draw)
                if not s.draw: break
            h.append(s.draw.pop())
        return h
    def heal_amt(s, who):
        if s.heal_flat is not None: return s.heal_flat
        return int(MAXHP[who] * s.heal_frac)
    def evaluate(s, combo, hand_left, commit=False):
        zs = s.zs if commit else clone(s.zs)
        hp = s.hp if commit else dict(s.hp)
        blk = {'M': 0, 'Y': 0}; dealt = 0; kills = 0; healv = 0
        for c in sorted(combo, key=lambda c: 0 if ('blk' in c or 'heal' in c) else 1):
            if 'blk' in c: blk[c['on']] += c['blk']
            elif 'heal' in c:
                live = [w for w in 'MY' if hp[w] > 0]
                w = max(live, key=lambda w: MAXHP[w] - hp[w])
                amt = min(s.heal_amt(w), MAXHP[w] - hp[w]); hp[w] += amt; healv += amt
                if commit: s.stats['heals'] += 1; s.stats['healed'] += amt
        atks = sorted([c for c in combo if 'dmg' in c], key=lambda c: -c['dmg'])
        for c in atks:
            live = [z for z in zs if z.alive()]
            if not live: break
            def threat(z):
                if z.cancelled(zs): return 0
                return sum(d for _, d in z.intent(zs))
            def eff(z):
                m = 1 - (0.3 if z.shield else 0) + (0.5 if z.broken else 0)
                return int(round(c['dmg'] * m))
            killable = [z for z in live if eff(z) >= z.hp]
            if killable:
                t = max(killable, key=lambda z: (threat(z), z.kind == 'nurse'))
            else:
                brk = [z for z in live if not z.broken and z.stg <= c['stg'] and threat(z) > 0]
                if brk: t = max(brk, key=threat)
                elif c.get('push') and s.push:
                    cand = [z for z in live if threat(z) > 0 and (z.kind != 'guard' or z.boss_push)]
                    t = max(cand, key=threat) if cand else min(live, key=lambda z: (z.kind != 'nurse', z.hp))
                else:
                    t = min(live, key=lambda z: (z.kind != 'nurse', z.hp))
            d, newly = t.take(c['dmg'], c['stg']); dealt += max(0, min(d, d))
            if c.get('push') and s.push and t.alive() and not t.cancelled(zs) and (t.kind != 'guard' or t.boss_push):
                t.delayed = True
                if commit: s.stats['hr_cancel'] += 1
            if not t.alive(): kills += 1
        inc = {'M': 0, 'Y': 0}
        for z in zs:
            if not z.alive() or z.cancelled(zs): continue
            for tgt, d in z.intent(zs):
                if hp[tgt] <= 0: tgt = 'Y' if tgt == 'M' else 'M'
                inc[tgt] += d
        loss = {w: max(0, inc[w] - blk[w]) for w in 'MY'}
        score = 0
        for w in 'MY':
            if hp[w] > 0:
                score -= loss[w] * (1 + 1.5 * (1 - hp[w] / MAXHP[w]))
                if loss[w] >= hp[w]: score -= 500
        score += s.dw * dealt + 4 * kills + 0.9 * healv
        return score, blk
    def player_turn(s):
        hand = s.drawn(5)
        hand = [c for c in hand if s.hp[c['h']] > 0] if True else hand
        s.stats['hands'] += 1
        if not any(c['n'] == 'Brace' for c in hand): s.stats['nobrace'] += 1
        best = None
        live = [z for z in s.zs if z.alive()]
        stall_now = s.stall and len(live) == 1 and live[0].kind == 'walker' and \
            any(s.hp[w] < MAXHP[w] for w in 'MY' if s.hp[w] > 0)
        idx = range(len(hand))
        for r in range(0, len(hand) + 1):
            for sub in itertools.combinations(idx, r):
                combo = [hand[i] for i in sub]
                if sum(c['c'] for c in combo) > 3: continue
                if stall_now and any('dmg' in c for c in combo): continue
                sc, _ = s.evaluate(combo, None)
                if best is None or sc > best[0]: best = (sc, sub)
        combo = [hand[i] for i in best[1]]
        _, blk = s.evaluate(combo, None, commit=True)
        # dead cards: block on a hero no one targets, heal at full HP
        inc = {'M': 0, 'Y': 0}
        for z in s.zs:
            if z.alive():
                for tgt, d in z.intent(s.zs): inc[tgt] += d
        for c in hand:
            s.stats['cards'] += 1
            if 'blk' in c and inc[c['on']] == 0: s.stats['dead'] += 1
            if 'heal' in c and all(s.hp[w] >= MAXHP[w] for w in 'MY' if s.hp[w] > 0): s.stats['dead'] += 1
        s.disc += hand
        return blk
    def enemy_turn(s, blk):
        zs = s.zs
        for z in zs:
            if not z.alive(): continue
            if z.broken and not (z.kind == 'guard' and z.is_leap(zs)):
                z.broken = False; z.stg = z.bar; continue
            if z.delayed:
                z.delayed = False; continue
            it = z.intent(zs)
            if z.kind == 'nurse' and not it:
                if z.kneel:
                    dead = [w for w in zs if w.kind == 'walker' and not w.alive()]
                    if dead:
                        dead[0].hp = dead[0].maxhp // 2; dead[0].stg = dead[0].bar; dead[0].broken = False
                    z.kneel = False; z.revived = True
                else:
                    z.kneel = True
                continue
            for tgt, d in it:
                if s.hp[tgt] <= 0: tgt = 'Y' if tgt == 'M' else 'M'
                if s.hp[tgt] <= 0: continue
                a = min(blk[tgt], d); blk[tgt] -= a; s.hp[tgt] -= (d - a); s.stats['taken'] += d - a; s.stats['raw'] += d
            z.acts += 1
            if z.broken:  # guard leaping while broken
                z.broken = False; z.stg = z.bar
        if s.stagger_reset:
            for z in zs:
                if not z.broken: z.stg = z.bar
    def run(s):
        while s.turns < s.maxturns:
            s.turns += 1
            blk = s.player_turn()
            if not any(z.alive() for z in s.zs): return 'win'
            s.enemy_turn(blk)
            if all(s.hp[w] <= 0 for w in 'MY'): return 'loss'
        return 'timeout'

FIGHTS = {
    '3 walkers': ['walker'] * 3,
    '2 walkers + nurse': ['walker', 'walker', 'nurse'],
    'sprinter + 2 walkers': ['sprinter', 'walker', 'walker'],
    'Shield Guard': ['guard'],
}

def batch(kinds, tab, n=2000, seed=1, **kw):
    rng = random.Random(seed)
    res = dict(taken=0, raw=0, healed=0, M=[], Y=[], P=[], turns=[], loss=0, mdown=0, timeout=0, nobrace=0, hands=0, dead=0, cards=0, heals=0, hr=0)
    for i in range(n):
        f = Fight(kinds, TABLES[tab], rng=rng, **kw)
        out = f.run()
        lm = MAXHP['M'] - max(f.hp['M'], 0); ly = MAXHP['Y'] - max(f.hp['Y'], 0)
        res['M'].append(lm); res['Y'].append(ly); res['P'].append((lm + ly) / 140)
        res['turns'].append(f.turns); res['loss'] += out == 'loss'; res['timeout'] += out == 'timeout'
        res['mdown'] += f.hp['M'] <= 0
        for k in ('hands', 'nobrace', 'dead', 'cards', 'heals', 'taken', 'raw', 'healed'): res[k] += f.stats[k]
        res['hr'] += f.stats['hr_cancel']
    return res

def fmt(name, tab, r, n):
    m = st.mean
    return (f"{name:22s} tab {tab}: turns {m(r['turns']):4.1f} | Marc -{m(r['M']):5.1f} ({m(r['M'])/80:4.0%}) "
            f"Yola -{m(r['Y']):5.1f} ({m(r['Y'])/60:4.0%}) party {m(r['P']):4.0%} | Marc down {r['mdown']/n:4.0%} "
            f"loss {r['loss']/n:4.0%} | no-Brace hands {r['nobrace']/r['hands']:4.0%} dead cards {r['dead']/r['cards']:4.0%} "
            f"heals/fight {r['heals']/n:3.1f} | gross taken {r['taken']/n:5.1f} raw intents {r['raw']/n:5.1f} healed {r['healed']/n:4.1f} HRcancels {r['hr']/n:3.1f}")

if __name__ == '__main__':
    n = int(sys.argv[1]) if len(sys.argv) > 1 else 2000
    variant = sys.argv[2] if len(sys.argv) > 2 else 'base'
    kw = {}
    if variant == 'nopush': kw['push'] = False
    if variant == 'reset': kw['stagger_reset'] = True
    if variant.startswith('dw'): kw['dw'] = float(variant[2:])
    if variant == 'heal8': kw['heal_flat'] = 8
    if variant == 'heal0': kw['heal_flat'] = 0
    if variant == 'nopush_heal8': kw['push'] = False; kw['heal_flat'] = 8
    for tab in 'ab':
        for name, kinds in FIGHTS.items():
            print(fmt(name, tab, batch(kinds, tab, n, **kw), n))
