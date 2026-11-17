// ============================================================
//  AION 2 Discord Bot - Archivo Principal
//  Bot de notificaciones de eventos para NA East / Zikel
// ============================================================

import {
  Client,
  GatewayIntentBits,
  ActivityType,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  ModalBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
  SlashCommandBuilder,
  PermissionFlagsBits,
} from "discord.js";
import cron from "node-cron";
import dotenv from "dotenv";
import { EVENTS, BOT_CONFIG } from "./events.js";
import { sendEventNotification } from "./notifier.js";
import {
  getCharacterProfile,
  getUpgradeReport,
  normalizeKiskRegion,
  normalizeKiskServer,
  upgradeCooldownSeconds,
} from "./upgrades.js";
import { getMarketItem, searchMarketItems } from "./market.js";
import {
  createPriceAlert,
  deleteUserPriceAlert,
  getActivePriceAlerts,
  getUserPriceAlerts,
  removeTriggeredPriceAlert,
} from "./price-alerts.js";
import {
  createPveGroup,
  getPveGroups,
  removePveGroup,
  updatePveGroup,
} from "./pve-groups.js";
import {
  getDueWorldBossTimers,
  markWorldBossTimerNotified,
  setWorldBossTimer,
} from "./world-boss-timers.js";

// Cargar variables de entorno
dotenv.config();

// ─── Validación de Variables de Entorno ───────────────────────────────────────
const REQUIRED_ENV = ["DISCORD_TOKEN", "DISCORD_CHANNEL_ID"];
const missing = REQUIRED_ENV.filter((key) => !process.env[key]);
if (missing.length > 0) {
  console.error(`❌ Faltan variables de entorno requeridas: ${missing.join(", ")}`);
  console.error("   Copia .env.example a .env y configura los valores.");
  process.exit(1);
}

const TOKEN = process.env.DISCORD_TOKEN;
const CHANNEL_ID = process.env.DISCORD_CHANNEL_ID;
const MENTION_ROLE = process.env.MENTION_ROLE || "";
const MARKET_CHANNEL_ID = "1571056334038630561";
const WORLD_BOSS_CHANNEL_ID = "1572255701538181222";
const WORLD_BOSS_ROLE_ID = "1565924221194993664";
const SIEGE_DM_ROLE_ID = "1556537224340832316";
const ATTENDANCE_CHANNEL_ID = "1570568835508084871";
const APPLICATION_PANEL_CHANNEL_ID = "1471153320428306593";
const APPLICATION_CATEGORY_NAME = "═══════  ⋆ SOPORTE⋆ ═════";
const APPLICATION_STAFF_IDS = ["1146577008109834330", "1266083736936513637"];
const APPLICATION_BUTTON_ID = "guild-application:open";
const APPLICATION_MODAL_ID = "guild-application:submit";
const APPLICATION_CLOSE_BUTTON_ID = "guild-application:close";
const APPLICATION_DELETE_BUTTON_ID = "guild-application:delete";
const APPLICATION_APPROVE_BUTTON_ID = "guild-application:approve";
const APPLICATION_REJECT_BUTTON_ID = "guild-application:reject";
const APPLICATION_REJECT_MODAL_PREFIX = "guild-application:reject-reason:";
const PVE_CATEGORY_ID = "1135023136904052797";
const PVE_VOICE_ROLE_IDS = ["1556537224340832316", "1549946232200232971"];
const PRICE_COMMANDS = new Set(["precio", "alerta-precio", "mis-alertas", "quitar-alerta"]);
const GROUP_ROLES = [
  { value: "tank", name: "Tank", emoji: "🛡️" },
  { value: "dps", name: "DPS", emoji: "⚔️" },
  { value: "cleric", name: "Cleric", emoji: "✨" },
  { value: "chanter", name: "Chanter", emoji: "🎶" },
];

// ─── Cliente de Discord ────────────────────────────────────────────────────────
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.MessageContent,   // ← necesario para leer message.content en v14
  ],
});

const SLASH_COMMANDS = [
  new SlashCommandBuilder()
    .setName("eventos")
    .setDescription("Consulta los eventos de esta semana")
    .setDefaultMemberPermissions(null),
  new SlashCommandBuilder()
    .setName("asistencia")
    .setDescription("Registra quién está conectado a tu canal de voz")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder()
    .setName("temporizador-jefe")
    .setDescription("Programa un aviso usando el tiempo restante que muestra el juego")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption((option) => option
      .setName("jefe")
      .setDescription("World Boss de NA East / Zikel")
      .setRequired(true)
      .addChoices(
        { name: "Immortal Gartua", value: "Immortal Gartua" },
        { name: "High Commander Lagta", value: "High Commander Lagta" },
        { name: "Soul Ruler Kashapa", value: "Soul Ruler Kashapa" },
        { name: "Silent Dartan", value: "Silent Dartan" },
      ))
    .addIntegerOption((option) => option
      .setName("horas")
      .setDescription("Horas restantes que muestra el juego")
      .setMinValue(0)
      .setMaxValue(11)
      .setRequired(true))
    .addIntegerOption((option) => option
      .setName("minutos")
      .setDescription("Minutos restantes que muestra el juego (0 a 59)")
      .setMinValue(0)
      .setMaxValue(59)
      .setRequired(true)),
  new SlashCommandBuilder()
    .setName("mejoras")
    .setDescription("Consulta las prioridades de mejora de un personaje")
    .setDefaultMemberPermissions(null)
    .addStringOption((option) => option
      .setName("personaje")
      .setDescription("Nombre del personaje en NA East / Zikel")
      .setMinLength(2)
      .setMaxLength(32)
      .setRequired(true)),
  new SlashCommandBuilder()
    .setName("precio")
    .setDescription("Consulta el precio de un objeto en el mercado de Zikel")
    .setDefaultMemberPermissions(null)
    .addStringOption((option) => option
      .setName("articulo")
      .setDescription("Busca y selecciona un objeto del mercado")
      .setMinLength(2)
      .setAutocomplete(true)
      .setRequired(true)),
  new SlashCommandBuilder()
    .setName("alerta-precio")
    .setDescription("Recibe un mensaje privado si un objeto baja a tu precio")
    .setDefaultMemberPermissions(null)
    .addStringOption((option) => option
      .setName("articulo")
      .setDescription("Busca y selecciona el objeto")
      .setMinLength(2)
      .setAutocomplete(true)
      .setRequired(true))
    .addIntegerOption((option) => option
      .setName("maximo")
      .setDescription("Avísame cuando cueste este precio o menos, en kinah")
      .setMinValue(1)
      .setMaxValue(2_147_483_647)
      .setRequired(true)),
  new SlashCommandBuilder()
    .setName("buscar-grupo")
    .setDescription("Crea una convocatoria PvE con canal de voz temporal")
    .setDefaultMemberPermissions(null)
    .addStringOption((option) => option
      .setName("actividad")
      .setDescription("Mazmorra, jefe u otra actividad PvE")
      .setMinLength(2)
      .setMaxLength(80)
      .setRequired(true))
    .addIntegerOption((option) => option
      .setName("cupos")
      .setDescription("Tamaño total del grupo, incluyéndote")
      .setMinValue(2)
      .setMaxValue(25)
      .setRequired(true))
    .addStringOption((option) => option
      .setName("mi-rol")
      .setDescription("Tu rol para aparecer en la lista del grupo")
      .setRequired(true)
      .addChoices(...GROUP_ROLES.map(({ value, name }) => ({ name, value }))))
    .addStringOption((option) => option
      .setName("personaje")
      .setDescription("Nombre exacto del personaje en Kisk, NA East / Zikel")
      .setMinLength(2)
      .setMaxLength(32)
      .setRequired(true))
    .addIntegerOption((option) => option
      .setName("cp-minimo")
      .setDescription("Poder de combate mínimo (opcional)")
      .setMinValue(1)
      .setMaxValue(2_147_483_647)
      .setRequired(false))
    .addIntegerOption((option) => option
      .setName("tank")
      .setDescription("Cantidad total buscada, incluyendo al líder")
      .setMinValue(0)
      .setMaxValue(25)
      .setRequired(false))
    .addIntegerOption((option) => option
      .setName("dps")
      .setDescription("Cantidad total buscada, incluyendo al líder")
      .setMinValue(0)
      .setMaxValue(25)
      .setRequired(false))
    .addIntegerOption((option) => option
      .setName("cleric")
      .setDescription("Cantidad total buscada, incluyendo al líder")
      .setMinValue(0)
      .setMaxValue(25)
      .setRequired(false))
    .addIntegerOption((option) => option
      .setName("chanter")
      .setDescription("Cantidad total buscada, incluyendo al líder")
      .setMinValue(0)
      .setMaxValue(25)
      .setRequired(false)),
  new SlashCommandBuilder()
    .setName("mis-alertas")
    .setDescription("Muestra tus alertas personales de precio")
    .setDefaultMemberPermissions(null),
  new SlashCommandBuilder()
    .setName("quitar-alerta")
    .setDescription("Elimina una de tus alertas personales de precio")
    .setDefaultMemberPermissions(null)
    .addStringOption((option) => option
      .setName("id")
      .setDescription("ID que aparece en /mis-alertas")
      .setMinLength(8)
      .setMaxLength(8)
      .setRequired(true)),
  new SlashCommandBuilder()
    .setName("ayuda")
    .setDescription("Muestra las funciones disponibles del bot"),
  new SlashCommandBuilder()
    .setName("test")
    .setDescription("Envía una vista previa de un aviso de evento")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption((option) => option
      .setName("evento")
      .setDescription("Evento para la vista previa")
      .setRequired(true)
      .addChoices(
        { name: "SIEGE", value: "siege" },
        { name: "Guardian Lord Nahma", value: "nahma" },
      )),
  new SlashCommandBuilder()
    .setName("diagnostico-mercado")
    .setDescription("Comprueba la conexión de ACLClouds con aion2.exchange")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption((option) => option
      .setName("termino")
      .setDescription("Texto que quieres probar, por ejemplo sword")
      .setMinLength(2)
      .setMaxLength(80)
      .setRequired(false)),
];

async function registerGuildCommands(guild) {
  try {
    await guild.commands.set(SLASH_COMMANDS.map((command) => command.toJSON()));
    console.log(`✅ Comandos slash registrados en ${guild.name}.`);
  } catch (error) {
    console.error(`❌ No se pudieron registrar comandos slash en ${guild.name}: ${error.message}`);
  }
}

function buildGuildApplicationPanel() {
  const embed = new EmbedBuilder()
    .setColor(0xff0000)
    .setTitle("📨 Postulación a ZENTH")
    .setDescription(
      "¿Quieres unirte a la guild? Pulsa el botón y completa el formulario con tu personaje, servidor y región.\n\n" +
      "Se abrirá un ticket privado para que el equipo de reclutamiento revise tu postulación."
    )
    .setFooter({ text: "ZENTH AION 2 BOT • Reclutamiento" });
  const button = new ButtonBuilder()
    .setCustomId(APPLICATION_BUTTON_ID)
    .setLabel("Iniciar postulación")
    .setEmoji("📩")
    .setStyle(ButtonStyle.Primary);
  return { embeds: [embed], components: [new ActionRowBuilder().addComponents(button)] };
}

async function ensureGuildApplicationPanel(guild) {
  try {
    const channel = await client.channels.fetch(APPLICATION_PANEL_CHANNEL_ID);
    if (!channel?.isTextBased() || channel.guildId !== guild.id) return;
    const messages = await channel.messages.fetch({ limit: 100 });
    const existingPanel = messages.find((message) =>
      message.author.id === client.user.id &&
      message.components.some((row) => row.components.some((component) => component.customId === APPLICATION_BUTTON_ID)));
    if (existingPanel) {
      await existingPanel.edit(buildGuildApplicationPanel());
      console.log(`✅ Panel de postulación verificado en #${channel.name}.`);
      return;
    }
    await channel.send(buildGuildApplicationPanel());
    console.log(`✅ Panel de postulación publicado en #${channel.name}.`);
  } catch (error) {
    console.error(`❌ No se pudo publicar/verificar el panel de postulación: ${error.message}`);
  }
}

