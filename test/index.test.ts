import { beforeAll, afterAll, test, describe, it, expect } from 'vitest'
import { Dbo } from '../src/index'

const dbo = new Dbo()

beforeAll(async () => {
  await dbo.open()
})

test('db is open', async () => {
  const result = await dbo.get<{ count: number }>(
    'SELECT count(*) AS count FROM sqlite_master'
  )
  expect(dbo.db).toBeDefined()
  expect(result.count).toBe(0)
})

test('escape api test', async () => {
  expect(dbo.escape('/')).toBe('//')
  expect(dbo.escape('%')).toBe('/%')
  expect(dbo.escape('_')).toBe('/_')
})

test('toSqlQueryParam api test', async () => {
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
    expect(result.count).toBe(1)
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
  it('get a row', async () => {
    const sql = `SELECT * FROM user WHERE id=?`
    const result = await dbo.get<{ id: number; name: string }>(sql, [0])
    expect(result).toStrictEqual({ id: 0, name: 'Evie Le' })
  })
})

describe('all api test', () => {
  it('get all rows', async () => {
    await dbo.run(`INSERT INTO user (id, name) VALUES ($id, $name)`, {
      $id: 1,
      $name: 'Oliver'
    })
    const sql = `SELECT * FROM user`
    const result = await dbo.all<{ id: number; name: string }>(sql)
    expect(result.length).toBe(2)
  })
})

afterAll(async () => {
  await dbo.close()
})
