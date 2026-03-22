const axios = require('axios');

const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN?.replace(/["';]/g, '').trim();
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID?.replace(/["';]/g, '').trim();
const BASE_URL = `https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}/messages`;

const headers = {
    'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
    'Content-Type': 'application/json'
};

//Esta es la funcion que ayuda a mandar mensajes al usuario, se le manda el numero y el texto del mensaje
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

//Esta es la funcion que ayuda a mandar botones al usuario, se le manda el numero, el texto del mensaje y un array de botones
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

//Esta es la funcion que ayuda a mandar plantillas al usuario, se le manda el numero, el nombre de la plantilla y un array de variables para llenar la plantilla
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

async function enviarTemplateMultimedia(numero, templateName, variables, mediaId) {
  // Envía un template de Meta que incluye una imagen como cabecera.
  // mediaId: el ID de media devuelto por Meta al recibir la imagen del usuario.
  // El template debe tener un componente "header" de tipo "image" configurado en Meta Business.
  //
  
  try {
    await axios.post(BASE_URL, {
      messaging_product: 'whatsapp',
      to: numero,
      type: 'template',
      template: {
        name: templateName,
        language: { code: 'es_MX' },
        components: [
          {
            type: 'header',
            parameters: [{ type: 'image', image: { id: mediaId } }]
          },
          {
            type: 'body',
            parameters: variables.map(v => ({ type: 'text', text: v }))
          }
        ]
      }
    }, { headers });
    return true;
  } catch (error) {
    console.error('❌ Error en enviarTemplateMultimedia:', error.response?.data || error.message);
    return false;
  }
  
}

module.exports = { enviarMensajeWhatsApp, enviarBotonesWhatsApp, enviarTemplate, enviarTemplateMultimedia };