import { NextRequest, NextResponse } from 'next/server'
import { isDatabaseConfigured } from '@/lib/db'
import { cookies } from 'next/headers'
import { validateSession } from '@/lib/auth-utils'
import { userHasEventAccess } from '@/lib/user-queries'

/**
 * POST /api/admin/event-settings/update
 * Actualiza la configuración del evento (requiere autenticación admin)
 * Now directly updates the 'events' table (consolidated)
 */
export async function POST(request: NextRequest) {
  // Check auth
  const cookieStore = await cookies()
  const token = cookieStore.get('rp_session')?.value

  if (!token) {
    return NextResponse.json({ success: false, error: 'No autorizado' }, { status: 401 })
  }

  const currentUser = await validateSession(token)
  if (!currentUser) {
    return NextResponse.json({ success: false, error: 'Sesión inválida' }, { status: 401 })
  }

  try {
    const body = await request.json()

    // Validar campos requeridos - eventId siempre es necesario
    if (!body.eventId) {
      return NextResponse.json({
        success: false,
        message: 'Falta eventId'
      }, { status: 400 })
    }

    if (isDatabaseConfigured()) {
      const { getEventBySlug, updateEvent } = await import('@/lib/queries')

      console.log('🔍 [update] Looking for event with eventId:', body.eventId)

      // Find the event by slug or ID
      const event = await getEventBySlug(body.eventId)

      if (!event) {
        console.error('❌ [update] Event not found for eventId:', body.eventId)
        return NextResponse.json({
          success: false,
          message: 'Evento no encontrado'
        }, { status: 404 })
      }

      console.log('✅ [update] Event found - ID:', event.id, 'Slug:', event.slug, 'Title:', event.title)

      // Check permissions
      if (currentUser.role !== 'super_admin') {
        const { hasAccess } = await userHasEventAccess(currentUser.id, event.id, 'manager')
        if (!hasAccess) {
          return NextResponse.json({ success: false, error: 'No tienes permiso para modificar la configuración de este evento' }, { status: 403 })
        }
      }

      // Check if this is a partial update (just images without title key) or full update
      // Note: body.title === undefined means no title provided; body.title === '' means empty title (valid)
      const isPartialUpdate = (body.backgroundImage || body.ogImage) && body.title === undefined
      
      // Prepare update data
      const updates: any = {}
      
      if (isPartialUpdate) {
        // Partial update: only update provided images
        if (body.backgroundImage?.url) {
          console.log('📸 [update] Partial update - backgroundImageUrl:', body.backgroundImage.url)
          updates.backgroundImageUrl = body.backgroundImage.url
        }
        if (body.ogImage?.url) {
          console.log('🖼️ [update] Partial update - ogImageUrl:', body.ogImage.url)
          updates.ogImageUrl = body.ogImage.url
        }
      } else {
        // Full update: title can be empty string (for events with title in image)
        // Only check if title key exists in body (allows empty string)
        if (body.title === undefined) {
          return NextResponse.json({
            success: false,
            message: 'Falta el título del evento'
          }, { status: 400 })
        }
        
        console.log('📝 [update] Full update with location:', body.location)
        
        updates.title = body.title // Can be empty string
        updates.displayTitle = body.displayTitle ?? '' // Title for invitation page
        updates.subtitle = body.subtitle || ''
        updates.date = body.date || ''
        updates.time = body.time || ''
        updates.location = body.location || ''
        updates.details = body.details || ''
        updates.priceEnabled = body.price?.enabled || false
        updates.priceAmount = body.price?.amount || 0
        updates.priceCurrency = body.price?.currency || 'MXN'
        updates.capacityEnabled = body.capacity?.enabled || false
        updates.capacityLimit = body.capacity?.limit || 0
        updates.backgroundImageUrl = body.backgroundImage?.url || event.backgroundImageUrl
        updates.ogImageUrl = body.ogImage?.url || event.ogImageUrl
        // A3-06: preserve custom backgroundColor/textColor instead of clobbering
        // them with hardcodes (these ARE consumed by the email senders).
        const existingTheme = (event.theme as any) || {}
        updates.theme = {
          primaryColor: body.theme?.primaryColor || '#FF1493',
          secondaryColor: body.theme?.secondaryColor || '#00FFFF',
          accentColor: body.theme?.accentColor || '#FFD700',
          backgroundColor: body.theme?.backgroundColor || existingTheme.backgroundColor || '#1a0033',
          textColor: body.theme?.textColor || existingTheme.textColor || '#ffffff'
        }
        // Plus-one configuration
        updates.requirePlusOneName = body.requirePlusOneName ?? false
        // RSVP Closed configuration (A3-01): only change when explicitly provided,
        // so a full settings save that omits it does NOT reopen a closed RSVP.
        if (body.rsvpClosed !== undefined) {
          updates.rsvpClosed = body.rsvpClosed
        }
        if (body.rsvpClosedMessage !== undefined) {
          updates.rsvpClosedMessage = body.rsvpClosedMessage
        }
      }

      // Email configuration (only update if provided)
      if (body.emailConfig !== undefined) {
        updates.emailConfirmationEnabled = body.emailConfig.confirmationEnabled ?? false
        updates.reminderEnabled = body.emailConfig.reminderEnabled ?? false

        const newScheduledAt = body.emailConfig.reminderScheduledAt
          ? new Date(body.emailConfig.reminderScheduledAt)
          : null

        if (newScheduledAt) {
          updates.reminderScheduledAt = newScheduledAt
          // A1-01: re-arm (clear reminderSentAt) ONLY when the scheduled time
          // actually CHANGED from what is stored — determined server-side, not
          // from the client. The old client flag compared reminderScheduledAt vs
          // reminderSentAt (different-nature timestamps that almost never match),
          // so every settings save re-armed the reminder and the cron re-sent to
          // everyone ("40 vueltas" class). We ignore body.clearSentStatus.
          const prevScheduled = event.reminderScheduledAt ? new Date(event.reminderScheduledAt).getTime() : null
          if (prevScheduled !== newScheduledAt.getTime()) {
            updates.reminderSentAt = null
          }
        } else if (body.emailConfig.reminderEnabled === false) {
          // Clear scheduled date if reminder is disabled
          updates.reminderScheduledAt = null
        }
      }

      try {
        const result = await updateEvent(event.id, updates)
        console.log('✅ Event updated successfully:', result.id)

        return NextResponse.json({
          success: true,
          message: 'Configuración actualizada correctamente',
          savedId: result.id
        })
      } catch (saveError) {
        console.error('❌ Database save error:', saveError)
        throw saveError
      }
    } else {
      return NextResponse.json({
        success: true,
        message: 'Configuración actualizada (modo demo)',
        note: 'Configura DATABASE_URL para guardar permanentemente'
      })
    }
  } catch (error) {
    console.error('Error al actualizar configuración:', error)
    return NextResponse.json({
      success: false,
      message: 'Error al actualizar configuración'
    }, { status: 500 })
  }
}
