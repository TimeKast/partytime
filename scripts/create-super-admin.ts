/**
 * Seed script to create the initial super admin user
 * Run with: npx tsx scripts/create-super-admin.ts
 */

import { config } from 'dotenv'
config({ path: '.env.local' })
import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import { eq } from 'drizzle-orm'
import bcrypt from 'bcryptjs'
import * as schema from '../lib/schema'

const SALT_ROUNDS = 12

async function createSuperAdmin() {
    const databaseUrl = process.env.DATABASE_URL
    if (!databaseUrl) {
        console.error('❌ DATABASE_URL not configured')
        process.exit(1)
    }

    const sql = neon(databaseUrl)
    const db = drizzle(sql, { schema })

    // Super admin credentials — read from env (never hardcode; FS-04).
    // Prefers SEED_ADMIN_*; falls back to the documented ADMIN_* vars so the
    // existing bootstrap command keeps working.
    // Usage: SEED_ADMIN_EMAIL=... SEED_ADMIN_PASSWORD=... npx tsx scripts/create-super-admin.ts
    const email = process.env.SEED_ADMIN_EMAIL || process.env.ADMIN_EMAIL || process.env.ADMIN_USERNAME
    const password = process.env.SEED_ADMIN_PASSWORD || process.env.ADMIN_PASSWORD
    const name = process.env.SEED_ADMIN_NAME || 'Super Admin'

    if (!email || !password) {
        console.error('❌ Faltan credenciales. Define SEED_ADMIN_EMAIL y SEED_ADMIN_PASSWORD en el entorno.')
        process.exit(1)
    }
    if (password.length < 12) {
        console.error('❌ SEED_ADMIN_PASSWORD demasiado corta (mínimo 12 caracteres).')
        process.exit(1)
    }

    console.log('🔐 Creating super admin user...')
    console.log(`📧 Email: ${email}`)

    // Hash password
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS)

    try {
        // Check if user already exists
        const existing = await db.select()
            .from(schema.users)
            .where(eq(schema.users.email, email))
            .limit(1)

        if (existing.length > 0) {
            console.log('⚠️ User already exists, updating password...')
            await db.update(schema.users)
                .set({ passwordHash, role: 'super_admin' })
                .where(eq(schema.users.email, email))
            console.log('✅ Password updated!')
        } else {
            // Create new user
            const [user] = await db.insert(schema.users)
                .values({
                    email,
                    passwordHash,
                    name,
                    role: 'super_admin',
                    isActive: true,
                })
                .returning()

            console.log('✅ Super admin created successfully!')
            console.log(`👤 User ID: ${user.id}`)
        }

        console.log('\n🎉 Done! You can now login at /login')

    } catch (error) {
        console.error('❌ Error:', error)
        process.exit(1)
    }

    process.exit(0)
}

createSuperAdmin()
