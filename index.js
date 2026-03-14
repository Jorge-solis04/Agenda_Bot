// Importamos las funciones necesarias del servicio de calendario
const { obtenerHuecosLibres, crearEvento, buscarCitaPorTelefono, eliminarEvento, obtenerCitasDeManana } = require('./calendarService');
// Axios nos permite hacer peticiones HTTP a la API de WhatsApp
const axios = require('axios');
require('dotenv').config();
const chrono = require('chrono-node');
const cron = require('node-cron'); // Para tareas programadas (ej. enviar recordatorios)
// Express es el framework para crear nuestro servidor web
const express = require('express');
const app = express();
// Definimos el puerto. Si existe en el entorno lo usa, si no usa el 3000
const PORT = process.env.PORT || 3000;

// CONFIGURACIÓN DE SEGURIDAD Y ACCESO
// Este token lo defines tú para verificar que eres dueño del servidor en Meta
const VERIFY_TOKEN = "steak_boutique_secreto_123";
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;

// MÁQUINA DE ESTADOS (SESIONES)
// Este objeto actúa como una base de datos temporal en memoria.
// Guarda en qué paso de la conversación está cada usuario (identificado por su wa_id).
// Si el servidor se reinicia, esta información se pierde.
const sesiones = {}; 

// Middleware fundamental para que Express entienda el JSON que manda Meta en las peticiones POST
app.use(express.json());

// Ruta de prueba para verificar que el servidor está encendido desde el navegador
app.get('/', (req, res) => {
    res.send('El servidor de AgendaBot Node.js está vivo y corriendo 🚀');
});

// --------------------------------------------------------- //
// ENDPOINT 1: Verificación de Meta (Solo ocurre una vez)
// --------------------------------------------------------- //
// Meta llama a esta ruta cuando configuras el Webhook por primera vez para confirmar que el servidor es tuyo.
app.get('/webhook', (req, res) => {
    // Extraemos los parámetros de verificación de la query string
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    // Verificamos que vengan los datos y que el token coincida con el nuestro
    if (mode && token) {
        if (mode === 'subscribe' && token === VERIFY_TOKEN) {
            console.log('✅ WEBHOOK VERIFICADO POR META');
            // Meta exige que devolvamos el challenge como string plano para completar la verificación
            res.status(200).send(challenge);
        } else {
            // Si el token no coincide, devolvemos error de prohibido (403)
            res.sendStatus(403);
        }
    } else {
        // Si faltan datos, devolvemos error de petición incorrecta (400)
        res.sendStatus(400);
    }
});

