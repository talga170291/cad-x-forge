// Интеграция: настоящие index.html и admin/index.html (версия V3) работают с настоящим Worker в памяти.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import worker from '../src/index.ts';
import { A, ADMIN, BUYER, PNG, call, heightId, initData, newProduct, setup, sizeId, te } from './helpers.ts';

const root = new URL('../../', import.meta.url).pathname;
const file = (p: string) => readFileSync(root + p, 'utf8');
const inline = (html: string) => html.split('<script>')[1].split('</script>')[0];
const MiB = 1048576;

function makeCtx(env: any, user: any, extra: any = {}) {
  const els: any = {}; const mk = () => ({ innerHTML: '', textContent: '', value: '', classList: { add() {}, remove() {} }, dataset: {}, querySelector: () => null, querySelectorAll: () => [] });
  const store: any = {}; const log: string[] = [];
  const apiFetch = async (url: string, init: any = {}) => {
    if (String(url).startsWith('https://api.test')) {
      const h = { ...(init.headers || {}) }; if (init.body instanceof Blob) h['content-length'] = String(init.body.size);
      log.push((init.method || 'GET') + ' ' + String(url).replace('https://api.test', ''));
      return worker.fetch(new Request(url, { ...init, headers: h }), env, { waitUntil() {} });
    }
    return Response.json({ ok: true, result: String(url).endsWith('createInvoiceLink') ? 'https://t.me/$inv' : true });
  };
  const ctx: any = { __inv: null, __link: null, __env: env, __log: log, console, setTimeout, clearTimeout, URLSearchParams, Blob, File, TextEncoder, TextDecoder, ...extra,
    document: { querySelector: (s: string) => els[s] || (els[s] = mk()), querySelectorAll: () => [], createElement: mk, addEventListener() {}, documentElement: { lang: '' } },
    localStorage: { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v; }, removeItem: (k: string) => { delete store[k]; } },
    location: { search: '' }, scrollTo() {}, scrollY: 0, fetch: apiFetch, CFX: { API: 'https://api.test' } };
  ctx.window = ctx;
  ctx.Telegram = { WebApp: { initData: user ? initData(user) : '', initDataUnsafe: { user }, ready() {}, expand() {}, openInvoice(l: string, cb: any) { ctx.__inv = { l, cb }; }, openLink(u: string) { ctx.__link = u; }, isVersionAtLeast: () => false } };
  return vm.createContext(ctx);
}
const PRE = 'const sleep=ms=>new Promise(r=>setTimeout(r,ms));const el=d=>({dataset:d});globalThis.__out=[];const ok=(c,m)=>{if(!c)__out.push("FAIL "+m)};';
const run = async (ctx: any, page: string, test: string) => {
  vm.runInContext(readFileSync(root + 'api.js', 'utf8') + '\n' + inline(file(page)) + '\n' + PRE + `globalThis.__done=(async()=>{${test}})().catch(e=>{__out.push('ERROR '+(e&&e.message||JSON.stringify(e)))});`, ctx);
  await ctx.__done; return Array.from(ctx.__out) as string[];
};
const pdf = (s: string) => te('%PDF-1.4 ' + s);

async function seed(env: any) {
  const a = (m: string, p: string, o: any = {}) => A(env, m, p, o);
  const pid = await newProduct(env, 'FE-V', 150);
  await a('POST', `/api/admin/upload/image?kind=extra&product_id=${pid}`, { raw: PNG });
  const vr = await a('POST', `/api/admin/products/${pid}/variants`, { body: { size_ids: [sizeId(env, '42'), sizeId(env, '44')], height_ids: [heightId(env, '164'), heightId(env, '170')] } });
  const vs = vr.json.variants as any[]; const V = (s: string, h: string) => vs.find((x) => x.size_id === sizeId(env, s) && x.height_id === heightId(env, h)).id as number;
  for (const [s, h] of [['42', '164'], ['42', '170'], ['44', '164'], ['44', '170']]) await a('POST', `/api/admin/upload/file?product_id=${pid}&format=pdf_a4&filename=${s}-${h}.pdf&variant_id=${V(s, h)}`, { raw: pdf(`FILE-${s}-${h}`) });
  assert.equal((await a('POST', `/api/admin/products/${pid}/publish`)).status, 200);
  return { pid, V, s42: sizeId(env, '42'), s44: sizeId(env, '44'), h164: heightId(env, '164'), h170: heightId(env, '170') };
}

