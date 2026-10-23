import random, statistics as st, sys
sys.path.insert(0, '.')
import sim
# heal-stall: Marc starts at 40/80, 3 walkers; with stall the player refuses to attack once 1 walker is left
for tab in 'ab':
    for heal in (None, 8):
        for stall in (False, True):
            rng = random.Random(7); end=[]; turns=[]; outs={}
            for i in range(400):
                kw = dict(heal_flat=heal) if heal is not None else {}
                f = sim.Fight(['walker']*3, sim.TABLES[tab], rng=rng, stall=stall, hp={'M':40,'Y':60}, maxturns=80, **kw)
                o = f.run(); outs[o]=outs.get(o,0)+1
                # stall ends when full: then attack. our stall flag only blocks attacks while someone is hurt
                end.append(max(f.hp['M'],0)); turns.append(f.turns)
            print(f"tab {tab} heal {'25%' if heal is None else heal:>3} stall {stall!s:5}: Marc ends {st.mean(end):5.1f}/80 (from 40)  turns {st.mean(turns):5.1f}  {outs}")
