import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('public demo switches roles and confirms one version without API requests', async () => {
  const listeners = new Map(), elements = new Map(), requests = [];
  const element = id => {
    if (!elements.has(id)) elements.set(id, {
      innerHTML:'', textContent:'', hidden:false, scrollTop:0, attributes:{},
      setAttribute(name, value) {this.attributes[name] = value;}
    });
    return elements.get(id);
  };
  element('runtime-config').content = 'static';
  globalThis.document = {getElementById:element, querySelectorAll:() => [], addEventListener:(name, fn) => listeners.set(name, fn)};
  globalThis.window = {addEventListener:() => {}};
  globalThis.fetch = async url => {
    requests.push(url);
    assert.equal(url, './catalog.json', 'The public demo must never contact the API');
    return {ok:true, json:async () => JSON.parse(readFileSync(new URL('../web/catalog.json', import.meta.url)))};
  };
  await import('../web/app.js');
  const click = dataset => listeners.get('click')({target:{closest:() => ({dataset, disabled:false, isConnected:false})}});
  assert.match(element('api-status').textContent, /공개 체험/);
  assert.match(element('mode-description').textContent, /서버에 저장하지/);
  await click({scenario:'compare'});
  await click({viewRole:'parent'});
  assert.equal(element('demo-phones').attributes['data-view'], 'parent');
  await click({action:'consent'});
  await click({action:'finalize'});
  assert.doesNotMatch(element('child-screen').innerHTML, /일정 v1/);
  await click({action:'person', person:'dad'});
  await click({action:'consent'});
  await click({viewRole:'child'});
  assert.equal(element('demo-phones').attributes['data-view'], 'child');
  await click({action:'finalize'});
  for (const id of ['child-screen','parent-screen']) assert.match(element(id).innerHTML, /일정 v1/);
  await click({action:'rest'});
  listeners.get('change')({target:{id:'completed-count', value:'1', dataset:{}}});
  await click({action:'prepare-change'});
  await click({action:'change-consent'});
  await click({action:'person', person:'mom'});
  await click({action:'change-consent'});
  await click({action:'apply-change'});
  for (const id of ['child-screen','parent-screen']) assert.match(element(id).innerHTML, /일정 v2/);
  assert.deepEqual(requests, ['./catalog.json']);
});
