const cron = require('node-cron');
const { obtenerCitasDeManana } = require('../services/calendarService');
const { enviarTemplate } = require('../services/whatsAppService');
const { clientes } = require('../router'); // Importamos el objeto de clientes

function iniciarCronJobs() {
    console.log('⏰ Iniciando la programación de Cron Jobs para todos los clientes...');

    // Iteramos sobre cada cliente configurado en el router
    for (const numeroNegocio in clientes) {
        const cliente = clientes[numeroNegocio];
        const { name, calendarId } = cliente.config;

        // Programamos un cron job individual para este cliente
        // (Puedes personalizar el '0 8 * * *' si cada cliente quiere una hora distinta)
        cron.schedule('0 8 * * *', async () => {
            console.log(`✨ Ejecutando recordatorios diarios para: ${name}`);
            
            // Usamos el calendarId específico del cliente
            const citas = await obtenerCitasDeManana(calendarId);

            for (const cita of citas) {
                const nombreCita = cita.summary.replace('Cita - ', '').trim();
                const match = cita.description.match(/Teléfono:\s*(\S+)/); // Usamos \S+ para capturar más que solo dígitos
                
                if (match) {
                    const telefono = match[1];
                    const hora = new Date(cita.start.dateTime).toLocaleTimeString('es-MX', {
                        hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'America/Mexico_City'
                    });

                    // console.log(`   -> Enviando recordatorio a ${telefono} para la cita de ${nombreCita} a las ${hora}`);
                    await enviarTemplate(telefono, 'recordatorio_cita', [nombreCita, hora]);
                }
            }
        });

        // console.log(`   ✅ Recordatorios diarios programados para ${name}.`);
    }
    
    console.log('🏁 Programación de todos los Cron Jobs finalizada.');
}

module.exports = { iniciarCronJobs };