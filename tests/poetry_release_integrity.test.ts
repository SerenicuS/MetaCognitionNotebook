import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
const directory = mkdtempSync(join(tmpdir(), 'mc-poetry-integrity-'));
const fileURL = (name: string) => pathToFileURL(join(directory, name));
process.on('exit', () => rmSync(directory, { recursive: true, force: true }));
import * as c from '../src/utils/emotionalCipher.ts';

const text = 'love at dawn\n\nlove at noon\n\nlove at dusk';
const entries = c.initializePoemStanzas(text);
entries.forEach((s,i)=>s.mappings=[{original:'love',replacement:['ember','silence','home'][i]}]);
const meta: c.PoemCipherMetadata = {version:2,scope:'per_stanza',stanzas:entries,
  unresolved_stanzas:[{id:'detached',index:4,mappings:[{original:'lost',replacement:'found'}]}],
  whole_poem_backup:{mappings:[{original:'love',replacement:'warmth'}]},per_stanza_backup:entries};
const encoded = c.encodePoemWithStanzas(c.splitPoemStanzas(text),entries);
const key = c.validateCipherKey({version:2,algorithm_version:'2.0',id:'rc-key',name:'RC disposable',
  scope:'per_stanza',mappings:[],stanzas:entries,source_fingerprint:c.computeTextFingerprint(text),
  encoded_fingerprint:c.computeTextFingerprint(encoded.encodedText)});
writeFileSync(fileURL('v2.mckey'),JSON.stringify(key,null,2));
writeFileSync(fileURL('poem-meta.json'),JSON.stringify(meta,null,2));

test('mcpoem filesystem boundary retains complete backups and unresolved metadata',()=>{
  const out=c.serializePoemExport({title:'RC disposable',content:text,cipherMeta:meta as any},'mcpoem');
  const file=fileURL('three-stanzas.mcpoem');writeFileSync(file,out.content);
  const back=c.parsePoemImport(out.filename,readFileSync(file,'utf8'));
  assert.deepEqual(back.cipher,meta);
});
test('v2 mccipher filesystem boundary decodes all three independent mappings',()=>{
  const pkg=c.createCipherPackage({poemTitle:'RC',encodedText:encoded.encodedText,key});
  const file=fileURL('three-stanzas.mccipher');writeFileSync(file,JSON.stringify(pkg));
  assert.equal(c.decodeCipherPackage(readFileSync(file,'utf8')).decodeResult.decodedText,text);
});
test('RELEASE INVARIANT: v2 package algorithm metadata survives validation',()=>{
  const pkg=c.createCipherPackage({poemTitle:'RC',encodedText:encoded.encodedText,key});
  assert.equal(c.validateCipherPackage(JSON.stringify(pkg)).algorithm_version,'2.0');
});
test('scope conflict cancellation preserves entire original metadata',()=>{
  const before=JSON.stringify(meta);const result=c.switchCipherScope(meta,'whole_poem',c.splitPoemStanzas(text));
  assert.equal(result.conflicts?.conflictingWords.length,1);assert.equal(JSON.stringify(result.nextMeta),before);
  assert.equal(JSON.stringify(meta),before);
});
test('scope conflict resolution and return preserve active independent stanza rules',()=>{
  const resolved=c.resolveScopeConflictsAndSwitch(meta,{love:'ember'});
  const back=c.switchCipherScope(resolved,'per_stanza',c.splitPoemStanzas(text));
  assert.deepEqual(back.nextMeta.stanzas?.map(s=>s.mappings),entries.map(s=>s.mappings));
});
test('RELEASE INVARIANT: scope backup restores after Whole Poem save and reopen',()=>{
  const resolved=c.resolveScopeConflictsAndSwitch(meta,{love:'ember'});
  // Whole Poem save in EmotionalCipherModal persists per_stanza_backup, omitting active stanzas.
  const reopened={...resolved,stanzas:undefined};
  const back=c.switchCipherScope(JSON.parse(JSON.stringify(reopened)),'per_stanza',c.splitPoemStanzas(text));
  assert.deepEqual(back.nextMeta.stanzas?.map(s=>s.mappings),entries.map(s=>s.mappings));
});
test('explicit move, insert, delete preserve UUIDs and recoverable removed rules',()=>{
  const moved=c.moveStanzaEntry(entries,0,2);assert.equal(moved[2].id,entries[0].id);
  const inserted=c.insertStanzaEntry(moved,1);assert.equal(inserted[1].mappings.length,0);
  const deleted=c.deleteStanzaEntry(inserted,2);assert.equal(deleted.removed?.id,entries[2].id);
  assert.equal(deleted.removed?.mappings[0].replacement,'home');
});
test('split assigns new identity and retains source rules',()=>{
  const split=c.splitStanzaEntry(entries,1);assert.equal(split.length,4);
  assert.equal(split[1].id,entries[1].id);assert.equal(split[2].mappings.length,0);
});
test('RELEASE INVARIANT: same-count external reorder follows fingerprints',()=>{
  const changed=c.reconcileStanzaEntries([...c.splitPoemStanzas(text)].reverse(),entries);
  assert.equal(changed.reconciled[0].id,entries[2].id);
});
test('RELEASE INVARIANT: merging conflicting rules preserves both or requests resolution',()=>{
  const merged=c.mergeStanzaEntries(entries,0);
  assert.ok(JSON.stringify(merged).includes('silence'),'second stanza conflicting mapping silently discarded');
});
test('RELEASE INVARIANT: key boundary preserves recovery metadata when supplied',()=>{
  const back:any=c.validateCipherKey({...key,unresolved_stanzas:meta.unresolved_stanzas,
    whole_poem_backup:meta.whole_poem_backup,per_stanza_backup:meta.per_stanza_backup});
  assert.deepEqual(back.unresolved_stanzas,meta.unresolved_stanzas);
});

