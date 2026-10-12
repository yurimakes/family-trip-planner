export const PARENTS = ['mom', 'dad'];

export function initialDraft() {
  return {
    candidates: ['tea', 'fan', 'rice', 'market'],
    responses: {mom: {}, dad: {}}, essentials: {mom: [], dad: []},
    sources: {mom: 'unconfirmed', dad: 'unconfirmed'}, unknown_ids: [],
    config: {walk_limit: 1200, continuous_limit: 300, budget: 200000, avoid_stairs: true, mild_food: true}
  };
}

export function exampleDraft() {
  const draft = initialDraft();
  for (const parent of PARENTS) {
    draft.responses[parent] = Object.fromEntries(draft.candidates.map(id => [id, 'yes']));
    draft.essentials[parent] = ['fan'];
    draft.sources[parent] = 'direct';
  }
  return draft;
}

export function metrics(mode) {
  let low = 0, high = 0, block = 0, longest = 0;
  for (const segment of mode.segments) {
    low += segment.walk[0]; high += segment.walk[1]; block += segment.walk[1];
    longest = Math.max(longest, block);
    if (segment.break_after) block = 0;
  }
  return {walk: [low, high], continuous: longest, cost: mode.cost};
}

function selectionIssues(draft, places) {
  const issues = [];
  for (const parent of PARENTS) {
    if (draft.sources[parent] === 'unconfirmed' || draft.candidates.some(id => !draft.responses[parent][id])) issues.push({code: 'RESPONSES_REQUIRED', parent});
  }
  for (const kind of ['meal', 'rest']) {
    if (!places.some(p => p.kind === kind && PARENTS.every(r => draft.responses[r][p.id] === 'yes'))) issues.push({code: 'COMMON_CHOICE_REQUIRED', kind});
  }
  if (!places.some(p => p.kind === 'sight' && PARENTS.some(r => draft.responses[r][p.id] === 'yes'))) issues.push({code: 'SIGHT_CHOICE_REQUIRED'});
  return issues;
}

function evaluate(draft, rows, key, baseIssues, data) {
  const issues = [...baseIssues];
  let low = 0, high = 0, costLow = 0, costHigh = 0, longest = 0;
  const included = new Set(rows.map(r => r.id));
  for (const parent of PARENTS) for (const id of draft.essentials[parent]) {
    if (!included.has(id)) issues.push({code: 'ESSENTIAL_MISSING', parent, id});
  }
  for (const row of rows) {
    const place = data.places.find(p => p.id === row.id), m = metrics(row.mode);
    low += m.walk[0]; high += m.walk[1]; costLow += m.cost[0]; costHigh += m.cost[1]; longest = Math.max(longest, m.continuous);
    if (row.completed) continue;
    if (draft.unknown_ids.includes(row.id) || place.access === 'unknown') issues.push({code: 'ACCESS_UNKNOWN', id: row.id});
    if (draft.config.avoid_stairs && row.mode.stairs) issues.push({code: 'STAIRS_CONFLICT', id: row.id});
    if (row.start < place.open[0] || row.end > place.open[1]) issues.push({code: 'OPENING_CONFLICT', id: row.id});
    if (row.kind === 'meal') {
      if (row.arrival > data.meal_minutes) issues.push({code: 'RESERVATION_CONFLICT', id: row.id});
      if (draft.config.mild_food && !place.mild_food) issues.push({code: 'MEAL_CONFLICT', id: row.id});
    }
    for (const parent of PARENTS) if (draft.responses[parent][row.id] !== 'yes') issues.push({code: 'PREFERENCE_CHECK_REQUIRED', parent, id: row.id});
  }
  const c = draft.config;
  if (high > c.walk_limit) issues.push({code: 'DAILY_WALK_EXCEEDED', actual: high, limit: c.walk_limit});
  if (longest > c.continuous_limit && key !== 'R') issues.push({code: 'CONTINUOUS_WALK_EXCEEDED', actual: longest, limit: c.continuous_limit});
  if (costHigh > c.budget) issues.push({code: 'BUDGET_EXCEEDED', actual: costHigh, limit: c.budget});
  return {key, valid: issues.length === 0, issues, walk: [low, high], continuous: longest, cost: [costLow, costHigh], rows, omitted: [], data_status: 'synthetic'};
}

