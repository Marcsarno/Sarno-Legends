import random, sys, statistics as st
sys.path.insert(0,'.')
import sim
oinit = sim.Z.__init__
for ghp in (160, 120, 100):
    def init(s, kind, T, boss_push=False, ghp=ghp):
        oinit(s, kind, T, boss_push)
        if kind == 'guard': s.hp = s.maxhp = ghp
    sim.Z.__init__ = init
    for heal in (8, None):
        rng = random.Random(11); M=[];Y=[];T=[];L=0
        for i in range(400):
            kw = {'heal_flat': heal} if heal is not None else {}
            f = sim.Fight(['guard'], sim.TABLES['b'], rng=rng, **kw); o=f.run()
            M.append(80-max(f.hp['M'],0)); Y.append(60-max(f.hp['Y'],0)); T.append(f.turns); L += o=='loss'
        print(f"guard {ghp} HP, tab b, heal {'25%' if heal is None else heal}: turns {st.mean(T):4.1f} Marc -{st.mean(M)/80:4.0%} Yola -{st.mean(Y)/60:4.0%} party -{(st.mean(M)+st.mean(Y))/140:4.0%} loss {L/400:4.0%}")
