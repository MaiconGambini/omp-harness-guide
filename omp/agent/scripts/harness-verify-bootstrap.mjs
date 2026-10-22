#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import { createHash } from 'node:crypto'

const HELP = `Usage: node scripts/harness-verify-bootstrap.mjs <inspect|bootstrap> --target <path> [--output <path>] [--json] [--dry-run]\n\ninspect reads repository inventory; bootstrap self-proves one feature before writing. --dry-run performs no mutation.`
function args(argv) { const out = { _: [] }; for (let i=0;i<argv.length;i++) { const x=argv[i]; if (x.startsWith('--')) { const k=x.slice(2); if (k==='json'||k==='dry-run') out[k]=true; else out[k]=argv[++i] } else out._.push(x) } return out }
function readSpec(target) { const file=path.join(target,'verify-target.json'); if (!fs.existsSync(file)) return { spec:null, file, gap:'missing verify-target.json contract' }; try { return { spec:JSON.parse(fs.readFileSync(file,'utf8')), file } } catch (e) { return { spec:null,file,gap:`invalid verify-target.json: ${e.message}` } } }
function commandText(c) { return c ? [c.command, ...(c.args||[])].join(' ') : null }
function hash(file) { return createHash('sha256').update(fs.readFileSync(file)).digest('hex') }
export function inspectTarget(targetInput) {
  const target=path.resolve(targetInput), contract=readSpec(target), spec=contract.spec
  const files=fs.existsSync(target) ? fs.readdirSync(target,{recursive:true}).filter(x=>fs.statSync(path.join(target,x)).isFile()).sort() : []
  const gaps=[]; if (!fs.existsSync(target)) gaps.push('target directory does not exist'); if (contract.gap) gaps.push(contract.gap)
  const features=(spec?.features||[]).map(f=>{ const source=path.join(target,f.source||''); const sourceExists=!!f.source && fs.existsSync(source); if (!sourceExists) gaps.push(`feature ${f.id||'<unnamed>'} source is unavailable`); if (!f.drive) gaps.push(`feature ${f.id||'<unnamed>'} has no drive command`); if (!f.selector) gaps.push(`feature ${f.id||'<unnamed>'} has no selector`); return { id:f.id, name:f.name||f.id, source:f.source||null, selector:f.selector||null, sourceExists, sourceHash:sourceExists?hash(source):null, drive:f.drive?commandText(f.drive):null } })
  if (spec && !spec.run) gaps.push('run command is unavailable'); if (spec && !spec.doctor) gaps.push('doctor command is unavailable'); if (spec && !spec.cleanup) gaps.push('cleanup command is unavailable'); if (spec && !spec.evidence?.path) gaps.push('evidence path is unavailable')
  return { target:targetInput, resolvedTarget:target, repository:{ name:spec?.name||path.basename(target), files, contract:contract.file }, run:{ command:commandText(spec?.run), available:!!spec?.run }, drive:{ features, mappedCount:features.length }, observe:{ evidencePath:spec?.evidence?.path||null, available:!!spec?.evidence?.path }, isolate:{ cleanup:commandText(spec?.cleanup), doctor:commandText(spec?.doctor), contractFile:path.relative(target,contract.file) }, gaps }
}
function run(c,cwd) { if (!c) return {ok:false, output:'unanswerable command'}; const r=spawnSync(c.command,c.args||[],{cwd,encoding:'utf8',shell:false}); return {ok:r.status===0, output:(r.stdout||'')+(r.stderr||''), status:r.status} }
function markdown(inv) {
 const h=['# Verification Skill','', '## Launch','Run the inspected repository command.', '', '## Doctor','Run the inspected doctor command.', '', '## Drive','Drive mapped feature using its recorded command.', '', '## Evidence','Read recorded evidence path as JSON.', '', '## Cleanup','Run recorded cleanup command; retain evidence.', '', '## Helpers','Commands and selectors below come only from target contract.', '', '## Feature Map','', '| ID | Name | Source | Selector |','| --- | --- | --- | --- |']; for(const f of inv.drive.features) h.push(`| ${f.id} | ${f.name} | ${f.source} | ${f.selector} |`); return h.join('\n')+'\n' }
