import { config } from 'dotenv'
import { defineConfig } from 'drizzle-kit'

// Load local development configuration only when the caller did not inject a
// database URL. This keeps offline generation and CI deterministic and avoids
// reading developer credential files when a safe throwaway URL is supplied.
if (!process.env.DATABASE_URL) {
    config({ path: '.env.local' })
}

if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL environment variable is required. Add it to .env.local')
}

export default defineConfig({
    schema: './lib/schema.ts',
    out: './drizzle',
    dialect: 'postgresql',
    dbCredentials: {
        url: process.env.DATABASE_URL,
    },
})
