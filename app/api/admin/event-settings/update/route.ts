import { NextRequest, NextResponse } from 'next/server'
import { isDatabaseConfigured } from '@/lib/db'
import { validateAdminAuth, getUnauthorizedResponse } from '@/lib/auth'

/**
 * POST /api/admin/event-settings/update
 * Actualiza la configuración del evento (requiere autenticación admin)
 * Now directly updates the 'events' table (consolidated)
 */
export async function POST(request: NextRequest) {
  // Verificar autenticación básica
  if (!validateAdminAuth(request)) {
    return getUnauthorizedResponse()
  }

  try {
    const body = await request.json()

    // Validar campos requeridos
    if (!body.eventId || !body.title) {
      return NextResponse.json({
        success: false,
        message: 'Faltan campos requeridos'
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
      console.log('📝 [update] Updating with location:', body.location)

      // Prepare update data
      const updates = {
        title: body.title,
        subtitle: body.subtitle || '',
        date: body.date || '',
        time: body.time || '',
        location: body.location || '',
        details: body.details || '',
        priceEnabled: body.price?.enabled || false,
        priceAmount: body.price?.amount || 0,
        priceCurrency: body.price?.currency || 'MXN',
        capacityEnabled: body.capacity?.enabled || false,
        capacityLimit: body.capacity?.limit || 0,
        backgroundImageUrl: body.backgroundImage?.url || '/background.png',
        theme: {
          primaryColor: body.theme?.primaryColor || '#FF1493',
          secondaryColor: body.theme?.secondaryColor || '#00FFFF',
          accentColor: body.theme?.accentColor || '#FFD700',
          backgroundColor: '#1a0033',
          textColor: '#ffffff'
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
