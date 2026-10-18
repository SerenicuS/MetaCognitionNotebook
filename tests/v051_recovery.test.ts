import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ActiveNotebookConfirmation } from '../src/components/common/ActiveNotebookConfirmation';
import { VaultPreviewCard } from '../src/components/common/VaultPreviewCard';
import { VaultCoordinator, reconcileActivation, type ActivationStatus, type VaultPreview } from '../src/services/vault';
import { CommandQueue, ExitCoordinator } from '../src/services/autosave';
import { api } from '../src/services/api';

const status: ActivationStatus = { active_path:'C:/Original', selected_path:'C:/New', previous_path:'C:/Original', preserved_backup:'C:/Vault/pre-restore.mcbackup', restart_required:true, message:'Restart required' };
const preview: VaultPreview = { path:'C:/Backups/chosen.mcbackup', size:1024, archive_sha256:'a'.repeat(64), created_at:'2026-10-18T10:00:00Z', format_version:1, app_version:'0.5.0', document_count:3, studios:['poetry','philosophy','lorebook'], attachment_count:1, archived_count:0, file_count:5, total_bytes:900 };

test('active restore has its own explicit unchecked confirmation naming backup and original notebook', () => {
  const html=renderToStaticMarkup(React.createElement(ActiveNotebookConfirmation,{preview,currentPath:status.active_path,onActivate:()=>{}}));
  assert.match(html,/Restore as Active Notebook/); assert.match(html,/chosen.mcbackup/); assert.match(html,/C:\/Original/);
  assert.match(html,/after restart/); assert.match(html,/verified pre-restore backup/); assert.match(html,/<button disabled=""/); assert.doesNotMatch(html,/checked=""/);
  const separate=renderToStaticMarkup(React.createElement(VaultPreviewCard,{preview,onRestore:()=>{}}));
  assert.match(separate,/current library stays unchanged/); assert.match(separate,/separate restored copy/); assert.doesNotMatch(separate,/Restore as Active Notebook/);
});
test('activation saves pending writing before queued selection and holds the gate after acknowledgement', async () => {
  const gate=new VaultCoordinator(); const commands=new CommandQueue(); const events:string[]=[];
  await gate.run(async()=>{events.push('pending writing saved');return true;},()=>commands.run(async()=>{
    events.push('preserve and activate'); await reconcileActivation(gate,async()=>status);
  }));
  assert.deepEqual(events,['pending writing saved','preserve and activate']); assert.equal(gate.restartRequired,true); assert.equal(gate.busy,true);
  await assert.rejects(gate.run(async()=>true,async()=>{}),/already running/);
});
test('failed autosave never invokes activation and permits continued editing/retry', async () => {
  const gate=new VaultCoordinator(); let activated=false;
  await assert.rejects(gate.run(async()=>false,async()=>{activated=true;}),/could not be saved/);
  assert.equal(activated,false); assert.equal(gate.restartRequired,false); assert.equal(gate.busy,false);
});
test('lost activation acknowledgement reconciles published selection and prevents old-library writes', async () => {
  const gate=new VaultCoordinator();
  await assert.rejects(gate.run(async()=>true,async()=>{
    try { throw new Error('IPC acknowledgement lost'); }
    finally { await reconcileActivation(gate,async()=>status); }
  }),/acknowledgement lost/);
  assert.equal(gate.restartRequired,true); assert.equal(gate.busy,true);
});
test('unknown activation outcome fails closed, while known unpublished failure permits retry', async () => {
  const unknown=new VaultCoordinator();
  await assert.rejects(reconcileActivation(unknown,async()=>{throw new Error('IPC unavailable');}),/unavailable/);
  assert.equal(unknown.restartRequired,true);
  const safe=new VaultCoordinator();
  await safe.run(async()=>true,async()=>{await reconcileActivation(safe,async()=>({...status,restart_required:false}));});
  assert.equal(safe.restartRequired,false); assert.equal(safe.busy,false);
});
test('normal exit waits for activation publication and avoids saving into the previous notebook afterward', async () => {
  const gate=new VaultCoordinator(); const events:string[]=[]; let release!:()=>void;
  const pending=gate.run(async()=>true,()=>new Promise<void>(resolve=>{release=()=>{gate.requireRestart();events.push('selection saved');resolve();};}));
  await new Promise(resolve=>setTimeout(resolve,0));
  const close=new ExitCoordinator().run(()=>gate.prepareExit(async()=>{events.push('old-library save');return true;}),async()=>{events.push('close');});
  assert.deepEqual(events,[]); release(); await pending; await close;
  assert.deepEqual(events,['selection saved','close']);
});
test('ordinary failed activation still flushes on close and failed flush keeps app open', async () => {
  const gate=new VaultCoordinator(); let closed=false;
  await assert.rejects(gate.run(async()=>true,async()=>{throw new Error('disk full');}),/disk full/);
  assert.equal(await new ExitCoordinator().run(()=>gate.prepareExit(async()=>false),async()=>{closed=true;}),false);
  assert.equal(closed,false);
});
test('activation, rollback, status and restart refuse browser simulation', async () => {
  for (const action of [()=>api.vaultActivate(preview.path,preview.archive_sha256),()=>api.vaultRollback(),()=>api.vaultActivationStatus(),()=>api.vaultRestart()]) {
    await assert.rejects(action,/requires the Windows desktop app/);
  }
});
