// ===== Supabase 연결 정보 (공개 키만 쓴다) =====
const SUPABASE_URL = 'https://bkyjbnzvidfszdtzfabp.supabase.co';
const SUPABASE_KEY = 'sb_publishable_XXiUgGQz9YoCrZ7o2Diu4Q_8K-oFadt';

// Supabase 표에 요청을 보내는 함수
function api(path, options = {}) {
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: SUPABASE_KEY,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
}

// ===== 작은 도우미 함수들 =====
const $ = (id) => document.getElementById(id);

// 글자를 넣은 태그를 만든다 (textContent라서 HTML이 실행되지 않는다)
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = text;
  return node;
}

// 줄바꿈 기준으로 나누고 빈 줄은 뺀다
function splitLines(text) {
  return (text || '').split('\n').map((s) => s.trim()).filter(Boolean);
}

// http(s) 주소만 연다
function isWebUrl(url) {
  return typeof url === 'string' && /^https?:\/\//i.test(url);
}

// 브라우저에 저장해 둔 값 읽기·쓰기 (막혀 있어도 오류가 나지 않게)
function storageGet(key) {
  try { return localStorage.getItem(key); } catch (e) { return null; }
}
function storageSet(key, value) {
  try { localStorage.setItem(key, value); } catch (e) { /* 저장 못 해도 계속 */ }
}

// 이 브라우저의 이름표(client_id). 처음 한 번 만들어 저장해 둔다.
function getClientId() {
  let id = storageGet('resume_client_id');
  if (!id) {
    id = (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);
    storageSet('resume_client_id', id);
  }
  return id;
}
const clientId = getClientId();

// ===== 프로필 =====
const PERSON_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm0 2c-5.3 0-9 2.7-9 6v2h18v-2c0-3.3-3.7-6-9-6Z"/></svg>';

function showPhotoPlaceholder() {
  $('photo').innerHTML = PERSON_ICON;
}

function renderPhoto(url, name) {
  const box = $('photo');
  if (!isWebUrl(url)) { showPhotoPlaceholder(); return; }
  const img = el('img');
  img.src = url;
  img.alt = `${name || ''} 프로필 사진`;
  img.onerror = showPhotoPlaceholder;
  box.replaceChildren(img);
}

// 한 줄 소개: 쉼표 뒤에서 줄을 바꾸고, "쉼표 뒤 ~ 이름"에 파란 밑줄
function renderHeadline(headline, name) {
  const box = $('headline');
  box.replaceChildren();
  const text = headline || '';
  const nameAt = name ? text.lastIndexOf(name) : -1;
  if (nameAt < 0) { box.textContent = text; return; }

  const commaAt = text.lastIndexOf(',', nameAt);
  let start = commaAt >= 0 ? commaAt + 1 : nameAt;
  while (text[start] === ' ') start++;
  const end = nameAt + name.length;

  box.append(text.slice(0, commaAt >= 0 ? commaAt + 1 : start));
  if (commaAt >= 0) box.append(el('br'));
  box.append(el('span', 'hl', text.slice(start, end)));
  box.append(text.slice(end));
}

// EDUCATION · EXPERIENCE: 첫 줄은 굵게, 둘째 줄은 진한 회색, 나머지는 연한 회색
function renderFact(id, text) {
  const box = $(id);
  box.replaceChildren();
  splitLines(text).forEach((line, i) => {
    box.append(el(i === 0 ? 'strong' : 'span', i === 0 ? '' : i === 1 ? 'sub' : 'line', line));
  });
}

// SKILLS: 쉼표나 줄바꿈으로 나눠 점 목록으로
function renderSkills(text) {
  const box = $('skills');
  box.replaceChildren();
  (text || '').split(/[,\n]/).map((s) => s.trim()).filter(Boolean)
    .forEach((skill) => box.append(el('li', '', skill)));
}

