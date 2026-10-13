import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {inspectClaudeSubscription} from './claude-connection.mjs';
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
