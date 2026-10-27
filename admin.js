// ===== Supabase 연결 정보 (공개 키만 쓴다) =====
const SUPABASE_URL = 'https://bkyjbnzvidfszdtzfabp.supabase.co';
const SUPABASE_KEY = 'sb_publishable_XXiUgGQz9YoCrZ7o2Diu4Q_8K-oFadt';
const BUCKET = 'resume';
const SESSION_KEY = 'resume_admin_session';

// 올릴 수 있는 파일 (종류 → 새 파일 이름의 끝)
const MAX_SIZE = 10 * 1024 * 1024; // 10MB
const IMAGE_TYPES = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' };
const FILE_TYPES = { ...IMAGE_TYPES, 'application/pdf': 'pdf' };

// 프로필 칸 목록: [칸 이름, 화면에 보일 이름, 모양]
const PROFILE_FIELDS = [
  ['name', '이름', 'input'],
  ['title', '직함', 'input'],
  ['career_badge', '경력 배지', 'input'],
  ['email', '이메일', 'input'],
  ['phone', '연락처', 'input'],
  ['location', '위치', 'input'],
  ['headline', '한 줄 소개 (쉼표 뒤 ~ 이름까지 파란 밑줄)', 'wide'],
  ['intro', '소개 글', 'textarea'],
  ['education', 'EDUCATION (줄 바꿔 적기: 첫 줄 굵게)', 'textarea'],
  ['skills', 'SKILLS & TOOLS (쉼표로 나누기)', 'textarea'],
  ['experience', 'EXPERIENCE (줄 바꿔 적기: 첫 줄 굵게)', 'textarea'],
  ['quote', '맨 아래 인용', 'wide'],
];

// ===== 작은 도우미 함수들 =====
const $ = (id) => document.getElementById(id);

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = text;
  return node;
}

function button(text, className, onClick) {
  const b = el('button', `btn ${className || ''}`.trim(), text);
  b.type = 'button';
  b.addEventListener('click', () => onClick(b));
  return b;
}

function isWebUrl(url) {
  return typeof url === 'string' && /^https?:\/\//i.test(url);
}

function setMsg(id, text, isError) {
  const m = $(id);
  m.textContent = text || '';
  m.classList.toggle('error', !!isError);
}

// 버튼을 잠시 잠가 두 번 눌리지 않게 한다
async function withBusy(btn, work) {
  if (btn) btn.disabled = true;
  try { return await work(); } finally { if (btn) btn.disabled = false; }
}

function formatDate(iso) {
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ===== 로그인 정보 (토큰) =====
let session = null;

function saveSession(s) {
  session = s;
  try {
    if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s));
    else localStorage.removeItem(SESSION_KEY);
  } catch (e) { /* 저장 못 해도 이번 화면에서는 쓸 수 있다 */ }
}

function readSavedSession() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY)); } catch (e) { return null; }
}

// Supabase Auth 에 토큰을 받으러 간다 (비밀번호 로그인 또는 토큰 새로 받기)
async function requestToken(grantType, body) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=${grantType}`, {
    method: 'POST',
    headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error_description || data.msg || data.message || `오류 ${res.status}`);
    err.status = res.status;
    throw err;
  }
  if (!data.expires_at) data.expires_at = Math.floor(Date.now() / 1000) + (data.expires_in || 3600);
  return data;
}

async function refreshSession() {
  saveSession(await requestToken('refresh_token', { refresh_token: session.refresh_token }));
}

// 로그인이 끝나 버렸을 때: 로그인 화면으로 돌아간다
function sessionExpired() {
  saveSession(null);
  showView('login');
  setMsg('login-msg', '로그인이 끝났어요. 다시 로그인해 주세요.', true);
  return new Error('로그인이 끝났어요. 다시 로그인해 주세요.');
}

// 토큰을 붙여서 요청한다. 토큰이 곧 끝나면 먼저 새로 받는다.
async function authFetch(url, options = {}, retried = false) {
  if (!session) throw sessionExpired();
  if (session.expires_at * 1000 - Date.now() < 60 * 1000) {
    try { await refreshSession(); } catch (e) { throw sessionExpired(); }
  }
  const res = await fetch(url, {
    ...options,
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${session.access_token}`, ...(options.headers || {}) },
  });
  if (res.status === 401 && !retried) {
    try { await refreshSession(); } catch (e) { throw sessionExpired(); }
    return authFetch(url, options, true);
  }
  return res;
}

