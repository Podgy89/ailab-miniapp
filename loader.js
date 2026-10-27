'use strict';
(() => {
  const discovery='https://raw.githubusercontent.com/Podgy89/ailab-miniapp/runtime/endpoint.json';
  let base='',readAt=0,resolving;
  function checked(value) {
    const url=new URL(value);
    if(url.protocol!=='https:'||url.port||url.username||url.password||url.search||url.hash||url.pathname!=='/'||!url.hostname.endsWith('.lhr.life')&&!url.hostname.endsWith('.localhost.run')&&!url.hostname.endsWith('.trycloudflare.com'))throw new Error('Получен неподходящий адрес подключения.');
    return url.origin;
  }
  async function resolve(force=false) {
    if(!force&&base&&Date.now()-readAt<60000)return base;
    if(resolving)return resolving;
    resolving=(async()=>{
      let data;
      if(force){
        try{
          const fresh=await fetch('https://api.github.com/repos/Podgy89/ailab-miniapp/contents/endpoint.json?ref=runtime&t='+Date.now(),{credentials:'omit',cache:'no-store',redirect:'error',signal:AbortSignal.timeout(12000)});
          if(fresh.ok){const content=await fresh.json();data=typeof content.content==='string'?JSON.parse(atob(content.content.replace(/\s/g,''))):content;}
        }catch{ /* При ограничении публичного API пробуем обычный каталог. */ }
      }
      if(!data){const response=await fetch(discovery+'?t='+Date.now(),{credentials:'omit',cache:'no-store',redirect:'error',signal:AbortSignal.timeout(12000)});if(!response.ok)throw new Error('Адрес ПК пока не опубликован.');data=await response.json();}
      if(typeof data.apiUrl!=='string')throw new Error('AiLab пока не подключён. Убедись, что программа на ПК запущена.');base=checked(data.apiUrl);readAt=Date.now();return base;
    })();
    try{return await resolving;}finally{resolving=null;}
  }
  function pathOnly(path){if(typeof path!=='string'||!path.startsWith('/api/')||path.includes('\\')||path.includes('..'))throw new Error('Неверный путь API.');return path;}
  async function api(path,init={}) {
    pathOnly(path);let previous;
    for(let attempt=0;attempt<2;attempt++) {
      try {
        const target=await resolve(attempt>0);
        const response=await fetch(target+path,{...init,credentials:'omit',cache:'no-store',redirect:'error'});
        const expectedHtml=path==='/api/ui/index.html'&&response.status===200;
        const failed=[502,503,504,530].includes(response.status)||(!expectedHtml&&response.headers.get('content-type')?.includes('text/html'));
        if(failed){readAt=0;if(attempt===0){previous=new Error('Переподключаемся к ПК…');continue;}throw new Error('Туннель сейчас недоступен. Повтори подключение.');}
        return response;
      }catch(error){previous=error;readAt=0;if(init.signal?.aborted)throw error;}
    }
    throw previous||new Error('ПК сейчас недоступен.');
  }
  window.AiLabTransport={fetch:api,url:async path=>(await resolve())+pathOnly(path)};
  async function start() {
    const status=document.getElementById('loader-status'),retry=document.getElementById('loader-retry');
    if(!status)return;retry.hidden=true;
    try {
      const telegram=window.Telegram?.WebApp;
      if(!telegram?.initData)throw new Error('Открой приложение через кнопку AiLab в нашем Telegram-боте.');
      telegram.ready();telegram.expand();status.textContent='Подключаемся к твоему ПК…';
      const headers={'X-Telegram-Init-Data':telegram.initData};
      const response=await api('/api/ui/bootstrap',{headers,signal:AbortSignal.timeout(20000)});
      if([401,403].includes(response.status))throw new Error('Вход не подтверждён. Закрой окно и открой его заново через бота.');
      if(!response.ok)throw new Error('Интерфейс ещё обновляется. Повтори подключение через минуту.');
      const descriptor=await response.json();
      if(!/^[0-9a-f]{64}$/.test(descriptor.digest)||descriptor.file!=='ui-'+descriptor.digest+'.bin')throw new Error('Некорректный пакет интерфейса.');
      status.textContent='Загружаем интерфейс с GitHub…';
      // На GitHub уходит только запрос шифротекста: ни подпись Telegram, ни ключ туда не передаются.
      const encrypted=await fetch('./'+descriptor.file,{credentials:'omit',cache:'force-cache',redirect:'error',signal:AbortSignal.timeout(20000)});
      if(!encrypted.ok)throw new Error('Пакет интерфейса пока недоступен. Повтори подключение.');
      const ciphertext=await encrypted.arrayBuffer();
      if(ciphertext.byteLength<17||ciphertext.byteLength>500000)throw new Error('Неверный размер пакета интерфейса.');
      const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',ciphertext)),b=>b.toString(16).padStart(2,'0')).join('');
      if(digest!==descriptor.digest)throw new Error('Пакет интерфейса загружен не полностью. Повтори подключение.');
      const binary=value=>Uint8Array.from(atob(value),c=>c.charCodeAt(0));
      const key=await crypto.subtle.importKey('raw',binary(descriptor.key),'AES-GCM',false,['decrypt']);
      const plaintext=await crypto.subtle.decrypt({name:'AES-GCM',iv:binary(descriptor.iv),additionalData:new TextEncoder().encode('AiLab Mini App UI v1'),tagLength:128},key,ciphertext);
      const assets=JSON.parse(new TextDecoder().decode(plaintext));
      const names=['index.html','app.css','app.js','model-viewer.js','media.js','chat.js'];
      if(Object.keys(assets).length!==names.length||!names.every(name=>typeof assets[name]==='string'&&assets[name].length<200000))throw new Error('Неполный пакет интерфейса.');
      async function asset(name){return assets[name];}      const markup=await asset('index.html'),doc=new DOMParser().parseFromString(markup,'text/html');
      const css=await asset('app.css'),cssUrl=URL.createObjectURL(new Blob([css],{type:'text/css'}));
      const style=document.createElement('link');style.rel='stylesheet';style.href=cssUrl;
      await new Promise((done,fail)=>{style.onload=done;style.onerror=fail;document.head.append(style);});URL.revokeObjectURL(cssUrl);
      document.getElementById('loader-style')?.remove();
      const scripts=['app.js','model-viewer.js','media.js','chat.js'];
      const sources=await Promise.all(scripts.map(asset));
      document.body.replaceChildren(...doc.body.childNodes);document.title=doc.title;
      for(let i=0;i<scripts.length;i++) {
        const url=URL.createObjectURL(new Blob([sources[i]],{type:'text/javascript'})),script=document.createElement('script');script.src=url;
        try{await new Promise((done,fail)=>{script.onload=done;script.onerror=fail;document.head.append(script);});}finally{URL.revokeObjectURL(url);}
      }
    }catch(error){status.textContent=error.message||'Не удалось подключиться к ПК.';retry.hidden=false;}
  }
  document.getElementById('loader-retry').addEventListener('click',start);start();
})();
