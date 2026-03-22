# `src/` — Punto de Entrada y Enrutador

## Posición en el flujo

```
[Meta WhatsApp API] → POST /webhook
        ↓
   📄 index.js       ← ESTÁS AQUÍ
        ↓
   📄 router.js      ← ESTÁS AQUÍ
        ↓
 clients/steakBoutique.js
```

---

## `index.js` — Servidor Express

**Responsabilidad:** Levantar el servidor HTTP, recibir los webhooks de Meta y extraer el mensaje antes de enviarlo al router. También inicializa los cron jobs al arrancar.

### Funciones / Bloques importantes

#### `GET /webhook` — Verificación de Meta (ocurre una sola vez)

Cuando conectas un número de WhatsApp en Meta Business, Meta hace una petición GET para comprobar que el servidor es tuyo. Debes responder con el `challenge` que te manda.

```
Meta → GET /webhook?hub.mode=subscribe&hub.verify_token=steak_boutique_secreto_123&hub.challenge=12345
Bot → 200 "12345"
```

El token hardcodeado es `steak_boutique_secreto_123`. Si no coincide, responde 403.

#### `POST /webhook` — Recepción de mensajes (el día a día)

Aquí llega cada mensaje que un usuario manda al número de WhatsApp del negocio. El body que manda Meta es un JSON muy anidado. El código lo "desempaca" así:

```
req.body
  .entry[0]
    .changes[0]
      .value
        .messages[0]   → el mensaje del usuario
        .metadata.display_phone_number  → el número del negocio
```

**Normalización de número mexicano:** Meta a veces manda números con formato `521XXXXXXXXXX` (13 dígitos) en vez de `52XXXXXXXXXX` (12 dígitos). El código lo limpia automáticamente.

```js
// Antes: "5214641697975" (13 dígitos, con el 1 extra)
// Después: "524641697975" (12 dígitos, formato correcto)
if (wa_id.startsWith("521") && wa_id.length === 13) {
  wa_id = "52" + wa_id.substring(3);
}
```

**Tipos de mensaje soportados:**
| tipo       | qué hace el código                          |
|------------|---------------------------------------------|
| `text`     | extrae `mensaje.text.body`                  |
| `interactive` | extrae el ID del botón pulsado (`button_reply.id`) |
| `image`    | extrae el `mediaId` y llama a `procesarMensaje` directamente |

> ⚠️ **Bug conocido:** En el bloque `image`, se llama a `procesarMensaje` con una variable `config` que no está definida en ese scope. Esto causará un error en runtime cuando un usuario mande una imagen.

#### Flujo de arranque

```js
iniciarCronJobs();  // Registra los jobs de recordatorios diarios
app.listen(PORT);   // Empieza a escuchar en el puerto 3000 (o el de .env)
```

---

## `router.js` — Enrutador Multi-Cliente

**Responsabilidad:** Decidir a qué cliente corresponde un mensaje según el número de WhatsApp del negocio que lo recibió. Permite tener múltiples negocios con un solo servidor.

### El diccionario `clientes`

```js
const clientes = {
  "15551490506": {          // número del negocio en Meta
    logic: steakBoutique,   // módulo con la lógica del chat
    config: {
      name: "Steak Boutique",
      calendarId: process.env.CALENDAR_ID,
      ownerPhone: "524641697975"   // a quién llegan las alertas
    }
  }
  // Para agregar un cliente nuevo, copiar este bloque
};
```

### `enrutarMensaje(numeroNegocio, numeroCliente, texto)`

Busca el número del negocio en `clientes` y delega al módulo correspondiente.

```js
// Ejemplo de llamada desde index.js:
enrutarMensaje("15551490506", "524641697975", "quiero una cita");

// Internamente hace:
cliente.logic.procesarMensaje(numeroCliente, texto, cliente.config);
//  ↑ steakBoutique.procesarMensaje("524641697975", "quiero una cita", { name, calendarId, ownerPhone })
```

Si el número del negocio no está en `clientes`, solo imprime un warning y no hace nada.

### `clientes` también es exportado

`cronManager.js` importa `clientes` para iterar todos los negocios y programar recordatorios. No necesitas tocar `cronManager` al agregar un cliente nuevo, solo agregarlo aquí.
