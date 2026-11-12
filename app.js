'use strict';
const $ = (id) => document.getElementById(id);
const types = ['X', '뉴스', '내 생각', '기타 링크'];
const priorities = ['핵심', '참고', '미분류'];
const defaultCategories = ['AI 인프라', '거시경제', '기업', '일상'];
const headings = {today:'오늘 읽은 것', all:'전체 기록', important:'핵심 자료', uncategorized:'미분류 기록'};
const key = 'reading-library.v1';
const form = $('composer');
const fields = form.elements;
let defaultEntries = [
  {"id":"69916a7856a94621369f48d7671cefaa","created":"2026-11-11T08:33:43.544Z","title":"머스크 난관","content":"","url":"https://www.threads.com/share/BATogbj8f6","type":"기타 링크","category":"","priority":"미분류","date":"2026-11-11","published":"","source":"","thought":"","images":[]},
  {"id":"a8e05f71553b711ac6aa6d4940a69deb","created":"2026-11-10T05:51:48.179Z","title":"욕조 청소","content":"","url":"https://youtube.com/shorts/BvEnFsKU01I?si=oL1zUsFKWTpT7Q3N","type":"기타 링크","category":"생활팁","priority":"미분류","date":"2026-11-10","published":"","source":"","thought":"","images":[]},
  {"id":"5dde8282ee2fa62e3c96be65d4a29d8f","created":"2026-11-09T02:56:28.999Z","title":"빌애크먼 - 소중히 여겨야할 머스크","content":"","url":"https://x.com/cb_doge/status/2119562370880278762","type":"X","category":"Boyage","priority":"미분류","date":"2026-11-09","published":"","source":"","thought":"","images":[]},
  {"id":"d9644eeab364941d8e05a704387c57cb","created":"2026-11-09T04:53:02.375Z","title":"모든 것을 다 바쳤다. 진인사대천명","content":"첨부 댓글","url":"https://youtube.com/shorts/Nl9eJEMw86E?si=RQ7wCZV_Ng0XO2NI","type":"기타 링크","category":"Boyage","priority":"미분류","date":"2026-11-09","published":"","source":"","thought":"","images":[]},
  {"id":"c56b53a4f8e6d9b392640f367e6ef738","created":"2026-11-09T06:41:33.558Z","title":"VIX_VIX3M","content":"","url":"https://x.com/kashin_moneylab/status/2119440436670738737","type":"X","category":"거시경제","priority":"미분류","date":"2026-11-09","published":"","source":"","thought":"","images":[]},
  {"id":"bac89fedfaef9adfb3814d75753e1dfb","created":"2026-11-09T06:17:52.932Z","title":"니체 신은 죽었다. 인간은 어떻게 살아갈 수 있을까","content":"","url":"https://youtube.com/post/UgkxcZCdSW2pQuCnEbcQvY_ZmwXC-A5lT-Qh?surface=shorts&data=AUylCEswP6fqC-HX-YzdQeK80qIDPMP4mXwfe-xfFh66Db5pyfNWMI6NyKSHfYraR6exqECMoAvheSnF&si=8pl5gfqw3a-wvyoe","type":"기타 링크","category":"","priority":"미분류","date":"2026-11-09","published":"","source":"","thought":"","images":[]},
  {"id":"9481cabb022718472f6a5862f573036c","created":"2026-11-09T00:54:46.266Z","title":"주식 단기예측 GEX, Gamma, NQ","content":"","url":"https://x.com/dubidubabap/status/2119371656078733688","type":"X","category":"","priority":"미분류","date":"2026-11-09","published":"","source":"","thought":"","images":[]},
  {"id":"5bb45fe2e2fd559aedaadf78611479da","created":"2026-11-08T15:20:06.849Z","title":"닷컴 버블의 광기","content":"","url":"https://x.com/USAnt_IDEA/status/2118700192602230818","type":"X","category":"","priority":"미분류","date":"2026-11-09","published":"","source":"","thought":"","images":[]},
  {"id":"2b8a00236caeeede642ff85b434f0f55","created":"2026-11-08T15:31:58.676Z","title":"블레이드 러너-빗 속의 눈물","content":"","url":"https://youtube.com/shorts/RRt_RDjHeFo?si=O0FfZYZcy3izjPLB","type":"기타 링크","category":"","priority":"미분류","date":"2026-11-09","published":"","source":"","thought":"","images":[]},
  {"id":"d23a81d4648ae8016bfaf98b763b7d17","created":"2026-11-08T15:17:58.599Z","title":"ZeeContrarian 게시글","content":"","url":"https://x.com/ZeeContrarian1/status/2119388428035146006","type":"X","category":"","priority":"미분류","date":"2026-11-09","published":"","source":"","thought":"","images":[]},
  {"id":"7849b52e675154c006112c9fef093448","created":"2026-11-08T15:18:53.587Z","title":"DrJStrategy 게시글","content":"","url":"https://x.com/DrJStrategy/status/2119257690891276385","type":"X","category":"","priority":"미분류","date":"2026-11-09","published":"","source":"","thought":"","images":[]}
];
let defaultCategoriesWithUser = ['AI 인프라', '거시경제', '기업', '일상', 'Boyage', '생활팁'];
let data = {entries:[], categories:defaultCategoriesWithUser};
let view = 'today';
let category = '';
let type = '';
let editId = null;
let activeId = null;
let draftImages = [];
let photoProcessing = false;
const listModeKey = 'reading-library.list-mode';
let listMode = 'preview';
try { listMode = localStorage.getItem(listModeKey) === 'title' ? 'title' : 'preview'; } catch {}
const shell = document.querySelector('.shell');
const themeKey = 'reading-library.theme';
const mobileLayout = matchMedia('(max-width: 790px)');

function applyTheme(theme, reloadCards = false) {
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]').content = theme === 'dark' ? '#000000' : '#f0f1f2';
  for (const toggle of document.querySelectorAll('.theme-toggle')) {
    toggle.setAttribute('aria-pressed',String(theme === 'dark'));
    toggle.textContent = theme === 'dark' ? '라이트 모드' : '다크 모드';
  }
  if (reloadCards) {
    for (const container of [composerPreview,readerPreview,...document.querySelectorAll('.x-preview-feed')]) {
      if (container.dataset.postId) showXPost(container,container.dataset.postId,true);
    }
  }
}

function setShelfMenu(open) {
  shell.dataset.menu = String(open);
  $('shelf-menu').setAttribute('aria-expanded',String(open));
  $('shelf-shade').hidden = !open;
  document.querySelector('.list-pane').inert = open;
  document.querySelector('.reader').inert = open;
  if (open) $('views').querySelector('[aria-pressed=true]')?.focus();
}

