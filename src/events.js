// ============================================================
//  AION 2 Event Scheduler - Configuración de Eventos
//  Todos los horarios están en Eastern Time (ET) = Hora de NA East
// ============================================================

export const EVENTS = [
  {
    id: "siege_zikel",
    name: "SIEGE – NA East / ZIKEL",
    // Jueves (4) y Sábados (6) a las 21:00 ET → avisar a las 20:00 ET
    schedules: [
      { cron: "0 0 20 * * 4", label: "Jueves" },
      { cron: "0 0 20 * * 6", label: "Sábado" },
    ],
    eventTime: "21:00 ET",
    days: "Jueves y Sábados",
    // Genera el texto del mensaje. eventTs = unix timestamp del momento del evento (en segundos)
    buildMessage: (mention, eventTs) =>
      `📢 **SIEGE – NA East / ZIKEL**\n\n` +
      `${mention}\n\n` +
      `⏰ ¡Falta 1 hora para el Siege! Vayan ingresando a la call principal para organizar las parties.\n` +
      `> El Siege comienza: <t:${eventTs}:R> • <t:${eventTs}:t>\n\n` +
      `🔊 https://discord.com/channels/1135023134945320960/1356438589294252072  **CALL PRINCIPAL**\n\n` +
      `🎙️ Una vez asignados, ingresen a su canal correspondiente en Discord Canary para coordinar el microgame.\n\n` +
      `⚠️ Ingreso obligatorio a los canales de voz.`,
  },
  {
    id: "guardian_lord_nahma",
    name: "Guardian Lord Nahma",
    // Viernes (5) y Domingos (0) a las 21:00 ET → avisar a las 20:00 ET
    schedules: [
      { cron: "0 0 20 * * 5", label: "Viernes" },
      { cron: "0 0 20 * * 0", label: "Domingo" },
    ],
    eventTime: "21:00 ET",
    days: "Viernes y Domingos",
    buildMessage: (mention, eventTs) =>
      `👑 **Guardian Lord Nahma – NA East / ZIKEL**\n\n` +
      `${mention}\n\n` +
      `⏰ ¡Falta 1 hora para que aparezca Nahma! Si quieren participar, coordinen con sus grupos.\n` +
      `> Nahma aparece: <t:${eventTs}:R> • <t:${eventTs}:t>\n\n` +
      `🔊 https://discord.com/channels/1135023134945320960/1555381849327538296  **NAHMA CALL**\n\n` +
      `🎙️ Coordinen estrategia y grupos en el canal de voz.\n\n` +
      `✅ Participación opcional — ¡pero los que vayan a por las recompensas no se lo pierdan!`,
  },
];

// Configuración general del bot
export const BOT_CONFIG = {
  footerText: "AION 2 • NA East • Zikel Server",
  serverTimezone: process.env.SERVER_TIMEZONE || "America/New_York",
};
