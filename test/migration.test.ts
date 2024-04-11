import fs from 'node:fs'
import path from 'node:path'
import { beforeAll, afterAll, describe, it, expect } from 'vitest'
import { Dbo, DbContext, DbMigration } from '../src/index'

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
    }
  ]
}

const dbPath = path.join(__dirname, 'migration.db')

const db = new UserContext(dbPath)

beforeAll(async () => {
  if (fs.existsSync(dbPath)) {
    fs.unlinkSync(dbPath)
  }
  await db.open()
})

it('user version is 1', async () => {
  const result = await db.getVersion()
  expect(result).toBe(1)
})

it('table has been created', async () => {
  const sql = `SELECT * FROM users`
  const result = await db.dbo.all<{ id: number; name: string }>(sql)
  expect(result.length).toBe(0)
})

describe.sequential('migration test', async () => {
  it('user version is 2', async () => {
    UserContext.migrations.push({
      version: 2,
      sqls: ['ALTER TABLE users ADD COLUMN gender INTEGER DEFAULT (1)']
    })

    await db.close()
    await db.open()
    expect(await db.getVersion()).toBe(2)
  })

  it('column has been created', async () => {
    const sql = `INSERT INTO users (id, name, gender) VALUES (?, ?, ?)`
    const result = await db.dbo.run(sql, [0, 'Alexandra Roman', 0])
    expect(result.lastId).toBe(1)
  })
})

afterAll(async () => {
  await db.close()
})
