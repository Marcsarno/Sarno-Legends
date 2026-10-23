import random, sys
sys.path.insert(0,'.')
import sim
orig = sim.Fight.player_turn
hps=[]
def pt(self):
    before = {id(z): z.broken for z in self.zs}
    r = orig(self)
    for z in self.zs:
        if z.broken and not before[id(z)] and z.alive() and z.kind=='walker': hps.append(z.hp)
    return r
sim.Fight.player_turn = pt
rng=random.Random(5)
for i in range(400): sim.Fight(['walker']*3, sim.TABLES['b'], rng=rng, heal_flat=8).run()
hps.sort(); n=len(hps)
print('walkers broken & alive at end of player turn:', n/400, 'per fight; HP left median', hps[n//2], 'mean', round(sum(hps)/n,1), 'share <=9 (one broken Bat kills):', round(sum(h<=9 for h in hps)/n,2))
