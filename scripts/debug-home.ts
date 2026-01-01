
import * as dotenv from 'dotenv'
import * as path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Load .env.local before anything else
dotenv.config({ path: path.resolve(__dirname, '../.env.local') })

async function debugHome() {
    try {
        console.log('--- DEBUG HOME EVENT ---')

        // Dynamic import to ensure env vars are loaded
        const { db, appSettings, events } = await import('../lib/db')
        const { eq } = await import('drizzle-orm')

        if (!db) {
            console.error('❌ Database not initialized. Check your DATABASE_URL.')
            return
        }

        // 1. Check home_event_id setting
        const [homeSetting] = await db.select()
            .from(appSettings)
            .where(eq(appSettings.id, 'home_event_id'))
            .limit(1)

        console.log('Home Event Setting (home_event_id):', homeSetting || 'NOT FOUND')

        if (homeSetting) {
            // 2. Try to find the event by ID
            const [eventById] = await db.select()
                .from(events)
                .where(eq(events.id, homeSetting.value))
                .limit(1)

            console.log('Event found by ID:', eventById ? {
                id: eventById.id,
                slug: eventById.slug,
                title: eventById.title,
                isActive: eventById.isActive
            } : 'NOT FOUND')

            if (eventById && eventById.slug) {
                // 3. Try to find the event by Slug
                const [eventBySlug] = await db.select()
                    .from(events)
                    .where(eq(events.slug, eventById.slug))
                    .limit(1)

                console.log('Event found by Slug:', eventBySlug ? 'YES' : 'NO')
            }
        }

        // 3.5. Test fallback logic for legacy ID
        const legacyId = 'rooftop-party-andras-oct2024'
        const { getEventBySlug } = await import('../lib/queries')
        const resolvedLegacy = await getEventBySlug(legacyId)
        console.log(`Resolved legacy ID "${legacyId}":`, resolvedLegacy ? 'FOUND' : 'NOT FOUND')
        if (resolvedLegacy) {
            console.log(`  Actual slug: ${resolvedLegacy.slug}`)
        }

        // 4. List some events to see what we have
        const allEvents = await db.select().from(events).limit(10)
        console.log('Events in DB:', allEvents.map(e => ({
            id: e.id,
            slug: e.slug,
            title: e.title,
            isActive: e.isActive
        })))

    } catch (error) {
        console.error('Debug error:', error)
    } finally {
        process.exit(0)
    }
}

debugHome()
