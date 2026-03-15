const axios = require('axios');

const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const BASE_URL = `https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}/messages`;

const headers = {
    'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
    'Content-Type': 'application/json'
};

async function enviarMensajeWhatsApp(numero, texto) {
    try {
        await axios.post(BASE_URL, {
            messaging_product: 'whatsapp',
            to: numero,
            type: 'text',
            text: { body: texto }
        }, { headers });
    } catch (error) {
        console.error('❌ Error en enviarMensajeWhatsApp:', error.response?.data || error.message);
    }
}

async function enviarBotonesWhatsApp(numero, texto, botones) {
    // botones debe ser un array: [{id: 'btn1', title: 'Texto'}, ...]
    try {
        await axios.post(BASE_URL, {
            messaging_product: 'whatsapp',
            to: numero,
            type: 'interactive',
            interactive: {
                type: 'button',
                body: { text: texto },
                action: {
                    buttons: botones.map(b => ({
                        type: 'reply',
                        reply: { id: b.id, title: b.title }
                    }))
                }
            }
        }, { headers });
    } catch (error) {
        console.error('❌ Error en enviarBotonesWhatsApp:', error.response?.data || error.message);
    }
}

async function enviarTemplate(numero, templateName, variables) {
    try {
        await axios.post(BASE_URL, {
            messaging_product: 'whatsapp',
            to: numero,
            type: 'template',
            template: {
                name: templateName,
                language: { code: 'es_MX' },
                components: [{
                    type: 'body',
                    parameters: variables.map(v => ({ type: 'text', text: v }))
                }]
            }
        }, { headers });
    } catch (error) {
        console.error('❌ Error en enviarTemplate:', error.response?.data || error.message);
    }
}

module.exports = { enviarMensajeWhatsApp, enviarBotonesWhatsApp, enviarTemplate };