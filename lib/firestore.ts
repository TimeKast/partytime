import * as admin from 'firebase-admin'

// Validar que las variables de entorno estén configuradas
const hasProjectId = !!process.env.GOOGLE_CLOUD_PROJECT_ID
const hasPrivateKey = !!process.env.GOOGLE_CLOUD_PRIVATE_KEY
const hasClientEmail = !!process.env.GOOGLE_CLOUD_CLIENT_EMAIL

console.log('🔍 Firestore Environment Check:', {
  hasProjectId,
  hasPrivateKey,
  hasClientEmail,
  projectId: hasProjectId ? process.env.GOOGLE_CLOUD_PROJECT_ID : 'MISSING',
  clientEmail: hasClientEmail ? process.env.GOOGLE_CLOUD_CLIENT_EMAIL : 'MISSING',
  privateKeyLength: hasPrivateKey ? process.env.GOOGLE_CLOUD_PRIVATE_KEY?.length : 0
})

if (!hasProjectId || !hasPrivateKey || !hasClientEmail) {
  console.warn('⚠️  Google Cloud Firestore no configurado. Usando modo demo.')
  throw new Error(
    'GOOGLE_CLOUD_PROJECT_ID, GOOGLE_CLOUD_PRIVATE_KEY y GOOGLE_CLOUD_CLIENT_EMAIL no configurados. La app funcionará en modo demo.'
  )
}

// Inicializar Firebase Admin SDK (singleton)
if (!admin.apps.length) {
  try {
    const privateKey = process.env.GOOGLE_CLOUD_PRIVATE_KEY
    // Manejar tanto \\n como \n en la private key
    const formattedKey = privateKey?.includes('\\n') 
      ? privateKey.replace(/\\n/g, '\n')
      : privateKey
    
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.GOOGLE_CLOUD_PROJECT_ID,
        privateKey: formattedKey,
        clientEmail: process.env.GOOGLE_CLOUD_CLIENT_EMAIL,
      }),
    })
    console.log('✅ Firebase Admin SDK initialized successfully')
  } catch (error) {
    console.error('❌ Error initializing Firebase Admin SDK:', error)
    throw error
  }
}

const db = admin.firestore()
const collectionName = process.env.FIRESTORE_COLLECTION_NAME || 'rsvps'

// Tipos para RSVP
export interface RSVP {
  id?: string
  name: string
  email: string
  phone: string
  plusOne: boolean
  eventId: string
  createdAt: string
  status: 'confirmed' | 'cancelled'
  emailSent?: string // timestamp del último email enviado
  emailHistory?: Array<{
    sentAt: string
    type: 'confirmation' | 'reminder'
  }>
  cancelToken?: string // token único para cancelar desde email
}

// Función para guardar un RSVP
export async function saveRSVP(rsvp: Omit<RSVP, 'id' | 'createdAt' | 'status'>) {
  try {
    const collection = db.collection(collectionName)

    // Verificar si ya existe un RSVP con este email para este evento
    const existingQuery = await collection
      .where('email', '==', rsvp.email)
      .where('eventId', '==', rsvp.eventId)
      .limit(1)
      .get()

    if (!existingQuery.empty) {
      throw new Error('Ya existe un RSVP con este email para este evento')
    }

    // Crear nuevo RSVP
    const newRsvp: RSVP = {
      ...rsvp,
      createdAt: new Date().toISOString(),
      status: 'confirmed',
    }

    const docRef = await collection.add(newRsvp)
    
    // Generar y guardar token de cancelación
    const cancelToken = generateCancelToken(docRef.id, rsvp.email)
    await docRef.update({ cancelToken })
    
    return {
      id: docRef.id,
      ...newRsvp,
      cancelToken,
    }
  } catch (error) {
    console.error('Error al guardar RSVP:', error)
    throw error
  }
}

// Función para obtener todos los RSVPs de un evento
export async function getRSVPsByEvent(eventId: string) {
  try {
    const collection = db.collection(collectionName)
    
    // Query sin orderBy para evitar error de índice compuesto
    const snapshot = await collection
      .where('eventId', '==', eventId)
      .get()

    // Ordenar en memoria después de obtener los datos
    const rsvps = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    })) as RSVP[]

    // Ordenar por fecha de creación (más reciente primero)
    rsvps.sort((a, b) => {
      const dateA = new Date(a.createdAt).getTime()
      const dateB = new Date(b.createdAt).getTime()
      return dateB - dateA // Orden descendente
    })

    return rsvps
  } catch (error) {
    console.error('Error obteniendo RSVPs por evento:', error)
    throw error
  }
}

