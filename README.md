# AgendaBot WhatsApp

> **Bot conversacional de agendamiento de citas vía WhatsApp**, construido con Node.js. Gestiona reservas, reagendaciones y cancelaciones directamente desde el chat — sin formularios, sin apps adicionales.

<p align="center">
  <img src="https://img.shields.io/badge/Node.js-22-339933?style=for-the-badge&logo=nodedotjs&logoColor=white" />
  <img src="https://img.shields.io/badge/Express-5-000000?style=for-the-badge&logo=express&logoColor=white" />
  <img src="https://img.shields.io/badge/WhatsApp_Cloud_API-25D366?style=for-the-badge&logo=whatsapp&logoColor=white" />
  <img src="https://img.shields.io/badge/Google_Calendar_API-4285F4?style=for-the-badge&logo=googlecalendar&logoColor=white" />
  <img src="https://img.shields.io/badge/Docker-2496ED?style=for-the-badge&logo=docker&logoColor=white" />
</p>

---

## Descripcion

AgendaBot es un sistema de automatización conversacional que actúa como recepcionista virtual para negocios de servicios. Integra la **Meta WhatsApp Cloud API** con **Google Calendar** para ofrecer un flujo completo de agenda en tiempo real desde cualquier teléfono, sin necesidad de instalar ninguna aplicación.

Diseñado con arquitectura multi-cliente, permite desplegar una sola instancia del servidor para atender múltiples negocios simultáneamente, cada uno con su propio calendario y número de WhatsApp.

**Caso de uso actual:** Steak Boutique — negocio de servicios de estética que recibe reservas a través de WhatsApp Business.

---

## Caracteristicas Principales

- **Flujo conversacional completo** — Agenda, reagenda y cancela citas mediante mensajes de WhatsApp
- **Disponibilidad en tiempo real** — Consulta Google Calendar para mostrar solo los horarios libres
- **Procesamiento de lenguaje natural** — Interpreta fechas en español ("mañana", "el próximo lunes", "15 de abril")
- **Botones interactivos** — Interfaz guiada con mensajes de botones de WhatsApp
- **Alertas al propietario** — Notificaciones automáticas al dueño del negocio por cada movimiento
- **Recordatorios automáticos** — Cron diario a las 8 AM que envía recordatorios a los clientes del día
- **Fotos de referencia** — Paso opcional para que el cliente envíe una imagen de referencia
- **Multi-cliente** — Una sola instancia atiende múltiples negocios con configuración por número
- **Gestión de sesiones** — Estado conversacional por usuario con timeout automático de 15 minutos
- **Contenerizado** — Dockerfile con imagen Alpine y usuario no-root listo para producción

---

## Stack Tecnologico

| Capa | Tecnología | Rol |
|------|-----------|-----|
| **Runtime** | Node.js 22 | Entorno de ejecución |
| **Framework** | Express 5 | Servidor HTTP y webhook |
| **Mensajería** | Meta WhatsApp Cloud API | Envío/recepción de mensajes |
| **Calendario** | Google Calendar API v3 | Gestión de citas |
| **Autenticación** | Google Service Account | Acceso OAuth2 sin intervención humana |
| **NLP de fechas** | chrono-node | Parseo de fechas en lenguaje natural (ES) |
| **Tareas programadas** | node-cron | Recordatorios diarios automáticos |
| **HTTP Client** | axios | Llamadas a la API de Meta |
| **Config** | dotenv | Variables de entorno |
| **Deploy** | Docker (Alpine) | Contenerización lista para producción |

---

## Arquitectura

```
Meta WhatsApp Webhook
        │
        ▼
  POST /webhook
  (index.js)
  ┌─────────────────────────┐
  │ • Extrae sender         │
  │ • Extrae business phone │
  │ • Normaliza teléfonos   │
  └────────────┬────────────┘
               │
               ▼
         router.js
  ┌─────────────────────────┐
  │ businessPhone → cliente │
  │ steakBoutique ──────┐   │
  └────────────────────────-┘
                        │
                        ▼
              steakBoutique.js
         (State Machine por sesión)
         ┌────────────────────┐
         │  inicio            │
         │  esperando_fecha   │
         │  esperando_hora    │
         │  esperando_imagen  │
         │  esperando_nombre  │
         │  confirmar_cancel  │
         └────────┬───────────┘
                  │
        ┌─────────┴──────────┐
        ▼                    ▼
calendarService.js    whatsAppService.js
(Google Calendar)     (Meta Cloud API)
• obtenerHuecos       • enviarMensaje
• crearEvento         • enviarBotones
• buscarCita          • enviarTemplate
• eliminarEvento      • enviarTemplateMedia

        ┌──────────────────────┐
        │  cronManager.js      │
        │  (Cron 8 AM diario)  │
        │  • Citas hoy/mañana  │
        │  • Recordatorios WA  │
        └──────────────────────┘
```

---

## Flujo de Conversacion

