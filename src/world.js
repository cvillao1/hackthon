export const edgeKey=(a,b)=>[a,b].sort().join('|');
export function createWorld(round=1,seed=42){
  let value=seed>>>0;
  const random=()=>{value=(1664525*value+1013904223)>>>0;return value/4294967296;};
  const nodes=Array.from({length:300},(_,i)=>({id:`N-${String(i).padStart(4,'0')}`,x:i%20,y:Math.floor(i/20)}));
  const adjacency=Object.fromEntries(nodes.map(n=>[n.id,[]]));const edges=[];
  for(const n of nodes)for(const offset of [1,20]){const b=nodes[Number(n.id.slice(2))+offset];if(!b||(offset===1&&b.y!==n.y))continue;const edge={a:n.id,b:b.id,distancia_m:100,tipo:n.y%5===0?'avenida':'calle'};edges.push(edge);adjacency[n.id].push(b.id);adjacency[b.id].push(n.id);}
  const refugios=[0,19,280,299].map((i,j)=>({id:`R-${j+1}`,nodo:nodes[i].id}));
  const count=[20,80,200][round-1];
  const sobrevivientes=Array.from({length:count},(_,i)=>({id:`S-${String(i).padStart(4,'0')}`,nodo:nodes[21+Math.floor(random()*258)].id,estado:'activo',ruta:[],pasos:0}));
  const types=round===1?['caminante']:round===2?['caminante','corredor','horda']:['caminante','corredor','horda','dormido'];
  const zombies=Array.from({length:[8,16,24][round-1]},(_,i)=>({id:`Z-${i}`,tipo:types[i%types.length],nodo:nodes[40+Math.floor(random()*220)].id}));
  const costs=Object.fromEntries(edges.map(e=>[edgeKey(e.a,e.b),e.distancia_m*(e.tipo==='avenida'?.9:1)]));
  return {round,seed,turno:0,nodes,edges,adjacency,costs,refugios,sobrevivientes,zombies,aristasBloqueadas:[],eventos:[],random};
}
export function within(w,start,depth){const seen=new Set([start]);let layer=[start];for(let i=0;i<depth;i++){const next=[];for(const n of layer)for(const b of w.adjacency[n])if(!seen.has(b)){seen.add(b);next.push(b);}layer=next;}return seen;}
export function visibleZombies(w){return w.zombies.filter(z=>z.tipo!=='dormido');}
export function route(w,start){
  const blocked=new Set(w.aristasBloqueadas);const forbidden=new Set();const danger=new Set();
  for(const z of visibleZombies(w)){forbidden.add(z.nodo);if(z.tipo==='horda')for(const b of w.adjacency[z.nodo])forbidden.add(b);if(z.tipo==='corredor')for(const b of within(w,z.nodo,2))danger.add(b);}
  const goals=new Set(w.refugios.map(r=>r.nodo));const distance=new Map([[start,0]]);const previous=new Map();const queue=[start];
  while(queue.length){queue.sort((a,b)=>distance.get(a)-distance.get(b));const a=queue.shift();if(goals.has(a)){const path=[a];while(previous.has(path[0]))path.unshift(previous.get(path[0]));return path;}
    for(const b of w.adjacency[a]){if(blocked.has(edgeKey(a,b))||forbidden.has(b))continue;const cost=distance.get(a)+w.costs[edgeKey(a,b)]+(danger.has(b)?1500:0);if(cost<(distance.get(b)??Infinity)){distance.set(b,cost);previous.set(b,a);if(!queue.includes(b))queue.push(b);}}
  }return [start];
}
export function decide(w,input){if(!Number.isInteger(input.turno)||input.turno!==w.turno)throw new Error('Turno desactualizado');if(!w.adjacency[input.nodoActual])throw new Error('Nodo desconocido');const s=w.sobrevivientes.find(s=>s.id===input.sobrevivienteId);if(!s||s.nodo!==input.nodoActual||s.estado!=='activo')throw new Error('Sobreviviente o posición inválida');const path=route(w,input.nodoActual);return {siguienteNodo:path[1]??path[0]};}
export function tick(w){
  w.turno++;const blocked=new Set(w.aristasBloqueadas);const traces=[];
  const canMove=n=>w.adjacency[n].filter(b=>!blocked.has(edgeKey(n,b)));
  for(const z of w.zombies){const trace=[z.nodo];if(z.tipo==='dormido'){if(w.sobrevivientes.some(s=>s.estado==='activo'&&within(w,z.nodo,2).has(s.nodo)))z.tipo='caminante';else{traces.push(trace);continue;}}
    const steps=z.tipo==='horda'?0:z.tipo==='corredor'?2:w.turno%2===0?1:0;
    for(let i=0;i<steps;i++){const options=canMove(z.nodo);if(!options.length)break;const targets=w.sobrevivientes.filter(s=>s.estado==='activo'&&within(w,z.nodo,3).has(s.nodo));if(z.tipo==='corredor'&&targets.length){const d=n=>Math.min(...targets.map(s=>{const a=w.nodes.find(x=>x.id===n),b=w.nodes.find(x=>x.id===s.nodo);return Math.abs(a.x-b.x)+Math.abs(a.y-b.y);}));options.sort((a,b)=>d(a)-d(b));z.nodo=options[0];}else z.nodo=options[Math.floor(w.random()*options.length)];trace.push(z.nodo);}traces.push(trace);
  }
  if(w.round>1&&w.turno===30){const n=w.round===3?2:1;for(let i=0;i<n;i++){const e=w.edges[Math.floor(w.random()*w.edges.length)];const key=edgeKey(e.a,e.b);w.aristasBloqueadas.push(key);w.eventos.push(`Turno ${w.turno}: bloqueo ${key}`);}}
  // All decisions use the same post-zombie world snapshot.
  const plans=w.sobrevivientes.filter(s=>s.estado==='activo').map(s=>({s,path:route(w,s.nodo)}));
  for(const {s,path} of plans){const from=s.nodo,to=path[1]??from;s.ruta=path;s.nodo=to;s.pasos+=to!==from?1:0;const bitten=w.zombies.some(z=>z.nodo===to)||traces.some(trace=>trace.some((n,i)=>i>0&&trace[i-1]===to&&n===from));if(bitten)s.estado='mordido';else if(w.refugios.some(r=>r.nodo===to))s.estado='a salvo';}
  return snapshot(w);
}
export function snapshot(w){return {turno:w.turno,ronda:w.round,seed:w.seed,mapaSintetico:true,nodes:w.nodes,edges:w.edges,refugios:w.refugios,zombies:visibleZombies(w),sobrevivientes:w.sobrevivientes,aristasBloqueadas:w.aristasBloqueadas,eventos:w.eventos,metricas:{total:w.sobrevivientes.length,salvados:w.sobrevivientes.filter(s=>s.estado==='a salvo').length,mordidos:w.sobrevivientes.filter(s=>s.estado==='mordido').length,activos:w.sobrevivientes.filter(s=>s.estado==='activo').length}};}
