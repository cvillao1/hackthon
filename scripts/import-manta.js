import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const bbox=[-0.99,-80.77,-0.925,-80.665];
const query=`[out:json][timeout:60];way["highway"~"^(primary|secondary|tertiary|residential|unclassified|living_street|service|primary_link|secondary_link|tertiary_link)$"]["access"!~"^(private|no)$"](${bbox.join(',')});(._;>;);out body;`;
await mkdir('data',{recursive:true});
let raw;
try{raw=await readFile('data/manta-osm.raw.json','utf8');}catch{const response=await fetch('https://overpass-api.de/api/interpreter',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded','User-Agent':'MantaRescueHackathon/0.2 (educational map extraction)'},body:new URLSearchParams({data:query}),signal:AbortSignal.timeout(90000)});if(!response.ok)throw new Error(`Overpass HTTP ${response.status}`);raw=await response.text();await writeFile('data/manta-osm.raw.json',raw);}
const source=JSON.parse(raw);if(source.remark)throw new Error(`Overpass: ${source.remark}`);
const coords=new Map(source.elements.filter(e=>e.type==='node').map(n=>[n.id,n]));
const adj=new Map();const metadata=new Map();const key=(a,b)=>[a,b].sort((a,b)=>a-b).join('|');
for(const way of source.elements.filter(e=>e.type==='way'))for(let i=1;i<way.nodes.length;i++){const a=way.nodes[i-1],b=way.nodes[i];if(!coords.has(a)||!coords.has(b)||a===b)continue;for(const [u,v]of [[a,b],[b,a]]){if(!adj.has(u))adj.set(u,new Set());adj.get(u).add(v);}metadata.set(key(a,b),{osmWay:way.id,...way.tags});}
const seen=new Set();let largest=[];
for(const start of adj.keys()){if(seen.has(start))continue;const component=[start];seen.add(start);for(let i=0;i<component.length;i++)for(const b of adj.get(component[i]))if(!seen.has(b)){seen.add(b);component.push(b);}if(component.length>largest.length)largest=component;}
const allowed=new Set(largest);const junctions=new Set(largest.filter(id=>adj.get(id).size!==2));
const rad=n=>n*Math.PI/180;
const meters=(a,b)=>{const p=coords.get(a),q=coords.get(b);const x=rad(q.lon-p.lon)*Math.cos(rad((p.lat+q.lat)/2)),y=rad(q.lat-p.lat);return Math.hypot(x,y)*6371000;};
const paths=[];const visited=new Set();
for(const a of junctions)for(const first of adj.get(a)){if(visited.has(key(a,first)))continue;let prev=a,b=first;const path=[a,b];visited.add(key(a,b));while(!junctions.has(b)){const next=[...adj.get(b)].find(n=>n!==prev);if(next===undefined)break;visited.add(key(b,next));prev=b;b=next;path.push(b);}if(a!==b&&junctions.has(b)){const tags=metadata.get(key(a,first));paths.push({a,b,path,tags});}}
const simplified=new Map([...junctions].map(n=>[n,[]]));for(const p of paths){simplified.get(p.a).push(p.b);simplified.get(p.b).push(p.a);}
// A connected local extract, never synthetic shortcuts between distant OSM junctions.
const center=[...junctions].sort((a,b)=>{const d=id=>{const n=coords.get(id);return (n.lat+.953)**2+(n.lon+80.72)**2;};return d(a)-d(b);})[0];
const selected=[center],selection=new Set(selected);for(let i=0;i<selected.length&&selected.length<300;i++)for(const b of simplified.get(selected[i]))if(!selection.has(b)&&selected.length<300){selection.add(b);selected.push(b);}
if(selected.length<250)throw new Error(`Extract too small: ${selected.length} junctions`);
const lats=selected.map(id=>coords.get(id).lat),lons=selected.map(id=>coords.get(id).lon);const west=Math.min(...lons),east=Math.max(...lons),north=Math.max(...lats),south=Math.min(...lats);
const scale=19/(east-west);const project=p=>({x:(p.lon-west)*scale,y:(north-p.lat)*scale});
const nodes=selected.map(id=>({id:`OSM-${id}`,osmId:id,lat:coords.get(id).lat,lng:coords.get(id).lon,...project(coords.get(id))}));
const edges=paths.filter(p=>selection.has(p.a)&&selection.has(p.b)).map(p=>({a:`OSM-${p.a}`,b:`OSM-${p.b}`,distancia_m:Math.round(p.path.slice(1).reduce((s,id,i)=>s+meters(p.path[i],id),0)),tipo:p.tags.bridge&&p.tags.bridge!=='no'?'puente':/primary|secondary|tertiary/.test(p.tags.highway)?'avenida':'calle',nombre:p.tags.name??'Calle sin nombre',osmWay:p.tags.osmWay,highway:p.tags.highway,oneway:p.tags.oneway??'no',geometry:p.path.map(id=>project(coords.get(id)))}));
const graph={metadata:{name:'Manta · extracto del sector central',source:'OpenStreetMap',attribution:'© OpenStreetMap contributors',license:'ODbL-1.0',licenseUrl:'https://www.openstreetmap.org/copyright',endpoint:'https://overpass-api.de/api/interpreter',downloadedAt:new Date().toISOString(),bbox,extractBounds:{south,west,north,east},query,rawSha256:createHash('sha256').update(raw).digest('hex'),simplification:'Degree-2 chains collapsed, original geometry retained; connected BFS extract of 300 junctions. Undirected pedestrian evacuation graph. Not all districts covered.'},nodes,edges};
await writeFile('data/manta-graph.json',JSON.stringify(graph));console.log(JSON.stringify({nodes:nodes.length,edges:edges.length,bounds:graph.metadata.extractBounds,sourceNodes:allowed.size,sha256:graph.metadata.rawSha256}));

