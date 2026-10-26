import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {timingSafeEqual} from 'node:crypto';
import {createWorld,snapshot,tick,decide,edgeKey} from './world.js';
const key=process.env.API_KEY;
if(!key){console.error('Configura API_KEY antes de iniciar. Consulta README.md.');process.exit(1);}
let world=createWorld();let timer;const timings=[];
const send=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
const authorized=req=>{const supplied=Buffer.from(String(req.headers['x-api-key']??'')),expected=Buffer.from(key);return supplied.length===expected.length&&timingSafeEqual(supplied,expected);};
async function body(req){let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>16384)throw new Error('Solicitud demasiado grande');}return JSON.parse(raw||'{}');}
http.createServer(async(req,res)=>{
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
  const path=new URL(req.url,'http://localhost').pathname;
  try{
    if(req.method==='GET'&&path==='/health')return send(res,200,{ok:true});
    if(req.method==='GET'&&['/','/app.js','/style.css'].includes(path)){const file=path==='/'?'index.html':path.slice(1);res.writeHead(200,{'Content-Type':file.endsWith('.html')?'text/html; charset=utf-8':file.endsWith('.js')?'text/javascript':'text/css'});return res.end(await readFile(new URL(`../public/${file}`,import.meta.url)));}
    if(!authorized(req))return send(res,401,{error:'API key requerida'});
    if(req.method==='GET'&&path==='/estado')return send(res,200,{...snapshot(world),running:!!timer});
    if(req.method==='GET'&&path==='/metricas'){const sorted=[...timings].sort((a,b)=>a-b);return send(res,200,{muestras:sorted.length,p95Ms:sorted[Math.max(0,Math.ceil(sorted.length*.95)-1)]??null});}
    if(req.method==='POST'&&path==='/paso'){const input=await body(req);const start=performance.now();const answer=decide(world,input);timings.push(performance.now()-start);if(timings.length>10000)timings.shift();return send(res,200,answer);}
    if(req.method==='POST'&&path==='/control'){const input=await body(req);if(input.action==='reset'){if(![1,2,3].includes(input.round)||!Number.isInteger(input.seed))throw new Error('Ronda o semilla inválida');clearInterval(timer);timer=null;world=createWorld(input.round,input.seed);}else if(input.action==='start'){timer??=setInterval(()=>{if(world.turno>=150||!snapshot(world).metricas.activos){clearInterval(timer);timer=null;return;}tick(world);},2000);}else if(input.action==='pause'){clearInterval(timer);timer=null;}else if(input.action==='step'){if(timer)throw new Error('Pausa primero');tick(world);}else if(input.action==='block'){if(!world.adjacency[input.a]?.includes(input.b))throw new Error('Arista inválida');world.aristasBloqueadas.push(edgeKey(input.a,input.b));}else throw new Error('Acción inválida');return send(res,200,{ok:true});}
    send(res,404,{error:'Ruta desconocida'});
  }catch(error){send(res,400,{error:error.message});}
}).listen(Number(process.env.PORT??8080),process.env.HOST??'127.0.0.1',()=>console.log(`Manta Rescue: http://${process.env.HOST??'127.0.0.1'}:${process.env.PORT??8080}`));
