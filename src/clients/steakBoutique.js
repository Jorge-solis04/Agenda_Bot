const { enviarMensajeWhatsApp, enviarBotonesWhatsApp } = require('../services/whatsAppService');

const { obtenerHuecosLibres, crearEvento, buscarCitaPorTelefono, eliminarEvento } = require('../services/calendarService');


const sesiones = {};

export async function procesarMensaje(wa_id, texto) {
    if (!sesiones[wa_id]) {
                sesiones[wa_id] = { paso: 'inicio' };
            }

            // 2. Leemos en qué paso va este usuario para saber qué lógica aplicar
            const estadoActual = sesiones[wa_id].paso;

            // 3. FLUJO DE CONVERSACIÓN (Máquina de Estados)
            // Evaluamos qué responder según el estado actual del usuario
            switch (estadoActual) {
                
                case 'inicio':
                    // Agregamos la validación del botón btn_agendar
                    if (texto.includes('agendar') || texto.includes('cita') || texto === 'btn_agendar') {
                        sesiones[wa_id].paso = 'esperando_fecha';
                        await enviarMensajeWhatsApp(wa_id, "¡Excelente! 📅 ¿Para qué fecha te gustaría tu cita? (Ej. mañana, el próximo martes, 15 de abril)");
                    } 
                    // Agregamos la validación del botón btn_reagendar
                    else if (texto.includes('reagendar') || texto.includes('cambiar') || texto === 'btn_reagendar') {
                        await enviarMensajeWhatsApp(wa_id, "Buscando tu cita actual para modificarla...");
                        
                        const cita = await buscarCitaPorTelefono(wa_id);
                        
                        if (cita) {
                            await eliminarEvento(cita.id);
                            sesiones[wa_id].paso = 'esperando_fecha';
                            await enviarMensajeWhatsApp(wa_id, "✅ Listo, he liberado tu horario anterior. ¿Para qué **nueva fecha** te gustaría agendar?");
                        } else {
                            await enviarMensajeWhatsApp(wa_id, "No encontré ninguna cita futura para modificar. Si quieres una nueva, toca el botón de Agendar.");
                            delete sesiones[wa_id];
                        }
                    }
                    // Agregamos la validación del botón btn_cancelar
                    else if (texto.includes('cancelar') || texto === 'btn_cancelar') {
                        await enviarMensajeWhatsApp(wa_id, "Buscando tu cita en el sistema, un momento...");
                        
                        const cita = await buscarCitaPorTelefono(wa_id);
                        
                        if (cita) {
                            sesiones[wa_id].paso = 'confirmar_cancelacion';
                            sesiones[wa_id].evento_a_cancelar = cita.id;
                            const fechaCita = new Date(cita.start.dateTime).toLocaleString('es-MX', { timeZone: 'America/Mexico_City' });
                            
                            // Aquí usamos botones de nuevo para que confirme Sí o No (¡Te lo dejo como reto extra después!)
                            await enviarMensajeWhatsApp(wa_id, `Encontré una cita para el:\n📅 *${fechaCita}*\n\n¿Estás seguro de que deseas cancelarla? (Responde SÍ o NO)`);
                        } else {
                            await enviarMensajeWhatsApp(wa_id, "No encontré ninguna cita registrada a tu nombre.");
                            delete sesiones[wa_id]; 
                        }
                    } 
                    // El mensaje por defecto AHORA lanza los botones
                    else {
                        await enviarBotonesWhatsApp(wa_id, "¡Hola! Soy tu asistente virtual de reservas. ¿En qué te puedo ayudar hoy? 👇");
                    }
                    break;

                case 'esperando_fecha':
                    // Usamos chrono-node para intentar interpretar la fecha escrita en lenguaje natural
                    // Quitamos forwardDate: true para que si escriben una fecha pasada (ej. "6 de marzo" hoy 8), no salte al 2025.
                    const fechaParseada = chrono.es.parseDate(texto, new Date());
                    console.log(`🕵️‍♂️ Fecha parseada por chrono: ${fechaParseada}`);
                    if (!fechaParseada) {
                        // Si no se pudo entender la fecha, pedimos que la repita sin cambiar de estado
                        await enviarMensajeWhatsApp(wa_id, "Mmm, no logré entender esa fecha. Por favor intenta con algo como 'mañana' o 'el próximo viernes'.");
                        break; 
                    }

                    // Ajuste de zona horaria: chrono devuelve fecha en UTC, ajustamos para obtener la fecha local correcta
                    const tzOffset = (new Date()).getTimezoneOffset() * 60000;
                    const fechaLocal = new Date(fechaParseada.getTime() - tzOffset);
                    const fechaString = fechaLocal.toISOString().split('T')[0];
                    console.log(`🕵️‍♂️ Fecha ajustada a zona horaria local: ${fechaString}`);
                    // VALIDACIÓN: Evitar fechas pasadas
                    // Obtenemos la fecha de hoy ajustada a la zona horaria local para comparar
                    const hoy = new Date(Date.now() - tzOffset).toISOString().split('T')[0];
                    console.log(`🕵️‍♂️ Fecha de hoy ajustada a zona horaria local: ${hoy}`);
                    if (fechaString < hoy) {
                        await enviarMensajeWhatsApp(wa_id, "Esa fecha ya pasó 😅. Por favor, dime una fecha futura para tu cita.");
                        break;
                    }

                    // Guardamos la fecha en formato YYYY-MM-DD en la sesión del usuario
                    sesiones[wa_id].fecha_elegida = fechaString;
                    
                    // Consultamos a Google Calendar si hay huecos
                    const huecos = await obtenerHuecosLibres(sesiones[wa_id].fecha_elegida);
                    
                    if (huecos.length > 0) {
                        // Si hay huecos, avanzamos al siguiente paso
                        sesiones[wa_id].paso = 'esperando_hora';
                        // Mostramos los horarios disponibles
                        await enviarMensajeWhatsApp(wa_id, `Excelente, tengo estos horarios disponibles para el ${sesiones[wa_id].fecha_elegida}: \n${huecos.join('\n')}\n\nEscribe la hora que prefieras (Ej. 10:00).`);
                    } else {
                        // Si no hay huecos, nos quedamos en este state y pedimos otra fecha
                        await enviarMensajeWhatsApp(wa_id, "Lo siento, no tengo horarios disponibles para ese día. Por favor, dime otra fecha.");
                    }
                    break;

                case 'esperando_hora':
                    // Guardamos la hora tal cual la escribió el usuario (asumimos que elige una de la lista)
                    // TODO: Aquí se podría añadir validación para ver si la hora está en la lista 'huecos'
                    sesiones[wa_id].hora_elegida = texto.trim();

                    if (!/^\d{2}:\d{2}$/.test(sesiones[wa_id].hora_elegida)) {
                        await enviarMensajeWhatsApp(wa_id, "El formato de hora no es correcto. Por favor, escribe la hora en formato HH:MM (Ej. 14:00).");
                        break;
                    }

                    sesiones[wa_id].paso = 'esperando_nombre';
                    await enviarMensajeWhatsApp(wa_id, `Perfecto, por ultimo ¿A qué nombre agendamos la cita?`);
                    break;

                case 'esperando_nombre':
                    // Guardamos el nombre
                    sesiones[wa_id].nombre = texto.trim();
                    
                    // Feedback en consola del servidor
                    console.log(`Guardando la cita de ${sesiones[wa_id].nombre} en el calendario...`);
                    
                    // ACCIÓN FINAL: Crear el evento en Google Calendar
                    const exito = await crearEvento(
                        sesiones[wa_id].fecha_elegida, 
                        sesiones[wa_id].hora_elegida, 
                        sesiones[wa_id].nombre, 
                        wa_id // Pasamos el teléfono para guardarlo en la descripción del evento
                    );

                    if (exito) {
                        await enviarMensajeWhatsApp(wa_id, `¡Listo ${sesiones[wa_id].nombre}! Tu cita quedó confirmada en nuestra agenda para el ${sesiones[wa_id].fecha_elegida} a las ${sesiones[wa_id].hora_elegida}. ¡Te esperamos!`);
                    } else {
                        await enviarMensajeWhatsApp(wa_id, `Hubo un pequeño problema al guardar tu cita en el calendario. Por favor, intenta de nuevo escribiendo "agendar".`);
                    }
                    
                    // LIMPIEZA: Borramos la sesión para que la próxima vez que escriba empiece de cero
                    delete sesiones[wa_id];
                    break;

                case 'confirmar_cancelacion':
                    if (texto === 'si' || texto === 'sí') {
                        const exito = await eliminarEvento(sesiones[wa_id].evento_a_cancelar);
                        
                        if (exito) {
                            await enviarMensajeWhatsApp(wa_id, "✅ Tu cita ha sido cancelada exitosamente. ¡Esperamos verte pronto!");
                        } else {
                            await enviarMensajeWhatsApp(wa_id, "Hubo un error al intentar cancelar tu cita. Por favor, intenta más tarde.");
                        }
                    } else {
                        await enviarMensajeWhatsApp(wa_id, "Perfecto, mantendremos tu cita intacta en la agenda. ¡Nos vemos pronto!");
                    }
                    
                    // Sea cual sea la respuesta, terminamos el flujo
                    delete sesiones[wa_id];
                    break;
            }
}

module.exports = { procesarMensaje };