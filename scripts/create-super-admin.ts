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

    // Super admin credentials
    const email = 'info@timekast.mx'
    const password = 'dave1511'
    const name = 'Super Admin'

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
