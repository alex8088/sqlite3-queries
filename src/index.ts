/* eslint-disable @typescript-eslint/no-explicit-any */
import { basename } from 'node:path'
import sqlite3, { Database, Statement, verbose } from 'sqlite3'

interface SqliteDatebaseOptions {
  /**
   * Sets the execution mode to verbose to produce long stack traces.
   *
   * Note that you shouldn't enable the verbose mode in a production setting as the
   * performance penalty for collecting stack traces is quite high.
   *
   * @default false
   */
  verbose?: boolean
  /**
   * Enable trace logging for debugging. Set to `run` to emit whenever a query is run,
   * or set to `finish` to emit whenever a query is finished.
   *
   * Note that finish mode will include the time it took to run (in milliseconds).
   */
  trace?: 'run' | 'finish'
  /**
   * Custom trace or error log output. Trace type logs are only output
   * when the `trace` option is enabled.
   * @param info Log information. See {@link SqliteLogInfo}.
   */
  log?: (info: SqliteLogInfo) => void
}

type SqliteFunction =
  | 'open'
  | 'close'
  | 'loadExtension'
  | 'exec'
  | 'run'
  | 'get'
  | 'all'
  | 'prepare'
  | 'transaction'

type SqliteCallback<T> = (err: Error | null, result?: T) => void

type SqliteLogInfo = {
  level: 'trace' | 'error'
  channel?: SqliteFunction
  sql?: string
  time?: number
  error?: Error
}

type RunResult = {
  lastId: number
  changes: number
}

interface SqlQueryParam {
  [key: `$${string}` | `@${string}` | `:${string}`]: string | number
}

type ErrorCode = 'NOT_OPEN'

export class SqliteError extends Error {
  code: ErrorCode

  static NOT_OPEN = new SqliteError('NOT_OPEN', 'Database is not open.')

  constructor(code: ErrorCode, message: string) {
    super(message)
    this.name = 'SqliteError'
    this.code = code
  }

  static from(code: ErrorCode, error: Error): SqliteError {
    const _error = error as SqliteError
    _error.code = code
    return _error
  }
}

/**
 * Sqlite datebase object
 */
export class Dbo {
  static OPEN_READONLY = sqlite3.OPEN_READONLY
  static OPEN_READWRITE = sqlite3.OPEN_READWRITE
  static OPEN_CREATE = sqlite3.OPEN_CREATE
  static OPEN_FULLMUTEX = sqlite3.OPEN_FULLMUTEX
  static OPEN_URI = sqlite3.OPEN_URI
  static OPEN_SHAREDCACHE = sqlite3.OPEN_SHAREDCACHE
  static OPEN_PRIVATECACHE = sqlite3.OPEN_PRIVATECACHE

  static readonly IN_MEMORY_PATH = ':memory:'
  static readonly SQLITE_MAX_PARAMETERS = 256

  /**
   * Sqlite3 database.
   */
  db?: Database

  /**
   * Database name
   */
  readonly name: string

  /**
   * Database is in-memory.
   */
  readonly isInMemory: boolean

  /**
   * @param fileName Valid values are filenames, ":memory:" for an anonymous in-memory
   * database and an empty string for an anonymous disk-based database. Anonymous databases
   * are not persisted and when closing the database handle, their contents are lost.
   * Default: `:memory:`.
   * @param options Sqlite database options. See {@link SqliteDatebaseOptions}.
   */
  constructor(
    public readonly fileName: string | ':memory:' = ':memory:',
    readonly options: SqliteDatebaseOptions = {}
  ) {
    this.name = basename(this.fileName)
    this.isInMemory = this.fileName === Dbo.IN_MEMORY_PATH
  }

  private promisify<T>(
    name: SqliteFunction,
    fn: (cb: SqliteCallback<T>) => void,
    sql?: string
  ): Promise<T> {
    return new Promise((resolve, reject) =>
      fn((error, result) => {
        if (error) {
          this.log({ channel: name, error, sql })

          reject(error)
        }
        resolve(result as T)
      })
    )
  }

  private log(info: Omit<SqliteLogInfo, 'level'>): void {
    this.options.log?.({ level: info.error ? 'error' : 'trace', ...info })
  }

  /**
   * Open the database.
   * @param mode One or more of `Dbo.OPEN_READONLY`, `Dbo.OPEN_READWRITE`, `Dbo.OPEN_CREATE`,
   * `Dbo.OPEN_FULLMUTEX`, `Dbo.OPEN_URI`, `Dbo.OPEN_SHAREDCACHE`, `Dbo.OPEN_PRIVATECACHE`.
   * Default: `OPEN_READWRITE | OPEN_CREATE | OPEN_FULLMUTEX`.
   */
  async open(
    mode: number = Dbo.OPEN_READWRITE | Dbo.OPEN_CREATE | Dbo.OPEN_FULLMUTEX
  ): Promise<void> {
    return this.promisify('open', (cb) => {
      this.db = this.options.verbose
        ? new (verbose().Database)(this.fileName, mode, cb)
        : new Database(this.fileName, mode, cb)
      if (this.options.trace === 'run') {
        this.db.on('trace', (sql) => this.log({ sql }))
      }
      if (this.options.trace === 'finish') {
        this.db.on('profile', (sql, time) => this.log({ sql, time }))
      }
    })
  }

  /**
   * Close the database.
   */
  async close(): Promise<void> {
    return this.promisify('close', (cb) =>
      this.db
        ? this.db.close((err) => {
            if (!err) {
              this.db = undefined
            }
            cb(err)
          })
        : cb(SqliteError.NOT_OPEN)
    )
  }

