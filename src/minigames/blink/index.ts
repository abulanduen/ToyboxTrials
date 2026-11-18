import { getMoveAxis, HUB_BINDINGS } from '../../game/input';
import type { MinigameModule } from '../types';
import { blinkRules, type BlinkInput, type BlinkState } from './rules';
import { createBlinkBot } from './bot';
import { drainBlinkInput, getBlinkAim } from './local';
import { BlinkScene } from './Scene';
import { BlinkHud } from './Hud';

const game:MinigameModule<BlinkState,BlinkInput>={
  rules:blinkRules,createBot:createBlinkBot,
  bindings:{...HUB_BINDINGS,jump:[],interact:[],run:[],slot1:['Space'],slot2:['KeyJ']},
  readLocalInput(presses) {
    const axis=getMoveAxis(), aim=getBlinkAim();
    let x=axis.x,z=-axis.y;
    if(axis.magnitude===0){if(presses.includes('forward'))z--;if(presses.includes('back'))z++;if(presses.includes('right'))x++;if(presses.includes('left'))x--;}
    const inputs:BlinkInput[]=[{type:'move',x,z}];
    if(aim)inputs.push({type:'aim',...aim});
    inputs.push(...drainBlinkInput());
    for(const action of presses) {
      if(action==='slot1')inputs.push({type:'blink'});
      if(action==='slot2')inputs.push({type:'attack'});
    }
    return inputs;
  },
  Scene:BlinkScene,Hud:BlinkHud,
};
export default game;