function validateFeatureId(id) {
 const reserved=new Set(['con','prn','aux','nul','com1','com2','com3','com4','com5','com6','com7','com8','com9','lpt1','lpt2','lpt3','lpt4','lpt5','lpt6','lpt7','lpt8','lpt9'])
 if (typeof id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(id) || id === '.' || id === '..' || reserved.has(id.toLowerCase())) throw new Error(`invalid feature id: ${String(id)}`)
}
function assertSafeCleanupPath(input) {
 const resolved=path.resolve(input), parsed=path.parse(resolved); let current=parsed.root
 for (const part of resolved.slice(parsed.root.length).split(path.sep).filter(Boolean)) {
  current=path.join(current,part)
  let stat
  try { stat=fs.lstatSync(current) } catch (error) {
   if (error.code==='ENOENT') continue
   throw new Error(`unsafe cleanup path: ${current}`)
  }
  if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error(`unsafe cleanup path: ${current}`)
 }
}
function generatedPath(dir, relative) {
 const base=path.resolve(dir), resolved=path.resolve(base,relative), rel=path.relative(base,resolved)
 if (!rel || rel==='..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) throw new Error(`generated path escapes staging directory: ${relative}`)
 return resolved
}
function writeGenerated(dir, inv, target, evidencePath, spec) {
 fs.mkdirSync(generatedPath(dir,'features'),{recursive:true}); fs.writeFileSync(generatedPath(dir,'SKILL.md'),markdown(inv)); fs.writeFileSync(generatedPath(dir,'feature-map.json'),JSON.stringify(inv.drive.features,null,2)+'\n');
 fs.writeFileSync(generatedPath(dir,'features/index.md'), '# Feature Index\n\n'+inv.drive.features.map(f=>`- [${f.name}](./${f.id}.md)`).join('\n')+'\n')
 for(const f of inv.drive.features) fs.writeFileSync(generatedPath(dir,`features/${f.id}.md`),`# ${f.name}\n\n## Intent\n${f.name}\n\n## Selector\n${f.selector}\n\n## Drive\n${f.drive}\n\n## Evidence\n${evidencePath}\n`)
 const commands={launch:spec.run,doctor:spec.doctor,drive:spec.features[0]?.drive,cleanup:spec.cleanup}
 const cli=`#!/usr/bin/env node\nimport fs from 'node:fs'; import path from 'node:path'; import {spawnSync} from 'node:child_process';\nconst target=${JSON.stringify(target)}, evidence=${JSON.stringify(evidencePath)}, commands=${JSON.stringify(commands)}; const a=process.argv.slice(2), cmd=a[0], dry=a.includes('--dry-run'), json=a.includes('--json');\nconst run=(x)=>{if(!x){console.error('next action: command unavailable');return 1} if(dry&&['drive','cleanup'].includes(cmd)){const text=[x.command,...(x.args||[])].join(' '); console.log(json?JSON.stringify({dryRun:true,command:text}):'dry-run: '+text);return 0} const r=spawnSync(x.command,x.args||[],{cwd:target,encoding:'utf8',shell:false}),output=(r.stdout||'')+(r.stderr||''); if(json) console.log(JSON.stringify({ok:r.status===0,status:r.status,output})); else process.stdout.write(output); return r.status??1};\nlet code=0; if(cmd==='launch') code=run(commands.launch); else if(cmd==='doctor') code=run(commands.doctor); else if(cmd==='drive') code=run(commands.drive); else if(cmd==='cleanup') code=run(commands.cleanup); else if(cmd==='evidence'){let p=path.join(target,evidence); let v=fs.existsSync(p)?JSON.parse(fs.readFileSync(p,'utf8')):{gap:'evidence unavailable'}; console.log(json?JSON.stringify(v):JSON.stringify(v,null,2));} else {console.error('next action: use launch, doctor, drive, evidence or cleanup'); code=2} process.exit(code);\n`;
 fs.writeFileSync(path.join(dir,'cli.mjs'),cli)
}
export function bootstrap(targetInput, outputInput, opts={}) {
 const inv=inspectTarget(targetInput), target=path.resolve(targetInput), output=path.resolve(outputInput), spec=readSpec(target).spec
 if (inv.gaps.length) throw new Error(`cannot bootstrap: ${inv.gaps.join('; ')}. next action: repair target contract`)
 for (const feature of spec.features) validateFeatureId(feature.id)
 if (opts.dryRun) return {dryRun:true, inventory:inv, output}
 const staging=output+'.staging'
 assertSafeCleanupPath(staging); assertSafeCleanupPath(output)
 fs.rmSync(staging,{recursive:true,force:true}); fs.rmSync(output,{recursive:true,force:true}); fs.mkdirSync(staging,{recursive:true})
 const first=spec.features[0]; const checks=[spec.run,spec.doctor,first?.drive]; for(const c of checks){const r=run(c,target); if(!r.ok){assertSafeCleanupPath(staging); fs.rmSync(staging,{recursive:true,force:true}); throw new Error(`verification failed (${commandText(c)}): ${r.output.trim()}. next action: fix command or target`)} }
 const evidence=path.join(target,spec.evidence.path); const cleanup=run(spec.cleanup,target); if(!cleanup.ok || !fs.existsSync(evidence)){assertSafeCleanupPath(staging); fs.rmSync(staging,{recursive:true,force:true}); throw new Error('evidence did not survive cleanup. next action: preserve evidence in cleanup')}
 writeGenerated(staging,inv,target,spec.evidence.path,spec); fs.renameSync(staging,output); return {status:'green',output,inventory:inv,evidence:spec.evidence.path}
}
if (process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) { const a=args(process.argv.slice(2)); if(a._[0]==='--help'||a._[0]==='-h'||!a._[0]) {console.log(HELP);process.exit(0)} try { const result=a._[0]==='inspect'?inspectTarget(a.target):a._[0]==='bootstrap'?bootstrap(a.target,a.output,{dryRun:a['dry-run']}):(()=>{throw new Error('unknown command')})(); console.log(a.json||a._[0]==='inspect'?JSON.stringify(result,null,2):`bootstrap ${result.status||'dry-run'}: ${result.output}`) } catch(e){console.error(e.message);process.exit(1)} }
