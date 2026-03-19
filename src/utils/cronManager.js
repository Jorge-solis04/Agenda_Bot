const cron = require('node-cron');
const { obtenerCitasDeManana, obtenerCitasHoy } = require('../services/calendarService');
const { enviarTemplate } = require('../services/whatsAppService');
const { clientes } = require('../router'); // Importamos el objeto de clientes
const { capitalizarNombre } = require('./stringUtils');

function iniciarCronJobs() {
    console.log('⏰ Iniciando la programación de Cron Jobs para todos los clientes...');

    // Iteramos sobre cada cliente configurado en el router
    for (const numeroNegocio in clientes) {
        const cliente = clientes[numeroNegocio];
        const { name, calendarId } = cliente.config;

        // Programamos un cron job individual para este cliente a las 8:00 AM CDMX
        cron.schedule('0 8 * * *', async () => {
            console.log(`✨ Ejecutando recordatorios diarios para: ${name}`);

            // 1. Recordatorios para HOY
            const citasHoy = await obtenerCitasHoy(calendarId);
            for (const cita of citasHoy) {
                await procesarYEnviarRecordatorio(cita, 'recordatorio_cita_hoy', name, 'hoy');
            }

            // 2. Recordatorios para MAÑANA
            const citasManana = await obtenerCitasDeManana(calendarId);
            for (const cita of citasManana) {
                await procesarYEnviarRecordatorio(cita, 'recordatorio_cita', name, 'mañana');
            }

        }, {
            scheduled: true,
            timezone: "America/Mexico_City"
        });
    }

    console.log('🏁 Programación de todos los Cron Jobs finalizada.');
}

/**
 * Función auxiliar para procesar los datos de la cita y enviar el template de WhatsApp
 */
async function procesarYEnviarRecordatorio(cita, template_name, clienteNombre,log_day) {
    const nombreCita = capitalizarNombre(cita.summary.replace('Cita - ', ''));
    const match = cita.description.match(/Teléfono:\s*(\S+)/);

    if (match) {
        const telefono = match[1];
        const hora = new Date(cita.start.dateTime).toLocaleTimeString('es-MX', {
            hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'America/Mexico_City'
        });

        console.log(`   -> [${log_day}] Enviando recordatorio a ${telefono} (${nombreCita}) a las ${hora} para ${clienteNombre}`);

        // Aquí usamos el template. Podrías pasar el día como parámetro si el template lo permite, 
        // o simplemente enviar la hora y nombre como antes.
        await enviarTemplate(telefono, template_name, [nombreCita, hora]);
    }
}

module.exports = { iniciarCronJobs };


