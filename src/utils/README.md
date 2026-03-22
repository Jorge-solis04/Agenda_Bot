# `src/utils/` — Utilidades

Funciones de apoyo que no pertenecen a ninguna capa específica pero son usadas por múltiples módulos.

---

## `cronManager.js` — Recordatorios Automáticos

**Responsabilidad:** Programar y ejecutar tareas automáticas diarias. Actualmente: enviar recordatorios de citas a los clientes por WhatsApp.

### Posición en el flujo

Este módulo es paralelo al flujo principal (no forma parte de la cadena webhook → router → client). Se activa por tiempo, no por mensajes.

```
src/index.js  →  iniciarCronJobs()   ← SE ACTIVA AL ARRANCAR
                       ↓
              Cada día a las 8:00 AM CDMX
                       ↓
          calendarService (leer citas de hoy y mañana)
                       ↓
          whatsAppService (enviar template al cliente)
```

---

### `iniciarCronJobs()`

Se llama una sola vez al arrancar el servidor (`index.js`). Registra un cron por cada cliente en `router.js`.

```js
// Expresión cron: "0 8 * * *"
// Significado:    minuto=0, hora=8, cualquier día, cualquier mes, cualquier día de semana
// → Se ejecuta a las 08:00 AM todos los días

cron.schedule('0 8 * * *', async () => {
  // 1. Busca las citas de hoy → envía "recordatorio_cita_hoy"
  // 2. Busca las citas de mañana → envía "recordatorio_cita"
}, { timezone: "America/Mexico_City" });
```

**Importante:** El loop itera sobre `clientes` importado de `router.js`. Si agregas un cliente nuevo al router, automáticamente también recibirá sus recordatorios sin tocar este archivo.

---

### `procesarYEnviarRecordatorio(cita, template_name, clienteNombre, log_day)`

Función interna (no exportada). Extrae el teléfono del cliente desde la descripción del evento y envía el template.

```js
// Un evento de Calendar tiene esta descripción:
// "Teléfono: 524641697975\nAgendado vía AgendaBot WhatsApp."

// La función extrae el teléfono con regex:
const match = cita.description.match(/Teléfono:\s*(\S+)/);
const telefono = match[1]; // "524641697975"

// Y extrae la hora del evento:
const hora = new Date(cita.start.dateTime).toLocaleTimeString('es-MX', {
  hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'America/Mexico_City'
}); // "10:00 a. m."

// Luego envía el template:
await enviarTemplate(telefono, "recordatorio_cita", ["Jorge García", "10:00 a. m."]);
```

Si el evento no tiene teléfono en la descripción (ej. citas creadas manualmente en Calendar), simplemente no se envía recordatorio y no explota.

---

## `stringUtils.js` — Utilidades de Texto

### `capitalizarNombre(texto)`

Pone en mayúscula la primera letra de cada palabra. Útil para mostrar nombres consistentemente, sin importar cómo los escribió el usuario.

```js
capitalizarNombre("jorge GARCÍA")   // → "Jorge García"
capitalizarNombre("  maría   josé") // → "María José"  (maneja espacios extra)
capitalizarNombre("")               // → ""
capitalizarNombre(null)             // → ""
```

**Cómo funciona:**

```js
texto
  .trim()                          // quita espacios al inicio y final
  .toLowerCase()                   // todo a minúsculas primero
  .split(/\s+/)                    // divide por uno o más espacios
  .map(palabra =>
    palabra.charAt(0).toUpperCase() + palabra.slice(1)  // capitaliza primera letra
  )
  .join(' ');                      // une con un espacio
```

**Dónde se usa:**
- `steakBoutique.js` → al guardar el nombre que escribe el usuario (`esperando_nombre`)
- `steakBoutique.js` → al recuperar el nombre del evento de Calendar (reagendar/cancelar)
- `cronManager.js` → al mostrar el nombre en el log del recordatorio