async function errorText(res) {
  const data = await res.json().catch(() => null);
  return (data && (data.message || data.msg || data.error)) || `오류 ${res.status}`;
}

// 표에 요청하고 결과(JSON)를 돌려준다
async function rest(path, options = {}) {
  const res = await authFetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  if (!res.ok) throw new Error(await errorText(res));
  if (res.status === 204) return null;
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

// 고치기·지우기: 실제로 바뀐 줄이 없으면 (권한이 없으면) 오류로 본다
async function restChange(path, method, body) {
  const rows = await rest(path, {
    method,
    headers: { Prefer: 'return=representation' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!rows || !rows.length) throw new Error('바뀐 것이 없어요. 관리자 권한을 확인해 주세요.');
  return rows;
}

// ===== 파일 올리기 =====
function checkFile(file, types) {
  if (!types[file.type]) {
    return types === IMAGE_TYPES
      ? '이미지 파일(PNG·JPG·WEBP·GIF)만 올릴 수 있어요.'
      : '이미지(PNG·JPG·WEBP·GIF)나 PDF 파일만 올릴 수 있어요.';
  }
  if (file.size > MAX_SIZE) return '10MB가 넘는 파일은 올릴 수 없어요.';
  return null;
}

// resume 보관함의 folder/ 에 영어·숫자 이름으로 올리고 공개 주소를 돌려준다
async function uploadFile(file, folder, types) {
  const problem = checkFile(file, types);
  if (problem) throw new Error(problem);
  const random = Math.random().toString(36).slice(2, 8);
  const path = `${folder}/${Date.now()}-${random}.${types[file.type]}`;
  const res = await authFetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': file.type, 'x-upsert': 'false', 'cache-control': '3600' },
    body: file,
  });
  if (!res.ok) throw new Error(`파일을 올리지 못했어요. (${await errorText(res)})`);
  return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`;
}

// 파일을 고르자마자 검사해서, 안 되면 안내하고 고른 것을 지운다
function watchFileInput(input, types, msgId) {
  input.addEventListener('change', () => {
    const file = input.files[0];
    if (!file) return;
    const problem = checkFile(file, types);
    if (problem) {
      input.value = '';
      setMsg(msgId, problem, true);
    } else {
      setMsg(msgId, '');
    }
  });
}

// ===== 화면 바꾸기 =====
function showView(name) {
  $('loading-view').hidden = name !== 'loading';
  $('login-view').hidden = name !== 'login';
  $('denied-view').hidden = name !== 'denied';
  $('admin-view').hidden = name !== 'admin';
  $('logout-btn').hidden = !(name === 'denied' || name === 'admin');
  $('who').textContent = (name === 'denied' || name === 'admin') && session ? session.user.email : '';
}

// 로그인한 사람이 관리자인지 확인하고 알맞은 화면을 연다
async function enter() {
  showView('loading');
  try {
    const rows = await rest(`admins?select=user_id&user_id=eq.${session.user.id}`);
    if (!rows.length) { showView('denied'); return; }
    showView('admin');
    loadProfile();
    loadProjects();
    loadGuestbook();
  } catch (e) {
    if (session) {
      showView('login');
      setMsg('login-msg', `확인하지 못했어요. (${e.message})`, true);
    }
  }
}

async function login() {
  const email = $('login-email').value.trim();
  const password = $('login-password').value;
  if (!email || !password) { setMsg('login-msg', '이메일과 비밀번호를 모두 적어 주세요.', true); return; }

  await withBusy($('login-btn'), async () => {
    setMsg('login-msg', '로그인하는 중…');
    try {
      saveSession(await requestToken('password', { email, password }));
      $('login-password').value = '';
      setMsg('login-msg', '');
      await enter();
    } catch (e) {
      setMsg('login-msg', e.status === 400 ? '이메일이나 비밀번호가 맞지 않아요.' : `로그인하지 못했어요. (${e.message})`, true);
    }
  });
}

async function logout() {
  if (session) {
    fetch(`${SUPABASE_URL}/auth/v1/logout`, {
      method: 'POST',
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${session.access_token}` },
    }).catch(() => {});
  }
  saveSession(null);
  showView('login');
  setMsg('login-msg', '로그아웃했어요.');
}

