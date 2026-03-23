const {
  enviarMensajeWhatsApp,
  enviarBotonesWhatsApp,
  enviarTemplate,
  enviarTemplateMultimedia
} = require("../services/whatsAppService");
const {
  obtenerHuecosLibres,
  crearEvento,
  buscarCitaPorTelefono,
  eliminarEvento,
} = require("../services/calendarService");
const chrono = require("chrono-node");
const { capitalizarNombre, formatearFecha, formatearHora, listarHuecos, normalizarHora} = require("../utils/stringUtils");

const sesiones = {};

// --- FUNCIONES DE FORMATO ---



// --- MANEJADORES DE ESTADO (HANDLERS) ---
const handlers = {
  inicio: async (wa_id, texto, config, sesion) => {
    const esAgendar = texto.includes("agendar") || texto.includes("cita") || texto === "btn_agendar";
    const esReagendar = texto.includes("reagendar") || texto.includes("cambiar") || texto === "btn_reagendar";
    const esCancelar = texto.includes("cancelar") || texto === "btn_cancelar";

    if (esReagendar) {
      await enviarMensajeWhatsApp(wa_id, "Un momento, estoy buscando tu cita... 🔍");
      const cita = await buscarCitaPorTelefono(config.calendarId, wa_id);

      if (!cita) {
        await enviarMensajeWhatsApp(wa_id, "No encontré ninguna cita registrada a tu nombre. Si quieres hacer una nueva, toca el botón *Agendar* ✂️");
        delete sesiones[wa_id];
        return;
      }

      const fechaVieja = new Date(cita.start.dateTime).toLocaleString("es-MX", {
        timeZone: "America/Mexico_City",
        weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit"
      });

      sesion.reagendando = true;
      sesion.info_cita_anterior = fechaVieja;
      sesion.nombre = capitalizarNombre(cita.summary.replace("Cita - ", ""));

      await eliminarEvento(config.calendarId, cita.id);
      sesion.paso = "esperando_fecha";
      return await enviarMensajeWhatsApp(wa_id,
        `✅ Listo, *${sesion.nombre}*. He liberado tu cita del *${fechaVieja}*.\n\n📅 ¿Para qué *nueva fecha* quieres venir?\n_(Ej: mañana, el próximo lunes, 20 de abril)_`
      );
    }

    if (esCancelar) {
      await enviarMensajeWhatsApp(wa_id, "Un momento, estoy buscando tu cita... 🔍");
      const cita = await buscarCitaPorTelefono(config.calendarId, wa_id);

      if (!cita) {
        await enviarMensajeWhatsApp(wa_id, "No encontré ninguna cita registrada a tu nombre. ¿Quizás ya fue cancelada antes?");
        delete sesiones[wa_id];
        return;
      }

      const fechaCita = new Date(cita.start.dateTime).toLocaleString("es-MX", {
        timeZone: "America/Mexico_City",
        weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit"
      });

      sesion.paso = "confirmar_cancelacion";
      sesion.evento_a_cancelar = cita.id;
      sesion.nombre = capitalizarNombre(cita.summary.replace("Cita - ", ""));
      sesion.fecha_elegida = fechaCita;

      return await enviarMensajeWhatsApp(wa_id,
        `Encontré tu cita, *${sesion.nombre}*:\n\n📅 *${fechaCita}*\n\n¿Estás seguro de que deseas cancelarla?\nResponde *SÍ* para confirmar o *NO* para conservarla.`
      );
    }

    if (esAgendar) {
      sesion.paso = "esperando_fecha";
      return await enviarMensajeWhatsApp(wa_id,
        `✂️ ¡Con gusto! ¿Para qué *fecha* quieres agendar tu corte?\n\n_(Ej: mañana, el próximo martes, 15 de abril)_`
      );
    }

    // Por defecto mostrar botones
    return await enviarBotonesWhatsApp(wa_id,
      `¡Hola! ✂️ Bienvenido a *${config.name}*.\nSoy tu asistente de reservas. ¿Qué deseas hacer hoy? 👇`,
      [
        { id: "btn_agendar", title: "✂️ Agendar corte" },
        { id: "btn_reagendar", title: "🔄 Cambiar cita" },
        { id: "btn_cancelar", title: "❌ Cancelar cita" },
      ]
    );
  },

  esperando_fecha: async (wa_id, texto, config, sesion) => {
    const fechaParseada = chrono.es.parseDate(texto, new Date(), { forwardDate: true });
    if (!fechaParseada) {
      return await enviarMensajeWhatsApp(wa_id,
        "Mmm, no logré entender esa fecha 🤔\nIntenta con algo como:\n  • _mañana_\n  • _el próximo viernes_\n  • _15 de abril_"
      );
    }

    const opciones = { timeZone: "America/Mexico_City", year: "numeric", month: "2-digit", day: "2-digit" };
    const formateador = new Intl.DateTimeFormat("en-CA", opciones);
    const fechaString = formateador.format(fechaParseada);
    const hoy = formateador.format(new Date());

    if (fechaString < hoy) {
      return await enviarMensajeWhatsApp(wa_id, "Esa fecha ya pasó 😅 Por favor dime una fecha *futura* para tu corte.");
    }

    const limiteFuturo = new Date();
    limiteFuturo.setMonth(limiteFuturo.getMonth() + 2);
    if (fechaParseada > limiteFuturo) {
      return await enviarMensajeWhatsApp(wa_id, "Solo puedo agendar con hasta *2 meses* de anticipación. Por favor elige una fecha más cercana.");
    }

    sesion.fecha_elegida = fechaString;
    const huecos = await obtenerHuecosLibres(config.calendarId, sesion.fecha_elegida);

    if (huecos.length === 0) {
      return await enviarMensajeWhatsApp(wa_id,
        `Lo siento, ese día ya no tenemos lugar disponible 😕\n¿Quieres intentar con otra fecha?`
      );
    }

    const fechaLegible = formatearFecha(sesion.fecha_elegida);
    sesion.paso = "esperando_hora";
    await enviarMensajeWhatsApp(wa_id,
      `Perfecto ✂️ Para el *${fechaLegible}* tengo estos horarios disponibles:\n\n${listarHuecos(huecos)}\n\n¿Cuál te acomoda mejor? Escribe la hora _(Ej: 9:00, 10:00, 2:00 pm)_`
    );
    return await enviarBotonesWhatsApp(wa_id, "¿Prefieres otro día?", [{ id: "btn_volver_fecha", title: "📅 Ver otra fecha" }]);
  },

  esperando_hora: async (wa_id, texto, config, sesion) => {
    if (texto === "btn_volver_fecha") {
      sesion.paso = "esperando_fecha";
      return await enviarMensajeWhatsApp(wa_id, "Sin problema 😊 ¿Para qué *otra fecha* quieres revisar disponibilidad?");
    }

    const horaNormalizada = normalizarHora(texto);
    if (!horaNormalizada) {
      return await enviarMensajeWhatsApp(wa_id, "No reconocí ese formato de hora 🤔\nEscríbela así: *9:00*, *10:00*, *14:00*");
    }

    const huecosDisponibles = await obtenerHuecosLibres(config.calendarId, sesion.fecha_elegida);
    if (!huecosDisponibles.includes(horaNormalizada)) {
      const fechaLegible = formatearFecha(sesion.fecha_elegida);
      return await enviarMensajeWhatsApp(wa_id,
        `Esa hora ya no está disponible 😕\n\nPara el *${fechaLegible}* aún quedan:\n\n${listarHuecos(huecosDisponibles)}\n\n¿Cuál prefieres?`
      );
    }

    sesion.hora_elegida = horaNormalizada;

    // FLUJO REAGENDACIÓN (Salto de nombre)
    if (sesion.reagendando) {
      console.log(`🔄 Reagendando automáticamente para ${sesion.nombre}...`);
      const exito = await crearEvento(config.calendarId, sesion.fecha_elegida, sesion.hora_elegida, sesion.nombre, wa_id);

      if (!exito) {
        return await enviarMensajeWhatsApp(wa_id, "Hubo un problema al reagendar tu cita. Por favor intenta de nuevo.");
      }

      const fechaLegible = formatearFecha(sesion.fecha_elegida);
      const horaLegible = formatearHora(sesion.hora_elegida);
      await enviarMensajeWhatsApp(wa_id,
        `✅ ¡Todo listo, *${sesion.nombre}*!\n\nTu cita ha quedado para el:\n📅 *${fechaLegible}*\n🕐 *${horaLegible}*\n\n¡Te esperamos! ✂️`
      );

      if (config.ownerPhone) {
        const fechaNueva = `${sesion.fecha_elegida} / ${sesion.hora_elegida} hrs`;
        const variablesAlerta = [sesion.nombre, fechaNueva, sesion.info_cita_anterior];
        await enviarTemplate(config.ownerPhone, "alerta_reagendar_cita", variablesAlerta);
      }
      delete sesiones[wa_id];
      return;
    }

    sesion.paso = "esperando_nombre";
    return await enviarMensajeWhatsApp(wa_id, `¡Excelente elección! 😊\n\n¿Cuál es tu *nombre completo* para registrar la cita?`);
  },

  esperando_nombre: async (wa_id, texto, config, sesion) => {
    sesion.nombre = capitalizarNombre(texto);
    sesion.paso = "esperando_imagen";
    return await enviarMensajeWhatsApp(wa_id,
      `¡Perfecto, *${sesion.nombre}*! ✂️\n\nPara ayudarle al barbero a prepararse, puedes *enviar una foto* de referencia del corte que quieres.\n\n_Si no tienes o prefieres que decidan en el momento, escribe_ *omitir*`
    );
  },

  esperando_imagen: async (wa_id, texto, config, sesion) => {
    const tieneFoto = !texto.includes("omitir");

    console.log(`Guardando la cita de ${sesion.nombre} en el calendario de ${config.name}...`);
    const exito = await crearEvento(config.calendarId, sesion.fecha_elegida, sesion.hora_elegida, sesion.nombre, wa_id);

    if (!exito) {
      await enviarMensajeWhatsApp(wa_id, `Hubo un pequeño problema al guardar tu cita 😕\nPor favor intenta de nuevo escribiendo *agendar*.`);
      delete sesiones[wa_id];
      return;
    }

    const fechaLegible = formatearFecha(sesion.fecha_elegida);
    const horaLegible = formatearHora(sesion.hora_elegida);
    await enviarMensajeWhatsApp(wa_id,
      `✅ ¡Tu cita está confirmada, *${sesion.nombre}*!\n\n📅 *${fechaLegible}*\n🕐 *${horaLegible}*\n\nTe esperamos. ¡Gracias por elegirnos! ✂️✨`
    );

    if (config.ownerPhone) {
      const fechaFormateada = `${sesion.fecha_elegida} / ${sesion.hora_elegida} hrs`;
      const variablesAlerta = [sesion.nombre, wa_id, fechaFormateada];
      if (tieneFoto) {
        const exitoMultimedia = await enviarTemplateMultimedia(config.ownerPhone, "alerta_cita_nueva_foto", variablesAlerta, texto);

        if (!exitoMultimedia) {
          console.log("⚠️ Falló el template multimedia, enviando alerta sin foto...");
          await enviarTemplate(config.ownerPhone, "alerta_nueva_cita", variablesAlerta);
          delete sesiones[wa_id];
          return;
        }
      } else {
        await enviarTemplate(config.ownerPhone, "alerta_nueva_cita", variablesAlerta);
        delete sesiones[wa_id];
        return;
      }
    }
    delete sesiones[wa_id];
  },

  confirmar_cancelacion: async (wa_id, texto, config, sesion) => {
    if (texto === "si" || texto === "sí") {
      const exito = await eliminarEvento(config.calendarId, sesion.evento_a_cancelar);

      if (exito) {
        await enviarMensajeWhatsApp(wa_id,
          `✅ Tu cita ha sido cancelada, *${sesion.nombre}*.\n\nCuando quieras volver, aquí estaremos. ✂️`
        );
        if (config.ownerPhone) {
          const variablesAlerta = [sesion.nombre, sesion.fecha_elegida];
          await enviarTemplate(config.ownerPhone, "alerta_cancelacion_cita", variablesAlerta);
        }
      } else {
        await enviarMensajeWhatsApp(wa_id, "Hubo un error al cancelar 😕 Intenta más tarde o comunícate directamente con nosotros.");
      }
    } else {
      await enviarMensajeWhatsApp(wa_id, "¡Perfecto! Tu cita sigue en pie. ✂️ ¡Te esperamos!");
    }
    delete sesiones[wa_id];
  },
};

// --- FUNCIÓN PRINCIPAL ---
async function procesarMensaje(wa_id, contenido, config, tipo_mensaje = "text") {
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

  let contenidoMensaje = contenido;
  if (tipo_mensaje === "text") {
    contenidoMensaje = contenido.toLowerCase().trim();
  }

  console.log(`📊 [${wa_id}] Estado: ${estadoActual} | Mensaje: "${contenidoMensaje}"`);

  // Ejecución del handler correspondiente
  const handler = handlers[estadoActual];
  if (handler) {
    await handler(wa_id, contenidoMensaje, config, sesiones[wa_id]);
  } else {
    console.error(`❌ No existe un manejador para el estado: ${estadoActual}`);
    delete sesiones[wa_id];
  }
}

module.exports = { procesarMensaje };
