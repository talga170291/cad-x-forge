import test from 'node:test';
import assert from 'node:assert/strict';
import { A, ADMIN, BUYER, OTHER, call, heightId, newProduct, pay, setup, sizeId, te } from './helpers.ts';

const pdf = (t: string) => te('%PDF-1.4 ' + t);
const upload = (env: any, pid: number, name: string, content: Uint8Array, extra = '') => A(env, 'POST', `/api/admin/upload/file?product_id=${pid}&format=pdf_a4&filename=${name}${extra}`, { raw: content });
const dlText = async (env: any, user: any, fileId: number) => {
  const l = await call(env, 'POST', `/api/me/files/${fileId}/link`, { user });
  if (l.status !== 200) return l.status;
  const d = await call(env, 'GET', new URL(l.json.url).pathname);
  return d.status === 200 ? new TextDecoder().decode(await d.res.arrayBuffer()) : d.status;
};

async function variantProduct(env: any) {
  const pid = await newProduct(env, 'V-1', 100);
  const r = await A(env, 'POST', `/api/admin/products/${pid}/variants`, { body: { size_ids: [sizeId(env, '42'), sizeId(env, '44')], height_ids: [heightId(env, '164'), heightId(env, '170')] } });
  assert.equal(r.status, 201); assert.equal(r.json.variants.length, 4);
  const vs: any[] = r.json.variants;
  const v = (s: string, h: string) => vs.find((x) => x.size_id === sizeId(env, s) && x.height_id === heightId(env, h)).id as number;
  return { pid, v };
}

test('варианты: создание, синхронизация фильтров, повторное добавление без дублей, ошибки', async () => {
  const env = setup(); const { pid, v } = await variantProduct(env);
  const d = (await A(env, 'GET', `/api/admin/products/${pid}`)).json;
  assert.equal(d.variants.length, 4); assert.equal(d.sizes.length, 2); assert.equal(d.heights.length, 2);
  const again = await A(env, 'POST', `/api/admin/products/${pid}/variants`, { body: { size_ids: [sizeId(env, '42')], height_ids: [heightId(env, '164')] } });
  assert.equal(again.json.variants.length, 4);
  assert.equal((await A(env, 'POST', `/api/admin/products/${pid}/variants`, { body: { size_ids: [] } })).status, 400);
  assert.equal((await A(env, 'POST', `/api/admin/products/${pid}/variants`, { body: { size_ids: [999999] } })).status, 409);
  assert.equal((await A(env, 'POST', `/api/admin/products/999/variants`, { body: { size_ids: [sizeId(env, '46')] } })).status, 404);
  assert.equal((await call(env, 'POST', `/api/admin/products/${pid}/variants`, { user: BUYER, body: { size_ids: [1] } })).status, 403);
  const upd = await A(env, 'PUT', `/api/admin/variants/${v('44', '170')}`, { body: { available: false } });
  assert.equal(upd.json.available, 0);
  const sizeOnly = await A(env, 'POST', `/api/admin/products/${await newProduct(env, 'V-2')}/variants`, { body: { size_ids: [sizeId(env, '46')] } });
  assert.equal(sizeOnly.json.variants[0].height_id, null);
});

test('варианты: публикация требует файл для каждого доступного варианта', async () => {
  const env = setup(); const { pid, v } = await variantProduct(env);
  const nr = await A(env, 'POST', `/api/admin/products/${pid}/publish`);
  assert.equal(nr.status, 409); assert.ok(nr.json.error.details.missing.includes('variant_files'));
  await upload(env, pid, 'A.pdf', pdf('A'), `&variant_id=${v('42', '164')}`);
  assert.equal((await A(env, 'POST', `/api/admin/products/${pid}/publish`)).status, 409);
  for (const [s, h] of [['42', '170'], ['44', '164'], ['44', '170']]) await upload(env, pid, `${s}-${h}.pdf`, pdf(s + h), `&variant_id=${v(s, h)}`);
  assert.equal((await A(env, 'POST', `/api/admin/products/${pid}/publish`)).status, 200);
  assert.equal((await upload(env, pid, 'bad.pdf', pdf('x'), '&variant_id=99999')).status, 400);
  const other = await newProduct(env, 'V-OTHER');
  assert.equal((await upload(env, other, 'bad.pdf', pdf('x'), `&variant_id=${v('42', '164')}`)).status, 400);   // вариант чужого товара
});

