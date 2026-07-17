export interface CancelEventDetail {
  label: string
  value: string
}

interface CancelEventDetailSource {
  date?: string | null
  time?: string | null
  location?: string | null
}

export function getCancelEventDetails(event: CancelEventDetailSource): CancelEventDetail[] {
  return [
    { label: 'Fecha', value: event.date },
    { label: 'Hora', value: event.time },
    { label: 'Ubicación', value: event.location },
  ].flatMap(detail => {
    const value = detail.value?.trim()
    return value ? [{ label: detail.label, value }] : []
  })
}
