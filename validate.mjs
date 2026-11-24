import {readFile,stat} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const root=new URL('./',import.meta.url);
const manifest=JSON.parse(await readFile(new URL('data/manifest.json',root),'utf8'));
const unique=new Map(Object.values(manifest.routes).map(entry=>[entry.url,entry]));
await Promise.all([...unique.values()].map(async entry=>{
  const path=new URL('.'+entry.url,root);
  assert.ok((await stat(path)).isFile(),`Missing ${fileURLToPath(path)}`);
}));
assert.equal(manifest.counts.jobs,5);
assert.equal(manifest.counts.trials,549);
assert.equal(manifest.counts.trajectories,489);
assert.ok((await readFile(new URL('index.html',root),'utf8')).includes('static-v1'));
console.log(`Static site validated: ${manifest.counts.jobs} jobs, ${manifest.counts.trials} trials, ${manifest.counts.trajectories} trajectories, ${unique.size} data files.`);
