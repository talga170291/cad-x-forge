import type { Ctx } from './types.ts';
import { HttpError, int, json, now, sha256, cleanFilename } from './util.ts';
import { dbErr, imgUrl } from './catalog.ts';

const mb = (v: string | undefined, d: number) => Math.floor((Number(v) || d) * 1048576);
function sniffImage(b: Uint8Array): [string, string] | null {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return ['jpg', 'image/jpeg'];
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return ['png', 'image/png'];
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return ['webp', 'image/webp'];
  return null;
}
async function readBody(c: Ctx, max: number) {
  const cl = Number(c.req.headers.get('content-length'));
  if (!Number.isFinite(cl) || cl <= 0) throw new HttpError(411, 'length_required');
  if (cl > max) throw new HttpError(413, 'file_too_large');
  const buf = await c.req.arrayBuffer();
  if (buf.byteLength === 0 || buf.byteLength > max) throw new HttpError(413, 'file_too_large');
  return buf;
}

// Изображения: тело запроса = байты файла. Параметры: kind=main|extra|preview (+product_id) | category (+category_id) | logo.
export async function uploadImage(c: Ctx) {
  const sp = c.url.searchParams; const kind = sp.get('kind') || 'extra';
  if (!['main', 'extra', 'preview', 'logo', 'category', 'content'].includes(kind)) throw new HttpError(400, 'validation', { field: 'kind' });
  const pid = int(sp.get('product_id'), 0), cid = int(sp.get('category_id'), 0);
  const buf = await readBody(c, mb(c.env.MAX_IMAGE_MB, 5));
  const t = sniffImage(new Uint8Array(buf, 0, Math.min(16, buf.byteLength)));
  if (!t) throw new HttpError(415, 'invalid_file_type');
  const isProduct = ['main', 'extra', 'preview'].includes(kind);
  if (isProduct && !(await c.env.DB.prepare('SELECT 1 x FROM products WHERE id=?').bind(pid).first())) throw new HttpError(404, 'not_found');
  if (kind === 'category' && !(await c.env.DB.prepare('SELECT 1 x FROM categories WHERE id=?').bind(cid).first())) throw new HttpError(404, 'not_found');
  const key = `${isProduct ? 'images/' + pid : 'branding'}/${crypto.randomUUID()}.${t[0]}`;
  await c.env.FILES.put(key, buf, { httpMetadata: { contentType: t[1] } });
  try {
    if (isProduct) {
      const sort = ((await c.env.DB.prepare('SELECT COALESCE(MAX(sort),0)+1 n FROM product_images WHERE product_id=?').bind(pid).first())!.n) as number;
      const st = [];
      if (kind === 'main') st.push(c.env.DB.prepare("UPDATE product_images SET kind='extra' WHERE product_id=? AND kind='main'").bind(pid));
      st.push(c.env.DB.prepare('INSERT INTO product_images(product_id,storage_key,kind,sort,created_at) VALUES(?,?,?,?,?)').bind(pid, key, kind, sort, now()));
      st.push(c.env.DB.prepare('UPDATE products SET updated_at=? WHERE id=?').bind(now(), pid));
      await c.env.DB.batch(st);
    } else if (kind === 'content') { /* только файл в хранилище; ключ вставляется в блок страницы */ } else if (kind === 'category') await c.env.DB.prepare('UPDATE categories SET image_key=?,updated_at=? WHERE id=?').bind(key, now(), cid).run();
    else await c.env.DB.prepare("INSERT INTO store_settings(key,value,updated_at) VALUES('logo_key',?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at").bind(JSON.stringify(key), now()).run();
  } catch (e) { await c.env.FILES.delete(key); dbErr(e); }
  return json({ key, url: imgUrl(key), kind, size: buf.byteLength }, 201);
}

