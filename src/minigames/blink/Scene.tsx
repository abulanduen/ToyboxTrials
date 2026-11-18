import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { PALETTE } from '../../game/palette';
import { sfx, unlockAudio } from '../../game/audio';
import { exposeDebug } from '../../game/debug';
import { WindupBot } from '../../character/WindupBot';
import { createToyAnim } from '../../character/anim';
import { MiniContender, createMiniAnim } from '../../character/MiniContender';
import type { Contestant, MinigameSceneProps } from '../types';
import { matchBus, useMatch } from '../session';
import { clearBlinkInput, queueBlinkInput, setBlinkAim } from './local';
import { DEFAULT_CONFIG, type BlinkState } from './rules';

/** Shape is on local X/Y; rotate onto the tabletop with zero pointing forwards (+Z). */
function sectorGeometry(radius:number,halfAngle:number) {
  const shape=new THREE.Shape();shape.moveTo(0,0);
  for(let i=0;i<=32;i++){const a=-halfAngle+i/32*halfAngle*2;shape.lineTo(Math.sin(a)*radius,Math.cos(a)*radius);}
  shape.lineTo(0,0);return new THREE.ShapeGeometry(shape);
}
function Toy({c,getState}:{c:Contestant;getState:()=>BlinkState|null}) {
  const root=useRef<THREE.Group>(null!), blade=useRef<THREE.Group>(null!), warning=useRef<THREE.Group>(null!), fill=useRef<THREE.Mesh>(null!), flash=useRef<THREE.Group>(null!);
  const spring=useRef<THREE.Group>(null!), origin=useRef<THREE.Mesh>(null!), aimRing=useRef<THREE.Mesh>(null!);
  const full=useRef(createToyAnim()),mini=useRef(createMiniAnim()),previous=useRef({x:0,z:0,t:0});
  const shape=useMemo(()=>sectorGeometry(DEFAULT_CONFIG.attackRange,DEFAULT_CONFIG.halfAngle),[]);
  useEffect(()=>()=>shape.dispose(),[shape]);
  const reduced=useRef(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  useFrame(()=>{
    const s=getState(),p=s?.kind==='blink-duel'?s.players.find(p=>p.id===c.id):undefined;
    root.current.visible=!!p;warning.current.visible=false;flash.current.visible=false;spring.current.visible=false;origin.current.visible=false;aimRing.current.visible=false;
    if(!p||!s)return;
    const dt=Math.max(0,(s.t-previous.current.t)/1000),distance=Math.hypot(p.x-previous.current.x,p.z-previous.current.z);
    full.current.speed=p.alive&&!p.attack?Math.min(8,distance/Math.max(.01,dt)):0;full.current.stepPhase+=full.current.speed*dt;
    full.current.elimT=p.alive?-1:(s.t-p.outAt)/1000;mini.current.outT=p.alive?-1:(s.t-p.outAt)/1000;
    previous.current={x:p.x,z:p.z,t:s.t};root.current.position.set(p.x,.18,p.z);root.current.rotation.y=p.angle;
    const charge=p.attack?(s.t-p.attack.start)/s.config.windupMs:0;
    blade.current.visible=p.alive;
    blade.current.rotation.z=p.attack?-.9-charge*.5:0;
    blade.current.rotation.y=p.lastStrike&&s.t-p.lastStrike.at<240&&!reduced.current?-1.2+(s.t-p.lastStrike.at)/100:0;
    if(p.attack){
      warning.current.visible=true;warning.current.position.set(p.attack.x,.09,p.attack.z);warning.current.rotation.y=p.attack.angle;
      fill.current.scale.setScalar(Math.max(.01,charge));
      (fill.current.material as THREE.MeshBasicMaterial).opacity=.18+charge*.35;
    }
    if(p.lastStrike&&s.t-p.lastStrike.at<250){flash.current.visible=true;flash.current.position.set(p.lastStrike.x,.12,p.lastStrike.z);flash.current.rotation.y=p.lastStrike.angle;}
    if(p.lastBlink&&s.t-p.lastBlink.at<400){
      const age=(s.t-p.lastBlink.at)/400;
      spring.current.visible=true;spring.current.position.set(p.lastBlink.tx,.25,p.lastBlink.tz);
      spring.current.scale.setScalar(reduced.current?1:.4+age*2.3);
      (spring.current.children[0] as THREE.Mesh<THREE.TorusGeometry,THREE.MeshBasicMaterial>).material.opacity=1-age;
      origin.current.visible=true;origin.current.position.set(p.lastBlink.x,.12,p.lastBlink.z);
      (origin.current.material as THREE.MeshBasicMaterial).opacity=(1-age)*.6;
    }
    if(c.isLocal&&p.alive&&!p.attack){
      const limit=s.config.halfSize-s.config.radius;
      aimRing.current.visible=true;aimRing.current.position.set(Math.max(-limit,Math.min(limit,p.x+Math.sin(p.angle)*s.config.blinkRange)),.1,Math.max(-limit,Math.min(limit,p.z+Math.cos(p.angle)*s.config.blinkRange)));
    }
  });
  return <>
    <group ref={root}>
      {c.isLocal?<WindupBot anim={full} paint={c.paint} hat={c.hat} keySkin={c.keySkin}/>:<MiniContender anim={mini} paint={c.paint}/>}
      <group ref={blade} position={[1.1,1.5,.25]}>
        <mesh position={[0,0,1.65]} castShadow><boxGeometry args={[.55,.2,3.5]}/><meshStandardMaterial color={PALETTE.cream} metalness={.15} roughness={.45}/></mesh>
        <mesh position={[0,0,-.3]}><cylinderGeometry args={[.18,.18,1,8]}/><meshStandardMaterial color={PALETTE.brass}/></mesh>
        <mesh><boxGeometry args={[1.15,.28,.28]}/><meshStandardMaterial color={PALETTE.coral}/></mesh>
      </group>
      {c.isLocal&&<mesh rotation={[-Math.PI/2,0,0]} position={[0,.02,0]}><ringGeometry args={[1.2,1.45,24]}/><meshBasicMaterial color={PALETTE.honey}/></mesh>}
    </group>
    <group ref={warning}>
      <mesh rotation={[Math.PI/2,0,0]} geometry={shape}><meshBasicMaterial color={c.isLocal?PALETTE.honey:PALETTE.coral} transparent opacity={.22} side={THREE.DoubleSide} depthWrite={false}/></mesh>
      <mesh ref={fill} rotation={[Math.PI/2,0,0]} position={[0,.01,0]} geometry={shape}><meshBasicMaterial color={PALETTE.coral} transparent side={THREE.DoubleSide} depthWrite={false}/></mesh>
      {[-1,-.5,0,.5,1].map((n,i)=><mesh key={i} position={[Math.sin(n*DEFAULT_CONFIG.halfAngle)*3,.035,Math.cos(n*DEFAULT_CONFIG.halfAngle)*3]} rotation={[-Math.PI/2,0,-n*DEFAULT_CONFIG.halfAngle]}><planeGeometry args={[.16,4.7]}/><meshBasicMaterial color={PALETTE.cream} transparent opacity={.7} depthWrite={false}/></mesh>)}
    </group>
    <group ref={flash}><mesh rotation={[Math.PI/2,0,0]} geometry={shape}><meshBasicMaterial color={PALETTE.cream} transparent opacity={.7} side={THREE.DoubleSide} depthWrite={false}/></mesh></group>
    <group ref={spring}><mesh rotation={[Math.PI/2,0,0]}><torusGeometry args={[1,.12,6,24]}/><meshBasicMaterial color={PALETTE.toyBlue} transparent/></mesh>{[0,1,2,3,4,5].map(i=><mesh key={i} position={[Math.sin(i*Math.PI/3)*1.1,.1,Math.cos(i*Math.PI/3)*1.1]}><sphereGeometry args={[.15,6,6]}/><meshBasicMaterial color={PALETTE.brass}/></mesh>)}</group>
    <mesh ref={origin} rotation={[-Math.PI/2,0,0]}><ringGeometry args={[.9,1.1,24]}/><meshBasicMaterial color={PALETTE.toyBlue} transparent/></mesh>
    <mesh ref={aimRing} rotation={[-Math.PI/2,0,0]}><ringGeometry args={[.65,.8,24]}/><meshBasicMaterial color={PALETTE.honey} transparent opacity={.7}/></mesh>
  </>;
}
export function BlinkScene({getState,localId,contestants}:MinigameSceneProps<BlinkState>) {
  const {camera,gl}=useThree();const pointer=useRef<THREE.Vector3|null>(null);
  useEffect(()=>{
    const ray=new THREE.Raycaster(),ndc=new THREE.Vector2(),plane=new THREE.Plane(new THREE.Vector3(0,1,0),0),hit=new THREE.Vector3();
    const active=()=>{const s=getState();return s?.kind==='blink-duel'&&s.phase==='duel'&&s.players.find(p=>p.id===localId)?.alive&&!useMatch.getState().paused&&useMatch.getState().phase==='playing';};
    const aim=(e:PointerEvent)=>{
      if(!active())return;
      const rect=gl.domElement.getBoundingClientRect();ndc.set((e.clientX-rect.left)/rect.width*2-1,1-(e.clientY-rect.top)/rect.height*2);ray.setFromCamera(ndc,camera);
      if(ray.ray.intersectPlane(plane,hit)){pointer.current=hit.clone();const p=getState()!.players.find(p=>p.id===localId)!;setBlinkAim({x:hit.x-p.x,z:hit.z-p.z});}
    };
    const retainAim=()=>{const p=getState()?.players.find(p=>p.id===localId);if(active()&&pointer.current&&p)queueBlinkInput({type:'aim',x:pointer.current.x-p.x,z:pointer.current.z-p.z});};
    const down=(e:PointerEvent)=>{aim(e);retainAim();if(active()&&e.pointerType==='mouse'&&e.button===0){unlockAudio();queueBlinkInput({type:'attack'});}};
    const clear=()=>{pointer.current=null;clearBlinkInput();};
    const leave=(e:PointerEvent)=>{if(e.pointerType==='touch')return;retainAim();pointer.current=null;setBlinkAim(null);};
    const off=useMatch.subscribe(s=>{if(s.paused||s.phase!=='playing')clear();});
    const old=gl.domElement.style.touchAction;gl.domElement.style.touchAction='none';
    gl.domElement.addEventListener('pointermove',aim);gl.domElement.addEventListener('pointerdown',down);gl.domElement.addEventListener('pointerleave',leave);window.addEventListener('blur',clear);
    return()=>{off();clear();gl.domElement.style.touchAction=old;gl.domElement.removeEventListener('pointermove',aim);gl.domElement.removeEventListener('pointerdown',down);gl.domElement.removeEventListener('pointerleave',leave);window.removeEventListener('blur',clear);};
  },[camera,gl,getState,localId]);
  useEffect(()=>matchBus.on('event',e=>{
    if(e.type==='blink')sfx.jump();if(e.type==='duel-windup')sfx.crank(1);if(e.type==='duel-strike')sfx.bump();if(e.type==='eliminated')sfx.eliminate();
  }),[]);
  useEffect(()=>{exposeDebug({blink:{point:(x:number,z:number,height=.1)=>{const p=new THREE.Vector3(x,height,z).project(camera),r=gl.domElement.getBoundingClientRect();return{x:r.left+(p.x+1)*r.width/2,y:r.top+(1-p.y)*r.height/2};}}});},[camera,gl]);
  useFrame(()=>{
    const cam=camera as THREE.PerspectiveCamera,aspect=cam.aspect;
    const fov=aspect<1?50+(1-aspect)*40:50;if(cam.fov!==fov){cam.fov=fov;cam.updateProjectionMatrix();}
    const distance=Math.max(56,31/aspect);camera.position.set(0,distance,distance*.52);camera.lookAt(0,0,1);
    const s=getState();if(s?.kind==='blink-duel'&&pointer.current&&!useMatch.getState().paused){const p=s.players.find(p=>p.id===localId);if(p)setBlinkAim({x:pointer.current.x-p.x,z:pointer.current.z-p.z});}
  });
  return <group>
    <mesh position={[0,-.5,0]} receiveShadow><boxGeometry args={[35,1,35]}/><meshStandardMaterial color={PALETTE.woodMid}/></mesh>
    <mesh rotation={[-Math.PI/2,0,0]} position={[0,.02,0]} receiveShadow><planeGeometry args={[32,32]}/><meshStandardMaterial color={PALETTE.feltDark} roughness={1}/></mesh>
    {[-16.35,16.35].flatMap((n,i)=>[<mesh key={`x${i}`} position={[n,.4,0]}><boxGeometry args={[.65,.8,33]}/><meshStandardMaterial color={PALETTE.cardboard}/></mesh>,<mesh key={`z${i}`} position={[0,.4,n]}><boxGeometry args={[33,.8,.65]}/><meshStandardMaterial color={PALETTE.cardboard}/></mesh>])}
    {[-12,-6,0,6,12].flatMap(n=>[<mesh key={`v${n}`} position={[n,.04,0]} rotation={[-Math.PI/2,0,0]}><planeGeometry args={[.045,32]}/><meshBasicMaterial color={PALETTE.felt}/></mesh>,<mesh key={`h${n}`} position={[0,.04,n]} rotation={[-Math.PI/2,0,0]}><planeGeometry args={[32,.045]}/><meshBasicMaterial color={PALETTE.felt}/></mesh>])}
    <mesh position={[0,.05,0]} rotation={[-Math.PI/2,0,0]}><ringGeometry args={[2.8,2.9,32]}/><meshBasicMaterial color={PALETTE.cream}/></mesh>
    {contestants.map(c=><Toy key={c.id} c={c} getState={getState}/>)}
  </group>;
}
