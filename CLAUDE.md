# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm start        # Run the Express server (port 3000)
node src/index.js  # Equivalent to npm start
```

No build, lint, or test pipeline is configured.

## Architecture

This is a **multi-client WhatsApp appointment booking bot** built on Express. It receives messages via Meta's webhook API, routes them to client-specific logic, and manages appointments in Google Calendar.

### Request Flow

```
Meta webhook POST /webhook
  → index.js   (extracts sender, business number, message text)
  → router.js  (maps business phone → client handler)
  → clients/steakBoutique.js  (state machine per session)
      → services/calendarService.js  (read/write Google Calendar)
      → services/whatsAppService.js  (send replies to user and owner alerts)
```

### Session State Machine (`steakBoutique.js`)

Each user conversation is tracked by phone number in an in-memory `sesiones` map with a 15-minute inactivity timeout. States flow linearly for new bookings, with shortcuts for rescheduling:

- `inicio` → show interactive buttons (agendar / reagendar / cancelar)
- `esperando_fecha` → parse date with chrono-node (es locale, `forwardDate: true`), check availability (max 2 months ahead)
- `esperando_hora` → validate against live free slots; if `sesion.reagendando` is set, skip to event creation here
- `esperando_imagen` → optional reference photo step; user can type "omitir" to skip
- `esperando_nombre` → create calendar event, send confirmation + owner alert template
- `confirmar_cancelacion` → wait for "sí"/"si", then delete event + send owner alert

Rescheduling (`reagendando`) deletes the old event immediately after finding it, then reuses `esperando_fecha` → `esperando_hora`, skipping `esperando_imagen` and `esperando_nombre`.

### Multi-client Routing (`router.js`)

`router.js` exports both `enrutarMensaje` and the `clientes` dictionary (the latter consumed by `cronManager.js` to iterate all clients). Each entry maps a business phone number to `{ logic, config: { name, calendarId, ownerPhone } }`. Only Steak Boutique is currently configured. To add a new client, add a new entry here and create a corresponding file in `clients/`.

### Google Calendar (`services/calendarService.js`)

Uses a service account. Credentials are loaded from `GOOGLE_CREDENTIALS_B64` env var (base64-encoded JSON) if set, otherwise falls back to `credentials.json` on disk (gitignored). Key functions:
- `obtenerHuecosLibres(calendarId, date)` — returns free 1-hour slots between 09:00–17:00 (fixed UTC-6 offset)
- `buscarCitaPorTelefono(calendarId, telefono)` — searches future events by phone number stored in event description
- `crearEvento / eliminarEvento` — CRUD for appointments; phone stored in description as `Teléfono: <wa_id>`
- `obtenerCitasDeManana / obtenerCitasHoy` — used by cron for daily reminders

### WhatsApp (`services/whatsAppService.js`)

Wraps the Meta Cloud API. Uses pre-approved templates for owner alerts (`alerta_nueva_cita`, `alerta_reagendar_cita`, `alerta_cancelacion_cita`) and customer reminders (`recordatorio_cita`, `recordatorio_cita_hoy`).

### Cron Jobs (`utils/cronManager.js`)

Runs daily at 8 AM CDMX. For each client, fetches today's and tomorrow's appointments and sends WhatsApp reminder templates to customers. Phone numbers are stored in the Google Calendar event description.

## Environment Variables

Required in `.env`:
```
PHONE_NUMBER_ID=           # Meta WhatsApp phone number ID
WHATSAPP_TOKEN=            # Bearer token for Meta Cloud API
CALENDAR_ID=               # Google Calendar ID for Steak Boutique
GOOGLE_CREDENTIALS_B64=    # Base64-encoded service account JSON (alternative to credentials.json)
PORT=                      # Optional, defaults to 3000
```

For local development, `credentials.json` (Google service account) can be placed at the project root instead of using `GOOGLE_CREDENTIALS_B64`. The webhook verification token is hardcoded as `steak_boutique_secreto_123` in `index.js`.
