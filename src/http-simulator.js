import {prepareTurn,resolveTurn,route} from './world.js';
import {edgeKey} from './graph.js';
export async function requestStep(url,key,input,{timeoutMs=500}={}){
  const start=performance.now();
  try{const response=await fetch(`${url}/paso`,{method:'POST',headers:{'Content-Type':'application/json','x-api-key':key},body:JSON.stringify(input),signal:AbortSignal.timeout(timeoutMs)});const answer=await response.json();const ms=performance.now()-start;
    if(!response.ok)throw new Error(`HTTP ${response.status}`);
    if(ms>=timeoutMs)return {ms,timeout:true,error:'Deadline excedido'};
    return {ms,answer};
  }catch(error){return {ms:performance.now()-start,timeout:error.name==='TimeoutError'||error.name==='AbortError',error:error.message};}
}
export async function runHttpTurn(w,{url,key,save=async()=>{},request=requestStep,timeoutMs=500}){
  // Resume a committed pending turn after restart, without moving zombies twice.
  if(w.phase==='idle')prepareTurn(w);await save(w);
  const active=w.sobrevivientes.filter(s=>s.estado==='activo');
  const results=await Promise.all(active.map(async s=>({id:s.id,...await request(url,key,{sobrevivienteId:s.id,nodoActual:s.nodo,turno:w.turno},{timeoutMs})})));
  const answers={};for(const r of results)if(r.answer){const s=active.find(s=>s.id===r.id),to=r.answer.siguienteNodo;
    if(to!==s.nodo&&(!w.adjacency[s.nodo].includes(to)||w.aristasBloqueadas.includes(edgeKey(s.nodo,to)))){r.error='Movimiento inválido';r.invalid=true;delete r.answer;continue;}
    answers[r.id]={...r.answer,ruta:route(w,s.nodo)};
  }
  resolveTurn(w,answers);await save(w);return results;
}
