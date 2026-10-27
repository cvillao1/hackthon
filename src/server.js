import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {timingSafeEqual} from 'node:crypto';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createWorld,snapshot,decide,edgeKey} from './world.js';
import {FileStore} from './persistence.js';
import {runHttpTurn} from './http-simulator.js';

const percentile=(values,p)=>{if(!values.length)return null;const sorted=[...values].sort((a,b)=>a-b);return sorted[Math.ceil(sorted.length*p)-1];};
export async function createApplication({key,adminKey=key,storePath=null,round=1,seed=42,strategy='predictive'}={}){
  if(!key)throw new Error('Configura API_KEY antes de iniciar. Consulta README.md.');
  if(process.env.NODE_ENV==='production'&&key===adminKey)throw new Error('En producción ADMIN_KEY debe ser distinta de API_KEY');
  const store=storePath?new FileStore(storePath):null;
  if(store)await store.lock();
  let world;
  try{world=await store?.load()??createWorld(round,seed,{strategy});}catch(error){await store?.close();throw error;}
  let timer=null,busy=false,simulationSamples=[],computeSamples=[],fatalError=null;
  const save=async w=>{try{await store?.save(w);}catch(error){fatalError='No se pudo persistir el mundo';if(timer)clearTimeout(timer);timer=null;throw error;}};
  const send=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
  const matches=(req,expected)=>{const supplied=Buffer.from(String(req.headers['x-api-key']??'')),wanted=Buffer.from(expected);return supplied.length===wanted.length&&timingSafeEqual(supplied,wanted);};
  async function body(req){let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>16384){const e=new Error('Solicitud demasiado grande');e.status=413;throw e;}}return JSON.parse(raw||'{}');}
  async function advance(){if(busy)throw new Error('Hay una operación en curso');busy=true;try{const address=server.address();const samples=await runHttpTurn(world,{url:`http://127.0.0.1:${address.port}`,key,save});simulationSamples.push(...samples);simulationSamples=simulationSamples.slice(-20000);}finally{busy=false;}}
  function schedule(){timer=setTimeout(async()=>{if(world.turno>=150||!snapshot(world).metricas.activos){timer=null;return;}const start=performance.now();try{await advance();if(timer)timer=setTimeout(()=>scheduleImmediately(),Math.max(0,2000-(performance.now()-start)));}catch(error){timer=null;console.error('Simulador pausado:',error.message);}},2000);}
  async function scheduleImmediately(){timer=null;if(world.turno>=150||!snapshot(world).metricas.activos)return;const start=performance.now();timer=true;try{await advance();if(timer)timer=setTimeout(scheduleImmediately,Math.max(0,2000-(performance.now()-start)));}catch(error){timer=null;console.error('Simulador pausado:',error.message);}}
  const server=http.createServer(async(req,res)=>{
    res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
    const path=new URL(req.url,'http://localhost').pathname;
    try{
      if(req.method==='GET'&&path==='/health')return send(res,fatalError?503:200,{ok:!fatalError});
      if(req.method==='GET'&&['/','/app.js','/style.css'].includes(path)){const file=path==='/'?'index.html':path.slice(1);const content=await readFile(new URL(`../public/${file}`,import.meta.url));res.writeHead(200,{'Content-Type':file.endsWith('.html')?'text/html; charset=utf-8':file.endsWith('.js')?'text/javascript':'text/css'});return res.end(content);}
      if(!matches(req,key)&&!matches(req,adminKey))return send(res,401,{error:'API key requerida'});
      if(fatalError)return send(res,503,{error:fatalError});
      if(req.method==='GET'&&path==='/estado')return send(res,200,{...snapshot(world),running:!!timer,persistencia:!!store});
      if(req.method==='GET'&&path==='/metricas')return send(res,200,{calculo:{muestras:computeSamples.length,p95Ms:percentile(computeSamples,.95)},httpSimulador:{muestras:simulationSamples.length,p95Ms:percentile(simulationSamples.map(s=>s.ms),.95),maxMs:simulationSamples.length?Math.max(...simulationSamples.map(s=>s.ms)):null,errores:simulationSamples.filter(s=>s.error).length,timeouts:simulationSamples.filter(s=>s.timeout).length},nota:'HTTP desde el mismo host; no mide red externa ni AWS'});
      if(req.method==='POST'&&path==='/paso'){const input=await body(req);const start=performance.now();const answer=decide(world,input);computeSamples.push(performance.now()-start);computeSamples=computeSamples.slice(-10000);return send(res,200,answer);}
      if(req.method==='POST'&&path==='/control'){
        if(!matches(req,adminKey))return send(res,403,{error:'Clave de operador requerida'});
        const input=await body(req);if(busy)return send(res,409,{error:'Turno en curso; reintenta al terminar'});
        if(input.action==='step'){if(timer)throw new Error('Pausa primero');await advance();return send(res,200,{ok:true});}
        busy=true;try{
          if(input.action==='reset'){if(![1,2,3].includes(input.round)||!Number.isInteger(input.seed))throw new Error('Ronda o semilla inválida');if(timer)clearTimeout(timer);timer=null;world=createWorld(input.round,input.seed,{strategy});computeSamples=[];simulationSamples=[];await save(world);}
          else if(input.action==='start'){if(!timer){if(world.turno>=150)throw new Error('Ronda terminada');schedule();}}
          else if(input.action==='pause'){if(timer)clearTimeout(timer);timer=null;await save(world);}
          else if(input.action==='block'){if(world.phase!=='idle')throw new Error('Finaliza el turno pendiente');if(!world.adjacency[input.a]?.includes(input.b))throw new Error('Arista inválida');const edge=edgeKey(input.a,input.b);if(!world.aristasBloqueadas.includes(edge))world.aristasBloqueadas.push(edge);await save(world);}
          else throw new Error('Acción inválida');
        }finally{busy=false;}return send(res,200,{ok:true});
      }
      send(res,404,{error:'Ruta desconocida'});
    }catch(error){send(res,error.status??400,{error:error.message});}
  });
  server.requestTimeout=5000;server.headersTimeout=5000;
  return {server,get world(){return world;},async close(){if(timer)clearTimeout(timer);timer=null;while(busy)await new Promise(r=>setTimeout(r,10));try{await save(world);}finally{await new Promise(r=>{server.close(r);server.closeIdleConnections();});await store?.close();}}};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const app=await createApplication({key:process.env.API_KEY,adminKey:process.env.ADMIN_KEY??process.env.API_KEY,storePath:process.env.STATE_FILE??'runtime/world.json'});
  app.server.listen(Number(process.env.PORT??8080),process.env.HOST??'127.0.0.1',()=>console.log(`Manta Rescue: http://${process.env.HOST??'127.0.0.1'}:${app.server.address().port}`));
  for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>{app.close().then(()=>process.exit(0)).catch(error=>{console.error(error.message);process.exit(1);});});
}
