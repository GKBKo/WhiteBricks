'use strict';

const DriveSync = (() => {
  const folderId = '1mXCJzRYkHHV2Og33B3WEAOntP3VLyqjK';
  const scope = 'https://www.googleapis.com/auth/drive.file';
  const marker = 'reading-library-delta-v1';
  const configKey = 'reading-library.drive-config';
  const logKey = 'reading-library.drive-log';
  const driveBase = 'https://www.googleapis.com/drive/v3/';
  let app;
  let config;
  let token = '';
  let expiresAt = 0;
  let folder;
  let connecting = false;
  let running = false;
  let syncTimer;
  let sdk;
  let logEntries = [];

  function emptyState() {
    return {clock:0,revisions:{},pending:[],categoriesDirty:false,categoryRevision:{time:0,tag:''},seen:[]};
  }

  function restore(saved, records) {
    const state = saved?.drive;
    if (state && Number.isSafeInteger(state.clock) && state.revisions &&
        Array.isArray(state.pending) && Array.isArray(state.seen)) {
      return {...records,drive:state};
    }
    return records;
  }

  function seed(records) {
    const state = emptyState();
    state.categoriesDirty = false;
    for (const entry of records.entries) {
      const time = Math.max(0,Date.parse(entry.created) || 0);
      const tag = 'seed-' + app.id();
      Object.defineProperty(state.revisions,entry.id,{value:{time,tag},enumerable:true,writable:true,configurable:true});
      state.pending.push({id:entry.id,time,tag,entry});
      state.clock = Math.max(state.clock,time);
    }
    return state;
  }

  function capture(previous, next) {
    if (!previous.drive) return next;
    const old = new Map(previous.entries.map(entry => [entry.id,entry]));
    const current = new Map(next.entries.map(entry => [entry.id,entry]));
    const changed = [...new Set([...old.keys(),...current.keys()])]
      .filter(id => JSON.stringify(old.get(id)) !== JSON.stringify(current.get(id)));
    const categoriesChanged = JSON.stringify(next.categories) !== JSON.stringify(previous.categories);
    const categoriesDirty = previous.drive.categoriesDirty || categoriesChanged;
    if (!changed.length && !categoriesChanged) {
      return {...next,drive:previous.drive};
    }
    const time = Math.max(Date.now(),previous.drive.clock + 1);
    const tag = app.id();
    const categoryRevision = categoriesChanged ? {time,tag} : (previous.drive.categoryRevision || {time:0,tag:''});
    const revisions = new Map(Object.entries(previous.drive.revisions));
    const pending = new Map(previous.drive.pending.map(change => [change.id,change]));
    for (const id of changed) {
      revisions.set(id,{time,tag});
      pending.set(id,{id,time,tag,entry:current.get(id) || null});
    }
    return {...next,drive:{...previous.drive,clock:time,revisions:Object.fromEntries(revisions),pending:[...pending.values()],categoriesDirty,categoryRevision}};
  }

  function newer(change, previous) {
    return !previous || change.time > previous.time || (change.time === previous.time && change.tag > previous.tag);
  }

  function merge(records, files) {
    const state = records.drive;
    const revisions = new Map(Object.entries(state.revisions));
    const entries = new Map(records.entries.map(entry => [entry.id,entry]));
    const pending = new Map(state.pending.map(change => [change.id,change]));
    const seen = new Set(state.seen);
    let categories = [...records.categories];
    let categoryRevision = state.categoryRevision || {time:0,tag:''};
    let categoriesDirty = state.categoriesDirty;
    let clock = state.clock;
    for (const {payload} of files) {
      const incomingRevision = payload?.categoryRevision;
      if (!Array.isArray(payload?.categories)) continue;
      if (incomingRevision && Number.isSafeInteger(incomingRevision.time) && incomingRevision.time > 0 &&
          incomingRevision.time < Number.MAX_SAFE_INTEGER && typeof incomingRevision.tag === 'string' &&
          incomingRevision.tag.length <= 100) {
        clock = Math.max(clock,incomingRevision.time);
        if (newer(incomingRevision,categoryRevision)) {
          categories = [...payload.categories];
          categoryRevision = incomingRevision;
          categoriesDirty = false;
        }
      } else if (!categoryRevision.time) {
        categories = [...new Set([...categories,...payload.categories])];
      }
    }
    for (const {id,payload} of files) {
      if (seen.has(id)) continue;
      const {format,changes,categories:incomingCategories} = payload || {};
      if (format !== marker || !Array.isArray(changes) || !Array.isArray(incomingCategories)) {
        throw new Error('Drive 동기화 파일의 형식이 올바르지 않습니다.');
      }
      const normalizedChanges = changes.map(change => change?.entry && change.entry.category && !categories.includes(change.entry.category)
        ? {...change,entry:{...change.entry,category:''}} : change);
      app.validate({entries:normalizedChanges.map(change => change?.entry).filter(entry => entry !== null),categories});
      for (const change of normalizedChanges) {
        if (typeof change.id !== 'string' || !change.id || change.id.length > 100 ||
            !Number.isSafeInteger(change.time) || change.time < 0 || change.time >= Number.MAX_SAFE_INTEGER ||
            typeof change.tag !== 'string' || !change.tag || change.tag.length > 100 ||
            (change.entry && change.entry.id !== change.id)) {
          throw new Error('Drive 동기화 기록을 검증할 수 없습니다.');
        }
        clock = Math.max(clock,change.time);
        if (!newer(change,revisions.get(change.id))) continue;
        revisions.set(change.id,{time:change.time,tag:change.tag});
        if (change.entry) entries.set(change.id,change.entry);
        else entries.delete(change.id);
        pending.delete(change.id);
      }
      seen.add(id);
    }
    const allowedCategories = new Set(categories);
    const repair = [...entries.values()].filter(entry => entry.category && !allowedCategories.has(entry.category));
    if (repair.length) {
      const time = Math.max(Date.now(),clock + 1);
      const tag = app.id();
      for (const entry of repair) {
        const updated = {...entry,category:''};
        entries.set(entry.id,updated);
        revisions.set(entry.id,{time,tag});
        pending.set(entry.id,{id:entry.id,time,tag,entry:updated});
      }
      clock = time;
    }
    return {
      entries:[...entries.values()],categories,
      drive:{...state,clock,revisions:Object.fromEntries(revisions),pending:[...pending.values()],categoriesDirty,categoryRevision,seen:[...seen]}
    };
  }

  function setStatus(text) {
    document.getElementById('drive-status').textContent = text;
    writeLog(text);
  }

  function safeLogText(value) {
    return String(value || '')
      .replace(/Bearer\s+\S+/gi,'Bearer [가림]')
      .replace(/AIza[\w-]{20,}/g,'[API 키 가림]')
      .replace(/([?&](?:access_token|key|client_id)=)[^&\s]+/gi,'$1[가림]')
      .replace(/[\r\n\t]+/g,' ').slice(0,320);
  }

  function renderLog() {
    const output = document.getElementById('drive-log-output');
    if (!output) return;
    output.textContent = logEntries.length ? logEntries.join('\n') : '아직 연결 기록이 없습니다.';
    output.scrollTop = output.scrollHeight;
  }

  function writeLog(message) {
    const time = new Date().toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
    logEntries.push('[' + time + '] ' + safeLogText(message));
    if (logEntries.length > 100) logEntries = logEntries.slice(-100);
    try { sessionStorage.setItem(logKey,JSON.stringify(logEntries)); } catch {}
    renderLog();
  }

  function saveConfigDraft() {
    const saved = {
      client:document.getElementById('drive-client').value.trim(),
      apiKey:document.getElementById('drive-key').value.trim(),
      project:document.getElementById('drive-project').value.trim()
    };
    try {
      localStorage.setItem(configKey,JSON.stringify(saved));
      return true;
    } catch {
      document.getElementById('drive-status').textContent = '연결 설정을 이 브라우저에 저장하지 못했습니다. 브라우저 저장 공간을 확인해 주세요.';
      return false;
    }
  }

  window.addEventListener('error',event => {
    writeLog('브라우저 스크립트 오류: ' + (event.message || '알 수 없는 오류'));
    document.getElementById('drive-log-panel').open = true;
  });
  window.addEventListener('unhandledrejection',event => {
    writeLog('처리되지 않은 오류: ' + (event.reason?.message || event.reason || '알 수 없는 오류'));
    document.getElementById('drive-log-panel').open = true;
  });

  function updateControls() {
    const connected = !!token && Date.now() < expiresAt;
    document.getElementById('drive-connect').disabled = connecting || running;
    document.getElementById('drive-connect').textContent = connected ? 'Google 계정 다시 연결' : 'Google Drive 연결';
    document.getElementById('drive-now').disabled = !connected || !folder || running;
    document.getElementById('drive-disconnect').disabled = !token || running || connecting;
  }

  function readConfig() {
    const read = name => document.getElementById('drive-' + name).value.trim();
    const values = {client:read('client'),apiKey:read('key'),project:read('project')};
    const checks = [
      {name:'client',valid:/^[a-z0-9-]+\.apps\.googleusercontent\.com$/i.test(values.client),label:'웹 OAuth 클라이언트 ID'},
      {name:'key',valid:/^AIza[a-z0-9_-]{20,}$/i.test(values.apiKey),label:'Google Picker API 키'},
      {name:'project',valid:/^[0-9]+$/.test(values.project),label:'Google Cloud 프로젝트 번호'}
    ];
    const invalid = checks.filter(item => !item.valid);
    for (const item of checks) {
      const field = document.getElementById('drive-' + item.name);
      field.removeAttribute('aria-invalid');
      if (!item.valid) field.setAttribute('aria-invalid','true');
    }
    if (invalid.length) {
      document.getElementById('drive-' + invalid[0].name).focus();
      throw new Error('입력 형식 오류: ' + invalid.map(item => item.label).join(', ') + '. OAuth ID는 웹 애플리케이션 클라이언트 ID, API 키는 AIza로 시작하는 키, 프로젝트 번호는 숫자만 입력해 주세요. 입력값은 로그에 남기지 않습니다.');
    }
    return values;
  }

  function loadScript(src) {
    return new Promise((resolve,reject) => {
      const el = document.createElement('script');
      el.src = src;
      el.async = true;
      writeLog('Google 연결 스크립트 불러오는 중: ' + new URL(src).hostname);
      el.onload = () => { writeLog('Google 연결 스크립트 로드 완료.'); resolve(); };
      el.onerror = () => {
        el.remove();
        reject(new Error('Google 연결 도구를 불러올 수 없습니다 (' + new URL(src).hostname + '). 네트워크 또는 광고 차단 설정을 확인해 주세요.'));
      };
      document.head.append(el);
    });
  }

  function loadSdk() {
    if (!sdk) sdk = Promise.all([
      window.google?.accounts?.oauth2 ? Promise.resolve() : loadScript('https://accounts.google.com/gsi/client'),
      window.gapi ? Promise.resolve() : loadScript('https://apis.google.com/js/api.js')
    ]).then(() => new Promise((resolve,reject) => gapi.load('picker',{
      callback:resolve, onerror:() => reject(new Error('Google 폴더 선택기를 열 수 없습니다.')),
      timeout:10000, ontimeout:() => reject(new Error('Google 폴더 선택기 응답이 지연되었습니다.'))
    }))).then(() => { writeLog('Google 로그인과 폴더 선택기가 준비됐습니다.'); })
      .catch(error => { writeLog('Google 연결 도구 준비 실패: ' + error.message); sdk = null; throw error; });
    return sdk;
  }

  async function request(base, path, params, options = {}) {
    if (!token || Date.now() >= expiresAt) {
      token = '';
      throw new Error('Google 연결이 만료됐습니다. 연결 버튼을 다시 눌러 주세요.');
    }
    const url = new URL(path,base);
    url.search = new URLSearchParams(params);
    let response;
    try {
      response = await fetch(url,{
        ...options,
        headers:{...options.headers,Authorization:'Bearer ' + token}
      });
    } catch (error) {
      writeLog('Google Drive 네트워크 요청 실패: ' + (error.message || 'Failed to fetch'));
      throw new Error('Google Drive에 연결할 수 없습니다. 네트워크, 광고 차단 또는 브라우저 개인정보 보호 설정을 확인해 주세요.');
    }
    if (!response.ok) {
      if (response.status === 401) token = '';
      let detail = '';
      try {
        const body = await response.clone().json();
        detail = body.error?.message || body.error_description || '';
      } catch {}
      writeLog('Google Drive API 오류 ' + response.status + (detail ? ': ' + detail : ''));
      const error = new Error({
        401:'Google 연결이 만료됐습니다. 연결 버튼을 다시 눌러 주세요.',
        403:'Drive API 사용 설정 또는 폴더에 파일을 추가할 권한을 확인해 주세요.',
        404:'Google Drive에서 지정한 폴더 또는 파일에 접근할 수 없습니다.',
        429:'Google Drive 요청이 잠시 제한되었습니다. 잠시 후 다시 시도해 주세요.'
      }[response.status] || 'Google Drive 동기화 요청이 실패했습니다.');
      error.status = response.status;
      throw error;
    }
    return response.json();
  }

  function chooseFolder() {
    const picker = google.picker;
    writeLog('지정된 Drive 폴더 선택 창을 여는 중입니다.');
    return new Promise((resolve,reject) => {
      const view = new picker.DocsView(picker.ViewId.FOLDERS)
        .setIncludeFolders(true).setSelectFolderEnabled(true);
      new picker.PickerBuilder()
        .addView(view).setSelectableMimeTypes('application/vnd.google-apps.folder')
        .setOAuthToken(token).setDeveloperKey(config.apiKey).setAppId(config.project)
        .setOrigin(location.origin).setTitle('설정에 표시된 Google Drive 폴더 선택')
        .setCallback(result => {
          if (result.action === picker.Action.CANCEL) { writeLog('사용자가 폴더 선택을 취소했습니다.'); reject(new Error('폴더 선택을 취소했습니다.')); }
          if (result.action !== picker.Action.PICKED) return;
          if (result.docs?.[0]?.id === folderId) { writeLog('지정한 폴더를 선택했습니다.'); resolve(); }
          else { writeLog('선택한 폴더 ID가 앱에 지정된 폴더와 다릅니다.'); reject(new Error('지정하신 폴더와 다릅니다. 설정의 폴더 링크를 확인한 뒤 다시 연결해 주세요.')); }
        }).build().setVisible(true);
    });
  }

  async function getFolder() {
    writeLog('지정 폴더 접근 권한을 확인하는 중입니다.');
    const info = await request(driveBase,'files/' + folderId,{
      supportsAllDrives:'true',fields:'id,name,mimeType,driveId,capabilities(canAddChildren)'
    });
    if (info.mimeType !== 'application/vnd.google-apps.folder' || !info.capabilities?.canAddChildren) {
      throw new Error('지정 폴더에 파일을 추가할 수 있는 Google 계정으로 연결해 주세요.');
    }
    writeLog('지정 폴더에 접근할 수 있고 파일 추가 권한도 있습니다.');
    return info;
  }

  async function connect() {
    if(CloudSync.enabled()) { setStatus('Firebase 실시간 동기화를 사용 중입니다. Drive에 변경 파일을 추가하지 않습니다.');return; }
    try {
      config = readConfig();
      localStorage.setItem(configKey,JSON.stringify(config));
      writeLog('입력한 설정 형식을 확인했습니다. 값은 로그에 기록하지 않습니다.');
      connecting = true;
      folder = null;
      updateControls();
      setStatus('Google 계정 연결 중…');
      if (!window.google?.accounts?.oauth2 || !window.google?.picker) {
        writeLog('Google 연결 도구가 아직 준비되지 않아 스크립트를 불러옵니다.');
        await loadSdk();
        setStatus('Google 연결 준비가 됐습니다. 연결 버튼을 다시 눌러 주세요.');
        writeLog('브라우저 팝업 보안을 위해 연결 버튼을 한 번 더 눌러야 합니다.');
        connecting = false;
        updateControls();
        return;
      }
      const client = google.accounts.oauth2.initTokenClient({
        client_id:config.client, scope, include_granted_scopes:false,
        error_callback:error => {
          writeLog('Google 로그인 창 오류: ' + (error?.type || '알 수 없는 오류'));
          finishConnect(new Error('Google 로그인 창이 닫혔거나 차단되었습니다. 브라우저에서 팝업을 허용해 주세요.'));
        },
        callback:async response => {
          try {
            if (response.error) writeLog('Google OAuth 오류: ' + response.error + (response.error_description ? ' · ' + response.error_description : ''));
            if (!response.access_token || !google.accounts.oauth2.hasGrantedAllScopes(response,scope)) {
              throw new Error('Google Drive 접근을 승인해 주세요. OAuth 설정과 테스트 사용자를 확인해 주세요.');
            }
            writeLog('Google OAuth 승인을 받았습니다. 토큰 값은 로그에 기록하지 않습니다.');
            token = response.access_token;
            expiresAt = Date.now() + (Number(response.expires_in) || 3600) * 1000 - 15000;
            try {
              folder = await getFolder();
            } catch (error) {
              if (error.status !== 404) throw error;
              setStatus('Google 선택기에서 지정 폴더를 선택해 주세요.');
              await chooseFolder();
              folder = await getFolder();
            }
            const current = app.get();
            if (!current.drive) commit({...current,drive:seed(current)});
            finishConnect();
            void sync();
          } catch (error) {
            finishConnect(error);
          }
        }
      });
      writeLog('Google 계정 승인 창을 요청합니다. 팝업이 막히면 브라우저에서 허용해 주세요.');
      client.requestAccessToken({prompt:''});
    } catch (error) {
      finishConnect(error);
    }
  }

  function finishConnect(error) {
    connecting = false;
    if (error) {
      folder = null;
      token = '';
      writeLog('연결 실패: ' + error.message);
      setStatus(error.message);
      document.getElementById('drive-log-panel').open = true;
    } else {
      writeLog('Google 계정과 Drive 폴더 연결에 성공했습니다.');
    }
    updateControls();
  }

  function commit(records) {
    if (!app.commit(records)) throw new Error('기기에 동기화 상태를 저장할 수 없습니다.');
  }

  async function pull() {
    writeLog('Drive에서 새 동기화 기록을 확인합니다.');
    let page = '';
    const known = new Set(app.get().drive.seen);
    const files = [];
    do {
      const params = {
        q:"'" + folderId + "' in parents and trashed = false and appProperties has { key='readingLibrary' and value='" + marker + "' }",
        fields:'nextPageToken,files(id)',pageSize:'100',
        supportsAllDrives:'true',includeItemsFromAllDrives:'true'
      };
      if (folder.driveId) {
        params.corpora = 'drive';
        params.driveId = folder.driveId;
      }
      if (page) params.pageToken = page;
      const response = await request(driveBase,'files',params);
      files.push(...(response.files || []).filter(file => !known.has(file.id)));
      page = response.nextPageToken;
    } while (page);

    for (let index = 0; index < files.length; index += 6) {
      const batch = await Promise.all(files.slice(index,index + 6).map(async ({id}) => ({
        id,payload:await request(driveBase,'files/' + id,{alt:'media',supportsAllDrives:'true'})
      })));
      commit(merge(app.get(),batch));
    }
    writeLog('Drive에서 동기화 파일 ' + files.length + '개를 확인했습니다.');
  }

  async function push() {
    const snapshot = app.get();
    if (!snapshot.drive.pending.length && !snapshot.drive.categoriesDirty) { writeLog('Drive에 올릴 변경 사항이 없습니다.'); return; }
    const changes = [];
    let size = 0;
    for (const change of snapshot.drive.pending) {
      size += JSON.stringify(change).length;
      if (size > 1500000 && changes.length) break;
      changes.push(change);
    }
    const payload = {format:marker,changes,categories:snapshot.categories,categoryRevision:snapshot.drive.categoryRevision || {time:0,tag:''}};
    const id = app.id();
    const boundary = 'reading-library-' + id;
    const metadata = {
      name:'읽기서가-동기화-' + id + '.json',mimeType:'application/json',
      parents:[folderId],appProperties:{readingLibrary:marker}
    };
    const result = await request('https://www.googleapis.com/upload/drive/v3/','files',
      {uploadType:'multipart',supportsAllDrives:'true',fields:'id'},{
        method:'POST',headers:{'Content-Type':'multipart/related; boundary=' + boundary},
        body:'--' + boundary + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' +
          JSON.stringify(metadata) + '\r\n--' + boundary + '\r\nContent-Type: application/json\r\n\r\n' +
          JSON.stringify(payload) + '\r\n--' + boundary + '--\r\n'
      });
    const latest = app.get();
    const sent = new Map(changes.map(change => [change.id,change]));
    const pending = latest.drive.pending.filter(change => {
      const uploaded = sent.get(change.id);
      return !uploaded || uploaded.time !== change.time || uploaded.tag !== change.tag;
    });
    commit({...latest,drive:{...latest.drive,pending,
      categoriesDirty:newer(latest.drive.categoryRevision || {time:0,tag:''},payload.categoryRevision) ||
        JSON.stringify(latest.categories) !== JSON.stringify(snapshot.categories),
      seen:[...new Set([...latest.drive.seen,result.id])]
    }});
    writeLog('변경 ' + changes.length + '건을 Drive에 업로드했습니다.');
  }

  async function sync() {
    if (CloudSync.enabled() || !folder || !token || running || connecting) return;
    running = true;
    updateControls();
    writeLog('Drive 동기화를 시작합니다.');
    setStatus('Google Drive에서 기록을 맞추는 중…');
    try {
      await pull();
      await push();
      const stamp = new Date().toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'});
      setStatus(folder.name + ' · 마지막 동기화 ' + stamp);
    } catch (error) {
      writeLog('동기화 중단: ' + (error.message || '알 수 없는 오류'));
      setStatus(error.message || '동기화에 실패했습니다. 로컬 기록은 이 기기에 남아 있습니다.');
      document.getElementById('drive-log-panel').open = true;
    } finally {
      running = false;
      updateControls();
    }
  }

  function queue() {
    if (!token || !folder) return;
    clearTimeout(syncTimer);
    syncTimer = setTimeout(sync,700);
  }

  function init(callbacks) {
    app = callbacks;
    try {
      const savedLog = JSON.parse(sessionStorage.getItem(logKey) || '[]');
      if (Array.isArray(savedLog)) logEntries = savedLog.filter(line => typeof line === 'string').slice(-100);
    } catch {}
    renderLog();
    try {
      const saved = JSON.parse(localStorage.getItem(configKey));
      if (saved) {
        document.getElementById('drive-client').value = saved.client;
        document.getElementById('drive-key').value = saved.apiKey;
        document.getElementById('drive-project').value = saved.project;
        writeLog('이전에 입력한 연결 설정을 불러왔습니다. 설정값은 로그에 표시하지 않습니다.');
      }
    } catch {}
    const panel = document.getElementById('drive-panel');
    panel.addEventListener('toggle',() => {
      if (panel.open) loadSdk().catch(error => setStatus(error.message));
    });
    document.getElementById('drive-form').addEventListener('submit',event => {
      event.preventDefault();
      if (!connecting && !running) void connect();
    });
    for (const field of ['drive-client','drive-key','drive-project'].map(id => document.getElementById(id))) {
      field.addEventListener('input',() => {
        field.removeAttribute('aria-invalid');
        saveConfigDraft();
      });
      field.addEventListener('change',saveConfigDraft);
    }
    document.getElementById('drive-now').addEventListener('click',() => void sync());
    document.getElementById('drive-log-copy').addEventListener('click',async () => {
      const text = logEntries.join('\n') || '아직 연결 기록이 없습니다.';
      try {
        await navigator.clipboard.writeText(text);
        setStatus('연결 로그를 복사했습니다.');
      } catch {
        setStatus('로그 복사가 차단됐습니다. 로그 영역을 길게 눌러 직접 복사해 주세요.');
      }
    });
    document.getElementById('drive-log-clear').addEventListener('click',() => {
      logEntries = [];
      try { sessionStorage.removeItem(logKey); } catch {}
      renderLog();
      document.getElementById('drive-status').textContent = '연결 로그를 지웠습니다.';
    });
    document.getElementById('drive-disconnect').addEventListener('click',() => {
      token = '';
      folder = null;
      updateControls();
      setStatus('이 기기에서 Drive 연결을 끊었습니다.');
    });
    document.addEventListener('visibilitychange',() => {
      if (document.visibilityState === 'visible') void sync();
    });
    window.addEventListener('online',() => void sync());
    setInterval(() => {
      if (token && Date.now() >= expiresAt) {
        token = '';
        updateControls();
        setStatus('Google 연결이 만료됐습니다. 연결 버튼을 다시 눌러 주세요.');
      } else if (document.visibilityState === 'visible') void sync();
    },30000);
    updateControls();
    writeLog('Drive 동기화 진단 로그가 준비됐습니다. API 키와 토큰은 기록하지 않습니다.');
  }

  return {init,restore,capture,queue};
})();
