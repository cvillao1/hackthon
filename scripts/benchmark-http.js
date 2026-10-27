import {mkdir,writeFile} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import {createApplication} from '../src/server.js';
import {requestStep} from '../src/http-simulator.js';
import {edgeKey} from '../src/graph.js';
const key=randomBytes(32).toString('hex'),runs=Number(process.env.BENCH_RUNS??5);
const app=await createApplication({key,round:3});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${app.server.address().port}`;
const values=[],errors=[],invalid=[];
try{
  for(let run=0;run<runs;run++){
    const reset=await fetch(`${url}/control`,{method:'POST',headers:{'x-api-key':key,'Content-Type':'application/json'},body:JSON.stringify({action:'reset',round:3,seed:42+run})});if(!reset.ok)throw new Error('Reset falló');
    const s=await (await fetch(`${url}/estado`,{headers:{'x-api-key':key}})).json();const batch=await Promise.all(s.sobrevivientes.map(async person=>({person,...await requestStep(url,key,{sobrevivienteId:person.id,nodoActual:person.nodo,turno:s.turno})})));
    for(const result of batch){values.push(result.ms);if(result.error)errors.push({error:result.error,timeout:result.timeout});else if(result.answer.siguienteNodo!==result.person.nodo&&!s.edges.some(e=>edgeKey(e.a,e.b)===edgeKey(result.person.nodo,result.answer.siguienteNodo)))invalid.push(result.answer);}
  }
  const rounds=[];
  for(const round of [1,2,3]){
    await fetch(`${url}/control`,{method:'POST',headers:{'x-api-key':key,'Content-Type':'application/json'},body:JSON.stringify({action:'reset',round,seed:42})});
    for(let turn=0;turn<150;turn++){if(!app.world.sobrevivientes.some(s=>s.estado==='activo'))break;const response=await fetch(`${url}/control`,{method:'POST',headers:{'x-api-key':key,'Content-Type':'application/json'},body:'{"action":"step"}'});if(!response.ok)throw new Error(`Step HTTP ${response.status}`);}
    const metrics=await(await fetch(`${url}/metricas`,{headers:{'x-api-key':key}})).json();rounds.push({round,seed:42,turns:app.world.turno,saved:app.world.sobrevivientes.filter(s=>s.estado==='a salvo').length,total:app.world.sobrevivientes.length,...metrics.httpSimulador});
  }
  values.sort((a,b)=>a-b);const report={timestamp:new Date().toISOString(),environment:'Localhost HTTP, cliente y servidor en el mismo proceso; sin AWS ni red externa. Rondas aceleradas, sin pausas de 2 segundos.',node:process.version,concurrency:200,batches:runs,samples:values.length,p50Ms:values[Math.ceil(values.length*.5)-1],p95Ms:values[Math.ceil(values.length*.95)-1],maxMs:values.at(-1),over500ms:values.filter(ms=>ms>=500).length,errors:errors.length,timeouts:errors.filter(e=>e.timeout).length,invalidMoves:invalid.length,rounds,pass:errors.length===0&&invalid.length===0&&values.every(ms=>ms<500)&&rounds.every(r=>r.errores===0&&r.timeouts===0&&r.maxMs<500)};
  await mkdir('results',{recursive:true});await writeFile('results/http-latest.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));if(!report.pass)process.exitCode=1;
}finally{await app.close();}
