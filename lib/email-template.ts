/**
 * Email template generator for RSVP confirmations, reminders, and re-invitations
 * H-005 FIX: Now accepts dynamic event data instead of using static event-config.json
 */

import eventConfig from '../event-config.json'

export interface EventData {
  title: string
  subtitle: string
  date: string
  time: string
  location: string
  details: string
  price?: string | null
  backgroundImageUrl?: string // URL de la imagen de fondo del evento
  theme: {
    primaryColor: string
    secondaryColor: string
    accentColor: string
    backgroundColor?: string
  }
  contact?: {
    hostEmail?: string
  }
}

interface EmailTemplateProps {
  name: string
  plusOne: boolean
  cancelUrl: string
  isReminder?: boolean // true = recordatorio, false/undefined = confirmación
  isCancelled?: boolean // true = re-invitación a quien canceló
  eventData?: EventData // H-005 FIX: Optional dynamic event data
}

/**
 * Generate HTML email for confirmations, reminders, and re-invitations
 * @param props - Email template properties including optional dynamic event data
 */
export function generateConfirmationEmail({
  name,
  plusOne,
  cancelUrl,
  isReminder = false,
  isCancelled = false,
  eventData
}: EmailTemplateProps): string {
  // H-005 FIX: Use dynamic event data if provided, fallback to static config
  const event = eventData || {
    title: eventConfig.event.title,
    subtitle: eventConfig.event.subtitle,
    date: eventConfig.event.date,
    time: eventConfig.event.time,
    location: eventConfig.event.location,
    details: eventConfig.event.details,
    price: eventConfig.event.price,
    theme: eventConfig.theme,
    contact: eventConfig.contact
  }

  const theme = event.theme || eventConfig.theme
  const contactEmail = event.contact?.hostEmail || eventConfig.contact.hostEmail

  // Limpiar cualquier = al inicio de la URL (bug de encoding)
  const cleanCancelUrl = cancelUrl.replace(/^=+/, '').trim()

  // Textos según tipo de email
  let greeting, mainText, closingText, headerBadge

  if (isCancelled) {
    // Email especial para quien canceló - tono elegante y no invasivo
    greeting = `¡Hola <strong>${name}</strong>! 👋`
    mainText = `Sabemos que habías cancelado tu asistencia a <strong>${event.title}</strong>, pero queríamos recordarte que siempre eres bienvenid${name.endsWith('a') ? 'a' : 'o'} por si tus planes cambian. Si tienes la oportunidad de acompañarnos, nos encantaría verte ahí.`
    closingText = `Sin presión, pero las puertas están abiertas para ti. 🌟`
    headerBadge = 'Te extrañamos'
  } else if (isReminder) {
    greeting = `¡Hola <strong>${name}</strong>! 👋`
    mainText = `Te recordamos que tu asistencia está confirmada para <strong>${event.title}</strong>.`
    closingText = `¡Te esperamos! 🎊`
    headerBadge = 'Recordatorio'
  } else {
    greeting = `¡Hola <strong>${name}</strong>!`
    mainText = `Tu asistencia ha sido confirmada para <strong>${event.title}</strong>.`
    closingText = `¡Nos vemos ahí! 🎉`
    headerBadge = null
  }

  // Construir URL completa de la imagen de fondo
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  const bgImageUrl = event.backgroundImageUrl 
    ? (event.backgroundImageUrl.startsWith('http') ? event.backgroundImageUrl : `${baseUrl}${event.backgroundImageUrl}`)
    : `${baseUrl}/background.png`

  return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light dark">
  <meta name="supported-color-schemes" content="light dark">
  <meta name="x-apple-disable-message-reformatting">
  <title>${isCancelled ? 'Te extrañamos' : (isReminder ? 'Recordatorio' : 'Confirmación')} RSVP - ${event.title}</title>
  <!--[if mso]>
  <style type="text/css">
    body, table, td, p, span, a { font-family: Arial, sans-serif !important; }
  </style>
  <![endif]-->
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', 'Arial', sans-serif; background-color: #0f0f0f;">
  <!-- Wrapper exterior con imagen de fondo del evento -->
  <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #0f0f0f;">
    <tr>
      <td style="background-image: url('${bgImageUrl}'); background-size: cover; background-position: center top; background-repeat: no-repeat;">
        <!-- Overlay oscuro con fade para legibilidad -->
        <table role="presentation" style="width: 100%; border-collapse: collapse; background: linear-gradient(180deg, rgba(15,15,15,0.75) 0%, rgba(15,15,15,0.92) 50%, rgba(15,15,15,0.98) 100%);">
          <tr>
            <td align="center" style="padding: 48px 20px;">
              
              <!-- Container principal -->
              <table role="presentation" style="width: 580px; max-width: 100%; border-collapse: collapse;">
                
                <!-- Header elegante y neutro -->
                <tr>
                  <td style="padding: 0 0 32px 0; text-align: center;">
                    ${headerBadge ? `
                    <table role="presentation" style="margin: 0 auto 16px auto; border-collapse: collapse;">
                      <tr>
                        <td style="background-color: #3d3520; border-radius: 20px; padding: 6px 16px;">
                          <p style="margin: 0; color: #fbbf24; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 2px;">
                            ${headerBadge}
                          </p>
                        </td>
                      </tr>
                    </table>
                    ` : ''}
                    <h1 style="margin: 0; color: #fbbf24; font-size: 36px; font-weight: 700; letter-spacing: 4px; text-transform: uppercase;">
                      ${event.title}
                    </h1>
                    <h2 style="margin: 8px 0 0 0; color: #f59e0b; font-size: 18px; font-weight: 600; letter-spacing: 3px; text-transform: uppercase;">
                      ${event.subtitle}
                    </h2>
                  </td>
                </tr>

                <!-- Card principal del contenido -->
                <tr>
                  <td>
                    <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #1a1a1f; border-radius: 16px; overflow: hidden; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5); border: 1px solid #2a2a30;">
                      
                      <!-- Barra superior decorativa sutil -->
                      <tr>
                        <td style="background: linear-gradient(90deg, #fbbf24 0%, #f59e0b 50%, #fbbf24 100%); height: 4px;"></td>
                      </tr>

                      <!-- Contenido principal -->
                      <tr>
                        <td style="padding: 40px 36px;">
                          <p style="margin: 0 0 16px 0; font-size: 20px; color: #ffffff; font-weight: 300;">
                            ${greeting}
                          </p>
                          
                          <p style="margin: 0 0 8px 0; font-size: 15px; line-height: 1.7; color: #ccccdd;">
                            ${mainText}
                          </p>
                          
                          <p style="margin: 0 0 32px 0; font-size: 15px; line-height: 1.7; color: #ccccdd;">
                            ${closingText}
                          </p>

                          <!-- Detalles del evento en card interna -->
                          <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #252530; border-radius: 12px; margin-bottom: 32px; border: 1px solid #333340;">
                            <tr>
                              <td style="padding: 28px;">
                                
                                <!-- Fecha -->
                                <table role="presentation" style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
                                  <tr>
                                    <td style="width: 40px; vertical-align: top; padding-right: 16px;">
                                      <table role="presentation" style="border-collapse: collapse;">
                                        <tr>
                                          <td style="background-color: #333340; border-radius: 8px; width: 40px; height: 40px; text-align: center; vertical-align: middle;">
                                            <span style="font-size: 18px;">📅</span>
                                          </td>
                                        </tr>
                                      </table>
                                    </td>
                                    <td style="vertical-align: middle; border-bottom: 1px solid #333340; padding-bottom: 20px;">
                                      <p style="margin: 0 0 2px 0; font-size: 11px; color: #888899; font-weight: 500; text-transform: uppercase; letter-spacing: 1px;">Fecha</p>
                                      <p style="margin: 0; font-size: 16px; color: #ffffff; font-weight: 600;">${event.date}</p>
                                    </td>
                                  </tr>
                                </table>

                                <!-- Hora -->
                                <table role="presentation" style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
                                  <tr>
                                    <td style="width: 40px; vertical-align: top; padding-right: 16px;">
                                      <table role="presentation" style="border-collapse: collapse;">
                                        <tr>
                                          <td style="background-color: #333340; border-radius: 8px; width: 40px; height: 40px; text-align: center; vertical-align: middle;">
                                            <span style="font-size: 18px;">⏰</span>
                                          </td>
                                        </tr>
                                      </table>
                                    </td>
                                    <td style="vertical-align: middle; border-bottom: 1px solid #333340; padding-bottom: 20px;">
                                      <p style="margin: 0 0 2px 0; font-size: 11px; color: #888899; font-weight: 500; text-transform: uppercase; letter-spacing: 1px;">Hora</p>
                                      <p style="margin: 0; font-size: 16px; color: #ffffff; font-weight: 600;">${event.time}</p>
                                    </td>
                                  </tr>
                                </table>

                                <!-- Lugar -->
                                <table role="presentation" style="width: 100%; border-collapse: collapse; margin-bottom: ${event.price || plusOne ? '20px' : '0'};">
                                  <tr>
                                    <td style="width: 40px; vertical-align: top; padding-right: 16px;">
                                      <table role="presentation" style="border-collapse: collapse;">
                                        <tr>
                                          <td style="background-color: #333340; border-radius: 8px; width: 40px; height: 40px; text-align: center; vertical-align: middle;">
                                            <span style="font-size: 18px;">📍</span>
                                          </td>
                                        </tr>
                                      </table>
                                    </td>
                                    <td style="vertical-align: middle; ${event.price || plusOne ? 'border-bottom: 1px solid #333340; padding-bottom: 20px;' : ''}">
                                      <p style="margin: 0 0 2px 0; font-size: 11px; color: #888899; font-weight: 500; text-transform: uppercase; letter-spacing: 1px;">Lugar</p>
                                      <p style="margin: 0; font-size: 16px; color: #ffffff; font-weight: 600;">${event.location}</p>
                                    </td>
                                  </tr>
                                </table>

                                ${event.price ? `
                                <!-- Cuota -->
                                <table role="presentation" style="width: 100%; border-collapse: collapse; margin-bottom: ${plusOne ? '20px' : '0'};">
                                  <tr>
                                    <td style="width: 40px; vertical-align: top; padding-right: 16px;">
                                      <table role="presentation" style="border-collapse: collapse;">
                                        <tr>
                                          <td style="background: #065f46; border-radius: 8px; width: 40px; height: 40px; text-align: center; vertical-align: middle;">
                                            <span style="font-size: 18px; color: #ffffff;">💰</span>
                                          </td>
                                        </tr>
                                      </table>
                                    </td>
                                    <td style="vertical-align: middle; ${plusOne ? 'border-bottom: 1px solid #333340; padding-bottom: 20px;' : ''}">
                                      <p style="margin: 0 0 2px 0; font-size: 11px; color: #888899; font-weight: 500; text-transform: uppercase; letter-spacing: 1px;">Cuota de Recuperación</p>
                                      <p style="margin: 0; font-size: 16px; color: #34d399; font-weight: 700;">${event.price}</p>
                                    </td>
                                  </tr>
                                </table>
                                ` : ''}

                                ${plusOne ? `
                                <!-- Acompañante -->
                                <table role="presentation" style="width: 100%; border-collapse: collapse;">
                                  <tr>
                                    <td style="width: 40px; vertical-align: top; padding-right: 16px;">
                                      <table role="presentation" style="border-collapse: collapse;">
                                        <tr>
                                          <td style="background: #4f46e5; border-radius: 8px; width: 40px; height: 40px; text-align: center; vertical-align: middle;">
                                            <span style="font-size: 18px; color: #ffffff;">👥</span>
                                          </td>
                                        </tr>
                                      </table>
                                    </td>
                                    <td style="vertical-align: middle;">
                                      <p style="margin: 0 0 2px 0; font-size: 11px; color: #888899; font-weight: 500; text-transform: uppercase; letter-spacing: 1px;">Acompañante</p>
                                      <p style="margin: 0; font-size: 16px; color: #a78bfa; font-weight: 600;">+1 Confirmado</p>
                                    </td>
                                  </tr>
                                </table>
                                ` : ''}

                              </td>
                            </tr>
                          </table>

                          <!-- Detalles adicionales -->
                          <table role="presentation" style="width: 100%; border-collapse: collapse; margin-bottom: 32px;">
                            <tr>
                              <td style="background-color: #252530; border-left: 3px solid #fbbf24; border-radius: 0 8px 8px 0; padding: 20px 24px;">
                                <p style="margin: 0; font-size: 14px; color: #bbbbcc; line-height: 1.8;">
                                  ${event.details.split('\n').join('<br>')}
                                </p>
                              </td>
                            </tr>
                          </table>

                          <p style="margin: 0 0 24px 0; font-size: 14px; line-height: 1.6; color: #999999; text-align: center;">
                            ${isCancelled
      ? 'Si decides acompañarnos, solo haz clic abajo para reconfirmar tu asistencia.<br>Si no puedes, no hay problema - quedamos igual de bien. 😊'
      : 'Si necesitas modificar tus datos o cancelar tu asistencia:'}
                          </p>

                          <!-- Botón de acción -->
                          <table role="presentation" style="width: 100%; border-collapse: collapse; margin: 0 0 20px 0;">
                            <tr>
                              <td align="center" style="padding: 0;">
                                <a href="${cleanCancelUrl}" target="_blank" style="background: ${isCancelled ? 'linear-gradient(135deg, #059669 0%, #047857 100%)' : 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)'};border:none;border-radius: 8px;color:${isCancelled ? '#ffffff' : '#000000'};display:inline-block;font-family:'Segoe UI',Arial,sans-serif;font-size:15px;font-weight:600;line-height:52px;text-align:center;text-decoration:none;width:260px;-webkit-text-size-adjust:none;letter-spacing: 0.5px;">${isCancelled ? 'Reconfirmar Asistencia ✨' : 'Modificar o Cancelar'}</a>
                              </td>
                            </tr>
                          </table>

                          <p style="margin: 0 0 16px 0; font-size: 12px; line-height: 1.5; color: #888899; text-align: center;">
                            ${isCancelled
      ? '✨ Recuerda que puedes cambiar de opinión las veces que necesites'
      : '💡 Si cancelas, puedes usar este mismo enlace para reconfirmar después'}
                          </p>
                          
                          <p style="margin: 0; font-size: 11px; line-height: 1.6; color: #777788; text-align: center;">
                            O copia y pega este enlace en tu navegador:<br>
                            <span style="color:#999999;word-break:break-all;">${cleanCancelUrl}</span>
                          </p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <!-- Footer -->
                <tr>
                  <td style="padding: 32px 20px; text-align: center;">
                    <p style="margin: 0 0 8px 0; font-size: 13px; color: #d4a853;">
                      ¿Preguntas? Contáctanos: <span style="color: #fbbf24;">${contactEmail}</span>
                    </p>
                    <p style="margin: 0; font-size: 11px; color: #b8944a;">
                      Este email fue enviado porque confirmaste tu asistencia a ${event.title}
                    </p>
                  </td>
                </tr>

              </table>
              
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim()
}
