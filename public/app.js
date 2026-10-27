const $=id=>document.getElementById(id);let state,selected,key='',polling=false;
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function api(path,data){const response=await fetch(path,{method:data?'POST':'GET',headers:{'x-api-key':key,...(data?{'Content-Type':'application/json'}:{})},...(data?{body:JSON.stringify(data)}:{})});const result=await response.json();if(!response.ok)throw new Error(result.error??'Error de conexión');return result;}
function render(){
  const m=state.metricas;$('stats').innerHTML=[['PERSONAS',m.total,'#e8edf5'],['A SALVO',m.salvados,'#6ce5b1'],['EN CAMINO',m.activos,'#a390ff'],['MORDIDOS',m.mordidos,'#ff5d73']].map(([label,value,color])=>`<div class="stat"><small>${label}</small><strong style="color:${color}">${value}</strong></div>`).join('');
  $('turn').textContent=`TURNO ${String(state.turno).padStart(3,'0')} / 150`;$('connection').textContent=state.running?'● EN VIVO':'● CONECTADO';$('connection').style.color='#6ce5b1';
  $('map-info').textContent=state.mapaSintetico?'MAPA SINTÉTICO DE PRUEBAS':`OPENSTREETMAP · ${state.nodes.length} INTERSECCIONES · ${state.edges.length} CALLES · REFUGIOS SIMULADOS`;
  const nodes=Object.fromEntries(state.nodes.map(n=>[n.id,n])),edgeKey=(a,b)=>[a,b].sort().join('|');
  const edgeIndex=Object.fromEntries(state.edges.map(e=>[edgeKey(e.a,e.b),e]));
  const points=e=>(e.geometry??[nodes[e.a],nodes[e.b]]).map(n=>`${n.x},${n.y}`).join(' ');
  const all=state.edges.flatMap(e=>e.geometry??[nodes[e.a],nodes[e.b]]),xs=all.map(n=>n.x),ys=all.map(n=>n.y),minX=Math.min(...xs),minY=Math.min(...ys),maxX=Math.max(...xs),maxY=Math.max(...ys);
  $('map').setAttribute('viewBox',`${minX-1} ${minY-1} ${maxX-minX+2} ${maxY-minY+2}`);
  let svg=state.edges.map(e=>`<polyline class="street ${state.aristasBloqueadas.includes(edgeKey(e.a,e.b))?'blocked':''}" fill="none" points="${points(e)}"><title>${escape(e.nombre??e.tipo)} · ${e.distancia_m} m</title></polyline>`).join('');
  const person=state.sobrevivientes.find(s=>s.id===selected);
  if(person?.ruta.length>1)for(let i=1;i<person.ruta.length;i++){const a=person.ruta[i-1],b=person.ruta[i],edge=edgeIndex[edgeKey(a,b)];if(edge)svg+=`<polyline class="route" points="${points(edge)}"/>`;}
  svg+=state.nodes.map(n=>`<circle class="node" cx="${n.x}" cy="${n.y}" r=".045"/>`).join('');
  for(const z of state.zombies.filter(z=>z.tipo==='horda')){
    const zone=new Set([z.nodo]);for(const e of state.edges){if(e.a===z.nodo)zone.add(e.b);if(e.b===z.nodo)zone.add(e.a);}
    for(const id of zone){const n=nodes[id];svg+=`<circle cx="${n.x}" cy="${n.y}" r=".28" fill="#d76aff" opacity=".18"/>`;}
  }
  svg+=state.refugios.map(r=>{const n=nodes[r.nodo];return `<rect x="${n.x-.19}" y="${n.y-.19}" width=".38" height=".38" rx=".06" fill="#a390ff"><title>${escape(r.id)} · refugio simulado</title></rect>`;}).join('');
  svg+=state.sobrevivientes.filter(s=>s.estado==='activo').map(s=>{const n=nodes[s.nodo];return `<circle data-person="${escape(s.id)}" class="person" cx="${n.x}" cy="${n.y}" r=".10"><title>${escape(s.id)} · ${escape(s.nodo)}</title></circle>`;}).join('');
  svg+=state.zombies.map(z=>{const n=nodes[z.nodo],color={caminante:'#ffb35c',corredor:'#ff5d73',horda:'#d76aff'}[z.tipo];return `<circle class="zombie" cx="${n.x}" cy="${n.y}" r=".14" fill="${color}"><title>${escape(z.tipo)} · ${escape(z.id)}</title></circle>`;}).join('');
  $('map').innerHTML=svg;$('events').textContent=state.eventos.join('\n')||'Sin bloqueos registrados. Los eventos de las rondas 2 y 3 ocurren en el turno 30.';
  $('status-note').textContent=`${state.persistencia?'Persistencia local activa':'Estado temporal de pruebas'} · ${state.phase==='deciding'?'Resolviendo solicitudes HTTP':'Turno confirmado'} · Selecciona una persona para ver su ruta.`;
}
async function refresh(){if(!key||polling)return;polling=true;try{state=await api('/estado');render();$('error').textContent='';}catch(e){$('error').textContent=e.message;$('connection').textContent='ERROR DE CONEXIÓN';}finally{polling=false;}}
$('connect').onclick=()=>{key=$('key').value;refresh();};
for(const action of ['start','pause','step','reset'])$(action).onclick=async()=>{const button=$(action);button.disabled=true;try{await api('/control',{action,round:Number($('round').value),seed:Number($('seed').value)});await refresh();}catch(e){$('error').textContent=e.message;}finally{button.disabled=false;}};
$('map').onclick=e=>{if(e.target.dataset.person){selected=e.target.dataset.person;render();}};
setInterval(refresh,1000);