```
Usuario: "Hola"
   │
   ▼
Bot: [Botones] ¿Qué deseas hacer?
     [Agendar] [Reagendar] [Cancelar]
   │
   ├── Agendar ──► "¿Para qué fecha?"
   │                     │
   │              Usuario: "el próximo viernes"
   │                     │
   │              Bot: horarios disponibles 🕐
   │                     │
   │              Usuario: "11:00"
   │                     │
   │              Bot: "¿Tienes foto de referencia?"
   │                     │
   │              Usuario: [foto] o "omitir"
   │                     │
   │              Bot: "¿Tu nombre?"
   │                     │
   │              Usuario: "Carlos"
   │                     │
   │              Bot: ✅ Cita confirmada
   │              Owner: 📲 Alerta nueva cita
   │
   ├── Reagendar ─► Busca cita por número
   │               Elimina cita anterior
   │               Flujo fecha → hora
   │               ✅ Cita actualizada
   │
   └── Cancelar ──► Busca cita por número
                   "¿Confirmas cancelación?"
                   Usuario: "sí"
                   ✅ Cita eliminada
                   Owner: 📲 Alerta cancelación
```

---

## Estructura del Proyecto

```
bot_agenda_node/
├── src/
│   ├── index.js                  # Entry point — servidor Express y webhook
│   ├── router.js                 # Enrutador multi-cliente
│   ├── clients/
│   │   └── steakBoutique.js      # Lógica de negocio (state machine)
│   ├── services/
│   │   ├── calendarService.js    # Integración Google Calendar
│   │   └── whatsAppService.js    # Integración Meta Cloud API
│   └── utils/
│       ├── cronManager.js        # Recordatorios automáticos diarios
│       └── stringUtils.js        # Helpers de formato (fechas, horas, nombres)
├── Dockerfile
├── .env.example
└── package.json
```

---

## Variables de Entorno

Crea un archivo `.env` en la raíz del proyecto:

```env
# Meta WhatsApp Cloud API
PHONE_NUMBER_ID=         # ID del número de WhatsApp Business
WHATSAPP_TOKEN=          # Bearer token de Meta Cloud API
VERIFY_TOKEN=            # Token de verificación del webhook

# Google Calendar
CALENDAR_ID=             # ID del calendario de Google (email del calendario)
GOOGLE_CREDENTIALS_B64=  # JSON de cuenta de servicio codificado en base64

# Servidor
PORT=3000                # Puerto (opcional, default: 3000)
```

> **Nota:** Para desarrollo local, puedes colocar `credentials.json` (cuenta de servicio de Google) en la raíz del proyecto en lugar de usar `GOOGLE_CREDENTIALS_B64`.

---

## Inicio Rapido

### Prerequisitos

- Node.js 18+
- Cuenta de Meta for Developers con WhatsApp Cloud API configurada
- Cuenta de servicio de Google con acceso al calendario
- Templates de WhatsApp aprobados (ver lista en `whatsAppService.js`)

### Instalacion

```bash
# Clonar repositorio
git clone https://github.com/tu-usuario/bot_agenda_node.git
cd bot_agenda_node

# Instalar dependencias
npm install

# Configurar variables de entorno
cp .env.example .env
# Editar .env con tus credenciales

# Iniciar servidor
npm start
```

### Con Docker

```bash
# Build
docker build -t agendabot .

# Run
docker run -p 3000:3000 --env-file .env agendabot
```

---

## Endpoints

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/webhook` | Verificación del webhook de Meta |
| `POST` | `/webhook` | Recepción de mensajes entrantes de WhatsApp |
| `GET` | `/health` | Health check del servidor |

---

## Agregar un Nuevo Cliente

1. Crear `src/clients/nuevoNegocio.js` siguiendo el patrón de `steakBoutique.js`
2. Registrar en `src/router.js`:

```js
clientes["PHONE_NUMBER"] = {
  logic: require("./clients/nuevoNegocio"),
  config: {
    name: "Nuevo Negocio",
    calendarId: process.env.CALENDAR_ID_NUEVO,
    ownerPhone: "521XXXXXXXXXX",
  },
};
```

El cron de recordatorios lo detectará automáticamente.

---

## Templates de WhatsApp Requeridos

Los siguientes templates deben estar aprobados en Meta Business Manager:

| Template | Descripción |
|----------|-------------|
| `recordatorio_cita` | Recordatorio de cita para mañana |
| `recordatorio_cita_hoy` | Recordatorio de cita para hoy |
| `alerta_nueva_cita` | Notificación al dueño: nueva cita |
| `alerta_cita_nueva_foto` | Notificación al dueño: nueva cita con foto |
| `alerta_reagendar_cita` | Notificación al dueño: reagendamiento |
| `alerta_cancelacion_cita` | Notificación al dueño: cancelación |

---

## Consideraciones de Produccion

- **Sesiones en memoria** — Las sesiones se pierden al reiniciar. Para producción con múltiples instancias, migrar a Redis.
- **Zona horaria** — Todo el sistema opera en `America/Mexico_City` (UTC-6).
- **Horario de atención** — Slots de 1 hora entre 09:00 y 18:00 (configurable en `calendarService.js`).
- **Normalización de teléfonos** — Corrige automáticamente el prefijo `521` → `52` de números mexicanos.
- **Escalabilidad** — La arquitectura de router permite N clientes sin modificar el core.

---

## Licencia

MIT