import Database from 'better-sqlite3';

/**
 * The project was written against the Cloudflare D1 prepared-statement API,
 * which uses numbered placeholders (?1, ?2, ...). better-sqlite3 only binds
 * anonymous placeholders positionally, so numbered placeholders are rewritten
 * to `?` and the bound values are re-ordered to match the textual order.
 * Repeated placeholders (?5 used twice) are duplicated as needed.
 */
function rewriteStatement(sql, params) {
  let ordered = null;
  const text = String(sql).replace(/\?(\d+)/g, (_match, index) => {
    if (!ordered) ordered = [];
    ordered.push(params[Number(index) - 1]);
    return '?';
  });
  return { text, params: ordered === null ? params : ordered };
}

class D1Statement {
  constructor(db, sql, params = []) {
    this.db = db;
    this.sql = sql;
    this.params = params;
  }

  bind(...params) {
    return new D1Statement(this.db, this.sql, params);
  }

  _compile() {
    const { text, params } = rewriteStatement(this.sql, this.params);
    return { statement: this.db.prepare(text), params };
  }

  async first() {
    const { statement, params } = this._compile();
    const row = statement.get(...params);
    return row === undefined ? null : row;
  }

  async all() {
    const { statement, params } = this._compile();
    return { results: statement.all(...params), success: true, meta: {} };
  }

  async run() {
    const { statement, params } = this._compile();
    const info = statement.run(...params);
    return {
      success: true,
      meta: { changes: info.changes, last_row_id: Number(info.lastInsertRowid) },
    };
  }

  async raw() {
    const { statement, params } = this._compile();
    return statement.raw().all(...params);
  }
}

/** Minimal D1Database-compatible adapter backed by a local SQLite file. */
export function createD1Database(filePath) {
  const db = new Database(filePath);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');

  const prepare = (sql) => new D1Statement(db, String(sql), []);

  const batch = async (statements) => {
    const runBatch = db.transaction((items) => items.map((item) => {
      const { statement, params } = item._compile();
      const info = statement.run(...params);
      return {
        success: true,
        meta: { changes: info.changes, last_row_id: Number(info.lastInsertRowid) },
      };
    }));
    return runBatch(Array.isArray(statements) ? statements : []);
  };

  return {
    prepare,
    batch,
    exec: (sql) => db.exec(sql),
    close: () => db.close(),
    _raw: db,
  };
}
