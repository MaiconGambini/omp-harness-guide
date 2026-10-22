#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import { inspectTarget } from './harness-verify-bootstrap.mjs'

const DEFAULT_COMMAND_TIMEOUT_MS = 5000
const DEFAULT_MAX_BUFFER = 64 * 1024

function parse(argv){const o={};for(let i=0;i<argv.length;i++){const x=argv[i];if(x==='--json')o.json=true;else if(x.startsWith('--'))o[x.slice(2)]=argv[++i]}return o}
function boundedOutput(output, maxBuffer) {
 const text = typeof output === 'string' ? output : output ? String(output) : ''
 return text.length > maxBuffer ? text.slice(0, maxBuffer) : text
}
function cmd(c,cwd,opts={}) {
 const settings = opts && typeof opts === 'object' ? opts : {}
 const timeoutMs = Number.isFinite(settings.commandTimeoutMs) && settings.commandTimeoutMs > 0 ? settings.commandTimeoutMs : DEFAULT_COMMAND_TIMEOUT_MS
 const maxBuffer = Number.isFinite(settings.maxBuffer) && settings.maxBuffer > 0 ? settings.maxBuffer : DEFAULT_MAX_BUFFER
 if(!c)return {ok:false,output:'unanswerable command'}
 try {
  const r=spawnSync(c.command,c.args||[],{cwd,encoding:'utf8',shell:false,timeout:timeoutMs,maxBuffer})
  const captured=boundedOutput((r.stdout||'')+(r.stderr||''),maxBuffer)
  if (r.error) {
   const detail = captured.length >= maxBuffer
    ? `command output exceeded ${maxBuffer} bytes`
    : r.error.code === 'ETIMEDOUT' || r.signal === 'SIGTERM'
      ? `command timed out after ${timeoutMs}ms`
      : r.error.code === 'ENOBUFS'
        ? `command output exceeded ${maxBuffer} bytes`
        : `command could not start (${r.error.code || r.error.message})`
   return {ok:false,output:boundedOutput(`${detail}${captured ? `\n${captured}` : ''}`,maxBuffer)}
  }
  if (r.status !== 0) return {ok:false,output:captured || `command exited with status ${r.status}`}
  return {ok:true,output:captured}
 } catch (error) {
  return {ok:false,output:boundedOutput(`command could not start (${error.code || error.message})`,maxBuffer)}
 }
}
export function audit(targetInput, skillInput, options = {}){
 const target=path.resolve(targetInput), skill=path.resolve(skillInput), inv=inspectTarget(target), observations=[], drift=[]
 const mapFile=path.join(skill,'feature-map.json')
 let map=[], mapState='valid'
if(!fs.existsSync(mapFile)){
 mapState='unavailable'
 observations.push('generated feature-map.json is unavailable')
} else {
 let raw
 try{raw=fs.readFileSync(mapFile,'utf8')}catch{mapState='unreadable';observations.push('generated feature-map.json is unreadable')}
 if(mapState==='valid'){
  try{map=JSON.parse(raw)}catch{mapState='malformed';observations.push('generated feature-map.json is malformed')}
 }
 if(mapState==='valid'&&!Array.isArray(map)){mapState='malformed';map=[];observations.push('generated feature-map.json is malformed (expected array)')}
 if(mapState==='valid'&&map.length===0){mapState='empty';observations.push('generated feature-map.json is empty (expected nonempty array)')}
 if(mapState==='valid'&&!map.every(f=>f&&typeof f==='object'&&typeof f.id==='string')){mapState='malformed';map=[];observations.push('generated feature-map.json is malformed (invalid feature entry)')}
}
 const specFile=path.join(target,'verify-target.json'); let spec=null; try{spec=JSON.parse(fs.readFileSync(specFile,'utf8'))}catch{observations.push(`source observation: ${path.relative(target,specFile)} is unreadable`)}
 for(const old of map){const source=path.join(target,old.source||''); if(!old.source||!fs.existsSync(source)){observations.push(`source observation: ${old.source||old.id} is missing (renamed or deleted)`);drift.push({id:old.id,kind:'deleted'})} else {const current=inv.drive.features.find(f=>f.id===old.id); if(!current) {observations.push(`source observation: feature ${old.id} is absent from contract (deleted)`);drift.push({id:old.id,kind:'deleted'})} else if(current.selector!==old.selector){observations.push(`source observation: ${current.source} selector changed from ${old.selector} to ${current.selector}`);drift.push({id:old.id,kind:'selector-changed'})} else if(old.sourceHash&&current.sourceHash!==old.sourceHash){observations.push(`source observation: ${current.source} hash changed`);drift.push({id:old.id,kind:'hash-changed'})}}}
 const byId=new Set(map.map(x=>x.id)); for(const f of inv.drive.features) if(!byId.has(f.id)){observations.push(`source observation: ${f.source} is new or renamed as ${f.id}`);drift.push({id:f.id,kind:'renamed'})}
 const coverage=[]; for(const f of map){const src=path.join(target,f.source||''); const reader=!!f.source&&fs.existsSync(src); const live=inv.drive.features.find(x=>x.id===f.id); const result=live?cmd(spec?.features?.find(x=>x.id===f.id)?.drive,target,options):{ok:false,output:'unanswerable command'}; const pass=result.ok; coverage.push({id:f.id,sourceReader:reader,livePass:pass}); if(!reader) observations.push(`source observation: no source reader for ${f.id}`); if(!pass) observations.push(`live observation: mapped feature ${f.id} did not pass (${result.output})`)}
 const covered=mapState==='valid'&&coverage.length>0&&coverage.length===map.length&&coverage.every(x=>x.sourceReader&&x.livePass)
 let status='blocked'; if(covered) status=drift.length?'changed':'clean'
 return {status,observations,drift,coverage,source:specFile,skill:skillInput}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const a=parse(process.argv.slice(2));if(!a.target||!a.skill){console.error('next action: provide --target and --skill');process.exit(2)}const r=audit(a.target,a.skill);console.log(a.json?JSON.stringify(r,null,2):r.status);process.exit(r.status==='blocked'?1:0)}
