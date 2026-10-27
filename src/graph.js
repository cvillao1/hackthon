import {readFileSync} from 'node:fs';
export const edgeKey=(a,b)=>[a,b].sort().join('|');
export function loadMantaGraph(){return JSON.parse(readFileSync(new URL('../data/manta-graph.json',import.meta.url),'utf8'));}
export function syntheticGraph(){
  const nodes=Array.from({length:300},(_,i)=>({id:`N-${String(i).padStart(4,'0')}`,x:i%20,y:Math.floor(i/20)}));
  const edges=[];for(let i=0;i<nodes.length;i++)for(const offset of [1,20]){const b=nodes[i+offset];if(!b||(offset===1&&b.y!==nodes[i].y))continue;edges.push({a:nodes[i].id,b:b.id,distancia_m:100,tipo:nodes[i].y%5===0?'avenida':'calle'});}
  return {metadata:{source:'Synthetic',name:'Cuadrícula de pruebas'},nodes,edges};
}
export function indexGraph(graph){
  const adjacency=Object.fromEntries(graph.nodes.map(n=>[n.id,[]])),costs={},edgeIndex={};
  for(const e of graph.edges){if(!adjacency[e.a]||!adjacency[e.b]||e.distancia_m<=0)throw new Error('Grafo inválido');
    const key=edgeKey(e.a,e.b),cost=e.distancia_m/({avenida:1.5,calle:1.2,puente:1}[e.tipo]??1.2);
    if(cost<(costs[key]??Infinity)){costs[key]=cost;edgeIndex[key]=e;}
    if(!adjacency[e.a].includes(e.b)){adjacency[e.a].push(e.b);adjacency[e.b].push(e.a);}}
  return {adjacency,costs,edgeIndex};
}
export function graphDistances(w,start,max=Infinity){const distances=new Map([[start,0]]),queue=[start],blocked=new Set(w.aristasBloqueadas);for(let i=0;i<queue.length;i++){const a=queue[i];if(distances.get(a)>=max)continue;for(const b of w.adjacency[a])if(!blocked.has(edgeKey(a,b))&&!distances.has(b)){distances.set(b,distances.get(a)+1);queue.push(b);}}return distances;}
