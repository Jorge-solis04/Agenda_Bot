require('dotenv').config();
const { enrutarMensaje } = require('./router');
const { iniciarCronJobs } = require('./utils/cronManager');

// Iniciamos los cron jobs para recordatorios diarios

const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;
const VERIFY_TOKEN = "steak_boutique_secreto_123";


app.use(express.json());

iniciarCronJobs();

app.get('/', (req, res) => {
    res.send('El servidor de AgendaBot Node.js está vivo y corriendo 🚀');
});

// --------------------------------------------------------- //
// ENDPOINT 1: Verificación de Meta (Solo ocurre una vez)
// --------------------------------------------------------- //

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
    const entry = req.body.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;
    const mensaje = value?.messages?.[0];

    if (mensaje) {
        const wa_id = mensaje.from;
        const numeroNegocio = value.metadata.display_phone_number;
        
        // Limpiamos el texto si es botón o escrito
        let texto = "";
        if (mensaje.type === 'text') texto = mensaje.text.body.toLowerCase();
        if (mensaje.type === 'interactive') texto = mensaje.interactive.button_reply.id;

        // ¡Delegamos la responsabilidad!
        await enrutarMensaje(numeroNegocio, wa_id, texto);
    }
    res.sendStatus(200);
});




// Encendemos el servidor para escuchar peticiones
app.listen(PORT, () => {
    console.log(`🚀 Servidor corriendo en el puerto ${PORT}`);
});