test('repeated saved scope transitions preserve IDs, empty mappings, manifests and recovery',()=>{
  const input = structuredClone(meta);
  input.stanzas![1].mappings = [];
  input.stanzas![0].manifest = { version: 1, created_at: '2026-10-31T00:00:00Z', substitutions: [] };
  let current = input;
  for (let i=0;i<3;i++) {
    current = c.resolveScopeConflictsAndSwitch(current,{love:'ember'});
    current = JSON.parse(JSON.stringify({...current,stanzas:undefined}));
    current = c.switchCipherScope(current,'per_stanza',c.splitPoemStanzas(text)).nextMeta;
    assert.deepEqual(current.stanzas?.map(s=>[s.id,s.mappings,s.manifest]),input.stanzas?.map(s=>[s.id,s.mappings,s.manifest]));
    assert.deepEqual(current.unresolved_stanzas,input.unresolved_stanzas);
  }
});
test('actual encoded Whole Poem metadata snapshot restores saved stanza identities on reopen',()=>{
  const resolved = c.resolveScopeConflictsAndSwitch(meta,{love:'ember'});
  const whole = c.createCipherKey({id:'whole',mode:'manual',sourceText:text,mappings:resolved.mappings!});
  const portable = c.withCipherRecovery({...whole.key,scope:'whole_poem'},resolved);
  const saved = c.cipherMetadataFromKey(portable,whole.encodeResult.encodedText);
  assert.equal(saved.stanzas,undefined);
  const reopened = JSON.parse(JSON.stringify(saved));
  const restored=c.switchCipherScope(reopened,'per_stanza',c.splitPoemStanzas(whole.encodeResult.encodedText)).nextMeta;
  assert.deepEqual(restored.stanzas?.map(s=>[s.id,s.mappings]),entries.map(s=>[s.id,s.mappings]));
});
test('scope conflicts require explicit complete choices and cancellation is mutation-free',()=>{
  const before=structuredClone(meta);
  assert.throws(()=>c.resolveScopeConflictsAndSwitch(meta,{}),/Explicit resolution/);
  assert.throws(()=>c.resolveScopeConflictsAndSwitch(meta,{love:'guessed'}),/Explicit resolution/);
  assert.deepEqual(meta,before);
});
test('first scope transition clones global rules even when the UI initialized empty stanza entries',()=>{
  const initialized=c.initializePoemStanzas(text);
  const result=c.switchCipherScope({scope:'whole_poem',mappings:[{original:'love',replacement:'warmth'}],stanzas:initialized},'per_stanza',c.splitPoemStanzas(text));
  assert.deepEqual(result.nextMeta.stanzas?.map(s=>s.mappings),initialized.map(()=>[{original:'love',replacement:'warmth'}]));
  const emptyBackup=c.switchCipherScope({scope:'whole_poem',mappings:[{original:'love',replacement:'warmth'}],per_stanza_backup:initialized},'per_stanza',c.splitPoemStanzas(text));
  assert.ok(emptyBackup.nextMeta.stanzas?.every(s=>s.mappings.length===0));
});
test('duplicate refrains without identity evidence retain both rule sets as unresolved',()=>{
  const source=c.initializePoemStanzas('chorus\n\nbridge\n\nchorus');
  source[0].mappings=[{original:'chorus',replacement:'dawn'}];
  source[2].mappings=[{original:'chorus',replacement:'dusk'}];
  const result=c.reconcileStanzaEntries(['chorus','bridge','chorus'],source);
  assert.equal(result.reconciled[0].mappings.length,0);
  assert.equal(result.reconciled[2].mappings.length,0);
  assert.deepEqual(result.unresolved.map(s=>s.id),[source[0].id,source[2].id]);
  const explicit=c.reconcileStanzaEntries(['chorus','bridge','chorus'],source,{stanzaIds:source.map(s=>s.id)});
  assert.deepEqual(explicit.reconciled.map(s=>s.mappings),source.map(s=>s.mappings));
});
test('reorder plus edit never assigns an unmatched old stanza by position',()=>{
  const result=c.reconcileStanzaEntries(['love at dusk','new stanza at dawn','love at noon'],entries);
  assert.equal(result.reconciled[0].id,entries[2].id);
  assert.equal(result.reconciled[2].id,entries[1].id);
  assert.equal(result.reconciled[1].mappings.length,0);
  assert.equal(result.unresolved[0].id,entries[0].id);
});
test('insert/delete with unchanged count keeps removed rules detached',()=>{
  const result=c.reconcileStanzaEntries(['brand new','love at noon','love at dusk'],entries);
  assert.equal(result.reconciled[0].mappings.length,0);
  assert.deepEqual(result.unresolved,[entries[0]]);
});
test('external split and merge preserve uncertain rules instead of guessing identity',()=>{
  const split=c.reconcileStanzaEntries(['love','at dawn','love at noon','love at dusk'],entries);
  assert.deepEqual(split.unresolved,[entries[0]]);
  assert.equal(split.reconciled[0].mappings.length,0);
  const merged=c.reconcileStanzaEntries(['love at dawn love at noon','love at dusk'],entries);
  assert.deepEqual(merged.unresolved,entries.slice(0,2));
  assert.equal(merged.reconciled[0].mappings.length,0);
});
test('repeated save/reopen retains duplicate-stanza snapshot and unresolved data',()=>{
  const source=c.initializePoemStanzas('chorus\n\nchorus');
  source[0].mappings=[{original:'chorus',replacement:'dawn'}];
  source[1].mappings=[{original:'chorus',replacement:'dusk'}];
  const content='chorus\n\nchorus';
  let saved:c.PoemCipherMetadata={scope:'per_stanza',stanzas:source,unresolved_stanzas:meta.unresolved_stanzas,
    stanza_snapshot:c.computeTextFingerprint(content)};
  for(let i=0;i<3;i++) saved=c.reconcilePoemCipherMetadata(content,JSON.parse(JSON.stringify(saved)));
  assert.deepEqual(saved.stanzas?.map(e=>[e.id,e.mappings]),source.map(e=>[e.id,e.mappings]));
  assert.deepEqual(saved.unresolved_stanzas,meta.unresolved_stanzas);
});
test('duplicate or contradictory identity evidence never duplicates UUIDs',()=>{
  const bad=[structuredClone(entries[0]),structuredClone(entries[0])];
  const result=c.reconcileStanzaEntries(['love at dawn','love at dawn'],bad,{stanzaIds:[entries[0].id,entries[0].id]});
  assert.notEqual(result.reconciled[0].id,result.reconciled[1].id);
  assert.ok(result.reconciled.every(s=>s.mappings.length===0));
  assert.equal(result.unresolved.length,2);
});
test('merge cancellation retains original state; explicit resolution archives both rule sets',()=>{
  const before=structuredClone(entries);
  const pending=c.mergeStanzaEntries(entries,0);
  assert.equal(pending.merged,false);
  assert.equal(pending.conflicts?.conflictingWords[0].original,'love');
  assert.deepEqual(pending.entries,before);
  assert.deepEqual(pending.unresolved,entries.slice(0,2));
  assert.throws(()=>c.mergeStanzaEntries(entries,0,{}),/Explicit resolution/);
  assert.deepEqual(entries,before);
  const resolved=c.mergeStanzaEntries(entries,0,{love:'silence'});
  assert.equal(resolved.merged,true);
  assert.equal(resolved.entries.length,2);
  assert.equal(resolved.entries[0].mappings[0].replacement,'silence');
  assert.deepEqual(resolved.unresolved,entries.slice(0,2));
});
test('non-conflicting merge combines mappings and retains original recovery records',()=>{
  const source=structuredClone(entries);source[1].mappings=[{original:'moon',replacement:'silver'}];
  const merged=c.mergeStanzaEntries(source,0);
  assert.equal(merged.merged,true);
  assert.equal(merged.conflicts,null);
  assert.deepEqual(merged.entries[0].mappings,[...source[0].mappings,...source[1].mappings]);
  assert.deepEqual(merged.unresolved,source.slice(0,2));
});
test('legacy v1 package envelope and algorithm survive disk import',()=>{
  const legacy=c.createCipherKey({mode:'manual',sourceText:'love',mappings:[{original:'love',replacement:'ember'}]});
  const pkg=c.createCipherPackage({poemTitle:'Legacy',encodedText:legacy.encodeResult.encodedText,key:legacy.key});
  const path=fileURL('legacy.mccipher');writeFileSync(path,JSON.stringify(pkg));
  const back=c.decodeCipherPackage(readFileSync(path,'utf8'));
  assert.equal(back.packageData.version,1);assert.equal(back.packageData.algorithm_version,'1.0');
  assert.equal(back.decodeResult.decodedText,'love');
});
test('mismatched package algorithms are rejected and missing per-stanza algorithms default to 2.0',()=>{
  const pkg=c.createCipherPackage({poemTitle:'RC',encodedText:encoded.encodedText,key});
  assert.throws(()=>c.validateCipherPackage({...pkg,algorithm_version:'1.0'}),/algorithm version does not match/);
  assert.equal(c.validateCipherKey({...key,algorithm_version:undefined}).algorithm_version,'2.0');
});
test('unsupported or malformed recovery metadata is rejected rather than discarded',()=>{
  assert.throws(()=>c.validateCipherKey({...key,recovery_version:99}),/recovery_version/);
  assert.throws(()=>c.validateCipherKey({...key,unresolved_stanzas:'lost'}),/unresolved_stanzas/);
  assert.throws(()=>c.validateCipherKey({...key,per_stanza_backup:[{...entries[0],id:''}]}),/identity/);
  assert.throws(()=>c.validateCipherKey({...key,whole_poem_backup:{mappings:'lost'}}),/mappings/);
  assert.throws(()=>c.validateCipherKey({...key,stanzas:[{...entries[0],mappings:[{original:7,replacement:'x'}]}]}),/string/);
  assert.throws(()=>c.validateCipherKey({...key,per_stanza_backup:[{...entries[0],future_recovery_field:'keep'}]}),/Unsupported/);
});
test('recovery reassignment retains conflicting alternatives and never clears them silently',()=>{
  const before=structuredClone(meta);
  const result=c.reassignUnresolvedMappings([{original:'lost',replacement:'different'}],meta.unresolved_stanzas!);
  assert.deepEqual(result.unresolved,meta.unresolved_stanzas);
  assert.equal(result.mappings[0].replacement,'different');
  const moved=c.reassignUnresolvedMappings([],meta.unresolved_stanzas!);
  assert.deepEqual(moved.mappings,meta.unresolved_stanzas![0].mappings);
  assert.deepEqual(moved.unresolved,[]);
  assert.deepEqual(meta,before);
});
test('Whole Poem coordinated edits update the authoritative backup before save/reopen',()=>{
  const content='chorus\n\nchorus';
  const source=c.initializePoemStanzas(content);
  source[0].mappings=[{original:'chorus',replacement:'dawn'}];
  source[1].mappings=[{original:'chorus',replacement:'dusk'}];
  const moved=c.moveStanzaEntry(source,0,1);
  let whole:c.PoemCipherMetadata={scope:'whole_poem',per_stanza_backup:moved,
    mappings:[{original:'chorus',replacement:'unified'}],stanza_snapshot:c.computeTextFingerprint(content)};
  whole=c.reconcilePoemCipherMetadata(content,whole);
  assert.equal(whole.stanzas,undefined);
  const reopened=JSON.parse(JSON.stringify(whole));
  const restored=c.switchCipherScope(reopened,'per_stanza',c.splitPoemStanzas(content)).nextMeta;
  assert.deepEqual(restored.stanzas?.map(s=>[s.id,s.mappings]),moved.map(s=>[s.id,s.mappings]));
  const external=c.reconcilePoemCipherMetadata('changed\n\nchorus',{...whole,stanza_snapshot:undefined});
  assert.ok(external.unresolved_stanzas?.some(s=>s.id===moved[0].id));
});
test('inserted empty stanza slots retain identity through save, key packaging and decode',()=>{
  const source=['love at dawn','','love at dusk'];
  const content=c.serializePoemStanzas(source);
  const initial=c.initializePoemStanzas('love at dawn\n\nlove at dusk');
  initial[0].mappings=[{original:'love',replacement:'ember'}];
  initial[1].mappings=[{original:'love',replacement:'home'}];
  const inserted=c.insertStanzaEntry(initial,1);
  const saved=c.reconcilePoemCipherMetadata(content,{scope:'per_stanza',stanzas:inserted,stanza_snapshot:c.computeTextFingerprint(content)});
  assert.deepEqual(c.poemStanzasFromMetadata(content,saved),source);
  assert.deepEqual(saved.stanzas?.map(s=>s.id),inserted.map(s=>s.id));
  assert.deepEqual(saved.unresolved_stanzas,[]);
  const transformed=c.encodePoemWithStanzas(source,saved.stanzas!);
  const portable=c.validateCipherKey({version:2,algorithm_version:'2.0',id:'empty-slot',name:'Empty slot',
    scope:'per_stanza',mappings:[],stanzas:saved.stanzas,source_fingerprint:transformed.sourceFingerprint,
    encoded_fingerprint:transformed.encodedFingerprint});
  const pkg=c.createCipherPackage({poemTitle:'Empty slot',encodedText:transformed.encodedText,key:portable});
  assert.equal(c.decodeCipherPackage(JSON.stringify(pkg)).decodeResult.decodedText,content);
  const bound=c.cipherMetadataFromKey(portable,transformed.encodedText);
  assert.deepEqual(c.poemStanzasFromMetadata(transformed.encodedText,bound),transformed.encodedStanzas);
  const reopened=c.reconcilePoemCipherMetadata(transformed.encodedText,JSON.parse(JSON.stringify(bound)));
  assert.deepEqual(reopened.stanzas?.map(s=>s.id),inserted.map(s=>s.id));
});
test('metadata reconciliation and cipher package decoding retain verse indentation',()=>{
  const content='  love at dawn  \n\n    love at dusk';
  const source=c.splitPoemStanzas(content,true);
  const initial=c.initializePoemStanzas(content);
  initial.forEach((entry,i)=>entry.mappings=[{original:'love',replacement:i?'home':'ember'}]);
  const saved=c.reconcilePoemCipherMetadata(content,{scope:'per_stanza',stanzas:initial,stanza_snapshot:c.computeTextFingerprint(content)});
  assert.deepEqual(c.poemStanzasFromMetadata(content,saved),source);
  const transformed=c.encodePoemWithStanzas(source,saved.stanzas!);
  const portable=c.validateCipherKey({version:2,algorithm_version:'2.0',id:'indented',name:'Indented',scope:'per_stanza',mappings:[],
    stanzas:saved.stanzas,source_fingerprint:transformed.sourceFingerprint,encoded_fingerprint:transformed.encodedFingerprint});
  const pkg=c.createCipherPackage({poemTitle:'Indentation',encodedText:transformed.encodedText,key:portable});
  assert.equal(c.decodeCipherPackage(JSON.stringify(pkg)).decodeResult.decodedText,content);
});

