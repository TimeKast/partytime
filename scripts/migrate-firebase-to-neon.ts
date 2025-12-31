/**
 * Migration script: Firebase Firestore → Neon PostgreSQL
 * 
 * Usage:
 * 1. Make sure both Firebase and Neon credentials are in .env.local
 * 2. Run: npx tsx scripts/migrate-firebase-to-neon.ts
 */

import { config } from 'dotenv'
config({ path: '.env.local' })

import * as admin from 'firebase-admin'
import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import * as schema from '../lib/schema'

// Check environment variables
const requiredEnvVars = [
    'DATABASE_URL',
    'GOOGLE_CLOUD_PROJECT_ID',
    'GOOGLE_CLOUD_PRIVATE_KEY',
    'GOOGLE_CLOUD_CLIENT_EMAIL'
]

for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
        console.error(`❌ Missing environment variable: ${envVar}`)
        process.exit(1)
    }
}

// Initialize Firebase Admin
if (!admin.apps.length) {
    const privateKey = process.env.GOOGLE_CLOUD_PRIVATE_KEY!.includes('\\n')
        ? process.env.GOOGLE_CLOUD_PRIVATE_KEY!.replace(/\\n/g, '\n')
        : process.env.GOOGLE_CLOUD_PRIVATE_KEY

    admin.initializeApp({
        credential: admin.credential.cert({
            projectId: process.env.GOOGLE_CLOUD_PROJECT_ID,
            privateKey: privateKey,
            clientEmail: process.env.GOOGLE_CLOUD_CLIENT_EMAIL,
        }),
    })
}

const firestore = admin.firestore()

// Initialize Neon/Drizzle
const sql = neon(process.env.DATABASE_URL!)
const db = drizzle(sql, { schema })

async function migrateRSVPs() {
    console.log('\n📋 Migrating RSVPs...')

    const snapshot = await firestore.collection('rsvps').get()
    console.log(`   Found ${snapshot.docs.length} RSVPs in Firebase`)

    let migrated = 0
    let skipped = 0

    for (const doc of snapshot.docs) {
        const data = doc.data()

        try {
            await db.insert(schema.rsvps).values({
                id: doc.id,
                eventId: data.eventId || 'rooftop-party-andras-oct2024',
                name: data.name,
                email: data.email,
                phone: data.phone,
                plusOne: data.plusOne || false,
                status: data.status || 'confirmed',
                emailSent: data.emailSent ? new Date(data.emailSent) : null,
                emailHistory: data.emailHistory || [],
                cancelToken: data.cancelToken || null,
                createdAt: data.createdAt ? new Date(data.createdAt) : new Date(),
            }).onConflictDoNothing()

            migrated++
        } catch (error: any) {
            if (error.message?.includes('duplicate')) {
                skipped++
            } else {
                console.error(`   ❌ Error migrating RSVP ${doc.id}:`, error.message)
            }
        }
    }

    console.log(`   ✅ Migrated: ${migrated} | Skipped (duplicates): ${skipped}`)
}

// NOTE: migrateEventSettings function removed - eventSettings table was deprecated
// and consolidated into the 'events' table. See H-006 deprecation notice.
// If you need to migrate old eventSettings data, migrate it directly into the events table.


async function migrateEvents() {
    console.log('\n🎉 Migrating Events...')

    // Check if events collection exists
    const snapshot = await firestore.collection('events').get()
    console.log(`   Found ${snapshot.docs.length} events in Firebase`)

    if (snapshot.docs.length === 0) {
        console.log('   ℹ️  No events to migrate (collection might not exist yet)')
        return
    }

    let migrated = 0

    for (const doc of snapshot.docs) {
        const data = doc.data()

        try {
            await db.insert(schema.events).values({
                id: doc.id,
                slug: data.slug,
                title: data.title || '',
                subtitle: data.subtitle || '',
                date: data.date || '',
                time: data.time || '',
                location: data.location || '',
                details: data.details || '',
                priceEnabled: data.price?.enabled || false,
                priceAmount: data.price?.amount || 0,
                priceCurrency: data.price?.currency || 'MXN',
                capacityEnabled: data.capacity?.enabled || false,
                capacityLimit: data.capacity?.limit || 0,
                backgroundImageUrl: data.backgroundImage?.url || '/background.png',
                theme: data.theme || {
                    primaryColor: '#FF1493',
                    secondaryColor: '#00FFFF',
                    accentColor: '#FFD700',
                    backgroundColor: '#1a0033',
                    textColor: '#ffffff'
                },
                hostName: data.contact?.hostName || '',
                hostEmail: data.contact?.hostEmail || '',
                hostPhone: data.contact?.hostPhone || '',
                isActive: data.isActive !== undefined ? data.isActive : true,
                createdAt: data.createdAt ? new Date(data.createdAt) : new Date(),
                updatedAt: data.updatedAt ? new Date(data.updatedAt) : new Date(),
            }).onConflictDoNothing()

            migrated++
        } catch (error: any) {
            console.error(`   ❌ Error migrating event ${doc.id}:`, error.message)
        }
    }

    console.log(`   ✅ Migrated: ${migrated}`)
}

async function main() {
    console.log('🚀 Starting Firebase → Neon Migration')
    console.log('=====================================')

    try {
        await migrateRSVPs()
        // migrateEventSettings removed - table consolidated into events
        await migrateEvents()

        console.log('\n=====================================')
        console.log('✅ Migration complete!')
        console.log('💡 You can now remove Firebase dependencies if desired')

    } catch (error) {
        console.error('\n❌ Migration failed:', error)
        process.exit(1)
    }

    process.exit(0)
}

main()
