import { describe, expect, it, vi } from 'vitest';
import { createSpellboxAudio } from '../../src/minigames/spellbox/audio';
import type { SpellboxState } from '../../src/minigames/spellbox/rules';
import { SPELL_IDS } from '../../src/minigames/spellbox/spells';

function setup() {
  let time = 0;
  const play = vi.fn();
  const s = { kind:'spellbox-showdown', players:[{id:'me',x:0,z:0},{id:'bot',x:0,z:0}] } as SpellboxState;
  const hear = createSpellboxAudio('me',()=>s,play,()=>time);
  return {play,s,hear,advance:(ms:number)=>{time+=ms;}};
}
describe('Spellbox presentation mix',()=>{
  it('limits opponent bursts while reserving local and warning cues',()=>{
    const t = setup();
    for(let i=0;i<100;i++)t.hear({type:'spellbox-cast',id:'bot',spell:'pop-rocket'});
    expect(t.play).toHaveBeenCalledTimes(2);
    t.hear({type:'spellbox-cast',id:'me',spell:'pop-rocket'});
    t.hear({type:'spellbox-shrink-warning'});
    expect(t.play.mock.calls.slice(-2)).toEqual([['puff',.85],['warning',.8]]);
    t.advance(250);t.hear({type:'spellbox-cast',id:'bot',spell:'pop-rocket'});
    expect(t.play).toHaveBeenCalledTimes(5);
  });
  it('attenuates distant opponents and omits their repeated charge sounds',()=>{
    const t=setup();t.hear({type:'spellbox-windup',id:'bot'});
    expect(t.play).not.toHaveBeenCalled();
    t.hear({type:'spellbox-hit',id:'bot'});const near=t.play.mock.calls[0][1];
    t.advance(300);t.s.players[1].x=36;t.hear({type:'spellbox-hit',id:'bot'});
    expect(t.play.mock.calls[1][1]).toBeCloseTo(near/4);
  });
  it('provides eight distinct casts and preserves only the final three countdown ticks',()=>{
    const t=setup();
    for(const spell of SPELL_IDS){t.hear({type:'spellbox-cast',id:'me',spell});t.advance(300);}
    expect(new Set(t.play.mock.calls.map(c=>c[0])).size).toBe(8);
    t.play.mockClear();
    for(let seconds=10;seconds>=0;seconds--){t.hear({type:'spellbox-shrink-tick',seconds});t.advance(1000);}
    expect(t.play.mock.calls).toEqual([['count',.8],['count',.8],['count',.8]]);
  });
});
