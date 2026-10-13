import {icon} from './icons.js';
import {PARENTS, initialDraft, exampleDraft, buildPlan, remainingPlan, metrics, escapeText as esc} from './planner.js';

const $ = id => document.getElementById(id);
const staticMode = $('runtime-config')?.content === 'static';
let viewRole = 'child';
const people = {mom: '어머니', dad: '아버지'};
const kinds = {sight: '관광', meal: '식사', rest: '휴식'};
const labels = {yes: 'O 좋아요', no: 'X 다른 게 좋아요', skip: '건너뜀'};
const contexts = [
  ['자녀가 큰틀을 준비해요', '가상 후보에서 관광·식사·휴식을 추리고 부모님과 확인한 보행·식사 조건을 설정한다.'],
  ['부모님은 몇 장의 사진 카드에서 골라요', '두 분의 응답을 각각 기록한다. 좋아한 경험은 필수로 표시하고 직접 선택·대화 확인을 구분한다.'],
  ['선택한 경험을 지키는 두 안을 비교해요', '가족이 원하는 경험과 식사 시간을 유지하며 관람 방식·보행 범위·비용 변화를 비교한다.'],
  ['확인한 여행을 함께 안내해요', '자녀와 부모님에게 같은 일정 버전을 표시한다. 방문 이유·식사·휴식을 한 장으로 인쇄할 수 있다.'],
  ['이미 다녀온 구간은 그대로 두어요', '완료한 구간을 지정하고 남은 구간만 짧은 접근으로 다시 검사한다. 이미 걸은 거리도 하루 합계에 포함한다.'],
  ['여행의 기대와 추억을 카드로 남겨요', '기본 캐릭터와 사용자가 고른 사진으로 초대·추억 카드를 만든다. 생성형 AI 사진 변환은 후속 연동이다.']
];
let data, apiAvailable = false, serverTrip = null;
const objectUrls = new Set();
const initial = () => ({draft: initialDraft(), step: 1, prepared: false, person: 'mom', index: {mom: 0, dad: 0}, selected: 'A', consent: {mom: false, dad: false}, confirmed: null, version: 0, change: null, changeConsent: {mom: false, dad: false}, completedCount: 0, remainingLimit: 300, continuousLimit: 100, photos: {}, memoryPhoto: null, photoConsent: false, generated: false, style: 'basic', kind: 'invite', caption: '함께 고르고, 함께 남긴 하루', dirty: true, sample: false, category: 'all'});
let s = initial();
const place = id => data.places.find(p => p.id === id);
const chosen = () => s.draft.candidates.map(place);
const complete = parent => s.draft.candidates.every(id => s.draft.responses[parent][id]);
const plan = key => buildPlan(s.draft, key, data);
const all = obj => PARENTS.every(p => obj[p]);
const range = value => `${value[0].toLocaleString()}–${value[1].toLocaleString()}`;
const clock = minutes => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
const required = id => PARENTS.some(p => s.draft.essentials[p].includes(id));
const btn = (action, label, disabled = false, extra = '', cls = '') => `<button class="app-button ${cls}" data-action="${action}" ${disabled ? 'disabled' : ''} ${extra}>${label}</button>`;
const status = (text, warn = false) => `<div class="app-status ${warn ? 'warn' : ''}">${text}</div>`;
const tabs = () => `<div class="choice">${PARENTS.map(p => `<button class="${s.person === p ? 'chosen' : ''}" data-action="person" data-person="${p}" aria-pressed="${s.person === p}">${people[p]}</button>`).join('')}</div>`;
function picture(p) {
  const photos = {tea:{file:'design-01.png',box:'1165 581 666 444'},fan:{file:'design-02.png',box:'1165 588 668 190'}};
  const reference = photos[p.id];
  let visual;
  if (s.photos[p.id]) visual = `<img src="${esc(s.photos[p.id])}" alt="${esc(p.name)} · 사용자가 선택한 사진">`;
  else if (reference) visual = `<svg viewBox="${reference.box}" preserveAspectRatio="xMidYMid slice" role="img" aria-label="${esc(p.name)} · 디자인 예시 사진"><image href="assets/design/${reference.file}" width="2048" height="1937"/></svg>`;
  else visual = `<img src="${esc(p.illustration)}" alt="${esc(p.name)} · 가상 예시 일러스트">`;
  return `<div class="picture ${reference ? 'photo-reference' : ''}">${visual}<span>${s.photos[p.id] ? '직접 넣은 사진' : reference ? '디자인 예시 사진' : '가상 예시 일러스트'}</span></div>`;
}
function app(role, body) {
  const child = role.includes('자녀');
  const titles = {1:'부모님 여행 준비',2:'부모님 선택 확인',3:'일정 비교',4:'같이온',5:'남은 일정 조정',6:'가족 추억 카드'};
  const header = child && s.step !== 4 ? `<button class="back-button" data-action="${s.step === 1 ? 'choices' : s.step === 6 ? 'guide' : 'setup'}" aria-label="이전 화면">${icon('back')}</button><b>${titles[s.step]}</b><span class="menu-dots" aria-hidden="true">···</span>` : `<div class="appbrand">같이온</div><span class="tag ${s.step === 4 ? 'version-pill' : 'grey'}">${s.step === 4 && s.confirmed ? `일정 v${s.version}` : role}</span>`;
  return `<div class="statusbar"><span>9:41</span><span class="notch" aria-hidden="true"></span><span class="system-icons" aria-hidden="true"><svg viewBox="0 0 48 16"><path d="M2 12h3v3H2zm5-3h3v6H7zm5-3h3v9h-3zm5-4h3v13h-3z"/><path d="M25 6q6-7 12 0m-10 3q4-5 8 0m-6 3q2-2 4 0" fill="none" stroke="currentColor" stroke-width="2"/></svg><span class="battery"></span></span></div><div class="appbar ${child && s.step !== 4 ? 'child-nav' : ''}">${header}</div><div class="app-body screen-${s.step}">${body}</div><div class="home-indicator" aria-hidden="true"></div>`;
}
function toast(message) {
  $('toast').textContent = message; $('toast').hidden = false;
  clearTimeout(toast.timer); toast.timer = setTimeout(() => $('toast').hidden = true, 3500);
}
function issueText(issue) {
  const name = issue.id ? place(issue.id).name : '';
  const parent = people[issue.parent] || '';
  return ({RESPONSES_REQUIRED: `${parent}의 응답·입력 출처 확인 필요`, COMMON_CHOICE_REQUIRED: `두 분이 함께 원하는 ${kinds[issue.kind]} 확인 필요`, SIGHT_CHOICE_REQUIRED: '여행에서 원하는 관광 경험 확인 필요', ESSENTIAL_MISSING: `${parent}의 필수 경험 누락: ${name}`, ACCESS_UNKNOWN: `${name}의 접근 정보 미확인`, STAIRS_CONFLICT: `${name}의 계단 회피 조건 충돌`, OPENING_CONFLICT: `${name}의 운영시간 충돌`, RESERVATION_CONFLICT: '12시 식사 예약과 도착 시간 충돌', MEAL_CONFLICT: '맵지 않은 식사 조건 확인 필요', PREFERENCE_CHECK_REQUIRED: `${parent}에게 ${name} 다시 확인`, DAILY_WALK_EXCEEDED: `하루 보행 ${issue.actual}m > ${issue.limit}m`, CONTINUOUS_WALK_EXCEEDED: `연속 보행 ${issue.actual}m > ${issue.limit}m`, BUDGET_EXCEEDED: `예산 ${issue.actual?.toLocaleString()}원 > ${issue.limit?.toLocaleString()}원`, REMAINING_WALK_EXCEEDED: `남은 보행 ${issue.actual}m > ${issue.limit}m`})[issue.code] || issue.code;
}
function source() {
  return `<details class="source-detail"><summary>${icon('info')} 거리와 정보의 근거</summary><p>장소·구간·거리·시간·비용은 가상 예시이다. 디자인 사진으로 실제 시설의 접근성이나 인물과의 관계가 확인되는 것은 아니다.</p><p>거리 범위의 최대값으로 조건을 검사한다. 확인된 좌석 휴식은 연속 보행을 나누며, 이미 걸은 거리와 하루 총보행은 그대로 포함한다.</p><p>실제 자료에는 출처 URL·확인일·측정/추정/미확인 상태가 필요하다. 팬심·작품 테마의 실제 장소 관계는 공식 안내로 별도 확인한다.</p></details>`;
}
function responses(parent) {
  return chosen().map(p => `<div class="response-line"><span>${esc(p.experience)}</span><b>${labels[s.draft.responses[parent][p.id]] || '미응답'}${s.draft.essentials[parent].includes(p.id) ? ' · ★ 필수' : ''}</b></div>`).join('');
}
function planCard(p, selectable = false) {
  const isRemaining = p.key === 'R';
  const title = p.key === 'A' ? '충분히 둘러보기' : p.key === 'B' ? '사진·휴식 중심' : '짧은 접근으로 남은 길';
  const current = s.selected === p.key;
  const same = p.rows.filter(r => required(r.id));
  return `<div class="plan-box ${current ? 'selected' : ''} ${isRemaining ? 'remaining-plan' : ''}"><div class="plan-heading"><span class="plan-letter">${p.key}</span><h4>${title}</h4>${current ? `<span class="selected-check">${icon('check')}</span>` : ''}</div><p class="metric-label">${isRemaining ? '완료 구간을 포함한 하루 걷기' : '하루 걷기'}</p><div class="metric">${range(p.walk)}<small>m</small></div><meter class="walk-meter" min="0" max="${Math.max(s.draft.config.walk_limit,p.walk[1])}" low="0" high="${s.draft.config.walk_limit}" optimum="0" value="${p.walk[1]}" aria-label="하루 보행 상한과 비교"></meter><p class="meter-caption">기준 ${s.draft.config.walk_limit}m</p><p class="continuous-stat ${p.continuous > s.draft.config.continuous_limit && !isRemaining ? 'over' : ''}">${icon(p.continuous > s.draft.config.continuous_limit && !isRemaining ? 'info' : 'check')} 한 번에 최대 <b>${p.continuous}m</b></p><div class="changes">${same.map(r => `<span>${esc(r.experience)} 유지</span>`).join('')}<span>점심 예약 · 앉아서 휴식 유지</span>${p.omitted.map(id => `<span class="lost">${esc(place(id).experience)} 생략</span>`).join('')}${p.key !== 'A' ? '<span class="lost">긴 관람 대신 짧은 접근</span>' : ''}</div><p class="plan-detail">${icon('clock')} 관람·식사·휴식 ${p.rows.reduce((sum,r) => sum+r.mode.minutes,0)}분<br>${icon('car')} 가족 비용 ${range(p.cost)}원</p>${p.remaining_walk ? status(`이미 걸은 거리 ${range(p.completed_walk)}m<br>남은 보행 ${range(p.remaining_walk)}m · 연속 ${p.remaining_continuous}m`) : ''}<span class="tag ${p.valid ? '' : 'orange'}">${p.valid ? '기준 안에 있어요' : '확인 필요'}</span>${p.issues.length ? `<p class="check-issues">${p.issues.map(i => esc(issueText(i))).join('<br>')}</p>` : ''}${selectable ? `<button class="mini-button" data-action="select-plan" data-plan="${p.key}" aria-pressed="${current}" ${p.valid ? '' : 'disabled'}>${current ? '선택한 안' : '이 안 선택'}</button>` : ''}</div>`;
}
function timeline(p) {
  return `<div class="timeline">${p.rows.map(r => `<div class="event ${r.completed ? 'completed' : ''}"><span class="time">${clock(r.start)}</span><span class="event-icon">${icon(r.kind === 'meal' ? 'food' : r.kind === 'rest' ? 'cup' : 'camera')}</span><div><b>${esc(r.experience)}${r.completed ? ' · 완료' : ''}</b><p>${r.kind === 'meal' ? '맵지 않은 메뉴 · 예약 유지' : r.kind === 'rest' ? '앉아서 쉬어요' : `${r.mode.id === 'short' ? '사진 구간만 짧게' : '함께 둘러보기'} · 걷기 ${range(metrics(r.mode).walk)}m`}<br>${clock(r.start)}–${clock(r.end)}</p><span class="tag ${required(r.id) ? 'essential-tag' : 'grey'}">${required(r.id) ? '★ 부모님이 꼭 원한 경험' : '함께 고른 곳'}</span></div></div>`).join('')}</div>`;
}
function setup() {
  const c = s.draft.config;
  const select = (id,label,options,value) => `<div class="field"><label for="${id}">${label}</label><select id="${id}">${options.map(([v,t]) => `<option value="${v}" ${v === value ? 'selected' : ''}>${t}</option>`).join('')}</select></div>`;
  const filtered = data.places.filter(p => s.category === 'all' || p.kind === s.category);
  return app('자녀 · 사전 설정', `<div class="prep-progress"><span>조건 정하기</span><span class="current">후보 고르기</span><span>부모님 확인</span></div><h3>부모님께 보여드릴<br>후보를 골라주세요</h3><p class="intro-text">가상 후보 ${data.places.length}곳을 준비했어요. 최대 4곳을 보여드려요.</p><div class="condition-chips"><span>${icon('music')} 팬심 테마</span><span>${icon('car')} 차량 동반</span><span>${icon('walk')} 하루 ${c.walk_limit}m</span></div><details class="settings-panel"><summary>여행 조건 수정</summary>${status('가상 국내 권역 · 부모님 2명 + 자녀 1명<br>12시 식사 예약')}${select('budget','가족 예산',[[150000,'15만원'],[200000,'20만원'],[300000,'30만원']],c.budget)}${select('walk-limit','하루 보행 계획 상한',[[250,'250m'],[500,'500m'],[800,'800m'],[1200,'1,200m'],[1600,'1,600m']],c.walk_limit)}${select('continuous-limit','한 번에 걷는 계획 상한',[[60,'60m'],[100,'100m'],[200,'200m'],[300,'300m']],c.continuous_limit)}<label class="check-label"><input type="checkbox" id="avoid-stairs" ${c.avoid_stairs ? 'checked' : ''}>계단을 피하고 싶어요</label><label class="check-label"><input type="checkbox" id="mild-food" ${c.mild_food ? 'checked' : ''}>맵지 않은 메뉴를 원해요</label><p class="app-small">보행 기준은 가족이 정하는 계획 조건이다. 나이나 질환명으로 체력을 추정하지 않는다.</p></details><div class="category-tabs">${['all','sight','meal','rest'].map(k => `<button data-action="category" data-category="${k}" class="${s.category === k ? 'chosen' : ''}" aria-pressed="${s.category === k}">${k === 'all' ? '전체' : kinds[k]} ${data.places.filter(p => k === 'all' || p.kind === k).length}</button>`).join('')}</div>${filtered.map(p => `<article class="candidate-card ${s.draft.candidates.includes(p.id) ? 'picked' : ''}"><div class="candidate-media">${picture(p)}<span class="photo-category">${icon(p.kind === 'sight' ? 'music' : p.kind === 'rest' ? 'cup' : 'food')} ${kinds[p.kind]}</span><button class="candidate-toggle" data-action="pick" data-id="${p.id}" aria-pressed="${s.draft.candidates.includes(p.id)}" aria-label="${esc(p.name)} ${s.draft.candidates.includes(p.id) ? '후보에서 제외' : '후보에 추가'}">${icon(s.draft.candidates.includes(p.id) ? 'check' : 'circle')}</button></div><div class="candidate-copy"><h4>${esc(p.name)}</h4><p>${esc(p.description)}</p><div class="candidate-facts"><span>${icon(p.kind === 'sight' ? 'camera' : 'walk')} 짧은 접근 ${range(metrics(p.modes[1]).walk)}m</span><span>${icon('stairs')} ${p.modes[1].stairs ? '계단 확인' : '계단 없음'}</span></div><div class="evidence-note">${icon('shield')} 가상 데이터 · 실제 정보 확인 전</div><label class="photo-upload">사진 직접 넣기<input type="file" accept="image/png,image/jpeg,image/webp" data-photo="${p.id}"></label></div></article>`).join('')}<div class="sticky-actions"><div class="selection-count"><span>부모님이 편하게 고를 후보</span><b>${s.draft.candidates.length}/4곳</b></div>${btn('prepare','부모님께 후보 보여드리기')}</div>`);
}
function parentCards() {
  if (!s.prepared) return app('부모님 · 사진 선택',`<h3>여행 후보를<br>준비하고 있어요</h3><p class="intro-text">자녀가 추린 사진에서 원하는 것만 편하게 골라 주세요.</p>${picture(place('tea'))}${status('자녀 화면에서 후보를 저장해 주세요.',true)}`);
  const parent = s.person,list = chosen(),index = Math.min(s.index[parent],list.length-1),p = list[index],answer = s.draft.responses[parent][p.id];
  return app(`${people[parent]} · 간단 선택`,`${tabs()}<div class="selection-progress"><progress value="${index+1}" max="${list.length}" aria-label="후보 진행률"></progress><span>${index+1} / ${list.length}</span></div><h3>${parent === 'mom' ? '엄마' : '아빠'}, 이런 곳은 어때요?</h3><p class="intro-text">자녀가 고른 후보예요</p><div class="parent-choice-card"><div class="choice-photo">${picture(p)}<span class="photo-category">${icon(p.kind === 'rest' ? 'cup' : p.kind === 'meal' ? 'food' : 'camera')} ${kinds[p.kind]}</span></div><h4>${esc(p.name)}</h4><p class="choice-description">${esc(p.description)}</p><div class="burden-grid"><div>${icon('walk')}<b>걷기 ${metrics(p.modes[1]).walk[1]}m</b></div><div>${icon('stairs')}<b>${p.modes[1].stairs ? '계단 확인' : '계단 없음'}</b></div><div>${icon('seat')}<b>앉아서 쉬어요</b></div></div></div><div class="ox-buttons"><button data-action="answer" data-value="no" class="${answer === 'no' ? 'selected' : ''}" aria-pressed="${answer === 'no'}">${icon('close')} 다른 게 좋아요</button><button data-action="answer" data-value="yes" class="yes ${answer === 'yes' ? 'selected' : ''}" aria-pressed="${answer === 'yes'}">${icon('circle')} 좋아요</button></div>${btn('essential',`${icon('star')} ${s.draft.essentials[parent].includes(p.id) ? '꼭 하고 싶은 경험으로 표시됨' : '이번 여행에서 꼭 하고 싶어요'}`,answer !== 'yes','','secondary essential-button')}<button class="skip-button" data-action="answer" data-value="skip">잘 모르겠어요 · 건너뛰기</button><div class="card-nav"><button class="mini-button" data-action="previous" ${index ? '' : 'disabled'}>이전</button><button class="mini-button" data-action="next" ${index < list.length-1 ? '' : 'disabled'}>다음 후보</button></div><details class="response-details"><summary>${people[parent]}의 선택 보기</summary>${responses(parent)}</details>${btn('submit',s.draft.sources[parent] === 'direct' ? '직접 선택 전달 완료' : '이 선택을 자녀에게 전달하기',!complete(parent))}<p class="app-small">사진·보행은 가상 예시이다. 건너뛰기와 미응답은 동의로 기록하지 않는다.</p>`);
}
function childResponses() {
  return app('자녀 · 선택 취합',`<h3>부모님이 고른 경험을<br>확인해요</h3><p class="intro-text">직접 선택과 대화 확인을 구분하고, 서로 다른 희망은 함께 확인해요.</p>${PARENTS.map(parent => `<div class="app-card response-card"><div class="response-person"><span class="person-avatar ${parent}">${parent === 'mom' ? '엄마' : '아빠'}</span><h4>${people[parent]}</h4><span class="tag ${s.draft.sources[parent] === 'unconfirmed' ? 'orange' : ''}">${s.draft.sources[parent] === 'unconfirmed' ? '확인 전' : '응답 확인'}</span></div>${responses(parent)}<p>입력 출처: ${s.draft.sources[parent] === 'direct' ? '부모님 직접 선택' : s.draft.sources[parent] === 'conversation' ? '대화 확인 · 자녀 기록' : '확인 전'}</p><button class="mini-button" data-action="conversation" data-parent="${parent}" ${complete(parent) ? '' : 'disabled'}>대화로 확인한 응답으로 기록</button></div>`).join('')}${btn('compare','확인한 경험으로 일정 비교',!s.prepared)}${apiAvailable ? btn('save','설정·응답을 로컬 API에 저장',false,'','secondary') : ''}${s.sample ? status('빠른 체험의 가상 응답이다. 실제 사용자 응답이 아니다.',true) : ''}`);
}
function essentialBanner() {
  const ids = [...new Set(PARENTS.flatMap(p => s.draft.essentials[p]))];
  return `<div class="essential-banner"><span>${icon('star')} 꼭 남길 경험</span><h4>${ids.length ? ids.map(id => esc(place(id).experience)).join(' · ') : '사진 카드에서 꼭 원하는 경험을 골라요'}</h4><div class="condition-chips"><span>${icon('walk')} 하루 ${s.draft.config.walk_limit}m 이내</span><span>${icon('location')} 한 번에 ${s.draft.config.continuous_limit}m 이내</span></div></div>`;
}
function childCompare() {
  return app('자녀 · 대안 비교',`<h3>두 가지 방법을 비교해요</h3><p class="intro-text">부모님이 꼭 원한 경험을 두 방법 모두 지켜요</p>${essentialBanner()}<div class="plan-grid">${planCard(plan('A'),true)}${planCard(plan('B'),true)}</div><p class="range-note">${icon('info')} 거리 범위의 최대값으로 기준을 확인해요</p>${source()}<div class="sticky-actions"><p class="selected-summary"><b>${s.selected}안 선택</b> · 바뀌는 내용을 함께 확인해요</p>${status(`일정 확인: 어머니 ${s.consent.mom ? '완료' : '대기'} · 아버지 ${s.consent.dad ? '완료' : '대기'}`,!all(s.consent))}${btn('finalize','가족이 확인한 일정으로 소개 만들기',!plan(s.selected).valid || !all(s.consent))}</div>`);
}
function parentCompare() {
  const p = plan(s.selected);
  return app(`${people[s.person]} · 일정 확인`,`${tabs()}<h3>고른 경험은 남기고<br>편하게 함께 가요</h3><p class="intro-text">자녀가 준비한 ${s.selected}안이에요</p>${essentialBanner()}${p.rows.map(r => `<div class="app-card">${picture(place(r.id))}<h4>${esc(r.experience)}${required(r.id) ? ' ★' : ''}</h4><p>${r.mode.id === 'short' ? '긴 관람 대신 짧은 접근' : '충분히 함께 둘러보기'} · ${range(metrics(r.mode).walk)}m</p></div>`).join('')}${p.omitted.length ? status(`생략되는 경험: ${p.omitted.map(id => esc(place(id).experience)).join(', ')}`,true) : ''}${status(`예상 보행 ${range(p.walk)}m · 식사 12시`)}${p.issues.length ? status('확인할 조건이 있어요. 자녀 화면의 항목을 함께 확인해 주세요.',true) : ''}${btn('consent',s.consent[s.person] ? '이 일정 확인 완료' : '좋아요, 이 일정으로 갈게요',!p.valid)}${btn('choices','내가 고른 경험 다시 보기',false,'','secondary')}`);
}
function guide(role) {
  if (!s.confirmed) return app(`${role} · 여행 소개`,`<h3>가족이 함께<br>확인한 뒤 만들어요</h3><p class="intro-text">일정 비교에서 두 분의 확인을 받으면 같은 버전의 소개자료를 볼 수 있어요.</p>${btn('compare','일정 비교로 이동')}`);
  const p = s.confirmed,restCount = p.rows.filter(r => r.kind === 'rest').length;
  return app(`${role} · 여행 소개`,`<h3>우리가 고른 하루</h3><p class="intro-text trip-subtitle">${icon('calendar')} 함께 정한 당일여행 · 차량 동반</p><div class="guide-hero">${picture(place(p.rows.find(r => r.kind === 'rest')?.id || p.rows[0].id))}<b>함께 차 한 잔</b></div><div class="trip-metrics"><div><span>걷는 거리</span><b>${range(p.walk)}<small>m</small></b></div><div><span>쉬는 곳</span><b>${restCount}곳</b></div><div><span>점심</span><b>12:00</b></div></div>${timeline(p)}${status(`자녀·부모님 안내 같은 일정 v${s.version}`)}${btn('print',`${icon('file')} 한 장 안내로 크게 보기`,false,'','secondary')}${btn('rest','쉬고 싶어요 · 덜 걷고 싶어요')}${btn('memory','가족 초대·추억 카드 만들기',false,'','secondary')}${source()}`);
}
function childChange() {
  if (!s.confirmed) return app('자녀 · 일정 수정',`<h3>확인한 일정부터<br>준비해 주세요</h3>${planCard(plan('B'))}${btn('setup','조건 수정으로 이동',false,'','secondary')}${btn('compare','일정 비교로 이동')}`);
  return app('자녀 · 남은 구간',`<h3>완료한 구간은 그대로,<br>남은 길만 바꿔요</h3><p class="intro-text">필수 경험과 점심 예약을 유지하며 더 짧게 가는 안을 준비해요.</p><div class="app-card change-settings"><div class="field"><label for="completed-count">다녀온 구간</label><select id="completed-count">${Array.from({length:s.confirmed.rows.length+1},(_,n) => `<option value="${n}" ${s.completedCount === n ? 'selected' : ''}>${n ? `${n}개 완료 · ${esc(s.confirmed.rows[n-1].experience)}까지` : '아직 완료한 구간 없음'}</option>`).join('')}</select></div><div class="field"><label for="remaining-limit">남은 보행 상한 (m)</label><input id="remaining-limit" type="number" min="1" max="10000" value="${s.remainingLimit}"></div><div class="field"><label for="remaining-continuous">앞으로 한 번에 걷는 상한 (m)</label><input id="remaining-continuous" type="number" min="1" max="3000" value="${s.continuousLimit}"></div></div>${btn('prepare-change','짧은 접근 수정안 검사')}${s.change ? planCard(s.change) : ''}${status(`변경 확인: 어머니 ${s.changeConsent.mom ? '완료' : '대기'} · 아버지 ${s.changeConsent.dad ? '완료' : '대기'}`,!all(s.changeConsent))}${btn('apply-change','가족이 확인한 남은 일정 적용',!s.change?.valid || !all(s.changeConsent))}${source()}`);
}
function parentChange() {
  const p = s.change,essentialIds = p?.rows.filter(r => !r.completed && required(r.id)).map(r => r.id) || [];
  const next = p?.rows.find(r => !r.completed && r.kind === 'sight') || p?.rows.find(r => !r.completed);
  return app(`${people[s.person]} · 변경 확인`,`${tabs()}<span class="tag grey live-pill"><span class="live-dot"></span> 여행 중 · 남은 구간 확인</span><h3>쉬고 싶다고 하셔서<br>남은 길만 바꿨어요</h3><p class="intro-text">자녀가 준비한 수정안이에요</p>${p ? `<div class="change-hero">${picture(place(next?.id || 'fan'))}<span>${icon('location')} 다음 · ${esc(next?.name || '여행 마무리')}</span></div><div class="change-preserved"><h4><span class="selected-check">${icon('check')}</span> ${essentialIds.length ? '꼭 원한 경험은 그대로 남겨요' : '완료한 경험은 그대로 남겨요'}</h4><div class="change-facts"><div><span>${icon('swap')} 바뀌어요</span><b>긴 관람 대신<br>짧은 접근으로 가요</b></div><div><span>${icon('walk')} 남은 걷기</span><b>${range(p.remaining_walk)}m</b></div><div><span>${icon('food')} 다녀왔어요</span><b>${p.rows.filter(r => r.completed).map(r => esc(r.experience)).join(' · ') || '아직 완료한 구간 없음'}</b></div></div></div>${!p.valid ? status(p.issues.map(i => esc(issueText(i))).join('<br>'),true) : ''}${btn('change-consent',s.changeConsent[s.person] ? '수정안 확인 완료' : '좋아요, 이대로 할게요',!p.valid)}${btn('request-less',`${icon('walk')} 덜 걷고 싶어요`,false,'','secondary')}<p class="app-small">확인 기록은 자녀 화면에도 같은 상태로 반영돼요.</p>` : status('자녀가 남은 구간 수정안을 준비하고 있어요.',true)}${btn('guide','현재 여행 소개 보기',false,'','secondary')}`);
}
function avatar() {
  const palettes = {basic:['#e8f5ec','#98bca1','#c8a286'],warm:['#f1e2c5','#9dbb9b','#c49b7c'],water:['#e3eeea','#9cc9b7','#b5a08b'],pixel:['#e1efdd','#7dab8c','#bb9472']};
  const [background,green,shirt] = palettes[s.style];
  const figures = [95,153,210].map((x,i) => s.style === 'pixel' ? `<rect x="${x-20}" y="62" width="40" height="48" fill="#f8d7b1"/><rect x="${x-20}" y="62" width="40" height="12" fill="#66594f"/><rect x="${x-25}" y="113" width="50" height="56" fill="${i===1?'#e7cfc1':shirt}"/><rect x="${x-10}" y="83" width="4" height="4"/><rect x="${x+7}" y="83" width="4" height="4"/>` : `<path d="M${x-27} 176q0-58 27-58t27 58" fill="${i===1?'#e7cfc1':shirt}"/><circle cx="${x}" cy="90" r="24" fill="#f8d7b1"/><path d="M${x-23} 86q0-34 27-23q18 4 18 23" fill="${i===0?'#6d6158':i===1?'#81776d':'#514b48'}"/><circle cx="${x-7}" cy="91" r="1.5"/><circle cx="${x+7}" cy="91" r="1.5"/><path d="M${x-7} 103q7 7 14 0" fill="none"/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 200" role="img" aria-label="기본 가족 캐릭터"><rect width="300" height="200" rx="20" fill="${background}"/><circle cx="247" cy="42" r="24" fill="#fff4ce"/><path d="M0 145Q80 105 150 141T300 131V200H0" fill="${green}"/><g stroke="#574937" stroke-width="2">${figures}</g></svg>`;
}
function memoryCard() {
  const essentialIds = [...new Set(PARENTS.flatMap(p => s.draft.essentials[p]))];
  return `<div class="memory-card"><div class="memory-art">${s.memoryPhoto ? `<img src="${esc(s.memoryPhoto)}" alt="사용자가 선택한 여행 사진"><div class="avatar-overlay">${avatar()}</div>` : avatar()}<span class="memory-image-label">${icon('sparkles')} 기본 캐릭터</span></div><h4>${s.kind === 'invite' ? '함께 고른 여행에 초대해요' : '함께해서 더 좋았던 하루'}</h4><p>${esc(s.caption)}</p><div class="memory-location">${icon('location')} 함께 고른 가족 여행</div>${essentialIds.length ? `<div class="memory-essential">${icon('star')} ${essentialIds.map(id => esc(place(id).experience)).join(' · ')}<span class="selected-check">${icon('check')}</span></div>` : ''}<div class="memory-meta">기본 캐릭터 템플릿 · 생성형 AI 변환 결과가 아니다.</div></div>`;
}
function memoryControls() {
  return `<div class="memory-purpose"><button data-action="kind" data-kind="invite" class="${s.kind === 'invite' ? 'chosen' : ''}" aria-pressed="${s.kind === 'invite'}">여행 전 · 초대</button><button data-action="kind" data-kind="memory" class="${s.kind === 'memory' ? 'chosen' : ''}" aria-pressed="${s.kind === 'memory'}">여행 후 · 추억</button></div><div class="style-pills">${[['basic','기본 캐릭터'],['warm','지브리풍 수채화'],['water','만화'],['pixel','픽셀']].map(([key,label]) => `<button data-action="style" data-style="${key}" class="${s.style === key ? 'chosen' : ''}" aria-pressed="${s.style === key}">${s.style === key ? icon('check') : ''}${label}</button>`).join('')}</div>`;
}
function childMemory() {
  return app('자녀 · 가족 카드',`${memoryControls()}<p class="app-small">지브리 스타일 등 사진 변환 경험에서 착안한 가족 카드이다. 현재는 기본 캐릭터 템플릿을 사용하며 실제 AI 변환은 후속 연동이다.</p>${s.generated ? memoryCard() : ''}<details class="memory-editor" open><summary>사진과 기록으로 카드 꾸미기</summary><label class="check-label"><input type="checkbox" id="photo-consent" ${s.photoConsent ? 'checked' : ''}>함께 찍힌 가족의 사진 이용 동의를 확인했어요</label><label class="photo-upload">여행 사진 선택<input id="memory-photo" type="file" accept="image/png,image/jpeg,image/webp" ${s.photoConsent ? '' : 'disabled'}></label>${s.memoryPhoto ? btn('remove-photo','선택한 사진 지우기',false,'','secondary') : ''}<p class="app-small">사진 없이도 만들 수 있어요. 사진은 이 탭의 메모리에만 보관하며 서버로 전송하지 않아요.</p><div class="field"><label for="caption">짧은 기록</label><input id="caption" maxlength="90" value="${esc(s.caption)}"></div>${btn('generate','가족 카드 미리보기 만들기')}</details>${s.generated ? `<div class="memory-actions">${btn('share-card',`${icon('share')} 가족에게 추억 카드 공유`)}${btn('download',icon('download'),false,'aria-label="가족 카드 PNG 저장"','secondary download-button')}</div>` : ''}`);
}
function parentMemory() {
  return app('부모님 · 가족 카드',`<h3>${s.kind === 'invite' ? '함께 고른 여행을<br>기대해 주세요' : '우리 여행을<br>다시 꺼내 봐요'}</h3><p class="intro-text">좋아하는 경험, 함께하는 식사와 휴식을 가족의 기록으로 남겨요.</p>${s.generated ? `${memoryCard()}${btn('share-card',`${icon('share')} 가족 카드 공유`)}${btn('download',`${icon('download')} PNG 저장`,false,'','secondary')}` : status('자녀가 가족 카드를 준비하고 있어요.')}<div class="app-card"><h4>함께 고른 경험</h4><p>${chosen().filter(p => PARENTS.some(r => s.draft.responses[r][p.id] === 'yes')).map(p => esc(p.experience)).join(' · ') || '사진 카드에서 골라 주세요.'}</p></div>${btn('guide','여행 소개 다시 보기',false,'','secondary')}`);
}

function invalidate(parent) {
  s.consent = {mom:false,dad:false}; s.changeConsent = {mom:false,dad:false}; s.confirmed = null; s.change = null; s.dirty = true;
  if (parent) s.draft.sources[parent] = 'unconfirmed';
}
function render() {
  const positions = [$('child-screen').scrollTop,$('parent-screen').scrollTop];
  document.querySelectorAll('[data-step]').forEach(b => {b.classList.toggle('active',Number(b.dataset.step) === s.step);b.setAttribute('aria-pressed',String(Number(b.dataset.step) === s.step));});
  $('demo-phones')?.setAttribute?.('data-view', viewRole);
  document.querySelectorAll('[data-view-role]').forEach(b => b.setAttribute('aria-pressed',String(b.dataset.viewRole === viewRole)));
  const [title, text] = contexts[s.step-1];
  $('demo-context').innerHTML = `<strong>${title}</strong>${text}${s.sample ? ' 현재 응답은 가상 예시이다.' : ''}`;
  const child = [setup,childResponses,childCompare,() => guide('자녀'),childChange,childMemory][s.step-1];
  const parent = [parentCards,parentCards,parentCompare,() => guide('부모님'),parentChange,parentMemory][s.step-1];
  $('child-screen').innerHTML = child(); $('parent-screen').innerHTML = parent();
  if (render.step === s.step) { $('child-screen').scrollTop = positions[0]; $('parent-screen').scrollTop = positions[1]; }
  render.step = s.step;
  $('api-status').textContent = apiAvailable ? `로컬 API 연결${serverTrip ? ' · 저장됨' : ''}` : staticMode ? '공개 체험 · 가상 데이터' : '브라우저 데모';
  $('mode-description').textContent = apiAvailable ? '설정·선택·확정 일정은 로컬 API에 저장돼요. 사진은 이 탭에만 보관돼요. 새로고침 후 자동 복구는 아직 지원하지 않아요.' : '가상 데이터로 체험해요. 선택·일정·사진은 이 탭에서만 사용하고 서버에 저장하지 않아요. 새로고침하면 처음부터 시작돼요.';
}
async function request(method, path, body) {
  const headers = {'Content-Type':'application/json'};
  if (serverTrip) headers['X-Trip-Token'] = serverTrip.token;
  const response = await fetch(path,{method,headers,...(body ? {body:JSON.stringify(body)} : {})});
  const result = await response.json();
  if (!response.ok) throw new Error(response.status === 409 ? '저장된 상태가 바뀌었어요. 다시 시작해 주세요.' : typeof result.error === 'string' ? result.error : '확인할 조건이 있어요.');
  return result;
}
async function saveDraft() {
  if (!serverTrip) serverTrip = await request('POST','/api/trips',s.draft);
  else if (s.dirty) {
    const result = await request('PUT',`/api/trips/${serverTrip.id}`,{draft:s.draft,expected_revision:serverTrip.revision});
    serverTrip = {...result,token:serverTrip.token};
  }
  s.dirty = false;
}
function clearPhotos() {for (const url of objectUrls) URL.revokeObjectURL(url);objectUrls.clear();}
function resetScreens() {
  viewRole = 'child';
  $('child-screen').scrollTop = 0;
  $('parent-screen').scrollTop = 0;
  render.step = null;
}
async function act(action, d = {}) {
  const parent = s.person, id = chosen()[s.index[parent]]?.id;
  switch (action) {
    case 'person': s.person = d.person; break;
    case 'setup': s.step = 1; break;
    case 'category': s.category = d.category;break;
    case 'style': s.style = d.style;s.generated = false;break;
    case 'pick': if(!s.draft.candidates.includes(d.id) && s.draft.candidates.length >= 4){toast('최대 4곳을 고를 수 있어요. 다른 후보를 먼저 빼 주세요.');render();return;}s.draft.candidates = s.draft.candidates.includes(d.id) ? s.draft.candidates.filter(i => i !== d.id) : [...s.draft.candidates,d.id]; s.prepared = false; s.draft.responses = {mom:{},dad:{}};s.draft.essentials = {mom:[],dad:[]};s.draft.sources = {mom:'unconfirmed',dad:'unconfirmed'};s.draft.unknown_ids = s.draft.unknown_ids.filter(i => s.draft.candidates.includes(i));s.index = {mom:0,dad:0};invalidate();break;
    case 'prepare': if (!['sight','meal','rest'].every(k => chosen().some(p => p.kind === k))) {toast('관광·식사·휴식 후보를 하나 이상 골라 주세요.');return;}s.prepared = true;s.step = 2;break;
    case 'answer': s.draft.responses[parent][id] = d.value;if (d.value !== 'yes') s.draft.essentials[parent] = s.draft.essentials[parent].filter(i => i !== id);invalidate(parent);break;
    case 'essential': if(s.draft.responses[parent][id] !== 'yes')return;s.draft.essentials[parent] = s.draft.essentials[parent].includes(id) ? s.draft.essentials[parent].filter(i => i !== id) : [...s.draft.essentials[parent],id];invalidate(parent);break;
    case 'previous': s.index[parent] = Math.max(0,s.index[parent]-1);break;
    case 'next': s.index[parent] = Math.min(chosen().length-1,s.index[parent]+1);break;
    case 'submit': if(!complete(parent))return;s.draft.sources[parent] = 'direct';s.dirty = true;toast(`${people[parent]}의 선택을 전달했어요.`);break;
    case 'conversation': if(!complete(d.parent))return;s.draft.sources[d.parent] = 'conversation';s.dirty = true;break;
    case 'compare': s.step = 3;break;
    case 'select-plan': if(!plan(d.plan).valid)return;s.selected = d.plan;s.consent = {mom:false,dad:false};s.confirmed = null;break;
    case 'consent': if(plan(s.selected).valid)s.consent[parent] = true;break;
    case 'finalize': {
      const p = plan(s.selected);if(!p.valid || !all(s.consent))return;
      if(apiAvailable) {await saveDraft();const result = await request('POST',`/api/trips/${serverTrip.id}/confirm`,{plan_key:s.selected,confirmations:s.consent,expected_revision:serverTrip.revision});serverTrip = {...result,token:serverTrip.token};s.confirmed = result.plan;s.version = result.version;}
      else {s.confirmed = p;s.version += 1;}
      s.step = 4;toast('가족이 확인한 소개자료를 만들었어요.');break;
    }
    case 'save': if(!apiAvailable)return;await saveDraft();toast('사진을 제외한 설정과 응답을 로컬 API에 저장했어요.');break;
    case 'choices': s.step = 2;break;
    case 'guide': s.step = 4;break;
    case 'rest': if(!s.confirmed)return;s.step = 5;s.change = null;s.changeConsent = {mom:false,dad:false};s.completedCount = Math.max(s.completedCount,s.confirmed.rows.filter(r => r.completed).length);break;
    case 'prepare-change': if(!s.confirmed)return;s.change = remainingPlan(s.draft,s.confirmed,s.confirmed.rows.slice(0,s.completedCount).map(r => r.id),s.remainingLimit,s.continuousLimit,data);s.changeConsent = {mom:false,dad:false};break;
    case 'change-consent': if(s.change?.valid)s.changeConsent[parent] = true;break;
    case 'apply-change': if(!s.change?.valid || !all(s.changeConsent))return;if(apiAvailable) {const result = await request('POST',`/api/trips/${serverTrip.id}/change`,{expected_revision:serverTrip.revision,confirmations:s.changeConsent,completed_ids:s.confirmed.rows.slice(0,s.completedCount).map(r => r.id),remaining_walk_limit:s.remainingLimit,continuous_limit:s.continuousLimit});serverTrip = {...result,token:serverTrip.token};s.confirmed = result.plan;s.version = result.version;}else{s.confirmed = s.change;s.version += 1;}s.step = 4;toast('두 화면에 같은 수정 버전을 적용했어요.');break;
    case 'memory': s.step = 6;break;
    case 'kind': s.kind = d.kind;s.generated = false;break;
    case 'generate': s.generated = true;break;
    case 'remove-photo': if(s.memoryPhoto){URL.revokeObjectURL(s.memoryPhoto);objectUrls.delete(s.memoryPhoto);}s.memoryPhoto = null;s.generated = false;break;
    case 'share-card': await downloadCard(true);return;
    case 'request-less': if(!s.confirmed)return;s.step = 5;s.change = null;s.changeConsent = {mom:false,dad:false};toast('자녀 화면에서 남은 보행 조건을 조정해 주세요.');break;
    case 'download': await downloadCard();return;
    case 'print': if(!s.confirmed)return;$('print-guide').innerHTML = `<h1>같이온 · 오늘의 여행 소개</h1><p>일정 v${s.version} · 가상 데이터 기반 소개</p><p>함께 고른 경험 · 하루 보행 ${range(s.confirmed.walk)}m</p>${timeline(s.confirmed)}<p>장소·거리·시간·비용은 가상 예시이다. 실제 시설 이용 정보는 별도 확인이 필요하다.</p>`;window.print();return;
  }
  render();
}
document.addEventListener('click', async event => {
  const b = event.target.closest('button');if(!b || b.disabled || !data)return;
  try {
    if(b.dataset.viewRole){if(['child','parent'].includes(b.dataset.viewRole))viewRole = b.dataset.viewRole;render();return;}
    if(b.dataset.step){s.step = Number(b.dataset.step);render();return;}
    if(b.id === 'reset-demo'){if(serverTrip && apiAvailable)await request('DELETE',`/api/trips/${serverTrip.id}`);serverTrip = null;clearPhotos();s = initial();resetScreens();render();toast('이 탭의 사진과 여행 상태를 지웠어요.');return;}
    if(b.dataset.scenario){if(serverTrip && apiAvailable)await request('DELETE',`/api/trips/${serverTrip.id}`);serverTrip = null;clearPhotos();s = initial();s.draft = exampleDraft();s.prepared = true;s.sample = true;s.step = 3;if(b.dataset.scenario === 'tight'){s.draft.config.walk_limit = 250;s.draft.config.continuous_limit = 60;}if(b.dataset.scenario === 'unknown')s.draft.unknown_ids = ['fan'];if(b.dataset.scenario === 'disagree'){s.draft.responses.dad.fan = 'no';s.draft.essentials.dad = [];}if(b.dataset.scenario === 'memory'){s.step = 6;s.generated = true;}resetScreens();render();return;}
    if(b.dataset.action){b.disabled = true;await act(b.dataset.action,b.dataset);}
  } catch(error) {toast(error.message || '입력 조건을 확인해 주세요.');render();}
  finally {if(b.isConnected)b.disabled = false;}
});
document.addEventListener('change', event => {
  const el = event.target;if(!data)return;
  if(el.dataset.photo || el.id === 'memory-photo') {
    const file = el.files?.[0];if(!file)return;
    if(!['image/png','image/jpeg','image/webp'].includes(file.type) || file.size > 5*1024*1024){toast('5MB 이하 PNG·JPEG·WebP 사진을 선택해 주세요.');el.value = '';return;}
    if(el.id === 'memory-photo' && !s.photoConsent)return;
    const url = URL.createObjectURL(file);objectUrls.add(url);
    const old = el.dataset.photo ? s.photos[el.dataset.photo] : s.memoryPhoto;
    if(old){URL.revokeObjectURL(old);objectUrls.delete(old);}
    if(el.dataset.photo)s.photos[el.dataset.photo] = url;else{s.memoryPhoto = url;s.generated = false;}render();return;
  }
  const configIds = {'walk-limit':'walk_limit','continuous-limit':'continuous_limit',budget:'budget','avoid-stairs':'avoid_stairs','mild-food':'mild_food'};
  if(configIds[el.id]){s.draft.config[configIds[el.id]] = el.type === 'checkbox' ? el.checked : Number(el.value);invalidate();}
  if(el.id === 'completed-count'){const minimum = s.confirmed.rows.filter(r => r.completed).length;s.completedCount = Math.max(minimum,Number(el.value));s.change = null;s.changeConsent = {mom:false,dad:false};}
  if(el.id === 'remaining-limit' || el.id === 'remaining-continuous'){s[el.id === 'remaining-limit' ? 'remainingLimit' : 'continuousLimit'] = Number(el.value);s.change = null;s.changeConsent = {mom:false,dad:false};}
  if(el.id === 'character-style'){s.style = el.value;s.generated = false;}
  if(el.id === 'photo-consent'){s.photoConsent = el.checked;if(!el.checked){if(s.memoryPhoto){URL.revokeObjectURL(s.memoryPhoto);objectUrls.delete(s.memoryPhoto);}s.memoryPhoto = null;s.generated = false;}}
  if(el.id === 'caption'){s.caption = el.value.slice(0,90);s.generated = false;}
  render();
});
async function downloadCard(share = false) {
  if(!s.generated)return;
  if(document.fonts)await document.fonts.ready;
  const canvas = document.createElement('canvas');canvas.width = 900;canvas.height = 1120;const ctx = canvas.getContext('2d');
  const load = url => new Promise((resolve,reject) => {const im = new Image();im.onload = () => resolve(im);im.onerror = reject;im.src = url;});
  ctx.fillStyle = '#fffaf2';ctx.fillRect(0,0,900,1120);ctx.fillStyle = '#009e55';ctx.font = 'bold 32px SUIT, sans-serif';ctx.fillText(`같이온 · ${s.kind === 'invite' ? '여행 초대' : '여행의 기억'}`,60,78);
  if(s.memoryPhoto){const photo = await load(s.memoryPhoto);const scale = Math.max(780/photo.width,550/photo.height);ctx.save();ctx.beginPath();ctx.rect(60,115,780,550);ctx.clip();ctx.drawImage(photo,60+(780-photo.width*scale)/2,115+(550-photo.height*scale)/2,photo.width*scale,photo.height*scale);ctx.restore();}
  const character = await load(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(avatar())}`);ctx.drawImage(character,s.memoryPhoto ? 490 : 60,s.memoryPhoto ? 450 : 115,s.memoryPhoto ? 350 : 780,s.memoryPhoto ? 233 : 520);
  ctx.fillStyle = '#18211d';ctx.font = 'bold 36px SUIT, sans-serif';ctx.fillText(s.kind === 'invite' ? '함께 고른 여행에 초대해요' : '함께해서 더 좋았던 하루',60,750);ctx.font = '26px SUIT, sans-serif';const chars = Array.from(s.caption);for(let i=0;i<chars.length;i+=23)ctx.fillText(chars.slice(i,i+23).join(''),60,805+Math.floor(i/23)*39);ctx.fillStyle = '#74807b';ctx.font = '22px SUIT, sans-serif';ctx.fillText('가족 여행 · 함께 남기는 하루',60,1005);ctx.font = '19px SUIT, sans-serif';ctx.fillText('기본 캐릭터 템플릿 · 생성형 AI 변환 결과가 아님',60,1050);
  const blob = await new Promise(resolve => canvas.toBlob(resolve,'image/png'));if(!blob)throw new Error('카드를 저장할 수 없어요.');if(share && typeof navigator !== 'undefined' && navigator.share){const file = new File([blob], '같이온_가족_카드.png', {type:'image/png'});if(navigator.canShare?.({files:[file]})){try{await navigator.share({files:[file],title:'같이온 가족 카드'});}catch(error){if(error.name !== 'AbortError')throw error;}return;}}const url = URL.createObjectURL(blob),a = document.createElement('a');a.href = url;a.download = `같이온_${s.kind === 'invite' ? '초대' : '추억'}_카드.png`;a.click();setTimeout(() => URL.revokeObjectURL(url),1000);toast(share ? '카드를 PNG로 저장했어요. 원하는 가족 대화방에 첨부해 주세요.' : '가족 카드를 PNG로 저장했어요.');
}
window.addEventListener('pagehide',clearPhotos);
try {
  const response = await fetch('./catalog.json');if(!response.ok)throw new Error('catalog unavailable');data = await response.json();s.step = 1;s.prepared = true;render();
  if(!staticMode){try {const check = await fetch('/api/health');if(check.ok && (await check.json()).mode === 'local-prototype')apiAvailable = true;} catch { /* Static hosting uses browser-local planning. */ }}
  render();
} catch { $('demo-context').textContent = staticMode ? '체험 자료를 불러오지 못했어요. 페이지를 새로고침하거나 잠시 후 다시 열어 주세요.' : '실행 방법: 저장소 폴더에서 python -m backend.server를 실행한 뒤 http://127.0.0.1:8000을 열어 주세요.'; }
