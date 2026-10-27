import {mkdir,writeFile} from 'node:fs/promises';
import {createWorld,prepareTurn,resolveTurn,route} from '../src/world.js';
const seeds=(process.env.BENCH_SEEDS??'7,42,123').split(',').map(Number),results=[];
for(const round of [1,2,3])for(const seed of seeds)for(const strategy of ['baseline','predictive']){
  const w=createWorld(round,seed,{strategy}),latencies=[];const start=performance.now();
  for(let t=0;t<150;t++){if(!w.sobrevivientes.some(s=>s.estado==='activo'))break;prepareTurn(w);const answers={};for(const s of w.sobrevivientes.filter(s=>s.estado==='activo')){const before=performance.now(),path=route(w,s.nodo);latencies.push(performance.now()-before);answers[s.id]={siguienteNodo:path[1]??path[0]};}resolveTurn(w,answers);}
  latencies.sort((a,b)=>a-b);const saved=w.sobrevivientes.filter(s=>s.estado==='a salvo');
  const result={round,seed,strategy,saved:saved.length,total:w.sobrevivientes.length,bitten:w.sobrevivientes.filter(s=>s.estado==='mordido').length,active:w.sobrevivientes.filter(s=>s.estado==='activo').length,efficiencyAmongSaved:saved.length?saved.reduce((sum,s)=>sum+s.baselineHops/Math.max(1,s.turnos),0)/saved.length:0,routingP95Ms:latencies[Math.ceil(latencies.length*.95)-1],elapsedMs:performance.now()-start};results.push(result);console.log(JSON.stringify(result));
}
const report={timestamp:new Date().toISOString(),environment:'Local in-process. Paired OSM scenarios; not HTTP or AWS. Baseline is current-node Dijkstra, not the original synthetic simulation.',seeds,results,summary:['baseline','predictive'].map(strategy=>({strategy,saved:results.filter(r=>r.strategy===strategy).reduce((s,r)=>s+r.saved,0),total:results.filter(r=>r.strategy===strategy).reduce((s,r)=>s+r.total,0)}))};
await mkdir('results',{recursive:true});await writeFile('results/simulation-latest.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report.summary));
