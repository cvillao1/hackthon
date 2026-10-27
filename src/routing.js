import {edgeKey,graphDistances} from './graph.js';

const cache=new WeakMap();
function context(w){
  const signature=JSON.stringify([w.turno,w.phase,w.strategy,w.aristasBloqueadas,w.refugios,w.zombies.filter(z=>z.tipo!=='dormido'),w.traces,w.sobrevivientes.filter(s=>s.estado==='activo').map(s=>s.nodo)]);
  const previous=cache.get(w);if(previous?.signature===signature)return previous;
  const blocked=new Set(w.aristasBloqueadas),hard=new Set(),occupied=new Set(),runners=[];
  for(const z of w.zombies.filter(z=>z.tipo!=='dormido')){occupied.add(z.nodo);if(z.tipo==='horda'){hard.add(z.nodo);for(const b of w.adjacency[z.nodo])hard.add(b);}if(z.tipo==='corredor')runners.push(z);}
  const distance=new Map(w.refugios.filter(r=>!hard.has(r.nodo)).map(r=>[r.nodo,0])),queue=[...distance.keys()],next=new Map();
  while(queue.length){queue.sort((a,b)=>distance.get(a)-distance.get(b));const a=queue.shift();for(const b of w.adjacency[a]){if(hard.has(b)||blocked.has(edgeKey(a,b)))continue;const cost=distance.get(a)+w.costs[edgeKey(a,b)];if(cost<(distance.get(b)??Infinity)){distance.set(b,cost);next.set(b,a);if(!queue.includes(b))queue.push(b);}}}
  const reach=runners.map(z=>graphDistances(w,z.nodo,8));
  const targetDistances=w.sobrevivientes.filter(s=>s.estado==='activo').map(s=>graphDistances(w,s.nodo,8));
  const predicted=Array.from({length:5},()=>new Set());
  for(const z of runners){let n=z.nodo;predicted[0].add(n);for(let t=1;t<=4;t++){for(let step=0;step<2;step++){const options=w.adjacency[n].filter(b=>!blocked.has(edgeKey(n,b))),near=targetDistances.filter(m=>(m.get(n)??Infinity)<=3);if(!options.length||!near.length)break;const d=a=>Math.min(...near.map(m=>m.get(a)??Infinity));options.sort((a,b)=>d(a)-d(b)||a.localeCompare(b));n=options[0];}predicted[t].add(n);}}
  const risk=Array.from({length:5},()=>new Map());
  for(let t=1;t<=4;t++)for(const node of w.nodes){let penalty=0;
    // Discount uncertainty instead of declaring the entire expanding reachable area unsafe.
    for(const m of reach)if((m.get(node.id)??Infinity)<=2)penalty+=160/t;
    if(predicted[t].has(node.id))penalty+=600/t;
    for(const z of w.zombies){if(z.tipo!=='caminante')continue;if(node.id===z.nodo)penalty+=250/t;else if((w.turno+t)%2===0&&w.adjacency[z.nodo].includes(node.id))penalty+=60/t;}
    risk[t].set(node.id,penalty);
  }
  const crossed=new Set();for(const trace of w.traces)for(let i=1;i<trace.path.length;i++)crossed.add(`${trace.path[i]}>${trace.path[i-1]}`);
  const result={signature,blocked,hard,occupied,distance,next,reach,risk,crossed,routes:new Map()};cache.set(w,result);return result;
}
export function planRoute(w,start){
  const c=context(w);if(c.routes.has(start))return c.routes.get(start);
  if(w.strategy==='baseline'){
    const d=new Map([[start,0]]),prev=new Map(),queue=[start],goals=new Set(w.refugios.map(r=>r.nodo));let result=[start];
    while(queue.length){queue.sort((a,b)=>d.get(a)-d.get(b));const a=queue.shift();if(goals.has(a)){result=[a];while(prev.has(result[0]))result.unshift(prev.get(result[0]));break;}for(const b of w.adjacency[a]){if(c.hard.has(b)||c.occupied.has(b)||c.blocked.has(edgeKey(a,b)))continue;const score=d.get(a)+w.costs[edgeKey(a,b)]+(c.reach.some(m=>(m.get(b)??Infinity)<=2)?1500:0);if(score<(d.get(b)??Infinity)){d.set(b,score);prev.set(b,a);if(!queue.includes(b))queue.push(b);}}}
    c.routes.set(start,result);return result;
  }
  // Receding horizon over (node,turn). Execute only first step, then replan.
  const goals=new Set(w.refugios.map(r=>r.nodo));let layer=new Map([[start,{cost:0,path:[start]}]]),best;
  for(let t=1;t<=4;t++){const nextLayer=new Map();for(const [from,item]of layer)for(const to of [from,...w.adjacency[from]]){
    if(c.hard.has(to)||(from!==to&&c.blocked.has(edgeKey(from,to))))continue;
    if(t===1&&(c.occupied.has(to)||c.crossed.has(`${from}>${to}`)))continue;
    const cost=item.cost+(from===to?65:w.costs[edgeKey(from,to)])+c.risk[t].get(to);
    if((nextLayer.get(to)?.cost??Infinity)<=cost)continue;
    const candidate={cost,path:[...item.path,to]};nextLayer.set(to,candidate);
    const score=cost+(c.distance.get(to)??1e8);
    if((t===4||goals.has(to))&&(!best||score<best.score))best={...candidate,score};
  }layer=nextLayer;}
  if(!best){const wait=[start];c.routes.set(start,wait);return wait;}
  const path=best.path;
  // Static tail is guidance for the map, not a commitment to future moves.
  const seen=new Set(path);let last=path.at(-1);while(c.next.has(last)&&!goals.has(last)){last=c.next.get(last);if(seen.has(last))break;seen.add(last);path.push(last);}
  c.routes.set(start,path);return path;
}
