const mineflayer = require("mineflayer");
const {
  pathfinder,
  Movements,
  goals: { GoalBlock },
} = require("mineflayer-pathfinder");
const express = require("express");
const ngrok = require("ngrok");
const config = require("./settings.json");

const app = express();

// Servidor web para manter o bot acordado
app.get("/", (req, res) => res.send("Bot AFK online ✅"));
app.listen(process.env.PORT || 5000, "0.0.0.0", () =>
  console.log("Servidor web rodando na porta", process.env.PORT || 5000)
);

// Variáveis globais para cleanup
let currentBot = null;
let reconnectTimeout = null;
let activeIntervals = [];

// Função para limpar recursos
function cleanup() {
  activeIntervals.forEach((interval) => clearInterval(interval));
  activeIntervals = [];

  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
    reconnectTimeout = null;
  }

  if (currentBot) {
    currentBot.removeAllListeners();
    try {
      currentBot.quit();
    } catch (err) {}
    currentBot = null;
  }
}

// Função para criar promise com timeout
function createTimeoutPromise(promise, timeoutMs = 10000) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Timeout")), timeoutMs)
    ),
  ]);
}

// Função segura para reconectar
function scheduleReconnect(delay = config.utils["auto-reconnect-delay"] || 5000) {
  if (reconnectTimeout) return;

  console.log(`[AfkBot] Reconectando em ${delay / 1000}s...`);
  reconnectTimeout = setTimeout(() => {
    reconnectTimeout = null;
    createBot();
  }, delay);
}

async function createBot() {
  cleanup();

  try {
    // Conectar via ngrok TCP
    const tunnel = await ngrok.connect({
      proto: "tcp",
      addr: config.server.port,
    });
    const [host, port] = tunnel.replace("tcp://", "").split(":");
    console.log(`[Ngrok] Conexão TCP criada: ${host}:${port}`);

    currentBot = mineflayer.createBot({
      username: config["bot-account"].username,
      password: config["bot-account"].password,
      auth: config["bot-account"].type,
      host: host, // usa ngrok
      port: parseInt(port), // porta do túnel
      version: config.server.version,
    });

    const bot = currentBot;
    bot.loadPlugin(pathfinder);

    let mcData, defaultMove;
    try {
      mcData = require("minecraft-data")(bot.version);
      defaultMove = new Movements(bot, mcData);
    } catch (err) {
      console.error("[ERROR] Falha ao carregar minecraft-data:", err.message);
    }

    bot.settings.colorsEnabled = false;

    bot.once("spawn", () => {
      console.log(`[AfkBot] Bot entrou no servidor como ${bot.username}`);
    });

    bot.on("end", (reason) => {
      console.log(`[AfkBot] Conexão encerrada: ${reason || "Desconhecido"}`);
      if (config.utils["auto-reconnect"]) scheduleReconnect();
    });

    bot.on("kicked", (reason) => {
      console.log(`[AfkBot] Bot foi kickado: ${reason}`);
      if (config.utils["auto-reconnect"]) scheduleReconnect();
    });

    bot.on("error", (err) => {
      console.error("[ERROR]", err.message);
      if (err.message.includes("ECONNREFUSED") || err.message.includes("ETIMEDOUT")) {
        if (config.utils["auto-reconnect"]) scheduleReconnect(10000);
      }
    });

  } catch (err) {
    console.error("[FATAL ERROR] Falha ao criar bot:", err.message);
    if (config.utils["auto-reconnect"]) scheduleReconnect(15000);
  }
}

// Cleanup graceful no encerramento
process.on("SIGINT", () => {
  console.log("\n[AfkBot] Encerrando bot...");
  cleanup();
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("\n[AfkBot] Encerrando bot...");
  cleanup();
  process.exit(0);
});

// Inicia o bot
createBot();
