import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { VaultCoordinator, backupSize, type VaultPreview } from '../src/services/vault';
import { ExitCoordinator } from '../src/services/autosave';
import { bindTheme, resolveTheme, vaultAsset } from '../src/utils/theme';
import { VaultPreviewCard } from '../src/components/common/VaultPreviewCard';
import { api } from '../src/services/api';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const preview: VaultPreview = { path: 'C:/Temp/test.mcbackup', size: 1024, archive_sha256: '0'.repeat(64), format_version: 1, app_version: '0.5.0', created_at: '2026-10-18T08:00:00Z', document_count: 3, studios: ['poetry','philosophy','lorebook'], attachment_count: 2, archived_count: 1, file_count: 8, total_bytes: 900 };

test('Vault waits for pending writing/organization flush before starting a snapshot', async () => {
  const gate = new VaultCoordinator(); const order: string[] = [];
  const result = await gate.run(async () => { order.push('saved'); return true; }, async () => { order.push('capture'); return preview; });
  assert.deepEqual(order, ['saved','capture']); assert.equal(result,preview); assert.equal(gate.busy,false);
});
test('failed autosave prevents backup creation and permits retry', async () => {
  const gate=new VaultCoordinator(); let captured=false;
  await assert.rejects(gate.run(async()=>false,async()=>{captured=true;}),/could not be saved/);
  assert.equal(captured,false); assert.equal(gate.busy,false);
  await gate.run(async()=>true,async()=>{captured=true;}); assert.equal(captured,true);
});
test('close awaits an in-flight Vault operation and then flushes before exit', async () => {
  const gate=new VaultCoordinator(); const order:string[]=[]; let release!:()=>void;
  const writing=gate.run(async()=>true,()=>new Promise<void>(resolve=>{release=()=>{order.push('backup done');resolve();};}));
  await new Promise(resolve=>setTimeout(resolve,0));
  const close=new ExitCoordinator().run(async()=>{await gate.wait();order.push('final save');return true;},async()=>{order.push('exit');});
  assert.equal(gate.busy,true); assert.deepEqual(order,[]);
  await assert.rejects(gate.run(async()=>true,async()=>{}),/already running/);
  release(); await writing; await close; assert.deepEqual(order,['backup done','final save','exit']);
});
test('a failed Vault operation releases the gate and does not strand normal shutdown', async () => {
  const gate=new VaultCoordinator(); const failure=gate.run(async()=>true,async()=>{throw new Error('disk full');});
  await gate.wait(); await assert.rejects(failure,/disk full/); assert.equal(gate.busy,false);
});
test('restore preview is explicit, compatible and initially requires confirmation', () => {
  let restores=0; const html=renderToStaticMarkup(React.createElement(VaultPreviewCard,{preview,onRestore:()=>{restores++;}}));
  assert.match(html,/3/); assert.match(html,/poetry, philosophy, lorebook/); assert.match(html,/2 attachments/); assert.match(html,/1 archived/);
  assert.match(html,/Format 1/); assert.match(html,/current library stays unchanged/); assert.match(html,/not encrypted/);
  assert.match(html,/<button disabled=""/); assert.equal(restores,0);
});
test('empty-library preview and file-size display are meaningful', () => {
  const html=renderToStaticMarkup(React.createElement(VaultPreviewCard,{preview:{...preview,document_count:0,studios:[]},onRestore:()=>{}}));
  assert.match(html,/Empty library/); assert.equal(backupSize(0),'0 B'); assert.equal(backupSize(1024),'1.0 KiB'); assert.equal(backupSize(1024*1024),'1.0 MiB');
});
test('browser preview refuses native Vault operations rather than simulating durable backups', async () => {
  for (const action of [()=>api.vaultHistory(),()=>api.vaultCreate(),()=>api.vaultVerify('test'),()=>api.vaultChoose(),()=>api.vaultRestore('test','hash'),()=>api.vaultOpenFolder()]) await assert.rejects(action,/requires the Windows desktop/);
});
test('official JPEG masters match supplied artwork byte-for-byte and remain 2048px originals', () => {
  const expected={ 'vault.jpg':'9c07fb4351af23a37b79a49bc3ccc5e7704075e9db104198bada9078b264bc1b', 'vault-light.jpg':'9ffddc93d1c268ae5c40d4b44d2a555425bdd5369f194f9fa3f34172c11b987c' };
  for(const [name,hash] of Object.entries(expected)) {
    const bytes=fs.readFileSync(path.join(root,'src/assets/brand',name)); assert.equal(bytes.readUInt16BE(0),0xffd8);
    assert.equal(createHash('sha256').update(bytes).digest('hex'),hash);
    // The actual file hash pins dimensions, colors, whitespace and proportions, not just the filename.
  }
});
test('Dark, Light and System select the corresponding official Vault asset', () => {
  for(const [mode,system,dark] of [['dark',false,true],['light',true,false],['system',true,true],['system',false,false]] as const) {
    assert.equal(vaultAsset(resolveTheme(mode,system)==='dark','vault.jpg','vault-light.jpg'),dark?'vault.jpg':'vault-light.jpg');
  }
});
test('existing root-class theme binding reacts immediately to OS changes in System mode', () => {
  const calls:boolean[]=[]; let listener:(()=>void)|undefined;
  const root={classList:{toggle:(name:string,value:boolean)=>{assert.equal(name,'dark');calls.push(value);}}};
  const media={matches:true,addEventListener:(_name:string,callback:()=>void)=>{listener=callback;},removeEventListener:(_name:string,callback:()=>void)=>{assert.equal(callback,listener);listener=undefined;}};
  const cleanup=bindTheme('system',root as any,media as any); assert.deepEqual(calls,[true]);
  media.matches=false; listener!(); assert.deepEqual(calls,[true,false]);
  assert.equal(vaultAsset(calls.at(-1)!,'vault.jpg','vault-light.jpg'),'vault-light.jpg');
  cleanup(); assert.equal(listener,undefined);
});
test('explicit Dark and Light ignore OS preference changes and need no restart', () => {
  let dark=false; let subscribed=false;
  const root={classList:{toggle:(_name:string,value:boolean)=>{dark=value;}}};
  const media={matches:false,addEventListener:()=>{subscribed=true;},removeEventListener:()=>{}};
  bindTheme('dark',root as any,media as any); assert.equal(dark,true);assert.equal(subscribed,false);
  bindTheme('light',root as any,media as any);assert.equal(dark,false);
});
