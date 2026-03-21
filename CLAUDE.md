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

Each user conversation is tracked by phone number in an in-memory `sesiones` map with a 15-minute inactivity timeout. States:

- `inicio` → present menu (agendar / reagendar / cancelar)
- `esperando_fecha` → parse date with chrono-node, check availability
- `esperando_hora` → validate slot, check calendar conflicts
- `esperando_nombre` → create event, send confirmation + owner alert template
- `reagendando` → find existing event, reschedule
- `confirmar_cancelacion` → delete event, send confirmation + owner alert

### Multi-client Routing (`router.js`)

`router.js` exports a dictionary mapping business phone numbers to `{ calendarId, logic, ownerPhone }`. Only Steak Boutique is currently configured. To add a new client, add a new entry here and create a corresponding file in `clients/`.

### Google Calendar (`services/calendarService.js`)

Uses a service account (`credentials.json` + `token.json`, gitignored). Key functions:
- `obtenerHuecosLibres(calendarId, date)` — returns free 1-hour slots between 09:00–17:00
- `crearEvento / eliminarEvento` — CRUD for appointments
- `obtenerCitasDeManana / obtenerCitasHoy` — used by cron for daily reminders

### WhatsApp (`services/whatsAppService.js`)

Wraps the Meta Cloud API. Uses pre-approved templates for owner alerts (`alerta_nueva_cita`, `alerta_reagendar_cita`, `alerta_cancelacion_cita`) and customer reminders (`recordatorio_cita`, `recordatorio_cita_hoy`).

### Cron Jobs (`utils/cronManager.js`)

Runs daily at 8 AM CDMX. For each client, fetches today's and tomorrow's appointments and sends WhatsApp reminder templates to customers. Phone numbers are stored in the Google Calendar event description.

## Environment Variables

Required in `.env`:
```
PHONE_NUMBER_ID=      # Meta WhatsApp phone number ID
WHATSAPP_TOKEN=       # Bearer token for Meta Cloud API
CALENDAR_ID=          # Google Calendar ID for the client
PORT=                 # Optional, defaults to 3000
```

`credentials.json` (Google service account) and `token.json` must be present locally but are gitignored.