// Función para obtener un RSVP por ID
export async function getRSVPById(rsvpId: string): Promise<RSVP | null> {
  try {
    const docRef = db.collection(collectionName).doc(rsvpId)
    const doc = await docRef.get()

    if (!doc.exists) {
      return null
    }

    return {
      id: doc.id,
      ...doc.data()
    } as RSVP
  } catch (error) {
    console.error('Error obteniendo RSVP por ID:', error)
    throw error
  }
}

// Función para obtener estadísticas de un evento
export async function getEventStats(eventId: string) {
  try {
    const collection = db.collection(collectionName)
    
    const snapshot = await collection
      .where('eventId', '==', eventId)
      .get()

    const rsvps = snapshot.docs.map(doc => doc.data()) as RSVP[]

    const totalConfirmed = rsvps.length
    const confirmed = rsvps.filter(r => r.status === 'confirmed').length
    const cancelled = rsvps.filter(r => r.status === 'cancelled').length

    return {
      totalConfirmed,
      confirmed,
      cancelled,
    }
  } catch (error) {
    console.error('Error al obtener estadísticas:', error)
    throw error
  }
}

// Función para generar token de cancelación único
export function generateCancelToken(rsvpId: string, email: string): string {
  const crypto = require('crypto')
  const data = `${rsvpId}-${email}-${process.env.CANCEL_TOKEN_SECRET || 'default-secret'}`
  // Usar hash SHA256 truncado a 32 caracteres para URL más corta
  return crypto.createHash('sha256').update(data).digest('hex').substring(0, 32)
}

// Función para validar token de cancelación
export function validateCancelToken(token: string, rsvpId: string, email: string): boolean {
  const expectedToken = generateCancelToken(rsvpId, email)
  return token === expectedToken
}

// Función para registrar envío de email
export async function recordEmailSent(rsvpId: string, type: 'confirmation' | 'reminder') {
  try {
    const docRef = db.collection(collectionName).doc(rsvpId)
    const doc = await docRef.get()
    
    if (!doc.exists) {
      throw new Error('RSVP no encontrado')
    }

    const currentHistory = (doc.data()?.emailHistory || []) as Array<{
      sentAt: string
      type: 'confirmation' | 'reminder'
    }>

    await docRef.update({
      emailSent: new Date().toISOString(),
      emailHistory: [
        ...currentHistory,
        {
          sentAt: new Date().toISOString(),
          type
        }
      ]
    })

    return true
  } catch (error) {
    console.error('Error al registrar envío de email:', error)
    throw error
  }
}

// Función para cancelar un RSVP
export async function cancelRSVP(rsvpId: string, token: string) {
  try {
    const docRef = db.collection(collectionName).doc(rsvpId)
    const doc = await docRef.get()
    
    if (!doc.exists) {
      throw new Error('RSVP no encontrado')
    }

    const rsvp = doc.data() as RSVP
    
    // Validar token
    if (!validateCancelToken(token, rsvpId, rsvp.email)) {
      throw new Error('Token inválido')
    }

    await docRef.update({
      status: 'cancelled'
    })

    return {
      id: rsvpId,
      ...rsvp,
      status: 'cancelled' as const
    }
  } catch (error) {
    console.error('Error al cancelar RSVP:', error)
    throw error
  }
}

// Función para actualizar un RSVP
export async function updateRSVP(rsvpId: string, data: Partial<Pick<RSVP, 'name' | 'email' | 'phone' | 'plusOne'>>) {
  try {
    const docRef = db.collection(collectionName).doc(rsvpId)
    const doc = await docRef.get()
    
    if (!doc.exists) {
      throw new Error('RSVP no encontrado')
    }

    await docRef.update(data)

    const updatedDoc = await docRef.get()
    return {
      id: rsvpId,
      ...updatedDoc.data()
    } as RSVP
  } catch (error) {
    console.error('Error al actualizar RSVP:', error)
    throw error
  }
}

export { db, collectionName }

