import { CosmosClient } from '@azure/cosmos'

// Validar que las variables de entorno estén configuradas
if (!process.env.COSMOS_ENDPOINT || !process.env.COSMOS_KEY) {
  console.warn('⚠️  Azure Cosmos DB no configurado. Usando modo demo.')
  throw new Error(
    'COSMOS_ENDPOINT y COSMOS_KEY no configurados. La app funcionará en modo demo.'
  )
}

// Crear cliente de Cosmos DB (singleton)
const client = new CosmosClient({
  endpoint: process.env.COSMOS_ENDPOINT,
  key: process.env.COSMOS_KEY,
})

const databaseName = process.env.COSMOS_DATABASE_NAME || 'rooftop-party-db'
const containerName = process.env.COSMOS_CONTAINER_NAME || 'rsvps'

// Función para inicializar la base de datos y contenedor
async function initializeDatabase() {
  // Crear base de datos si no existe
  const { database } = await client.databases.createIfNotExists({
    id: databaseName,
  })

  // Crear contenedor si no existe
  // Usamos email como partition key para distribuir los datos
  const { container } = await database.containers.createIfNotExists({
    id: containerName,
    partitionKey: {
      paths: ['/email'],
    },
  })

  return { database, container }
}

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
    const { container } = await initializeDatabase()

    // Verificar si ya existe un RSVP con este email para este evento
    const querySpec = {
      query: 'SELECT * FROM c WHERE c.email = @email AND c.eventId = @eventId',
      parameters: [
        { name: '@email', value: rsvp.email },
        { name: '@eventId', value: rsvp.eventId },
      ],
    }

    const { resources: existingRsvps } = await container.items
      .query(querySpec)
      .fetchAll()

    if (existingRsvps.length > 0) {
      throw new Error('Ya existe un RSVP con este email para este evento')
    }

    // Crear nuevo RSVP
    const newRsvp: RSVP = {
      id: `${rsvp.eventId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      ...rsvp,
      createdAt: new Date().toISOString(),
      status: 'confirmed',
    }

    const { resource: createdRsvp } = await container.items.create(newRsvp)
    return createdRsvp
  } catch (error) {
    console.error('Error al guardar RSVP:', error)
    throw error
  }
}

// Función para obtener todos los RSVPs de un evento
export async function getRSVPsByEvent(eventId: string) {
  try {
    const { container } = await initializeDatabase()

    const querySpec = {
      query: 'SELECT * FROM c WHERE c.eventId = @eventId ORDER BY c.createdAt DESC',
      parameters: [{ name: '@eventId', value: eventId }],
    }

    const { resources: rsvps } = await container.items.query(querySpec).fetchAll()
    return rsvps
  } catch (error) {
    console.error('Error al obtener RSVPs:', error)
    throw error
  }
}

// Función para obtener estadísticas de un evento
export async function getEventStats(eventId: string) {
  try {
    const { container } = await initializeDatabase()

    const querySpec = {
      query: `
        SELECT 
          COUNT(1) as totalConfirmed,
          SUM(CASE WHEN c.status = 'confirmed' THEN 1 ELSE 0 END) as confirmed,
          SUM(CASE WHEN c.status = 'cancelled' THEN 1 ELSE 0 END) as cancelled
        FROM c 
        WHERE c.eventId = @eventId
      `,
      parameters: [{ name: '@eventId', value: eventId }],
    }

    const { resources: stats } = await container.items.query(querySpec).fetchAll()
    return stats[0] || { totalConfirmed: 0, confirmed: 0, cancelled: 0 }
  } catch (error) {
    console.error('Error al obtener estadísticas:', error)
    throw error
  }
}

export { client, databaseName, containerName }