// Проверка начала файла (до 1 КБ): исполняемые файлы запрещены, PDF и PLT проверяются по содержимому.
function checkHead(ext: string, head: Uint8Array) {
  const text = new TextDecoder('latin1').decode(head);
  if ((head[0] === 0x4d && head[1] === 0x5a) || (head[0] === 0x7f && head[1] === 0x45) || text.startsWith('#!')) throw new HttpError(415, 'invalid_file_type');
  if (ext === 'pdf' && !text.includes('%PDF-')) throw new HttpError(415, 'invalid_file_type');
  if (ext === 'plt' && head.includes(0)) throw new HttpError(415, 'invalid_file_type');
}
async function variantOf(c: Ctx, pid: number, raw: any) {
  const vid = int(raw, 0);
  if (!vid) return null;
  if (!(await c.env.DB.prepare('SELECT 1 x FROM product_variants WHERE id=? AND product_id=?').bind(vid, pid).first())) throw new HttpError(400, 'invalid_variant');
  return vid;
}
const publishFile = (env: Ctx['env'], pid: number, vid: number | null, format: string, name: string, key: string, size: number, checksum: string, version: number, extra: any[] = []) => [
  env.DB.prepare('UPDATE product_files SET active=0 WHERE product_id=? AND format=? AND variant_id IS ? AND active=1').bind(pid, format, vid),
  env.DB.prepare('INSERT INTO product_files(product_id,variant_id,format,filename,storage_key,size,checksum,version,active,created_at) VALUES(?,?,?,?,?,?,?,?,1,?)').bind(pid, vid, format, name, key, size, checksum, version, now()),
  env.DB.prepare('UPDATE products SET updated_at=? WHERE id=?').bind(now(), pid), ...extra,
];
const nextVersion = async (env: Ctx['env'], pid: number, vid: number | null, format: string) =>
  ((await env.DB.prepare('SELECT COALESCE(MAX(version),0)+1 n FROM product_files WHERE product_id=? AND format=? AND variant_id IS ?').bind(pid, format, vid).first())!.n) as number;

// Файлы выкроек. Параметры: product_id, format (код из file_formats), filename, variant_id (необязательно). Тело = байты файла (до MAX_FILE_MB; большие — загрузкой по частям).
export async function uploadFile(c: Ctx) {
  const sp = c.url.searchParams; const pid = int(sp.get('product_id'), 0); const format = sp.get('format') || '';
  const fmt = await c.env.DB.prepare('SELECT * FROM file_formats WHERE code=? AND active=1').bind(format).first();
  if (!fmt) throw new HttpError(400, 'invalid_format');
  const name = cleanFilename(sp.get('filename') || c.req.headers.get('x-filename') || '');
  if (name.split('.').pop()!.toLowerCase() !== fmt.ext) throw new HttpError(415, 'invalid_file_type', { expected: fmt.ext });
  if (!(await c.env.DB.prepare('SELECT 1 x FROM products WHERE id=?').bind(pid).first())) throw new HttpError(404, 'not_found');
  const vid = await variantOf(c, pid, sp.get('variant_id'));
  const buf = await readBody(c, mb(c.env.MAX_FILE_MB, 25));
  checkHead(fmt.ext, new Uint8Array(buf, 0, Math.min(1024, buf.byteLength)));
  const checksum = await sha256(buf);
  const version = await nextVersion(c.env, pid, vid, format);
  const key = `files/${pid}/${vid ? 'v' + vid : 'all'}/${format}/r${version}-${crypto.randomUUID()}`;
  await c.env.FILES.put(key, buf, { httpMetadata: { contentType: 'application/octet-stream' }, customMetadata: { product: String(pid), format, sha256: checksum } });
  try { await c.env.DB.batch(publishFile(c.env, pid, vid, format, name, key, buf.byteLength, checksum, version)); }
  catch (e) { await c.env.FILES.delete(key); dbErr(e); }
  const row = await c.env.DB.prepare('SELECT id,product_id,variant_id,format,filename,size,checksum,version,active,created_at FROM product_files WHERE storage_key=?').bind(key).first();
  return json(row, 201);
}

