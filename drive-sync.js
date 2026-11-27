'use strict';

const DriveSync = (() => {
  const scope = 'https://www.googleapis.com/auth/drive.file';
  const configKey = 'reading-library.drive-config';
  const logKey = 'reading-library.drive-log';
  const mapKey = 'reading-library.drive-archive-map.v1';
  const driveBase = 'https://www.googleapis.com/drive/v3/';
  const uploadBase = 'https://www.googleapis.com/upload/drive/v3/';
  const ROOT_FOLDER_NAME = 'A_WhiteBricks';
  const USERDATA_FOLDER_NAME = 'Userdata';

  let app;
  let config;
  let token = '';
  let expiresAt = 0;
  let userdataFolderId = '';
  let connecting = false;
  let running = false;
  let syncTimer;
  let sdk;
  let logEntries = [];
  let folderCache = new Map(); // path -> folderId
  let archiveMap = {}; // entryId -> { fileId, hash, parentId, name }

  function loadArchiveMap() {
    try {
      const raw = JSON.parse(localStorage.getItem(mapKey) || '{}');
      if (raw && typeof raw === 'object') archiveMap = raw;
    } catch { archiveMap = {}; }
  }

  function saveArchiveMap() {
    try { localStorage.setItem(mapKey, JSON.stringify(archiveMap)); } catch {}
  }

  function restore(saved, records) {
    return records;
  }

  function capture(previous, next) {
    return next;
  }

  function setStatus(text) {
    const el = document.getElementById('drive-status');
    if (el) el.textContent = text;
    writeLog(text);
  }

  function safeLogText(value) {
    return String(value || '')
      .replace(/Bearer\s+\S+/gi, 'Bearer [가림]')
      .replace(/AIza[\w-]{20,}/g, '[API 키 가림]')
      .replace(/([?&](?:access_token|key|client_id)=)[^&\s]+/gi, '$1[가림]')
      .replace(/[\r\n\t]+/g, ' ').slice(0, 320);
  }

  function renderLog() {
    const output = document.getElementById('drive-log-output');
    if (!output) return;
    output.textContent = logEntries.length ? logEntries.join('\n') : '아직 연결 기록이 없습니다.';
    output.scrollTop = output.scrollHeight;
  }

  function writeLog(message) {
    const time = new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    logEntries.push('[' + time + '] ' + safeLogText(message));
    if (logEntries.length > 100) logEntries = logEntries.slice(-100);
    try { sessionStorage.setItem(logKey, JSON.stringify(logEntries)); } catch {}
    renderLog();
  }

  function saveConfigDraft() {
    const saved = {
      client: document.getElementById('drive-client').value.trim(),
      apiKey: document.getElementById('drive-key').value.trim(),
      project: document.getElementById('drive-project').value.trim()
    };
    try {
      localStorage.setItem(configKey, JSON.stringify(saved));
      return true;
    } catch {
      setStatus('연결 설정을 이 브라우저에 저장하지 못했습니다.');
      return false;
    }
  }

  function setDot(state) {
    const dot = document.getElementById('drive-dot');
    if (!dot) return;
    dot.dataset.state = state;
    const label = state === 'connected' ? '연결됨' : state === 'connecting' ? '연결중' : '연결 안됨';
    dot.title = label;
    dot.setAttribute('aria-label', label);
  }

  function updateControls() {
    const connected = !!token && Date.now() < expiresAt;
    setDot(connecting || running ? 'connecting' : (connected && !!userdataFolderId ? 'connected' : 'disconnected'));
    const connectBtn = document.getElementById('drive-connect');
    const nowBtn = document.getElementById('drive-now');
    const discBtn = document.getElementById('drive-disconnect');
    if (connectBtn) {
      connectBtn.disabled = connecting || running;
      connectBtn.textContent = connected ? 'Google 계정 다시 연결' : 'Google Drive 연결';
    }
    if (nowBtn) nowBtn.disabled = !connected || !userdataFolderId || running;
    if (discBtn) discBtn.disabled = !token || running || connecting;
  }

  function readConfig() {
    const read = name => document.getElementById('drive-' + name).value.trim();
    const values = { client: read('client'), apiKey: read('key'), project: read('project') };
    const field = document.getElementById('drive-client');
    if (!/^[a-z0-9-]+\.apps\.googleusercontent\.com$/i.test(values.client)) {
      if (field) { field.setAttribute('aria-invalid', 'true'); field.focus(); }
      throw new Error('웹 OAuth 클라이언트 ID 형식을 확인해 주세요.');
    }
    if (field) field.removeAttribute('aria-invalid');
    return values;
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const el = document.createElement('script');
      el.src = src;
      el.async = true;
      el.onload = () => resolve();
      el.onerror = () => { el.remove(); reject(new Error('Google 로그인 스크립트를 불러올 수 없습니다.')); };
      document.head.append(el);
    });
  }

  function loadSdk() {
    if (!sdk) {
      sdk = (window.google?.accounts?.oauth2 ? Promise.resolve() : loadScript('https://accounts.google.com/gsi/client'))
        .catch(err => { sdk = null; throw err; });
    }
    return sdk;
  }

  async function request(base, path, params = {}, options = {}) {
    if (!token || Date.now() >= expiresAt) {
      token = '';
      throw new Error('Google 연결이 만료됐습니다. 연결 버튼을 다시 눌러 주세요.');
    }
    const url = new URL(path, base);
    const sp = new URLSearchParams(params);
    if (sp.toString()) url.search = sp;
    let response;
    try {
      response = await fetch(url, {
        ...options,
        headers: { ...options.headers, Authorization: 'Bearer ' + token }
      });
    } catch (error) {
      writeLog('Google Drive 네트워크 요청 실패: ' + (error.message || 'Failed to fetch'));
      throw new Error('Google Drive에 연결할 수 없습니다. 네트워크 상태를 확인해 주세요.');
    }
    if (!response.ok) {
      if (response.status === 401) token = '';
      let detail = '';
      try {
        const body = await response.clone().json();
        detail = body.error?.message || body.error_description || '';
      } catch {}
      writeLog('Google Drive API 오류 ' + response.status + (detail ? ': ' + detail : ''));
      const err = new Error('Google Drive 요청 실패 (' + response.status + ')' + (detail ? ': ' + detail : ''));
      err.status = response.status;
      throw err;
    }
    if (response.status === 204) return {};
    return response.json();
  }

  function escapeQuery(str) {
    return String(str).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  }

  async function findOrCreateFolder(name, parentId = 'root') {
    const cacheKey = parentId + '/' + name;
    if (folderCache.has(cacheKey)) return folderCache.get(cacheKey);
    const q = "name = '" + escapeQuery(name) + "' and mimeType = 'application/vnd.google-apps.folder' and '" + escapeQuery(parentId) + "' in parents and trashed = false";
    const res = await request(driveBase, 'files', { q, fields: 'files(id,name)', pageSize: '10' });
    if (res.files && res.files.length > 0) {
      const id = res.files[0].id;
      folderCache.set(cacheKey, id);
      return id;
    }
    const created = await request(driveBase, 'files', { fields: 'id' }, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [parentId]
      })
    });
    folderCache.set(cacheKey, created.id);
    writeLog('폴더 생성: ' + name);
    return created.id;
  }

  async function ensureUserdataRoot() {
    const rootId = await findOrCreateFolder(ROOT_FOLDER_NAME, 'root');
    userdataFolderId = await findOrCreateFolder(USERDATA_FOLDER_NAME, rootId);
    return userdataFolderId;
  }

  async function ensureCategoryFolder(categoryPath) {
    const root = userdataFolderId || await ensureUserdataRoot();
    const clean = (categoryPath || '').trim();
    if (!clean) return findOrCreateFolder('미분류', root);
    const parts = clean.split('/').map(p => p.trim()).filter(Boolean);
    let currentParent = root;
    for (const part of parts) {
      currentParent = await findOrCreateFolder(part, currentParent);
    }
    return currentParent;
  }

  function formatYYMMDD(entry) {
    // Prefer immutable creation timestamp so editing title/date never changes the creation prefix
    let d = entry.created ? new Date(entry.created) : null;
    if (!d || !Number.isFinite(d.getTime())) {
      if (entry.date && /^\d{4}-\d{2}-\d{2}$/.test(entry.date)) {
        return entry.date.slice(2, 4) + entry.date.slice(5, 7) + entry.date.slice(8, 10);
      }
      d = new Date();
    }
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Seoul', year: '2-digit', month: '2-digit', day: '2-digit'
    }).formatToParts(d);
    const map = Object.fromEntries(parts.map(p => [p.type, p.value]));
    return map.year + map.month + map.day;
  }

  function sanitizeFilename(raw) {
    return String(raw || '')
      .replace(/^https?:\/\//i, '')
      .replace(/[\\/:*?"<>|\r\n\t]+/g, '_')
      .replace(/\s+/g, ' ')
      .replace(/^\.+|\.+$/g, '')
      .trim()
      .slice(0, 120);
  }

  function buildFileName(entry) {
    const prefix = formatYYMMDD(entry) + '_';
    let base = (entry.title || '').trim();
    if (!base) {
      // Fallback to link if no title
      let link = (entry.url || '').trim();
      if (!link && entry.content) {
        const m = entry.content.match(/https?:\/\/[^\s<>"“”‘’]+/i);
        if (m) link = m[0];
      }
      if (link) {
        base = link;
      } else {
        const firstLine = (entry.content || entry.thought || '').split('\n').find(l => l.trim()) || '제목없음';
        base = firstLine.trim();
      }
    }
    const safe = sanitizeFilename(base) || '제목없음';
    return prefix + safe + '.md';
  }

  function buildFileContent(entry) {
    const lines = [];
    lines.push('# ' + (entry.title || entry.url || '기록'));
    lines.push('');
    lines.push('- **카테고리**: ' + (entry.category || '미분류'));
    lines.push('- **자료 유형**: ' + (entry.type || ''));
    lines.push('- **중요도**: ' + (entry.priority || '미분류'));
    lines.push('- **읽은 날짜**: ' + (entry.date || ''));
    lines.push('- **생성일시**: ' + (entry.created || ''));
    if (entry.published) lines.push('- **원문 게시일**: ' + entry.published);
    if (entry.source) lines.push('- **출처**: ' + entry.source);
    if (entry.url) lines.push('- **원문 링크**: ' + entry.url);
    lines.push('');
    if (entry.content) {
      lines.push('## 내용');
      lines.push('');
      lines.push(entry.content);
      lines.push('');
    }
    if (entry.thought) {
      lines.push('## 내 메모');
      lines.push('');
      lines.push(entry.thought);
      lines.push('');
    }
    return lines.join('\n');
  }

  function computeEntryHash(entry, fileName, parentId) {
    return JSON.stringify({
      fileName,
      parentId,
      title: entry.title || '',
      content: entry.content || '',
      url: entry.url || '',
      category: entry.category || '',
      priority: entry.priority || '',
      type: entry.type || '',
      date: entry.date || '',
      published: entry.published || '',
      source: entry.source || '',
      thought: entry.thought || ''
    });
  }

  async function findExistingDriveFile(entryId) {
    const q = "appProperties has { key='whitebricksEntryId' and value='" + escapeQuery(entryId) + "' } and trashed = false";
    const res = await request(driveBase, 'files', { q, fields: 'files(id,name,parents)', pageSize: '5' });
    return res.files?.[0] || null;
  }

  async function uploadOrUpdateEntry(entry) {
    const parentId = await ensureCategoryFolder(entry.category);
    const fileName = buildFileName(entry);
    const hash = computeEntryHash(entry, fileName, parentId);
    let mapped = archiveMap[entry.id];

    if (mapped && mapped.hash === hash && mapped.fileId) {
      return 'skipped';
    }

    const content = buildFileContent(entry);
    const boundary = 'wb-' + (entry.id || Date.now());

    // If not in local map, check Drive by appProperties to avoid duplicates across devices
    if (!mapped?.fileId) {
      const existing = await findExistingDriveFile(entry.id);
      if (existing) {
        mapped = { fileId: existing.id, parentId: existing.parents?.[0] || '', name: existing.name, hash: '' };
      }
    }

    if (mapped?.fileId) {
      // Update existing file: rename if title changed (yymmdd_ preserved), move folder if category changed, update body
      const params = { uploadType: 'multipart', fields: 'id,name,parents' };
      if (mapped.parentId && mapped.parentId !== parentId) {
        params.addParents = parentId;
        params.removeParents = mapped.parentId;
      }
      const metadata = { name: fileName, appProperties: { whitebricksEntryId: entry.id } };
      const body = '--' + boundary + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' +
        JSON.stringify(metadata) + '\r\n--' + boundary + '\r\nContent-Type: text/markdown; charset=UTF-8\r\n\r\n' +
        content + '\r\n--' + boundary + '--\r\n';
      try {
        const updated = await request(uploadBase, 'files/' + mapped.fileId, params, {
          method: 'PATCH',
          headers: { 'Content-Type': 'multipart/related; boundary=' + boundary },
          body
        });
        archiveMap[entry.id] = { fileId: updated.id, parentId, name: fileName, hash };
        saveArchiveMap();
        return 'updated';
      } catch (err) {
        if (err.status !== 404) throw err;
        // File was deleted manually on Drive; fall through to recreate
      }
    }

    // Create new file
    const metadata = {
      name: fileName,
      mimeType: 'text/markdown',
      parents: [parentId],
      appProperties: { whitebricksEntryId: entry.id }
    };
    const body = '--' + boundary + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' +
      JSON.stringify(metadata) + '\r\n--' + boundary + '\r\nContent-Type: text/markdown; charset=UTF-8\r\n\r\n' +
      content + '\r\n--' + boundary + '--\r\n';
    const created = await request(uploadBase, 'files', { uploadType: 'multipart', fields: 'id,name,parents' }, {
      method: 'POST',
      headers: { 'Content-Type': 'multipart/related; boundary=' + boundary },
      body
    });
    archiveMap[entry.id] = { fileId: created.id, parentId, name: fileName, hash };
    saveArchiveMap();
    return 'created';
  }

  let needsResync = false;
  async function sync() {
    if (!token || Date.now() >= expiresAt || connecting) return;
    if (running) { needsResync = true; return; }
    running = true;
    needsResync = false;
    updateControls();
    try {
      await ensureUserdataRoot();
      const snapshot = app.get();
      const categories = snapshot.categories || [];
      const entries = snapshot.entries || [];
      const currentIds = new Set(entries.map(e => e.id));
      let createdCount = 0;
      let updatedCount = 0;

      // Always ensure all category folders exist even with 0 entries
      for (const cat of ['', ...categories]) {
        try { await ensureCategoryFolder(cat); } catch {}
      }

      for (const entry of entries) {
        try {
          const res = await uploadOrUpdateEntry(entry);
          if (res === 'created') createdCount++;
          else if (res === 'updated') updatedCount++;
        } catch (e) {
          writeLog('개별 기록 저장 실패 (' + (entry.title || entry.id) + '): ' + (e.message || '오류'));
        }
      }

      // Trash files on Drive for deleted entries
      let deletedCount = 0;
      for (const [entryId, info] of Object.entries({ ...archiveMap })) {
        if (!currentIds.has(entryId) && info?.fileId) {
          try {
            await request(driveBase, 'files/' + info.fileId, {}, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ trashed: true })
            });
            deletedCount++;
          } catch {}
          delete archiveMap[entryId];
          saveArchiveMap();
        }
      }

      const stamp = new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
      const summary = [
        createdCount ? '신규 ' + createdCount + '건' : '',
        updatedCount ? '수정 ' + updatedCount + '건' : '',
        deletedCount ? '삭제 ' + deletedCount + '건' : ''
      ].filter(Boolean).join(', ');
      setStatus('A_WhiteBricks/Userdata · ' + (summary || '최신 상태') + ' (' + stamp + ')');
    } catch (error) {
      writeLog('Drive 저장 중단: ' + (error.message || '알 수 없는 오류'));
      setStatus(error.message || 'Drive 저장 중 오류가 발생했습니다.');
    } finally {
      running = false;
      updateControls();
      if (needsResync) {
        needsResync = false;
        setTimeout(() => void sync(), 400);
      }
    }
  }

  async function connect() {
    try {
      config = readConfig();
      localStorage.setItem(configKey, JSON.stringify(config));
      connecting = true;
      updateControls();
      setStatus('Google Drive 연결 중…');
      if (!window.google?.accounts?.oauth2) {
        await loadSdk();
      }
      const client = google.accounts.oauth2.initTokenClient({
        client_id: config.client,
        scope,
        include_granted_scopes: false,
        error_callback: err => {
          finishConnect(new Error('Google 로그인 창이 닫혔거나 차단되었습니다.'));
        },
        callback: async response => {
          try {
            if (!response.access_token) {
              throw new Error('Google Drive 접근 승인이 필요합니다.');
            }
            token = response.access_token;
            expiresAt = Date.now() + (Number(response.expires_in) || 3600) * 1000 - 15000;
            folderCache.clear();
            await ensureUserdataRoot();
            finishConnect();
            void sync();
          } catch (error) {
            finishConnect(error);
          }
        }
      });
      client.requestAccessToken({ prompt: '' });
    } catch (error) {
      finishConnect(error);
    }
  }

  function finishConnect(error) {
    connecting = false;
    if (error) {
      token = '';
      userdataFolderId = '';
      setStatus(error.message);
      const logPanel = document.getElementById('drive-log-panel');
      if (logPanel) logPanel.open = true;
    } else {
      writeLog('Google Drive (A_WhiteBricks/Userdata) 연결 성공.');
    }
    updateControls();
  }

  function queue() {
    if (!token || !userdataFolderId) return;
    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => void sync(), 800);
  }

  function init(callbacks) {
    app = callbacks;
    loadArchiveMap();
    try {
      const savedLog = JSON.parse(sessionStorage.getItem(logKey) || '[]');
      if (Array.isArray(savedLog)) logEntries = savedLog.filter(line => typeof line === 'string').slice(-100);
    } catch {}
    renderLog();
    try {
      const saved = JSON.parse(localStorage.getItem(configKey));
      if (saved) {
        if (document.getElementById('drive-client')) document.getElementById('drive-client').value = saved.client || '';
        if (document.getElementById('drive-key')) document.getElementById('drive-key').value = saved.apiKey || '';
        if (document.getElementById('drive-project')) document.getElementById('drive-project').value = saved.project || '';
      }
    } catch {}

    const panel = document.getElementById('drive-panel');
    if (panel) {
      panel.addEventListener('toggle', () => {
        if (panel.open) loadSdk().catch(err => setStatus(err.message));
      });
    }
    const form = document.getElementById('drive-form');
    if (form) {
      form.addEventListener('submit', event => {
        event.preventDefault();
        if (!connecting && !running) void connect();
      });
    }
    for (const id of ['drive-client', 'drive-key', 'drive-project']) {
      const field = document.getElementById(id);
      if (!field) continue;
      field.addEventListener('input', () => { field.removeAttribute('aria-invalid'); saveConfigDraft(); });
      field.addEventListener('change', saveConfigDraft);
    }
    const nowBtn = document.getElementById('drive-now');
    if (nowBtn) nowBtn.addEventListener('click', () => void sync());
    const copyBtn = document.getElementById('drive-log-copy');
    if (copyBtn) {
      copyBtn.addEventListener('click', async () => {
        const text = logEntries.join('\n') || '아직 연결 기록이 없습니다.';
        try { await navigator.clipboard.writeText(text); setStatus('연결 로그를 복사했습니다.'); }
        catch { setStatus('로그 복사가 차단됐습니다.'); }
      });
    }
    const clearBtn = document.getElementById('drive-log-clear');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        logEntries = [];
        try { sessionStorage.removeItem(logKey); } catch {}
        renderLog();
        setStatus('연결 로그를 지웠습니다.');
      });
    }
    const discBtn = document.getElementById('drive-disconnect');
    if (discBtn) {
      discBtn.addEventListener('click', () => {
        token = '';
        userdataFolderId = '';
        folderCache.clear();
        updateControls();
        setStatus('Google Drive 연결을 끊었습니다.');
      });
    }
    window.addEventListener('online', () => void sync());
    updateControls();
  }

  return { init, restore, capture, queue };
})();
