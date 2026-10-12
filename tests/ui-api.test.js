import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';

test('connected UI persists and confirms with the real Python service without sending photos',async () => {
  const temp = mkdtempSync(join(tmpdir(),'family-trip-test-'));
  const listeners = new Map(),els = new Map(),requests = [];
  const element = id => {if(!els.has(id))els.set(id,{innerHTML:'',textContent:'',hidden:false,scrollTop:0});return els.get(id);};
  globalThis.document = {getElementById:element,querySelectorAll:() => [],addEventListener:(name,fn) => listeners.set(name,fn)};
  globalThis.window = {addEventListener:() => {},print:() => {}};
  globalThis.fetch = async (url,options={}) => {
    if(url === './catalog.json')return {ok:true,json:async () => JSON.parse(readFileSync(new URL('../web/catalog.json',import.meta.url)))};
    requests.push({url,options});
    const input = {database:join(temp,'trips.sqlite3'),method:options.method || 'GET',path:url,body:options.body ? JSON.parse(options.body) : null,token:options.headers?.['X-Trip-Token'] || null};
    const python = spawnSync(process.env.PYTHON || 'python',['-c','import json,sys; from backend.service import Service; from backend.store import Store; x=json.load(sys.stdin); print(json.dumps(Service(Store(x["database"])).handle(x["method"],x["path"],x["body"],x["token"])))'],{input:JSON.stringify(input),encoding:'utf8'});
    assert.equal(python.status,0,python.stderr);
    return {ok:true,json:async () => JSON.parse(python.stdout)};
  };
  const click = async (dataset,id) => listeners.get('click')({target:{closest:() => ({id,dataset,disabled:false,isConnected:false})}});
  try {
    await import('../web/app.js');
    assert.match(element('api-status').textContent,/로컬 API 연결/);
    await click({scenario:'compare'});
    await click({action:'consent'});
    await click({action:'person',person:'dad'});
    await click({action:'consent'});
    await click({action:'finalize'});
    assert.match(element('parent-screen').innerHTML,/일정 v1/);
    assert.ok(requests.some(r => r.url.endsWith('/confirm')));
    await click({action:'rest'});
    listeners.get('change')({target:{id:'completed-count',value:'2',dataset:{}}});
    await click({action:'prepare-change'});
    await click({action:'change-consent'});
    await click({action:'person',person:'mom'});
    await click({action:'change-consent'});
    await click({action:'apply-change'});
    assert.match(element('parent-screen').innerHTML,/일정 v2/);
    assert.ok(requests.some(r => r.url.endsWith('/change')));
    assert.ok(requests.every(r => !r.options.body || !/"(?:photos|memoryPhoto|caption)"/.test(r.options.body)));
    await click({},'reset-demo');
    assert.ok(requests.some(r => r.options.method === 'DELETE'));
  } finally {rmSync(temp,{recursive:true,force:true});}
});
