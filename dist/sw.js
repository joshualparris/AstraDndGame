'use strict';
const CACHE='astra-shell-v3';
const ASSETS=['./','./index.html','./style.css','./extras.css','./aidm-port.css','./engine.js','./aidm-phase2.js','./world.js','./extras.js','./aidm-port.js','./classic.html','./app.js','./manifest.webmanifest','./icon.svg'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',event=>{
  const request=event.request;if(request.method!=='GET')return;
  const url=new URL(request.url);if(url.origin!==self.location.origin||url.pathname.startsWith('/api/'))return;
  event.respondWith(fetch(request).then(response=>{if(response&&response.ok){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(request,copy)).catch(()=>{})}return response}).catch(async()=>{const cached=await caches.match(request);if(cached)return cached;if(request.mode==='navigate')return caches.match('./index.html');return Response.error()}));
});
