# `src/services/` — Servicios Externos

Los servicios son la capa que habla con el mundo exterior. No saben nada de la conversación ni de los estados. Solo reciben datos, hacen una llamada a una API, y regresan un resultado.

## Posición en el flujo

```
clients/steakBoutique.js
         ↓                    ↓
📄 calendarService.js   📄 whatsAppService.js   ← ESTÁS AQUÍ
         ↓                    ↓
  Google Calendar API    Meta Cloud API
```

También son usados por `utils/cronManager.js` para los recordatorios diarios.

---

## `calendarService.js` — Google Calendar

**Responsabilidad:** Leer y escribir eventos en Google Calendar usando una cuenta de servicio (service account).

### Autenticación

Al cargar el módulo (al arrancar el servidor), crea el cliente autenticado:

```js
// Opción 1: desde variable de entorno (para producción/Docker)
const credentials = JSON.parse(Buffer.from(process.env.GOOGLE_CREDENTIALS_B64, 'base64').toString());

// Opción 2: desde archivo (para desarrollo local)
const credentials = require('../../credentials.json');
```

El objeto `calendar` ya viene listo para hacer llamadas. No necesitas autenticarte de nuevo en cada función.

---

### `obtenerHuecosLibres(calendarId, fechaStr)`

Devuelve un array de strings con los horarios disponibles en un día.

```js
const huecos = await obtenerHuecosLibres("abc@group.calendar.google.com", "2026-04-01");
// → ["09:00", "10:00", "13:00", "15:00"]
// (los que no aparecen ya tienen evento)
```

**Cómo funciona:**
1. Consulta todos los eventos de ese día entre 09:00 y 18:00 (UTC-6)
2. Extrae las horas de inicio de cada evento
3. Filtra del slot fijo `['09:00', '10:00', ..., '17:00']` los que ya están ocupados

> Los slots son de 1 hora fija. El negocio opera de 9am a 5pm (CDMX).

---

### `crearEvento(calendarId, fecha, hora, nombre, telefono)`

Crea un evento de 1 hora en el calendario. Devuelve `true` si exitoso, `false` si falló.

```js
await crearEvento(
  "abc@group.calendar.google.com",
  "2026-04-01",   // fecha en YYYY-MM-DD
  "10:00",        // hora en HH:MM
  "Jorge García", // nombre del cliente
  "524641697975"  // teléfono (se guarda en la descripción del evento)
);
```

El evento queda así en Google Calendar:
```
Título:      Cita - Jorge García
Descripción: Teléfono: 524641697975
             Agendado vía AgendaBot WhatsApp.
Color:       Azul lavanda (colorId: 1)
Recordatorio: popup 15 min antes
```

El teléfono en la descripción es clave: lo usa `buscarCitaPorTelefono` y `cronManager` para extraerlo.

---

### `buscarCitaPorTelefono(calendarId, telefono)`

Busca eventos futuros cuya descripción contenga el número de teléfono. Devuelve el primer evento encontrado o `null`.

```js
const cita = await buscarCitaPorTelefono("abc@group.calendar.google.com", "524641697975");
// → { id: "evento123", summary: "Cita - Jorge García", start: { dateTime: "..." }, ... }
// → null si no hay cita
```

Usa el parámetro `q` de la API de Google, que hace búsqueda de texto libre en título y descripción.

---

### `eliminarEvento(calendarId, eventId)`

Borra un evento. Devuelve `true` si exitoso, `false` si falló.

```js
await eliminarEvento("abc@group.calendar.google.com", "evento123");
```

Se usa en dos contextos:
- **Cancelación:** el usuario confirma que quiere cancelar
- **Reagendación:** se borra el evento viejo *antes* de pedir la nueva fecha

---

### `obtenerCitasHoy(calendarId)` y `obtenerCitasDeManana(calendarId)`

Devuelven todos los eventos del día de hoy o de mañana. Los usa `cronManager` para los recordatorios.

```js
const citas = await obtenerCitasHoy("abc@group.calendar.google.com");
// → [{ summary: "Cita - Jorge", description: "Teléfono: 52...", start: { dateTime: "..." } }, ...]
```

---

## `whatsAppService.js` — Meta Cloud API

**Responsabilidad:** Enviar mensajes de WhatsApp. Es una capa delgada sobre la API de Meta. No tiene estado, no sabe de sesiones. Recibe datos → hace POST → listo.

### Variables de entorno necesarias

```
WHATSAPP_TOKEN=    Token Bearer de Meta
PHONE_NUMBER_ID=   ID del número de WhatsApp en Meta
```

Ambas se limpian de comillas/punto y coma al cargar el módulo (problemas comunes en `.env`).

---

### `enviarMensajeWhatsApp(numero, texto)`

Mensaje de texto plano.

```js
await enviarMensajeWhatsApp("524641697975", "¡Hola! ¿En qué te puedo ayudar?");
```

---

### `enviarBotonesWhatsApp(numero, texto, botones)`

Mensaje interactivo con hasta 3 botones. El usuario pulsa un botón y Meta manda el `id` del botón como si fuera un mensaje de texto.

```js
await enviarBotonesWhatsApp("524641697975", "¿Qué deseas hacer?", [
  { id: "btn_agendar",   title: "📅 Agendar" },
  { id: "btn_reagendar", title: "🔄 Reagendar" },
  { id: "btn_cancelar",  title: "❌ Cancelar" },
]);

// Cuando el usuario pulsa "Agendar", Meta manda al webhook:
// mensaje.interactive.button_reply.id = "btn_agendar"
// → index.js lo extrae como texto = "btn_agendar"
// → steakBoutique.js lo detecta con: texto === "btn_agendar"
```

---

### `enviarTemplate(numero, templateName, variables)`

Envía una plantilla pre-aprobada por Meta. Las plantillas tienen variables `{{1}}`, `{{2}}`, etc. que se llenan con el array `variables`.

```js
// Template "alerta_nueva_cita" tiene en su cuerpo algo como:
// "Nueva cita de {{1}} ({{2}}) para el {{3}}"
await enviarTemplate("524641697975", "alerta_nueva_cita", [
  "Jorge García",      // {{1}}
  "524641697975",      // {{2}}
  "2026-04-01 / 10:00 hrs"  // {{3}}
]);
```

**Templates usados en el proyecto:**

| Template                   | Quién lo recibe  | Cuándo                         |
|---------------------------|------------------|--------------------------------|
| `alerta_nueva_cita`       | Dueño del negocio | Usuario agenda nueva cita      |
| `alerta_reagendar_cita`   | Dueño del negocio | Usuario reagenda               |
| `alerta_cancelacion_cita` | Dueño del negocio | Usuario cancela                |
| `recordatorio_cita`       | Cliente           | Un día antes (cron 8am)        |
| `recordatorio_cita_hoy`   | Cliente           | El mismo día (cron 8am)        |

---

### `enviarTemplateMultimedia(numero, templateName, variables, mediaId)`

Como `enviarTemplate`, pero el template tiene un header de imagen. El `mediaId` es el ID que Meta asigna cuando el usuario manda una foto.

```js
await enviarTemplateMultimedia(
  "524641697975",
  "alerta_cita_nueva_foto",
  ["Jorge García", "524641697975", "2026-04-01 / 10:00 hrs"],
  "media_id_de_meta_12345"
);
```

> Este template (`alerta_cita_nueva_foto`) debe estar creado y aprobado en Meta Business Manager con un header de tipo imagen.
