import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {inspectClaudeSubscription,runClaudeSetup,connectClaude,claudeInstallerCommand,configureClaudeDisconnect,setClaudeDisconnected,isClaudeDisconnected} from './claude-connection.mjs';
import {mkdtempSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {askClaudeForJson} from './claude-cli.mjs';
function fakeProbe({version='2.1.288',auth={loggedIn:true,authMethod:'claude.ai',subscriptionType:'max'},code=0}={}){
 const calls=[];const spawnImpl=(_binary,args)=>{calls.push(args);const child=new EventEmitter();child.stdout=new EventEmitter();child.stderr=new EventEmitter();queueMicrotask(()=>{child.stdout.emit('data',Buffer.from(args[0]==='--version'?version:JSON.stringify(auth)));child.emit('close',args[0]==='--version'?0:code);});return child;};return{calls,spawnImpl};
}
test('connection requires an installed recent CLI and signed-in subscription',async()=>{
 assert.equal((await inspectClaudeSubscription({binary:null,env:{}})).status,'missing');
 const old=fakeProbe({version:'2.1.247'});assert.equal((await inspectClaudeSubscription({binary:'/fake',env:{},spawnImpl:old.spawnImpl})).status,'unsupported-version');assert.equal(old.calls.length,1);
 const unsigned=fakeProbe({auth:{loggedIn:false},code:1});assert.equal((await inspectClaudeSubscription({binary:'/fake',env:{},spawnImpl:unsigned.spawnImpl})).status,'not-signed-in');
});
test('API environment stops before any CLI or model call and never exposes key values',async()=>{
 const probe=fakeProbe();const result=await inspectClaudeSubscription({binary:'/fake',env:{ANTHROPIC_API_KEY:'fictional-secret'},spawnImpl:probe.spawnImpl});assert.equal(result.status,'api-mode');assert.equal(probe.calls.length,0);assert.ok(!JSON.stringify(result).includes('fictional-secret'));
 let modelCalls=0;const response=await askClaudeForJson({binary:'/fake',schema:{},systemPrompt:'neutral',buildPrompt:()=>'',connectionCheck:async()=>result,runOnce:async()=>{modelCalls++;}});assert.equal(response.ok,false);assert.equal(modelCalls,0);
});
test('auth metadata is sanitized and API billing is rejected even without environment override',async()=>{
 const ready=fakeProbe({auth:{loggedIn:true,authMethod:'claude.ai',subscriptionType:'max',email:'private@example.invalid',organizationId:'private-org'}});const result=await inspectClaudeSubscription({binary:'/fake',env:{},spawnImpl:ready.spawnImpl});assert.equal(result.ok,true);assert.equal(result.subscriptionType,'max');assert.ok(!JSON.stringify(result).includes('private'));assert.deepEqual(ready.calls,[['--version'],['auth','status']]);
 const api=fakeProbe({auth:{loggedIn:true,authMethod:'api_key',subscriptionType:null}});assert.equal((await inspectClaudeSubscription({binary:'/fake',env:{},spawnImpl:api.spawnImpl})).status,'api-mode');
});
test('one-click setup runs only the official login or update command and never reads output',async()=>{
 const seen=[];const make=code=>(binary,args,options)=>{seen.push({binary,args,stdio:options.stdio});const child=new EventEmitter();queueMicrotask(()=>child.emit('close',code));return child;};
 assert.deepEqual(await runClaudeSetup({binary:'/fake',action:'login',spawnImpl:make(0)}),{ok:true,code:0});
 assert.deepEqual(seen[0].args,['auth','login']);assert.deepEqual(seen[0].stdio,['ignore','ignore','ignore']);
 assert.equal((await runClaudeSetup({binary:'/fake',action:'update',spawnImpl:make(1)})).ok,false);assert.deepEqual(seen[1].args,['update']);
 assert.equal((await runClaudeSetup({binary:'/fake',action:'rm -rf',spawnImpl:make(0)})).ok,false);assert.equal(seen.length,2);
 assert.equal((await runClaudeSetup({binary:null,action:'login'})).ok,false);
});
test('one Connect button installs, updates and signs in only as needed, then reports',async()=>{
 const run=async(statuses)=>{const steps=[];const queue=[...statuses];
  const result=await connectClaude({resolveBinary:()=>'/fake',inspect:async()=>({status:queue.shift()}),install:async()=>steps.push('install'),setup:async({action})=>steps.push(action)});
  return{steps,result};};
 assert.deepEqual((await run(['missing','not-signed-in','ready'])).steps,['install','login']);
 assert.deepEqual((await run(['unsupported-version','not-signed-in','ready'])).steps,['update','login']);
 assert.deepEqual((await run(['not-signed-in','ready'])).steps,['login']);
 const ready=await run(['ready']);assert.deepEqual(ready.steps,[]);assert.equal(ready.result.status,'ready');
 assert.deepEqual((await run(['missing','missing'])).steps,['install']);
 assert.equal(claudeInstallerCommand('win32').command,'powershell.exe');assert.match(claudeInstallerCommand('linux').args.join(' '),/claude\.ai\/install\.sh/);
});
test('logging out of Rough Cut never touches the Claude CLI login; Connect clears it',async()=>{
 configureClaudeDisconnect(join(mkdtempSync(join(tmpdir(),'rc-logout-')),'flag'));
 let spawned=0;const spawnImpl=()=>{spawned++;throw new Error('must not run');};
 setClaudeDisconnected(true);assert.equal(isClaudeDisconnected(),true);
 const out=await inspectClaudeSubscription({binary:'/fake',spawnImpl});
 assert.equal(out.status,'not-signed-in');assert.equal(spawned,0);
 await connectClaude({resolveBinary:()=>'/fake',inspect:async()=>({ok:true,status:'ready'})});
 assert.equal(isClaudeDisconnected(),false);
 configureClaudeDisconnect(null);
});