test('варианты: покупатель получает файл именно оплаченного сочетания', async () => {
  const env = setup(); const { pid, v } = await variantProduct(env);
  for (const [s, h] of [['42', '164'], ['42', '170'], ['44', '164'], ['44', '170']]) await upload(env, pid, `${s}-${h}.pdf`, pdf(`FILE-${s}-${h}`), `&variant_id=${v(s, h)}`);
  await upload(env, pid, 'common.pdf', pdf('COMMON'));                 // общий файл для всех вариантов
  await A(env, 'POST', `/api/admin/products/${pid}/publish`);
  const pub = (await call(env, 'GET', `/api/products/${pid}`)).json;
  assert.equal(pub.variants.length, 4); assert.ok(!JSON.stringify(pub).includes('storage_key'));
  assert.equal((await call(env, 'POST', '/api/cart/checkout', { user: BUYER, body: { items: [{ product_id: pid }] } })).json.error.code, 'variant_required');
  assert.equal((await call(env, 'POST', '/api/cart/checkout', { user: BUYER, body: { items: [{ product_id: pid, variant_id: 424242 }] } })).json.error.code, 'invalid_variant');
  assert.equal((await call(env, 'POST', '/api/cart/checkout', { user: BUYER, body: { items: [{ product_id: pid, size_id: sizeId(env, '46'), height_id: heightId(env, '164') }] } })).json.error.code, 'invalid_variant');
  await A(env, 'PUT', `/api/admin/variants/${v('44', '164')}`, { body: { available: false } });
  const un = await call(env, 'POST', '/api/cart/checkout', { user: BUYER, body: { items: [{ product_id: pid, variant_id: v('44', '164') }] } });
  assert.equal(un.status, 409); assert.deepEqual(un.json.error.details.variants_unavailable, [v('44', '164')]);
  const a = await pay(env, BUYER, [{ product_id: pid, size_id: sizeId(env, '42'), height_id: heightId(env, '164') }]);
  assert.equal(a.c.status, 201);
  const items = (await call(env, 'GET', '/api/me/purchases', { user: BUYER })).json.items;
  assert.equal(items.length, 1); assert.equal(items[0].size_label, '42'); assert.equal(items[0].height_label, '164'); assert.equal(items[0].files.length, 2);
  const files = Object.fromEntries(await Promise.all(items[0].files.map(async (f: any) => [f.filename, await dlText(env, BUYER, f.id)])));
  assert.match(files['42-164.pdf'], /FILE-42-164/); assert.match(files['common.pdf'], /COMMON/);
  const all = (await A(env, 'GET', `/api/admin/products/${pid}`)).json.files;
  const foreign = all.find((f: any) => f.filename === '42-170.pdf' && f.active);
  assert.equal(await dlText(env, BUYER, foreign.id), 403);             // файл другого варианта недоступен
  assert.equal(await dlText(env, OTHER, items[0].files[0].id), 403);
  const again = await call(env, 'POST', '/api/cart/checkout', { user: BUYER, body: { items: [{ product_id: pid, variant_id: v('42', '164') }] } });
  assert.equal(again.status, 409); assert.deepEqual(again.json.error.details.owned, [pid]);
  const b = await pay(env, BUYER, [{ product_id: pid, variant_id: v('42', '170') }, { product_id: pid, variant_id: v('42', '170') }]);
  assert.equal(b.c.status, 201); assert.equal(b.total, 100);          // дубль строки не удваивает цену, второй вариант покупается отдельно
  assert.equal((await call(env, 'GET', '/api/me/purchases', { user: BUYER })).json.items.length, 2);
  const two = await pay(env, OTHER, [{ product_id: pid, variant_id: v('42', '164') }, { product_id: pid, variant_id: v('42', '170') }]);
  assert.equal(two.total, 200);                                       // два варианта одного товара — две позиции
  // старая покупка «всего товара» (до появления вариантов) сохраняет доступ ко всем файлам
  const legacy = { id: 4004, first_name: 'Old' };
  await call(env, 'GET', '/api/me', { user: legacy });
  const oid = env.DB.raw.prepare("INSERT INTO orders(number,user_id,status,total_stars,expires_at) VALUES('CFX-OLD',4004,'paid',100,9999999999)").run().lastInsertRowid;
  env.DB.raw.prepare('INSERT INTO purchases(user_id,product_id,variant_id,variant_key,order_id) VALUES(4004,?,NULL,0,?)').run(pid, oid);
  assert.equal((await call(env, 'GET', '/api/me/purchases', { user: legacy })).json.items[0].files.length, 5);
});