function renderProfile(p) {
  document.title = p.name ? `${p.name} 포트폴리오` : '포트폴리오';
  renderPhoto(p.photo_url, p.name);
  $('name').textContent = p.name;
  $('title').textContent = p.title;
  $('career-badge').textContent = p.career_badge;
  $('career-badge').hidden = !p.career_badge;

  $('contact-name').textContent = p.name;
  $('contact-email').textContent = p.email;
  $('contact-email').href = p.email ? `mailto:${p.email}` : '';
  $('contact-phone').textContent = p.phone;
  $('contact-phone').href = p.phone ? `tel:${p.phone.replace(/[^0-9+]/g, '')}` : '';
  $('contact-location').textContent = p.location;

  renderHeadline(p.headline, p.name);
  $('intro').textContent = p.intro;
  renderFact('education', p.education);
  renderSkills(p.skills);
  renderFact('experience', p.experience);
  $('quote').textContent = p.quote ? `“${p.quote}”` : '';
}

async function loadProfile() {
  try {
    const res = await api('profile?select=*&id=eq.1');
    if (!res.ok) throw new Error(res.status);
    const rows = await res.json();
    if (!rows.length) { $('name').textContent = '프로필이 아직 없습니다'; showPhotoPlaceholder(); return; }
    renderProfile(rows[0]);
  } catch (e) {
    $('name').textContent = '프로필을 불러오지 못했습니다';
    showPhotoPlaceholder();
  }
}

// ===== 포트폴리오 카드 + 좋아요 =====
const HEART_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 3 4.5 6.8 4.5c2.1 0 3.6 1.1 5.2 3 1.6-1.9 3.1-3 5.2-3 3.8 0 5.9 3.9 4.4 7.3C19.5 16.4 12 21 12 21Z"/></svg>';

// 카드 하나의 좋아요 수 (줄 수만 센다)
async function countLikes(projectId) {
  const res = await api(`likes?select=id&project_id=eq.${projectId}`, {
    method: 'HEAD',
    headers: { Prefer: 'count=exact' },
  });
  if (!res.ok) return 0;
  const range = res.headers.get('content-range') || '';
  return Number(range.split('/')[1]) || 0;
}

// 이 브라우저가 이미 좋아요 누른 카드 번호들
async function loadMyLikes() {
  const res = await api(`likes?select=project_id&client_id=eq.${encodeURIComponent(clientId)}`);
  if (!res.ok) return new Set();
  const rows = await res.json();
  return new Set(rows.map((r) => r.project_id));
}

function setLikeButton(btn, count, liked) {
  btn.innerHTML = HEART_ICON;
  btn.append(el('span', '', String(count)));
  btn.classList.toggle('liked', liked);
  btn.setAttribute('aria-pressed', liked ? 'true' : 'false');
  btn.setAttribute('aria-label', liked ? `좋아요 ${count}개 (이미 눌렀어요)` : `좋아요 누르기, 지금 ${count}개`);
  btn.dataset.count = String(count);
}

async function onLike(btn, projectId) {
  if (btn.classList.contains('liked')) return; // 같은 카드는 한 번만
  btn.disabled = true;
  try {
    const res = await api('likes', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ project_id: projectId, client_id: clientId }),
    });
    if (res.ok) {
      setLikeButton(btn, Number(btn.dataset.count) + 1, true);
    } else if (res.status === 409) {
      // 이미 누른 기록이 있다 → 실제 숫자로 맞춘다
      setLikeButton(btn, await countLikes(projectId), true);
    } else {
      throw new Error(res.status);
    }
  } catch (e) {
    alert('좋아요를 남기지 못했어요. 잠시 후 다시 시도해 주세요.');
  } finally {
    btn.disabled = false;
  }
}

