# sqlite3-queries

> A type-safe and promise-based query client for node sqlite3.

## Install

```sh
npm i sqlite3 sqlite3-queries
```

## Usage

### Opening Database

- Open an anonymous in-memory database

```ts
import { Dbo } from 'sqlite3-queries'

const dbo = new Dbo()

await dbo.open()
```

- Open a physical disk database

```ts
import path from 'node:path'
import { Dbo } from 'sqlite3-queries'

const dbo = new Dbo(path.join(__dirname, '/tmp/database.db'))

await dbo.open()
```

- Open a verbose database for debugging

```ts
import { Dbo } from 'sqlite3-queries'
const dbo = new Dbo(':memory:', { verbose: true })

await dbo.open()
```

### Closing Database

```ts
await dbo.close()
```

### Tracing and Logging

```js
import { Dbo } from 'sqlite3-queries'

const dbo = new Dbo(Dbo.IN_MEMORY_PATH, {
  trace: 'run',
  log: (info): void => {
    console.log(`[${info.level}] Database#${info.channel} ${info.error} (${info.sql})`)
  }
})

await dbo.open()
```

### Automatic Migration

```js
import path from 'node:path'
import { Dbo, DbContext, DbMigration } from 'sqlite3-queries'

class UserContext extends DbContext {
  constructor(fileName: string) {
    const dbo = new Dbo(fileName)
    super(dbo, UserContext.migrations)
  }

  static migrations: DbMigration[] = [
    {
      version: 1,
      sqls: [
        'CREATE TABLE IF NOT EXISTS users (id STRING PRIMARY KEY, name STRING)'
      ]
    },
    {
      version: 2,
      sqls: ['ALTER TABLE users ADD COLUMN gender INTEGER DEFAULT (1)']
    }
  ]
}

const db = new UserContext(path.join(__dirname, 'test.db'))

await db.open()
```

<details>
<summary><b>Type Signature</b></summary>

```ts
/**
 * Database migration describes.
 */
type DbMigration = {
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
declare class DbContext {
  readonly dbo: Dbo
  readonly migrations: DbMigration[]
  /**
   * Database context.
   * @param dbo Database object.
   * @param migrations Database migrations.
   */
  constructor(dbo: Dbo, migrations: DbMigration[])
  protected migrate(): Promise<void>
  /**
   * Get the database user_version.
   */
  getVersion(): Promise<number>
  /**
   * Open the database and apply migrations automatically.
   */
  open(): Promise<void>
  /**
   * Close the database.
   */
  close(): Promise<void>
}
```

</details>

## APIs

Promise-based APIs for sqlite3.

### `Open`

**Type:** `(mode?: number) => Promise<void>`

Open the database. The `mode` is one or more of `Dbo.OPEN_READONLY`, `Dbo.OPEN_READWRITE`, `Dbo.OPEN_CREATE`, `Dbo.OPEN_FULLMUTEX`, `Dbo.OPEN_URI`, `Dbo.OPEN_SHAREDCACHE`, `Dbo.OPEN_PRIVATECACHE`. Default: `OPEN_READWRITE | OPEN_CREATE | OPEN_FULLMUTEX`.

### `Close`

**Type:** `() => Promise<void>`

Close the database.

### `Run`

**Type:** `(sql: string, params?: SqlQueryParam | (string | number)[]) => Promise<RunResult>`

Runs the SQL query with the specified parameters.

- With array parameters:

```ts
const sql = `INSERT INTO user (id, name) VALUES (?, ?)`
const result = await dbo.run(sql, [0, 'Alexandra Roman'])
```

- With named parameters:

```ts
const sql = `UPDATE user SET name = $name WHERE id = $id`
const result = await dbo.run(sql, { $id: 0, $name: 'Evie Le' })
```

### `Get`

**Type:** `<T extends Record<string, any>>(sql: string, params?: SqlQueryParam | (string | number)[]) => Promise<T | undefined>`

Runs the SQL query with the specified parameters and returns a subsequent result row. If data is not found, `undefined` is returned.

```ts
const sql = `SELECT * FROM user WHERE id=?`
const result = await dbo.get<{ id: number; name: string }>(sql, [0])

// Output: {id: 0, name: 'Evie Le'}
```

### `All`

**Type:** `<T extends Record<string, any>>(sql: string, params?: SqlQueryParam | (string | number)[]) => Promise<T[]>`

Runs the SQL query with the specified parameters and returns all result rows afterwards.

```ts
const sql = `SELECT * FROM user`
const result = await dbo.all<{ id: number; name: string }>(sql)

// Output: [{id: 0, name: 'Evie Le'}]
```

### `Exec`

**Type:** `(sql: string) => Promise<void>`

Runs all SQL queries in the supplied string.

### `Prepare`

**Type:** `(sql: string, runCallback: (stmt: Statement) => void) => void`

Prepares the SQL statement and run the callback with the statement object.

### `Transaction`

**Type:** `(transactions: () => void) => Promise<void>`

Start a transaction explicitly. A transaction is the propagation of one or more changes to the database. For example, if you are creating, updating, or deleting a record from the table, then you are performing transaction on the table. It is important to control transactions to ensure data integrity and to handle database errors.

```ts
await dbo.transaction(() => {
  dbo.prepare('INSERT INTO user (id, name) VALUES ($id, $name)', (stmt) => {
    ;[
      { $id: 2, $name: 'Jordan' },
      { $id: 3, $name: `Ameer` }
    ].forEach((p) => stmt.run(p))
  })
})
```

### `LoadExtension`

**Type:** `(fileName: string) => Promise<void>`

Loads a compiled SQLite extension into the database connection object.

### `Vacuum`

**Type:** `() => Promise<void>`

Rebuild the database file, repacking it into a minimal amount of disk space.

### `Pragma`

**Type:** `<T extends Record<string, any>>(flag: string, value?: string | number): Promise<T | undefined>`

Executes the PRAGMA command to modify the operation of the SQLite library or to query the library for internal (non-table) data.

```js
// query cache size
dbo.pragma('cache_size')

// change cache size
dbo.pragma('cache_size', 1000 * 1024)
```

### `Escape`

**Type:** `(str: string) => string`

Escape the `/`, `%`, and `_` characters of query parameters.

### `toSqlQueryParam`

**Type:** `(param: Record<string, string | number>) => SqlQueryParam`

Convert object parameters to sql query parameters. All object keys will be prefixed with `$`.

## Using Sqlite3 APIs

You can use all the original APIs of Sqlite3.

```ts
const dbo = new Dbo()

await dbo.open()

const smt = dbo.db.prepare('INSERT INTO user (id, name) VALUES (?, ?)')

smt.run([0, 'Alexandra Roman'])

dbo.db.all('SELECT * FROM user', function (err, result) {
  // ...
})
```

## License

[MIT](./LICENSE) copyright © 2024-present alex wei