test('варианты: фильтры показывают недоступные значения, товар остаётся в каталоге', async () => {
  const env = setup(); const { pid, v } = await variantProduct(env);
  for (const [s, h] of [['42', '164'], ['42', '170'], ['44', '164'], ['44', '170']]) await upload(env, pid, `${s}-${h}.pdf`, pdf(s + h), `&variant_id=${v(s, h)}`);
  await A(env, 'POST', `/api/admin/products/${pid}/publish`);
  const s44 = sizeId(env, '44');
  let f = (await call(env, 'GET', '/api/facets')).json; const get = () => f.sizes.find((x: any) => x.id === s44);
  assert.deepEqual([get().n, get().a], [1, 1]);
  await A(env, 'PUT', `/api/admin/variants/${v('44', '164')}`, { body: { available: false } });
  await A(env, 'PUT', `/api/admin/variants/${v('44', '170')}`, { body: { available: false } });
  f = (await call(env, 'GET', '/api/facets')).json;
  assert.deepEqual([get().n, get().a], [1, 0]);                        // значение не пропало, но помечено как недоступное
  const list = (await call(env, 'GET', '/api/products?size=' + s44)).json;
  assert.equal(list.total, 1); assert.equal(list.items[0].in_stock, true); assert.equal(list.items[0].has_variants, true);
  await A(env, 'PUT', `/api/admin/variants/${v('42', '164')}`, { body: { available: false } });
  await A(env, 'PUT', `/api/admin/variants/${v('42', '170')}`, { body: { available: false } });
  assert.equal((await call(env, 'GET', '/api/products')).json.items[0].in_stock, false);
  assert.equal((await call(env, 'GET', '/api/products')).json.total, 1);
});

test('варианты: купленный вариант не удаляется, а отключается; непроданный удаляется с файлами', async () => {
  const env = setup(); const { pid, v } = await variantProduct(env);
  for (const [s, h] of [['42', '164'], ['42', '170'], ['44', '164'], ['44', '170']]) await upload(env, pid, `${s}-${h}.pdf`, pdf(s + h), `&variant_id=${v(s, h)}`);
  await A(env, 'POST', `/api/admin/products/${pid}/publish`);
  await pay(env, BUYER, [{ product_id: pid, variant_id: v('42', '164') }]);
  assert.equal((await A(env, 'DELETE', `/api/admin/variants/${v('42', '164')}`)).json.archived, true);
  assert.equal((await call(env, 'GET', '/api/me/purchases', { user: BUYER })).json.items[0].files.length, 1);   // доступ сохранён
  const before = env.FILES.m.size;
  assert.equal((await A(env, 'DELETE', `/api/admin/variants/${v('44', '170')}`)).json.deleted, true);
  assert.ok(env.FILES.m.size < before);
  assert.equal((await A(env, 'DELETE', `/api/admin/variants/99999`)).status, 404);
  assert.equal((await A(env, 'GET', `/api/admin/products/${pid}`)).json.variants.filter((x: any) => x.active).length, 2);
});

