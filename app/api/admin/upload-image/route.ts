import { NextRequest, NextResponse } from 'next/server'
import { put } from '@vercel/blob'
import { cookies } from 'next/headers'
import { validateSession } from '@/lib/auth-utils'
import { userHasEventAccess } from '@/lib/user-queries'
import { getEventBySlug } from '@/lib/queries'

// Maximum file size: 10MB
const MAX_FILE_SIZE = 10 * 1024 * 1024

// Allowed MIME types
const ALLOWED_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif'
]

// Magic-byte signatures per allowed type. file.type (a client-controlled
// header) is not trustworthy on its own (FS-18), so we also sniff the bytes.
function sniffImageType(bytes: Uint8Array): string | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg'
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png'
  if (bytes.length >= 4 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) return 'image/gif'
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) return 'image/webp'
  return null
}

export async function POST(request: NextRequest) {
  try {
    // --- Auth (FS-01): require a valid session with manager access to the
    // target event (or super_admin). Previously this endpoint was unauthenticated.
    const token = (await cookies()).get('rp_session')?.value
    if (!token) {
      return NextResponse.json({ success: false, error: 'No autorizado' }, { status: 401 })
    }
    const currentUser = await validateSession(token)
    if (!currentUser) {
      return NextResponse.json({ success: false, error: 'Sesión inválida' }, { status: 401 })
    }

    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const eventSlug = formData.get('eventSlug') as string | null

    if (!file) {
      return NextResponse.json(
        { success: false, error: 'No se proporcionó ningún archivo' },
        { status: 400 }
      )
    }

    if (!eventSlug) {
      return NextResponse.json(
        { success: false, error: 'No se proporcionó el slug del evento' },
        { status: 400 }
      )
    }

    // Resolve the event and verify the caller can write to it.
    const event = await getEventBySlug(eventSlug)
    if (!event) {
      return NextResponse.json(
        { success: false, error: 'Evento no encontrado' },
        { status: 404 }
      )
    }
    if (currentUser.role !== 'super_admin') {
      const { hasAccess } = await userHasEventAccess(currentUser.id, event.id, 'manager')
      if (!hasAccess) {
        return NextResponse.json(
          { success: false, error: 'No tienes permiso para subir imágenes de este evento' },
          { status: 403 }
        )
      }
    }

    // Validate declared MIME type
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { success: false, error: 'Tipo de archivo no permitido. Use JPG, PNG, WebP o GIF.' },
        { status: 400 }
      )
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { success: false, error: 'El archivo es demasiado grande. Máximo 10MB.' },
        { status: 400 }
      )
    }

    // Validate real content via magic bytes (FS-18) — reject spoofed extensions.
    const buffer = Buffer.from(await file.arrayBuffer())
    const sniffed = sniffImageType(new Uint8Array(buffer.subarray(0, 12)))
    if (!sniffed || sniffed !== file.type) {
      return NextResponse.json(
        { success: false, error: 'El contenido del archivo no coincide con una imagen válida.' },
        { status: 400 }
      )
    }

    // Build the blob key from the RESOLVED event slug (server-side), not the
    // raw client input, and sanitize to a safe charset (FS-02) so it cannot
    // traverse into or collide with other events' keys.
    const safeSlug = event.slug.replace(/[^a-zA-Z0-9-]/g, '').slice(0, 80) || 'event'
    const extFromType: Record<string, string> = {
      'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif',
    }
    const extension = extFromType[sniffed]
    const timestamp = Date.now()
    const filename = `events/${safeSlug}-${timestamp}.${extension}`

    // Upload to Vercel Blob
    const blob = await put(filename, buffer, {
      access: 'public',
      addRandomSuffix: false,
      contentType: sniffed,
    })

    return NextResponse.json({
      success: true,
      imageUrl: blob.url,
      filename: blob.pathname,
      size: file.size
    })

  } catch (error) {
    console.error('Error uploading image:', error)
    return NextResponse.json(
      { success: false, error: 'Error interno al subir la imagen' },
      { status: 500 }
    )
  }
}
