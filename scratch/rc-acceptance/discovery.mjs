// Node test reporter: inventory actual completed tests by originating file.
export default async function* (source) {
  const files=new Map();
  for await (const event of source) {
    if(event.type==='test:pass'||event.type==='test:fail') {
      const d=event.data;
      const key=d.file||'<runner>';
      const item=files.get(key)||{tests:0,suites:0,failed:0};
      if(d.details?.type==='suite')item.suites++;else item.tests++;
      if(event.type==='test:fail') {
        item.failed++;
        const error=d.details?.error;
        yield JSON.stringify({failure:{name:d.name,file:d.file,error:{...error,message:error?.message,stack:error?.stack,cause:error?.cause?.message}}})+'\n';
      }
      files.set(key,item);
    }
    if(event.type==='test:summary'&&!event.data.file) yield JSON.stringify({summary:event.data})+'\n';
  }
  for(const [file,counts] of [...files].sort())yield JSON.stringify({file,...counts})+'\n';
}
