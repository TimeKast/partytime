import { NextRequest } from 'next/server'

export function validateAdminAuth(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization')
  
  console.log('🔍 Auth header recibido:', authHeader ? 'Presente' : 'Ausente')
  console.log('🔍 Auth header starts with Basic:', authHeader?.startsWith('Basic '))
  
  if (!authHeader || !authHeader.startsWith('Basic ')) {
    console.log('❌ Auth header inválido o ausente')
    return false
  }

  try {
    const base64Credentials = authHeader.split(' ')[1]
    console.log('🔍 Base64 credentials (primeros 20):', base64Credentials?.substring(0, 20))
    
    const credentials = Buffer.from(base64Credentials, 'base64').toString('utf-8')
    const [username, password] = credentials.split(':')

    console.log('🔍 Username recibido:', username)
    console.log('🔍 Password length:', password?.length)

    const validUsername = process.env.ADMIN_USERNAME
    const validPassword = process.env.ADMIN_PASSWORD

    console.log('🔍 Valid username configurado:', validUsername)
    console.log('🔍 Valid password length:', validPassword?.length)

    if (!validUsername || !validPassword) {
      console.warn('⚠️  ADMIN_USERNAME o ADMIN_PASSWORD no configurados')
      return false
    }

    const isValid = username === validUsername && password === validPassword
    console.log('🔍 Autenticación válida:', isValid)
    
    return isValid
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
