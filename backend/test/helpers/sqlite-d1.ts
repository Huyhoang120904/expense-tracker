import fs from "node:fs";
import path from "node:path";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.resolve(__dirname, "../../migrations");

function cloneRow<T>(row: unknown): T {
  return { ...(row as Record<string, unknown>) } as T;
}

function emptyMeta(): D1Meta {
  return {
    duration: 0,
    size_after: 0,
    rows_read: 0,
    rows_written: 0,
    last_row_id: 0,
    changed_db: false,
    changes: 0,
  };
}

class SqlitePreparedStatement {
  private values: SQLInputValue[] = [];

  constructor(
    private readonly db: DatabaseSync,
    private readonly query: string,
    values: SQLInputValue[] = [],
  ) {
    this.values = values;
  }

  bind(...values: unknown[]): D1PreparedStatement {
    return new SqlitePreparedStatement(
      this.db,
      this.query,
      values as SQLInputValue[],
    ) as unknown as D1PreparedStatement;
  }

  async first<T = Record<string, unknown>>(colName?: string): Promise<T | null> {
    const stmt = this.db.prepare(this.query);
    const row = stmt.get(...this.values) as Record<string, unknown> | undefined;
    if (!row) {
      return null;
    }
    if (colName !== undefined) {
      return (row[colName] as T) ?? null;
    }
    return cloneRow<T>(row);
  }

  async run<T = Record<string, unknown>>(): Promise<D1Result<T>> {
    const stmt = this.db.prepare(this.query);
    const info = stmt.run(...this.values);
    const changes = Number(info.changes ?? 0);
    return {
      results: [] as T[],
      success: true,
      meta: {
        ...emptyMeta(),
        changes,
        rows_written: changes,
        changed_db: changes > 0,
        last_row_id: Number(info.lastInsertRowid ?? 0),
      },
    };
  }

  async all<T = Record<string, unknown>>(): Promise<D1Result<T>> {
    const stmt = this.db.prepare(this.query);
    const rows = stmt.all(...this.values);
    return {
      results: rows.map((row) => cloneRow<T>(row)),
      success: true,
      meta: {
        ...emptyMeta(),
        rows_read: rows.length,
      },
    };
  }

  async raw<T = unknown[]>(): Promise<T[]> {
    const stmt = this.db.prepare(this.query);
    const rows = stmt.all(...this.values) as Record<string, unknown>[];
    return rows.map((row) => Object.values(row)) as T[];
  }

  executeInTransaction<T = unknown>(): D1Result<T> {
    const trimmed = this.query.trimStart().toUpperCase();
    const stmt = this.db.prepare(this.query);
    if (trimmed.startsWith("SELECT")) {
      const rows = stmt.all(...this.values);
      return {
        results: rows.map((row) => cloneRow<T>(row)),
        success: true,
        meta: { ...emptyMeta(), rows_read: rows.length },
      };
    }
    const info = stmt.run(...this.values);
    const changes = Number(info.changes ?? 0);
    return {
      results: [] as T[],
      success: true,
      meta: {
        ...emptyMeta(),
        changes,
        rows_written: changes,
        changed_db: changes > 0,
        last_row_id: Number(info.lastInsertRowid ?? 0),
      },
    };
  }
}

export class SqliteD1Database {
  readonly sqlite: DatabaseSync;

  constructor() {
    this.sqlite = new DatabaseSync(":memory:");
    this.sqlite.exec("PRAGMA foreign_keys = ON;");
  }

  applyMigrations(): void {
    const files = fs
      .readdirSync(migrationsDir)
      .filter((name) => name.endsWith(".sql"))
      .sort();

    for (const file of files) {
      const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");
      this.sqlite.exec(sql);
    }
  }

  prepare(query: string): D1PreparedStatement {
    return new SqlitePreparedStatement(
      this.sqlite,
      query,
    ) as unknown as D1PreparedStatement;
  }

  async batch<T = unknown>(
    statements: D1PreparedStatement[],
  ): Promise<D1Result<T>[]> {
    this.sqlite.exec("BEGIN");
    try {
      const results: D1Result<T>[] = [];
      for (const statement of statements) {
        const impl = statement as unknown as SqlitePreparedStatement;
        results.push(impl.executeInTransaction<T>());
      }
      this.sqlite.exec("COMMIT");
      return results;
    } catch (err) {
      this.sqlite.exec("ROLLBACK");
      throw err;
    }
  }

  async exec(query: string): Promise<D1ExecResult> {
    this.sqlite.exec(query);
    return { count: 1, duration: 0 };
  }

  withSession(): D1DatabaseSession {
    throw new Error("withSession is not implemented in SqliteD1Database.");
  }

  async dump(): Promise<ArrayBuffer> {
    throw new Error("dump is not implemented in SqliteD1Database.");
  }

  asD1(): D1Database {
    return this as unknown as D1Database;
  }
}