// ===== 프로필 =====
const PERSON_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm0 2c-5.3 0-9 2.7-9 6v2h18v-2c0-3.3-3.7-6-9-6Z"/></svg>';

function buildProfileFields() {
  const box = $('profile-fields');
  PROFILE_FIELDS.forEach(([key, label, shape]) => {
    const field = el('label', `field${shape === 'input' ? '' : ' wide'}`);
    const input = el(shape === 'textarea' ? 'textarea' : 'input');
    input.id = `pf-${key}`;
    if (shape === 'textarea') input.rows = 3; else input.type = 'text';
    field.append(el('span', '', label), input);
    box.append(field);
  });
}

function showProfilePhoto(url) {
  const box = $('pf-photo');
  if (isWebUrl(url)) {
    const img = el('img');
    img.src = url;
    img.alt = '프로필 사진';
    img.onerror = () => { box.innerHTML = PERSON_ICON; };
    box.replaceChildren(img);
  } else {
    box.innerHTML = PERSON_ICON;
  }
}

async function loadProfile() {
  try {
    const rows = await rest('profile?select=*&id=eq.1');
    const p = rows[0] || {};
    PROFILE_FIELDS.forEach(([key]) => { $(`pf-${key}`).value = p[key] || ''; });
    showProfilePhoto(p.photo_url);
    setMsg('profile-msg', rows.length ? '' : '아직 프로필이 없어요. 적고 저장하면 새로 만들어져요.');
  } catch (e) {
    setMsg('profile-msg', `프로필을 불러오지 못했어요. (${e.message})`, true);
  }
}

// 프로필 줄(id=1)이 있으면 보낸 칸만 고치고, 없으면 새로 만든다
function upsertProfile(values) {
  return rest('profile?on_conflict=id', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify({ id: 1, ...values, updated_at: new Date().toISOString() }),
  });
}

async function saveProfile(btn) {
  const values = {};
  PROFILE_FIELDS.forEach(([key]) => { values[key] = $(`pf-${key}`).value.trim(); });
  await withBusy(btn, async () => {
    setMsg('profile-msg', '저장하는 중…');
    try {
      await upsertProfile(values);
      setMsg('profile-msg', '저장했어요. 방문자 화면을 새로고침하면 보여요.');
    } catch (e) {
      setMsg('profile-msg', `저장하지 못했어요. (${e.message})`, true);
    }
  });
}

async function changeProfilePhoto() {
  const input = $('pf-photo-input');
  const file = input.files[0];
  if (!file) return;
  const problem = checkFile(file, IMAGE_TYPES);
  if (problem) { input.value = ''; setMsg('pf-photo-msg', problem, true); return; }

  input.disabled = true;
  setMsg('pf-photo-msg', '사진을 올리는 중…');
  try {
    const url = await uploadFile(file, 'profile', IMAGE_TYPES);
    await upsertProfile({ photo_url: url });
    showProfilePhoto(url);
    setMsg('pf-photo-msg', '사진을 바꿨어요.');
  } catch (e) {
    setMsg('pf-photo-msg', e.message, true);
  } finally {
    input.value = '';
    input.disabled = false;
  }
}

