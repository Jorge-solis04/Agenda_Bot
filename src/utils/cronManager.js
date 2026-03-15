const cron = require('node-cron');
const { obtenerCitasDeManana } = require('../services/calendarService');
const { enviarTemplate } = require('../services/whatsAppService');

function iniciarCronJobs() {
    // Configúralo a las 8:00 AM para producción
    cron.schedule('0 8 * * *', async () => {
        console.log('⏰ Ejecutando recordatorios diarios...');
        const citas = await obtenerCitasDeManana();

        for (const cita of citas) {
            const nombre = cita.summary.replace('Cita - ', '').trim();
            const match = cita.description.match(/Teléfono:\s*(\d+)/);
            
            if (match) {
                const telefono = match[1];
                const hora = new Date(cita.start.dateTime).toLocaleTimeString('es-MX', {
                    hour: '2-digit', minute: '2-digit', hour12: true
                });

                // Usamos nuestro servicio de plantillas
                await enviarTemplate(telefono, 'recordatorio_cita', [nombre, hora]);
            }
        }
    });
    
    console.log('✅ Cron Jobs programados correctamente.');
}

module.exports = { iniciarCronJobs };