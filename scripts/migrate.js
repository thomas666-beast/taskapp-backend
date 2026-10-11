import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { Pool } from 'pg'

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const dir = 'db/migrations'

const run = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      name TEXT PRIMARY KEY,
      run_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `)

  const { rows: done } = await pool.query('SELECT name FROM _migrations')
  const applied = new Set(done.map(r => r.name))

  const files = (await readdir(dir)).filter(f => f.endsWith('.sql')).sort()

  for (const file of files) {
    if (applied.has(file)) {
      console.log(`⏭  ${file}`)
      continue
    }
    const sql = await readFile(join(dir, file), 'utf8')
    console.log(`▶  ${file}`)
    await pool.query('BEGIN')
    try {
      await pool.query(sql)
      await pool.query('INSERT INTO _migrations(name) VALUES($1)', [file])
      await pool.query('COMMIT')
    } catch (e) {
      await pool.query('ROLLBACK')
      console.error(`✘  ${file}:`, e.message)
      process.exit(1)
    }
  }

  await pool.end()
  console.log('✅ migrations complete')
}

run()
