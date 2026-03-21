const { google } = require('googleapis');
const path = require('path');

const credentials = process.env.GOOGLE_CREDENTIALS_B64
    ? JSON.parse(Buffer.from(process.env.GOOGLE_CREDENTIALS_B64, 'base64').toString('utf-8'))
    : require(path.join(__dirname, '../../credentials.json'));

const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/calendar.readonly', 'https://www.googleapis.com/auth/calendar.events'],
});

const calendar = google.calendar({ version: 'v3', auth });

async function obtenerHuecosLibres(calendarId, fechaStr) {
    const timeMin = `${fechaStr}T09:00:00-06:00`;
    const timeMax = `${fechaStr}T18:00:00-06:00`;

    try {
        const response = await calendar.events.list({
            calendarId: calendarId,
            timeMin: timeMin,
            timeMax: timeMax,
            singleEvents: true,
            orderBy: 'startTime',
        });

        const eventos = response.data.items || [];
        return calcularSlotsDisponibles(eventos);
    } catch (error) {
        console.error('❌ Error al conectar con Google Calendar:', error);
        return [];
    }
}

function calcularSlotsDisponibles(eventosOcupados) {
    const slotsDelDia = ['09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00'];
    
    const horasOcupadas = eventosOcupados.map(evento => {
        const inicio = evento.start.dateTime || evento.start.date;
        const fecha = new Date(inicio);
        return fecha.toLocaleTimeString('es-MX', { 
            hour: '2-digit', 
            minute: '2-digit', 
            hour12: false, 
            timeZone: 'America/Mexico_City' 
        });
    });

    const libres = slotsDelDia.filter(slot => !horasOcupadas.includes(slot));
    return libres;
}

async function crearEvento(calendarId, fecha, hora, nombre, telefono) {
    const startDateTime = `${fecha}T${hora}:00-06:00`;
    
    const [h, m] = hora.split(':');
    const horaFin = String(Number(h) + 1).padStart(2, '0');
    const endDateTime = `${fecha}T${horaFin}:${m}:00-06:00`;

    const evento = {
        summary: `Cita - ${nombre}`,
        description: `Teléfono: ${telefono}\nAgendado vía AgendaBot WhatsApp.`,
        start: {
            dateTime: startDateTime,
            timeZone: 'America/Mexico_City',
        },
        end: {
            dateTime: endDateTime,
            timeZone: 'America/Mexico_City',
        },
        colorId: '1',
        reminders: {
            useDefault: false,
            overrides: [
                { method: 'popup', minutes: 15 },
            ],
        },
    };

    try {
        const response = await calendar.events.insert({
            calendarId: calendarId,
            resource: evento,
        });
        console.log(`✅ Evento creado en Google Calendar: ${response.data.htmlLink}
                Datos: ${nombre} - ${telefono} - ${fecha} ${hora}
            ` );
        return true;
    } catch (error) {
        console.error(`❌ Error insertando evento en Google Calendar: ${error}`);
        return false;
    }
}

async function buscarCitaPorTelefono(calendarId, telefono) {
    const hoy = new Date().toISOString();

    try {
        const response = await calendar.events.list({
            calendarId: calendarId, 
            timeMin: hoy,
            q: telefono,
            singleEvents: true,
            orderBy: 'startTime',
        });

        const eventos = response.data.items || [];
        
        if (eventos.length > 0) {
            return eventos[0];
        }
        return null;
    } catch (error) {
        console.error('❌ Error buscando cita en Google Calendar:', error);
        return null;
    }
}

async function eliminarEvento(calendarId, eventId) {
    try {
        await calendar.events.delete({
            calendarId: calendarId,
            eventId: eventId,
        });
        console.log(`✅ Evento ${eventId} eliminado de Google Calendar.`);
        return true;
    } catch (error) {
        console.error('❌ Error eliminando cita en Google Calendar:', error);
        return false;
    }
}

async function obtenerCitasDeManana(calendarId) {
    const hoy = new Date();
    
    const manana = new Date(hoy);
    manana.setDate(manana.getDate() + 1);

    const año = manana.getFullYear();
    const mes = String(manana.getMonth() + 1).padStart(2, '0');
    const dia = String(manana.getDate()).padStart(2, '0');
    
    const fechaStr = `${año}-${mes}-${dia}`; 
    
    const timeMin = `${fechaStr}T00:00:00-06:00`;
    const timeMax = `${fechaStr}T23:59:59-06:00`;

    // console.log(`Obteniendo citas para mañana (${fechaStr}) para el calendario ${calendarId}...`);

    try {
        const response = await calendar.events.list({
            calendarId: calendarId,
            timeMin: timeMin,
            timeMax: timeMax,
            singleEvents: true,
            orderBy: 'startTime',
        });
        return response.data.items || [];
    } catch (error) {
        console.error(`❌ Error buscando citas de mañana para ${calendarId}:`, error);
        return [];
    }
}

async function obtenerCitasHoy(calendarId) {
    const hoy = new Date();
    
    const año = hoy.getFullYear();
    const mes = String(hoy.getMonth() + 1).padStart(2, '0');
    const dia = String(hoy.getDate()).padStart(2, '0');
    
    const fechaStr = `${año}-${mes}-${dia}`; 
    
    const timeMin = `${fechaStr}T00:00:00-06:00`;
    const timeMax = `${fechaStr}T23:59:59-06:00`;

    try {
        const response = await calendar.events.list({
            calendarId: calendarId,
            timeMin: timeMin,
            timeMax: timeMax,
            singleEvents: true,
            orderBy: 'startTime',
        });
        return response.data.items || [];
    } catch (error) {
        console.error(`❌ Error buscando citas de hoy para ${calendarId}:`, error);
        return [];
    }
}

module.exports = { obtenerHuecosLibres, crearEvento, buscarCitaPorTelefono, eliminarEvento, obtenerCitasDeManana, obtenerCitasHoy };