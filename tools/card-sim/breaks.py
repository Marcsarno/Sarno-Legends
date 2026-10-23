import random, sys
sys.path.insert(0,'.')
import sim
orig = sim.Fight.player_turn
def pt(self):
    before = {id(z): z.broken for z in self.zs}
    r = orig(self)
    self.nb = getattr(self,'nb',0) + sum(1 for z in self.zs if z.broken and not before[id(z)])
    return r
sim.Fight.player_turn = pt
for reset in (False, True):
    for kinds in (['walker']*3, ['guard']):
        nb=0; turns=0; rng=random.Random(3); n=300
        for i in range(n):
            f = sim.Fight(kinds, sim.TABLES['b'], rng=rng, stagger_reset=reset, heal_flat=8)
            f.run(); turns += f.turns; nb += getattr(f,'nb',0)
        print(f"{kinds[0]:7s} {'reset' if reset else 'carry'}: breaks/fight {nb/n:4.2f}  breaks/turn {nb/turns:4.2f}  turns {turns/n:4.1f}")