test('страницы, блоки и меню: стартовое содержимое, редактирование, порядок, скрытие и восстановление', async () => {
  const env = setup();
  const info = (await call(env, 'GET', '/api/pages/info')).json;
  assert.equal(info.kind, 'info'); assert.ok(info.blocks.length >= 7);
  assert.equal(info.blocks[0].data.ru.t, 'Цифровые лекала одежды.');
  assert.ok(!JSON.stringify(info).includes('Скачивайте повторно'));
  for (const b of info.blocks.filter((x: any) => x.type !== 'button')) for (const l of ['ru', 'kk', 'en']) assert.ok(b.data[l], 'язык ' + l);
  assert.equal((await call(env, 'GET', '/api/pages/nope')).status, 404);
  assert.equal((await call(env, 'POST', '/api/admin/pages/1/blocks', { user: BUYER, body: { type: 'text', data: {} } })).status, 403);
  const pg = await A(env, 'POST', '/api/admin/dict/pages', { body: { title_ru: 'Оферта', title_en: 'Offer', kind: 'legal' } });
  assert.equal(pg.status, 201); assert.equal(pg.json.slug, 'offer');
  const pg2 = await A(env, 'POST', '/api/admin/dict/pages', { body: { title_ru: 'Оферта 2', title_en: 'Offer', kind: 'legal' } });
  assert.equal(pg2.json.slug, 'offer-2');
  const mk = (type: string, data: any) => A(env, 'POST', `/api/admin/pages/${pg.json.id}/blocks`, { body: { type, data } });
  const b1 = await mk('heading', { ru: { t: 'Условия' } }), b2 = await mk('text', { ru: { t: '<b>текст</b>' }, kk: { t: 'мәтін' } }), b3 = await mk('faq', { ru: { q: 'Q', a: 'A' } });
  assert.deepEqual([b1.status, b2.status, b3.status], [201, 201, 201]);
  assert.equal((await mk('button', { ru: { label: 'Go' }, url: 'javascript:alert(1)' })).status, 400);
  assert.equal((await mk('button', { ru: { label: 'Go' }, url: 'https://t.me/support' })).status, 201);
  assert.equal((await mk('video', {})).status, 400);
  assert.equal((await mk('text', { ru: { t: 'x'.repeat(7000) } })).status, 400);
  assert.equal((await mk('text', { ru: { t: 1 } })).status, 400);
  assert.equal((await mk('image', { key: 'files/1/x' })).status, 400);                 // чужой путь хранилища нельзя вставить в страницу
  const ids = (await A(env, 'GET', '/api/admin/pages/offer')).json.blocks.map((b: any) => b.id);
  assert.equal(ids.length, 4);
  await A(env, 'POST', '/api/admin/reorder', { body: { table: 'page_blocks', work: [ids[3], ids[1], ids[0]], library: [ids[2]] } });
  const pub = (await call(env, 'GET', '/api/pages/offer')).json.blocks.map((b: any) => b.id);
  assert.deepEqual(pub, [ids[3], ids[1], ids[0]]);                                      // перетащенный в «неиспользуемые» блок скрыт
  assert.equal((await A(env, 'GET', '/api/admin/pages/offer')).json.blocks.length, 4);   // но данные целы
  await A(env, 'POST', '/api/admin/reorder', { body: { table: 'page_blocks', work: [...pub, ids[2]], library: [] } });
  assert.equal((await call(env, 'GET', '/api/pages/offer')).json.blocks.length, 4);     // и восстанавливается
  const upd = await A(env, 'PUT', `/api/admin/blocks/${ids[1]}`, { body: { data: { ru: { t: 'новый' } } } });
  assert.equal(upd.json.data.ru.t, 'новый');
  assert.equal((await A(env, 'DELETE', `/api/admin/blocks/${ids[1]}`)).status, 200);
  assert.equal((await A(env, 'DELETE', `/api/admin/blocks/${ids[1]}`)).status, 404);
  // меню
  let boot = (await call(env, 'GET', '/api/bootstrap')).json;
  assert.deepEqual(boot.menu.map((m: any) => m.target), ['cat', 'cart', 'buys', 'info']);
  assert.ok(boot.pages.some((p: any) => p.slug === 'offer'));
  const menu = (await A(env, 'GET', '/api/admin/dict/menu_items')).json.items;
  const m = (t: string) => menu.find((x: any) => x.target === t).id;
  await A(env, 'POST', '/api/admin/reorder', { body: { table: 'menu_items', work: [m('buys'), m('cat'), m('cart')], library: [m('info')] } });
  boot = (await call(env, 'GET', '/api/bootstrap')).json;
  assert.deepEqual(boot.menu.map((x: any) => x.target), ['buys', 'cat', 'cart']);
  const add = await A(env, 'POST', '/api/admin/dict/menu_items', { body: { target: 'page:offer', icon: 'book', label_ru: 'Оферта', sort: 9, visible: 1 } });
  assert.equal(add.status, 201);
  assert.equal((await A(env, 'POST', '/api/admin/dict/menu_items', { body: { target: 'javascript:1', icon: 'book', label_ru: 'x' } })).status, 400);
  assert.equal((await A(env, 'POST', '/api/admin/dict/menu_items', { body: { target: 'page:x', icon: 'virus', label_ru: 'x' } })).status, 400);
  assert.equal((await A(env, 'DELETE', `/api/admin/dict/menu_items/${m('cat')}`)).status, 409);
  assert.equal((await A(env, 'DELETE', `/api/admin/dict/pages/1`)).status, 409);          // страница «Инфо» защищена
  assert.equal((await A(env, 'DELETE', `/api/admin/dict/pages/${pg.json.id}`)).status, 200);
  assert.ok(!(await A(env, 'GET', '/api/admin/dict/menu_items')).json.items.some((x: any) => x.target === 'page:offer'));   // пункт меню исчез вместе со страницей
});

