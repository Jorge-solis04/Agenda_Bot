const {
  enviarMensajeWhatsApp,
  enviarBotonesWhatsApp,
  enviarTemplate,
} = require("../services/whatsAppService");
const {
  obtenerHuecosLibres,
  crearEvento,
  buscarCitaPorTelefono,
  eliminarEvento,
} = require("../services/calendarService");
const chrono = require("chrono-node");

const sesiones = {};

// --- MANEJADORES DE ESTADO (HANDLERS) ---
const handlers = {
  inicio: async (wa_id, texto, config, sesion) => {
    const esAgendar = texto.includes("agendar") || texto.includes("cita") || texto === "btn_agendar";
    const esReagendar = texto.includes("reagendar") || texto.includes("cambiar") || texto === "btn_reagendar";
    const esCancelar = texto.includes("cancelar") || texto === "btn_cancelar";

    if (esReagendar) {
      await enviarMensajeWhatsApp(wa_id, "Buscando tu cita actual para modificarla...");
      const cita = await buscarCitaPorTelefono(config.calendarId, wa_id);

      if (!cita) {
        await enviarMensajeWhatsApp(wa_id, "No encontré ninguna cita futura para modificar. Si quieres una nueva, toca el botón de Agendar.");
        delete sesiones[wa_id];
        return;
      }

      const fechaVieja = new Date(cita.start.dateTime).toLocaleString("es-MX", {
        timeZone: "America/Mexico_City",
        day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit"
      });

      sesion.reagendando = true;
      sesion.info_cita_anterior = fechaVieja;
      sesion.nombre = cita.summary.replace("Cita - ", "");

      await eliminarEvento(config.calendarId, cita.id);
      sesion.paso = "esperando_fecha";
      return await enviarMensajeWhatsApp(wa_id, `✅ Listo, he liberado tu cita del *${fechaVieja}*. ¿Para qué **nueva fecha** te gustaría agendar?`);
    }

    if (esCancelar) {
      await enviarMensajeWhatsApp(wa_id, "Buscando tu cita en el sistema, un momento...");
      const cita = await buscarCitaPorTelefono(config.calendarId, wa_id);

      if (!cita) {
        await enviarMensajeWhatsApp(wa_id, "No encontré ninguna cita registrada a tu nombre.");
        delete sesiones[wa_id];
        return;
      }

      const fechaCita = new Date(cita.start.dateTime).toLocaleString("es-MX", {
        timeZone: "America/Mexico_City", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit"
      });

      sesion.paso = "confirmar_cancelacion";
      sesion.evento_a_cancelar = cita.id;
      sesion.nombre = cita.summary.replace("Cita - ", "");
      sesion.fecha_elegida = fechaCita;

      return await enviarMensajeWhatsApp(wa_id, `Encontré una cita para el:\n📅 *${fechaCita}*\n\n¿Estás seguro de que deseas cancelarla? (Responde SÍ o NO)`);
    }

    if (esAgendar) {
      sesion.paso = "esperando_fecha";
      return await enviarMensajeWhatsApp(wa_id, "¡Excelente! 📅 ¿Para qué fecha te gustaría tu cita? (Ej. mañana, el próximo martes, 15 de abril)");
    }

    // Por defecto mostrar botones
    return await enviarBotonesWhatsApp(wa_id, `¡Hola! Soy tu asistente virtual de reservas en ${config.name}. ¿En qué te puedo ayudar hoy? 👇`, [
      { id: "btn_agendar", title: "📅 Agendar" },
      { id: "btn_reagendar", title: "🔄 Reagendar" },
      { id: "btn_cancelar", title: "❌ Cancelar" },
    ]);
  },

  esperando_fecha: async (wa_id, texto, config, sesion) => {
    const fechaParseada = chrono.es.parseDate(texto, new Date(), { forwardDate: true });
    if (!fechaParseada) {
      return await enviarMensajeWhatsApp(wa_id, "Mmm, no logré entender esa fecha. Por favor intenta con algo como 'mañana' o 'el próximo viernes'.");
    }

    const opciones = { timeZone: "America/Mexico_City", year: "numeric", month: "2-digit", day: "2-digit" };
    const formateador = new Intl.DateTimeFormat("en-CA", opciones);
    const fechaString = formateador.format(fechaParseada);
    const hoy = formateador.format(new Date());

    if (fechaString < hoy) {
      return await enviarMensajeWhatsApp(wa_id, "Esa fecha ya pasó 😅. Por favor, dime una fecha futura para tu cita.");
    }

    const limiteFuturo = new Date();
    limiteFuturo.setMonth(limiteFuturo.getMonth() + 2);
    if (fechaParseada > limiteFuturo) {
      return await enviarMensajeWhatsApp(wa_id, "Solo puedo agendar citas con hasta 2 meses de anticipación. Por favor, elige una fecha más cercana.");
    }

    sesion.fecha_elegida = fechaString;
    const huecos = await obtenerHuecosLibres(config.calendarId, sesion.fecha_elegida);

    if (huecos.length === 0) {
      return await enviarMensajeWhatsApp(wa_id, "Lo siento, no tengo horarios disponibles para ese día. Por favor, dime otra fecha.");
    }

    sesion.paso = "esperando_hora";
    await enviarMensajeWhatsApp(wa_id, `Excelente, tengo estos horarios disponibles para el ${sesion.fecha_elegida}: \n${huecos.join("\n")}\n\nEscribe la hora que prefieras (Ej. 10:00).`);
    return await enviarBotonesWhatsApp(wa_id, "Si quieres elegir otra fecha, puedes hacerlo aquí:", [{ id: "btn_volver_fecha", title: "📅 Elegir otra fecha" }]);
  },

  esperando_hora: async (wa_id, texto, config, sesion) => {
    if (texto === "btn_volver_fecha") {
      sesion.paso = "esperando_fecha";
      return await enviarMensajeWhatsApp(wa_id, "Sin problema. 📅 ¿Para qué otra fecha te gustaría revisar disponibilidad?");
    }

    const horaIngresada = texto.trim();
    if (!/^\d{2}:\d{2}$/.test(horaIngresada)) {
      return await enviarMensajeWhatsApp(wa_id, "El formato de hora no es correcto. Por favor, escribe la hora en formato HH:MM (Ej. 14:00).");
    }

    const huecosDisponibles = await obtenerHuecosLibres(config.calendarId, sesion.fecha_elegida);
    if (!huecosDisponibles.includes(horaIngresada)) {
      return await enviarMensajeWhatsApp(wa_id, `Lo siento, esa hora ya no está disponible o no es válida. 😕\n\nLos horarios disponibles para el ${sesion.fecha_elegida} son:\n${huecosDisponibles.join("\n")}\n\nPor favor, escribe una de esas opciones.`);
    }

    sesion.hora_elegida = horaIngresada;

    // FLUJO REAGENDACIÓN (Salto de nombre)
    if (sesion.reagendando) {
      console.log(`🔄 Reagendando automáticamente para ${sesion.nombre}...`);
      const exito = await crearEvento(config.calendarId, sesion.fecha_elegida, sesion.hora_elegida, sesion.nombre, wa_id);

      if (!exito) {
        return await enviarMensajeWhatsApp(wa_id, "Hubo un problema al reagendar tu cita. Por favor intenta de nuevo.");
      }

      await enviarMensajeWhatsApp(wa_id, `¡Listo! Tu cita ha sido movida al ${sesion.fecha_elegida} a las ${sesion.hora_elegida}. ¡Nos vemos pronto!`);

      if (config.ownerPhone) {
        const fechaNueva = `${sesion.fecha_elegida} / ${sesion.hora_elegida} hrs`;
        const variablesAlerta = [sesion.nombre, fechaNueva, sesion.info_cita_anterior];
        await enviarTemplate(config.ownerPhone, "alerta_reagendar_cita", variablesAlerta);
      }
      delete sesiones[wa_id];
      return;
    }

    sesion.paso = "esperando_nombre";
    return await enviarMensajeWhatsApp(wa_id, `Perfecto, por último ¿A qué nombre agendamos la cita?`);
  },

  esperando_nombre: async (wa_id, texto, config, sesion) => {
    sesion.nombre = texto.trim();
    console.log(`Guardando la cita de ${sesion.nombre} en el calendario de ${config.name}...`);

    const exito = await crearEvento(config.calendarId, sesion.fecha_elegida, sesion.hora_elegida, sesion.nombre, wa_id);

    if (!exito) {
      await enviarMensajeWhatsApp(wa_id, `Hubo un pequeño problema al guardar tu cita. Por favor, intenta de nuevo escribiendo "agendar".`);
      delete sesiones[wa_id];
      return;
    }

    await enviarMensajeWhatsApp(wa_id, `¡Listo ${sesion.nombre}! Tu cita quedó confirmada para el ${sesion.fecha_elegida} a las ${sesion.hora_elegida}.`);

    // if (config.ownerPhone) {
    //   const fechaFormateada = `${sesion.fecha_elegida} / ${sesion.hora_elegida} hrs`;
    //   const variablesAlerta = [sesion.nombre, wa_id, fechaFormateada];
    //   await enviarTemplate(config.ownerPhone, "alerta_cita_nueva", variablesAlerta);
    // }
    delete sesiones[wa_id];
  },

  confirmar_cancelacion: async (wa_id, texto, config, sesion) => {
    if (texto === "si" || texto === "sí") {
      const exito = await eliminarEvento(config.calendarId, sesion.evento_a_cancelar);

      if (exito) {
        await enviarMensajeWhatsApp(wa_id, "✅ Tu cita ha sido cancelada exitosamente.");
        if (config.ownerPhone) {
          const variablesAlerta = [sesion.nombre, sesion.fecha_elegida];
          await enviarTemplate(config.ownerPhone, "alerta_cancelacion_cita", variablesAlerta);
        }
      } else {
        await enviarMensajeWhatsApp(wa_id, "Hubo un error al cancelar. Intenta más tarde.");
      }
    } else {
      await enviarMensajeWhatsApp(wa_id, "Perfecto, mantendremos tu cita intacta.");
    }
    delete sesiones[wa_id];
  },
};

// --- FUNCIÓN PRINCIPAL ---
async function procesarMensaje(wa_id, texto, config) {
  const TIEMPO_EXPIRACION = 15 * 60 * 1000;
  const ahora = Date.now();

  // Limpieza de sesión expirada
  if (sesiones[wa_id] && (ahora - sesiones[wa_id].ultimaActividad > TIEMPO_EXPIRACION)) {
    delete sesiones[wa_id];
  }

  // Inicialización o actualización de actividad
  if (!sesiones[wa_id]) {
    sesiones[wa_id] = { paso: "inicio", ultimaActividad: ahora };
  } else {
    sesiones[wa_id].ultimaActividad = ahora;
  }

  const estadoActual = sesiones[wa_id].paso;
  const textoNormalizado = texto.toLowerCase().trim();
  console.log(`📊 [${wa_id}] Estado: ${estadoActual} | Mensaje: "${textoNormalizado}"`);

  // Ejecución del handler correspondiente
  const handler = handlers[estadoActual];
  if (handler) {
    await handler(wa_id, textoNormalizado, config, sesiones[wa_id]);
  } else {
    console.error(`❌ No existe un manejador para el estado: ${estadoActual}`);
    delete sesiones[wa_id];
  }
}

module.exports = { procesarMensaje };
