import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,rm,readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createApplication} from '../src/server.js';
import {requestStep} from '../src/http-simulator.js';
const listen=async app=>{await new Promise(r=>app.server.listen(0,'127.0.0.1',r));return `http://127.0.0.1:${app.server.address().port}`;};
test('API real: auth, permisos, 200 peticiones, movimiento y reinicio persistente',async()=>{
  await mkdir('results',{recursive:true});const dir=await mkdtemp(join('results','manta-test-')),storePath=join(dir,'world.json');let app;
  try{app=await createApplication({key:'test-evaluator',adminKey:'test-admin',storePath,round:3});const url=await listen(app);
    await assert.rejects(createApplication({key:'other',storePath}),error=>error.code==='EEXIST');
    assert.equal((await fetch(`${url}/estado`)).status,401);
    assert.equal((await fetch(`${url}/control`,{method:'POST',headers:{'x-api-key':'test-evaluator','Content-Type':'application/json'},body:'{"action":"step"}'})).status,403);
    assert.equal((await fetch(`${url}/`)).status,200);
    const before=app.world.sobrevivientes.map(s=>({...s}));
    const requests=await Promise.all(before.map(s=>requestStep(url,'test-evaluator',{sobrevivienteId:s.id,nodoActual:s.nodo,turno:0})));
    assert.equal(requests.length,200);assert.equal(requests.filter(r=>r.error).length,0);assert.ok(requests.every(r=>r.ms<500));
    for(let i=0;i<requests.length;i++){const next=requests[i].answer.siguienteNodo;assert.ok(next===before[i].nodo||app.world.adjacency[before[i].nodo].includes(next));}
    const step=await fetch(`${url}/control`,{method:'POST',headers:{'x-api-key':'test-admin','Content-Type':'application/json'},body:'{"action":"step"}'});assert.equal(step.status,200);
    const rng=app.world.rngState,turn=app.world.turno,people=structuredClone(app.world.sobrevivientes);await app.close();app=null;
    app=await createApplication({key:'test-evaluator',adminKey:'test-admin',storePath});assert.equal(app.world.rngState,rng);assert.equal(app.world.turno,turn);assert.deepEqual(app.world.sobrevivientes,people);assert.equal(app.world.phase,'idle');await listen(app);await app.close();app=null;
    // Primary corruption falls back to a checksum-verified previous snapshot.
    await writeFile(storePath,'broken');app=await createApplication({key:'test',storePath});assert.ok(app.world.turno>=0);await listen(app);
    assert.ok((await readFile(`${storePath}.bak`,'utf8')).includes('checksum'));
  }finally{if(app)await app.close();await rm(dir,{recursive:true,force:true});}
});
