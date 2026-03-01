-- Add RSVP closed columns to events table
ALTER TABLE events ADD COLUMN IF NOT EXISTS rsvp_closed BOOLEAN DEFAULT false;
ALTER TABLE events ADD COLUMN IF NOT EXISTS rsvp_closed_message TEXT DEFAULT '¡Nos vemos en el próximo evento!';