function buildCard(project, count, liked) {
  const openUrl = isWebUrl(project.file_url) ? project.file_url
    : isWebUrl(project.thumbnail_url) ? project.thumbnail_url : null;

  const card = el('article', 'card');

  // 브라우저 창 모양 썸네일
  const browser = el('div', 'browser');
  const bar = el('div', 'bar');
  bar.append(el('i'), el('i'), el('i'));
  const shot = el('div', 'shot');
  if (isWebUrl(project.thumbnail_url)) {
    const img = el('img');
    img.src = project.thumbnail_url;
    img.alt = '';
    img.loading = 'lazy';
    img.onerror = () => img.remove();
    shot.append(img);
  }
  browser.append(bar, shot);

  const cat = [project.number ? `${project.number}.` : '', project.category].filter(Boolean).join(' ');

  // 아래쪽: 태그 + 좋아요
  const foot = el('div', 'card-foot');
  const tags = el('div', 'tags');
  (project.tags || []).forEach((t) => tags.append(el('span', 'tag', t)));
  const likeBtn = el('button', 'like');
  likeBtn.type = 'button';
  setLikeButton(likeBtn, count, liked);
  likeBtn.addEventListener('click', (e) => {
    e.stopPropagation(); // 카드 열기와 따로 동작
    onLike(likeBtn, project.id);
  });
  likeBtn.addEventListener('keydown', (e) => e.stopPropagation());
  foot.append(tags, likeBtn);

  card.append(browser, el('span', 'cat', cat), el('h4', '', project.title), el('p', '', project.description), foot);

  // 카드를 누르면 파일(없으면 썸네일)을 새 탭으로
  if (openUrl) {
    card.classList.add('clickable');
    card.tabIndex = 0;
    card.setAttribute('role', 'link');
    card.setAttribute('aria-label', `${project.title} 자세히 보기 (새 탭)`);
    const open = () => window.open(openUrl, '_blank', 'noopener');
    card.addEventListener('click', open);
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
    });
  }
  return card;
}

async function loadProjects() {
  const box = $('cards');
  try {
    const res = await api('projects?select=*&order=sort_order.asc,id.asc');
    if (!res.ok) throw new Error(res.status);
    const projects = await res.json();
    if (!projects.length) { box.replaceChildren(el('p', 'empty', '아직 등록된 카드가 없습니다.')); return; }

    const [counts, myLikes] = await Promise.all([
      Promise.all(projects.map((p) => countLikes(p.id).catch(() => 0))),
      loadMyLikes().catch(() => new Set()),
    ]);
    box.replaceChildren(...projects.map((p, i) => buildCard(p, counts[i], myLikes.has(p.id))));
  } catch (e) {
    box.replaceChildren(el('p', 'empty', '카드를 불러오지 못했습니다.'));
  }
}

// ===== 방명록 =====
function formatDate(iso) {
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function buildGuestItem(row) {
  const li = el('li', 'gb-item');
  const head = el('header');
  const time = el('time', '', formatDate(row.created_at));
  time.dateTime = row.created_at;
  head.append(el('strong', '', row.nickname), time);
  li.append(head, el('p', '', row.message));
  return li;
}

function showEmptyGuestbook() {
  $('gb-list').replaceChildren(el('li', 'empty', '첫 번째 한마디를 남겨 주세요.'));
}

async function loadGuestbook() {
  try {
    const res = await api('resume_guestbook?select=*&order=created_at.desc,id.desc&limit=100');
    if (!res.ok) throw new Error(res.status);
    const rows = await res.json();
    if (!rows.length) { showEmptyGuestbook(); return; }
    $('gb-list').replaceChildren(...rows.map(buildGuestItem));
  } catch (e) {
    $('gb-list').replaceChildren(el('li', 'empty', '방명록을 불러오지 못했습니다.'));
  }
}

function setStatus(text, isError) {
  const s = $('gb-status');
  s.textContent = text;
  s.classList.toggle('error', !!isError);
}

async function submitGuestbook() {
  const nickname = $('gb-nickname').value.trim();
  const message = $('gb-message').value.trim();
  if (!nickname) { setStatus('별명을 적어 주세요.', true); $('gb-nickname').focus(); return; }
  if (!message) { setStatus('한마디를 적어 주세요.', true); $('gb-message').focus(); return; }

  const btn = $('gb-submit');
  btn.disabled = true;
  setStatus('남기는 중…');
  try {
    const res = await api('resume_guestbook', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ nickname, message }),
    });
    if (!res.ok) throw new Error(res.status);
    const [row] = await res.json();

    // 목록 맨 위에 붙인다
    const list = $('gb-list');
    list.querySelector('.empty')?.remove();
    list.prepend(buildGuestItem(row));

    $('gb-message').value = '';
    setStatus('남겼어요. 고맙습니다!');
  } catch (e) {
    setStatus('남기지 못했어요. 잠시 후 다시 시도해 주세요.', true);
  } finally {
    btn.disabled = false;
  }
}

$('gb-submit').addEventListener('click', submitGuestbook);

// ===== 시작 =====
loadProfile();
loadProjects();
loadGuestbook();
