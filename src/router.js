const steakBoutique = require('./clients/steakBoutique');
// const barberiaNorte = require('./clients/barberiaNorte');

const clientes = {
    "15551490506": {
        logic: steakBoutique,
        config: {
            name: "Steak Boutique",
            calendarId: (process.env.CALENDAR_ID || 'primary').replace(/["';]/g, '').trim(),
            ownerPhone: "524641697975"
        }
    },
    // "524640000000": {
    //     logic: barberiaNorte,
    //     config: {
    //         name: "Barbería Norte",
    //         calendarId: 'xxxxxxxxxxxx@group.calendar.google.com'
    //     }
    // }
};

async function enrutarMensaje(numeroNegocio, numeroCliente, texto, tipo_mensaje = "text") {
    const cliente = clientes[numeroNegocio];

    if (cliente) {
        // console.log(`Routing message from ${numeroCliente} to ${cliente.config.name}`);
        try {
            await cliente.logic.procesarMensaje(numeroCliente, texto, cliente.config, tipo_mensaje);
        } catch (error) {
            console.error(`❌ Error ejecutando lógica para ${cliente.config.name}:`, error);
        }
    } else {
        console.warn(`⚠️ Advertencia: Se recibió un mensaje para el número ${numeroNegocio}, pero no hay un cliente configurado para él.`);
    }
}

module.exports = { enrutarMensaje, clientes };