export function buildPlan(draft, key, data) {
  if (!['A', 'B'].includes(key)) throw new Error('unknown plan');
  const places = data.places.filter(p => draft.candidates.includes(p.id));
  const essential = new Set(PARENTS.flatMap(p => draft.essentials[p]));
  const sights = places.filter(p => p.kind === 'sight' && PARENTS.some(r => draft.responses[r][p.id] === 'yes'));
  let wanted = key === 'A' ? sights : sights.filter(p => essential.has(p.id));
  if (key === 'B' && !wanted.length) wanted = sights.filter(p => PARENTS.every(r => draft.responses[r][p.id] === 'yes')).slice(0, 1);
  const choose = kind => {
    const common = places.filter(p => p.kind === kind && PARENTS.every(r => draft.responses[r][p.id] === 'yes'));
    return common.find(p => essential.has(p.id)) || common[0];
  };
  const meal = choose('meal'), rest = choose('rest');
  const ordered = [...wanted.filter(p => p.bucket === 'morning'), ...(meal ? [meal] : []), ...wanted.filter(p => p.bucket !== 'morning'), ...(rest ? [rest] : [])];
  let current = data.start_minutes;
  const rows = ordered.map((p, i) => {
    const mode = p.modes[key === 'A' ? 0 : 1];
    const arrival = current + (i ? data.transfer_minutes : 0);
    const start = p.kind === 'meal' ? data.meal_minutes : arrival;
    current = start + mode.minutes;
    return {id: p.id, name: p.name, experience: p.experience, kind: p.kind, mode, arrival, start, end: current, completed: false};
  });
  const result = evaluate(draft, rows, key, selectionIssues(draft, places), data);
  result.omitted = sights.filter(p => !wanted.includes(p)).map(p => p.id);
  return result;
}

export function remainingPlan(draft, original, completedIds, walkLimit, continuousLimit, data) {
  if (!Number.isInteger(walkLimit) || walkLimit < 1 || walkLimit > 10000 || !Number.isInteger(continuousLimit) || continuousLimit < 1 || continuousLimit > 3000) throw new Error('invalid remaining limits');
  if (!Array.isArray(completedIds) || completedIds.length > original.rows.length || completedIds.some((id, i) => original.rows[i].id !== id)) throw new Error('completed visits must be an ordered prefix');
  let current = data.start_minutes;
  const rows = original.rows.map((old, i) => {
    const row = {...old, completed: completedIds.includes(old.id)};
    if (!row.completed) {
      const mode = data.places.find(p => p.id === row.id).modes[1];
      const arrival = current + (i ? data.transfer_minutes : 0);
      const start = row.kind === 'meal' ? data.meal_minutes : arrival;
      Object.assign(row, {mode, arrival, start, end: start + mode.minutes});
    }
    current = row.end;
    return row;
  });
  const result = evaluate(draft, rows, 'R', [], data);
  const rest = rows.filter(r => !r.completed).map(r => metrics(r.mode));
  const done = rows.filter(r => r.completed).map(r => metrics(r.mode));
  result.remaining_walk = [0, 1].map(i => rest.reduce((sum, m) => sum + m.walk[i], 0));
  result.completed_walk = [0, 1].map(i => done.reduce((sum, m) => sum + m.walk[i], 0));
  result.remaining_continuous = Math.max(0, ...rest.map(m => m.continuous));
  if (result.remaining_walk[1] > walkLimit) result.issues.push({code: 'REMAINING_WALK_EXCEEDED', actual: result.remaining_walk[1], limit: walkLimit});
  if (result.remaining_continuous > continuousLimit) result.issues.push({code: 'CONTINUOUS_WALK_EXCEEDED', actual: result.remaining_continuous, limit: continuousLimit});
  result.valid = result.issues.length === 0;
  return result;
}

export function escapeText(value) {
  return String(value).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
}
