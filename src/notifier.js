// ============================================================
//  AION 2 Discord Bot - Módulo de Notificaciones
// ============================================================

/**
 * Calcula el Unix timestamp (segundos) del momento del evento.
 * Como el cron se dispara 1 hora antes, el evento es "ahora + 3600 segundos".
 * @returns {number} Unix timestamp en segundos
 */
function getEventTimestamp() {
  return Math.floor(Date.now() / 1000) + 3600;
}

/**
 * Envía la notificación del evento al canal de Discord.
 * Usa el formato de mensaje personalizado definido en cada evento.
 *
 * @param {import("discord.js").TextChannel} channel
 * @param {Object} event - Configuración del evento (de events.js)
 * @param {string} dayLabel - Día del aviso (Jueves, Viernes, etc.)
 * @param {string} mention - Rol a mencionar (@everyone, <@&ID>, etc.)
 */
export async function sendEventNotification(channel, event, dayLabel, mention) {
  try {
    const eventTs = getEventTimestamp();
    const content = event.buildMessage(mention, eventTs);

    await channel.send({ content });

    console.log(
      `[${new Date().toISOString()}] ✅ Notificación enviada: ${event.name} (${dayLabel})`
    );
  } catch (error) {
    console.error(
      `[${new Date().toISOString()}] ❌ Error enviando notificación ${event.name}:`,
      error.message
    );
  }
}
