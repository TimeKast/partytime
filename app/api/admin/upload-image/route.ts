import { NextRequest, NextResponse } from 'next/server'
import { put } from '@vercel/blob'

// Maximum file size: 10MB
const MAX_FILE_SIZE = 10 * 1024 * 1024

// Allowed MIME types
const ALLOWED_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif'
]

export async function POST(request: NextRequest) {
  try {
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

    // Validate file type
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

    // Create unique filename with event slug
    const timestamp = Date.now()
    const extension = file.name.split('.').pop() || 'jpg'
    const filename = `events/${eventSlug}-${timestamp}.${extension}`

    // Upload to Vercel Blob
    const blob = await put(filename, file, {
      access: 'public',
      addRandomSuffix: false
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
