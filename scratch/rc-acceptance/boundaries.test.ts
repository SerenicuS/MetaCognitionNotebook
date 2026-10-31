import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, readFileSync } from 'node:fs';
import * as c from '../../src/utils/emotionalCipher.ts';

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
writeFileSync(new URL('./v2.mckey',import.meta.url),JSON.stringify(key,null,2));
writeFileSync(new URL('./poem-meta.json',import.meta.url),JSON.stringify(meta,null,2));

test('mcpoem filesystem boundary retains complete backups and unresolved metadata',()=>{
  const out=c.serializePoemExport({title:'RC disposable',content:text,cipherMeta:meta as any},'mcpoem');
  const file=new URL('./three-stanzas.mcpoem',import.meta.url);writeFileSync(file,out.content);
  const back=c.parsePoemImport(out.filename,readFileSync(file,'utf8'));
  assert.deepEqual(back.cipher,meta);
});
test('v2 mccipher filesystem boundary decodes all three independent mappings',()=>{
  const pkg=c.createCipherPackage({poemTitle:'RC',encodedText:encoded.encodedText,key});
  const file=new URL('./three-stanzas.mccipher',import.meta.url);writeFileSync(file,JSON.stringify(pkg));
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
