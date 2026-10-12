import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {buildPlan, remainingPlan, exampleDraft, initialDraft, escapeText} from '../web/planner.js';

const data = JSON.parse(readFileSync(new URL('../web/catalog.json',import.meta.url)));

test('Python and JavaScript return identical results across planning failures and changes',() => {
  const cases = [];
  for (const name of ['normal','tight','unknown','skip','missing','disagree','essential-market','budget','conversation','unconfirmed','meal-conflict']) {
    const draft = exampleDraft();
    if(name === 'tight'){draft.config.walk_limit = 250;draft.config.continuous_limit = 60;}
    if(name === 'unknown')draft.unknown_ids = ['fan'];
    if(name === 'skip'){draft.responses.dad.fan = 'skip';draft.essentials.dad = [];}
    if(name === 'missing')delete draft.responses.mom.market;
    if(name === 'disagree'){draft.responses.dad.fan = 'no';draft.essentials.dad = [];}
    if(name === 'essential-market')draft.essentials.mom.push('market');
    if(name === 'budget')draft.config.budget = 60000;
    if(name === 'conversation')draft.sources.mom = 'conversation';
    if(name === 'unconfirmed')draft.sources.dad = 'unconfirmed';
    if(name === 'meal-conflict')draft.responses.dad.rice = 'no';
    cases.push({name,draft,key:'A'}, {name,draft,key:'B'});
  }
  cases.push({name:'incomplete',draft:initialDraft(),key:'A'});
  const python = spawnSync(process.env.PYTHON || 'python',['-X','utf8','-c','import json,sys; from backend.planner import build_plan; print(json.dumps([build_plan(c["draft"],c["key"]) for c in json.load(sys.stdin)]))'],{input:JSON.stringify(cases),encoding:'utf8'});
  assert.equal(python.status,0,python.stderr);
  const expected = JSON.parse(python.stdout);
  cases.forEach((c,i) => assert.deepEqual(buildPlan(c.draft,c.key,data),expected[i],c.name));
  const draft = exampleDraft(),original = buildPlan(draft,'A',data);
  const changes = [{ids:[],walk:1200,continuous:300},{ids:['market','rice'],walk:300,continuous:100},{ids:['market','rice'],walk:100,continuous:60}];
  const changed = spawnSync(process.env.PYTHON || 'python',['-X','utf8','-c','import json,sys; from backend.planner import remaining_plan; x=json.load(sys.stdin); print(json.dumps([remaining_plan(x["draft"],x["original"],c["ids"],c["walk"],c["continuous"]) for c in x["changes"]]))'],{input:JSON.stringify({draft,original,changes}),encoding:'utf8'});
  assert.equal(changed.status,0,changed.stderr);
  changes.forEach((c,i) => assert.deepEqual(remainingPlan(draft,original,c.ids,c.walk,c.continuous,data),JSON.parse(changed.stdout)[i]));
});

test('input is escaped and a completed visit cannot be skipped in the prefix',() => {
  assert.equal(escapeText('<img onerror="x">'),'&lt;img onerror=&quot;x&quot;&gt;');
  assert.throws(() => remainingPlan(exampleDraft(),buildPlan(exampleDraft(),'A',data),['fan'],300,100,data));
});
