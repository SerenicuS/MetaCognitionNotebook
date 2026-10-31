import { spawn } from 'node:child_process';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const label = process.argv[2] || 'result';
const profile = await mkdtemp(join(tmpdir(), 'mc-echo-browser-'));
const browser = spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', [
  '--headless', '--disable-gpu', '--no-first-run', '--disable-background-networking', '--disable-sync',
  `--user-data-dir=${profile}`, '--remote-debugging-port=0', '--window-size=1280,1000', 'about:blank',
], { windowsHide: true, stdio: 'ignore' });
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
let socket, serial = 0;
const pending = new Map(), exceptions = [];
function call(method, params = {}, sessionId) {
  const id = ++serial;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
}
try {
  let port;
  for (let i = 0; i < 100; i++) {
    try { port = (await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).trim().split('\n'); break; }
    catch { await sleep(100); }
  }
  if (!port) throw new Error('Headless browser did not start');
  socket = new WebSocket(`ws://127.0.0.1:${port[0]}${port[1]}`);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  socket.onmessage = event => {
    const message = JSON.parse(event.data);
    if (message.method === 'Runtime.exceptionThrown') exceptions.push(message.params.exceptionDetails);
    const waiting = pending.get(message.id);
    if (waiting) { pending.delete(message.id); message.error ? waiting.reject(message.error) : waiting.resolve(message.result); }
  };
  const { targetId } = await call('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await call('Target.attachToTarget', { targetId, flatten: true });
  await call('Runtime.enable', {}, sessionId);
  await call('Page.enable', {}, sessionId);
  await call('Page.navigate', { url: 'http://127.0.0.1:5187/tests/browser/echo-nested.html' }, sessionId);
  let result;
  for (let i = 0; i < 180; i++) {
    const evaluated = await call('Runtime.evaluate', {
      expression: "({ title: document.title, results: document.getElementById('results')?.textContent })", returnByValue: true,
    }, sessionId);
    result = evaluated.result.value;
    if (/^(PASS|FAIL):/.test(result?.title)) break;
    if (exceptions.length) break;
    await sleep(500);
  }
  await writeFile(`scratch/echo-refresh-regression/${label}.json`, JSON.stringify({ ...result, exceptions }, null, 2));
  console.log(JSON.stringify({ ...result, exceptions }, null, 2));
  process.exitCode = result?.title?.startsWith('PASS:') && exceptions.length === 0 ? 0 : 1;
} finally {
  if (socket?.readyState === WebSocket.OPEN) { await call('Browser.close').catch(() => {}); socket.close(); }
  else browser.kill();
}
