import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import worker from '../src/index.ts';
import { makeDB, makeR2 } from './shim.ts';

export const BOT = '123456:TESTTOKEN';
export const ADMIN = { id: 1001, first_name: 'Admin', username: 'adm', language_code: 'ru' };
export const BUYER = { id: 2002, first_name: 'Anna', username: 'anna', language_code: 'en' };
export const OTHER = { id: 3003, first_name: 'Bob', language_code: 'kk' };
export const te = (s: string) => new TextEncoder().encode(s);
export const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);

export function initData(user: any, authDate = Math.floor(Date.now() / 1000), token = BOT) {
  const p = new URLSearchParams({ auth_date: String(authDate), query_id: 'AAH', user: JSON.stringify(user) });
  const dcs = [...p.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([k, v]) => `${k}=${v}`).join('\n');
  p.set('hash', createHmac('sha256', createHmac('sha256', 'WebAppData').update(token).digest()).update(dcs).digest('hex'));
  return p.toString();
}
export const tgCalls: any[] = [];
(globalThis as any).fetch = async (url: any, init: any) => {
  const method = String(url).split('/').pop()!; const body = JSON.parse(init.body); tgCalls.push({ method, body });
  if (method === 'createInvoiceLink') return Response.json({ ok: true, result: 'https://t.me/$inv' + tgCalls.length });
  return Response.json({ ok: true, result: true });
};
export function setup(extra: any = {}) {
  return { DB: makeDB(new URL('../migrations', import.meta.url).pathname), FILES: makeR2(), BOT_TOKEN: BOT, WEBHOOK_SECRET: 'whsec', ADMIN_TELEGRAM_IDS: '1001', DOWNLOAD_SIGNING_KEY: 'sign-key', ALLOWED_ORIGIN: 'https://x.github.io', WEBAPP_URL: 'https://x.github.io/app/', ADMIN_URL: 'https://x.github.io/app/admin/', ...extra } as any;
}
export async function call(env: any, method: string, path: string, o: any = {}) {
  const h: any = { ...(o.headers || {}) };
  if (o.user) h.authorization = 'tma ' + initData(o.user);
  let body: any;
  if (o.raw) { body = o.raw; h['content-length'] = String(o.raw.byteLength); } else if (o.body !== undefined) { body = JSON.stringify(o.body); h['content-type'] = 'application/json'; }
  if (o.secret) h['x-telegram-bot-api-secret-token'] = o.secret;
  const r = await worker.fetch(new Request('https://api.test' + path, { method, headers: h, body }), env, { waitUntil() {} });
  const ct = r.headers.get('content-type') || '';
  return { status: r.status, json: ct.includes('json') ? await r.clone().json() : null, res: r };
}
export const A = (env: any, method: string, path: string, o: any = {}) => call(env, method, path, { user: ADMIN, ...o });
export const sizeId = (env: any, label: string, group = 'women') => env.DB.raw.prepare('SELECT s.id FROM sizes s JOIN size_groups g ON g.id=s.group_id WHERE g.slug=? AND s.label=?').get(group, label).id as number;
export const heightId = (env: any, label: string) => env.DB.raw.prepare("SELECT h.id FROM heights h JOIN height_groups g ON g.id=h.group_id WHERE g.slug='adult' AND h.label=?").get(label).id as number;
export async function newProduct(env: any, sku: string, price = 100) {
  const c = await A(env, 'POST', '/api/admin/products', { body: { sku, name_ru: 'Товар ' + sku, name_en: 'Item ' + sku, category_id: 1, audience_id: 1, price_stars: price } });
  assert.equal(c.status, 201, JSON.stringify(c.json));
  assert.equal((await A(env, 'POST', `/api/admin/upload/image?kind=main&product_id=${c.json.id}`, { raw: PNG })).status, 201);
  return c.json.id as number;
}
export async function pay(env: any, user: any, items: any[], charge?: string) {
  const c = await call(env, 'POST', '/api/cart/checkout', { user, body: { items } });
  if (c.status !== 201) return { c };
  const { number, total_stars: total } = c.json.order;
  const wh = (b: any) => call(env, 'POST', '/api/telegram/webhook', { secret: 'whsec', body: b });
  await wh({ update_id: 1, pre_checkout_query: { id: 'q' + number, from: user, currency: 'XTR', total_amount: total, invoice_payload: number } });
  await wh({ update_id: 2, message: { message_id: 1, from: user, chat: { id: user.id }, successful_payment: { currency: 'XTR', total_amount: total, invoice_payload: number, telegram_payment_charge_id: charge || 'ch_' + number } } });
  return { c, number, total };
}