function buildGuildApplicationModal() {
  const characterInput = new TextInputBuilder()
    .setCustomId("character")
    .setLabel("Nombre del personaje")
    .setPlaceholder("Ejemplo: Kade")
    .setStyle(TextInputStyle.Short)
    .setMinLength(2)
    .setMaxLength(32)
    .setRequired(true);
  const serverInput = new TextInputBuilder()
    .setCustomId("server")
    .setLabel("Servidor")
    .setPlaceholder("Ejemplo: Zikel")
    .setStyle(TextInputStyle.Short)
    .setMaxLength(50)
    .setRequired(true);
  const regionInput = new TextInputBuilder()
    .setCustomId("region")
    .setLabel("Región")
    .setPlaceholder("NA East, NA West, Europe, South America o Asia")
    .setStyle(TextInputStyle.Short)
    .setMaxLength(30)
    .setRequired(true);
  return new ModalBuilder()
    .setCustomId(APPLICATION_MODAL_ID)
    .setTitle("Postulación a ZENTH")
    .addComponents(
      new ActionRowBuilder().addComponents(characterInput),
      new ActionRowBuilder().addComponents(serverInput),
      new ActionRowBuilder().addComponents(regionInput),
    );
}

async function getApplicationStaffTargets(guild) {
  const allow = [
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.ReadMessageHistory,
    PermissionFlagsBits.AttachFiles,
    PermissionFlagsBits.EmbedLinks,
    PermissionFlagsBits.ManageMessages,
  ];
  const targets = [];
  for (const id of APPLICATION_STAFF_IDS) {
    const role = guild.roles.cache.get(id) ?? await guild.roles.fetch(id).catch(() => null);
    if (role) {
      targets.push({ id, mention: `<@&${id}>`, kind: "role", overwrite: { id, allow } });
      continue;
    }
    const member = guild.members.cache.get(id) ?? await guild.members.fetch(id).catch(() => null);
    if (!member) throw new Error(`El responsable ${id} no se encontró como miembro ni como rol en el servidor.`);
    targets.push({ id, mention: `<@${id}>`, kind: "user", overwrite: { id, allow } });
  }
  return targets;
}

async function handleGuildApplicationButton(interaction) {
  if (interaction.channelId !== APPLICATION_PANEL_CHANNEL_ID) {
    await interaction.reply({ content: "Usa el botón del canal de postulaciones.", ephemeral: true });
    return;
  }
  await interaction.showModal(buildGuildApplicationModal());
}

