/**
 * Capitaliza la primera letra de cada palabra de una cadena.
 * @param {string} texto - El texto a capitalizar.
 * @returns {string} - El texto capitalizado.
 */
function capitalizarNombre(texto) {
    if (!texto) return '';
    return texto
        .trim()
        .toLowerCase()
        .split(/\s+/)
        .map(palabra => palabra.charAt(0).toUpperCase() + palabra.slice(1))
        .join(' ');
}

module.exports = { capitalizarNombre };
