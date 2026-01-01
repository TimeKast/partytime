
import { NextRequest, NextResponse } from 'next/server'
import { getAppSetting, getEventById } from '@/lib/queries'
import eventConfig from '@/event-config.json'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
    const homeEventId = await getAppSetting('home_event_id')
    const event = homeEventId ? await getEventById(homeEventId) : null

    return NextResponse.json({
        homeEventId,
        event: event ? {
            id: event.id,
            slug: event.slug,
            title: event.title,
            isActive: event.isActive
        } : null,
        legacyId: eventConfig.event.id
    })
}
