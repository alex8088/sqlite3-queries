import fs from 'node:fs'
import path from 'node:path'
import { beforeAll, afterAll, describe, it, expect } from 'vitest'
import { Dbo } from '../src/index'

const dbPath = path.join(__dirname, 'test.db')

const dbo = new Dbo(dbPath)

beforeAll(async () => {
  if (fs.existsSync(dbPath)) {
    fs.unlinkSync(dbPath)
  }
  await dbo.open()
})

it('db is open', async () => {
  const result = await dbo.get<{ count: number }>(
    'SELECT count(*) AS count FROM sqlite_master'
  )
  expect(dbo.db).toBeDefined()
  expect(result?.count).toBe(0)
})

it('db name property test', async () => {
  expect(dbo.name).toEqual('test.db')
})

it('escape api test', async () => {
  expect(dbo.escape('/')).toBe('//')
  expect(dbo.escape('%')).toBe('/%')
  expect(dbo.escape('_')).toBe('/_')
})

it('toSqlQueryParam api test', async () => {
  const result = { $id: 0, $name: 'Evie Le' }
  expect(dbo.toSqlQueryParam({ id: 0, name: 'Evie Le' })).toStrictEqual(result)
})

describe.sequential('run api test', () => {
  it('create a table', async () => {
    const sql = `CREATE TABLE IF NOT EXISTS user (id STRING PRIMARY KEY, name STRING)`
    await dbo.run(sql)
    const result = await dbo.get<{ count: number }>(
      'SELECT count(*) AS count FROM sqlite_master WHERE name=?',
      ['user']
    )
    expect(result?.count).toBe(1)
  })

  it('insert a row with array parameters', async () => {
    const sql = `INSERT INTO user (id, name) VALUES (?, ?)`
    const result = await dbo.run(sql, [0, 'Alexandra Roman'])

    expect(result.lastId).toBe(1)
  })

  it('update a row with named parameters', async () => {
    const sql = `UPDATE user SET name = $name WHERE id = $id`
    const result = await dbo.run(sql, { $id: 0, $name: 'Evie Le' })

    expect(result.changes).toBe(1)
  })
})

describe('get api test', () => {
  const sql = `SELECT * FROM user WHERE id=?`

  it('data not found, returns undefined', async () => {
    const result = await dbo.get<{ id: number; name: string }>(sql, [-1])
    expect(result).toBeUndefined()
  })

  it('data found, returns object', async () => {
    const result = await dbo.get<{ id: number; name: string }>(sql, [0])
    expect(result).toStrictEqual({ id: 0, name: 'Evie Le' })
  })
})

it('all api test', async () => {
  await dbo.run(`INSERT INTO user (id, name) VALUES ($id, $name)`, {
    $id: 1,
    $name: 'Oliver'
  })
  const sql = `SELECT * FROM user`
  const result = await dbo.all<{ id: number; name: string }>(sql)
  expect(result.length).toBe(2)
})

it('transaction api test', async () => {
  const len = 500
  await dbo.transaction(() => {
    dbo.prepare('INSERT INTO user (id, name) VALUES ($id, $name)', (stmt) => {
      Array(len)
        .fill(0)
        .map((_, i) => ({ $id: 2 + i, $name: `Jordan${i}` }))
        .forEach((p) => stmt.run(p))
    })
  })
  const result = await dbo.get<{ count: number }>(
    'SELECT count(*) AS count FROM user'
  )
  expect(result?.count).toBe(len + 2)
})

it('vacuum api test', async () => {
  const stat = fs.statSync(dbo.fileName)
  await dbo.run('DELETE FROM user')
  await dbo.vacuum()
  expect(fs.statSync(dbo.fileName).size).toBeLessThan(stat.size)
})

afterAll(async () => {
  await dbo.close()
})