async function handleGuildApplicationSubmit(interaction) {
  if (!interaction.guild) {
    await interaction.reply({ content: "Este formulario solo funciona dentro del servidor.", ephemeral: true });
    return;
  }
  await interaction.deferReply({ ephemeral: true });
  let ticketChannel;
  try {
    const characterName = interaction.fields.getTextInputValue("character").trim();
    const serverInput = interaction.fields.getTextInputValue("server").trim();
    const regionInput = interaction.fields.getTextInputValue("region").trim();
    const allChannels = await interaction.guild.channels.fetch();
    const category = allChannels.find((channel) =>
      channel?.type === ChannelType.GuildCategory && channel.name === APPLICATION_CATEGORY_NAME);
    if (!category) throw new Error(`No se encontró la categoría “${APPLICATION_CATEGORY_NAME}”.`);

    const existingTicket = allChannels.find((channel) =>
      channel?.type === ChannelType.GuildText &&
      channel.parentId === category.id &&
      channel.topic?.includes(`applicant:${interaction.user.id}`));
    if (existingTicket) {
      await interaction.editReply(`Ya tienes una postulación abierta: <#${existingTicket.id}>.`);
      return;
    }

    const staffTargets = await getApplicationStaffTargets(interaction.guild);
    let profile = null;
    let kiskStatus = "Perfil encontrado";
    try {
      const region = normalizeKiskRegion(regionInput);
      const server = normalizeKiskServer(serverInput);
      profile = await getCharacterProfile(characterName, { region, server });
    } catch (error) {
      kiskStatus = `No se pudo verificar en Kisk: ${error.message}`.slice(0, 1024);
      console.warn(`⚠️ Kisk no pudo validar la postulación de ${interaction.user.tag}: ${error.message}`);
    }

    const safeCharacter = characterName.normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase("en")
      .replace(/[^\p{L}\p{N}-]+/gu, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 65) || "jugador";
    const allowApplicant = [
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.SendMessages,
      PermissionFlagsBits.ReadMessageHistory,
      PermissionFlagsBits.AttachFiles,
      PermissionFlagsBits.EmbedLinks,
    ];
    const botMember = interaction.guild.members.me ?? await interaction.guild.members.fetch(client.user.id);
    const permissionOverwrites = [
      { id: interaction.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
      {
        id: botMember.id,
        allow: [...allowApplicant, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ManageMessages],
      },
      { id: interaction.user.id, allow: allowApplicant },
      ...staffTargets.map((target) => target.overwrite),
    ];
    const topic = `applicant:${interaction.user.id};character:${encodeURIComponent(profile?.characterName || characterName)};region:${encodeURIComponent(regionInput)};server:${encodeURIComponent(serverInput)}`.slice(0, 1024);
    ticketChannel = await interaction.guild.channels.create({
      name: `postulacion-${safeCharacter}`.slice(0, 100),
      type: ChannelType.GuildText,
      parent: category.id,
      topic,
      permissionOverwrites,
      reason: `Postulación de ${interaction.user.tag} para ZENTH`,
    });

    const profileEmbed = new EmbedBuilder()
      .setColor(0xff0000)
      .setTitle("📨 Nueva postulación a ZENTH")
      .setDescription(`Solicitud de <@${interaction.user.id}> para unirse a la guild.`)
      .addFields(
        { name: "🎮 Personaje", value: profile?.characterName || characterName, inline: true },
        { name: "🌎 Región", value: regionInput.slice(0, 100), inline: true },
        { name: "🖥️ Servidor", value: (profile?.serverName || serverInput).slice(0, 100), inline: true },
        { name: "⚔️ Clase", value: profile?.className || "No disponible", inline: true },
        { name: "🛡️ Facción", value: profile?.faction || "No disponible", inline: true },
        { name: "💪 CP", value: profile?.combatPower || "No disponible", inline: true },
        { name: "🔎 Verificación Kisk", value: kiskStatus, inline: false },
      )
      .setFooter({ text: `Postulación de ${interaction.user.tag}` })
      .setTimestamp();
    if (profile?.url) profileEmbed.setURL(profile.url);
    if (profile?.profileImageUrl) profileEmbed.setThumbnail(profile.profileImageUrl);

    const allowedMentions = { parse: [], users: [interaction.user.id], roles: [] };
    for (const target of staffTargets) {
      if (target.kind === "user") allowedMentions.users.push(target.id);
      else allowedMentions.roles.push(target.id);
    }
    await ticketChannel.send({
      content: `<@${interaction.user.id}> ${staffTargets.map((target) => target.mention).join(" ")}`,
      embeds: [profileEmbed],
      components: buildApplicationControls("pending"),
      allowedMentions,
    });
    let nicknameNote = "";
    try {
      const applicant = await interaction.guild.members.fetch(interaction.user.id);
      await applicant.setNickname(profile?.characterName || characterName, "Nombre de personaje de la postulación");
      nicknameNote = ` También actualicé tu apodo del servidor a **${profile?.characterName || characterName}**.`;
    } catch (error) {
      nicknameNote = " No pude cambiar tu apodo; un administrador puede actualizarlo manualmente.";
      console.warn(`⚠️ No se pudo actualizar el apodo de ${interaction.user.tag}: ${error.message}`);
    }
    await interaction.editReply(`Tu postulación quedó abierta: <#${ticketChannel.id}>.${nicknameNote}`);
  } catch (error) {
    if (ticketChannel) await ticketChannel.delete("No se pudo publicar la información de la postulación").catch(() => {});
    console.error(`❌ No se pudo crear la postulación: ${error.message}`);
    await interaction.editReply(`No pude abrir el ticket. ${error.message}`);
  }
}

function buildApplicationCloseRow() {
  const closeButton = new ButtonBuilder()
    .setCustomId(APPLICATION_CLOSE_BUTTON_ID)
    .setLabel("Cerrar postulación")
    .setEmoji("🔒")
    .setStyle(ButtonStyle.Secondary);
  return new ActionRowBuilder().addComponents(closeButton);
}

function buildApplicationControls(status) {
  if (status === "closed") {
    const deleteButton = new ButtonBuilder()
      .setCustomId(APPLICATION_DELETE_BUTTON_ID)
      .setLabel("Borrar")
      .setEmoji("🗑️")
      .setStyle(ButtonStyle.Danger);
    return [new ActionRowBuilder().addComponents(deleteButton)];
  }
  if (status === "approved" || status === "rejected") {
    return [buildApplicationCloseRow()];
  }
  const approveButton = new ButtonBuilder()
    .setCustomId(APPLICATION_APPROVE_BUTTON_ID)
    .setLabel("Aprobar")
    .setEmoji("✅")
    .setStyle(ButtonStyle.Success);
  const rejectButton = new ButtonBuilder()
    .setCustomId(APPLICATION_REJECT_BUTTON_ID)
    .setLabel("Rechazar")
    .setEmoji("❌")
    .setStyle(ButtonStyle.Danger);
  return [
    new ActionRowBuilder().addComponents(approveButton, rejectButton),
    buildApplicationCloseRow(),
  ];
}

function getGuildApplicationContext(channel) {
  const applicantId = channel?.topic?.match(/applicant:(\d{17,20})/)?.[1];
  const encodedCharacter = channel?.topic?.match(/(?:^|;)character:([^;]+)(?:;|$)/)?.[1];
  const status = channel?.topic?.match(/(?:^|;)status:(pending|approved|rejected|closed)(?:;|$)/)?.[1] || "pending";
  if (!applicantId) return null;
  let characterName = channel.name.replace(/^postulacion-/, "");
  if (encodedCharacter) {
    try {
      characterName = decodeURIComponent(encodedCharacter);
    } catch {
      // Si el tema guardado no se puede decodificar, se usa el nombre del canal.
    }
  } else {
    const legacyCharacter = channel.topic?.match(/Postulación de (.+?)\s*[·|]\s*applicant:/i)?.[1];
    if (legacyCharacter) characterName = legacyCharacter.trim();
  }
  return { applicantId, characterName, status };
}

async function updateGuildApplicationCard(channel, status, color, decision) {
  const topic = (channel.topic || "").replace(/;status:(?:pending|approved|rejected|closed)/g, "");
  await channel.setTopic(`${topic};status:${decision}`.slice(0, 1024));
  const messages = await channel.messages.fetch({ limit: 50 });
  const card = messages.find((message) =>
    message.author.id === client.user.id &&
    message.embeds.some((embed) => embed.title === "📨 Nueva postulación a ZENTH"));
  if (!card) return;
  const embed = EmbedBuilder.from(card.embeds[0])
    .setColor(color)
    .setFields(
      ...card.embeds[0].fields.filter((field) => field.name !== "📌 Estado"),
      { name: "📌 Estado", value: status, inline: false },
    );
  await card.edit({ embeds: [embed], components: buildApplicationControls(decision) });
}

async function refreshGuildApplicationTickets(guild) {
  try {
    const allChannels = await guild.channels.fetch();
    const category = allChannels.find((channel) =>
      channel?.type === ChannelType.GuildCategory && channel.name === APPLICATION_CATEGORY_NAME);
    if (!category) return;

    for (const channel of allChannels.values()) {
      if (channel?.type !== ChannelType.GuildText || channel.parentId !== category.id) continue;
      const application = getGuildApplicationContext(channel);
      if (!application) continue;
      if (!channel.topic?.includes(";character:")) {
        const topic = `applicant:${application.applicantId};character:${encodeURIComponent(application.characterName)};status:${application.status}`;
        await channel.setTopic(topic.slice(0, 1024));
      }
      if (application.status === "closed") {
        await channel.permissionOverwrites.delete(application.applicantId).catch(() => {});
      }

      const messages = await channel.messages.fetch({ limit: 50 });
      const card = messages.find((message) =>
        message.author.id === client.user.id &&
        message.embeds.some((embed) => embed.title === "📨 Nueva postulación a ZENTH"));
      if (card) {
        await card.edit({ components: buildApplicationControls(application.status) });
      }
    }
  } catch (error) {
    console.error(`❌ No se pudieron actualizar los controles de los tickets abiertos: ${error.message}`);
  }
}

async function canDecideGuildApplication(interaction) {
  if (interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) return true;
  if (APPLICATION_STAFF_IDS.includes(interaction.user.id)) return true;
  const member = await interaction.guild?.members.fetch(interaction.user.id).catch(() => null);
  return APPLICATION_STAFF_IDS.some((id) => member?.roles.cache.has(id));
}

function buildApplicationRejectionModal(channelId) {
  const reasonInput = new TextInputBuilder()
    .setCustomId("reason")
    .setLabel("Motivo del rechazo")
    .setPlaceholder("Explica brevemente por qué no fue aceptada la postulación")
    .setStyle(TextInputStyle.Paragraph)
    .setMinLength(5)
    .setMaxLength(1000)
    .setRequired(true);
  return new ModalBuilder()
    .setCustomId(`${APPLICATION_REJECT_MODAL_PREFIX}${channelId}`)
    .setTitle("Rechazar postulación")
    .addComponents(new ActionRowBuilder().addComponents(reasonInput));
}

async function handleGuildApplicationDecisionButton(interaction, decision) {
  if (!(await canDecideGuildApplication(interaction))) {
    await interaction.reply({ content: "Solo los administradores o el equipo de reclutamiento pueden aprobar o rechazar postulaciones.", ephemeral: true });
    return;
  }
  const channel = interaction.channel;
  const application = getGuildApplicationContext(channel);
  if (!interaction.guild || !channel || channel.type !== ChannelType.GuildText || !application) {
    await interaction.reply({ content: "Este botón no pertenece a un ticket de postulación válido.", ephemeral: true });
    return;
  }
  if (application.status !== "pending") {
    await interaction.reply({ content: "Esta postulación ya tiene una decisión registrada.", ephemeral: true });
    return;
  }

  if (decision === "reject") {
    await interaction.showModal(buildApplicationRejectionModal(channel.id));
    return;
  }

  await interaction.deferReply({ ephemeral: true });
  const applicant = await interaction.guild.members.fetch(application.applicantId).catch(() => null);
  if (applicant) {
    try {
      await applicant.setNickname(application.characterName, "Postulación a ZENTH aprobada");
    } catch (error) {
      console.warn(`⚠️ No se pudo actualizar el apodo al aprobar a ${applicant.user.tag}: ${error.message}`);
    }
  }
  await channel.send({
    content:
      `<@${application.applicantId}> ✅ **¡Tu postulación ha sido aprobada!** ` +
      `Ya puedes aplicar **a la guild ZENTH dentro del juego**.`,
    allowedMentions: { parse: [], users: [application.applicantId] },
  });
  await updateGuildApplicationCard(channel, "✅ Aprobada", 0x2ecc71, "approved");
  await interaction.editReply(
    applicant
      ? `Postulación aprobada. El apodo del servidor quedó como **${application.characterName}**.`
      : "Postulación aprobada. La persona ya no está en el servidor, así que no pude actualizar su apodo."
  );
}

async function handleGuildApplicationRejectionSubmit(interaction) {
  if (!(await canDecideGuildApplication(interaction))) {
    await interaction.reply({ content: "Solo los administradores o el equipo de reclutamiento pueden rechazar postulaciones.", ephemeral: true });
    return;
  }
  await interaction.deferReply({ ephemeral: true });
  const channelId = interaction.customId.slice(APPLICATION_REJECT_MODAL_PREFIX.length);
  const channel = await client.channels.fetch(channelId).catch(() => null);
  const application = getGuildApplicationContext(channel);
  if (!interaction.guild || !channel || channel.guildId !== interaction.guildId ||
      channel.type !== ChannelType.GuildText || !application) {
    await interaction.editReply("No encontré el ticket asociado a este rechazo.");
    return;
  }
  if (application.status !== "pending") {
    await interaction.editReply("Esta postulación ya tiene una decisión registrada.");
    return;
  }

  const reason = interaction.fields.getTextInputValue("reason").trim();
  if (reason.length < 5) {
    await interaction.editReply("Escribe un motivo de al menos 5 caracteres.");
    return;
  }
  await channel.send({
    content:
      `<@${application.applicantId}> ❌ **Tu postulación no fue aceptada.**\n` +
      `**Motivo:** ${reason}`,
    allowedMentions: { parse: [], users: [application.applicantId] },
  });
  await updateGuildApplicationCard(channel, "❌ Rechazada", 0xe74c3c, "rejected");
  await interaction.editReply("Rechazo enviado al ticket con el motivo indicado.");
}

async function handleGuildApplicationClose(interaction) {
  const ticketChannel = interaction.channel;
  const application = getGuildApplicationContext(ticketChannel);
  if (!interaction.guild || !ticketChannel || ticketChannel.type !== ChannelType.GuildText || !application) {
    await interaction.reply({ content: "Este botón no pertenece a un ticket de postulación.", ephemeral: true });
    return;
  }

  const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
  const isApplicant = interaction.user.id === application.applicantId;
  const isStaff = APPLICATION_STAFF_IDS.some((id) =>
    id === interaction.user.id || member?.roles.cache.has(id));
  const isAdmin = interaction.memberPermissions?.has(PermissionFlagsBits.Administrator);
  if (!isApplicant && !isStaff && !isAdmin) {
    await interaction.reply({ content: "Solo quien postuló, el equipo de reclutamiento o un administrador puede cerrar este ticket.", ephemeral: true });
    return;
  }

  if (application.status === "closed") {
    await interaction.reply({ content: "Esta postulación ya está cerrada. El equipo puede borrarla con el botón correspondiente.", ephemeral: true });
    return;
  }

  await interaction.deferReply({ ephemeral: true });
  await ticketChannel.permissionOverwrites.delete(
    application.applicantId,
    `Acceso retirado al cerrar la postulación por ${interaction.user.tag}`,
  );
  await updateGuildApplicationCard(ticketChannel, "🔒 Cerrada", 0x7f8c8d, "closed");
  await interaction.editReply("🔒 Postulación cerrada. Se quitó el acceso del postulante; el canal queda disponible para el equipo hasta que pulsen **Borrar**.");
}

async function handleGuildApplicationDelete(interaction) {
  if (!(await canDecideGuildApplication(interaction))) {
    await interaction.reply({ content: "Solo los administradores o el equipo de reclutamiento pueden borrar tickets.", ephemeral: true });
    return;
  }
  const channel = interaction.channel;
  const application = getGuildApplicationContext(channel);
  if (!channel || channel.type !== ChannelType.GuildText || !application) {
    await interaction.reply({ content: "Este botón no pertenece a un ticket de postulación válido.", ephemeral: true });
    return;
  }
  if (application.status !== "closed") {
    await interaction.reply({ content: "Primero cierra la postulación. El botón Borrar solo está disponible después del cierre.", ephemeral: true });
    return;
  }
  await interaction.reply({ content: "🗑️ Ticket borrado.", ephemeral: true });
  await channel.delete(`Ticket de postulación borrado por ${interaction.user.tag}`);
}

// ─── Registro de Crons ────────────────────────────────────────────────────────
let scheduledJobs = [];

function registerSchedules() {
  console.log("\n📅 Registrando horarios de eventos:\n");

  for (const event of EVENTS) {
    for (const schedule of event.schedules) {
      // node-cron usa formato: segundo minuto hora día-mes mes día-semana
      // Con timezone de Eastern Time
      const job = cron.schedule(
        schedule.cron,
        async () => {
          console.log(`\n🔔 Disparando notificación: ${event.name} (${schedule.label})`);
          
          try {
            const channel = await client.channels.fetch(CHANNEL_ID);
            if (!channel || !channel.isTextBased()) {
              console.error(`❌ No se encontró el canal con ID: ${CHANNEL_ID}`);
              return;
            }
            await sendEventNotification(channel, event, schedule.label, MENTION_ROLE);
            if (event.id === "siege_zikel") {
              await sendSiegeRoleDirectMessages(channel.guild, schedule.label);
            }
          } catch (err) {
            console.error(`❌ Error al obtener el canal: ${err.message}`);
          }
        },
        {
          timezone: BOT_CONFIG.serverTimezone,
          scheduled: true,
        }
      );

      scheduledJobs.push(job);
      console.log(
        `  ✅ [${event.name}] → ${schedule.label} a las 20:00 ET (1h antes del evento)`
      );
    }
  }

  console.log(`\n📊 Total de trabajos programados: ${scheduledJobs.length}\n`);
}

async function sendSiegeRoleDirectMessages(guild, dayLabel) {
  try {
    const members = await guild.members.fetch();
    const recipients = members.filter((member) =>
      !member.user.bot && member.roles.cache.has(SIEGE_DM_ROLE_ID));
    if (recipients.size === 0) {
      console.log(`ℹ️ No hay miembros humanos con el rol de aviso SIEGE ${SIEGE_DM_ROLE_ID}.`);
      return;
    }

    const siegeTimestamp = Math.floor(Date.now() / 1000) + 60 * 60;
    let sent = 0;
    let failed = 0;
    for (const member of recipients.values()) {
      const message =
        `Hola, **${member.displayName}** 👋\n\n` +
        `⏰ Falta **1 hora** para el **SIEGE de AION 2 · NA East / Zikel** (${dayLabel}).\n` +
        `El evento comienza <t:${siegeTimestamp}:R> · <t:${siegeTimestamp}:t> ET.\n\n` +
        `🔊 Entra a la [Call principal](https://discord.com/channels/1135023134945320960/1356438589294252072) ` +
        `para organizar las parties. Cuando te asignen, ingresa a tu canal de voz correspondiente.\n\n` +
        `Este es un recordatorio personal para los miembros del rol de Siege.`;
      try {
        await member.send({ content: message, allowedMentions: { parse: [] } });
        sent += 1;
      } catch (error) {
        failed += 1;
        console.warn(`⚠️ No se pudo enviar el DM de SIEGE a ${member.user.tag}: ${error.message}`);
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    console.log(`📩 DMs personalizados de SIEGE: ${sent} enviados, ${failed} no entregados (rol ${SIEGE_DM_ROLE_ID}).`);
  } catch (error) {
    console.error(`❌ No se pudieron obtener los miembros del rol para el DM de SIEGE: ${error.message}`);
  }
}

function registerWorldBossSchedules() {
  const worldBosses = [
    {
      name: "Watcher Kaira",
      // Spawn cada 3 horas desde las 01:00 ET; avisar 10 minutos antes.
      cron: "0 50 0,3,6,9,12,15,18,21 * * *",
    },
    {
      name: "Argo, the Spirit King",
      // Spawn diario a las 10:30 y 22:30 ET; avisar 10 minutos antes.
      cron: "0 20 10,22 * * *",
    },
  ];

  for (const boss of worldBosses) {
    const job = cron.schedule(boss.cron, async () => {
      const spawnTimestamp = Math.floor(Date.now() / 1000) + 10 * 60;
      try {
        const channel = await client.channels.fetch(WORLD_BOSS_CHANNEL_ID);
        if (!channel?.isTextBased()) {
          console.error(`❌ No se encontró el canal de World Boss ${WORLD_BOSS_CHANNEL_ID}.`);
          return;
        }
        await channel.send({
          content:
            `<@&${WORLD_BOSS_ROLE_ID}> 🔔 **${boss.name} aparece en 10 minutos.**\n` +
            `Hora de aparición: <t:${spawnTimestamp}:t> ET · NA East / Zikel.`,
          allowedMentions: { parse: [], roles: [WORLD_BOSS_ROLE_ID] },
        });
        console.log(`🔔 Aviso enviado para ${boss.name}; solo se mencionó el rol configurado.`);
      } catch (error) {
        console.error(`❌ No se pudo enviar el aviso de ${boss.name}: ${error.message}`);
      }
    }, { timezone: BOT_CONFIG.serverTimezone });

    scheduledJobs.push(job);
    console.log(`  ✅ [World Boss] ${boss.name} → ${boss.cron} (${BOT_CONFIG.serverTimezone})`);
  }

}

// ─── Comando !eventos ─────────────────────────────────────────────────────────
let checkingPriceAlerts = false;
const privateAlertRetryAfter = new Map();

async function checkPriceAlerts() {
  if (checkingPriceAlerts) return;
  checkingPriceAlerts = true;
  try {
    const alerts = await getActivePriceAlerts();
    for (const alert of alerts) {
      if ((privateAlertRetryAfter.get(alert.id) || 0) > Date.now()) continue;
      try {
        const item = await getMarketItem(alert.itemKey);
        const currentPrice = Number(item.price);
        if (item.on_market !== true || !Number.isFinite(currentPrice) || currentPrice > alert.maxPrice) continue;

        const user = await client.users.fetch(alert.userId);
        try {
          await user.send(
            `🔔 **¡Se activó tu alerta de precio!**\n` +
            `**${item.name || alert.itemName}** está publicado a **${new Intl.NumberFormat("es-CO").format(currentPrice)} kinah** ` +
            `(tu máximo: ${new Intl.NumberFormat("es-CO").format(alert.maxPrice)} kinah) en NA East · Zikel.`,
          );
        } catch (error) {
          privateAlertRetryAfter.set(alert.id, Date.now() + 15 * 60 * 1000);
          console.warn(`⚠️ No se pudo enviar por DM la alerta ${alert.id}; revisaré de nuevo en 15 minutos: ${error.message}`);
          continue;
        }
        await removeTriggeredPriceAlert(alert.id);
        privateAlertRetryAfter.delete(alert.id);
        console.log(`🔔 Alerta ${alert.id} enviada por mensaje directo; alerta de un solo uso eliminada.`);
      } catch (error) {
        console.error(`❌ No se pudo revisar la alerta ${alert.id}: ${error.message}`);
      }
    }
  } catch (error) {
    console.error(`❌ No se pudieron cargar las alertas de precio: ${error.message}`);
  } finally {
    checkingPriceAlerts = false;
  }

  const timerJob = cron.schedule("* * * * *", () => void checkWorldBossRespawns());
  scheduledJobs.push(timerJob);
  console.log("  ✅ [World Boss] Revisando temporizadores ingresados cada minuto.");
}

let checkingWorldBossTimers = false;

async function checkWorldBossRespawns() {
  if (checkingWorldBossTimers) return;
  checkingWorldBossTimers = true;
  try {
    const dueTimers = await getDueWorldBossTimers();
    if (dueTimers.length === 0) return;

    const channel = await client.channels.fetch(WORLD_BOSS_CHANNEL_ID);
    if (!channel?.isTextBased()) {
      console.error(`❌ No se encontró el canal de World Boss ${WORLD_BOSS_CHANNEL_ID}.`);
      return;
    }

    for (const timer of dueTimers) {
      const spawnTimestamp = Math.floor(Date.parse(timer.spawnAt) / 1000);
      await channel.send({
        content:
          `<@&${WORLD_BOSS_ROLE_ID}> 🔔 **${timer.boss}** reaparecerá <t:${spawnTimestamp}:R> ` +
          `(<t:${spawnTimestamp}:t> ET · NA East / Zikel).`,
        allowedMentions: { parse: [], roles: [WORLD_BOSS_ROLE_ID] },
      });
      await markWorldBossTimerNotified(timer.id);
      console.log(`🔔 Aviso de reaparición enviado para ${timer.boss}.`);
    }
  } catch (error) {
    console.error(`❌ No se pudieron procesar los temporizadores de World Boss: ${error.message}`);
  } finally {
    checkingWorldBossTimers = false;
  }
}

function buildEventsEmbed(now = new Date()) {
  const timezone = BOT_CONFIG.serverTimezone;
  const serverDateParts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(now);
  const datePart = (type) => Number(serverDateParts.find((part) => part.type === type).value);
  const serverDate = new Date(Date.UTC(datePart("year"), datePart("month") - 1, datePart("day")));
  const mondayOffset = (serverDate.getUTCDay() + 6) % 7;
  const monday = new Date(serverDate);
  monday.setUTCDate(monday.getUTCDate() - mondayOffset);
  const sunday = new Date(monday);
  sunday.setUTCDate(sunday.getUTCDate() + 6);
  const formatWeekDate = (date) => new Intl.DateTimeFormat("es-ES", {
    timeZone: "UTC",
    day: "numeric",
    month: "long",
  }).format(date);
  const weekEvents = EVENTS.map((event) => {
    const schedulesThisWeek = event.schedules.map((schedule) => {
      const cronDay = Number(schedule.cron.trim().split(/\s+/)[5]);
      const weekdayOffset = cronDay === 0 ? 6 : cronDay - 1;
      const eventDate = new Date(monday);
      eventDate.setUTCDate(eventDate.getUTCDate() + weekdayOffset);
      return { schedule, eventDate };
    });

    return { event, schedulesThisWeek };
  });

  const embed = new EmbedBuilder()
    .setColor(0xff0000)
    .setTitle("📅 Eventos de esta semana - AION 2 • NA East • Zikel")
    .setDescription(`Semana del **${formatWeekDate(monday)} al ${formatWeekDate(sunday)}**. El bot avisará **1 hora antes** de cada evento.`)
    .addFields(weekEvents.map(({ event, schedulesThisWeek }) => ({
      name: event.id === "siege_zikel" ? "⚔️ SIEGE - Artifact Siege + Bosses" : `👑 ${event.name}`,
      value: schedulesThisWeek.map(({ schedule, eventDate }) => {
        const weekday = new Intl.DateTimeFormat("es-ES", {
          timeZone: "UTC",
          weekday: "long",
        }).format(eventDate);
        const capitalizedWeekday = weekday.charAt(0).toLocaleUpperCase("es-ES") + weekday.slice(1);
        return `📅 **${capitalizedWeekday} ${formatWeekDate(eventDate)}** a las **${event.eventTime}**\n` +
          "📍 Chaotic Lower Reshanta (Abismo)\n" +
          "⏰ Aviso: 20:00 ET";
      }).join("\n\n"),
      inline: false,
    })))
    .addFields({
      name: "🕐 Hora actual del servidor",
      value: `\`${new Intl.DateTimeFormat("es-ES", {
        timeZone: "America/New_York",
        weekday: "long",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(now)} ET\``,
      inline: false,
    })
    .setFooter({ text: `ZENTH AION 2 BOT • ${BOT_CONFIG.footerText}` })
    .setTimestamp(now);

  return embed;
}

async function handleEventsCommand(message) {
  if (message.content.toLowerCase() !== "!eventos") return;
  if (message.author.bot) return;
  await message.reply({ embeds: [buildEventsEmbed()] });
}

// ─── Comando !mejoras <personaje> ────────────────────────────────────────────
function buildUpgradeEmbed(report) {
  const recommendations = report.cards.map((card, index) => {
    const grade = card.currentGrade && card.targetGrade
      ? `**${card.currentGrade} → ${card.targetGrade}**`
      : "**Objetivo: S+**";
    const average = card.average ? ` · ${card.average}` : "";
    const firstStep = card.steps[0] ? `\n• ${card.steps[0]}` : "";
    return `**${index + 1}. ${card.name}**\n${grade}${average}${firstStep}`;
  }).join("\n\n");
  const characterDetails = [
    report.faction,
    report.className,
    report.serverName && `NA East / ${report.serverName}`,
    report.legion,
    report.combatPower,
  ].filter(Boolean).join(" · ");

  const embed = new EmbedBuilder()
    .setColor(0xff0000)
    .setTitle(`Mejoras para ${report.characterName}`)
    .setURL(report.url)
    .setDescription(
      `${characterDetails ? `**${characterDetails}**\n\n` : ""}` +
      `⚠️ **Ten cuidado:** algunas habilidades pasivas pueden aparecer como líneas de estadísticas poco recomendadas. Revisa si la pasiva sirve para tu build antes de rerollearla.\n\n` +
      recommendations
    )
    .setFooter({ text: "Recomendaciones de Kisk.app · Abre el enlace para ver todas las piezas" })
    .setTimestamp();

  if (report.profileImageUrl) embed.setThumbnail(report.profileImageUrl);
  return embed;
}

async function handleUpgradesCommand(message) {
  if (message.author.bot) return;

  const match = message.content.match(/^!mejoras(?:\s+(.+))?$/iu);
  if (!match) return;

  const characterName = match[1]?.trim();
  if (!characterName) {
    await message.reply("Uso: `!mejoras <nombre del personaje>` (busca en NA East / Zikel).");
    return;
  }
  if (!/^[\p{L}\p{N} .'’_-]{2,32}$/u.test(characterName)) {
    await message.reply("Ese nombre no parece válido. Usa solo el nombre del personaje, sin menciones ni enlaces.");
    return;
  }

  const cooldown = upgradeCooldownSeconds(message.author.id);
  if (cooldown > 0) {
    await message.reply(`Espera ${cooldown} segundos antes de volver a consultar mejoras.`);
    return;
  }

  const loadingMessage = await message.reply(`🔎 Consultando mejoras de **${characterName}** en Kisk…`);

  try {
    const report = await getUpgradeReport(characterName);
    await loadingMessage.edit({ content: "", embeds: [buildUpgradeEmbed(report)] });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "No se pudo completar la consulta.";
    await loadingMessage.edit(`${detail}\nFicha: https://kisk.app/c/nae/zikel/${encodeURIComponent(characterName)}/upgrades`);
  }
}

// ─── Comando !help ────────────────────────────────────────────────────────────
function buildHelpEmbed() {
  const embed = new EmbedBuilder()
    .setColor(0xff0000)
    .setTitle("🤖 Comandos disponibles — ZENTH AION 2 BOT")
    .addFields(
      {
        name: "📋 Generales",
        value:
          "`/eventos` → Muestra el calendario de eventos de la semana\n" +
          "`/asistencia` → Envía al canal de registro la fecha y la lista de personas en tu voz\n" +
          "`/temporizador-jefe` → Programa el aviso de Gartua, Lagta, Kashapa o Dartan con el tiempo del juego\n" +
          "`/mejoras personaje` → Consulta prioridades de mejora para Zikel\n" +
          "`/precio articulo` → Consulta precios publicados en el mercado de Zikel\n" +
          "`/alerta-precio articulo maximo` → Recibe un aviso privado al alcanzar ese precio\n" +
          "`/mis-alertas` y `/quitar-alerta id` → Administra tus alertas (máximo 5)\n" +
          `Comandos del mercado: solo en <#${MARKET_CHANNEL_ID}>.\n` +
          "`/buscar-grupo` → Crea un grupo PvE por Tank/DPS/Cleric/Chanter y valida personaje/CP en Kisk\n" +
          "`/ayuda` → Muestra este mensaje\n" +
          "`/test evento` → Vista previa del aviso (administradores)\n" +
          "También siguen disponibles los comandos con `!`.",
        inline: false,
      },
      {
        name: "🔔 Avisos automáticos",
        value:
          "El bot avisa **1 hora antes** de cada evento:\n" +
          "⚔️ SIEGE → Jueves & Sábados a las **20:00 ET**\n" +
          "👑 Nahma → Viernes & Domingos a las **20:00 ET**\n\n" +
          "Avisos automáticos de World Boss **10 minutos antes**:\n" +
          "👁️ Watcher Kaira → Cada 3 horas desde la 01:00 ET\n" +
          "👑 Argo, the Spirit King → Diario a las 10:30 y 22:30 ET\n" +
          "⚔️ SIEGE → También envía un DM personal a los miembros con el rol de SIEGE.\n" +
          "Para Gartua, Lagta, Kashapa o Dartan, copia en `/temporizador-jefe` el tiempo restante que muestra el juego.",
        inline: false,
      }
    )
    .setFooter({ text: `ZENTH AION 2 BOT • ${BOT_CONFIG.footerText}` })
    .setTimestamp();

  return embed;
}

async function handleHelpCommand(message) {
  if (message.content.toLowerCase().trim() !== "!help") return;
  if (message.author.bot) return;
  await message.reply({ embeds: [buildHelpEmbed()] });
}

// ─── Comando !test siege / !test nahma ───────────────────────────────────────
async function handleTestCommand(message) {
  const cmd = message.content.toLowerCase().trim();
  if (!cmd.startsWith("!test")) return;
  if (message.channelId !== CHANNEL_ID) return;

  let targetEvent = null;
  if (cmd === "!test siege") {
    targetEvent = EVENTS.find((e) => e.id === "siege_zikel");
  } else if (cmd === "!test nahma") {
    targetEvent = EVENTS.find((e) => e.id === "guardian_lord_nahma");
  } else {
    return;
  }

  if (!targetEvent) {
    await message.reply("❌ Evento no encontrado.");
    return;
  }

  console.log(`\n🧪 Comando '${cmd}' ejecutado por ${message.author.tag}`);

  try {
    const channel = await client.channels.fetch(CHANNEL_ID);
    await message.reply(`🧪 **Enviando preview de ${targetEvent.name}...**`);
    await sendEventNotification(channel, targetEvent, targetEvent.schedules[0].label, MENTION_ROLE);
  } catch (err) {
    console.error(`❌ Error en test: ${err.message}`);
    await message.reply(`❌ Error al enviar el test: ${err.message}`);
  }
}

function roleInfoFor(value) {
  return GROUP_ROLES.find((entry) => entry.value === value) || { name: "Rol pendiente", emoji: "▫️" };
}

function countRoleParticipants(group, roleValue) {
  return group.participants.filter((participant) => participant.roleValue === roleValue).length;
}

function normalizeDesiredRoles(desiredRoles, leaderRole, maxMembers) {
  const normalized = Object.fromEntries(GROUP_ROLES.map((entry) => [
    entry.value,
    Math.max(0, Number(desiredRoles?.[entry.value] || 0)),
  ]));
  if (!GROUP_ROLES.some((entry) => entry.value === leaderRole) || normalized[leaderRole] > 0) {
    return { desiredRoles: normalized, adjustment: null };
  }

  const donor = GROUP_ROLES
    .filter((entry) => entry.value !== leaderRole && normalized[entry.value] > 0)
    .sort((left, right) => normalized[right.value] - normalized[left.value])[0];
  if (!donor) {
    normalized[leaderRole] = 1;
    return { desiredRoles: normalized, adjustment: null };
  }

  const total = Object.values(normalized).reduce((sum, count) => sum + count, 0);
  normalized[leaderRole] += 1;
  let adjustment = null;
  if (total + 1 > maxMembers) {
    normalized[donor.value] -= 1;
    adjustment = { from: donor, to: roleInfoFor(leaderRole) };
  }
  return { desiredRoles: normalized, adjustment };
}

function missingRoleSlots(group, participants = group.participants) {
  return GROUP_ROLES.reduce((sum, entry) => {
    const target = Number(group.desiredRoles?.[entry.value] || 0);
    const current = participants.filter((participant) => participant.roleValue === entry.value).length;
    return sum + Math.max(0, target - current);
  }, 0);
}

function missingRoleEntries(group) {
  if (group.status === "closed") return [];
  return GROUP_ROLES
    .map((entry) => ({
      ...entry,
      missing: Math.max(0, Number(group.desiredRoles?.[entry.value] || 0) - countRoleParticipants(group, entry.value)),
    }))
    .filter((entry) => entry.missing > 0);
}

function findGuildRole(guild, roleValue) {
  const wantedName = roleInfoFor(roleValue).name.toLocaleLowerCase();
  return guild?.roles.cache.find((role) => role.name.trim().toLocaleLowerCase() === wantedName) || null;
}

function pingableMissingRoles(group, guild) {
  return missingRoleEntries(group)
    .map((entry) => ({ ...entry, guildRole: findGuildRole(guild, entry.value) }))
    .filter((entry) => entry.guildRole);
}

function combatPowerNumber(value) {
  const digits = String(value || "").replace(/\D/g, "");
  const parsed = Number(digits);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function cleanGameClass(value) {
  return value?.replace(/^Lv\s*\d+\s+/i, "").trim() || "Clase no indicada";
}

function buildPveGroupEmbed(group, guild = null) {
  const closed = group.status === "closed";
  const full = group.participants.length >= group.maxMembers;
  const status = closed ? "⛔ ACTIVIDAD CERRADA" : full ? "✅ GRUPO COMPLETO" : "🟢 RECLUTANDO";
  const missingRoles = missingRoleEntries(group).map((entry) => {
    const role = findGuildRole(guild, entry.value);
    const roleLabel = role ? `<@&${role.id}>` : `**${entry.name}**`;
    return `${entry.emoji} **${entry.missing}×** ${roleLabel}`;
  });
  const flexibleSlots = Math.max(0, group.maxMembers - group.participants.length - missingRoleSlots(group));
  const shownParticipants = group.participants.slice(0, 15);
  const roster = shownParticipants.length
    ? shownParticipants.map((participant, index) => {
      const role = roleInfoFor(participant.roleValue);
      const characterClass = participant.characterClass ? ` · ${participant.characterClass}` : "";
      const cp = combatPowerNumber(participant.combatPower);
      const cpText = cp ? ` · **${new Intl.NumberFormat("es-CO").format(cp)} CP**` : " · CP pendiente";
      const characterName = participant.characterName ? `**${participant.characterName}** · ` : "";
      return `**${String(index + 1).padStart(2, "0")}**  <@${participant.userId}>  ${characterName}${role.emoji} **${role.name}**${characterClass}${cpText}`;
    }).join("\n") + (group.participants.length > shownParticipants.length
      ? `\n*Y ${group.participants.length - shownParticipants.length} miembros más*`
      : "")
    : "Todavía no hay participantes.";
  const progressBlocks = 10;
  const filledBlocks = group.maxMembers > 0
    ? Math.round((group.participants.length / group.maxMembers) * progressBlocks)
    : 0;
  const progressBar = `${"▰".repeat(filledBlocks)}${"▱".repeat(progressBlocks - filledBlocks)}`;
  const embed = new EmbedBuilder()
    .setColor(closed ? 0x747f8d : 0xed4245)
    .setTitle(`⚔️ Grupo PvE · ${group.activity}`)
    .setDescription(`${status}\n\n**${group.participants.length} / ${group.maxMembers} miembros**   ${progressBar}`)
    .addFields(
      {
        name: "🔎 Roles faltantes",
        value: missingRoles.length ? missingRoles.join(" · ") : "✅ Roles cubiertos",
        inline: false,
      },
      ...(flexibleSlots > 0
        ? [{ name: "✨ Cupos flexibles", value: `${flexibleSlots} ${flexibleSlots === 1 ? "espacio" : "espacios"}`, inline: true }]
        : []),
      { name: `👥 Participantes (${group.participants.length})`, value: roster, inline: false },
      { name: "👑 Líder", value: `<@${group.leaderId}>`, inline: true },
      {
        name: "⚡ CP mínimo",
        value: group.minimumCp ? new Intl.NumberFormat("es-CO").format(group.minimumCp) : "Sin requisito",
        inline: true,
      },
      ...(group.voiceChannelId
        ? [{ name: "🔊 Canal temporal", value: `<#${group.voiceChannelId}>`, inline: true }]
        : []),
    )
    .setFooter({ text: "ZENTH AION 2 BOT • La voz se elimina al quedar vacía" })
    .setTimestamp(new Date(group.createdAt));

  if (group.leaderAvatarUrl) embed.setThumbnail(group.leaderAvatarUrl);
  return embed;
}

function buildPveGroupComponents(group) {
  const closed = group.status === "closed";
  const classMenu = new StringSelectMenuBuilder()
    .setCustomId(`pve:role:${group.id}`)
    .setPlaceholder("🎭 Elige tu rol para unirte o actualizarlo")
    .setDisabled(closed)
    .addOptions(GROUP_ROLES.map((entry) => {
      const count = countRoleParticipants(group, entry.value);
      const target = Number(group.desiredRoles?.[entry.value] || 0);
      const flexibleSlots = Math.max(0, group.maxMembers - group.participants.length - missingRoleSlots(group));
      const description = target > count
        ? `Faltan ${target - count} · ${count}/${target} solicitados`
        : flexibleSlots > 0
          ? `${count} en el grupo · cupo flexible`
          : `${count} en el grupo${target > 0 ? ` · objetivo ${target}` : " · completo"}`;
      return { label: entry.name, value: entry.value, description: description.slice(0, 100), emoji: entry.emoji };
    }));
  const classRow = new ActionRowBuilder().addComponents(classMenu);
  const buttonRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`pve:leave:${group.id}`)
      .setLabel("Salir")
      .setEmoji("🚪")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(closed),
    new ButtonBuilder()
      .setCustomId(`pve:close:${group.id}`)
      .setLabel("Cerrar grupo")
      .setEmoji("🔒")
      .setStyle(ButtonStyle.Danger)
      .setDisabled(closed),
  );
  return [classRow, buttonRow];
}

async function refreshPveGroupMessage(group) {
  if (!group.textChannelId || !group.messageId) return;
  const channel = await client.channels.fetch(group.textChannelId).catch(() => null);
  if (!channel?.isTextBased()) return;
  const message = await channel.messages.fetch(group.messageId).catch(() => null);
  if (!message) return;
  const currentMissingRoles = pingableMissingRoles(group, channel.guild);
  const lastNotified = new Set(group.notifiedRoleValues || []);
  const rolesToPing = currentMissingRoles.filter((entry) => !lastNotified.has(entry.value));
  const content = rolesToPing.length
    ? `🔔 Cupos disponibles: ${rolesToPing.map((entry) => `<@&${entry.guildRole.id}>`).join(" ")}`
    : "";
  await message.edit({
    content,
    embeds: [buildPveGroupEmbed(group, channel.guild)],
    components: buildPveGroupComponents(group),
    allowedMentions: { parse: [], roles: rolesToPing.map((entry) => entry.guildRole.id) },
  });
  const notifiedRoleValues = currentMissingRoles.map((entry) => entry.value);
  if (JSON.stringify(notifiedRoleValues) !== JSON.stringify(group.notifiedRoleValues || [])) {
    await updatePveGroup(group.id, (current) => ({ ...current, notifiedRoleValues }));
  }
}

async function refreshAllPveGroupMessages() {
  const groups = await getPveGroups();
  for (const group of groups) {
    await refreshPveGroupMessage(group).catch((error) => {
      console.error(`❌ No se pudo actualizar la convocatoria PvE ${group.id}: ${error.message}`);
    });
  }
}

async function closePveGroup(group, reason) {
  const voiceChannel = await client.channels.fetch(group.voiceChannelId).catch(() => null);
  if (voiceChannel) await voiceChannel.delete(reason);
  const closedGroup = await updatePveGroup(group.id, (current) => ({
    ...current,
    status: "closed",
    emptySince: null,
  }));
  if (closedGroup) await refreshPveGroupMessage(closedGroup).catch((error) => {
    console.error(`❌ No se pudo actualizar la convocatoria ${group.id}: ${error.message}`);
  });
  await removePveGroup(group.id);
}

let checkingPveGroups = false;
let pveGroupCleanupTimer;

async function checkPveGroupsForCleanup() {
  if (checkingPveGroups) return;
  checkingPveGroups = true;
  try {
    const groups = await getPveGroups();
    const now = Date.now();
    for (const group of groups) {
      if (group.status === "closed") continue;
      try {
        const voiceChannel = await client.channels.fetch(group.voiceChannelId).catch(() => null);
        if (!voiceChannel) {
          await closePveGroup(group, "La actividad PvE terminó porque su canal de voz ya no existe.");
          continue;
        }

        const humansInVoice = voiceChannel.members.filter((member) => !member.user.bot).size;
        if (humansInVoice > 0) {
          if (!group.everOccupied || group.emptySince) {
            await updatePveGroup(group.id, (current) => ({
              ...current,
              everOccupied: true,
              emptySince: null,
            }));
          }
          continue;
        }

        const createdAt = Date.parse(group.createdAt);
        if (!group.everOccupied && now - createdAt >= 15 * 60_000) {
          await closePveGroup(group, "La convocatoria PvE expiró sin que nadie entrara a voz.");
          continue;
        }

        if (group.everOccupied) {
          if (!group.emptySince) {
            await updatePveGroup(group.id, (current) => ({ ...current, emptySince: new Date(now).toISOString() }));
          } else if (now - Date.parse(group.emptySince) >= 2 * 60_000) {
            await closePveGroup(group, "El grupo PvE quedó vacío durante 2 minutos.");
          }
        }
      } catch (error) {
        console.error(`❌ No se pudo limpiar la actividad PvE ${group.id}: ${error.message}`);
      }
    }
  } catch (error) {
    console.error(`❌ No se pudieron revisar los grupos PvE: ${error.message}`);
  } finally {
    checkingPveGroups = false;
  }
}

async function handlePveGroupButton(interaction) {
  const [, action, groupId] = interaction.customId.split(":");
  const group = (await getPveGroups()).find((entry) => entry.id === groupId);
  if (!group || group.status === "closed") {
    await interaction.reply({ content: "Esta convocatoria ya terminó.", ephemeral: true });
    return;
  }

  if (action === "close") {
    if (interaction.user.id !== group.leaderId) {
      await interaction.reply({ content: "Solo el líder que creó el grupo puede cerrarlo.", ephemeral: true });
      return;
    }
    await interaction.deferReply({ ephemeral: true });
    await closePveGroup(group, "El líder cerró el grupo PvE.");
    await interaction.editReply("Convocatoria cerrada y canal temporal eliminado.");
    return;
  }

  if (action === "join") {
    await interaction.reply({
      content: "Selecciona tu rol en el menú para validar tu personaje y CP en Kisk antes de unirte.",
      ephemeral: true,
    });
    return;
  }

  const voiceChannel = await client.channels.fetch(group.voiceChannelId).catch(() => null);
  const member = await interaction.guild.members.fetch(interaction.user.id);
  if (!voiceChannel?.isVoiceBased()) {
    await interaction.reply({ content: "El canal temporal ya no está disponible.", ephemeral: true });
    return;
  }

  if (action === "leave") {
    if (!group.participants.some((participant) => participant.userId === interaction.user.id)) {
      await interaction.reply({ content: "No apareces en la lista de este grupo.", ephemeral: true });
      return;
    }
    if (member.voice.channelId === voiceChannel.id) {
      await member.voice.setChannel(null, "Miembro salió de una actividad PvE").catch(() => {});
    }
    await voiceChannel.permissionOverwrites.delete(interaction.user.id).catch(() => {});
    const updated = await updatePveGroup(group.id, (current) => ({
      ...current,
      participants: current.participants.filter((participant) => participant.userId !== interaction.user.id),
    }));
    if (updated) await refreshPveGroupMessage(updated);
    await interaction.reply({ content: "Saliste del grupo PvE.", ephemeral: true });
  }
}

async function handlePveGroupRoleSelect(interaction) {
  const roleValue = interaction.values[0];
  const roleInfo = GROUP_ROLES.find((entry) => entry.value === roleValue);
  const [, , groupId] = interaction.customId.split(":");
  let group = (await getPveGroups()).find((entry) => entry.id === groupId);
  if (!roleInfo || !group || group.status === "closed") {
    await interaction.reply({ content: "Esta convocatoria ya terminó.", ephemeral: true });
    return;
  }

  const leader = group.participants.find((participant) => participant.userId === group.leaderId);
  const normalized = normalizeDesiredRoles(group.desiredRoles, leader?.roleValue, group.maxMembers);
  const rolesWereNormalized = JSON.stringify(normalized.desiredRoles) !== JSON.stringify(group.desiredRoles || {});
  if (rolesWereNormalized) {
    group = await updatePveGroup(group.id, (current) => ({ ...current, desiredRoles: normalized.desiredRoles }));
    if (!group) {
      await interaction.reply({ content: "No pude actualizar los roles de esta convocatoria. Inténtalo otra vez.", ephemeral: true });
      return;
    }
  }

  const alreadyJoined = group.participants.some((participant) => participant.userId === interaction.user.id);
  if (!alreadyJoined && group.participants.length >= group.maxMembers) {
    await interaction.reply({ content: "El grupo ya está completo.", ephemeral: true });
    return;
  }

  const alreadyInRole = group.participants.some((participant) =>
    participant.userId === interaction.user.id && participant.roleValue === roleValue);
  const flexibleSlots = Math.max(0, group.maxMembers - group.participants.length - missingRoleSlots(group));
  if (!alreadyInRole && countRoleParticipants(group, roleValue) >= Number(group.desiredRoles?.[roleValue] || 0) && flexibleSlots === 0) {
    await interaction.reply({ content: "Ese rol ya está completo. Elige uno de los roles que todavía faltan.", ephemeral: true });
    return;
  }

  const proposedParticipants = alreadyJoined
    ? group.participants.map((participant) => participant.userId === interaction.user.id
      ? { ...participant, roleValue }
      : participant)
    : [...group.participants, { userId: interaction.user.id, roleValue }];
  if (group.maxMembers - proposedParticipants.length < missingRoleSlots(group, proposedParticipants)) {
    await interaction.reply({
      content: "Primero hay que reservar los cupos de los roles que faltan. Elige uno de los roles solicitados por el grupo.",
      ephemeral: true,
    });
    return;
  }

  const modal = new ModalBuilder()
    .setCustomId(`pve:join:${group.id}:${roleValue}`)
    .setTitle(`Personaje para Kisk · ${roleInfo.name}`)
    .addComponents(new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId("character-name")
        .setLabel("Nombre exacto del personaje en Kisk")
        .setPlaceholder("Tu personaje de NA East / Zikel")
        .setStyle(TextInputStyle.Short)
        .setMinLength(2)
        .setMaxLength(32)
        .setRequired(true),
    ));
  await interaction.showModal(modal);
  if (rolesWereNormalized) {
    void refreshPveGroupMessage(group).catch((error) => {
      console.error(`No se pudo actualizar la composición PvE ${group.id}: ${error.message}`);
    });
  }
}

async function handlePveGroupJoinModal(interaction) {
  const [, , groupId, roleValue] = interaction.customId.split(":");
  const roleInfo = GROUP_ROLES.find((entry) => entry.value === roleValue);
  const group = (await getPveGroups()).find((entry) => entry.id === groupId);
  if (!roleInfo || !group || group.status === "closed") {
    await interaction.reply({ content: "Esta convocatoria ya terminó.", ephemeral: true });
    return;
  }

  const characterName = interaction.fields.getTextInputValue("character-name").trim();
  await interaction.deferReply({ ephemeral: true });
  let profile;
  try {
    profile = await getCharacterProfile(characterName);
  } catch (error) {
    const detail = error instanceof Error ? error.message : "No pude consultar el personaje en Kisk.";
    await interaction.editReply(`No pude validar el personaje en Kisk (NA East / Zikel). ${detail}`);
    return;
  }

  const combatPower = combatPowerNumber(profile.combatPower);
  if (!combatPower) {
    await interaction.editReply("Kisk no muestra el CP de ese personaje. Revisa el nombre y prueba de nuevo.");
    return;
  }
  if (group.minimumCp && combatPower < group.minimumCp) {
    await interaction.editReply(
      `El personaje **${profile.characterName}** tiene **${new Intl.NumberFormat("es-CO").format(combatPower)} CP**; el mínimo del grupo es **${new Intl.NumberFormat("es-CO").format(group.minimumCp)} CP**.`,
    );
    return;
  }

  const latestGroup = (await getPveGroups()).find((entry) => entry.id === groupId);
  if (!latestGroup || latestGroup.status === "closed") {
    await interaction.editReply("Esta convocatoria ya terminó.");
    return;
  }
  const alreadyJoined = latestGroup.participants.some((participant) => participant.userId === interaction.user.id);
  const participant = {
    userId: interaction.user.id,
    roleValue,
    characterName: profile.characterName,
    characterClass: cleanGameClass(profile.className),
    combatPower,
    profileImageUrl: profile.profileImageUrl,
  };
  const proposedParticipants = alreadyJoined
    ? latestGroup.participants.map((entry) => entry.userId === interaction.user.id ? participant : entry)
    : [...latestGroup.participants, participant];
  if (!alreadyJoined && latestGroup.participants.length >= latestGroup.maxMembers) {
    await interaction.editReply("El grupo se acaba de completar.");
    return;
  }
  if (latestGroup.maxMembers - proposedParticipants.length < missingRoleSlots(latestGroup, proposedParticipants)) {
    await interaction.editReply("Este rol dejaría sin espacio a otro rol que el grupo todavía necesita. Elige uno de los roles faltantes.");
    return;
  }

  const voiceChannel = await client.channels.fetch(latestGroup.voiceChannelId).catch(() => null);
  if (!voiceChannel?.isVoiceBased()) {
    await interaction.editReply("El canal temporal ya no está disponible.");
    return;
  }
  await voiceChannel.permissionOverwrites.edit(interaction.user.id, {
    ViewChannel: true,
    Connect: true,
  }, { reason: "Miembro validó personaje y CP en Kisk para una actividad PvE" });

  let updateResult = "joined";
  let updateFailure = null;
  const updated = await updatePveGroup(groupId, (current) => {
    if (current.status === "closed") {
      updateFailure = "closed";
      return current;
    }
    const index = current.participants.findIndex((entry) => entry.userId === interaction.user.id);
    const participants = [...current.participants];
    if (index >= 0) {
      participants[index] = participant;
      updateResult = "updated";
    } else {
      if (participants.length >= current.maxMembers) {
        updateFailure = "full";
        return current;
      }
      participants.push(participant);
    }
    if (current.maxMembers - participants.length < missingRoleSlots(current, participants)) {
      updateFailure = "roles";
      return current;
    }
    return { ...current, participants };
  });

  if (!updated || updateFailure) {
    if (!alreadyJoined) await voiceChannel.permissionOverwrites.delete(interaction.user.id).catch(() => {});
    const errorText = updateFailure === "full"
      ? "El grupo se acaba de completar."
      : updateFailure === "roles"
        ? "Ese rol dejaría sin espacio a otro rol solicitado."
        : "Esta convocatoria ya terminó.";
    await interaction.editReply(errorText);
    return;
  }

  await refreshPveGroupMessage(updated);
  const member = await interaction.guild.members.fetch(interaction.user.id);
  const summary = `**${profile.characterName}** · ${participant.characterClass} · **${new Intl.NumberFormat("es-CO").format(combatPower)} CP** · rol **${roleInfo.name}**`;
  if (member.voice.channelId && member.voice.channelId !== voiceChannel.id) {
    try {
      await member.voice.setChannel(voiceChannel, "Miembro validó personaje en Kisk y se unió a PvE");
      await interaction.editReply(`Kisk validó: ${summary}. Te moví al canal de voz.`);
    } catch (error) {
      await interaction.editReply(`Kisk validó: ${summary}. Entra al canal aquí: <#${voiceChannel.id}>`);
    }
  } else {
    await interaction.editReply(`Kisk validó: ${summary}. Canal: <#${voiceChannel.id}>`);
  }
}

async function createPveGroupFromCommand(interaction) {
  if (!interaction.guild || !interaction.channel?.isTextBased()) {
    await interaction.reply({ content: "Este comando solo funciona dentro de un servidor y canal de texto.", ephemeral: true });
    return;
  }
  const activity = interaction.options.getString("actividad", true).trim().replace(/\s+/g, " ");
  const maxMembers = interaction.options.getInteger("cupos", true);
  const leaderRole = interaction.options.getString("mi-rol", true);
  const characterName = interaction.options.getString("personaje", true).trim();
  const minimumCp = interaction.options.getInteger("cp-minimo");
  const requestedRoles = Object.fromEntries(GROUP_ROLES.map((entry) => [
    entry.value,
    interaction.options.getInteger(entry.value) ?? 0,
  ]));
  const requestedRoleSlots = Object.values(requestedRoles).reduce((sum, count) => sum + count, 0);
  await interaction.deferReply({ ephemeral: true });

  if (requestedRoleSlots < 1 || requestedRoleSlots > maxMembers) {
    await interaction.editReply("Indica al menos un rol buscado y no pongas más cupos por rol que el tamaño total del grupo.");
    return;
  }

  let voiceChannel;
  let group;
  try {
    const leaderProfile = await getCharacterProfile(characterName);
    const leaderCp = combatPowerNumber(leaderProfile.combatPower);
    if (!leaderCp) throw new Error("Kisk no muestra el CP de tu personaje; revisa el nombre y prueba de nuevo.");
    if (minimumCp && leaderCp < minimumCp) {
      throw new Error(`Tu personaje tiene ${new Intl.NumberFormat("es-CO").format(leaderCp)} CP, menos que el mínimo que configuraste.`);
    }

    const rolePlan = normalizeDesiredRoles(requestedRoles, leaderRole, maxMembers);
    const desiredRoles = rolePlan.desiredRoles;
    const adjustedRoleSlots = Object.values(desiredRoles).reduce((sum, count) => sum + count, 0);
    if (adjustedRoleSlots > maxMembers) {
      throw new Error("Tu rol de líder también ocupa un cupo. Ajusta la composición para que todos los roles quepan en el grupo.");
    }

    const category = await interaction.guild.channels.fetch(PVE_CATEGORY_ID);
    if (!category || category.type !== ChannelType.GuildCategory) {
      throw new Error("No encontré la categoría fija de voz ═══════ ⋆ VOZ ⋆ ═════════════.");
    }
    const botMember = interaction.guild.members.me ?? await interaction.guild.members.fetch(client.user.id);
    if (!botMember.permissions.has(PermissionFlagsBits.ManageChannels)) {
      throw new Error("Al bot le falta el permiso Administrar canales.");
    }
    const lastPosition = category.children.cache.reduce(
      (last, channel) => Math.max(last, channel.position),
      category.position,
    );
    const activityForChannel = activity.replace(/[^\p{L}\p{N} _-]/gu, "").trim().slice(0, 65) || "actividad";
    voiceChannel = await interaction.guild.channels.create({
      name: `PvE · ${activityForChannel}`.slice(0, 100),
      type: ChannelType.GuildVoice,
      parent: PVE_CATEGORY_ID,
      position: lastPosition + 1,
      userLimit: maxMembers,
      permissionOverwrites: [
        { id: interaction.guild.id, deny: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect] },
        { id: client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect] },
        { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect] },
        ...PVE_VOICE_ROLE_IDS.map((roleId) => ({
          id: roleId,
          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect],
        })),
      ],
      reason: `Canal de voz temporal para ${activity}`,
    });

    group = await createPveGroup({
      guildId: interaction.guildId,
      leaderId: interaction.user.id,
      activity,
      minimumCp,
      desiredRoles,
      maxMembers,
      leaderAvatarUrl: interaction.user.displayAvatarURL({ size: 128 }),
      participants: [{
        userId: interaction.user.id,
        roleValue: leaderRole,
        characterName: leaderProfile.characterName,
        characterClass: cleanGameClass(leaderProfile.className),
        combatPower: leaderCp,
        profileImageUrl: leaderProfile.profileImageUrl,
      }],
      voiceChannelId: voiceChannel.id,
      textChannelId: interaction.channelId,
      messageId: null,
      notifiedRoleValues: [],
      createdAt: new Date().toISOString(),
      status: "active",
      everOccupied: false,
      emptySince: null,
    });
    const initialRolePings = pingableMissingRoles(group, interaction.guild);
    const message = await interaction.channel.send({
      content: initialRolePings.length
        ? `🔔 Cupos disponibles: ${initialRolePings.map((entry) => `<@&${entry.guildRole.id}>`).join(" ")}`
        : undefined,
      embeds: [buildPveGroupEmbed(group, interaction.guild)],
      components: buildPveGroupComponents(group),
      allowedMentions: { parse: [], roles: initialRolePings.map((entry) => entry.guildRole.id) },
    });
    group = await updatePveGroup(group.id, (current) => ({
      ...current,
      messageId: message.id,
      notifiedRoleValues: initialRolePings.map((entry) => entry.value),
    }));
    let creatorMovedToVoice = false;
    const creator = await interaction.guild.members.fetch(interaction.user.id);
    if (creator.voice.channelId) {
      try {
        await creator.voice.setChannel(voiceChannel, "Líder creó una actividad PvE");
        creatorMovedToVoice = true;
      } catch (error) {
        console.error(`No se pudo mover al líder a la nueva voz PvE: ${error.message}`);
      }
    }
    await interaction.editReply(
      `${rolePlan.adjustment
        ? `Incluí tu rol de líder (${rolePlan.adjustment.to.name}) y ajusté ${rolePlan.adjustment.from.name} a ${desiredRoles[rolePlan.adjustment.from.value]} cupos. `
        : ""}${creatorMovedToVoice
        ? "Convocatoria publicada y te moví a su canal de voz temporal."
        : `Convocatoria publicada. El canal de voz temporal está en <#${PVE_CATEGORY_ID}>.`}`
    );
    return;
  } catch (error) {
    if (group) await removePveGroup(group.id).catch(() => {});
    if (voiceChannel) await voiceChannel.delete("No se pudo completar la convocatoria PvE").catch(() => {});
    const detail = error instanceof Error ? error.message : "No se pudo crear el grupo PvE.";
    await interaction.editReply(`No pude crear la convocatoria. ${detail}`);
  }
}

