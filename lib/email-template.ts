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

  return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${isCancelled ? 'Te extrañamos' : (isReminder ? 'Recordatorio' : 'Confirmación')} RSVP - ${event.title}</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Arial', sans-serif; background-color: #f4f4f4;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td align="center" style="padding: 40px 0;">
        <table role="presentation" style="width: 600px; max-width: 100%; border-collapse: collapse; background-color: #ffffff; border-radius: 10px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          
          <!-- Header con colores del evento -->
          <tr>
            <td style="background: linear-gradient(135deg, ${theme.primaryColor} 0%, ${theme.backgroundColor || '#1a0033'} 100%); padding: 40px 30px; text-align: center;">
              ${headerBadge ? `
              <p style="margin: 0 0 10px 0; color: ${isCancelled ? '#fbbf24' : '#fbbf24'}; font-size: 14px; font-weight: 700; text-transform: uppercase; letter-spacing: 2px;">
                ${headerBadge}
              </p>
              ` : ''}
              <h1 style="margin: 0; color: #ffffff; font-size: 32px; font-weight: 900; text-transform: uppercase; letter-spacing: 2px; text-shadow: 2px 2px 4px rgba(0,0,0,0.3);">
                ${event.title}
              </h1>
              <h2 style="margin: 10px 0 0 0; color: ${theme.secondaryColor}; font-size: 24px; font-weight: 700; text-transform: uppercase; text-shadow: 1px 1px 2px rgba(0,0,0,0.2);">
                ${event.subtitle}
              </h2>
            </td>
          </tr>

          <!-- Contenido principal -->
          <tr>
            <td style="padding: 40px 30px;">
              <p style="margin: 0 0 20px 0; font-size: 18px; color: #333333;">
                ${greeting}
              </p>
              
              <p style="margin: 0 0 10px 0; font-size: 16px; line-height: 1.6; color: #555555;">
                ${mainText}
              </p>
              
              <p style="margin: 0 0 30px 0; font-size: 16px; line-height: 1.6; color: #555555;">
                ${closingText}
              </p>

              <!-- Detalles del evento -->
              <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #ffffff; border: 1px solid #e5e7eb; border-radius: 8px; margin-bottom: 30px;">
                <tr>
                  <td style="padding: 30px;">
                    
                    <!-- Fecha -->
                    <table role="presentation" style="width: 100%; border-collapse: collapse; margin-bottom: 18px;">
                      <tr>
                        <td style="width: 24px; vertical-align: middle; padding-right: 16px; text-align: center;">
                          <span style="font-size: 18px; color: ${theme.primaryColor}; font-weight: 700;">●</span>
                        </td>
                        <td style="vertical-align: middle; border-bottom: 1px solid #f3f4f6; padding-bottom: 18px;">
                          <p style="margin: 0 0 4px 0; font-size: 12px; color: #9ca3af; font-weight: 600; text-transform: uppercase; letter-spacing: 1px;">Fecha</p>
                          <p style="margin: 0; font-size: 17px; color: #1f2937; font-weight: 600;">${event.date}</p>
                        </td>
                      </tr>
                    </table>

                    <!-- Hora -->
                    <table role="presentation" style="width: 100%; border-collapse: collapse; margin-bottom: 18px;">
                      <tr>
                        <td style="width: 24px; vertical-align: middle; padding-right: 16px; text-align: center;">
                          <span style="font-size: 18px; color: ${theme.primaryColor}; font-weight: 700;">●</span>
                        </td>
                        <td style="vertical-align: middle; border-bottom: 1px solid #f3f4f6; padding-bottom: 18px;">
                          <p style="margin: 0 0 4px 0; font-size: 12px; color: #9ca3af; font-weight: 600; text-transform: uppercase; letter-spacing: 1px;">Hora</p>
                          <p style="margin: 0; font-size: 17px; color: #1f2937; font-weight: 600;">${event.time}</p>
                        </td>
                      </tr>
                    </table>

                    <!-- Lugar -->
                    <table role="presentation" style="width: 100%; border-collapse: collapse; margin-bottom: 18px;">
                      <tr>
                        <td style="width: 24px; vertical-align: middle; padding-right: 16px; text-align: center;">
                          <span style="font-size: 18px; color: ${theme.primaryColor}; font-weight: 700;">●</span>
                        </td>
                        <td style="vertical-align: middle; border-bottom: 1px solid #f3f4f6; padding-bottom: 18px;">
                          <p style="margin: 0 0 4px 0; font-size: 12px; color: #9ca3af; font-weight: 600; text-transform: uppercase; letter-spacing: 1px;">Lugar</p>
                          <p style="margin: 0; font-size: 17px; color: #1f2937; font-weight: 600;">${event.location}</p>
                        </td>
                      </tr>
                    </table>

                    ${event.price ? `
                    <!-- Cuota -->
                    <table role="presentation" style="width: 100%; border-collapse: collapse; margin-bottom: 18px;">
                      <tr>
                        <td style="width: 24px; vertical-align: middle; padding-right: 16px; text-align: center;">
                          <span style="font-size: 18px; color: #047857; font-weight: 700;">●</span>
                        </td>
                        <td style="vertical-align: middle; border-bottom: 1px solid #f3f4f6; padding-bottom: 18px;">
                          <p style="margin: 0 0 4px 0; font-size: 12px; color: #9ca3af; font-weight: 600; text-transform: uppercase; letter-spacing: 1px;">Cuota de Recuperación</p>
                          <p style="margin: 0; font-size: 17px; color: #047857; font-weight: 700;">${event.price}</p>
                        </td>
                      </tr>
                    </table>
                    ` : ''}

                    ${plusOne ? `
                    <!-- Acompañante -->
                    <table role="presentation" style="width: 100%; border-collapse: collapse; margin-bottom: 18px;">
                      <tr>
                        <td style="width: 24px; vertical-align: middle; padding-right: 16px; text-align: center;">
                          <span style="font-size: 18px; color: #667eea; font-weight: 700;">●</span>
                        </td>
                        <td style="vertical-align: middle; border-bottom: 1px solid #f3f4f6; padding-bottom: 18px;">
                          <p style="margin: 0 0 4px 0; font-size: 12px; color: #9ca3af; font-weight: 600; text-transform: uppercase; letter-spacing: 1px;">Acompañante</p>
                          <p style="margin: 0; font-size: 17px; color: #667eea; font-weight: 600;">+1 Confirmado</p>
                        </td>
                      </tr>
                    </table>
                    ` : ''}

                    <!-- Detalles adicionales -->
                    <div style="margin-top: 24px; padding-top: 24px; border-top: 2px solid #f3f4f6;">
                      <p style="margin: 0; font-size: 15px; color: #4b5563; line-height: 1.7; font-weight: 500;">
                        ${event.details.split('\n').join('<br>')}
                      </p>
                    </div>

                  </td>
                </tr>
              </table>

              <p style="margin: 0 0 30px 0; font-size: 14px; line-height: 1.6; color: #777777;">
                ${isCancelled
      ? 'Si decides acompañarnos, solo haz clic abajo para reconfirmar tu asistencia. Si no puedes, no hay problema - quedamos igual de bien. 😊'
      : 'Si necesitas modificar tus datos o cancelar tu asistencia, haz clic en el botón de abajo:'}
              </p>

              <!-- Botón de cancelación o reconfirmación -->
              <table role="presentation" style="width: 100%; border-collapse: collapse; margin: 0 0 20px 0;">
                <tr>
                  <td align="center" style="padding: 0;">
                    <a href="${cleanCancelUrl}" target="_blank" style="background-color:${isCancelled ? '#10b981' : '#667eea'};border:2px solid ${isCancelled ? '#10b981' : '#667eea'};border-radius:6px;color:#ffffff;display:inline-block;font-family:Arial,sans-serif;font-size:16px;font-weight:600;line-height:50px;text-align:center;text-decoration:none;width:280px;-webkit-text-size-adjust:none;">${isCancelled ? 'Reconfirmar Asistencia ✨' : 'Modificar o Cancelar'}</a>
                  </td>
                </tr>
              </table>

              <p style="margin: 0 0 20px 0; font-size: 12px; line-height: 1.5; color: #9ca3af; text-align: center; font-style: italic;">
                ${isCancelled
      ? '✨ Recuerda que puedes cambiar de opinión las veces que necesites'
      : '💡 Si cancelas, puedes usar este mismo enlace para reconfirmar tu asistencia más tarde'}
              </p>
              
              <p style="margin: 0 0 20px 0; font-size: 12px; line-height: 1.6; color: #999999; text-align: center;">
                O copia y pega este enlace en tu navegador:<br>
                <span style="color:#667eea;word-break:break-all;font-size:11px;">${cleanCancelUrl}</span>
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f9f9f9; padding: 30px; text-align: center; border-top: 1px solid #eeeeee;">
              <p style="margin: 0 0 10px 0; font-size: 14px; color: #999999;">
                ¿Preguntas? Contáctanos: ${contactEmail}
              </p>
              <p style="margin: 0; font-size: 12px; color: #aaaaaa;">
                Este email fue enviado porque confirmaste tu asistencia a ${event.title}
              </p>
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
