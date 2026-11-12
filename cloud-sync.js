'use strict';
const CloudSync = (() => {
  const K='reading-library.firebase.';
  let app, sdk, auth, db, user=null, unsub, infoUnsub, connected=false, ready=false, busy=false;
  let needsMigration=false;
  const stable=value=>JSON.stringify(value, function(k,v){return v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v;});
  let enabled=false, initial=null, cloud={entries:{},categories:{}}, queue={entries:{},categories:{}}, bound='';
  const el=id=>document.getElementById(id);
  function status(text,error=false) { el('cloud-status').textContent=text; el('cloud-status').classList.toggle('error',error); }
  function errorText(e) {
    const code=e?.code||'';
    if (/unauthorized-domain/.test(code)) return 'Firebase Authentication → 설정 → 승인된 도메인에 gkbko.github.io를 추가해 주세요.';
    if (/permission|PERMISSION_DENIED/.test(code+e?.message)) return '데이터베이스 권한이 없습니다. 설정 안내의 보안 규칙을 게시했는지 확인해 주세요.';
    if (/popup/.test(code)) return '로그인 창이 닫혔습니다. 일반 Chrome에서 팝업을 허용하고 다시 눌러 주세요.';
    if (/operation-not-allowed/.test(code)) return 'Firebase Authentication에서 Google 로그인을 사용 설정해 주세요.';
    return '클라우드 연결 오류: '+(code||e?.message||'네트워크를 확인해 주세요.');
  }
  function parseConfig(text) {
    let c;
    try { c=JSON.parse(text); } catch {
      // Also accepts Firebase console's public firebaseConfig object without evaluating code.
      const body=text.match(/\{[\s\S]*\}/)?.[0];
      if(!body) throw Error('Firebase 설정 객체를 붙여넣어 주세요.');
      c=JSON.parse(body.replace(/([,{]\s*)([A-Za-z][A-Za-z0-9]*)(\s*:)/g,'$1"$2"$3').replace(/,\s*}/g,'}'));
    }
    const config={};
    for(const k of ['apiKey','authDomain','projectId','appId','databaseURL','storageBucket','messagingSenderId','measurementId']) if(typeof c[k]==='string') config[k]=c[k];
    if(!config.databaseURL && config.projectId) {
      config.databaseURL = 'https://' + config.projectId + '-default-rtdb.firebaseio.com';
    }
    if(!config.apiKey||!config.projectId||!config.authDomain||!config.databaseURL) throw Error('apiKey, authDomain, projectId가 필요합니다.');
    const u=new URL(config.databaseURL);
    if(u.protocol!=='https:'||!/(\.firebaseio\.com|\.firebasedatabase\.app)$/.test(u.hostname)) throw Error('Firebase Realtime Database의 HTTPS 주소를 입력해 주세요.');
    return config;
  }
  function categoryKey(name) { return Array.from(new TextEncoder().encode(name),x=>x.toString(16).padStart(2,'0')).join(''); }
  function saveQueue(next) {
    const disk=JSON.parse(localStorage.getItem(K+'queue.'+bound)||'{"entries":{},"categories":{}}');
    for(const kind of ['entries','categories']) {
      disk[kind] ||= {};
      for(const id of new Set([...Object.keys(queue[kind]),...Object.keys(next[kind])])) {
        const old=queue[kind][id],value=next[kind][id];
        if(value?.op!==old?.op&&value) disk[kind][id]=value;
        else if(!value&&old&&disk[kind][id]?.op===old.op) delete disk[kind][id];
      }
    }
    localStorage.setItem(K+'queue.'+bound,JSON.stringify(disk));queue=disk;
  }
  function saveCache() { if(user) localStorage.setItem(K+'cache.'+user.uid,JSON.stringify(app.get())); }
  function capture(previous,next) {
    if(!enabled) return;
    if(needsMigration) throw Error('먼저 이 기기 기존 기록 합치기를 눌러 자료를 옮겨 주세요.');
    if(!bound) throw Error('먼저 실시간 동기화의 Google 로그인을 완료해 주세요.');
    const pending=JSON.parse(JSON.stringify(queue));
    const before=new Map(previous.entries.map(e=>[e.id,e]));
    const after=new Map(next.entries.map(e=>[e.id,e]));
    for(const id of new Set([...before.keys(),...after.keys()])) {
      const a=before.get(id)||null,b=after.get(id)||null;
      if(JSON.stringify(a)!==JSON.stringify(b)) pending.entries[id]={entry:b,base:pending.entries[id]?pending.entries[id].base:a,op:app.id()};
    }
    if(JSON.stringify(previous.categories)!==JSON.stringify(next.categories)) {
      const all=new Set([...previous.categories,...next.categories]);
      for(const name of all) {
        const position=next.categories.indexOf(name),old=previous.categories.indexOf(name);
        if(position!==old) pending.categories[categoryKey(name)]={name,position,deleted:position<0,op:app.id()};
      }
    }
    saveQueue(pending);
  }
  function renderRemote() {
    if(!ready) return;
    const records={...cloud.entries};
    for(const [id,change] of Object.entries(queue.entries)) records[id]={entry:change.entry};
    const categoryNodes={...cloud.categories,...queue.categories};
    const categories=Object.values(categoryNodes).filter(c=>!c.deleted).sort((a,b)=>a.position-b.position||a.name.localeCompare(b.name)).map(c=>c.name);
    const entries=Object.values(records).filter(r=>r?.entry).map(r=>({...r.entry,category:categories.includes(r.entry.category)?r.entry.category:'',images:r.entry.images||[]}));
    app.validate({entries,categories});
    if(!app.commit({entries,categories})) throw Error('이 기기에 클라우드 기록을 저장할 공간이 부족합니다.');
    saveCache();
  }
  async function flush() {
    if(!enabled||!ready||!connected||!user||user.uid!==bound||busy) return;
    if(!Object.keys(queue.entries).length&&!Object.keys(queue.categories).length) return;
    busy=true;
    try {
      const uid=user.uid;
      for(const [id,change] of Object.entries({...queue.entries})) {
        if(!user||user.uid!==uid) break;
        // A transaction retries against a concurrent writer; preserve a changed remote post on conflicts.
        let conflict=false;
        const result=await sdk.runTransaction(sdk.ref(db,'users/'+uid+'/entries/'+id),current=>{
          const remote=current?.entry?{...current.entry,images:current.entry.images||[]}:null;
          conflict=false;
          if(current?.op===change.op) return;
          conflict=stable(remote)!==stable(change.base)&&stable(remote)!==stable(change.entry);
          if(conflict&&current) return; // keep remote; local version is copied below
          return {entry:change.entry,op:change.op,updatedAt:sdk.serverTimestamp()};
        },{applyLocally:false});
        if(conflict&&!result.committed&&change.entry) {
          const copy={...change.entry,id:app.id(),title:('[충돌 사본] '+change.entry.title).slice(0,240)};
          await sdk.set(sdk.ref(db,'users/'+uid+'/entries/'+copy.id),{entry:copy,op:change.op,updatedAt:sdk.serverTimestamp()});
          status('동시에 수정된 글을 발견해 두 버전을 보관했습니다. [충돌 사본]을 확인해 주세요.');
        } else if(conflict&&!change.entry) status('다른 기기에서 수정한 글은 삭제하지 않고 보관했습니다. 확인 후 다시 삭제해 주세요.');
        if(queue.entries[id]?.op===change.op) {const next=JSON.parse(JSON.stringify(queue));delete next.entries[id];saveQueue(next);}
      }
      const cats={...queue.categories},updates={};
      for(const [id,c] of Object.entries(cats)) updates['users/'+uid+'/categories/'+id]={...c,updatedAt:sdk.serverTimestamp()};
      if(Object.keys(updates).length) {
        await sdk.update(sdk.ref(db),updates);
        const next=JSON.parse(JSON.stringify(queue));
        for(const [id,c] of Object.entries(cats)) if(next.categories[id]?.op===c.op) delete next.categories[id];
        saveQueue(next);
      }
      renderRemote();
      if(!Object.keys(queue.entries).length&&!Object.keys(queue.categories).length) status(user.email+' · 자동 동기화 완료');
    } catch(e) { status(errorText(e)+' 변경 사항은 이 기기에 보관 중입니다.',true); }
    finally { busy=false; }
  }
  function stop() { if(unsub)unsub();if(infoUnsub)infoUnsub();unsub=null;infoUnsub=null;ready=false;connected=false; }
  async function start(config) {
    if(sdk) return;
    status('실시간 동기화 도구를 준비하는 중…');
    const modules=await Promise.all(['app','auth','database'].map(n=>import('https://www.gstatic.com/firebasejs/12.5.0/firebase-'+n+'.js')));
    sdk=Object.assign({},...modules);
    const instance=sdk.initializeApp(config,'reading-library'); auth=sdk.getAuth(instance);db=sdk.getDatabase(instance);
    await sdk.setPersistence(auth,sdk.browserLocalPersistence);
    sdk.onAuthStateChanged(auth,u=>{
      stop();user=u;
      if(!u) {status('설정 완료 · Google 로그인 후 기기 사이에서 자동 동기화됩니다.');el('cloud-import').disabled=true;return;}
      bound=u.uid;localStorage.setItem(K+'bound',bound);
      queue=JSON.parse(localStorage.getItem(K+'queue.'+bound)||'{"entries":{},"categories":{}}');
      // Preserve the old library before the first remote view replaces it.
      initial=app.get();if(!localStorage.getItem(K+'before-cloud')) localStorage.setItem(K+'before-cloud',JSON.stringify(initial));
      infoUnsub=sdk.onValue(sdk.ref(db,'.info/connected'),s=>{
        connected=s.val()===true;
        status(connected?u.email+' · 서버에 연결됨':u.email+' · 오프라인, 변경 사항은 재연결 시 전송됩니다.');
        if(connected)void flush();
      });
      unsub=sdk.onValue(sdk.ref(db,'users/'+bound),s=>{
        try {
          const value=s.val()||{};cloud={entries:value.entries||{},categories:value.categories||{}};ready=true;
          const count=Object.values(cloud.entries).filter(x=>x?.entry).length;
          needsMigration=!count&&!Object.keys(cloud.categories).length&&(initial.entries.length>0||initial.categories.length>0);
          el('cloud-import').disabled=false;
          el('cloud-import').textContent='기존 기록 '+(initial?.entries.length||0)+'건·카테고리 합치기';
          if(count||Object.keys(cloud.categories).length) renderRemote();
          status(u.email+' · 실시간 연결 · 클라우드 '+count+'건'+(!count?' · 기존 기록은 가져오기 버튼으로 옮기세요.':''));
          void flush();
        } catch(e) {status(errorText(e),true);}
      },e=>{ready=false;status(errorText(e),true);});
    });
  }
  async function migrate() {
    if(!user||!ready||!initial) return;
    const records=app.validate(initial),uid=user.uid;
    el('cloud-import').disabled=true;
    try {
      for(const entry of records.entries) await sdk.runTransaction(sdk.ref(db,'users/'+uid+'/entries/'+entry.id),current=>current===null?{entry,op:app.id(),updatedAt:sdk.serverTimestamp()}:undefined,{applyLocally:false});
      for(let position=0;position<records.categories.length;position++) {
        const name=records.categories[position];
        await sdk.runTransaction(sdk.ref(db,'users/'+uid+'/categories/'+categoryKey(name)),current=>current===null?{name,position,deleted:false,updatedAt:sdk.serverTimestamp()}:undefined,{applyLocally:false});
      }
      status('기존 기록 가져오기 완료. 다른 기기에서도 같은 Google 계정으로 로그인하세요.');
    } catch(e) {status(errorText(e),true);}
    finally {el('cloud-import').disabled=false;}
  }
  function init(callbacks) {
    app=callbacks;
    el('cloud-config-form').addEventListener('submit',async event=>{
      event.preventDefault();
      try {
        const c=parseConfig(el('cloud-config').value);
        if(sdk) {status('설정을 바꾸려면 저장된 설정을 수정한 뒤 페이지를 새로고침해 주세요.');localStorage.setItem(K+'config',JSON.stringify(c));return;}
        localStorage.setItem(K+'config',JSON.stringify(c));enabled=true;
        await start(c);status('설정 저장 완료. 아래 Google 로그인 버튼을 눌러 주세요.');
      } catch(e) {status(errorText(e),true);}
    });
        el('cloud-login').addEventListener('click', async () => {
      if(!auth) {
        status('Firebase 연결 준비 중입니다. 잠시 후 다시 눌러주세요...', false);
        try {
          await start(defaultConfig);
        } catch(e) {
          alert('Firebase 시작 오류: ' + (e.message || e.code));
          return;
        }
      }
      if(auth) {
        sdk.signInWithPopup(auth, new sdk.GoogleAuthProvider()).catch(e => {
          alert('Google 로그인 오류: ' + (e.message || e.code));
          status(errorText(e), true);
        });
      }
    });
    el('cloud-logout').addEventListener('click',async()=>{
      if(busy||Object.keys(queue.entries).length||Object.keys(queue.categories).length) {status('아직 서버에 전송하지 못한 변경 사항이 있습니다. 연결 후 완료되면 로그아웃해 주세요.',true);return;}
      if(auth)await sdk.signOut(auth);bound='';localStorage.removeItem(K+'bound');
    });
    el('cloud-import').addEventListener('click',()=>void migrate());
    window.addEventListener('online',()=>void flush());
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)void flush();});
    setInterval(()=>void flush(),15000);
    const defaultConfig = {
  "apiKey": "AIzaSyBOhH_KIj65d6Op0uGK3FolOlNefO4VJrQ",
  "authDomain": "whitebricks-c2983.firebaseapp.com",
  "projectId": "whitebricks-c2983",
  "storageBucket": "whitebricks-c2983.firebasestorage.app",
  "messagingSenderId": "291854550621",
  "appId": "1:291854550621:web:556905063938d4f6a7afb4",
  "measurementId": "G-R24Q7E0NRK",
  "databaseURL": "https://whitebricks-c2983-default-rtdb.firebaseio.com"
};
    try {
      let c = JSON.parse(localStorage.getItem(K+'config')||'null');
      if(!c || !c.apiKey) {
        c = defaultConfig;
        localStorage.setItem(K+'config', JSON.stringify(c));
      }
      enabled = true;
      if(el('cloud-config')) el('cloud-config').value = JSON.stringify(c, null, 2);
      bound = localStorage.getItem(K+'bound') || '';
      queue = JSON.parse(localStorage.getItem(K+'queue.'+bound) || '{"entries":{},"categories":{}}');
      void start(c).catch(e => status(errorText(e), true));
    } catch(e) {
      status(errorText(e), true);
    }
  }
  return {init,capture,queue:()=>{if(enabled)void flush();},enabled:()=>enabled};
})();
