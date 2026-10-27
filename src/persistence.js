import {mkdir,readFile,writeFile,rename,copyFile,open,unlink} from 'node:fs/promises';
import {dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {indexGraph} from './graph.js';
const digest=text=>createHash('sha256').update(text).digest('hex');
export function encodeWorld(w){const {adjacency,costs,edgeIndex,httpMetrics,...state}=w;const payload=JSON.stringify(state);return JSON.stringify({version:2,checksum:digest(payload),payload});}
export function decodeWorld(text){const envelope=JSON.parse(text);if(envelope.version!==2||digest(envelope.payload)!==envelope.checksum)throw new Error('Snapshot inválido o checksum incorrecto');const state=JSON.parse(envelope.payload);if(state.schemaVersion!==2||!['idle','deciding'].includes(state.phase)||!Number.isInteger(state.rngState)||!Array.isArray(state.sobrevivientes)||!Array.isArray(state.zombies))throw new Error('Estado inválido');return {...state,...indexGraph(state),httpMetrics:[]};}
export class FileStore{
  constructor(path){this.path=path;this.queue=Promise.resolve();}
  async lock(){await mkdir(dirname(this.path),{recursive:true});this.handle=await open(`${this.path}.lock`,'wx');await this.handle.writeFile(String(process.pid));}
  async close(){await this.queue;await this.handle?.close();if(this.handle)await unlink(`${this.path}.lock`);}
  async load(){try{return decodeWorld(await readFile(this.path,'utf8'));}catch(error){try{const recovered=decodeWorld(await readFile(`${this.path}.bak`,'utf8'));this.recovered=true;return recovered;}catch(backupError){if(error.code==='ENOENT'&&backupError.code==='ENOENT')return null;throw new Error(`No se pudo recuperar el estado: ${error.message}`);}}}
  save(w){const content=encodeWorld(w);const operation=this.queue.then(async()=>{await mkdir(dirname(this.path),{recursive:true});
    // Do not overwrite a valid backup with a corrupt primary.
    try{decodeWorld(await readFile(this.path,'utf8'));await copyFile(this.path,`${this.path}.bak`);}catch(error){if(error.code!=='ENOENT'&&!this.recovered)throw error;}
    const temporary=`${this.path}.tmp`;const file=await open(temporary,'w');try{await file.writeFile(content);await file.sync();}finally{await file.close();}await rename(temporary,this.path);this.recovered=false;
  });this.queue=operation.catch(()=>{});return operation;}
}