// ─── Comandos slash ──────────────────────────────────────────────────────────
async function handleSlashCommand(interaction) {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === "diagnostico-mercado") {
    await interaction.deferReply({ ephemeral: true });
    const startedAt = Date.now();
    const url = new URL("https://aion2.exchange/api/items");
    url.searchParams.set("q", interaction.options.getString("termino") || "sword");
    url.searchParams.set("server", "12102");
    url.searchParams.set("limit", "25");
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(12_000),
        headers: {
          Accept: "application/json",
          "User-Agent": "ZENTH-AION2-Discord-Bot/1.0",
        },
      });
      const elapsedMs = Date.now() - startedAt;
      const body = await response.text();
      let detail = "";
      try {
        const data = JSON.parse(body);
        detail = ` · ${Array.isArray(data.items) ? data.items.length : 0} objetos recibidos`;
      } catch {
        detail = ` · respuesta: ${body.slice(0, 100).replace(/\s+/g, " ") || "vacía"}`;
      }
      await interaction.editReply(
        `Prueba desde ACLClouds: **HTTP ${response.status}** · **${elapsedMs} ms**${detail}`,
      );
    } catch (error) {
      const elapsedMs = Date.now() - startedAt;
      await interaction.editReply(
        `Prueba desde ACLClouds: **sin respuesta** · **${elapsedMs} ms** · ${error.name}: ${error.message}`,
      );
    }
    return;
  }

  if (interaction.commandName === "buscar-grupo") {
    await createPveGroupFromCommand(interaction);
    return;
  }

  if (interaction.commandName === "asistencia") {
    if (!interaction.guild) {
      await interaction.reply({ content: "Este comando solo funciona dentro del servidor.", ephemeral: true });
      return;
    }
    await interaction.deferReply({ ephemeral: true });
    try {
      const requestingMember = await interaction.guild.members.fetch(interaction.user.id);
      const voiceChannel = requestingMember.voice.channel;
      if (!voiceChannel) {
        await interaction.editReply("Conéctate a un canal de voz y vuelve a usar `/asistencia`.");
        return;
      }

      const attendanceChannel = await client.channels.fetch(ATTENDANCE_CHANNEL_ID);
      if (!attendanceChannel?.isTextBased() || attendanceChannel.guildId !== interaction.guildId) {
        await interaction.editReply(`No pude encontrar el canal de registro <#${ATTENDANCE_CHANNEL_ID}> en este servidor.`);
        return;
      }

      const attendees = [...voiceChannel.members.values()]
        .filter((member) => !member.user.bot)
        .sort((first, second) => first.displayName.localeCompare(second.displayName, "es"));
      const now = new Date();
      const localDate = new Intl.DateTimeFormat("es-CO", {
        dateStyle: "full",
        timeStyle: "short",
        timeZone: BOT_CONFIG.serverTimezone,
      }).format(now);
      const participantFields = attendees.length === 0
        ? [{ name: "👥 Asistentes (0)", value: "No hay miembros conectados.", inline: false }]
        : Array.from({ length: Math.ceil(attendees.length / 14) }, (_, batchIndex) => {
          const start = batchIndex * 14;
          const batch = attendees.slice(start, start + 14);
          const rangeEnd = start + batch.length;
          return {
            name: batchIndex === 0
              ? `👥 Asistentes · ${attendees.length}`
              : `Asistentes · ${start + 1}–${rangeEnd}`,
            value: batch.map((member, index) => `**${String(start + index + 1).padStart(2, "0")}** · ${member.displayName}`).join("\n"),
            inline: false,
          };
        });

      const attendanceEmbed = new EmbedBuilder()
        .setColor(0xff0000)
        .setTitle("📋 Asistencia de voz")
        .setDescription(
          `🔊 **Canal:** <#${voiceChannel.id}>\n` +
          `📅 **Fecha y hora:** ${localDate} ET\n` +
          `🛡️ **Tomó asistencia:** ${requestingMember.displayName}`
        )
        .addFields(participantFields)
        .setFooter({ text: "ZENTH AION 2 BOT • Control de voz" })
        .setTimestamp(now);
      await attendanceChannel.send({ embeds: [attendanceEmbed], allowedMentions: { parse: [] } });
      await interaction.editReply(`Asistencia de **${attendees.length}** persona(s) enviada a <#${ATTENDANCE_CHANNEL_ID}>.`);
    } catch (error) {
      console.error(`❌ No se pudo registrar la asistencia de voz: ${error.message}`);
      await interaction.editReply("No pude registrar la asistencia. Revisa que el bot pueda ver la voz y enviar mensajes en el canal de registro.");
    }
    return;
  }

  if (interaction.commandName === "temporizador-jefe") {
    if (!interaction.guildId) {
      await interaction.reply({ content: "Este comando solo funciona dentro del servidor.", ephemeral: true });
      return;
    }
    const boss = interaction.options.getString("jefe", true);
    const hours = interaction.options.getInteger("horas", true);
    const minutes = interaction.options.getInteger("minutos", true);
    if (hours === 0 && minutes === 0) {
      await interaction.reply({ content: "El tiempo restante debe ser mayor que cero.", ephemeral: true });
      return;
    }

    const remainingMinutes = hours * 60 + minutes;
    const timer = await setWorldBossTimer({
      guildId: interaction.guildId,
      boss,
      remainingMinutes,
    });
    const spawnTimestamp = Math.floor(Date.parse(timer.spawnAt) / 1000);
    const reminderMinutes = Math.max(0, remainingMinutes - 10);
    await interaction.reply({
      content:
        `✅ Temporizador de **${boss}** actualizado con **${hours} h ${minutes} min** restantes. ` +
        `Reaparecería <t:${spawnTimestamp}:R>; avisaré al rol configurado en <#${WORLD_BOSS_CHANNEL_ID}> ` +
        (reminderMinutes === 0 ? "ahora, porque faltan 10 minutos o menos." : `en ${reminderMinutes} min.`),
      ephemeral: true,
    });
    void checkWorldBossRespawns();
    return;
  }


  if (PRICE_COMMANDS.has(interaction.commandName) && interaction.channelId !== MARKET_CHANNEL_ID) {
    await interaction.reply({
      content: `Los comandos del mercado solo se pueden usar en <#${MARKET_CHANNEL_ID}>.`,
      ephemeral: true,
    });
    return;
  }

  if (interaction.commandName === "eventos") {
    await interaction.reply({ embeds: [buildEventsEmbed()] });
    return;
  }

  if (interaction.commandName === "ayuda") {
    await interaction.reply({ embeds: [buildHelpEmbed()] });
    return;
  }

  if (interaction.commandName === "precio") {
    const itemKey = interaction.options.getString("articulo", true);
    await interaction.deferReply();
    try {
      const item = await getMarketItem(itemKey, { allowSearchFallback: true });
      const price = Number(item.price);
      const listingCount = Number(item.listings);
      const capturedAt = Date.parse(item.captured_at);
      const embed = new EmbedBuilder()
        .setColor(0xff0000)
        .setTitle(`💰 ${item.name || "Objeto del mercado"}`)
        .setDescription(
          `**Precio publicado:** ${Number.isFinite(price) ? `${new Intl.NumberFormat("es-CO").format(price)} kinah` : "Sin precio disponible"}\n` +
          `**Anuncios activos:** ${Number.isFinite(listingCount) ? new Intl.NumberFormat("es-CO").format(listingCount) : "Sin datos"}\n` +
          `**Servidor:** NA East · Zikel`
        )
        .setFooter({
          text: `Datos de mercado de ${item._source || "aion2.exchange"} · precio de anuncios, no ventas confirmadas${item._stale || item._fromSearchCache ? " · dato en caché" : ""}`,
        })
        .setTimestamp();
      if (Number.isFinite(capturedAt)) {
        embed.addFields({ name: "Última captura del mercado", value: `<t:${Math.floor(capturedAt / 1000)}:R>`, inline: false });
      }
      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      const detail = error instanceof Error ? error.message : "No se pudo consultar el mercado.";
      await interaction.editReply({ content: `No pude consultar ese objeto. ${detail}` });
    }
    return;
  }

  if (["alerta-precio", "mis-alertas", "quitar-alerta"].includes(interaction.commandName) && !interaction.guildId) {
    await interaction.reply({ content: "Usa las alertas dentro del servidor de Discord.", ephemeral: true });
    return;
  }

  if (interaction.commandName === "alerta-precio") {
    const itemKey = interaction.options.getString("articulo", true);
    const maxPrice = interaction.options.getInteger("maximo", true);
    await interaction.deferReply({ ephemeral: true });
    try {
      const item = await getMarketItem(itemKey, { allowSearchFallback: true });
      const alert = await createPriceAlert({
        guildId: interaction.guildId,
        channelId: interaction.channelId,
        userId: interaction.user.id,
        itemKey,
        itemName: item.name || `Objeto ${itemKey}`,
        maxPrice,
      });
      await checkPriceAlerts();
      await interaction.editReply(
        `✅ Alerta **${alert.id}** creada para **${item.name || `objeto ${itemKey}`}** a **${new Intl.NumberFormat("es-CO").format(maxPrice)} kinah o menos**. ` +
        `Revisaré el mercado cada 5 minutos y, cuando se cumpla, te enviaré un mensaje directo privado. Asegúrate de permitir mensajes directos del servidor; la alerta se elimina después del aviso.`
      );
    } catch (error) {
      const detail = error instanceof Error ? error.message : "No se pudo crear la alerta.";
      await interaction.editReply(`No pude crear la alerta. ${detail}`);
    }
    return;
  }

  if (interaction.commandName === "mis-alertas") {
    const alerts = await getUserPriceAlerts(interaction.guildId, interaction.user.id);
    if (alerts.length === 0) {
      await interaction.reply({ content: "No tienes alertas de precio activas.", ephemeral: true });
      return;
    }
    const lines = alerts.map((alert) =>
      `• **${alert.itemName}** — máximo **${new Intl.NumberFormat("es-CO").format(alert.maxPrice)} kinah** · ID \`${alert.id}\``);
    await interaction.reply({
      content: `Tus alertas activas (${alerts.length}/5):\n${lines.join("\n")}\n\nUsa \`/quitar-alerta id\` para eliminar una.`,
      ephemeral: true,
    });
    return;
  }

  if (interaction.commandName === "quitar-alerta") {
    const alertId = interaction.options.getString("id", true);
    const deleted = await deleteUserPriceAlert(interaction.guildId, interaction.user.id, alertId);
    await interaction.reply({
      content: deleted ? `🗑️ Alerta \`${alertId}\` eliminada.` : "No encontré esa alerta entre las tuyas.",
      ephemeral: true,
    });
    return;
  }

  if (interaction.commandName === "mejoras") {
    const characterName = interaction.options.getString("personaje", true).trim();
    const cooldown = upgradeCooldownSeconds(interaction.user.id);
    if (cooldown > 0) {
      await interaction.reply({
        content: `Espera ${cooldown} segundos antes de volver a consultar mejoras.`,
        ephemeral: true,
      });
      return;
    }

    await interaction.deferReply();
    try {
      const report = await getUpgradeReport(characterName);
      await interaction.editReply({ embeds: [buildUpgradeEmbed(report)] });
    } catch (error) {
      const detail = error instanceof Error ? error.message : "No se pudo completar la consulta.";
      const url = `https://kisk.app/c/nae/zikel/${encodeURIComponent(characterName)}/upgrades`;
      await interaction.editReply(`${detail}\nFicha: ${url}`);
    }
    return;
  }

  if (interaction.commandName === "test") {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
      await interaction.reply({ content: "Este comando es solo para administradores.", ephemeral: true });
      return;
    }
    if (interaction.channelId !== CHANNEL_ID) {
      await interaction.reply({ content: "Usa `/test` en el canal configurado para eventos.", ephemeral: true });
      return;
    }

    const eventChoice = interaction.options.getString("evento", true);
    const targetEvent = EVENTS.find((event) => event.id === (eventChoice === "siege" ? "siege_zikel" : "guardian_lord_nahma"));
    if (!targetEvent || !interaction.channel?.isTextBased()) {
      await interaction.reply({ content: "No se pudo encontrar el evento o canal.", ephemeral: true });
      return;
    }

    await interaction.reply({ content: `Vista previa de ${targetEvent.name} enviada.`, ephemeral: true });
    await sendEventNotification(interaction.channel, targetEvent, targetEvent.schedules[0].label, MENTION_ROLE);
  }
}