// ===== 포트폴리오 카드 =====
let projects = [];
let likeCounts = {};
let editing = null; // 고치는 중인 카드 (새 카드면 { id: null })

async function countLikes(projectId) {
  const res = await authFetch(`${SUPABASE_URL}/rest/v1/likes?select=id&project_id=eq.${projectId}`, {
    method: 'HEAD',
    headers: { Prefer: 'count=exact' },
  });
  if (!res.ok) throw new Error(`오류 ${res.status}`);
  return Number((res.headers.get('content-range') || '').split('/')[1]) || 0;
}

async function loadProjects() {
  try {
    projects = await rest('projects?select=*&order=sort_order.asc,id.asc');
    const counts = await Promise.all(projects.map((p) => countLikes(p.id).catch(() => null)));
    likeCounts = {};
    projects.forEach((p, i) => { likeCounts[p.id] = counts[i]; });
    setMsg('project-list-msg', projects.length ? '' : '아직 카드가 없어요. "+ 카드 추가"를 눌러 만들어 보세요.');
  } catch (e) {
    projects = [];
    setMsg('project-list-msg', `카드를 불러오지 못했어요. (${e.message})`, true);
  }
  renderProjects();
  renderLikes();
}

function likeText(id) {
  return likeCounts[id] === null || likeCounts[id] === undefined ? '?' : String(likeCounts[id]);
}

function thumbBox(url) {
  const box = el('div', 'thumb');
  if (isWebUrl(url)) {
    const img = el('img');
    img.src = url;
    img.alt = '';
    img.onerror = () => img.remove();
    box.append(img);
  }
  return box;
}

function renderProjects() {
  const list = $('project-list');
  list.replaceChildren(...projects.map((p, i) => {
    const li = el('li', 'admin-row');
    const info = el('div', 'row-info');
    const cat = [p.number ? `${p.number}.` : '', p.category].filter(Boolean).join(' ');
    info.append(
      el('span', 'cat', cat),
      el('strong', '', p.title),
      el('small', '', `♥ ${likeText(p.id)} · 썸네일 ${p.thumbnail_url ? '있음' : '없음'} · 첨부 ${p.file_url ? '있음' : '없음'}`),
    );
    const actions = el('div', 'row-actions');
    const up = button('▲', 'ghost small', (b) => moveProject(i, -1, b));
    up.disabled = i === 0;
    up.setAttribute('aria-label', '위로');
    const down = button('▼', 'ghost small', (b) => moveProject(i, 1, b));
    down.disabled = i === projects.length - 1;
    down.setAttribute('aria-label', '아래로');
    actions.append(
      up, down,
      button('수정', 'ghost small', () => openProjectForm(p)),
      button('삭제', 'danger small', (b) => deleteProject(p, b)),
    );
    li.append(thumbBox(p.thumbnail_url), info, actions);
    return li;
  }));
}

function showFormThumb() {
  $('pj-thumb-preview').replaceWith(Object.assign(thumbBox(editing.thumbnail_url), { id: 'pj-thumb-preview' }));
  $('pj-thumb-clear').hidden = !editing.thumbnail_url;
}

function showFormFile() {
  const link = $('pj-file-link');
  if (editing.file_url) {
    link.href = editing.file_url;
    link.textContent = decodeURIComponent(editing.file_url.split('/').pop());
  } else {
    link.removeAttribute('href');
    link.textContent = '없음';
  }
  $('pj-file-clear').hidden = !editing.file_url;
}

function openProjectForm(project) {
  editing = project
    ? { id: project.id, thumbnail_url: project.thumbnail_url, file_url: project.file_url }
    : { id: null, thumbnail_url: null, file_url: null };
  const p = project || {};
  $('project-form-title').textContent = project ? `카드 수정: ${project.title}` : '새 카드';
  $('pj-number').value = p.number || '';
  $('pj-category').value = p.category || '';
  $('pj-title').value = p.title || '';
  $('pj-description').value = p.description || '';
  $('pj-tags').value = (p.tags || []).join(', ');
  $('pj-thumb').value = '';
  $('pj-file').value = '';
  showFormThumb();
  showFormFile();
  setMsg('project-msg', '');
  $('project-form').hidden = false;
  $('project-form').scrollIntoView({ behavior: 'smooth', block: 'start' });
  $('pj-title').focus({ preventScroll: true });
}

