import { getMoveAxis, HUB_BINDINGS } from '../../game/input';
import type { MinigameModule } from '../types';
import { spellboxRules, type SpellboxInput, type SpellboxState } from './rules';
import { createSpellboxBot } from './bot';
import { drainSpellboxInput, getSpellboxAim } from './local';
import { SpellboxScene } from './Scene';
import { SpellboxHud } from './Hud';
const game:MinigameModule<SpellboxState,SpellboxInput>={
  rules:spellboxRules,createBot:createSpellboxBot,
  bindings:{...HUB_BINDINGS,jump:[],interact:[],run:[],slot1:['KeyQ'],slot2:['KeyE'],slot3:['KeyR']},
  readLocalInput(presses){
    const axis=getMoveAxis(),aim=getSpellboxAim();let x=axis.x,z=-axis.y;
    if(axis.magnitude===0){if(presses.includes('forward'))z--;if(presses.includes('back'))z++;if(presses.includes('left'))x--;if(presses.includes('right'))x++;}
    const inputs:SpellboxInput[]=[{type:'move',x,z}];if(aim)inputs.push({type:'aim',...aim});inputs.push(...drainSpellboxInput());
    for(const a of presses){const slot=['slot1','slot2','slot3'].indexOf(a);if(slot>=0)inputs.push({type:'cast',slot});}return inputs;
  },Scene:SpellboxScene,Hud:SpellboxHud,
};
export default game;
