// Adaptador mínimo de D1 sobre node:sqlite, só para os testes (SQL real, em memória).
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

class Stmt {
  args: unknown[] = [];
  constructor(
    private db: DatabaseSync,
    readonly sql: string,
  ) {}
  bind(...args: unknown[]) {
    const s = new Stmt(this.db, this.sql);
    s.args = args;
    return s;
  }
  async all<T>() {
    return {
      results: this.db.prepare(this.sql).all(...(this.args as never[])) as T[],
      success: true,
      meta: {},
    };
  }
  async first<T>() {
    return (this.db.prepare(this.sql).get(...(this.args as never[])) as T) ?? null;
  }
  async run() {
    const r = this.db.prepare(this.sql).run(...(this.args as never[]));
    return { success: true, meta: { changes: Number(r.changes) }, results: [] };
  }
}

export function makeD1() {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(new URL('../migrations/0001_init.sql', import.meta.url), 'utf8'));
  const d1 = {
    prepare: (sql: string) => new Stmt(db, sql),
    async batch(stmts: Stmt[]) {
      db.exec('BEGIN');
      try {
        const out = [];
        for (const s of stmts) out.push(await s.run());
        db.exec('COMMIT');
        return out;
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
    },
    raw: db,
  };
  return d1 as unknown as D1Database & { raw: DatabaseSync };
}