test('справочники: порядок перетаскиванием, неиспользуемые, автогенерация slug, права', async () => {
  const env = setup();
  const c1 = await A(env, 'POST', '/api/admin/dict/categories', { body: { name_ru: 'Тест', audience_id: 2 } });
  assert.equal(c1.status, 201); assert.equal(c1.json.slug, 'item'); assert.equal(c1.json.audience_id, 2);
  assert.equal((await A(env, 'POST', '/api/admin/dict/categories', { body: { name_ru: 'Тест 2' } })).json.slug, 'item-2');
  assert.equal((await A(env, 'POST', '/api/admin/dict/categories', { body: { name_ru: 'x', audience_id: 99999 } })).status, 409);
  const cats = (await A(env, 'GET', '/api/admin/dict/categories')).json.items.map((c: any) => c.id);
  const rev = [...cats].reverse();
  assert.equal((await A(env, 'POST', '/api/admin/reorder', { body: { table: 'categories', work: rev.slice(1), library: [rev[0]] } })).status, 200);
  const boot = (await call(env, 'GET', '/api/bootstrap')).json.categories.map((c: any) => c.id);
  assert.deepEqual(boot, rev.slice(1));                                                  // порядок сохранён, скрытый убран из магазина
  assert.equal((await A(env, 'GET', '/api/admin/dict/categories')).json.items.length, cats.length);   // данные не потеряны
  assert.equal((await A(env, 'POST', '/api/admin/reorder', { body: { table: 'users', work: [1] } })).status, 404);
  assert.equal((await A(env, 'POST', '/api/admin/reorder', { body: { table: 'size_groups', work: [1], library: [2] } })).status, 400);
  assert.equal((await A(env, 'POST', '/api/admin/reorder', { body: { table: 'tags', work: [1, 1] } })).status, 400);
  assert.equal((await A(env, 'POST', '/api/admin/reorder', { body: { table: 'tags', work: ['a'] } })).status, 400);
  assert.equal((await call(env, 'POST', '/api/admin/reorder', { user: BUYER, body: { table: 'tags', work: [1] } })).status, 403);
  await A(env, 'POST', '/api/admin/reorder', { body: { table: 'file_formats', work: ['plt', 'pdf_a4'], library: ['pdf_plotter'] } });
  assert.deepEqual((await call(env, 'GET', '/api/bootstrap')).json.formats.map((f: any) => f.code), ['plt', 'pdf_a4']);
});

