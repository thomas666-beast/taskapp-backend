import { Pool } from 'pg'
import bcrypt from 'bcrypt'

const pool = new Pool({ connectionString: process.env.DATABASE_URL })

const username = process.argv[2] || 'admin'
const password = process.argv[3] || 'admin12345'

const run = async () => {
  const hash = await bcrypt.hash(password, 10)

  const { rows } = await pool.query(
    `INSERT INTO users (username, password_hash, role)
     VALUES ($1, $2, 'ADMIN')
     ON CONFLICT (username) DO UPDATE
       SET password_hash = EXCLUDED.password_hash,
           role          = 'ADMIN'
     RETURNING id, username, role`,
    [username, hash]
  )

  console.log('✅ admin ready:', rows[0])
  await pool.end()
}

run().catch((e) => {
  console.error(e)
  process.exit(1)
})