// ─── Evento: Bot Listo ─────────────────────────────────────────────────────────
client.once("clientReady", (bot) => {
  console.log(`\n${"=".repeat(50)}`);
  console.log(`  🤖 Bot conectado como: ${bot.user.tag}`);
  console.log(`  🌐 Servidores: ${bot.guilds.cache.size}`);
  console.log(`  📡 Canal objetivo: ${CHANNEL_ID}`);
  console.log(`  🔔 Mención configurada: ${MENTION_ROLE || "(ninguna)"}`);
  console.log(`${"=".repeat(50)}\n`);

  // Actividad del bot
  bot.user.setPresence({
    activities: [
      {
        name: "ZENTH recluta discord.gg/zenth",
        type: ActivityType.Watching,
      },
    ],
    status: "online",
  });

  // Registrar los crons después de que el bot esté listo
  registerSchedules();
  registerWorldBossSchedules();
  const priceAlertJob = cron.schedule("*/5 * * * *", () => void checkPriceAlerts(), {
    timezone: BOT_CONFIG.serverTimezone,
  });
  scheduledJobs.push(priceAlertJob);
  void checkPriceAlerts();
  pveGroupCleanupTimer = setInterval(() => void checkPveGroupsForCleanup(), 30_000);
  void checkPveGroupsForCleanup();
  void refreshAllPveGroupMessages();
  for (const guild of bot.guilds.cache.values()) {
    void registerGuildCommands(guild);
    void ensureGuildApplicationPanel(guild);
    void refreshGuildApplicationTickets(guild);
  }

  console.log("✅ Bot iniciado correctamente. Esperando eventos...\n");
  console.log("💬 Comandos: /eventos | /temporizador-jefe | /mejoras | /precio | /alerta-precio | /mis-alertas | /quitar-alerta | /buscar-grupo | /ayuda | /test (admin)\n");
});

