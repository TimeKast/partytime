import { NextRequest, NextResponse } from 'next/server'
import { isDatabaseConfigured } from '@/lib/db'
import { validateAdminAuth, getUnauthorizedResponse } from '@/lib/auth'

/**
 * POST /api/admin/event-settings/update
 * Actualiza la configuración del evento (requiere autenticación admin)
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

    // Preparar settings
    const settings = {
      eventId: body.eventId,
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
      // Theme colors
      primaryColor: body.theme?.primaryColor || '#FF1493',
      secondaryColor: body.theme?.secondaryColor || '#00FFFF',
      accentColor: body.theme?.accentColor || '#FFD700'
    }

    if (isDatabaseConfigured()) {
      const { saveEventSettings } = await import('@/lib/queries')
      const result = await saveEventSettings(settings)

      return NextResponse.json({
        success: true,
        message: 'Configuración actualizada correctamente'
      })
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