// ---------- загрузка по частям с продолжением (большие файлы, архивы, видео) ----------
const PART = 8 * 1048576;                       // размер части; все части, кроме последней, равны
const maxUpload = (env: Ctx['env']) => Math.floor((Number(env.MAX_UPLOAD_MB) || 5120) * 1048576);
const partsTotal = (size: number) => Math.ceil(size / PART);
async function session(c: Ctx, id: string) {
  const u = await c.env.DB.prepare('SELECT * FROM uploads WHERE id=?').bind(id).first();
  if (!u) throw new HttpError(404, 'not_found');
  return u;
}
export async function startUpload(c: Ctx) {
  const b: any = await c.req.json().catch(() => null);
  const pid = int(b?.product_id, 0), format = String(b?.format || ''), size = int(b?.size, 0);
  const fmt = await c.env.DB.prepare('SELECT * FROM file_formats WHERE code=? AND active=1').bind(format).first();
  if (!fmt) throw new HttpError(400, 'invalid_format');
  const name = cleanFilename(String(b?.filename || ''));
  if (name.split('.').pop()!.toLowerCase() !== fmt.ext) throw new HttpError(415, 'invalid_file_type', { expected: fmt.ext });
  if (!(await c.env.DB.prepare('SELECT 1 x FROM products WHERE id=?').bind(pid).first())) throw new HttpError(404, 'not_found');
  const vid = await variantOf(c, pid, b?.variant_id);
  if (size <= 0 || size > maxUpload(c.env)) throw new HttpError(413, 'file_too_large', { max_mb: Math.floor(maxUpload(c.env) / 1048576) });
  const id = crypto.randomUUID(); const version = await nextVersion(c.env, pid, vid, format);
  const key = `files/${pid}/${vid ? 'v' + vid : 'all'}/${format}/r${version}-${id}`;
  const mp = await c.env.FILES.createMultipartUpload(key, { httpMetadata: { contentType: 'application/octet-stream' }, customMetadata: { product: String(pid), format } });
  await c.env.DB.prepare('INSERT INTO uploads(id,storage_key,r2_upload_id,product_id,variant_id,format,filename,size,part_size,admin_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)')
    .bind(id, key, mp.uploadId, pid, vid, format, name, size, PART, c.user!.id, now(), now()).run();
  return json({ id, part_size: PART, parts_total: partsTotal(size) }, 201);
}
export async function uploadStatus(c: Ctx, id: string) {
  const u = await session(c, id);
  const parts = (await c.env.DB.prepare('SELECT n FROM upload_parts WHERE upload_id=? ORDER BY n').bind(id).all()).results.map((x: any) => x.n);
  return json({ id, status: u.status, size: u.size, part_size: u.part_size, parts_total: partsTotal(u.size), parts });
}
export async function putPart(c: Ctx, id: string, n: number) {
  const u = await session(c, id);
  if (u.status !== 'open') throw new HttpError(409, 'upload_closed');
  const total = partsTotal(u.size);
  if (!Number.isInteger(n) || n < 1 || n > total) throw new HttpError(400, 'validation', { field: 'part' });
  const expected = n < total ? u.part_size : u.size - (total - 1) * u.part_size;
  const cl = Number(c.req.headers.get('content-length'));
  if (!Number.isFinite(cl) || cl <= 0) throw new HttpError(411, 'length_required');
  if (cl !== expected) throw new HttpError(400, 'bad_part_size', { expected });
  const buf = await c.req.arrayBuffer();
  if (buf.byteLength !== expected) throw new HttpError(400, 'bad_part_size', { expected });
  if (n === 1) { const fmt = await c.env.DB.prepare('SELECT ext FROM file_formats WHERE code=?').bind(u.format).first(); checkHead(fmt!.ext, new Uint8Array(buf, 0, Math.min(1024, buf.byteLength))); }
  const part = await c.env.FILES.resumeMultipartUpload(u.storage_key, u.r2_upload_id).uploadPart(n, buf);
  await c.env.DB.batch([
    c.env.DB.prepare('INSERT INTO upload_parts(upload_id,n,etag) VALUES(?,?,?) ON CONFLICT(upload_id,n) DO UPDATE SET etag=excluded.etag').bind(id, n, part.etag),
    c.env.DB.prepare('UPDATE uploads SET updated_at=? WHERE id=?').bind(now(), id),
  ]);
  return json({ n, ok: true });
}
export async function completeUpload(c: Ctx, id: string) {
  const u = await session(c, id);
  if (u.status !== 'open') throw new HttpError(409, 'upload_closed');
  const total = partsTotal(u.size);
  const have = (await c.env.DB.prepare('SELECT n,etag FROM upload_parts WHERE upload_id=? ORDER BY n').bind(id).all()).results as any[];
  if (have.length !== total || have.some((p, i) => p.n !== i + 1)) throw new HttpError(409, 'parts_missing', { have: have.map((p) => p.n), total });
  const obj = await c.env.FILES.resumeMultipartUpload(u.storage_key, u.r2_upload_id).complete(have.map((p) => ({ partNumber: p.n, etag: p.etag })));
  if (obj.size !== u.size) { await c.env.FILES.delete(u.storage_key); throw new HttpError(409, 'size_mismatch'); }
  const version = await nextVersion(c.env, u.product_id, u.variant_id, u.format);
  try {
    await c.env.DB.batch([...publishFile(c.env, u.product_id, u.variant_id, u.format, u.filename, u.storage_key, u.size, 'etag:' + obj.etag, version),
      c.env.DB.prepare("UPDATE uploads SET status='done',updated_at=? WHERE id=?").bind(now(), id)]);
  } catch (e) { await c.env.FILES.delete(u.storage_key); dbErr(e); }
  const row = await c.env.DB.prepare('SELECT id,product_id,variant_id,format,filename,size,checksum,version,active,created_at FROM product_files WHERE storage_key=?').bind(u.storage_key).first();
  return json(row, 201);
}
export async function abortUpload(c: Ctx, id: string) {
  const u = await session(c, id);
  if (u.status === 'open') { try { await c.env.FILES.resumeMultipartUpload(u.storage_key, u.r2_upload_id).abort(); } catch { /* уже закрыта */ } }
  await c.env.DB.batch([c.env.DB.prepare("UPDATE uploads SET status='aborted',updated_at=? WHERE id=? AND status='open'").bind(now(), id), c.env.DB.prepare('DELETE FROM upload_parts WHERE upload_id=?').bind(id)]);
  return json({ aborted: true });
}

