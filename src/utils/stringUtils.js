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

function formatearFecha(fechaStr) {
  // Usa mediodía para evitar desfases de zona horaria al crear la fecha
  const fecha = new Date(fechaStr + "T12:00:00");
  return fecha.toLocaleDateString("es-MX", {
    weekday: "long", day: "numeric", month: "long",
  });
}

function formatearHora(horaStr) {
  const [h, m] = horaStr.split(":").map(Number);
  const periodo = h < 12 ? "am" : "pm";
  const hora12 = h % 12 || 12;
  return `${hora12}:${String(m).padStart(2, "0")} ${periodo}`;
}

function listarHuecos(huecos) {
  return huecos.map(h => `  • ${formatearHora(h)}`).join("\n");
}

function normalizarHora(texto) {
  const match = texto.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  return match[1].padStart(2, "0") + ":" + match[2];
}

module.exports = { capitalizarNombre, formatearFecha, formatearHora, listarHuecos, normalizarHora };