client.on("guildCreate", (guild) => {
  void registerGuildCommands(guild);
  void ensureGuildApplicationPanel(guild);
  void refreshGuildApplicationTickets(guild);
});

// ─── Evento: Mensajes ──────────────────────────────────────────────────────────
client.on("messageCreate", (msg) => {
  handleHelpCommand(msg);
  handleEventsCommand(msg);
  handleUpgradesCommand(msg).catch((error) => {
    console.error("❌ Error en !mejoras:", error.message);
  });
  handleTestCommand(msg);
});

let lastMarketAutocompleteErrorAt = 0;

function marketAutocompleteChoices(items) {
  return items
    .filter((item) => item?.item_key != null && item?.name)
    .slice(0, 25)
    .map((item) => {
      const price = Number(item.price);
      const listings = Number(item.listings);
      const priceLabel = Number.isFinite(price) ? `${new Intl.NumberFormat("es-CO").format(price)} kinah` : "consulta precio";
      const listingLabel = Number.isFinite(listings) ? `${new Intl.NumberFormat("es-CO").format(listings)} anuncios` : "Zikel · NA East";
      return {
        name: `${item.name} — ${priceLabel} · ${listingLabel}`.slice(0, 100),
        value: String(item.item_key),
      };
    });
}

async function respondMarketAutocomplete(interaction) {
  let choices = [];
  try {
    const focused = interaction.options.getFocused(true);
    const items = await searchMarketItems(focused.value);
    choices = marketAutocompleteChoices(items);
  } catch (error) {
    if (Date.now() - lastMarketAutocompleteErrorAt >= 30_000) {
      lastMarketAutocompleteErrorAt = Date.now();
      console.error("❌ El autocompletado del mercado no pudo actualizarse:", error.message);
    }
  }

  try {
    await interaction.respond(choices);
  } catch (error) {
    if (error.code !== 10062) {
      console.error("❌ No se pudo responder el autocompletado del mercado:", error.message);
    }
  }
}

