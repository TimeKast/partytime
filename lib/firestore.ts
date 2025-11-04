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
  eventId: string
  createdAt: string
  status: 'confirmed' | 'cancelled'
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
    
    return {
      id: docRef.id,
      ...newRsvp,
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
    
    const snapshot = await collection
      .where('eventId', '==', eventId)
      .orderBy('createdAt', 'desc')
      .get()

    const rsvps = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    })) as RSVP[]

    return rsvps
  } catch (error) {
    console.error('Error al obtener RSVPs:', error)
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

export { db, collectionName }
