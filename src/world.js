import {loadMantaGraph,indexGraph,graphDistances,edgeKey} from './graph.js';
import {planRoute} from './routing.js';
export {edgeKey};
export function random(w){w.rngState=(Math.imul(1664525,w.rngState)+1013904223)>>>0;return w.rngState/4294967296;}
export function createWorld(round=1,seed=42,{graph=loadMantaGraph(),strategy='predictive'}={}){
  if(![1,2,3].includes(round)||!Number.isInteger(seed))throw new Error('Ronda o semilla inválida');
  const w={schemaVersion:2,round,seed,rngState:seed>>>0,turno:0,phase:'idle',strategy,nodes:graph.nodes,edges:graph.edges,mapMetadata:graph.metadata,...indexGraph(graph),refugios:[],sobrevivientes:[],zombies:[],aristasBloqueadas:[],eventos:[],traces:[],httpMetrics:[]};
  const chosen=[w.nodes[0].id];while(chosen.length<4){const maps=chosen.map(n=>graphDistances(w,n));const candidate=w.nodes.filter(n=>!chosen.includes(n.id)).sort((a,b)=>Math.min(...maps.map(m=>m.get(b.id)??0))-Math.min(...maps.map(m=>m.get(a.id)??0)))[0];chosen.push(candidate.id);}
  w.refugios=chosen.map((n,i)=>({id:`R-${i+1}`,nodo:n,simulado:true}));
  const pool=w.nodes.filter(n=>!chosen.includes(n.id)).map(n=>n.id);for(let i=pool.length-1;i>0;i--){const j=Math.floor(random(w)*(i+1));[pool[i],pool[j]]=[pool[j],pool[i]];}
  const count=[20,80,200][round-1];w.sobrevivientes=pool.slice(0,count).map((n,i)=>({id:`S-${String(i).padStart(4,'0')}`,nodo:n,estado:'activo',ruta:[],pasos:0,turnos:0}));
  const types=round===1?['caminante']:round===2?['caminante','corredor','horda']:['caminante','corredor','horda','dormido'];
  w.zombies=pool.slice(count,count+[8,16,24][round-1]).map((n,i)=>({id:`Z-${i}`,tipo:types[i%types.length],nodo:n}));
  for(const s of w.sobrevivientes){const d=graphDistances(w,s.nodo);s.baselineHops=Math.min(...w.refugios.map(r=>d.get(r.nodo)??Infinity));}
  return w;
}
export function within(w,start,depth){return new Set(graphDistances(w,start,depth).keys());}
export const visibleZombies=w=>w.zombies.filter(z=>z.tipo!=='dormido');
export const route=(w,start)=>planRoute(w,start);
export function decide(w,input){
  if(!Number.isInteger(input.turno)||input.turno!==w.turno)throw new Error('Turno desactualizado');
  if(!w.adjacency[input.nodoActual])throw new Error('Nodo desconocido');
  const s=w.sobrevivientes.find(s=>s.id===input.sobrevivienteId);
  if(!s||s.nodo!==input.nodoActual||s.estado!=='activo')throw new Error('Sobreviviente o posición inválida');
  const path=route(w,s.nodo);return {siguienteNodo:path[1]??path[0]};
}
export function prepareTurn(w){
  if(w.phase!=='idle')throw new Error('Ya hay un turno pendiente');if(w.turno>=150)throw new Error('Ronda terminada');
  w.turno++;w.phase='deciding';w.traces=[];
  const blocked=new Set(w.aristasBloqueadas),canMove=n=>w.adjacency[n].filter(b=>!blocked.has(edgeKey(n,b)));
  for(const z of w.zombies){const trace=[z.nodo];
    if(z.tipo==='dormido'){if(w.sobrevivientes.some(s=>s.estado==='activo'&&within(w,z.nodo,2).has(s.nodo)))z.tipo='caminante';else continue;}
    const steps=z.tipo==='horda'?0:z.tipo==='corredor'?2:w.turno%2===0?1:0;
    for(let i=0;i<steps;i++){const options=canMove(z.nodo);if(!options.length)break;
      const targets=w.sobrevivientes.filter(s=>s.estado==='activo'&&within(w,z.nodo,3).has(s.nodo));
      if(z.tipo==='corredor'&&targets.length){const distances=targets.map(s=>graphDistances(w,s.nodo)),d=n=>Math.min(...distances.map(m=>m.get(n)??Infinity));options.sort((a,b)=>d(a)-d(b)||a.localeCompare(b));z.nodo=options[0];}else z.nodo=options[Math.floor(random(w)*options.length)];trace.push(z.nodo);}
    w.traces.push({id:z.id,path:trace});
  }
  if(w.round>1&&w.turno===30){for(let i=0;i<(w.round===3?2:1);i++){const candidates=w.edges.filter(e=>!w.aristasBloqueadas.includes(edgeKey(e.a,e.b))),bridges=candidates.filter(e=>e.tipo==='puente'),pool=bridges.length?bridges:candidates;if(!pool.length)break;const e=pool[Math.floor(random(w)*pool.length)],key=edgeKey(e.a,e.b);w.aristasBloqueadas.push(key);w.eventos.push(`Turno ${w.turno}: bloqueo ${e.nombre??key}`);}}
}
export function resolveTurn(w,answers){
  if(w.phase!=='deciding')throw new Error('No hay un turno preparado');const blocked=new Set(w.aristasBloqueadas);
  for(const s of w.sobrevivientes.filter(s=>s.estado==='activo')){const from=s.nodo,answer=answers[s.id];let to=answer?.siguienteNodo;
    const valid=typeof to==='string'&&(to===from||w.adjacency[from].includes(to)&&!blocked.has(edgeKey(from,to)));if(!valid)to=from;
    s.nodo=to;s.pasos+=to===from?0:1;s.turnos++;s.ruta=answer?.ruta??[from,to];
    const bitten=w.zombies.some(z=>z.nodo===to)||w.traces.some(t=>t.path.some((n,i)=>i>0&&t.path[i-1]===to&&n===from));
    if(bitten)s.estado='mordido';else if(w.refugios.some(r=>r.nodo===to))s.estado='a salvo';
  }w.phase='idle';return snapshot(w);
}
export function tick(w){prepareTurn(w);const answers={};for(const s of w.sobrevivientes.filter(s=>s.estado==='activo')){const path=route(w,s.nodo);answers[s.id]={siguienteNodo:path[1]??path[0],ruta:path};}return resolveTurn(w,answers);}
export function snapshot(w){return {turno:w.turno,ronda:w.round,seed:w.seed,phase:w.phase,mapaSintetico:w.mapMetadata.source==='Synthetic',mapMetadata:w.mapMetadata,nodes:w.nodes,edges:w.edges,refugios:w.refugios,zombies:visibleZombies(w),trazasZombies:w.traces,sobrevivientes:w.sobrevivientes,aristasBloqueadas:w.aristasBloqueadas,eventos:w.eventos,metricas:{total:w.sobrevivientes.length,salvados:w.sobrevivientes.filter(s=>s.estado==='a salvo').length,mordidos:w.sobrevivientes.filter(s=>s.estado==='mordido').length,activos:w.sobrevivientes.filter(s=>s.estado==='activo').length}};}
