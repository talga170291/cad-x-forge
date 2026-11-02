// Имитация Cloudflare D1 (поверх настоящей SQLite) и R2 для автотестов.
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';

class Stmt {
  db: any; sql: string; p: any[];
  constructor(db: any, sql: string, p: any[] = []) { this.db = db; this.sql = sql; this.p = p; }
  bind(...p: any[]) {
    for (const x of p) if (x === undefined || typeof x === 'boolean') throw new Error('bad bind value: ' + String(x));
    return new Stmt(this.db, this.sql, p);
  }
  returnsRows() { return /^\s*(SELECT|WITH)/i.test(this.sql) || /\bRETURNING\b/i.test(this.sql); }
  exec() {
    const s = this.db.prepare(this.sql);
    if (this.returnsRows()) return { results: s.all(...this.p), success: true, meta: { changes: 0 } };
    const r = s.run(...this.p);
    return { results: [], success: true, meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } };
  }
  async first() { const r = this.exec().results as any[]; return r[0] ?? null; }
  async all() { return this.exec(); }
  async run() { return this.exec(); }
}
export function makeDB(migDir: string) {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys=ON');
  for (const f of readdirSync(migDir).filter((x) => x.endsWith('.sql')).sort()) db.exec(readFileSync(migDir + '/' + f, 'utf8'));
  return {
    raw: db,
    prepare: (sql: string) => new Stmt(db, sql),
    async batch(stmts: Stmt[]) {
      db.exec('BEGIN');
      try { const out = stmts.map((s) => s.exec()); db.exec('COMMIT'); return out; } catch (e) { db.exec('ROLLBACK'); throw e; }
    },
  };
}
export function makeR2() {
  const m = new Map<string, { buf: ArrayBuffer; meta: any }>();
  return {
    m,
    async put(k: string, v: any, o: any = {}) { m.set(k, { buf: typeof v === 'string' ? new TextEncoder().encode(v).buffer as ArrayBuffer : v, meta: o }); },
    async get(k: string, o: any = {}) {
      const e = m.get(k); if (!e) return null;
      const buf = o.range ? e.buf.slice(o.range.offset, o.range.offset + o.range.length) : e.buf;
      return { key: k, size: e.buf.byteLength, body: new Response(buf).body!, httpMetadata: e.meta.httpMetadata };
    },
    mp: new Map<string, { key: string; parts: Map<number, ArrayBuffer> }>(),
    async createMultipartUpload(key: string, o: any = {}) { const id = 'mp-' + Math.random().toString(36).slice(2); (this as any).mp.set(id, { key, parts: new Map(), o }); return (this as any).resumeMultipartUpload(key, id); },
    resumeMultipartUpload(key: string, uploadId: string) {
      const self: any = this; const st = self.mp.get(uploadId);
      return {
        key, uploadId,
        async uploadPart(n: number, v: ArrayBuffer) { if (!st) throw new Error('no such upload'); st.parts.set(n, v.slice(0)); return { partNumber: n, etag: 'e' + n + '-' + v.byteLength }; },
        async complete(parts: any[]) {
          if (!st) throw new Error('no such upload');
          const bufs = parts.map((p) => { const b = st.parts.get(p.partNumber); if (!b || p.etag !== 'e' + p.partNumber + '-' + b.byteLength) throw new Error('bad part'); return new Uint8Array(b); });
          const out = new Uint8Array(bufs.reduce((a, b) => a + b.length, 0)); let off = 0; for (const b of bufs) { out.set(b, off); off += b.length; }
          m.set(key, { buf: out.buffer as ArrayBuffer, meta: st.o || {} }); self.mp.delete(uploadId);
          return { key, size: out.length, etag: 'final-' + out.length };
        },
        async abort() { self.mp.delete(uploadId); },
      };
    },
    async delete(k: any) { for (const x of Array.isArray(k) ? k : [k]) m.delete(x); },
    async list() { return { objects: [...m.keys()].map((key) => ({ key })) }; },
  };
}