function openSharedRecord() {
  const locationUrl = new URL(location.href);
  const names = ['shared_url','shared_text','shared_title'];
  if (!names.some(name => locationUrl.searchParams.has(name))) return;
  const [url,text,title] = names.map(name => locationUrl.searchParams.get(name)?.trim() || '');
  for (const name of names) locationUrl.searchParams.delete(name);
  history.replaceState(history.state,'',locationUrl.pathname + locationUrl.search + locationUrl.hash);
  const direct = pastedUrl(url) || linksIn(url)[0]?.url;
  const sharedText = text || (!direct ? url : '');
  if (!direct && !sharedText && !title) return;
  fields.content.value = [sharedText, direct && !linksIn(sharedText).some(link => link.url === direct) ? direct : '']
    .filter(Boolean).join('\n').slice(0,fields.content.maxLength) || title.slice(0,fields.content.maxLength);
  shell.dataset.detail = 'false';
  showComposer(true);
  message('공유한 내용을 받았습니다. 기록 저장을 눌러 서가에 추가하세요.');
}

function showComposer(show, focus = false) {
  form.hidden = !show;
  $('add-entry').setAttribute('aria-expanded',String(show));
  updateComposerPreview();
  if (focus) {
    shell.dataset.detail = 'false';
    fields.content.focus();
  }
}