test('магазин V3: язык, шапка, лупа, выбор варианта, оплата, файл варианта, страница «Инфо» из БД', async () => {
  const env = setup(); const S = await seed(env);
  const ctx = makeCtx(env, BUYER);
  const out = await run(ctx, 'index.html', `await sleep(400);
   ok(S.boot&&S.boot.menu.length===4&&S.list.items.length===1,'данные загружены из API');
   const h=hd({lang:true});ok(h.includes('>RU<')&&h.includes('>EN<')&&h.includes('>KAZ<')&&!h.includes('>KK<'),'RU / EN / KAZ');ok(!hd({title:'x'}).includes('lg3'),'язык переключается только на главной');
   ok(vCat().includes('<svg')&&nav().includes('data-v="buys"'),'лупа и вкладки меню');
   await openP(${S.pid});let v=vPrd();
   ok(v.includes(t('pick'))&&/data-a="now"[^>]*disabled/.test(v),'без выбора варианта купить нельзя');ok(v.includes('gnext')&&!v.includes('#1'),'стрелки вместо #1, #2');ok(v.includes('bt go'),'зелёная кнопка покупки');
   act('sel',el({k:'size',v:'${S.s44}'}));act('sel',el({k:'height',v:'${S.h164}'}));ok(variantState(S.prod).state==='ok','сочетание 44/164 выбрано');
   __env.DB.raw.exec("UPDATE product_variants SET available=0 WHERE size_id=${S.s44} AND height_id=${S.h164}");await openP(${S.pid});act('sel',el({k:'size',v:'${S.s44}'}));act('sel',el({k:'height',v:'${S.h164}'}));
   v=vPrd();ok(v.includes(t('combo'))&&/data-a="now"[^>]*disabled/.test(v)&&/class="ch[^"]*\\bna\\b/.test(v),'недоступное сочетание видно, но не покупается');
   act('sel',el({k:'height',v:'${S.h164}'}));act('sel',el({k:'size',v:'${S.s42}'}));act('sel',el({k:'height',v:'${S.h164}'}));
   await act('add',el({v:'${S.pid}'}));ok(S.cart.length===1&&S.cart[0].vid===${S.V('42', '164')},'вариант в корзине');
   await go('cart');ok(vCart().includes('42 / 164')&&vCart().includes('★ 150'),'корзина показывает вариант');
   await act('co',el({}));await act('pay',el({}));ok(!!__inv,'открыт счёт Stars');
   const o=__env.DB.raw.prepare('SELECT number,total_stars FROM orders').get();ok(o.total_stars===150,'сумма с сервера');
   const wh=b=>fetch('https://api.test/api/telegram/webhook',{method:'POST',headers:{'x-telegram-bot-api-secret-token':'whsec','content-type':'application/json'},body:JSON.stringify(b)});
   const me=Telegram.WebApp.initDataUnsafe.user;
   await wh({update_id:1,pre_checkout_query:{id:'q',from:me,currency:'XTR',total_amount:150,invoice_payload:o.number}});
   await wh({update_id:2,message:{message_id:1,from:me,chat:{id:me.id},successful_payment:{currency:'XTR',total_amount:150,invoice_payload:o.number,telegram_payment_charge_id:'c1'}}});
   await __inv.cb('paid');ok(S.sheet===3&&S.cart.length===0,'оплата подтверждена');
   await go('buys');ok(vBuys().includes(o.number)&&vBuys().includes('42 / 164'),'покупка с вариантом в списке');
   const fid=S.buys.items[0].files[0].id;await act('get',el({v:String(fid)}));const r=await fetch(__link);ok(r.status===200&&(await r.text()).includes('FILE-42-164'),'скачан файл именно этого варианта');
   await openP(${S.pid});act('sel',el({k:'size',v:'${S.s42}'}));act('sel',el({k:'height',v:'${S.h164}'}));ok(vPrd().includes(t('own')),'этот вариант уже куплен');
   act('sel',el({k:'height',v:'${S.h164}'}));act('sel',el({k:'height',v:'${S.h170}'}));ok(!/data-a="now"[^>]*disabled/.test(vPrd()),'другой вариант можно купить');
   S.pid=null;setLang('ru');await go('info');const pg=vPage();ok(pg.includes('Цифровые лекала одежды.')&&!pg.includes('Скачивайте повторно')&&(pg.match(/<details>/g)||[]).length===3,'«Инфо» из БД без лишней фразы');
   setLang('kk');ok(vPage().includes('Киімнің сандық қалыптары.'),'KAZ');setLang('en');ok(vPage().includes('Digital clothing patterns.'),'EN');setLang('ru');
   await go('cart');await act('cartback',el({}));ok(S.tab==='info','возврат из корзины на предыдущую страницу');
   S.fac=await API('/api/facets');S.showF=true;__env.DB.raw.exec("UPDATE product_variants SET available=0 WHERE size_id=${S.s42}");S.fac=await API('/api/facets');ok(filterPanel().includes(t('na')),'фильтр показывает недоступные значения');`);
  assert.deepEqual(out, []);
});

