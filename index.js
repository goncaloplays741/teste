const mineflayer = require("mineflayer");
const {
  pathfinder,
  Movements,
  goals: { GoalBlock },
} = require("mineflayer-pathfinder");
const express = require("express");
const config = require("./settings.json");

const app = express();

// Servidor web para manter o bot acordado
app.get("/", (req, res) => res.send("Bot AFK online ✅"));
app.listen(process.env.PORT || 5000, "0.0.0.0", () =>
  console.log("Servidor web rodando na porta", process.env.PORT || 5000),
);

// Variáveis globais para cleanup
let currentBot = null;
let reconnectTimeout = null;
let activeIntervals = [];

// Função para limpar recursos
function cleanup() {
  // Limpar todos os intervals ativos
  activeIntervals.forEach(interval => clearInterval(interval));
  activeIntervals = [];
  
  // Limpar timeout de reconexão
  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
    reconnectTimeout = null;
  }
  
  // Fechar bot atual se existir
  if (currentBot) {
    currentBot.removeAllListeners();
    try {
      currentBot.quit();
    } catch (err) {
      // Ignorar erros ao desconectar
    }
    currentBot = null;
  }
}

// Função para criar promise com timeout
function createTimeoutPromise(promise, timeoutMs = 10000) {
  return Promise.race([
    promise,
    new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Timeout')), timeoutMs)
    )
  ]);
}

// Função segura para reconectar
function scheduleReconnect(delay = config.utils["auto-reconnect-delay"] || 5000) {
  if (reconnectTimeout) return; // Evitar múltiplas reconexões
  
  console.log(`[AfkBot] Reconectando em ${delay/1000}s...`);
  reconnectTimeout = setTimeout(() => {
    reconnectTimeout = null;
    createBot();
  }, delay);
}

