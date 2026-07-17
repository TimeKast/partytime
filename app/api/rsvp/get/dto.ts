interface RsvpGetDtoSource {
  id: string
  name: string
  email: string
  phone: string
  plusOne: boolean | null
  plusOneName: string | null
  status: string
  eventId: string
}

export function buildRsvpGetDto(rsvp: RsvpGetDtoSource) {
  return {
    id: rsvp.id,
    name: rsvp.name,
    email: rsvp.email,
    phone: rsvp.phone,
    plusOne: rsvp.plusOne,
    plusOneName: rsvp.plusOneName,
    status: rsvp.status,
    eventId: rsvp.eventId,
  }
}
