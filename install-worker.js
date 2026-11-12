'use strict';

self.addEventListener('install',event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate',event => event.waitUntil(self.clients.claim()));

self.addEventListener('fetch',event => {
  const request = event.request;
  if (request.mode !== 'navigate' || request.method !== 'GET' ||
      new URL(request.url).origin !== self.location.origin) return;

  // Fetch the private page with its original credentials. Never cache account content or shared links.
  event.respondWith(fetch(request).catch(() => new Response(
    '<!doctype html><html lang="ko"><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>나의 읽기 서가</title><main><h1>연결이 필요합니다</h1>' +
    '<p>인터넷에 연결한 뒤 페이지를 새로고침해 주세요.</p></main></html>',
    {status:503,headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}}
  )));
});
