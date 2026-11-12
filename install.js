'use strict';

(() => {
  const button = document.getElementById('install-app');
  const status = document.getElementById('install-status');
  let installPrompt;

  window.addEventListener('beforeinstallprompt',event => {
    event.preventDefault();
    installPrompt = event;
    button.hidden = false;
    status.hidden = true;
  });

  button.addEventListener('click',async () => {
    const prompt = installPrompt;
    if (!prompt) return;
    installPrompt = null;
    button.hidden = true;
    try {
      const {outcome} = await prompt.prompt();
      status.textContent = outcome === 'accepted'
        ? '설치 요청을 받았습니다. 홈 화면에서 나의 읽기 서가를 확인해 주세요.'
        : 'Chrome 메뉴의 홈 화면에 추가에서 다시 시도할 수 있습니다.';
    } catch {
      status.textContent = 'Chrome 메뉴에서 홈 화면에 추가를 선택해 주세요.';
    }
    status.hidden = false;
  });

  window.addEventListener('appinstalled',() => {
    installPrompt = null;
    button.hidden = true;
    status.textContent = '나의 읽기 서가가 설치되었습니다.';
    status.hidden = false;
  });

  if (window.isSecureContext && 'serviceWorker' in navigator) {
    navigator.serviceWorker.register('./install-worker.js',{scope:'./'}).catch(error => {
      console.warn('앱 설치용 서비스 워커를 등록할 수 없습니다.',error);
    });
  }
})();
