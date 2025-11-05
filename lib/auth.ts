import { NextRequest } from 'next/server'

export function validateAdminAuth(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization')
  
  if (!authHeader || !authHeader.startsWith('Basic ')) {
    return false
  }

  try {
    const base64Credentials = authHeader.split(' ')[1]
    const credentials = Buffer.from(base64Credentials, 'base64').toString('utf-8')
    const [username, password] = credentials.split(':')

    const validUsername = process.env.ADMIN_USERNAME
    const validPassword = process.env.ADMIN_PASSWORD

    if (!validUsername || !validPassword) {
      console.warn('⚠️  ADMIN_USERNAME o ADMIN_PASSWORD no configurados')
      return false
    }

    return username === validUsername && password === validPassword
  } catch (error) {
    console.error('Error validando credenciales admin:', error)
    return false
  }
}

export function getUnauthorizedResponse() {
  // NO incluimos WWW-Authenticate para evitar que el navegador
  // muestre el popup de autenticación cuando se hace fetch desde JS
  return new Response(
    JSON.stringify({ error: 'No autorizado' }),
    {
      status: 401,
      headers: {
        'Content-Type': 'application/json'
      }
    }
  )
}
