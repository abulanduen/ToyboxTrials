import { describe, expect, it, vi } from 'vitest';
import { CAPS, MIX, RELEASE_CUES, createSpellboxAudio, remoteGain, spellboxVoice } from '../../src/minigames/spellbox/audio';
import type { SpellboxState } from '../../src/minigames/spellbox/rules';
import { SPELL_IDS } from '../../src/minigames/spellbox/spells';

function state() {
  return { kind:'spellbox-showdown', t:0, players:[{id:'me',x:0,z:0},{id:'bot',x:0,z:0},{id:'far',x:40,z:0}] } as unknown as SpellboxState;
}
function setup() {
  let time = 0;
  const play = vi.fn();
  const s = state();
  const hear = createSpellboxAudio('me',()=>s,play,()=>time);
  return {play,s,hear,advance:(ms:number)=>{time+=ms;s.t+=Math.round(ms/10)*10||10;},nextTick:()=>{s.t+=10;}};
}
const voice=(e:Record<string,unknown>,s=state())=>spellboxVoice({type:'',...e} as never,'me',s);

describe('Spellbox event → cue mapping (pure)',()=>{
  it('gives every spell its own release cue, Blink a zip, shield and repair their own cues',()=>{
    expect(new Set(SPELL_IDS.map(id=>RELEASE_CUES[id])).size).toBe(SPELL_IDS.length);
    expect(RELEASE_CUES['blink']).toBe('zip');expect(RELEASE_CUES['bubble-ward']).toBe('ward');expect(RELEASE_CUES['repair-stitches']).toBe('mend');
    for(const spell of SPELL_IDS)expect(voice({type:'spellbox-cast',id:'me',spell})).toEqual({cue:RELEASE_CUES[spell],gain:1,intensity:.5,lane:'local'});
    expect(voice({type:'spellbox-cast',id:'me',spell:'nope'})).toBeNull();
  });
  it('thumps the Blink shockwave and pops marble/mine bursts at their own position',()=>{
    expect(voice({type:'spellbox-blink',id:'me',x:3,z:0})).toMatchObject({cue:'thump',gain:1,lane:'local'});
    expect(voice({type:'spellbox-blink',id:'bot',x:14,z:0})).toMatchObject({cue:'thump',lane:'remote',gain:remoteGain(14)});
    expect(voice({type:'spellbox-burst',id:'bot',spell:'button-mine',x:0,z:28})).toMatchObject({cue:'burst',gain:remoteGain(28)});
  });
  it('makes impacts heavier with knockback, and loud whenever the local toy hits or is hit',()=>{
    const light=voice({type:'spellbox-hit',id:'bot',source:'me',sources:['me'],impulse:6})!,heavy=voice({type:'spellbox-hit',id:'bot',source:'me',sources:['me'],impulse:40})!;
    expect(light.cue).toBe('impact');expect(light.lane).toBe('local');expect(heavy.intensity).toBe(1);expect(light.intensity).toBeCloseTo(.2);
    expect(heavy.gain).toBeCloseTo(1);expect(light.gain).toBeGreaterThanOrEqual(.55);expect(light.gain).toBeLessThan(heavy.gain);
    expect(voice({type:'spellbox-hit',id:'me',source:'bot',sources:['bot'],impulse:10})!.lane).toBe('local');
    // Two opponents trading hits are quieter, and quieter still far away.
    const near=voice({type:'spellbox-hit',id:'bot',source:'far',sources:['far'],impulse:30})!,far=voice({type:'spellbox-hit',id:'far',source:'bot',sources:['bot'],impulse:30})!;
    expect(near.lane).toBe('remote');expect(near.gain).toBeCloseTo(MIX.remote);expect(far.gain).toBeCloseTo(remoteGain(40));
  });
  it('keeps the local toy clearly louder than any opponent, and never mutes it',()=>{
    expect(remoteGain(0)).toBeLessThanOrEqual(MIX.local/2);expect(remoteGain(40)).toBeLessThan(remoteGain(10));expect(remoteGain(1e6)).toBeGreaterThanOrEqual(0);
    for(const spell of SPELL_IDS){const mine=voice({type:'spellbox-cast',id:'me',spell})!,theirs=voice({type:'spellbox-cast',id:'bot',spell})!;expect(mine.gain).toBeGreaterThanOrEqual(2*theirs.gain);}
    expect(voice({type:'spellbox-windup',id:'me'})).toMatchObject({cue:'charge',lane:'local'});expect(voice({type:'spellbox-windup',id:'bot'})).toBeNull();
  });
  it('sounds ring-outs strongly, the shrink warning, its last three seconds and the contraction, and the fight count-in',()=>{
    expect(voice({type:'eliminated',id:'me'})).toMatchObject({cue:'ringout',gain:1,lane:'local'});
    expect(voice({type:'eliminated',id:'far'})).toMatchObject({cue:'ringout',lane:'arena',gain:MIX.ringoutFloor});
    expect(voice({type:'spellbox-shrink-warning',radius:15})).toMatchObject({cue:'alarm',gain:1,lane:'arena'});
    expect([9,4,3,2,1,0].map(seconds=>voice({type:'spellbox-shrink-tick',seconds})?.cue??null)).toEqual([null,null,'tick','tick','tick','rumble']);
    expect([4,3,2,1,0].map(seconds=>voice({type:'spellbox-countdown',seconds})?.cue??null)).toEqual([null,'tick','tick','tick',null]);
    expect(voice({type:'spellbox-start'})?.cue).toBe('go');expect(voice({type:'spellbox-finish'})).toBeNull();
  });
});