test('магазин без Telegram: каталог и «Инфо» видны, оплата и покупки недоступны', async () => {
  const env = setup(); await seed(env); const ctx = makeCtx(env, null);
  const out = await run(ctx, 'index.html', `await sleep(300);ok(S.list.items.length===1,'каталог без авторизации');await go('buys');ok(vBuys().includes(t('openTg')),'покупки требуют Telegram');
   await go('info');ok(vPage().includes('Цифровые лекала одежды.'),'«Инфо» открывается');S.sheet=1;S.cart=[{id:1,vid:1}];await act('pay',el({}));ok(!__inv,'без Telegram счёт не открывается');`);
  assert.deepEqual(out, []);
});

test('админка V3: справочники без лишних колонок, порядок, варианты, загрузка по частям с продолжением, страницы и меню', async () => {
  const env = setup(); const pid = await newProduct(env, 'AD-1', 90);
  const ctx = makeCtx(env, ADMIN);
  const fakeRoot = (table: string, work: any[], lib: any[]) => ({ dataset: { dz: table }, querySelector: (s: string) => (s.includes('data-z="lib"') ? (lib.length || table !== 'size_groups' ? {} : null) : {}), querySelectorAll: (s: string) => (s.includes('data-z="work"') ? work : s.includes('data-z="lib"') ? lib : []).map((id) => ({ dataset: { id: String(id) } })) });
  ctx.__fakeRoot = fakeRoot;
  const out = await run(ctx, 'admin/index.html', `await sleep(500);
   ok(S.auth&&S.auth.id===1001&&S.D.categories.length>=22&&S.D.file_formats.length===3,'вход и справочники');
   await go('tax');let h=V.tax();ok(h.includes('data-dz="categories"')&&h.includes('Рабочая область')&&h.includes('Неиспользуемые')&&h.includes('class="hg"'),'зоны и перетаскивание');
   ok(!h.includes('placeholder="slug"')&&!h.includes('Родитель')&&!h.includes('Порядок</')&&!h.includes('Скрыть</')&&!h.includes('Фото'),'убраны slug, родитель, порядок, скрыть, фото');ok(h.includes('data-d="audience_id"'),'выбор аудитории вместо фото');
   S.dict='tags';await refreshDz('tags');const ids=S.D.tags.map(t=>t.id),rev=[...ids].reverse();
   await saveOrder(__fakeRoot('tags',rev.slice(1),[rev[0]]));ok(S.D.tags.map(t=>t.id).join()===[...rev.slice(1),rev[0]].join()&&S.D.tags.find(t=>t.id===rev[0]).hidden===1,'порядок и «убрать» сохранены в БД');
   await saveOrder(__fakeRoot('tags',rev,[]));ok(S.D.tags.every(t=>!t.hidden),'элемент возвращён в рабочую область');
   S.dict='categories';const row={closest:()=>({querySelector:s=>({value:({name_ru:'Накидки',name_kk:'',name_en:'Capes',audience_id:'1'})[s.match(/data-d="(\\w+)"/)[1]]||''})}),dataset:{v:'new'}};await act('dsave',row);ok(S.D.categories.some(c=>c.name_ru==='Накидки'&&c.audience_id===1&&c.slug),'категория без slug создана с аудиторией');
   await reload(${pid});S.vsel={sizes:[],heights:[]};const sz=S.D.sizes.filter(s=>s.group_id===1&&['42','44'].includes(s.label)).map(s=>s.id),hg=S.D.heights.filter(x=>x.group_id===1&&['164','170'].includes(x.label)).map(x=>x.id);
   sz.forEach(i=>act('vs',el({k:'sizes',v:String(i)})));hg.forEach(i=>act('vs',el({k:'heights',v:String(i)})));await act('vadd',el({}));ok(S.ed.variants.length===4&&V.form().includes('в наличии'),'варианты созданы');
   const v1=S.ed.variants[0].id;await act('vav',{dataset:{v:String(v1)},checked:false});ok(S.ed.variants[0].available===0,'наличие варианта переключается');
   await act('vopen',el({v:String(v1)}));ok(V.form().includes('data-vid="'+v1+'"'),'загрузка файлов варианта');
   const r1=await uploadAny(new File([new TextEncoder().encode('%PDF-1.4 small')],'v.pdf'),${pid},v1,'pdf_a4');ok(r1.variant_id===v1&&r1.size>0,'малый файл варианта загружен');
   const big=new Uint8Array(21*${MiB});big.set(new TextEncoder().encode('%PDF-1.4 BIG'));const F=new File([big],'big.pdf');
   const orig=globalThis.fetch;let fails=3,puts=0;globalThis.fetch=(u,i)=>{if(/\\/parts\\/\\d$/.test(u)){puts++;if(/parts\\/2$/.test(u)&&fails>0){fails--;return Promise.reject(new TypeError('net'))}}return orig(u,i)};
   let e1=null;try{await uploadAny(F,${pid},null,'pdf_a4')}catch(e){e1=e}ok(e1&&e1.code==='network','обрыв связи на 2-й части сообщается');
   const before=puts;const r2=await uploadAny(F,${pid},null,'pdf_a4');globalThis.fetch=orig;ok(r2.size===21*${MiB}&&r2.checksum.startsWith('etag:'),'докачка завершена');ok(puts-before===2,'часть 1 повторно не загружалась (продолжение после обрыва)');
   await reload(${pid});ok(V.form().includes('big.pdf'),'большой файл виден в карточке');
   await act('pst',el({v:'published'}));ok(S.ed.status==='published'||$('#toast').textContent.length>0,'статус меняется');
   await go('pages');ok(S.pg.list.some(p=>p.slug==='info'),'страницы загружены');$('#np').value='Оферта';$('#npk').value='legal';await act('padd',el({}));ok(S.pg.cur&&S.pg.cur.kind==='legal','страница создана');
   await act('badd',el({v:'text'}));const b=S.pg.cur.blocks[0];b.data={ru:{t:'Условия оферты'},kk:{t:'Шарттар'}};await act('bsave',el({v:String(b.id)}));
   const pub=await API('/api/pages/'+S.pg.cur.slug);ok(pub.blocks[0].data.ru.t==='Условия оферты'&&pub.blocks[0].data.kk.t==='Шарттар','текст блока сохранён и виден покупателям');
   ok(V.pages().includes('data-dz="page_blocks"')&&V.pages().includes('KAZ'),'редактор блоков');
   const pslug=S.pg.cur.slug;await go('menu');ok(S.menu.length===4,'меню загружено');
   await act('msave',{dataset:{v:'new'},closest:()=>({querySelectorAll:()=>[{dataset:{d:'target'},value:'page:'+pslug},{dataset:{d:'icon'},value:'book'},{dataset:{d:'label_ru'},value:'Оферта'},{dataset:{d:'label_kk'},value:''},{dataset:{d:'label_en'},value:'Offer'}]})});
   ok(S.menu.length===5&&(await API('/api/bootstrap')).menu.some(m=>m.target==='page:'+pslug),'новая вкладка меню видна в магазине');
   for(const t of ['dash','prod','ord','cus','set','audit']){await go(t);ok(!S.err,'вкладка '+t)}`);
  assert.deepEqual(out, []);
});

test('админка: не-администратор получает отказ, без Telegram — подсказка', async () => {
  const env = setup(); const c1 = makeCtx(env, BUYER);
  assert.deepEqual(await run(c1, 'admin/index.html', `await sleep(300);ok(S.err&&S.err.code==='forbidden'&&!S.auth,'отказ не-админу');`), []);
  const c2 = makeCtx(env, null);
  assert.deepEqual(await run(c2, 'admin/index.html', `await sleep(100);ok(S.err&&S.err.code==='unauthorized'&&$('#app').innerHTML.includes('/admin'),'подсказка про /admin');`), []);
});