function createBot() {
  // Limpar recursos anteriores
  cleanup();
  
  try {
    currentBot = mineflayer.createBot({
      username: config["bot-account"].username,
      password: config["bot-account"].password,
      auth: config["bot-account"].type,
      host: config.server.ip,
      port: config.server.port,
      version: config.server.version,
    });

    const bot = currentBot;
    bot.loadPlugin(pathfinder);
    
    // Aguardar dados do minecraft
    let mcData, defaultMove;
    try {
      mcData = require("minecraft-data")(bot.version);
      defaultMove = new Movements(bot, mcData);
    } catch (err) {
      console.error("[ERROR] Falha ao carregar minecraft-data:", err.message);
    }
    
    bot.settings.colorsEnabled = false;

    // Função de autenticação com timeout
    async function authenticate() {
      if (!config.utils["auto-auth"].enabled) return;

      const password = config.utils["auto-auth"].password;
      let authenticated = false;
      let attempts = 0;
      const maxAttempts = 3;

      while (!authenticated && attempts < maxAttempts) {
        try {
          attempts++;
          console.log(`[Auth] Tentativa ${attempts}/${maxAttempts}`);
          
          // Registro com timeout
          await createTimeoutPromise(
            new Promise((resolve, reject) => {
              const timeout = setTimeout(() => reject(new Error('Timeout no registro')), 5000);
              
              bot.chat(`/register ${password} ${password}`);
              bot.once("chat", (username, message) => {
                clearTimeout(timeout);
                resolve();
              });
            })
          );

          // Login com timeout
          await createTimeoutPromise(
            new Promise((resolve, reject) => {
              const timeout = setTimeout(() => reject(new Error('Timeout no login')), 5000);
              
              bot.chat(`/login ${password}`);
              bot.once("chat", (username, message) => {
                clearTimeout(timeout);
                resolve();
              });
            })
          );

          authenticated = true;
          console.log("[Auth] Autenticação concluída com sucesso!");
          
        } catch (err) {
          console.error(`[Auth Error] Tentativa ${attempts} falhou:`, err.message);
          
          if (attempts < maxAttempts) {
            console.log("[Auth] Tentando novamente em 3s...");
            await new Promise((res) => setTimeout(res, 3000));
          } else {
            console.error("[Auth] Todas as tentativas de autenticação falharam");
          }
        }
      }
    }

    bot.once("spawn", async () => {
      console.log(`[AfkBot] Bot entrou no servidor como ${bot.username}`);
      
      try {
        await authenticate();
      } catch (err) {
        console.error("[Auth] Erro na autenticação:", err.message);
      }

      // Chat messages com cleanup tracking
      if (config.utils["chat-messages"].enabled) {
        const messages = config.utils["chat-messages"].messages;
        if (config.utils["chat-messages"].repeat && messages.length > 0) {
          let i = 0;
          const chatInterval = setInterval(() => {
            if (bot && !bot.ended) {
              bot.chat(messages[i]);
              i = (i + 1) % messages.length;
            }
          }, config.utils["chat-messages"]["repeat-delay"] * 1000);
          
          activeIntervals.push(chatInterval);
        } else {
          messages.forEach((msg) => {
            if (bot && !bot.ended) bot.chat(msg);
          });
        }
      }

      // Anti-AFK com cleanup tracking
      if (config.utils["anti-afk"].enabled) {
        if (config.utils["anti-afk"].jump) bot.setControlState("jump", true);
        if (config.utils["anti-afk"].sneak) bot.setControlState("sneak", true);

        if (config.utils["anti-afk"].move || config.utils["anti-afk"].rotate) {
          const afkInterval = setInterval(() => {
            if (bot && !bot.ended) {
              if (config.utils["anti-afk"].move) {
                const directions = ["forward", "back", "left", "right"];
                directions.forEach((dir) =>
                  bot.setControlState(dir, Math.random() > 0.5),
                );
              }
              if (config.utils["anti-afk"].rotate) {
                bot.look(Math.random() * 360, Math.random() * 90 - 45);
              }
            }
          }, 5000);
          
          activeIntervals.push(afkInterval);
        }
      }

      // Posicionamento com validação
      if (config.position.enabled && defaultMove) {
        try {
          bot.pathfinder.setMovements(defaultMove);
          bot.pathfinder.setGoal(
            new GoalBlock(config.position.x, config.position.y, config.position.z),
          );
        } catch (err) {
          console.error("[ERROR] Falha ao definir posição:", err.message);
        }
      }
    });

    // Event handlers com cleanup automático
    bot.on("death", () => {
      console.log("[AfkBot] Bot morreu e respawnou");
    });
    
    bot.on("goal_reached", () => {
      console.log("[AfkBot] Objetivo alcançado");
    });

    // Reconexão consistente para todos os casos
    bot.on("end", (reason) => {
      console.log(`[AfkBot] Conexão encerrada: ${reason || 'Desconhecido'}`);
      if (config.utils["auto-reconnect"] && !reconnectTimeout) {
        scheduleReconnect();
      }
    });

    bot.on("kicked", (reason) => {
      console.log(`[AfkBot] Bot foi kickado: ${reason}`);
      if (config.utils["auto-reconnect"] && !reconnectTimeout) {
        scheduleReconnect();
      }
    });

    bot.on("error", (err) => {
      console.error("[ERROR]", err.message);
      // Para erros críticos, tentar reconectar
      if (err.message.includes('ECONNREFUSED') || err.message.includes('ETIMEDOUT')) {
        if (config.utils["auto-reconnect"] && !reconnectTimeout) {
          scheduleReconnect(10000); // Esperar mais tempo para erros de conexão
        }
      }
    });

  } catch (err) {
    console.error("[FATAL ERROR] Falha ao criar bot:", err.message);
    if (config.utils["auto-reconnect"] && !reconnectTimeout) {
      scheduleReconnect(15000); // Esperar mais tempo para erros fatais
    }
  }
}

// Cleanup graceful no encerramento
process.on('SIGINT', () => {
  console.log('\n[AfkBot] Encerrando bot...');
  cleanup();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n[AfkBot] Encerrando bot...');
  cleanup();
  process.exit(0);
});

// Inicia o bot
createBot();