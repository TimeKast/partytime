/**
 * Script to link RSVPs to the correct event
 * Run: npx tsx scripts/fix-rsvp-event-link.ts
 */

import { config } from 'dotenv'
config({ path: '.env.local' })

import { neon } from '@neondatabase/serverless'

async function main() {
    const dbUrl = process.env.DATABASE_URL
    if (!dbUrl) {
        console.error('❌ DATABASE_URL not configured')
        process.exit(1)
    }

    const sql = neon(dbUrl)

    console.log('🔍 Checking RSVP eventId values...\n')

    // Get distinct eventIds from RSVPs
    const rsvpEventIds = await sql`
        SELECT event_id, COUNT(*) as count 
        FROM rsvps 
        GROUP BY event_id
        ORDER BY count DESC
    `

    console.log('📊 Current RSVP distribution by eventId:')
    for (const row of rsvpEventIds) {
        console.log(`   ${row.event_id}: ${row.count} RSVPs`)
    }

    // Get all events
    console.log('\n📋 Events in database:')
    const events = await sql`SELECT id, slug, title FROM events`
    for (const e of events) {
        console.log(`   ID: ${e.id} | Slug: ${e.slug} | Title: ${e.title}`)
    }

    // Find RSVPs that don't match any event slug
    console.log('\n🔧 Fixing RSVPs with old eventId format...')

    // The legacy event has ID=rooftop-party-andras-oct2024, slug=andrreas
    // RSVPs probably have eventId=rooftop-party-andras-oct2024
    // We need to update them to use the slug=andrreas

    const legacyEventId = 'rooftop-party-andras-oct2024'
    const legacySlug = 'andrreas'

    // Check how many RSVPs have the old ID
    const oldRsvps = await sql`
        SELECT COUNT(*) as count FROM rsvps WHERE event_id = ${legacyEventId}
    `
    console.log(`\n📌 RSVPs with eventId="${legacyEventId}": ${oldRsvps[0].count}`)

    if (parseInt(oldRsvps[0].count) > 0) {
        console.log(`\n🔄 Updating RSVPs to use slug "${legacySlug}"...`)

        const updated = await sql`
            UPDATE rsvps 
            SET event_id = ${legacySlug} 
            WHERE event_id = ${legacyEventId}
            RETURNING id
        `

        console.log(`✅ Updated ${updated.length} RSVPs!`)
    } else {
        console.log('ℹ️ No RSVPs need updating.')
    }

    // Show final distribution
    console.log('\n📊 Final RSVP distribution by eventId:')
    const finalEventIds = await sql`
        SELECT event_id, COUNT(*) as count 
        FROM rsvps 
        GROUP BY event_id
        ORDER BY count DESC
    `
    for (const row of finalEventIds) {
        console.log(`   ${row.event_id}: ${row.count} RSVPs`)
    }

    console.log('\n✅ Done!')
    process.exit(0)
}

main()