client.on("interactionCreate", (interaction) => {
  if (interaction.isButton() && interaction.customId === APPLICATION_APPROVE_BUTTON_ID) {
    handleGuildApplicationDecisionButton(interaction, "approve").catch(async (error) => {
      console.error("❌ No se pudo aprobar la postulación:", error.message);
      const response = { content: "No se pudo aprobar la postulación. Inténtalo de nuevo.", ephemeral: true };
      if (interaction.deferred || interaction.replied) await interaction.followUp(response).catch(() => {});
      else await interaction.reply(response).catch(() => {});
    });
    return;
  }

  if (interaction.isButton() && interaction.customId === APPLICATION_REJECT_BUTTON_ID) {
    handleGuildApplicationDecisionButton(interaction, "reject").catch(async (error) => {
      console.error("❌ No se pudo abrir el formulario de rechazo:", error.message);
      await interaction.reply({ content: "No se pudo abrir el formulario de rechazo.", ephemeral: true }).catch(() => {});
    });
    return;
  }

  if (interaction.isModalSubmit() && interaction.customId.startsWith(APPLICATION_REJECT_MODAL_PREFIX)) {
    handleGuildApplicationRejectionSubmit(interaction).catch(async (error) => {
      console.error("❌ No se pudo registrar el rechazo:", error.message);
      const response = { content: "No se pudo registrar el rechazo. Inténtalo de nuevo.", ephemeral: true };
      if (interaction.deferred || interaction.replied) await interaction.followUp(response).catch(() => {});
      else await interaction.reply(response).catch(() => {});
    });
    return;
  }

  if (interaction.isButton() && interaction.customId === APPLICATION_DELETE_BUTTON_ID) {
    handleGuildApplicationDelete(interaction).catch(async (error) => {
      console.error("❌ No se pudo borrar el ticket de postulación:", error.message);
      const response = { content: "No se pudo borrar el ticket. Inténtalo de nuevo.", ephemeral: true };
      if (interaction.deferred || interaction.replied) await interaction.followUp(response).catch(() => {});
      else await interaction.reply(response).catch(() => {});
    });
    return;
  }

  if (interaction.isButton() && interaction.customId === APPLICATION_CLOSE_BUTTON_ID) {
    handleGuildApplicationClose(interaction).catch(async (error) => {
      console.error(`❌ No se pudo cerrar la postulación: ${error.message}`);
      const response = { content: "No se pudo cerrar este ticket. Inténtalo de nuevo.", ephemeral: true };
      if (interaction.deferred || interaction.replied) await interaction.followUp(response).catch(() => {});
      else await interaction.reply(response).catch(() => {});
    });
    return;
  }

  if (interaction.isButton() && interaction.customId === APPLICATION_BUTTON_ID) {
    handleGuildApplicationButton(interaction).catch(async (error) => {
      console.error(`❌ No se pudo abrir el formulario de postulación: ${error.message}`);
      await interaction.reply({ content: "No se pudo abrir el formulario. Inténtalo de nuevo.", ephemeral: true }).catch(() => {});
    });
    return;
  }

  if (interaction.isModalSubmit() && interaction.customId === APPLICATION_MODAL_ID) {
    handleGuildApplicationSubmit(interaction).catch(async (error) => {
      console.error(`❌ Error procesando la postulación: ${error.message}`);
      const response = { content: "No se pudo procesar la postulación. Inténtalo de nuevo.", ephemeral: true };
      if (interaction.deferred || interaction.replied) await interaction.followUp(response).catch(() => {});
      else await interaction.reply(response).catch(() => {});
    });
    return;
  }

  if (interaction.isModalSubmit() && interaction.customId.startsWith("pve:join:")) {
    handlePveGroupJoinModal(interaction).catch(async (error) => {
      console.error("❌ Error al validar personaje para grupo PvE:", error.message);
      const response = { content: "No se pudo validar el personaje en Kisk ni completar la inscripción.", ephemeral: true };
      if (interaction.deferred || interaction.replied) await interaction.followUp(response).catch(() => {});
      else await interaction.reply(response).catch(() => {});
    });
    return;
  }

  if (interaction.isStringSelectMenu() && interaction.customId.startsWith("pve:role:")) {
    handlePveGroupRoleSelect(interaction).catch(async (error) => {
      console.error("❌ Error al elegir rol del grupo PvE:", error.message);
      const response = { content: "No se pudo abrir el formulario del grupo.", ephemeral: true };
      if (interaction.deferred || interaction.replied) await interaction.followUp(response).catch(() => {});
      else await interaction.reply(response).catch(() => {});
    });
    return;
  }

  if (interaction.isButton() && interaction.customId.startsWith("pve:")) {
    handlePveGroupButton(interaction).catch(async (error) => {
      console.error("❌ Error en botones del grupo PvE:", error.message);
      const response = { content: "No se pudo completar esa acción del grupo.", ephemeral: true };
      if (interaction.deferred || interaction.replied) await interaction.followUp(response).catch(() => {});
      else await interaction.reply(response).catch(() => {});
    });
    return;
  }

  if (interaction.isAutocomplete()) {
    if (!["precio", "alerta-precio"].includes(interaction.commandName)) return;
    if (interaction.channelId !== MARKET_CHANNEL_ID) {
      interaction.respond([]).catch(() => {});
      return;
    }
    void respondMarketAutocomplete(interaction);
    return;
  }

  handleSlashCommand(interaction).catch(async (error) => {
    console.error("❌ Error en comando slash:", error.message);
    const response = { content: "No se pudo completar el comando. Inténtalo de nuevo.", ephemeral: true };
    if (interaction.deferred || interaction.replied) await interaction.followUp(response).catch(() => {});
    else await interaction.reply(response).catch(() => {});
  });
});

// ─── Manejo de Errores ─────────────────────────────────────────────────────────
client.on("error", (error) => {
  console.error("❌ Error del cliente de Discord:", error.message);
});

process.on("unhandledRejection", (reason) => {
  console.error("❌ Promesa rechazada sin manejar:", reason);
});

process.on("SIGINT", () => {
  console.log("\n🛑 Deteniendo bot...");
  for (const job of scheduledJobs) job.stop();
  if (pveGroupCleanupTimer) clearInterval(pveGroupCleanupTimer);
  client.destroy();
  console.log("👋 Bot desconectado. ¡Hasta luego, Daeva!");
  process.exit(0);
});

// ─── Iniciar Bot ───────────────────────────────────────────────────────────────
console.log("🚀 Iniciando AION 2 Events Bot...\n");
client.login(TOKEN);