function newId() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, byte => byte.toString(16).padStart(2,'0')).join('');
}
function today() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone:'Asia/Seoul', year:'numeric', month:'2-digit', day:'2-digit'
  }).formatToParts(new Date());
  const partsByType = Object.fromEntries(parts.map(({type,value}) => [type,value]));
  return [partsByType.year, partsByType.month, partsByType.day].join('-');
}
function dateLabel(day) {
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone:'Asia/Seoul', month:'long', day:'numeric', weekday:'short',
    ...(day.slice(0,4) === today().slice(0,4) ? {} : {year:'numeric'})
  }).format(new Date(day + 'T12:00:00+09:00'));
}
function validDate(day) {
  if (typeof day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
  const parsed = new Date(day + 'T00:00:00Z');
  return Number.isFinite(+parsed) && parsed.toISOString().slice(0,10) === day;
}
function webUrl(value) {
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) && url.hostname && !url.username && !url.password ? url.href : '';
  } catch {
    return '';
  }
}
const bareHost = /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}(?::\d+)?(?:[/?#][^\s<>]*)?$/i;

function pastedUrl(text) {
  if (/\s/.test(text)) return '';
  return webUrl(bareHost.test(text) ? 'https://' + text : text);
}

function linksIn(text) {
  const candidates = /(?<![\w@./:+-])(?:https?:\/\/[^\s<>"“”‘’]+|(?:www\.[a-z\d.-]+|(?:[a-z\d-]+\.)*(?:x\.com|twitter\.com|t\.co))(?::\d+)?(?:[/?#][^\s<>"“”‘’]*)?(?![\w.-])|(?:[a-z\d-]+\.)+[a-z]{2,}(?::\d+)?\/[^\s<>"“”‘’]*)/gi;
  const links = [];
  for (const match of text.matchAll(candidates)) {
    let label = match[0].replace(/[.,!?;:。！？、，…]+$/u,'');
    const pairs = {')':'(', ']':'[', '}':'{'};
    while (pairs[label.at(-1)]) {
      const end = label.at(-1);
      if (label.split(end).length <= label.split(pairs[end]).length) break;
      label = label.slice(0,-1);
    }
    const url = pastedUrl(label);
    if (url) links.push({label,url,index:match.index});
  }
  if (!links.length && bareHost.test(text.trim())) {
    const label = text.trim();
    const url = pastedUrl(label);
    if (url) links.push({label,url,index:text.indexOf(label)});
  }
  return links;
}

function originalUrl(entry) {
  return sourceUrls(entry)[0] || '';
}
function sourceUrls(entry) {
  return [...new Set([entry.url,...linksIn(entry.content).map(link => link.url),...linksIn(entry.thought || '').map(link => link.url)].filter(Boolean))];
}
function withoutOriginalLink(entry, text) {
  if (!text) return '';
  const sources = new Set(sourceUrls(entry));
  const matches = linksIn(text).filter(link => sources.has(link.url)).sort((a,b) => b.index - a.index);
  let visible = text;
  for (const match of matches) visible = visible.slice(0,match.index) + visible.slice(match.index + match.label.length);
  return visible.replace(/[ \t]+\n/g,'\n').trim();
}

function validate(backup) {
  if (!Array.isArray(backup?.entries) || !Array.isArray(backup?.categories)) throw Error('지원되는 백업 형식이 아닙니다.');
  const limits = {id:100,title:240,content:50000,url:4000,source:160,thought:50000,category:24,created:40};
  const ids = new Set();
  const categories = new Set(backup.categories);
  if ([...categories].some(value => typeof value !== 'string' || !value.trim() || value.length > 24)) throw Error('카테고리 형식이 올바르지 않습니다.');
  const entries = backup.entries.map(entry => {
    const images = entry?.images ?? [];
    if (!entry || Object.keys(limits).some(key => typeof entry[key] !== 'string' || entry[key].length > limits[key]) ||
        !entry.id || ids.has(entry.id) || !types.includes(entry.type) || !priorities.includes(entry.priority) ||
        !validDate(entry.date) || (entry.published !== '' && !validDate(entry.published)) ||
        (entry.url && !webUrl(entry.url)) || (entry.category && !categories.has(entry.category)) ||
        !Array.isArray(images) || images.length > 4 || images.some(image => typeof image !== 'string' || image.length > 500000 ||
          !/^data:image\/(?:webp|jpeg|png);base64,[A-Za-z0-9+/]+={0,2}$/.test(image))) {
      throw Error('기록 형식이 올바르지 않습니다.');
    }
    ids.add(entry.id);
    return {...entry,images};
  });
  return {entries, categories:[...categories]};
}
function message(text, error = false) {
  $('status').textContent = text;
  $('status').classList.toggle('error',error);
}
function persist(next, fromDrive = false) {
  try {
    if (!fromDrive && !CloudSync.enabled()) next = DriveSync.capture(data,next);
    const previous=data;
    localStorage.setItem(key, JSON.stringify(next));
    try { if(!fromDrive) CloudSync.capture(previous,next); }
    catch(error) { localStorage.setItem(key,JSON.stringify(previous)); message(error.message,true); return false; }
    data = next;
    if (!fromDrive) { if(CloudSync.enabled()) CloudSync.queue(); else DriveSync.queue(); }
    return true;
  } catch {
    message('기록을 저장할 수 없습니다. 사진 첨부를 줄이거나 브라우저 저장 공간을 확인해 주세요.',true);
    return false;
  }
}
try {
  const stored = localStorage.getItem(key);
  if (stored) {
    const parsed = JSON.parse(stored);
    data = DriveSync.restore(parsed,validate(parsed));
  } else {
    data = {entries: defaultEntries, categories: defaultCategoriesWithUser};
    localStorage.setItem(key, JSON.stringify(data));
  }
} catch {
  data = {entries: defaultEntries, categories: defaultCategoriesWithUser};
}
function make(tag, text, className) {
  const el = document.createElement(tag);
  if (text !== undefined) el.textContent = text;
  if (className) el.className = className;
  return el;
}
function externalLink(url, label, className) {
  const link = make('a',label,className);
  link.href = url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  return link;
}
function showPhoto(source) {
  $('photo-viewer-image').src = source;
  $('photo-viewer').showModal();
}
function photoGallery(images = [],className = '') {
  const gallery = make('div',undefined,'photo-grid ' + className);
  images.forEach((source,index) => {
    const figure = make('figure',undefined,'photo-figure');
    const image = make('img');
    image.src = source;
    image.alt = '첨부 사진 ' + (index + 1);
    image.loading = 'lazy';
    const open = button('',() => showPhoto(source),'photo-card');
    open.setAttribute('aria-label','첨부 사진 ' + (index + 1) + ' 크게 보기');
    open.append(image);
    figure.append(open);
    gallery.append(figure);
  });
  return gallery;
}
function renderDraftPhotos() {
  const gallery = $('draft-photos');
  gallery.replaceChildren();
  draftImages.forEach((source,index) => {
    const figure = make('figure',undefined,'photo-figure');
    const image = make('img');
    image.src = source;
    image.alt = '첨부할 사진 ' + (index + 1);
    const open = button('',() => showPhoto(source),'photo-card');
    open.setAttribute('aria-label','첨부할 사진 ' + (index + 1) + ' 크게 보기');
    open.append(image);
    const remove = button('×',() => {
      draftImages.splice(index,1);
      renderDraftPhotos();
      $('photo-hint').textContent = draftImages.length + '/4장 첨부됨';
    },'remove-photo');
    remove.setAttribute('aria-label','사진 첨부 취소');
    figure.append(open,remove);
    gallery.append(figure);
  });
  $('photo-hint').textContent = draftImages.length ? draftImages.length + '/4장 첨부됨' : '최대 4장 · 자동으로 용량을 줄여 저장';
}
async function compressPhoto(file) {
  if (!file.type.startsWith('image/')) throw Error('사진 파일만 첨부할 수 있습니다.');
  if (file.size > 20000000) throw Error('사진 한 장은 20MB 이하로 선택해 주세요.');
  if (!('createImageBitmap' in window)) throw Error('이 브라우저에서는 사진 처리를 지원하지 않습니다.');
  const bitmap = await createImageBitmap(file);
  if (bitmap.width * bitmap.height > 60000000) {
    bitmap.close();
    throw Error('사진 해상도가 너무 큽니다. 해상도를 줄여 다시 선택해 주세요.');
  }
  let scale = Math.min(1,1400 / Math.max(bitmap.width,bitmap.height));
  let quality = .8;
  let blob;
  for (let attempt = 0; attempt < 8; attempt++) {
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1,Math.round(bitmap.width * scale));
    canvas.height = Math.max(1,Math.round(bitmap.height * scale));
    canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);
    blob = await new Promise(resolve => canvas.toBlob(resolve,'image/webp',quality));
    if (!blob) break;
    if (blob.size <= 280000) break;
    if (quality > .6) quality -= .08;
    else {scale *= .82; quality = .76;}
  }
  bitmap.close();
  if (!blob || blob.size > 300000) throw Error('사진 용량을 줄이지 못했습니다. 더 작은 사진을 선택해 주세요.');
  const source = await new Promise((resolve,reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(Error('사진을 읽지 못했습니다.'));
    reader.readAsDataURL(blob);
  });
  return source;
}
async function addPhotos(files) {
  if (photoProcessing) return;
  const candidates = [...files].filter(file => file.type.startsWith('image/'));
  if (!candidates.length) return;
  const room = Math.max(0,4 - draftImages.length);
  if (!room) {message('기록마다 사진은 최대 4장까지 첨부할 수 있습니다.',true); return;}
  photoProcessing = true;
  $('save').disabled = true;
  $('photo-files').disabled = true;
  let added = 0;
  let error = '';
  try {
    for (const file of candidates.slice(0,room)) {
      try {draftImages.push(await compressPhoto(file)); added++;}
      catch (problem) {error = problem.message || '사진을 첨부하지 못했습니다.';}
    }
  } finally {
    photoProcessing = false;
    $('save').disabled = false;
    $('photo-files').disabled = false;
    $('photo-files').value = '';
    renderDraftPhotos();
  }
  if (!error && candidates.length > room) error = '기록마다 사진은 최대 4장까지 첨부할 수 있어 나머지 사진은 제외했습니다.';
  message(error || (added ? '사진 ' + added + '장을 첨부했습니다.' : '사진을 첨부하지 못했습니다.'),Boolean(error || !added));
}

function xPostId(address) {
  if (!address) return '';
  const url = new URL(address);
  if (!/^(?:(?:www|mobile)\.)?(?:x\.com|twitter\.com)$/i.test(url.hostname)) return '';
  return url.pathname.match(/^\/(?:i\/web|[a-z0-9_]+)\/status\/([0-9]{1,20})(?:\/|$)/i)?.[1] || '';
}
function youtubeVideoId(address) {
  if (!address) return '';
  try {
    const url = new URL(address);
    const host = url.hostname.toLowerCase().replace(/^www\./,'');
    if (host === 'youtu.be') return url.pathname.split('/').filter(Boolean)[0]?.match(/^[\w-]{11}$/)?.[0] || '';
    if (!['youtube.com','m.youtube.com','youtube-nocookie.com'].includes(host)) return '';
    const path = url.pathname.split('/').filter(Boolean);
    const id = url.searchParams.get('v') || (['embed','shorts','live'].includes(path[0]) ? path[1] : '');
    return id && /^[\w-]{11}$/.test(id) ? id : '';
  } catch { return ''; }
}

const xEmbedOrigin = 'https://platform.twitter.com';
const composerPreview = $('composer-x-preview');
const readerPreview = $('reader-x-preview');
const composerYoutubePreview = $('composer-youtube-preview');
const readerYoutubePreview = $('reader-youtube-preview');
let nextXFrame = 0;

function showYoutubeVideo(container,id) {
  container.replaceChildren();
  container.hidden = !id;
  if (!id) return;
  const frame = make('iframe',undefined,'youtube-frame');
  frame.title = 'YouTube 동영상 미리보기';
  frame.loading = 'lazy';
  frame.referrerPolicy = 'strict-origin-when-cross-origin';
  frame.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
  frame.allowFullscreen = true;
  frame.src = 'https://www.youtube-nocookie.com/embed/' + encodeURIComponent(id) + '?rel=0';
  container.append(frame);
}

function showXPost(container, id, reload = false, retries = container === readerPreview ? 1 : 0) {
  if (container.dataset.postId === id && !reload) return;
  container.dataset.postId = id;
  container.dataset.state = id ? 'loading' : '';
  container.replaceChildren();
  container.hidden = !id;
  if (!id) return;

  const status = make('p','X 게시물을 불러오는 중…','x-preview-status');
  status.setAttribute('role','status');
  const frame = make('iframe',undefined,'x-preview-frame');
  frame.title = 'X 게시물 미리보기';
  frame.loading = 'lazy';
  frame.id = container.id + '-frame-' + (++nextXFrame);
  frame.dataset.retries = String(retries);
  frame.setAttribute('sandbox','allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox');
  frame.setAttribute('allow','fullscreen');
  frame.referrerPolicy = 'no-referrer';
  frame.classList.add('loading');
  frame.inert = true;

  const url = new URL('/embed/Tweet.html', xEmbedOrigin);
  url.search = new URLSearchParams({
    id, embedId:frame.id, origin:location.origin, dnt:'true', lang:'ko', theme:document.documentElement.dataset.theme || 'light',
    frame:'false', hideThread:'true', hideCard:'false'
  });
  frame.src = url.href;
  container.append(status,frame);
  setTimeout(() => handleXFailure(container,frame),12000);
}

function handleXFailure(container, frame) {
  if (frame.parentElement !== container || container.dataset.state !== 'loading') return;
  const id = container.dataset.postId;
  const retries = Number(frame.dataset.retries);
  if (retries > 0) {
    container.dataset.state = 'retrying';
    setTimeout(() => {
      if (frame.parentElement === container && container.dataset.state === 'retrying') {
        showXPost(container,id,true,retries - 1);
      }
    },500);
    return;
  }

  container.dataset.state = 'unavailable';
  frame.hidden = true;
  const status = container.querySelector('.x-preview-status');
  status.replaceChildren('X 미리보기를 불러올 수 없습니다. ',
    button('다시 불러오기',() => showXPost(container,id,true),'quiet'),' ',
    externalLink('https://x.com/i/web/status/' + id,'X에서 열기 ↗'));
}

function keepLoadedXPost(id) {
  if (!id || composerPreview.dataset.postId !== id || composerPreview.dataset.state !== 'ready' ||
      typeof readerPreview.moveBefore !== 'function') return;
  const frame = composerPreview.querySelector('iframe');
  const status = composerPreview.querySelector('.x-preview-status');
  readerPreview.replaceChildren();
  readerPreview.hidden = false;
  try {
    // Moving the connected iframe preserves the post already rendered by X.
    readerPreview.moveBefore(frame,null);
  } catch {
    readerPreview.dataset.postId = '';
    return;
  }
  readerPreview.prepend(status);
  readerPreview.dataset.postId = id;
  readerPreview.dataset.state = 'ready';
}

window.addEventListener('message',event => {
  if (event.origin !== xEmbedOrigin) return;
  const message = event.data?.['twttr.embed'];
  const method = message?.method;
  if (!['twttr.private.results','twttr.private.resize','twttr.private.no_results'].includes(method)) return;
  for (const container of document.querySelectorAll('.x-preview')) {
    const frame = container.querySelector('iframe');
    if (!frame || frame.contentWindow !== event.source) continue;
    const status = container.querySelector('.x-preview-status');
    if (method === 'twttr.private.no_results') {
      if (frame.dataset.noResults) return;
      frame.dataset.noResults = 'true';
      frame.hidden = true;
      status.hidden = false;
      if (container.dataset.state === 'ready') container.dataset.state = 'loading';
      handleXFailure(container,frame);
      return;
    }
    if (frame.dataset.noResults) return;
    if (method === 'twttr.private.results') frame.dataset.hasPost = 'true';
    else {
      const height = Number(message.params?.[0]?.height);
      if (Number.isFinite(height) && height > 20) {
        frame.dataset.height = Math.min(1800,Math.ceil(height + 4)) + 'px';
      }
    }
    if (!frame.dataset.hasPost || !frame.dataset.height) return;
    container.dataset.state = 'ready';
    frame.style.height = frame.dataset.height;
    frame.classList.remove('loading');
    frame.inert = false;
    frame.hidden = false;
    status.hidden = true;
    return;
  }
});

function xPostIn(text) {
  for (const {url} of linksIn(text)) {
    const id = xPostId(url);
    if (id) return id;
  }
  return '';
}

function updateComposerPreview() {
  if (form.hidden) {
    showXPost(composerPreview,'');
    showYoutubeVideo(composerYoutubePreview,'');
    return;
  }
  showXPost(composerPreview,xPostId(pastedUrl(fields.url.value.trim())) || xPostIn(fields.content.value));
  const links = [pastedUrl(fields.url.value.trim()),...linksIn(fields.content.value).map(link => link.url)].filter(Boolean);
  showYoutubeVideo(composerYoutubePreview,links.map(youtubeVideoId).find(Boolean) || '');
}

function linkedText(text) {
  const paragraph = make('p');
  let start = 0;
  for (const {label,url,index} of linksIn(text)) {
    paragraph.append(text.slice(start,index),externalLink(url,label));
    start = index + label.length;
  }
  paragraph.append(text.slice(start));
  return paragraph;
}

function button(text, callback, className = 'quiet') {
  const el = make('button',text,className);
  el.type = 'button';
  el.addEventListener('click',callback);
  return el;
}
function resetComposer() {
  editId = null;
  form.reset();
  draftImages = [];
  renderDraftPhotos();
  fields.date.value = $('filter-date').value || today();
  fields.category.value = category;
  $('details').open = false;
  $('cancel').textContent = '닫기';
  showComposer(false);
  $('composer-label').textContent = '빠른 저장';
  $('save').textContent = '기록 저장';
}
function syncCategories() {
  const current = fields.category.value;
  fields.category.replaceChildren(new Option('미분류',''), ...data.categories.map(name => new Option(name,name)));
  fields.category.value = data.categories.includes(current) ? current : '';
}
function categoryStatus(text,error = false) {
  const status = $('category-status');
  status.textContent = text;
  status.classList.toggle('error',error);
}
function renderCategoryManager() {
  const counts = new Map();
  for (const entry of data.entries) counts.set(entry.category,(counts.get(entry.category) || 0) + 1);
  const list = $('category-manage-list');
  list.replaceChildren();
  if (!data.categories.length) {
    list.append(make('p','아직 카테고리가 없습니다.','empty'));
    return;
  }
  data.categories.forEach((name,index) => {
    const row = make('div',undefined,'category-manage-row');
    const label = make('div',undefined,'category-manage-name');
    label.append(document.createTextNode(name),make('span',(counts.get(name) || 0) + '건','category-manage-count'));
    const actions = make('div',undefined,'category-manage-actions');
    const up = button('↑',() => moveCategory(index,-1),'outline');
    up.setAttribute('aria-label',name + ' 위로 이동');
    up.disabled = index === 0;
    const down = button('↓',() => moveCategory(index,1),'outline');
    down.setAttribute('aria-label',name + ' 아래로 이동');
    down.disabled = index === data.categories.length - 1;
    const remove = button('삭제',() => confirmCategoryDelete(name),'outline delete-category');
    remove.setAttribute('aria-label',name + ' 삭제');
    actions.append(up,down,remove);
    row.append(label,actions);
    list.append(row);
  });
}
function moveCategory(index,offset) {
  const target = index + offset;
  if (target < 0 || target >= data.categories.length) return;
  const categories = [...data.categories];
  [categories[index],categories[target]] = [categories[target],categories[index]];
  if (!persist({...data,categories})) return;
  syncCategories();
  render();
  renderCategoryManager();
  categoryStatus('카테고리 순서를 저장했습니다.');
}
function confirmCategoryDelete(name) {
  const count = data.entries.filter(entry => entry.category === name).length;
  $('category-delete-dialog').dataset.category = name;
  $('category-delete-copy').textContent = count
    ? '“' + name + '” 카테고리와 기록 ' + count + '건을 삭제할까요? 기록은 삭제되지 않고 미분류로 이동합니다.'
    : '“' + name + '” 카테고리를 삭제할까요?';
  $('category-delete-dialog').showModal();
}
function deleteCategory(name) {
  const categories = data.categories.filter(item => item !== name);
  const entries = data.entries.map(entry => entry.category === name ? {...entry,category:''} : entry);
  if (!persist({...data,categories,entries})) return;
  syncCategories();
  if (category === name) navigate('today');
  else render();
  renderCategoryManager();
  categoryStatus('카테고리를 삭제했습니다. 연결된 기록은 미분류로 이동했습니다.');
}
function navigate(next, shelf = '') {
  view = next;
  category = shelf;
  activeId = null;
  shell.dataset.detail = 'false';
  if (shell.dataset.menu === 'true') setShelfMenu(false);
  $('filter-date').value = '';
  $('filter-priority').value = '';
  $('search').value = '';
  type = '';
  if (!editId) {
    fields.category.value = shelf;
    fields.date.value = today();
  }
  render();
}
function navButton(label, selected, action, icon, count) {
  const el = button('',action);
  const glyph = make('span',icon,'nav-icon');
  glyph.setAttribute('aria-hidden','true');
  el.append(glyph,make('span',label));
  if (count !== undefined) el.append(make('span',String(count),'nav-count'));
  el.setAttribute('aria-pressed',String(selected));
  return el;
}
function titleOf(entry) {
  return entry.title || entry.content.split('\n').find(line => line.trim())?.trim().slice(0,90) ||
    (entry.url ? new URL(entry.url).hostname + ' · 저장한 링크' : entry.thought.slice(0,90) || '기록');
}
function edit(entry) {
  editId = entry.id;
  draftImages = [...(entry.images || [])];
  renderDraftPhotos();
  for (const name of ['title','content','url','source','thought','category','type','priority','date','published']) {
    fields[name].value = entry[name];
  }
  $('details').open = true;
  $('cancel').textContent = '편집 취소';
  showComposer(true,true);
  $('composer-label').textContent = '기록 편집';
  $('save').textContent = '변경 저장';
  fields.content.focus();
  form.scrollIntoView({block:'center'});
}
function changePriority(entry) {
  const priority = entry.priority === '핵심' ? '미분류' : '핵심';
  const next = {...data, entries:data.entries.map(item => item.id === entry.id ? {...item,priority} : item)};
  if (persist(next)) {
    if (editId === entry.id) fields.priority.value = priority;
    render();
    message('중요도를 변경했습니다.');
  }
}
const deleteDialog = $('confirm-delete');
function remove(entry) {
  deleteDialog.returnValue = '';
  deleteDialog.addEventListener('close', () => {
    if (deleteDialog.returnValue !== 'delete') return;
    if (persist({...data, entries:data.entries.filter(item => item.id !== entry.id)})) {
      if (editId === entry.id) resetComposer();
      render();
      message('기록을 삭제했습니다.');
    }
  }, {once:true});
  deleteDialog.showModal();
}
const tileStyles = {
  X:['𝕏','x'],
  뉴스:['▤','news'],
  '내 생각':['✎','thought'],
  '기타 링크':['↗','link']
};
const examples = [
  {id:'sample-power', type:'X', category:'AI 인프라', priority:'핵심', source:'현장 관찰', title:'변압기 납기 관련 현장 메모',
    content:'일부 현장에서 변압기 인도 일정이 늦어졌다는 언급을 발견했다. 같은 이야기가 서로 다른 현장에서도 반복되는지 찾아볼 것.',
    thought:'다음 실적 발표에서 실제 납기와 수주잔고를 확인하기.'},
  {id:'sample-factory', type:'뉴스', category:'기업', priority:'참고', source:'산업 뉴스', title:'전력장비 공장 증설 소식',
    content:'증설 발표를 볼 때는 투자 규모, 생산 시작 시점, 주력 품목을 함께 적어두면 나중에 비교하기 좋다.'},
  {id:'sample-rates', type:'내 생각', category:'거시경제', priority:'참고', title:'금리가 움직일 때 같이 볼 지표',
    content:'금리의 방향과 함께 현재 수준을 기록해 두고, 나스닥과 방어주가 다른 방향으로 움직인 날을 따로 모아본다.'},
  {id:'sample-reading', type:'기타 링크', category:'일상', priority:'미분류', title:'다시 읽고 싶은 글',
    content:'좋았던 문장과 다시 읽고 싶은 이유를 한 줄씩 남긴다.'}
];
function entryRow(entry, preview) {
  const row = button('',() => {
    activeId = entry.id;
    const records = $('records');
    records.querySelector('[aria-pressed=true]')?.setAttribute('aria-pressed','false');
    row.setAttribute('aria-pressed','true');
    shell.dataset.detail = 'true';
    showReader(entry,preview,true);
    if (mobileLayout.matches) $('back-list').focus();
  },'entry-row');
  row.setAttribute('aria-pressed',String(activeId === entry.id));
  const [glyph,style] = tileStyles[entry.type];
  const tile = make('span',glyph,'tile ' + style);
  tile.setAttribute('aria-hidden','true');
  const copy = make('span',undefined,'row-copy');
  const url = originalUrl(entry);
  const description = [entry.category, entry.source].filter(Boolean).join(' · ');
  copy.append(make('span',titleOf(entry),'row-title'));
  if (listMode === 'preview') copy.append(make('span',description,'row-preview'));
  row.append(tile,copy,make('span',entry.priority === '핵심' ? '★' : '', 'row-star'));
  const item = make('div',undefined,'entry-item');
  item.append(row);
  if (listMode === 'preview') {
    const post = make('div',undefined,'feed-preview');
    const postId = xPostId(url) || xPostIn(entry.content);
    if (postId) {
      const embed = make('div',undefined,'x-preview x-preview-feed');
      embed.id = 'list-x-' + entry.id;
      post.append(embed);
      showXPost(embed,postId);
    } else if (sourceUrls(entry).map(youtubeVideoId).find(Boolean)) {
      const video = make('div',undefined,'youtube-preview youtube-preview-feed');
      post.append(video);
      showYoutubeVideo(video,sourceUrls(entry).map(youtubeVideoId).find(Boolean));
    } else {
      const body = withoutOriginalLink(entry,entry.content) || withoutOriginalLink(entry,entry.thought);
      if (body) {
        const characters = Array.from(body);
        const teaser = characters.slice(0,320).join('');
        post.append(make('p',teaser,'feed-text'));
        if (characters.length > 320 || (withoutOriginalLink(entry,entry.content) && withoutOriginalLink(entry,entry.thought))) {
          const more = make('details',undefined,'feed-more');
          more.append(make('summary','더 보기'));
          const extra = make('div',undefined,'feed-more-content');
          if (characters.length > 320) extra.append(linkedText(characters.slice(320).join('')));
          if (entry.content && entry.thought) extra.append(make('section','내 메모','feed-note-title'),linkedText(withoutOriginalLink(entry,entry.thought)));
          more.append(extra);
          post.append(more);
        }
      } else if (url) {
        post.append(make('p','저장한 원문 링크 · 오른쪽 미리보기에서 내용을 확인할 수 있습니다.','feed-text muted'));
      }
    }
    if (entry.images?.length) post.append(photoGallery(entry.images,'feed-images'));
    item.append(post);
  }
  return item;
}
function showReader(entry, preview, retryFailed = false) {
  const actions = $('reader-actions');
  const article = $('reader-content');
  actions.replaceChildren();
  article.replaceChildren();
  const url = entry ? originalUrl(entry) : '';
  const postId = entry ? xPostId(url) || xPostIn(entry.content) : '';
  showXPost(readerPreview,postId,retryFailed && readerPreview.dataset.state === 'unavailable');
  const videoId = entry ? sourceUrls(entry).map(youtubeVideoId).find(Boolean) || '' : '';
  showYoutubeVideo(readerYoutubePreview,videoId);
  if (!entry) {
    article.append(make('div','나의 읽기 서가','eyebrow'),make('h2','읽을 기록을 선택하세요'),make('p','가운데 목록에서 기록을 열면 여기에 내용과 메모가 표시됩니다.'));
    return;
  }
  const sources = entry ? sourceUrls(entry) : [];
  if (sources.length === 1) {
    article.append(externalLink(sources[0],'원문 ↗','reader-source-single'));
  } else if (sources.length > 1) {
    const source = make('details',undefined,'reader-source');
    source.append(make('summary','원문 (' + sources.length + ')'));
    const address = make('div',undefined,'reader-source-link');
    sources.forEach(item => address.append(externalLink(item,item,'reader-source-item')));
    source.append(address);
    article.append(source);
  }
  const meta = make('div',undefined,'reader-meta');
  meta.append(make('span',entry.type,'tag'),make('span',entry.category || '미분류'),
    make('span',entry.priority,entry.priority === '핵심' ? 'tag strong' : 'tag'));
  if (preview) meta.append(make('span','예시 기록','sample-mark'));
  article.append(meta,make('h2',titleOf(entry)));
  const info = [entry.source || (url ? new URL(url).hostname : ''),entry.date && '읽은 날 ' + entry.date,entry.published && '게시일 ' + entry.published].filter(Boolean);
  if (info.length) article.append(make('div',info.join(' · '),'reader-meta'));
  const visibleContent = withoutOriginalLink(entry,entry.content);
  const visibleThought = withoutOriginalLink(entry,entry.thought);
  if (visibleContent) {
    const section = make('section',undefined,'reader-section');
    section.append(make('h3',entry.type === '내 생각' ? '내용' : '저장한 내용'),linkedText(visibleContent));
    article.append(section);
  }
  if (visibleThought) {
    const section = make('section',undefined,'reader-section note');
    section.append(make('h3','내 메모'),linkedText(visibleThought));
    article.append(section);
  }
  if (entry.images?.length) {
    const section = make('section',undefined,'reader-section reader-images');
    section.append(make('h3','첨부 사진'),photoGallery(entry.images));
    article.append(section);
  }
  if (postId) actions.append(button('X 카드 새로고침',() => showXPost(readerPreview,postId,true)));
  if (!preview) {
    actions.append(button(entry.priority === '핵심' ? '★ 핵심 해제' : '☆ 핵심 표시',() => changePriority(entry)),
      button('편집',() => edit(entry)),button('삭제',() => remove(entry)));
  }
}
function render() {
  const now = today();
  $('today').dateTime = now;
  $('today').textContent = dateLabel(now);
  $('view-title').textContent = category || headings[view];
  $('views').replaceChildren(...Object.entries(headings).map(([name,label]) => navButton(label, view === name,() => navigate(name),{today:'◷',all:'▤',important:'☆',uncategorized:'□'}[name])));
  const counts = new Map();
  for (const entry of data.entries) counts.set(entry.category,(counts.get(entry.category) || 0) + 1);
  $('shelves').replaceChildren(...data.categories.map(name => navButton(name,category === name,() => navigate('category',name),'▱',counts.get(name) || 0)));
  $('types').replaceChildren(...['',...types].map(value => {
    const tab = button(value || '전체',() => {type = value; render(); $('types').querySelector('[aria-pressed=true]').focus();},'tab');
    tab.setAttribute('aria-pressed',String(type === value));
    return tab;
  }));
  $('mode-title').setAttribute('aria-pressed',String(listMode === 'title'));
  $('mode-preview').setAttribute('aria-pressed',String(listMode === 'preview'));
  const query = $('search').value.trim().toLocaleLowerCase();
  const date = $('filter-date').value;
  const priority = $('filter-priority').value;
  $('clear').hidden = !(query || date || priority || type);
  const rows = data.entries.filter(entry => {
    if (date && entry.date !== date) return false;
    if (view === 'today' && !date && !query && entry.date !== now) return false;
    if (view === 'important' && entry.priority !== '핵심') return false;
    if (view === 'uncategorized' && entry.category) return false;
    if (category && entry.category !== category) return false;
    if (priority && entry.priority !== priority) return false;
    if (type && entry.type !== type) return false;
    return !query || [entry.title,entry.content,entry.thought,entry.source,entry.url,entry.category].some(value => value.toLocaleLowerCase().includes(query));
  }).sort((a,b) => b.date.localeCompare(a.date) || b.created.localeCompare(a.created));
  const records = $('records');
  const count = make('p',rows.length + '건의 기록' + (query && view === 'today' && !date ? ' · 전체 날짜 검색' : ''),'result');
  records.replaceChildren(count);
  if (!rows.length) {
    const showExamples = !data.entries.length && view === 'today' && !query && !date && !priority && !type;
    if (showExamples) {
      if (!examples.some(entry => entry.id === activeId)) activeId = examples[0].id;
      records.append(make('h2','예시 기록','group-title'),...examples.map(entry => entryRow(entry,true)));
      showReader(examples.find(entry => entry.id === activeId),true);
      return;
    }
    const empty = make('div',undefined,'empty');
    empty.append(make('p',data.entries.length ? '이 조건에 맞는 기록이 없습니다.' : '첫 기록을 남겨보세요.'));
    if (!data.entries.length) empty.append(button('새 기록 만들기',() => showComposer(true,true),'outline'));
    records.append(empty);
    showReader(null,false);
    return;
  }
  if (!rows.some(entry => entry.id === activeId)) activeId = rows[0].id;
  showReader(rows.find(entry => entry.id === activeId),false);
  let last = '';
  for (const entry of rows) {
    if (entry.date !== last) {
      const heading = make('h2',dateLabel(entry.date),'group-title');
      heading.append(make('span',entry.date));
      records.append(heading);
      last = entry.date;
    }
    records.append(entryRow(entry,false));
  }
}

for (const [mode,id] of [['title','mode-title'],['preview','mode-preview']]) {
  $(id).addEventListener('click',() => {
    listMode = mode;
    try { localStorage.setItem(listModeKey,mode); } catch {}
    render();
  });
}
form.addEventListener('submit',event => {
  event.preventDefault();
  const get = name => fields[name].value.trim();
  let content = get('content');
  const explicitUrl = get('url');
  let url = pastedUrl(explicitUrl);
  if (explicitUrl && !url) {
    $('details').open = true;
    fields.url.focus();
    message('올바른 웹 주소를 입력해 주세요. 예시 https://example.com',true);
    return;
  }
  if (!url) {
    const standalone = content.split('\n').find(line => {
      const value = line.trim();
      return value && pastedUrl(value);
    });
    if (standalone) {
      url = pastedUrl(standalone.trim());
      const lines = content.split('\n');
      lines.splice(lines.indexOf(standalone),1);
      content = lines.join('\n').trim();
    } else {
      url = linksIn(content)[0]?.url || linksIn(get('thought'))[0]?.url || '';
    }
  }
  if (!content && !url && !get('title') && !get('thought') && !draftImages.length) {
    message('저장할 문장, 링크, 사진 또는 생각을 입력해 주세요.',true);
    fields.content.focus();
    return;
  }
  if (!validDate(get('date')) || (get('published') && !validDate(get('published')))) {
    $('details').open = true;
    message('날짜를 확인해 주세요.',true);
    return;
  }
  const hostname = url ? new URL(url).hostname : '';
  const autoType = !url ? '내 생각' : /(^|\.)(x\.com|twitter\.com)$/i.test(hostname) ? 'X' : '기타 링크';
  const previous = data.entries.find(entry => entry.id === editId);
  const entry = {
    id:previous?.id || newId(), created:previous?.created || new Date().toISOString(),
    title:get('title'), content, url, type:get('type') || autoType,
    category:get('category'), priority:get('priority'), date:get('date'), published:get('published'),
    source:get('source'), thought:get('thought'),images:[...draftImages]
  };
  if (entry.url.length > 4000) {
    message('원문 링크가 너무 깁니다. 4,000자 이내의 링크를 사용해 주세요.',true);
    return;
  }
  const entries = previous ? data.entries.map(item => item.id === entry.id ? entry : item) : [...data.entries,entry];
  if (persist({...data,entries})) {
    if (!previous && (entry.date !== today() || view !== 'today' || $('search').value || $('filter-priority').value || type || $('filter-date').value)) {
      navigate(entry.date === today() ? 'today' : 'all');
      if (entry.date !== today()) $('filter-date').value = entry.date;
    }
    const postId = xPostId(originalUrl(entry)) || xPostIn(entry.content);
    keepLoadedXPost(postId);
    if (postId && readerPreview.dataset.postId === postId && readerPreview.dataset.state === 'unavailable') {
      showXPost(readerPreview,postId,true);
    }
    resetComposer();
    activeId = entry.id;
    render();
    message(previous ? '변경을 저장했습니다.' : '기록을 저장했습니다.');
    $('add-entry').focus();
  }
});
let previewTimer;
form.addEventListener('input',event => {
  if (event.target !== fields.content && event.target !== fields.url) return;
  clearTimeout(previewTimer);
  previewTimer = setTimeout(updateComposerPreview,300);
});
fields.content.addEventListener('paste',event => {
  const imageItem = [...(event.clipboardData?.items || [])].find(item => item.type.startsWith('image/'));
  if (imageItem) {
    const file = imageItem.getAsFile();
    if (file) {
      event.preventDefault();
      addPhotos([file]);
      return;
    }
  }
  const html = event.clipboardData?.getData('text/html');
  if (!html) return;
  const text = event.clipboardData.getData('text/plain');
  const template = document.createElement('template');
  template.innerHTML = html;
  const known = new Set(linksIn(text).map(link => link.url));
  const missing = [];
  for (const anchor of template.content.querySelectorAll('a[href]')) {
    const url = webUrl(anchor.getAttribute('href'));
    if (url && !known.has(url)) {
      known.add(url);
      missing.push(url);
    }
  }
  if (!missing.length) return;
  const input = fields.content;
  const addition = [text || template.content.textContent.trim(),...missing].filter(Boolean).join('\n');
  const length = input.value.length - (input.selectionEnd - input.selectionStart) + addition.length;
  if (length > input.maxLength) return;
  event.preventDefault();
  input.setRangeText(addition,input.selectionStart,input.selectionEnd,'end');
  updateComposerPreview();
});

form.addEventListener('keydown',event => {
  if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
    event.preventDefault();
    if (!fields.date.value) fields.date.value = today();
    form.requestSubmit();
  }
});
$('shelf-menu').addEventListener('click',() => setShelfMenu(shell.dataset.menu !== 'true'));
$('shelf-shade').addEventListener('click',() => {
  setShelfMenu(false);
  $('shelf-menu').focus();
});
document.addEventListener('keydown',event => {
  if (event.key === 'Escape' && shell.dataset.menu === 'true') {
    setShelfMenu(false);
    $('shelf-menu').focus();
  }
});
mobileLayout.addEventListener('change',() => setShelfMenu(false));
for (const toggle of document.querySelectorAll('.theme-toggle')) {
  toggle.addEventListener('click',() => {
    const theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem(themeKey,theme); } catch {}
    applyTheme(theme,true);
  });
}
$('paste-link').addEventListener('click',async () => {
  try {
    const copied = (await navigator.clipboard.readText()).trim();
    if (!copied) {
      message('복사한 링크가 없습니다.',true);
      return;
    }
    const input = fields.content;
    input.value = [input.value.trim(),copied].filter(Boolean).join('\n').slice(0,input.maxLength);
    updateComposerPreview();
  } catch {
    message('입력란을 길게 눌러 붙여넣어 주세요.');
    fields.content.focus();
  }
});
$('add-entry').addEventListener('click',() => {
  if (form.hidden) showComposer(true,true);
  else showComposer(false);
});
$('cancel').addEventListener('click',() => {
  if (editId) resetComposer();
  else showComposer(false);
  $('add-entry').focus();
});
$('back-list').addEventListener('click',() => {
  shell.dataset.detail = 'false';
  $('records').querySelector('[aria-pressed=true]')?.focus();
});
$('category-form').addEventListener('submit',event => {
  event.preventDefault();
  const input = $('new-category');
  const name = input.value.trim();
  if (!name) return;
  if (data.categories.includes(name)) {
    categoryStatus('이미 있는 카테고리입니다.',true);
    return;
  }
  if (persist({...data,categories:[...data.categories,name]})) {
    input.value = '';
    syncCategories();
    if (!editId) fields.category.value = name;
    render();
    renderCategoryManager();
    categoryStatus('카테고리를 추가했습니다.');
  }
});
$('manage-categories').addEventListener('click',() => {
  renderCategoryManager();
  categoryStatus('');
  $('category-manager').showModal();
});
$('close-category-manager').addEventListener('click',() => $('category-manager').close());
$('category-delete-dialog').addEventListener('close',event => {
  const dialog = event.currentTarget;
  const name = dialog.dataset.category;
  delete dialog.dataset.category;
  if (dialog.returnValue === 'delete' && name) deleteCategory(name);
});
$('photo-files').addEventListener('change',event => addPhotos(event.target.files));
$('close-photo-viewer').addEventListener('click',() => $('photo-viewer').close());
$('photo-viewer').addEventListener('click',event => {
  if (event.target === event.currentTarget) event.currentTarget.close();
});
$('search').addEventListener('input',render);
$('filter-priority').addEventListener('change',render);
$('filter-date').addEventListener('change',() => {
  if (!editId) fields.date.value = $('filter-date').value || today();
  render();
});
$('clear').addEventListener('click',() => navigate(view,category));
$('export').addEventListener('click',() => {
  const blob = new Blob([JSON.stringify({version:1,entries:data.entries,categories:data.categories},null,2)],{type:'application/json'});
  const url = URL.createObjectURL(blob);
  const link = make('a');
  link.href = url;
  link.download = 'reading-library-' + today() + '.json';
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url),1000);
});
$('import').addEventListener('click',() => $('file').click());
$('file').addEventListener('change',async event => {
  const file = event.target.files[0];
  event.target.value = '';
  if (!file) return;
  try {
    const restored = validate(JSON.parse(await file.text()));
    const currentIds = new Set(data.entries.map(entry => entry.id));
    const newEntries = restored.entries.filter(entry => !currentIds.has(entry.id));
    const backupCategories = new Map(restored.entries.map(entry => [entry.id,entry.category]));
    const canRestoreCategory = entry => !entry.category && Boolean(backupCategories.get(entry.id));
    const missingCategories = data.entries.filter(canRestoreCategory).length;
    const restoreAssignments = missingCategories > 0 &&
      window.confirm('분류가 비어 있는 기존 기록 ' + missingCategories + '건에 백업의 카테고리를 복원할까요?');
    const entries = restoreAssignments
      ? data.entries.map(entry => canRestoreCategory(entry) ? {...entry,category:backupCategories.get(entry.id)} : entry)
      : data.entries;
    const categories = [...new Set([...data.categories,...restored.categories])];
    const addedCategories = categories.length - data.categories.length;
    if (persist({entries:[...entries,...newEntries],categories})) {
      syncCategories();
      navigate('all');
      const results = [];
      if (newEntries.length) results.push('기록 ' + newEntries.length + '건 추가');
      if (addedCategories) results.push('카테고리 ' + addedCategories + '개 추가');
      if (restoreAssignments) results.push('기존 기록 ' + missingCategories + '건의 분류 복원');
      message(results.length ? results.join(' · ') : '백업에 추가할 기록이나 카테고리가 없습니다.');
    }
  } catch (error) {
    message('백업을 읽을 수 없습니다. 올바른 JSON 백업 파일을 선택해 주세요.',true);
  }
});
window.addEventListener('storage',event => {
  if (event.key !== key || !event.newValue) return;
  try {
    const parsed = JSON.parse(event.newValue);
    data = DriveSync.restore(parsed,validate(parsed));
    syncCategories();
    render();
  } catch {
    message('다른 탭의 기록을 읽을 수 없습니다.',true);
  }
});
let initialTheme = 'light';
try { if (localStorage.getItem(themeKey) === 'dark') initialTheme = 'dark'; } catch {}
applyTheme(initialTheme);
$('shortcut-prefix').textContent = new URL('.',location.href).href + '?shared_text=';
syncCategories();
resetComposer();
render();
openSharedRecord();
$('drive-origin').textContent = location.origin;
DriveSync.init({
  get:() => data,id:newId,validate,defaultCategories,
  commit(next) {
    if (!persist(next,true)) return false;
    syncCategories();
    render();
    return true;
  }
});

CloudSync.init({get:()=>data,id:newId,validate,commit(next){if(!persist(next,true))return false;syncCategories();render();return true;}});
