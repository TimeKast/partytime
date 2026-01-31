import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import * as schema from './schema'

// Get database URL from environment
const databaseUrl = process.env.DATABASE_URL

if (!databaseUrl) {
    console.warn('⚠️  DATABASE_URL not configured. Database operations will fail.')
}

// Create Neon SQL client
const sql = databaseUrl ? neon(databaseUrl) : null

// Create Drizzle ORM instance
export const db = sql ? drizzle(sql, { schema }) : null

// Helper to check if database is configured
export function isDatabaseConfigured(): boolean {
    return !!databaseUrl && !!db
}

// Re-export schema types
export * from './schema'