function closeProjectForm() {
  editing = null;
  $('project-form').hidden = true;
}

async function saveProject(btn) {
  const title = $('pj-title').value.trim();
  if (!title) { setMsg('project-msg', '제목을 적어 주세요.', true); $('pj-title').focus(); return; }

  await withBusy(btn, async () => {
    try {
      const values = {
        number: $('pj-number').value.trim(),
        category: $('pj-category').value.trim(),
        title,
        description: $('pj-description').value.trim(),
        tags: $('pj-tags').value.split(',').map((t) => t.trim()).filter(Boolean),
        thumbnail_url: editing.thumbnail_url,
        file_url: editing.file_url,
      };

      // 새로 고른 파일이 있으면 먼저 올린다
      const thumbFile = $('pj-thumb').files[0];
      const attachFile = $('pj-file').files[0];
      if (thumbFile) { setMsg('project-msg', '썸네일을 올리는 중…'); values.thumbnail_url = await uploadFile(thumbFile, 'projects', IMAGE_TYPES); }
      if (attachFile) { setMsg('project-msg', '첨부 파일을 올리는 중…'); values.file_url = await uploadFile(attachFile, 'projects', FILE_TYPES); }

      setMsg('project-msg', '저장하는 중…');
      if (editing.id === null) {
        values.sort_order = projects.reduce((max, p) => Math.max(max, p.sort_order), 0) + 1;
        await restChange('projects', 'POST', values);
      } else {
        await restChange(`projects?id=eq.${editing.id}`, 'PATCH', values);
      }
      closeProjectForm();
      setMsg('project-list-msg', '카드를 저장했어요.');
      await loadProjects();
    } catch (e) {
      setMsg('project-msg', `저장하지 못했어요. (${e.message})`, true);
    }
  });
}

// 순서 바꾸기: 자리를 바꾼 뒤 1, 2, 3… 으로 다시 번호를 매긴다
async function moveProject(index, direction, btn) {
  const target = index + direction;
  if (target < 0 || target >= projects.length) return;
  const order = projects.slice();
  [order[index], order[target]] = [order[target], order[index]];

  await withBusy(btn, async () => {
    try {
      for (let i = 0; i < order.length; i++) {
        if (order[i].sort_order !== i + 1) {
          await restChange(`projects?id=eq.${order[i].id}`, 'PATCH', { sort_order: i + 1 });
        }
      }
      setMsg('project-list-msg', '순서를 바꿨어요.');
    } catch (e) {
      setMsg('project-list-msg', `순서를 바꾸지 못했어요. (${e.message})`, true);
    }
    await loadProjects();
  });
}

async function deleteProject(project, btn) {
  if (!confirm(`'${project.title}' 카드를 지울까요?\n이 카드의 좋아요 기록도 함께 지워져요. 되돌릴 수 없어요.`)) return;
  await withBusy(btn, async () => {
    try {
      await restChange(`projects?id=eq.${project.id}`, 'DELETE');
      if (editing && editing.id === project.id) closeProjectForm();
      setMsg('project-list-msg', '카드를 지웠어요.');
      await loadProjects();
    } catch (e) {
      setMsg('project-list-msg', `지우지 못했어요. (${e.message})`, true);
    }
  });
}