export async function deleteImage(c: Ctx, id: number) {
  const r = await c.env.DB.prepare('SELECT storage_key FROM product_images WHERE id=?').bind(id).first();
  if (!r) throw new HttpError(404, 'not_found');
  await c.env.DB.prepare('DELETE FROM product_images WHERE id=?').bind(id).run();
  await c.env.FILES.delete(r.storage_key);
  return json({ deleted: true });
}
export async function setMainImage(c: Ctx, id: number) {
  const r = await c.env.DB.prepare('SELECT product_id FROM product_images WHERE id=?').bind(id).first();
  if (!r) throw new HttpError(404, 'not_found');
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE product_images SET kind='extra' WHERE product_id=? AND kind='main'").bind(r.product_id),
    c.env.DB.prepare("UPDATE product_images SET kind='main' WHERE id=?").bind(id),
  ]);
  return json({ ok: true });
}
export async function reorderImages(c: Ctx, pid: number) {
  const b: any = await c.req.json().catch(() => null);
  if (!Array.isArray(b?.ids) || b.ids.length > 100) throw new HttpError(400, 'validation', { field: 'ids' });
  await c.env.DB.batch(b.ids.map((x: any, i: number) => c.env.DB.prepare('UPDATE product_images SET sort=? WHERE id=? AND product_id=?').bind(i + 1, int(x, 0), pid)));
  return json({ ok: true });
}
// Файл не удаляется физически: старые версии остаются, покупатели не теряют доступ к товару.
export async function deactivateFile(c: Ctx, id: number) {
  const r: any = await c.env.DB.prepare('UPDATE product_files SET active=0 WHERE id=?').bind(id).run();
  if (r.meta?.changes === 0) throw new HttpError(404, 'not_found');
  return json({ ok: true });
}

// Публичные изображения. Приватные файлы (files/…) отсюда отдать невозможно.
export async function serveImage(c: Ctx) {
  const key = decodeURIComponent(c.params[0]);
  if (!/^(images|branding)\/[A-Za-z0-9._\/-]+$/.test(key) || key.includes('..')) throw new HttpError(404, 'not_found');
  const o = await c.env.FILES.get(key);
  if (!o) throw new HttpError(404, 'not_found');
  return new Response(o.body, { headers: { 'content-type': o.httpMetadata?.contentType || 'application/octet-stream', 'cache-control': 'public, max-age=31536000, immutable', 'x-content-type-options': 'nosniff' } });
}
