const steakBoutique = require('./clients/steakBoutique');
// Aquí importarías otros clientes en el futuro:
// const barberiaNorte = require('./clients/barberiaNorte');

// Diccionario de ruteo: Mapea números de WhatsApp de Meta a archivos de lógica
const directorioClientes = {
    "524641697975": steakBoutique, // Tu número actual
    // "524640000000": barberiaNorte
};

async function enrutarMensaje(numeroNegocio, numeroCliente, texto) {
    const negocio = directorioClientes[numeroNegocio];

    if (negocio) {
        console.log(`Routing message from ${numeroCliente} to business logic for ${numeroNegocio}`);
        await negocio.procesarMensaje(numeroCliente, texto);
    } else {
        console.warn(`⚠️ Advertencia: Se recibió un mensaje para el número ${numeroNegocio}, pero no hay un cliente configurado para él.`);
    }
}

module.exports = { enrutarMensaje };