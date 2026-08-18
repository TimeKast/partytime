/**
 * RSVP email verification template (ISSUE-007, EPIC-003). Mirrors the
 * dark/gold visual language of lib/email-template.ts and the structure of
 * lib/password-reset-email.ts.
 */

export function buildVerificationEmailSubject(eventTitle: string): string {
    return `Confirma tu asistencia a ${eventTitle}`
}

export interface VerificationEmailProps {
    name: string
    eventTitle: string
    verificationUrl: string
}

function escapeHtml(value: string): string {
    return value.replace(/[&<>"']/g, character => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
    })[character]!)
}

export function generateVerificationEmail({ name, eventTitle, verificationUrl }: VerificationEmailProps): {
    html: string
    text: string
} {
    // Same encoding-artifact cleanup as the cancel-link/reset-link idiom in
    // lib/email-template.ts / lib/password-reset-email.ts: strip a leading
    // "=" and surrounding whitespace.
    const cleanVerificationUrl = verificationUrl.replace(/^=+/, '').trim()
    const safeName = escapeHtml(name)
    const safeEventTitle = escapeHtml(eventTitle)
    const safeVerificationUrl = escapeHtml(cleanVerificationUrl)
    const subject = buildVerificationEmailSubject(eventTitle)

    const html = `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light dark">
  <meta name="supported-color-schemes" content="light dark">
  <title>${subject}</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Arial, sans-serif; background-color: #0f0f0f;">
  <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #0f0f0f;">
    <tr>
      <td align="center" style="padding: 48px 20px;">
        <table role="presentation" style="width: 580px; max-width: 100%; border-collapse: collapse; background-color: #1a1a1f; border-radius: 16px; overflow: hidden; border: 1px solid #2a2a30;">
          <tr>
            <td style="background: linear-gradient(90deg, #fbbf24 0%, #f59e0b 50%, #fbbf24 100%); height: 4px;"></td>
          </tr>
          <tr>
            <td style="padding: 40px 36px;">
              <p style="margin: 0 0 16px 0; font-size: 20px; color: #ffffff; font-weight: 300;">
                ¡Hola <strong>${safeName}</strong>!
              </p>
              <p style="margin: 0 0 24px 0; font-size: 15px; line-height: 1.7; color: #ccccdd;">
                Recibimos tu RSVP para <strong>${safeEventTitle}</strong>. Para confirmar tu
                asistencia, primero necesitamos verificar que este correo es tuyo.
                Haz clic en el botón para confirmar.
              </p>
              <p style="margin: 0 0 32px 0; font-size: 14px; line-height: 1.6; color: #999999;">
                Este enlace expira en 24 horas y solo puede usarse una vez. Si no
                solicitaste este RSVP, puedes ignorar este correo.
              </p>
              <table role="presentation" style="width: 100%; border-collapse: collapse; margin: 0 0 20px 0;">
                <tr>
                  <td align="center" style="padding: 0;">
                    <a href="${safeVerificationUrl}" target="_blank" style="background: linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%);border:none;border-radius: 8px;color:#000000;display:inline-block;font-family:'Segoe UI',Arial,sans-serif;font-size:15px;font-weight:600;line-height:52px;text-align:center;text-decoration:none;width:260px;-webkit-text-size-adjust:none;letter-spacing: 0.5px;">Confirmar Asistencia</a>
                  </td>
                </tr>
              </table>
              <p style="margin: 0; font-size: 11px; line-height: 1.6; color: #777788; text-align: center;">
                O copia y pega este enlace en tu navegador:<br>
                <span style="color:#999999;word-break:break-all;">${safeVerificationUrl}</span>
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

    const text = [
        `¡Hola ${name}!`,
        '',
        `Recibimos tu RSVP para ${eventTitle}. Para confirmar tu asistencia, primero`,
        'necesitamos verificar que este correo es tuyo. Este enlace expira en 24',
        'horas y solo puede usarse una vez:',
        '',
        cleanVerificationUrl,
        '',
        'Si no solicitaste este RSVP, puedes ignorar este correo.',
    ].join('\n')

    return { html, text }
}
