'use strict';

const LocalSync = (() => {
  const DB_NAME = 'whitebricks-local-sync';
  const STORE_NAME = 'handles';
  const HANDLE_KEY = 'root-dir';
  const MAP_KEY = 'reading-library.local-archive-map.v2';
  const USERDATA_DIR = 'Userdata';

  let app;
  let rootHandle = null;
  let running = false;
  let needsResync = false;
  let timer;
  let archiveMap = {}; // entryId -> { pathParts: [...], fileName, hash }

  const el = id => document.getElementById(id);

  function setStatus(text, isError = false) {
    const s = el('local-dir-status');
    if (s) {
      s.textContent = text;
      s.classList.toggle('error', isError);
    }
  }

  function loadMap() {
    try {
      const raw = JSON.parse(localStorage.getItem(MAP_KEY) || '{}');
      if (raw && typeof raw === 'object') archiveMap = raw;
    } catch { archiveMap = {}; }
  }

  function saveMap() {
    try { localStorage.setItem(MAP_KEY, JSON.stringify(archiveMap)); } catch {}
  }

  function openDb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE_NAME)) {
          req.result.createObjectStore(STORE_NAME);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function saveHandle(handle) {
    try {
      const db = await openDb();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).put(handle, HANDLE_KEY);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch {}
  }

  async function loadHandle() {
    try {
      const db = await openDb();
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const req = tx.objectStore(STORE_NAME).get(HANDLE_KEY);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
      });
    } catch { return null; }
  }

  async function clearHandle() {
    try {
      const db = await openDb();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).delete(HANDLE_KEY);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch {}
  }

  function formatYYMMDD(entry) {
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

  function sanitizeName(raw) {
    const cleaned = String(raw || '')
      .replace(/[\u0000-\u001F\u007F\u200B-\u200D\uFEFF]/g, '')
      .replace(/^https?:\/\//i, '')
      .replace(/[\\/:*?"<>|\r\n\t]+/g, '_')
      .replace(/\s+/g, ' ')
      .replace(/^[. ]+|[. ]+$/g, '')
      .trim()
      .slice(0, 110)
      .replace(/[. ]+$/g, '');
    // Avoid Windows reserved device names
    if (/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i.test(cleaned)) {
      return '_' + cleaned;
    }
    return cleaned;
  }

  function buildBaseFileName(entry) {
    const prefix = formatYYMMDD(entry) + '_';
    let base = (entry.title || '').trim();
    if (!base) {
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
    const safe = sanitizeName(base) || '제목없음';
    return prefix + safe;
  }

  function buildPathParts(category) {
    const clean = (category || '').trim();
    if (!clean) return [USERDATA_DIR, '미분류'];
    const parts = clean.split('/').map(p => sanitizeName(p)).filter(Boolean);
    return parts.length ? [USERDATA_DIR, ...parts] : [USERDATA_DIR, '미분류'];
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

  function computeHash(entry, pathParts, fileName) {
    return JSON.stringify({
      pathParts,
      fileName,
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

  async function getDirHandle(baseHandle, parts, create = true) {
    let cur = baseHandle;
    for (const part of parts) {
      cur = await cur.getDirectoryHandle(part, { create });
    }
    return cur;
  }

  async function removeFileIfExists(baseHandle, pathParts, fileName) {
    try {
      const dir = await getDirHandle(baseHandle, pathParts, false);
      await dir.removeEntry(fileName);
    } catch {}
  }

  // Recursively remove empty folders inside Userdata that are no longer in active category paths
  async function cleanupStaleFolders(dirHandle, currentParts, activeDirKeys) {
    const childDirs = [];
    let hasAnyEntry = false;
    try {
      for await (const [name, handle] of dirHandle.entries()) {
        hasAnyEntry = true;
        if (handle.kind === 'directory') {
          childDirs.push({ name, handle });
        }
      }
    } catch { return false; }

    let remainingCount = 0;
    try {
      for await (const _ of dirHandle.entries()) remainingCount++;
    } catch { return false; }

    for (const child of childDirs) {
      const childParts = [...currentParts, child.name];
      const childKey = childParts.join('/');
      const childEmpty = await cleanupStaleFolders(child.handle, childParts, activeDirKeys);
      if (childEmpty && !activeDirKeys.has(childKey)) {
        try {
          await dirHandle.removeEntry(child.name);
          remainingCount--;
        } catch {}
      }
    }
    return remainingCount === 0;
  }

  async function verifyPermission(handle, interactive = false) {
    if (!handle) return false;
    const opts = { mode: 'readwrite' };
    try {
      if ((await handle.queryPermission(opts)) === 'granted') return true;
      if (interactive && (await handle.requestPermission(opts)) === 'granted') return true;
    } catch {}
    return false;
  }

  function updateButtons(hasPerm = false) {
    const connectBtn = el('local-dir-connect');
    const syncBtn = el('local-dir-now');
    const discBtn = el('local-dir-disconnect');
    if (!connectBtn) return;
    const supported = typeof window.showDirectoryPicker === 'function';
    if (!supported) {
      connectBtn.disabled = true;
      if (syncBtn) syncBtn.disabled = true;
      if (discBtn) discBtn.disabled = true;
      setStatus('이 브라우저(모바일 등)에서는 PC 로컬 폴더 직접 연결을 지원하지 않습니다.');
      return;
    }
    connectBtn.disabled = running;
    connectBtn.textContent = rootHandle ? (hasPerm ? '폴더 변경' : '권한 허용 및 연결') : 'A_WhiteBricks 폴더 선택';
    if (syncBtn) syncBtn.disabled = !rootHandle || running;
    if (discBtn) discBtn.disabled = !rootHandle || running;
  }

  async function sync(interactive = false) {
    if (!rootHandle) return;
    if (running) {
      needsResync = true;
      return;
    }
    const ok = await verifyPermission(rootHandle, interactive);
    updateButtons(ok);
    if (!ok) {
      setStatus(rootHandle.name + ' 폴더가 기억되어 있습니다. [권한 허용 및 연결]을 한 번 눌러 주세요.');
      return;
    }
    running = true;
    needsResync = false;
    updateButtons(true);
    try {
      const userdataHandle = await rootHandle.getDirectoryHandle(USERDATA_DIR, { create: true });

      const snapshot = app.get();
      const categories = snapshot.categories || [];
      const entries = snapshot.entries || [];

      // 1. Always create folders for ALL categories (even with 0 entries) + 미분류
      const activeDirKeys = new Set([USERDATA_DIR]);
      const allCategoryPaths = ['', ...categories];
      for (const cat of allCategoryPaths) {
        const parts = buildPathParts(cat);
        try {
          await getDirHandle(rootHandle, parts, true);
        } catch {}
        for (let i = 1; i <= parts.length; i++) {
          activeDirKeys.add(parts.slice(0, i).join('/'));
        }
      }

      // 2. Write / update / move all entries with collision protection and per-entry error isolation
      const currentIds = new Set(entries.map(e => e.id));
      const usedNamesByDir = new Map();
      let written = 0;
      let removed = 0;
      let failed = 0;

      for (const entry of entries) {
        try {
          const pathParts = buildPathParts(entry.category);
          const dirKey = pathParts.join('/');
          for (let i = 1; i <= pathParts.length; i++) {
            activeDirKeys.add(pathParts.slice(0, i).join('/'));
          }

          if (!usedNamesByDir.has(dirKey)) usedNamesByDir.set(dirKey, new Set());
          const used = usedNamesByDir.get(dirKey);

          const baseName = buildBaseFileName(entry);
          let fileName = baseName + '.md';
          let suffix = 2;
          while (used.has(fileName.toLowerCase())) {
            fileName = baseName + '_' + suffix + '.md';
            suffix++;
          }
          used.add(fileName.toLowerCase());

          const hash = computeHash(entry, pathParts, fileName);
          const prev = archiveMap[entry.id];

          let needWrite = true;
          if (prev && prev.hash === hash && prev.fileName === fileName && JSON.stringify(prev.pathParts) === JSON.stringify(pathParts)) {
            try {
              const checkDir = await getDirHandle(rootHandle, pathParts, false);
              await checkDir.getFileHandle(fileName, { create: false });
              needWrite = false;
            } catch {
              needWrite = true;
            }
          }

          if (!needWrite) continue;

          // If renamed or moved to another category folder, delete old file first
          if (prev && prev.fileName && (prev.fileName !== fileName || JSON.stringify(prev.pathParts) !== JSON.stringify(pathParts))) {
            await removeFileIfExists(rootHandle, prev.pathParts || [USERDATA_DIR, '미분류'], prev.fileName);
          }

          const dir = await getDirHandle(rootHandle, pathParts, true);
          const fh = await dir.getFileHandle(fileName, { create: true });
          const writable = await fh.createWritable();
          await writable.write(buildFileContent(entry));
          await writable.close();

          archiveMap[entry.id] = { pathParts, fileName, hash };
          written++;
        } catch (entryErr) {
          failed++;
          console.warn('LocalSync entry failed:', entry?.id, entry?.title, entryErr);
        }
      }

      // 3. Remove files for deleted entries
      for (const [entryId, prev] of Object.entries({ ...archiveMap })) {
        if (!currentIds.has(entryId)) {
          if (prev?.fileName) {
            await removeFileIfExists(rootHandle, prev.pathParts || [USERDATA_DIR, '미분류'], prev.fileName);
            removed++;
          }
          delete archiveMap[entryId];
        }
      }
      saveMap();

      // 4. Clean up empty old folders (from renamed or deleted categories)
      await cleanupStaleFolders(userdataHandle, [USERDATA_DIR], activeDirKeys);

      const stamp = new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
      const detail = [
        written ? '저장/갱신 ' + written + '건' : '',
        removed ? '삭제 ' + removed + '건' : '',
        failed ? '실패 ' + failed + '건' : ''
      ].filter(Boolean).join(', ');
      setStatus(
        rootHandle.name + '/Userdata · ' + (detail || '최신 상태 (' + entries.length + '건)') + ' · ' + stamp,
        failed > 0
      );
    } catch (err) {
      setStatus('폴더 저장 오류: ' + (err?.message || '권한을 확인해 주세요.'), true);
    } finally {
      running = false;
      updateButtons(true);
      if (needsResync) {
        needsResync = false;
        setTimeout(() => void sync(false), 300);
      }
    }
  }

  async function pickFolder() {
    if (typeof window.showDirectoryPicker !== 'function') {
      setStatus('PC Chrome 또는 Edge 브라우저에서 사용해 주세요.', true);
      return;
    }
    try {
      if (rootHandle && !(await verifyPermission(rootHandle, false))) {
        const granted = await verifyPermission(rootHandle, true);
        if (granted) {
          await sync(false);
          return;
        }
      }
      const picked = await window.showDirectoryPicker({ id: 'whitebricks-userdata', mode: 'readwrite' });
      rootHandle = picked;
      await saveHandle(picked);
      archiveMap = {};
      saveMap();
      setStatus(picked.name + '/Userdata 폴더에 전체 기록을 저장하는 중…');
      await sync(true);
    } catch (err) {
      if (err?.name === 'AbortError') return;
      setStatus('폴더 연결 실패: ' + (err?.message || '다시 시도해 주세요.'), true);
    }
  }

  function queue() {
    if (!rootHandle) return;
    if (running) {
      needsResync = true;
      return;
    }
    clearTimeout(timer);
    timer = setTimeout(() => void sync(false), 450);
  }

  async function init(callbacks) {
    app = callbacks;
    loadMap();
    if (!el('local-dir-panel')) return;

    el('local-dir-connect')?.addEventListener('click', () => void pickFolder());
    el('local-dir-now')?.addEventListener('click', () => {
      // Force full verification on manual click
      archiveMap = {};
      saveMap();
      void sync(true);
    });
    el('local-dir-disconnect')?.addEventListener('click', async () => {
      rootHandle = null;
      await clearHandle();
      updateButtons(false);
      setStatus('PC 폴더 연결을 끊었습니다.');
    });

    if (typeof window.showDirectoryPicker !== 'function') {
      updateButtons(false);
      return;
    }

    rootHandle = await loadHandle();
    if (rootHandle) {
      const granted = await verifyPermission(rootHandle, false);
      updateButtons(granted);
      if (granted) {
        void sync(false);
      } else {
        setStatus(rootHandle.name + '/Userdata 연결 대기 · [권한 허용 및 연결]을 누르면 자동 저장이 시작됩니다.');
      }
    } else {
      updateButtons(false);
    }
  }

  return { init, queue };
})();
