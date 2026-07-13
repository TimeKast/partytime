import { NextRequest, NextResponse } from 'next/server'
import { isDatabaseConfigured } from '@/lib/db'
import { cookies } from 'next/headers'
import { validateSession } from '@/lib/auth-utils'
import { userHasEventAccess } from '@/lib/user-queries'
import type { Event as DatabaseEvent } from '@/lib/schema'
import { parseFullUpdatePrice } from '@/lib/event-api-contract'
import {
  normalizeBackgroundImageUrl,
  normalizeOptionalString,
  parseEventPresentationPatch,
  parseStrictHexColor,
} from '@/lib/event-presentation'

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
    const presentationPatch = parseEventPresentationPatch(body)
    if (!presentationPatch.success) {
      return NextResponse.json({ success: false, message: presentationPatch.error }, { status: 400 })
    }
    let requestedBackgroundColor: string | undefined
    if (
      body.theme
      && typeof body.theme === 'object'
      && !Array.isArray(body.theme)
      && Object.prototype.hasOwnProperty.call(body.theme, 'backgroundColor')
    ) {
      const backgroundColor = parseStrictHexColor(body.theme.backgroundColor)
      if (!backgroundColor) {
        return NextResponse.json({ success: false, message: 'El color de relleno debe ser un HEX de 6 dígitos' }, { status: 400 })
      }
      requestedBackgroundColor = backgroundColor
    }

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
      const updates: Partial<Omit<DatabaseEvent, 'id' | 'createdAt'>> = {
        ...presentationPatch.value,
      }
      
      if (isPartialUpdate) {
        // Partial update: only update provided images
        if (body.backgroundImage?.url !== undefined) {
          const backgroundImageUrl = normalizeBackgroundImageUrl(body.backgroundImage.url)
          if (!backgroundImageUrl) {
            return NextResponse.json({ success: false, message: 'URL de imagen de fondo inválida' }, { status: 400 })
          }
          console.log('📸 [update] Partial update - backgroundImageUrl:', backgroundImageUrl)
          updates.backgroundImageUrl = backgroundImageUrl
        }
        if (body.ogImage?.url !== undefined) {
          const ogImageUrl = normalizeOptionalString(body.ogImage.url)
          const normalizedOgImageUrl = ogImageUrl ? normalizeBackgroundImageUrl(ogImageUrl) : ''
          if (normalizedOgImageUrl === null) {
            return NextResponse.json({ success: false, message: 'URL de imagen OG inválida' }, { status: 400 })
          }
          console.log('🖼️ [update] Partial update - ogImageUrl:', normalizedOgImageUrl)
          updates.ogImageUrl = normalizedOgImageUrl
        }
      } else {
        const title = normalizeOptionalString(body.title)
        if (!title) {
          return NextResponse.json({
            success: false,
            message: 'El nombre interno del evento es requerido'
          }, { status: 400 })
        }
        
        console.log('📝 [update] Full update with location:', body.location)
        
        const price = parseFullUpdatePrice(body.price)
        if (!price.success) {
          return NextResponse.json({ success: false, message: price.error }, { status: 400 })
        }
        const capacityEnabled = body.capacity?.enabled === true
        const capacityLimit = body.capacity?.limit ?? 0
        if (capacityEnabled && (!Number.isInteger(capacityLimit) || capacityLimit < 1)) {
          return NextResponse.json({ success: false, message: 'El límite de capacidad debe ser un entero positivo' }, { status: 400 })
        }

        updates.title = title
        if (body.displayTitle !== undefined) updates.displayTitle = normalizeOptionalString(body.displayTitle)
        updates.subtitle = normalizeOptionalString(body.subtitle)
        updates.date = normalizeOptionalString(body.date)
        updates.time = normalizeOptionalString(body.time)
        updates.location = normalizeOptionalString(body.location)
        updates.details = normalizeOptionalString(body.details)
        updates.priceEnabled = price.value.priceEnabled
        updates.priceAmount = price.value.priceAmount
        updates.priceCurrency = price.value.priceCurrency
        updates.capacityEnabled = capacityEnabled
        updates.capacityLimit = capacityLimit

        if (body.backgroundImage?.url !== undefined) {
          const backgroundImageUrl = normalizeBackgroundImageUrl(body.backgroundImage.url)
          if (!backgroundImageUrl) {
            return NextResponse.json({ success: false, message: 'URL de imagen de fondo inválida' }, { status: 400 })
          }
          updates.backgroundImageUrl = backgroundImageUrl
        }
        if (body.ogImage?.url !== undefined) {
          const ogImageUrl = normalizeOptionalString(body.ogImage.url)
          const normalizedOgImageUrl = ogImageUrl ? normalizeBackgroundImageUrl(ogImageUrl) : ''
          if (normalizedOgImageUrl === null) {
            return NextResponse.json({ success: false, message: 'URL de imagen OG inválida' }, { status: 400 })
          }
          updates.ogImageUrl = normalizedOgImageUrl
        }
        // A3-06: preserve custom backgroundColor/textColor instead of clobbering
        // them with hardcodes (these ARE consumed by the email senders).
        const existingTheme = event.theme || {
          primaryColor: '#FF1493',
          secondaryColor: '#00FFFF',
          accentColor: '#FFD700',
          backgroundColor: '#1a0033',
          textColor: '#ffffff',
        }
        updates.theme = {
          primaryColor: body.theme?.primaryColor || existingTheme.primaryColor || '#FF1493',
          secondaryColor: body.theme?.secondaryColor || existingTheme.secondaryColor || '#00FFFF',
          accentColor: body.theme?.accentColor || existingTheme.accentColor || '#FFD700',
          backgroundColor: (requestedBackgroundColor ?? existingTheme.backgroundColor) || '#1a0033',
          textColor: body.theme?.textColor || existingTheme.textColor || '#ffffff'
        }
        // Plus-one configuration
        if (body.requirePlusOneName !== undefined) {
          updates.requirePlusOneName = body.requirePlusOneName
        }
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
