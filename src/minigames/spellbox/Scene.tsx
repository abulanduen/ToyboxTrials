import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { PALETTE } from '../../game/palette';
import { sfx, unlockAudio } from '../../game/audio';
import { exposeDebug } from '../../game/debug';
import { WindupBot } from '../../character/WindupBot';
import { createToyAnim } from '../../character/anim';
import { MiniContender, createMiniAnim } from '../../character/MiniContender';
import { useMatch, matchBus } from '../session';
import type { Contestant, MinigameSceneProps } from '../types';
import { clearSpellboxInput, queueSpellboxInput, setSpellboxAim } from './local';
import { SPELLS } from './spells';
import type { SpellboxState } from './rules';

function coneGeometry(){const shape=new THREE.Shape();shape.moveTo(0,0);for(let i=0;i<=24;i++){const a=-Math.PI/3+i/24*Math.PI*2/3;shape.lineTo(Math.sin(a)*6,Math.cos(a)*6);}shape.lineTo(0,0);return new THREE.ShapeGeometry(shape);}
function MageToy({c,getState}:{c:Contestant;getState:()=>SpellboxState|null}){
  const root=useRef<THREE.Group>(null!),zone=useRef<THREE.Group>(null!),cone=useRef<THREE.Mesh>(null!),circle=useRef<THREE.Mesh>(null!),line=useRef<THREE.Mesh>(null!),shield=useRef<THREE.Mesh>(null!),halo=useRef<THREE.Mesh>(null!);
  const full=useRef(createToyAnim()),mini=useRef(createMiniAnim()),previous=useRef({x:0,z:0,t:0});
  const geometry=useMemo(coneGeometry,[]);useEffect(()=>()=>geometry.dispose(),[geometry]);
  useFrame(()=>{
    const s=getState(),p=s?.kind==='spellbox-showdown'?s.players.find(p=>p.id===c.id):undefined;
    root.current.visible=!!p;zone.current.visible=false;if(!p||!s)return;
    const dt=Math.max(.01,(s.t-previous.current.t)/1000),moved=Math.hypot(p.x-previous.current.x,p.z-previous.current.z);
    full.current.speed=p.alive?Math.min(8,moved/dt):0;full.current.stepPhase+=full.current.speed*dt;full.current.elimT=p.alive?-1:(s.t-p.outAt)/1000;mini.current.outT=p.alive?-1:(s.t-p.outAt)/1000;
    previous.current={x:p.x,z:p.z,t:s.t};root.current.position.set(p.x,p.alive?.18:.18-Math.min(8,(s.t-p.outAt)/1000*9),p.z);root.current.rotation.y=p.cast?.angle??p.angle;
    shield.current.visible=p.alive&&p.shieldUntil>s.t;
    (halo.current.material as THREE.MeshBasicMaterial).color.set(p.lastHit>=0&&s.t-p.lastHit<150?PALETTE.white:p.damage>100?PALETTE.coral:p.damage>40?PALETTE.honey:c.isLocal?PALETTE.toyBlue:PALETTE.cream);
    if(p.cast&&p.alive){
      const d=SPELLS[p.cast.spell],charge=Math.max(.03,(s.t-p.cast.start)/Math.max(10,d.windup));
      zone.current.visible=true;zone.current.position.set(p.x,.1,p.z);zone.current.rotation.y=p.cast.angle;
      cone.current.visible=d.effect==='cone';circle.current.visible=['nova','shield','repair','mine'].includes(d.effect);line.current.visible=['bolt','bomb','pull'].includes(d.effect);
      circle.current.scale.setScalar(d.effect==='nova'?d.range:d.effect==='mine'?3:1.7);circle.current.position.z=d.effect==='mine'?d.range:0;
      for(const mesh of [cone.current,circle.current,line.current]){const mat=mesh.material as THREE.MeshBasicMaterial;mat.color.set(d.colour);mat.opacity=.18+charge*.35;}
    }
  });
  return<>
    <group ref={root}>
      {c.isLocal?<WindupBot anim={full} paint={c.paint} hat={c.hat} keySkin={c.keySkin}/>:<MiniContender anim={mini} paint={c.paint}/>}
      <group position={[1.15,1.4,.4]} rotation={[.25,0,-.2]}><mesh><cylinderGeometry args={[.1,.14,2.7,8]}/><meshStandardMaterial color={PALETTE.woodDark}/></mesh><mesh position={[0,1.6,0]}><octahedronGeometry args={[.5]}/><meshStandardMaterial color={PALETTE.honey} emissive={PALETTE.honey} emissiveIntensity={.25}/></mesh><mesh position={[0,1.3,0]}><torusGeometry args={[.38,.08,6,12]}/><meshStandardMaterial color={PALETTE.brass}/></mesh></group>
      <mesh ref={halo} position={[0,.02,0]} rotation={[-Math.PI/2,0,0]}><ringGeometry args={[1.1,1.35,24]}/><meshBasicMaterial/></mesh>
      <mesh ref={shield} position={[0,1.5,0]} raycast={()=>{}}><sphereGeometry args={[2,16,12]}/><meshBasicMaterial color={PALETTE.sage} transparent opacity={.24} depthWrite={false} wireframe/></mesh>
    </group>
    <group ref={zone}>
      <mesh ref={cone} rotation={[Math.PI/2,0,0]} geometry={geometry}><meshBasicMaterial transparent side={THREE.DoubleSide} depthWrite={false}/></mesh>
      <mesh ref={circle} rotation={[-Math.PI/2,0,0]}><ringGeometry args={[.86,1,32]}/><meshBasicMaterial transparent side={THREE.DoubleSide} depthWrite={false}/></mesh>
      <mesh ref={line} position={[0,0,5]}><boxGeometry args={[.22,.05,10]}/><meshBasicMaterial transparent depthWrite={false}/></mesh>
    </group>
  </>;
}
function Spells({getState}:{getState:()=>SpellboxState|null}){
  const shots=useRef<THREE.InstancedMesh>(null!),bursts=useRef<THREE.InstancedMesh>(null!),mines=useRef<THREE.InstancedMesh>(null!),rings=useRef<THREE.InstancedMesh>(null!);
  const marker=useMemo(()=>new THREE.Object3D(),[]),colour=useMemo(()=>new THREE.Color(),[]);
  const reduced=useRef(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  useFrame(()=>{
    const s=getState(),valid=s?.kind==='spellbox-showdown';
    const projectiles=valid?s.projectiles:[],effects=valid?s.effects:[],buttons=valid?s.mines:[];
    shots.current.count=projectiles.length;bursts.current.count=effects.length;mines.current.count=buttons.length;rings.current.count=buttons.length;
    projectiles.forEach((p,i)=>{marker.position.set(p.x,1.2,p.z);marker.rotation.set(0,Math.atan2(p.dx,p.dz),0);const pull=SPELLS[p.spell].effect==='pull';marker.scale.set(pull?.18:.48,pull?.18:.48,pull?1.5:.48);marker.updateMatrix();shots.current.setMatrixAt(i,marker.matrix);colour.set(SPELLS[p.spell].colour);shots.current.setColorAt(i,colour);});
    effects.forEach((e,i)=>{const age=(s!.t-e.at)/550;marker.position.set(e.x,.2+(e.kind==='repair'?age*2:0),e.z);marker.rotation.set(Math.PI/2,0,0);marker.scale.setScalar(reduced.current?e.radius:e.radius*(.3+age));marker.updateMatrix();bursts.current.setMatrixAt(i,marker.matrix);colour.set(SPELLS[e.spell].colour).lerp(new THREE.Color(PALETTE.cream),age);bursts.current.setColorAt(i,colour);});
    buttons.forEach((m,i)=>{marker.position.set(m.x,.16,m.z);marker.rotation.set(Math.PI/2,0,0);marker.scale.setScalar(.7);marker.updateMatrix();mines.current.setMatrixAt(i,marker.matrix);colour.set(s!.t>=m.armAt?PALETTE.coral:PALETTE.brass);mines.current.setColorAt(i,colour);marker.position.y=.06;marker.scale.setScalar(3);marker.updateMatrix();rings.current.setMatrixAt(i,marker.matrix);});
    for(const mesh of [shots.current,bursts.current,mines.current,rings.current]){mesh.instanceMatrix.needsUpdate=true;if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;}
  });
  return<>
    <instancedMesh ref={shots} args={[undefined,undefined,64]} frustumCulled={false} raycast={()=>{}}><sphereGeometry args={[1,10,8]}/><meshBasicMaterial toneMapped={false}/></instancedMesh>
    <instancedMesh ref={bursts} args={[undefined,undefined,64]} frustumCulled={false} raycast={()=>{}}><torusGeometry args={[1,.1,6,24]}/><meshBasicMaterial transparent opacity={.65} toneMapped={false}/></instancedMesh>
    <instancedMesh ref={mines} args={[undefined,undefined,16]} frustumCulled={false} raycast={()=>{}}><torusGeometry args={[1,.3,6,12]}/><meshBasicMaterial/></instancedMesh>
    <instancedMesh ref={rings} args={[undefined,undefined,16]} frustumCulled={false} raycast={()=>{}}><torusGeometry args={[1,.025,4,24]}/><meshBasicMaterial color={PALETTE.coral} transparent opacity={.45}/></instancedMesh>
  </>;
}
export function SpellboxScene({getState,localId,contestants}:MinigameSceneProps<SpellboxState>){
  const{camera,gl}=useThree();const pointer=useRef<THREE.Vector3|null>(null);
  const cursor=useRef<THREE.Vector2|null>(null),touchAim=useRef(false);
  const pointerRay=useMemo(()=>new THREE.Raycaster(),[]),floorPlane=useMemo(()=>new THREE.Plane(new THREE.Vector3(0,1,0),0),[]);
  const stage=useRef<THREE.Group>(null!),target=useRef<THREE.Group>(null!);
  useEffect(()=>{
    const ray=pointerRay,ndc=new THREE.Vector2(),plane=floorPlane,hit=new THREE.Vector3();
    const active=()=>{const s=getState();return s?.kind==='spellbox-showdown'&&s.phase==='arena'&&s.players.find(p=>p.id===localId)?.alive&&!useMatch.getState().paused&&useMatch.getState().phase==='playing';};
    const aim=(e:PointerEvent)=>{if(!active())return;const r=gl.domElement.getBoundingClientRect();ndc.set((e.clientX-r.left)/r.width*2-1,1-(e.clientY-r.top)/r.height*2);cursor.current=ndc.clone();touchAim.current=e.pointerType==='touch';ray.setFromCamera(ndc,camera);if(ray.ray.intersectPlane(plane,hit)){pointer.current=hit.clone();const p=getState()!.players.find(p=>p.id===localId)!;setSpellboxAim({x:hit.x-p.x,z:hit.z-p.z});}};
    const retain=()=>{const p=getState()?.players.find(p=>p.id===localId);if(active()&&pointer.current&&p)queueSpellboxInput({type:'aim',x:pointer.current.x-p.x,z:pointer.current.z-p.z});};
    const down=(e:PointerEvent)=>{aim(e);retain();if(active()&&e.pointerType==='mouse'&&e.button===0){unlockAudio();queueSpellboxInput({type:'cast',slot:0});}};
    const clear=()=>{pointer.current=null;cursor.current=null;clearSpellboxInput();};const leave=(e:PointerEvent)=>{if(e.pointerType==='touch')return;retain();pointer.current=null;cursor.current=null;setSpellboxAim(null);};
    const off=useMatch.subscribe(s=>{if(s.paused||s.phase!=='playing')clear();});const old=gl.domElement.style.touchAction;gl.domElement.style.touchAction='none';
    gl.domElement.addEventListener('pointermove',aim);gl.domElement.addEventListener('pointerdown',down);gl.domElement.addEventListener('pointerleave',leave);window.addEventListener('blur',clear);
    return()=>{off();clear();gl.domElement.style.touchAction=old;gl.domElement.removeEventListener('pointermove',aim);gl.domElement.removeEventListener('pointerdown',down);gl.domElement.removeEventListener('pointerleave',leave);window.removeEventListener('blur',clear);};
  },[camera,gl,getState,localId,pointerRay,floorPlane]);
  useEffect(()=>matchBus.on('event',e=>{if(e.type==='spellbox-windup')sfx.crank(1);if(e.type==='spellbox-cast')sfx.bell();if(e.type==='spellbox-hit')sfx.bump();if(e.type==='eliminated')sfx.eliminate();if(e.type==='spellbox-shrink-warning')sfx.bell();if(e.type==='spellbox-shrink-tick')sfx.tick();}),[]);
  useEffect(()=>{exposeDebug({spellbox:{point:(x:number,z:number,height=.1)=>{const p=new THREE.Vector3(x,height,z).project(camera),r=gl.domElement.getBoundingClientRect();return{x:r.left+(p.x+1)*r.width/2,y:r.top+(1-p.y)*r.height/2};}}});},[camera,gl]);
  useFrame(()=>{
    const cam=camera as THREE.PerspectiveCamera,aspect=cam.aspect,fov=aspect<1?50+(1-aspect)*40:50;if(cam.fov!==fov){cam.fov=fov;cam.updateProjectionMatrix();}
    const s=getState(),radius=s?.kind==='spellbox-showdown'?s.radius:15;
    const scale=radius/15,distance=Math.max(56,31/aspect)*scale;camera.position.set(0,distance,distance*.52);camera.lookAt(0,0,scale);
    stage.current.scale.set(scale,1,scale);target.current.visible=s?.kind==='spellbox-showdown'&&!!s.shrink;
    if(s?.kind==='spellbox-showdown'&&s.shrink)target.current.scale.set(s.shrink.to,1,s.shrink.to);
    if(s?.kind==='spellbox-showdown'&&pointer.current&&!useMatch.getState().paused){
      if(cursor.current&&!touchAim.current){camera.updateMatrixWorld();pointerRay.setFromCamera(cursor.current,camera);pointerRay.ray.intersectPlane(floorPlane,pointer.current);}
      const p=s.players.find(p=>p.id===localId);if(p)setSpellboxAim({x:pointer.current.x-p.x,z:pointer.current.z-p.z});
    }
  });
  return<group>
    <group ref={stage}>
    <mesh position={[0,-.55,0]} receiveShadow><cylinderGeometry args={[15.4,15.6,1,64]}/><meshStandardMaterial color={PALETTE.woodMid}/></mesh>
    <mesh position={[0,.01,0]} receiveShadow><cylinderGeometry args={[15,15,.08,64]}/><meshStandardMaterial color={PALETTE.inkPurple} roughness={.8}/></mesh>
    <mesh rotation={[Math.PI/2,0,0]} position={[0,.07,0]}><torusGeometry args={[15,.16,6,64]}/><meshStandardMaterial color={PALETTE.cream}/></mesh>
    {[5,10].map(r=><mesh key={r} position={[0,.065,0]} rotation={[-Math.PI/2,0,0]}><ringGeometry args={[r-.03,r+.03,64]}/><meshBasicMaterial color={PALETTE.cardboard}/></mesh>)}
    {Array.from({length:12},(_,i)=>{const a=i*Math.PI/6;return<mesh key={i} position={[Math.sin(a)*14.5,.08,Math.cos(a)*14.5]} rotation={[-Math.PI/2,0,-a]}><planeGeometry args={[.15,.65]}/><meshBasicMaterial color={PALETTE.honey}/></mesh>;})}
    <mesh position={[0,.07,0]} rotation={[-Math.PI/2,0,0]}><circleGeometry args={[1.8,6]}/><meshBasicMaterial color={PALETTE.toyBlue}/></mesh>
    </group>
    <group ref={target} position={[0,.13,0]}>{Array.from({length:32},(_,i)=><mesh key={i} rotation={[-Math.PI/2,0,0]}><ringGeometry args={[.985,1.015,3,1,i*Math.PI/16,Math.PI/28]}/><meshBasicMaterial color={PALETTE.honey} side={THREE.DoubleSide} depthTest={false}/></mesh>)}</group>
    {contestants.map(c=><MageToy key={c.id} c={c} getState={getState}/>)}<Spells getState={getState}/>
  </group>;
}
