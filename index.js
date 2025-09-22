const mineflayer = require("mineflayer");
const { pathfinder, Movements } = require("mineflayer-pathfinder");
const express = require("express");
const ngrok = require("ngrok");
const config = require("./settings.json");

// === Servidor web para manter o bot acordado ===
const app = express();
app.get("/", (_, res) => res.send("Bot AFK online ✅"));
const webPort = process.env.PORT || 5000;
app.listen(webPort, "0.0.0.0", () =>
  console.log(`Servidor web rodando na porta ${webPort}`)
);

// === Variáveis globais ===
let currentBot = null;
let reconnectTimeout = null;
let activeIntervals = [];

// === Funções de gerenciamento ===
function cleanup() {
  // Limpar intervals
  activeIntervals.forEach(clearInterval);
  activeIntervals = [];

  // Limpar timeout de reconexão
  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
    reconnectTimeout = null;
  }

  // Fechar bot atual
  if (currentBot) {
    currentBot.removeAllListeners();
    try {
      currentBot.quit();
    } catch {}
    currentBot = null;
  }
}

function scheduleReconnect(delay = config.utils["auto-reconnect-delay"] || 5000) {
  if (reconnectTimeout) return;
  console.log(`[AfkBot] Reconectando em ${delay / 1000}s...`);
  reconnectTimeout = setTimeout(() => {
    reconnectTimeout = null;
    createBot();
  }, delay);
}

function createTimeoutPromise(promise, timeoutMs = 10000) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), timeoutMs)),
  ]);
}

// === Criação do bot com ngrok ===
async function createBot() {
  cleanup();

  try {
    // Autenticação ngrok (coloca teu token aqui)
    if (config.ngrokToken) {
      await ngrok.authtoken(config.ngrokToken);
    }

    // Criar túnel TCP para o servidor
    const tunnel = await ngrok.connect({
      proto: "tcp",
      addr: config.server.port,
    });
    const [host, port] = tunnel.replace("tcp://", "").split(":");
    console.log(`[Ngrok] Tunnel criado em: ${host}:${port}`);

    // Criar bot
    currentBot = mineflayer.createBot({
      username: config["bot-account"].username,
      password: config["bot-account"].password,
      auth: config["bot-account"].type,
      host,
      port: parseInt(port),
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

    // Evento quando o bot entra
    bot.once("spawn", () => {
      console.log(`[AfkBot] Bot entrou no servidor como ${bot.username}`);
    });

    // Reconexão e tratamento de eventos
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

// === Cleanup em encerramento do processo ===
["SIGINT", "SIGTERM"].forEach((signal) =>
  process.on(signal, () => {
    console.log("\n[AfkBot] Encerrando bot...");
    cleanup();
    process.exit(0);
  })
);

// === Iniciar o bot ===
createBot();