// --------------------------------------------------------- //
// ENDPOINT 2: Recepción de Mensajes (El día a día del bot)
// --------------------------------------------------------- //
// Aquí llegan todos los mensajes que los usuarios envían al número de WhatsApp
app.post('/webhook', async (req, res) => {
    const body = req.body;

    try {
        // Verificamos que la estructura del JSON sea la de un mensaje de WhatsApp válido
        if (body.entry && body.entry[0].changes && body.entry[0].changes[0].value.messages) {
            const mensajeData = body.entry[0].changes[0].value.messages[0];
            let wa_id = mensajeData.from; // El número de teléfono del usuario (ID de WhatsApp)
            
            // CORRECCIÓN DE NÚMERO (Específico para México y algunos países)
            // WhatsApp a veces envía el número con un '1' extra después del código de país (521...)
            // pero la API para enviar mensajes espera el formato sin ese '1' (52...).
            if (wa_id.startsWith("521") && wa_id.length === 13) {
                wa_id = wa_id.replace("521", "52");
            }
            
            // Obtenemos el texto del mensaje y lo convertimos a minúsculas para facilitar comparaciones
            let texto = "";
            
            if (mensajeData.type === 'text') {
                // Si el cliente escribió a mano
                texto = mensajeData.text.body.toLowerCase();
            } else if (mensajeData.type === 'interactive' && mensajeData.interactive.type === 'button_reply') {
                // Si el cliente tocó un botón, leemos el ID que le pusimos en la función anterior
                texto = mensajeData.interactive.button_reply.id; 
            }

            console.log(`\n📩 Mensaje de ${wa_id}: "${texto}"`);

            // 1. GESTIÓN DE SESIÓN
            // Si el usuario no existe en la memoria (es la primera vez que escribe o se reinició el server),
            // le creamos una sesión inicial en el paso 'inicio'.
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
    } catch (error) {
        console.error("❌ Error procesando el mensaje:", error);
    }

    // Siempre respondemos 200 OK a Meta inmediatamente, de lo contrario intentarán reenviar el mensaje
    res.sendStatus(200);
});

// --------------------------------------------------------- //
// FUNCIÓN AUXILIAR: Enviar Mensajes
// --------------------------------------------------------- //
async function enviarMensajeWhatsApp(numeroDestino, texto) {
    try {
        await axios({
            method: 'POST',
            url: `https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}/messages`,
            headers: {
                'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
                'Content-Type': 'application/json'
            },
            data: {
                messaging_product: 'whatsapp',
                to: numeroDestino,
                type: 'text',
                text: { body: texto }
            }
        });
    } catch (error) {
        // Si falla el envío (ej. token vencido), lo registramos en consola
        console.error('❌ Error enviando mensaje a Meta:', error.response ? error.response.data : error.message);
    }
}

async function enviarTemplateWhatsApp(numeroDestino, nombreCliente, horaCita) {
    try {
        await axios({
            method: 'POST',
            url: `https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}/messages`,
            headers: {
                'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
                'Content-Type': 'application/json'
            },
            data: {
                messaging_product: 'whatsapp',
                to: numeroDestino,
                type: 'template',
                template: {
                    name: 'recordatorio_cita', // El nombre exacto que le pusiste en Meta
                    language: {
                        code: 'es_MX' // O 'es' dependiendo de lo que elegiste en Meta
                    },
                    components: [
                        {
                            type: 'body',
                            parameters: [
                                { type: 'text', text: nombreCliente }, // Esta es la variable {{1}}
                                { type: 'text', text: horaCita }       // Esta es la variable {{2}}
                            ]
                        }
                    ]
                }
            }
        });
        console.log(`✅ Recordatorio enviado a ${numeroDestino}`);
    } catch (error) {
        console.error('❌ Error enviando template:', error.response ? error.response.data : error.message);
    }
}

async function enviarBotonesWhatsApp(numeroDestino, texto) {
    try {
        await axios({
            method: 'POST',
            url: `https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}/messages`,
            headers: {
                'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
                'Content-Type': 'application/json'
            },
            data: {
                messaging_product: 'whatsapp',
                to: numeroDestino,
                type: 'interactive',
                interactive: {
                    type: 'button',
                    body: { 
                        text: texto 
                    },
                    action: {
                        buttons: [
                            {
                                type: 'reply',
                                reply: { id: 'btn_agendar', title: ' 🕒 Agendar una cita' }
                            },
                            {
                                type: 'reply',
                                reply: { id: 'btn_reagendar', title: '🔄 Reagendar una cita' }
                            },
                            {
                                type: 'reply',
                                reply: { id: 'btn_cancelar', title: '❌ Cancelar una cita' }
                            }
                        ]
                    }
                }
            }
        });
    } catch (error) {
        console.error('❌ Error enviando botones:', error.response ? JSON.stringify(error.response.data) : error.message);
    }
}

// --------------------------------------------------------- //
// CRON JOB: Recordatorios Automáticos
// --------------------------------------------------------- //
// Configurado para ejecutarse cada minuto (solo para pruebas)
// Para producción, cambia '* * * * *' por '0 8 * * *'
cron.schedule('0 8 * * *', async () => {
    console.log('⏰ Revisando agenda para enviar recordatorios de mañana...');
    
    const citas = await obtenerCitasDeManana();
    
    if (citas.length === 0) {
        console.log('Sin citas para mañana.');
        return;
    }

    for (const cita of citas) {
        // Extraemos los datos del evento
        const titulo = cita.summary || '';
        const descripcion = cita.description || '';
        
        // Limpiamos el nombre (quitamos el "Cita - ")
        const nombreCliente = titulo.replace('Cita - ', '').trim();
        
        // Extraemos el teléfono de la descripción (buscamos la línea "Teléfono: XXXXX")
        const matchTelefono = descripcion.match(/Teléfono:\s*(\d+)/);
        if (!matchTelefono) continue; // Si no tiene teléfono, lo saltamos
        
        const numeroCliente = matchTelefono[1];

        // Formateamos la hora
        const fechaInicio = new Date(cita.start.dateTime);
        const horaFormateada = fechaInicio.toLocaleTimeString('es-MX', { 
            hour: '2-digit', 
            minute: '2-digit', 
            hour12: true, 
            timeZone: 'America/Mexico_City' 
        });

        // Disparamos el template de Meta
        await enviarTemplateWhatsApp(numeroCliente, nombreCliente, horaFormateada);
    }
});

// Encendemos el servidor para escuchar peticiones
app.listen(PORT, () => {
    console.log(`🚀 Servidor corriendo en el puerto ${PORT}`);
});