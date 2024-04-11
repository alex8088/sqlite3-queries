### v2.1.0 (_2024-04-11_)

- feat: supports automatic migration

### v2.0.0 (_2024-04-10_)

- feat: add prepare api
- feat: add transaction api
- feat: add vacuum api
- feat: add checkIntegrity api
- feat: get database name
- feat: add isInMemory api
- feat: add pragma api
- feat: add static property of sqlite max parameters
- refactor: test with disk database
- refactor: turn isInMemory method to property
- refactor: use rollup-plugin-rm to clean dist
- refactor: remove checkIntegrity api
- refactor: support for tracing and logging
- fix: set db to undefined when closed
- fix: get method may return undefined
- fix: pragma not support empty string and zero
- chore: format jsdoc
- chore: bump deps

### v1.0.1 (_2024-04-04_)

- feat: add toSqlQueryParam api

### v1.0.0 (_2024-03-30_)

- chore: A type-safe and promise-based query client for node sqlite3
