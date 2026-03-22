# `src/clients/` — Lógica de Conversación por Cliente

## Posición en el flujo

```
src/router.js
      ↓
📄 steakBoutique.js   ← ESTÁS AQUÍ
      ↓              ↓
calendarService   whatsAppService
```

---

## `steakBoutique.js` — Máquina de Estados de la Conversación

**Responsabilidad:** Manejar toda la conversación con el usuario. Cada usuario tiene su propia sesión con un "paso" actual. Cada mensaje que llega se procesa según el paso en que está el usuario.

---

### El mapa de sesiones (`sesiones`)

```js
const sesiones = {};

// Estructura de una sesión activa:
sesiones["524641697975"] = {
  paso: "esperando_hora",
  ultimaActividad: 1710000000000,  // timestamp Date.now()
  fecha_elegida: "2026-04-01",
  hora_elegida: null,              // se llena en el paso siguiente
  nombre: "Jorge García",
  reagendando: false,
  evento_a_cancelar: null
};
```

Las sesiones expiran automáticamente tras **15 minutos de inactividad**. Al expirar, se borran y el usuario comienza desde `inicio` la próxima vez.

---

### Flujo de estados — Agendar nueva cita

```
inicio
  → (usuario dice "agendar" o pulsa btn_agendar)
esperando_fecha
  → (usuario escribe "mañana", "el viernes", "15 de abril")
esperando_hora
  → (usuario escribe "10:00")
esperando_nombre
  → (usuario escribe su nombre)
esperando_imagen
  → (usuario manda foto o escribe "omitir")
  → [crea evento en Calendar] [envía alerta al dueño]
  → sesión eliminada ✓
```

### Flujo de estados — Reagendar

```
inicio
  → (usuario dice "reagendar")
  → [busca cita existente en Calendar]
  → [elimina la cita vieja INMEDIATAMENTE]
  sesion.reagendando = true
  sesion.nombre = nombre guardado de la cita vieja
esperando_fecha
esperando_hora
  → (se salta esperando_nombre y esperando_imagen)
  → [crea evento nuevo] [envía alerta al dueño]
  → sesión eliminada ✓
```

> El nombre del usuario ya lo tenemos del evento viejo, por eso se salta esos pasos.

### Flujo de estados — Cancelar

```
inicio
  → (usuario dice "cancelar")
  → [busca cita en Calendar]
  sesion.evento_a_cancelar = cita.id
confirmar_cancelacion
  → (usuario responde "sí" o "si")
  → [elimina el evento] [envía alerta al dueño]
  → sesión eliminada ✓
```

---

### Los handlers — un objeto con una función por estado

```js
const handlers = {
  inicio: async (wa_id, texto, config, sesion) => { ... },
  esperando_fecha: async (wa_id, texto, config, sesion) => { ... },
  esperando_hora: async (wa_id, texto, config, sesion) => { ... },
  esperando_nombre: async (wa_id, texto, config, sesion) => { ... },
  esperando_imagen: async (wa_id, texto, config, sesion) => { ... },
  confirmar_cancelacion: async (wa_id, texto, config, sesion) => { ... },
};
```

Cada handler recibe:
- `wa_id` — número de teléfono del usuario (ej. `"524641697975"`)
- `texto` — mensaje que escribió el usuario, ya en minúsculas y sin espacios extras
- `config` — objeto con `{ name, calendarId, ownerPhone }` que viene del router
- `sesion` — referencia directa al objeto en `sesiones[wa_id]`, puedes mutarlo directamente

---

### Handler: `inicio`

Detecta qué quiere el usuario y redirige:

```js
// Detecta "agendar" en el texto O el ID del botón
const esAgendar = texto.includes("agendar") || texto === "btn_agendar";
const esReagendar = texto.includes("reagendar") || texto === "btn_reagendar";
const esCancelar = texto.includes("cancelar") || texto === "btn_cancelar";
```

Si no detecta ninguna intención, manda los 3 botones interactivos.

---

### Handler: `esperando_fecha`

Usa `chrono-node` (librería de parsing de fechas en lenguaje natural) para convertir texto a fecha:

```js
// "el próximo lunes" → Date object
const fechaParseada = chrono.es.parseDate(texto, new Date(), { forwardDate: true });
```

- `chrono.es` = versión en español
- `forwardDate: true` = si dices "el lunes" y hoy es martes, asume el próximo lunes (no el pasado)

Luego formatea la fecha a `YYYY-MM-DD` usando `Intl.DateTimeFormat` con zona horaria CDMX para no tener problemas con UTC.

Validaciones:
1. La fecha no puede ser en el pasado
2. No puede ser más de 2 meses en el futuro
3. Debe haber huecos disponibles ese día (consulta Calendar)

---

### Handler: `esperando_hora`

Valida que la hora tenga formato `HH:MM` con regex:

```js
if (!/^\d{2}:\d{2}$/.test(horaIngresada)) { ... }
```

Vuelve a consultar los huecos disponibles en Calendar en tiempo real para confirmar que la hora elegida sigue libre.

**Si `sesion.reagendando === true`:** crea el evento y termina aquí, sin pasar por nombre ni imagen.

---

### Handler: `esperando_imagen`

```js
const tieneFoto = !texto.includes("omitir");
```

Si el usuario mandó foto (`tipo_mensaje === "image"`), el `texto` en realidad es el `mediaId` de Meta. Si escribió "omitir", `tieneFoto` es false y se usa el template sin imagen.

Siempre crea el evento en Calendar aquí (para el flujo normal).

---

### `procesarMensaje(wa_id, contenido, config, tipo_mensaje)` — La función principal

Es la única función exportada. El router la llama con cada mensaje.

```js
// Ejemplo de lo que el router invoca:
procesarMensaje("524641697975", "quiero una cita", { name, calendarId, ownerPhone });
```

Lo que hace internamente:
1. Revisa si la sesión expiró (15 min) → la borra si es así
2. Crea la sesión si no existe, con `paso: "inicio"`
3. Actualiza `ultimaActividad`
4. Lee el `paso` actual de la sesión
5. Llama al handler correspondiente: `handlers[estadoActual](wa_id, texto, config, sesion)`

---

### Agregar un nuevo estado

1. Agregar la función al objeto `handlers` con el nombre del estado
2. En el handler anterior, cambiar `sesion.paso = "nuevo_estado"`
3. Listo. `procesarMensaje` lo enruta automáticamente.
