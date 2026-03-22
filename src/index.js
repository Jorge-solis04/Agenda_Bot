require("dotenv").config();
const { enrutarMensaje } = require("./router");
const { iniciarCronJobs } = require("./utils/cronManager");

// Iniciamos los cron jobs para recordatorios diarios

const express = require("express");
const app = express();
const PORT = process.env.PORT || 3000;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN 

app.use(express.json());

iniciarCronJobs();

app.get("/", (req, res) => {
  res.send("El servidor de AgendaBot Node.js está vivo y corriendo 🚀");
});

app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok", timestamp: new Date().toISOString() });
});

// --------------------------------------------------------- //
// ENDPOINT 1: Verificación de Meta (Solo ocurre una vez)
// --------------------------------------------------------- //

app.get("/webhook", (req, res) => {
  // Extraemos los parámetros de verificación de la query string
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  // Verificamos que vengan los datos y que el token coincida con el nuestro
  if (mode && token) {
    if (mode === "subscribe" && token === VERIFY_TOKEN) {
      console.log("✅ WEBHOOK VERIFICADO POR META");
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
app.post("/webhook", async (req, res) => {
  res.status(200);

  const entry = req.body.entry?.[0];
  const changes = entry?.changes?.[0];
  const value = changes?.value;
  const mensaje = value?.messages?.[0];

  if (mensaje) {
    let wa_id = mensaje.from;
    if (wa_id.startsWith("521") && wa_id.length === 13) {
      wa_id = "52" + wa_id.substring(3);
      console.log(`🔧 Número limpiado a: ${wa_id}`);
    }
    const numeroNegocio = value.metadata.display_phone_number;

    let texto = "";
    let tipo_mensaje = "text";

    if (mensaje.type === "text") texto = mensaje.text.body.toLowerCase();
    if (mensaje.type === "interactive") texto = mensaje.interactive.button_reply.id;
    if (mensaje.type === "image") {
      // Meta no manda la foto completa, manda un ID. Lo pasamos como texto y marcamos el tipo.
      texto = mensaje.image.id;
      tipo_mensaje = "image";
    }

    enrutarMensaje(numeroNegocio, wa_id, texto, tipo_mensaje).catch((err) => {
      console.error(`❌ Error crítico en el ruteo para ${wa_id}:`, err);
    });
  }

  res.sendStatus(200);
});

app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en el puerto ${PORT}`);
});
