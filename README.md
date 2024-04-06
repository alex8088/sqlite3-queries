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
const dbo = new Dbo(':memory:', true)

await dbo.open()
```

### Closing Database

```ts
await dbo.close()
```

## APIs

Promise-based APIs for sqlite3.

### Open

#### Type Signature:

```ts
open(mode?: number): Promise<void>
```

The `mode` is one or more of `Dbo.OPEN_READONLY`, `Dbo.OPEN_READWRITE`, `Dbo.OPEN_CREATE`, `Dbo.OPEN_FULLMUTEX`, `Dbo.OPEN_URI`, `Dbo.OPEN_SHAREDCACHE`, `Dbo.OPEN_PRIVATECACHE`. Default: `OPEN_READWRITE | OPEN_CREATE | OPEN_FULLMUTEX`.

### Close

#### Type Signature:

```ts
close(): Promise<void>
```

### Run

Runs the SQL query with the specified parameters.

#### Type Signature:

```ts
run(sql: string, params?: SqlQueryParam | (string | number)[]): Promise<RunResult>
```

#### Example:

- With array parameters

```ts
const sql = `INSERT INTO user (id, name) VALUES (?, ?)`
const result = await dbo.run(sql, [0, 'Alexandra Roman'])
```

- With named parameters

```ts
const sql = `UPDATE user SET name = $name WHERE id = $id`
const result = await dbo.run(sql, { $id: 0, $name: 'Evie Le' })
```

### Get

Runs the SQL query with the specified parameters and returns a subsequent result row.

#### Type Signature:

```ts
get<T extends Record<string, any>>(sql: string, params?: SqlQueryParam | (string | number)[]): Promise<T>
```

#### Example:

```ts
const sql = `SELECT * FROM user WHERE id=?`
const result = await dbo.get<{ id: number; name: string }>(sql, [0])

// Output: {id: 0, name: 'Evie Le'}
```

### All

Runs the SQL query with the specified parameters and returns all result rows afterwards.

#### Type Signature:

```ts
all<T extends Record<string, any>>(sql: string, params?: SqlQueryParam | (string | number)[]): Promise<T[]>
```

#### Example:

```ts
const sql = `SELECT * FROM user`
const result = await dbo.all<{ id: number; name: string }>(sql)

// Output: [{id: 0, name: 'Evie Le'}]
```

### Exec

Runs all SQL queries in the supplied string.

#### Type Signature:

```ts
exec(sql: string): Promise<void>
```

### Prepare

Prepares the SQL statement and run the callback with the statement object.

#### Type Signature:

```ts
prepare(sql: string, runCallback: (stmt: Statement) => void): void
```

### Transaction

Start a transaction explicitly. A transaction is the propagation of one or more changes to the database. For example, if you are creating, updating, or deleting a record from the table, then you are performing transaction on the table. It is important to control transactions to ensure data integrity and to handle database errors.

#### Type Signature:

```ts
transaction(transactions: () => void): Promise<void>
```

#### Example:

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

### LoadExtension

Loads a compiled SQLite extension into the database connection object.

#### Type Signature:

```ts
loadExtension(fileName: string): Promise<void>
```

### Vacuum

Rebuild the database file, repacking it into a minimal amount of disk space.

#### Type Signature:

```ts
vacuum(): Promise<void>
```

### CheckIntegrity

Runs a self-check on the database structure. If no errors are found, the text value `ok` will be returned.

#### Type Signature:

```ts
checkIntegrity(): Promise<string>
```

### IsInMemory

Database is in-memory.

#### Type Signature:

```ts
inMemory(): boolean
```

### Escape

Escape the `/`, `%`, and `_` characters of query parameters.

#### Type Signature:

```ts
escape(str: string): string
```

### toSqlQueryParam

Convert object parameters to sql query parameters. All object keys will be prefixed with `$`.

#### Type Signature:

```ts
toSqlQueryParam(param: Record<string, string | number>): SqlQueryParam
```

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
