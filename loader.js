'use strict';
(() => {
  const discovery='https://raw.githubusercontent.com/Podgy89/ailab-miniapp/runtime/endpoint.json';
  let base='',readAt=0,resolving;
  function checked(value) {
    const url=new URL(value);
    if(url.protocol!=='https:'||url.port||url.username||url.password||url.search||url.hash||url.pathname!=='/'||!url.hostname.endsWith('.lhr.life')&&!url.hostname.endsWith('.localhost.run'))throw new Error('Получен неподходящий адрес подключения.');
    return url.origin;
  }
  async function resolve(force=false) {
    if(!force&&base&&Date.now()-readAt<60000)return base;
    if(resolving)return resolving;
    resolving=(async()=>{
      const response=await fetch(discovery+'?t='+Date.now(),{credentials:'omit',cache:'no-store',redirect:'error',signal:AbortSignal.timeout(12000)});
      if(!response.ok)throw new Error('Адрес ПК пока не опубликован.');
      const data=await response.json();if(typeof data.apiUrl!=='string')throw new Error('AiLab пока не подключён. Убедись, что программа на ПК запущена.');base=checked(data.apiUrl);readAt=Date.now();return base;
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
      let received=0;
      async function asset(name) {
        const chunks=[];let offset=0,total;
        do {
          const response=await api('/api/ui/'+name+'?offset='+offset,{headers,signal:AbortSignal.timeout(20000)});
          if([401,403].includes(response.status))throw new Error('Вход не подтверждён. Закрой окно и открой его заново через бота.');
          if(!response.ok)throw new Error('Интерфейс пока недоступен.');
          const part=await response.json(),bytes=Uint8Array.from(atob(part.data),c=>c.charCodeAt(0));
          if(!Number.isInteger(part.total)||part.total<1||part.total>200000||part.next!==offset+bytes.length||bytes.length<1||bytes.length>2048||part.next>part.total||(total!==undefined&&total!==part.total))throw new Error('Не удалось прочитать интерфейс. Повтори подключение.');
          chunks.push(bytes);offset=part.next;total=part.total;
          received+=bytes.length;status.textContent='Загружаем интерфейс… '+Math.ceil(received/1024)+' КБ';
        }while(offset<total);
        const result=new Uint8Array(total);let position=0;for(const chunk of chunks){result.set(chunk,position);position+=chunk.length;}
        return new TextDecoder().decode(result);
      }
      const markup=await asset('index.html'),doc=new DOMParser().parseFromString(markup,'text/html');
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