describe('Spellbox mixer caps',()=>{
  it('caps opponents per tick and per window, while the local toy and arena cues keep their own voices',()=>{
    const t=setup();
    for(let i=0;i<100;i++)t.hear({type:'spellbox-cast',id:'bot',spell:i%2?'pop-rocket':'spring-fan'});
    expect(t.play).toHaveBeenCalledTimes(CAPS.perTick.remote);
    t.hear({type:'spellbox-cast',id:'me',spell:'blink'});t.hear({type:'spellbox-blink',id:'me',x:7,z:0});t.hear({type:'spellbox-hit',id:'bot',source:'me',sources:['me'],impulse:20});
    t.hear({type:'spellbox-shrink-warning'});t.hear({type:'eliminated',id:'far'});
    expect(t.play.mock.calls.slice(2).map(c=>c[0])).toEqual(['zip','thump','impact','alarm','ringout']);
    expect(t.play.mock.calls.slice(2,5).every(c=>c[1]>=.7)).toBe(true);
  });
  it('plays one cue per lane per tick (one storm hitting three toys is one impact), and frees up next tick',()=>{
    const t=setup();
    for(const id of ['bot','far','x'])t.hear({type:'spellbox-hit',id,source:'me',sources:['me'],impulse:20});
    expect(t.play).toHaveBeenCalledTimes(1);t.advance(300);
    t.hear({type:'spellbox-hit',id:'bot',source:'me',sources:['me'],impulse:20});expect(t.play).toHaveBeenCalledTimes(2);
  });
  it('bounds local bursts across ticks too, without ever silencing a fresh local cast',()=>{
    const t=setup();
    for(let i=0;i<10;i++){t.hear({type:'spellbox-cast',id:'me',spell:'pop-rocket'});t.nextTick();}
    expect(t.play).toHaveBeenCalledTimes(CAPS.window.local.max);
    t.advance(CAPS.window.local.ms);t.hear({type:'spellbox-cast',id:'me',spell:'pop-rocket'});expect(t.play).toHaveBeenCalledTimes(CAPS.window.local.max+1);
  });
  it('passes the hit intensity through to the bus and ignores other games',()=>{
    const t=setup();t.hear({type:'spellbox-hit',id:'me',source:'bot',sources:['bot'],impulse:45});
    expect(t.play).toHaveBeenLastCalledWith('impact',1,1);
    const other=vi.fn();createSpellboxAudio('me',()=>({kind:'blink-duel'} as never),other)({type:'spellbox-cast',id:'me',spell:'blink'});expect(other).not.toHaveBeenCalled();
  });
});