// ===== 좋아요 =====
function renderLikes() {
  const list = $('like-list');
  if (!projects.length) { list.replaceChildren(el('li', 'hint', '카드가 없어요.')); return; }
  list.replaceChildren(...projects.map((p) => {
    const li = el('li', 'admin-row compact');
    const info = el('div', 'row-info');
    info.append(el('strong', '', p.title));
    const count = el('span', 'like-count', `♥ ${likeText(p.id)}`);
    const reset = button('좋아요 초기화', 'danger small', (b) => resetLikes(p, b));
    reset.disabled = !likeCounts[p.id];
    const actions = el('div', 'row-actions');
    actions.append(count, reset);
    li.append(info, actions);
    return li;
  }));
}

async function resetLikes(project, btn) {
  if (!confirm(`'${project.title}' 카드의 좋아요 ${likeText(project.id)}개를 모두 지울까요?\n되돌릴 수 없어요.`)) return;
  await withBusy(btn, async () => {
    try {
      await rest(`likes?project_id=eq.${project.id}`, { method: 'DELETE' });
      const left = await countLikes(project.id);
      likeCounts[project.id] = left;
      if (left > 0) throw new Error('지워지지 않았어요. 관리자 권한을 확인해 주세요.');
      setMsg('like-msg', `'${project.title}' 좋아요를 초기화했어요.`);
    } catch (e) {
      setMsg('like-msg', `초기화하지 못했어요. (${e.message})`, true);
    }
    renderProjects();
    renderLikes();
  });
}

// ===== 방명록 =====
async function loadGuestbook() {
  const list = $('guestbook-list');
  try {
    const rows = await rest('resume_guestbook?select=*&order=created_at.desc,id.desc&limit=200');
    setMsg('guestbook-msg', rows.length ? '' : '아직 방명록 글이 없어요.');
    list.replaceChildren(...rows.map((row) => {
      const li = el('li', 'admin-row compact');
      const info = el('div', 'row-info');
      const head = el('div', 'gb-head');
      head.append(el('strong', '', row.nickname), el('time', '', formatDate(row.created_at)));
      info.append(head, el('p', 'gb-text', row.message));
      const actions = el('div', 'row-actions');
      actions.append(button('삭제', 'danger small', (b) => deleteGuestbook(row, b)));
      li.append(info, actions);
      return li;
    }));
  } catch (e) {
    list.replaceChildren();
    setMsg('guestbook-msg', `방명록을 불러오지 못했어요. (${e.message})`, true);
  }
}

async function deleteGuestbook(row, btn) {
  if (!confirm(`'${row.nickname}'님의 글을 지울까요?\n되돌릴 수 없어요.`)) return;
  await withBusy(btn, async () => {
    try {
      await restChange(`resume_guestbook?id=eq.${row.id}`, 'DELETE');
      setMsg('guestbook-msg', '글을 지웠어요.');
      await loadGuestbook();
    } catch (e) {
      setMsg('guestbook-msg', `지우지 못했어요. (${e.message})`, true);
    }
  });
}

// ===== 버튼 연결 =====
$('login-btn').addEventListener('click', login);
$('login-password').addEventListener('keydown', (e) => { if (e.key === 'Enter') login(); });
$('login-email').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('login-password').focus(); });
$('logout-btn').addEventListener('click', logout);

$('profile-save').addEventListener('click', () => saveProfile($('profile-save')));
$('pf-photo-input').addEventListener('change', changeProfilePhoto);

$('project-add').addEventListener('click', () => openProjectForm(null));
$('project-cancel').addEventListener('click', closeProjectForm);
$('project-save').addEventListener('click', () => saveProject($('project-save')));
$('pj-thumb-clear').addEventListener('click', () => { editing.thumbnail_url = null; showFormThumb(); });
$('pj-file-clear').addEventListener('click', () => { editing.file_url = null; showFormFile(); });
watchFileInput($('pj-thumb'), IMAGE_TYPES, 'project-msg');
watchFileInput($('pj-file'), FILE_TYPES, 'project-msg');

$('guestbook-reload').addEventListener('click', loadGuestbook);

// ===== 시작 =====
buildProfileFields();
session = readSavedSession();
if (session && session.user) enter();
else showView('login');
