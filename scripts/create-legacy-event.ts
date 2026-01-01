/**
 * Script to create the legacy event from event-config.json in the database
 * Run: npx tsx scripts/create-legacy-event.ts
 */

import { config } from 'dotenv'
config({ path: '.env.local' })

import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import * as schema from '../lib/schema'
import eventConfig from '../event-config.json'

async function main() {
    const dbUrl = process.env.DATABASE_URL
    if (!dbUrl) {
        console.error('❌ DATABASE_URL not configured')
        process.exit(1)
    }

    const sql = neon(dbUrl)

    console.log('🔍 Checking if legacy event exists...')

    try {
        // Check if event already exists
        const existing = await sql`
            SELECT id, slug, title FROM events 
            WHERE slug = ${eventConfig.event.id} OR id = ${eventConfig.event.id}
            LIMIT 1
        `

        if (existing.length > 0) {
            console.log('✅ Legacy event already exists:', existing[0].title)
            console.log('   ID:', existing[0].id)
            console.log('   Slug:', existing[0].slug)
            process.exit(0)
        }

        console.log('📝 Creating legacy event from event-config.json...')

        const themeJson = JSON.stringify(eventConfig.theme)

        const result = await sql`
            INSERT INTO events (
                id, slug, title, subtitle, date, time, location, details,
                price_enabled, price_amount, price_currency,
                capacity_enabled, capacity_limit,
                background_image_url, theme,
                host_name, host_email, host_phone,
                is_active
            ) VALUES (
                ${eventConfig.event.id},
                ${eventConfig.event.id},
                ${eventConfig.event.title},
                ${eventConfig.event.subtitle},
                ${eventConfig.event.date},
                ${eventConfig.event.time},
                ${eventConfig.event.location},
                ${eventConfig.event.details},
                true, 250, 'MXN',
                true, 100,
                ${eventConfig.event.backgroundImage},
                ${themeJson}::jsonb,
                ${eventConfig.contact.hostName},
                ${eventConfig.contact.hostEmail},
                ${eventConfig.contact.hostPhone},
                true
            )
            RETURNING id, slug, title
        `

        console.log('✅ Legacy event created successfully!')
        console.log('   ID:', result[0].id)
        console.log('   Slug:', result[0].slug)
        console.log('   Title:', result[0].title)

    } catch (error: any) {
        console.error('❌ Full error:', error)
        process.exit(1)
    }

    process.exit(0)
}

main()
