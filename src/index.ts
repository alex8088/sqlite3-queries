/* eslint-disable @typescript-eslint/no-explicit-any */
import { basename } from 'node:path'
import sqlite3, { Database, Statement, verbose } from 'sqlite3'

type SqliteErrorCallback = (err: Error | null) => void

async function toPromise(
  func: (cb: SqliteErrorCallback) => void
): Promise<void> {
  return new Promise((resolve, reject) =>
    func((err) => (err ? reject(err) : resolve()))
  )
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

  /**
   * Sqlite3 database.
   */
  db?: Database

  /**
   * Database name
   */
  readonly name: string

  static readonly IN_MEMORY_PATH = ':memory:'

  /**
   * @param fileName Valid values are filenames, ":memory:" for an anonymous in-memory
   * database and an empty string for an anonymous disk-based database. Anonymous databases
   * are not persisted and when closing the database handle, their contents are lost.
   * Default: `:memory:`
   * @param verbose Sets the execution mode to verbose to produce long stack traces.
   * Note that you shouldn't enable the verbose mode in a production setting as the
   * performance penalty for collecting stack traces is quite high.
   * Default: false
   */
  constructor(
    public readonly fileName: string | ':memory:' = ':memory:',
    public verbose = false
  ) {
    this.name = basename(this.fileName)
  }

  /**
   * Open the database
   * @param mode One or more of `Dbo.OPEN_READONLY`, `Dbo.OPEN_READWRITE`, `Dbo.OPEN_CREATE`,
   *   `Dbo.OPEN_FULLMUTEX`, `Dbo.OPEN_URI`, `Dbo.OPEN_SHAREDCACHE`, `Dbo.OPEN_PRIVATECACHE`.
   *   Default: `OPEN_READWRITE | OPEN_CREATE | OPEN_FULLMUTEX`.
   */
  async open(
    mode: number = Dbo.OPEN_READWRITE | Dbo.OPEN_CREATE | Dbo.OPEN_FULLMUTEX
  ): Promise<void> {
    return toPromise((cb) => {
      this.db = this.verbose
        ? new (verbose().Database)(this.fileName, mode, cb)
        : new Database(this.fileName, mode, cb)
    })
  }

  /**
   * Close the database
   */
  async close(): Promise<void> {
    return toPromise((cb) =>
      this.db ? this.db.close(cb) : cb(SqliteError.NOT_OPEN)
    )
  }

  /**
   * Loads a compiled SQLite extension into the database connection object.
   * @param fileName Filename of the extension to load
   */
  async loadExtension(fileName: string): Promise<void> {
    return toPromise((cb) =>
      this.db ? this.db.loadExtension(fileName, cb) : cb(SqliteError.NOT_OPEN)
    )
  }

  /**
   * Database is in-memory.
   */
  isInMemory(): boolean {
    return this.fileName === Dbo.IN_MEMORY_PATH
  }

  /**
   * Rebuild the database file, repacking it into a minimal amount of disk space.
   */
  async vacuum(): Promise<void> {
    return this.exec('VACUUM')
  }

  /**
   * Runs a self-check on the database structure. If no errors are found, the text
   * value `ok` will be returned.
   */
  async checkIntegrity(): Promise<string> {
    return (
      await this.get<{ integrity_check: string }>('PRAGMA integrity_check')
    ).integrity_check
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
    return toPromise((cb) =>
      this.db ? this.db.exec(sql, cb) : cb(SqliteError.NOT_OPEN)
    )
  }

  /**
   * Runs the SQL query with the specified parameters.
   */
  async run(
    sql: string,
    params: SqlQueryParam | (string | number)[] = []
  ): Promise<RunResult> {
    return new Promise((resolve, reject) => {
      this.db
        ? this.db.run(sql, params, function (err) {
            if (err) {
              reject(err)
            } else {
              resolve({ lastId: this.lastID, changes: this.changes })
            }
          })
        : reject(SqliteError.NOT_OPEN)
    })
  }

  /**
   * Runs the SQL query with the specified parameters and returns
   * a subsequent result row.
   */
  async get<T extends Record<string, any>>(
    sql: string,
    params: SqlQueryParam | (string | number)[] = []
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      this.db
        ? this.db.get<T>(sql, params, (err, result) => {
            if (err) {
              reject(err)
            } else {
              resolve(result)
            }
          })
        : reject(SqliteError.NOT_OPEN)
    })
  }

  /**
   * Runs the SQL query with the specified parameters and returns
   * all result rows afterwards.
   */
  async all<T extends Record<string, any>>(
    sql: string,
    params: SqlQueryParam | (string | number)[] = []
  ): Promise<T[]> {
    return new Promise((resolve, reject) => {
      this.db
        ? this.db.all<T>(sql, params, (err, result) => {
            if (err) {
              reject(err)
            } else {
              resolve(result)
            }
          })
        : reject(SqliteError.NOT_OPEN)
    })
  }

  /**
   * Prepares the SQL statement and run the callback with the statement object.
   */
  prepare(sql: string, runCallback: (stmt: Statement) => void): void {
    if (this.db) {
      const stmt = this.db.prepare(sql)

      runCallback(stmt)

      stmt.finalize()
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
    return new Promise((resolve, reject) => {
      if (this.db) {
        this.db.serialize(() => {
          this.db!.run('BEGIN')

          transactions()

          this.db!.run('COMMIT', (error) => {
            if (error) {
              return reject(error)
            }

            return resolve()
          })
        })
      } else {
        reject(SqliteError.NOT_OPEN)
      }
    })
  }
}