test('загрузка по частям: порядок любой, продолжение после обрыва, проверки, докачка Range, видео', async () => {
  const env = setup({ MAX_UPLOAD_MB: '30' });
  const pid = await newProduct(env, 'M-1'); const MiB = 1048576;
  const big = new Uint8Array(17 * MiB); big.set(te('%PDF-1.4 BIG')); big[17 * MiB - 1] = 7;
  const start = (b: any) => A(env, 'POST', '/api/admin/uploads', { body: { product_id: pid, format: 'pdf_a4', filename: 'big.pdf', size: 17 * MiB, ...b } });
  const s = await start({}); assert.equal(s.status, 201); assert.equal(s.json.parts_total, 3);
  const id = s.json.id; const part = (n: number, data: Uint8Array, o: any = {}) => A(env, 'PUT', `/api/admin/uploads/${id}/parts/${n}`, { raw: data, ...o });
  assert.equal((await part(3, big.slice(16 * MiB))).status, 200);
  assert.equal((await part(1, big.slice(0, 8 * MiB))).status, 200);
  assert.equal((await part(2, big.slice(8 * MiB, 9 * MiB))).status, 400);                // неверный размер части
  assert.equal((await part(9, big.slice(0, 8 * MiB))).status, 400);
  assert.equal((await part(2, big.slice(8 * MiB, 16 * MiB), { noLen: true })).status, 200);   // у запроса есть content-length из helpers
  const resume = (await A(env, 'GET', `/api/admin/uploads/${id}`)).json;
  assert.deepEqual(resume.parts, [1, 2, 3]);
  const s2 = await start({}); const id2 = s2.json.id;
  await A(env, 'PUT', `/api/admin/uploads/${id2}/parts/1`, { raw: big.slice(0, 8 * MiB) });
  assert.deepEqual((await A(env, 'GET', `/api/admin/uploads/${id2}`)).json.parts, [1]);   // после обрыва клиент видит, что уже загружено
  assert.equal((await A(env, 'POST', `/api/admin/uploads/${id2}/complete`)).json.error.code, 'parts_missing');
  assert.equal((await A(env, 'DELETE', `/api/admin/uploads/${id2}`)).status, 200);
  assert.equal((await A(env, 'PUT', `/api/admin/uploads/${id2}/parts/2`, { raw: big.slice(8 * MiB, 16 * MiB) })).json.error.code, 'upload_closed');
  const done = await A(env, 'POST', `/api/admin/uploads/${id}/complete`);
  assert.equal(done.status, 201); assert.equal(done.json.size, 17 * MiB); assert.match(done.json.checksum, /^etag:/);
  assert.equal((await A(env, 'POST', `/api/admin/uploads/${id}/complete`)).status, 409);
  await A(env, 'POST', `/api/admin/products/${pid}/publish`);
  await pay(env, BUYER, [{ product_id: pid }]);
  const fid = (await call(env, 'GET', '/api/me/purchases', { user: BUYER })).json.items[0].files[0].id;
  const link = new URL((await call(env, 'POST', `/api/me/files/${fid}/link`, { user: BUYER })).json.url).pathname;
  const full = await call(env, 'GET', link); const data = new Uint8Array(await full.res.arrayBuffer());
  assert.equal(data.length, 17 * MiB); assert.equal(data[17 * MiB - 1], 7); assert.deepEqual(data.slice(0, 8), te('%PDF-1.4').slice(0, 8));
  assert.equal(full.res.headers.get('accept-ranges'), 'bytes');
  const rg = async (h: string) => { const r = await worker_fetch(env, link, h); return { s: r.status, cr: r.headers.get('content-range'), b: new Uint8Array(await r.arrayBuffer()) }; };
  const r1 = await rg('bytes=0-7'); assert.equal(r1.s, 206); assert.equal(r1.cr, `bytes 0-7/${17 * MiB}`); assert.deepEqual(r1.b, te('%PDF-1.4'));
  const r2 = await rg('bytes=-1'); assert.equal(r2.s, 206); assert.deepEqual([...r2.b], [7]);
  assert.equal((await rg('bytes=99999999999-')).s, 416);
  assert.equal((await rg('bytes=5-2')).s, 416);
  // проверки старта
  assert.equal((await start({ filename: 'big.exe' })).status, 415);
  assert.equal((await start({ size: 31 * MiB })).status, 413);
  assert.equal((await start({ format: 'nope' })).status, 400);
  assert.equal((await start({ product_id: 9999 })).status, 404);
  assert.equal((await call(env, 'POST', '/api/admin/uploads', { user: BUYER, body: {} })).status, 403);
  const bad = await start({ size: 9 * MiB, filename: 'x.pdf' });
  assert.equal((await A(env, 'PUT', `/api/admin/uploads/${bad.json.id}/parts/1`, { raw: new Uint8Array(8 * MiB).fill(65) })).status, 415);   // это не PDF
  // видео: отдельный формат из справочника, потоковая ссылка с запасом по времени
  assert.equal((await A(env, 'POST', '/api/admin/dict/file_formats', { body: { code: 'mp4', label: 'Видео MP4', ext: 'mp4', sort: 9 } })).status, 201);
  const vp = await newProduct(env, 'M-2');
  assert.equal((await A(env, 'POST', `/api/admin/upload/file?product_id=${vp}&format=mp4&filename=lesson.mp4`, { raw: te('fake-video-bytes') })).status, 201);
  assert.equal((await A(env, 'POST', `/api/admin/products/${vp}/publish`)).status, 200);
  await pay(env, BUYER, [{ product_id: vp }]);
  const vf = (await call(env, 'GET', '/api/me/purchases', { user: BUYER })).json.items.find((x: any) => x.product_id === vp).files[0].id;
  const il = (await call(env, 'POST', `/api/me/files/${vf}/link?inline=1`, { user: BUYER })).json;
  assert.equal(il.inline, true); assert.equal(il.expires_in, 3600);
  const v = await call(env, 'GET', new URL(il.url).pathname);
  assert.match(v.res.headers.get('content-disposition')!, /^inline/); assert.equal(v.res.headers.get('content-type'), 'video/mp4');
  assert.equal((await call(env, 'POST', `/api/me/files/${fid}/link?inline=1`, { user: BUYER })).json.inline, false);   // PDF инлайном не отдаётся
});
import worker from '../src/index.ts';
const worker_fetch = (env: any, path: string, range: string) => worker.fetch(new Request('https://api.test' + path, { headers: { range } }), env, { waitUntil() {} });