  /**
   * Loads a compiled SQLite extension into the database connection object.
   * @param fileName Filename of the extension to load
   */
  async loadExtension(fileName: string): Promise<void> {
    return this.promisify('loadExtension', (cb) =>
      this.db ? this.db.loadExtension(fileName, cb) : cb(SqliteError.NOT_OPEN)
    )
  }

  /**
   * Rebuild the database file, repacking it into a minimal amount of disk space.
   */
  async vacuum(): Promise<void> {
    return this.exec('VACUUM')
  }

  /**
   * Executes the PRAGMA command to modify the operation of the SQLite library or
   * to query the library for internal (non-table) data.
   *
   * For example:
   *
   * ```js
   * // query cache size
   * dbo.pragma('cache_size')
   * // change cache size
   * dbo.pragma('cache_size', 1000 * 1024)
   * ```
   */
  async pragma<T extends Record<string, any>>(
    flag: string,
    value?: string | number
  ): Promise<T | undefined> {
    return this.get<T>(
      `PRAGMA ${value !== undefined ? [flag, value].join(' = ') : flag}`
    )
  }

  /**
   * Escape the `/`, `%`, and  `_` characters of query parameters.
   */
  escape(str: string): string {
    return str.replace(/\//g, '//').replace(/%/g, '/%').replace(/_/g, '/_')
  }

  /**
   * Convert object parameters to sql query parameters. All object keys
   * will be prefixed with `$`.
   */
  toSqlQueryParam(param: Record<string, string | number>): SqlQueryParam {
    const _param = {}
    Object.keys(param).forEach((k) => {
      _param[`$${k}`] = param[k]
    })
    return _param
  }

  /**
   * Runs all SQL queries in the supplied string.
   */
  exec(sql: string): Promise<void> {
    return this.promisify(
      'exec',
      (cb) => {
        this.db ? this.db.exec(sql, cb) : cb(SqliteError.NOT_OPEN)
      },
      sql
    )
  }

  /**
   * Runs the SQL query with the specified parameters.
   */
  async run(
    sql: string,
    params: SqlQueryParam | (string | number)[] = []
  ): Promise<RunResult> {
    return this.promisify(
      'run',
      (cb) => {
        this.db
          ? this.db.run(sql, params, function (err) {
              cb(err, { lastId: this.lastID, changes: this.changes })
            })
          : cb(SqliteError.NOT_OPEN)
      },
      sql
    )
  }

  /**
   * Runs the SQL query with the specified parameters and returns a
   * subsequent result row. If data is not found, `undefined`is returned.
   */
  async get<T extends Record<string, any>>(
    sql: string,
    params: SqlQueryParam | (string | number)[] = []
  ): Promise<T | undefined> {
    return this.promisify(
      'get',
      (cb) => {
        this.db ? this.db.get(sql, params, cb) : cb(SqliteError.NOT_OPEN)
      },
      sql
    )
  }

  /**
   * Runs the SQL query with the specified parameters and returns
   * all result rows afterwards.
   */
  async all<T extends Record<string, any>>(
    sql: string,
    params: SqlQueryParam | (string | number)[] = []
  ): Promise<T[]> {
    return this.promisify(
      'all',
      (cb) => {
        this.db ? this.db.all(sql, params, cb) : cb(SqliteError.NOT_OPEN)
      },
      sql
    )
  }

  /**
   * Prepares the SQL statement and run the callback with the statement object.
   */
  prepare(sql: string, runCallback: (stmt: Statement) => void): void {
    if (this.db) {
      const stmt = this.db.prepare(sql)

      runCallback(stmt)

      stmt.finalize((error) => {
        if (error) {
          this.log({ channel: 'prepare', error, sql })
        }
      })
    }
  }

  /**
   * Start a transaction explicitly. A transaction is the propagation of one
   * or more changes to the database. For example, if you are creating,
   * updating, or deleting a record from the table, then you are performing
   * transaction on the table. It is important to control transactions to
   * ensure data integrity and to handle database errors.
   */
  async transaction(transactions: () => void): Promise<void> {
    return this.promisify('transaction', (cb) => {
      this.db
        ? this.db.serialize(() => {
            this.db!.run('BEGIN')

            transactions()

            this.db!.run('COMMIT', cb)
          })
        : cb(SqliteError.NOT_OPEN)
    })
  }
}

/**
 * Database migration describes.
 */
export type DbMigration = {
  /**
   * Migration version. The initial version must be greater than `0`. A new
   * version is defined on each migration and is incremented on the previous version.
   */
  version: number
  /**
   * Migration SQLs. The sql will run sequentially, and DDL sql should
   * be written before DML sql.
   */
  sqls: string[]
}

/**
 * Database context base class. It has implemented automatic migration.
 */
export class DbContext {
  /**
   * Database context.
   * @param dbo Database object.
   * @param migrations Database migrations.
   */
  constructor(
    public readonly dbo: Dbo,
    public readonly migrations: DbMigration[]
  ) {}

  protected async migrate(): Promise<void> {
    const version = await this.getVersion()
    if (version >= 0) {
      const migrations = this.migrations.filter((mgn) => mgn.version > version)
      for (const mgn of migrations) {
        const sql = mgn.sqls.join(';')
        await this.dbo.exec(sql + `;PRAGMA user_version = ${mgn.version};`)
      }
    }
  }

  /**
   * Get the database user_version.
   */
  async getVersion(): Promise<number> {
    const uv = await this.dbo.pragma<{ user_version: number }>('user_version')
    return uv ? uv.user_version : -1
  }

  /**
   * Open the database and apply migrations automatically.
   */
  async open(): Promise<void> {
    return this.dbo.open().then(() => {
      return this.migrate()
    })
  }

  /**
   * Close the database.
   */
  async close(): Promise<void> {
    return this.dbo.close()
  }
}
