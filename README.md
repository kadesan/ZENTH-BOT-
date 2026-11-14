# 🤖 AION 2 Events Bot - NA East / Zikel

Bot de Discord que notifica los eventos de AION 2 en el servidor **NA East (Zikel)** con **1 hora de anticipación**.

## 📅 Eventos Monitoreados

| Evento | Días | Hora (ET) | Aviso |
|--------|------|-----------|-------|
| ⚔️ SIEGE - Artifact Siege | Jueves & Sábados | 21:00 ET | 20:00 ET |
| 👑 Guardian Lord Nahma | Viernes & Domingos | 21:00 ET | 20:00 ET |

## ⚙️ Requisitos

- Node.js v18 o superior
- Un bot de Discord creado en el [Developer Portal](https://discord.com/developers/applications)

## 🚀 Instalación y Configuración

### 1. Clonar/Descargar el proyecto

```bash
cd aion2-discord-bot
npm install
```

### 2. Crear el bot en Discord

1. Ve a [https://discord.com/developers/applications](https://discord.com/developers/applications)
2. Haz clic en **New Application** → pon un nombre (ej: `AION2 Zikel Events`)
3. Ve a la sección **Bot** → clic en **Add Bot**
4. Copia el **Token** del bot (guárdalo, es secreto)
5. En **Bot**, activa los permisos:
   - ✅ `Send Messages`
   - ✅ `Embed Links`
   - ✅ `Mention Everyone` (si quieres que mencione @everyone)
6. Ve a **OAuth2 > URL Generator**:
   - Scopes: `bot`
   - Permissions: `Send Messages`, `Embed Links`, `Mention Everyone`
7. Copia la URL generada y ábrela para **invitar el bot a tu servidor**

### 3. Obtener el ID del canal

1. En Discord, ve a **Configuración > Avanzado** y activa **Modo Desarrollador**
2. Haz clic derecho en el canal donde quieres las notificaciones
3. Selecciona **Copiar ID del canal**

### 4. Configurar el archivo `.env`

Copia el archivo de ejemplo y edítalo:

```bash
copy .env.example .env
```

Luego edita `.env` con tus datos:

```env
DISCORD_TOKEN=tu_token_del_bot_aqui
DISCORD_CHANNEL_ID=tu_channel_id_aqui
MENTION_ROLE=@everyone
```

### 5. Iniciar el bot

```bash
npm start
```

Para desarrollo (con reinicio automático):
```bash
npm run dev
```

## 💬 Comandos en Discord

| Comando | Descripción |
|---------|-------------|
| `/eventos` | Muestra el calendario de eventos de esta semana |
| `/mejoras personaje:<nombre>` | Consulta prioridades de mejora para NA East / Zikel |
| `/precio articulo:<nombre>` | Consulta precio, anuncios y hora de captura en el mercado de NA East / Zikel |
| `/alerta-precio articulo:<nombre> maximo:<kinah>` | Te menciona personalmente cuando el precio publicado llega a tu máximo o menos |
| `/mis-alertas` | Muestra tus alertas de precio activas |
| `/quitar-alerta id:<id>` | Elimina una alerta propia |
| `/buscar-grupo actividad cupos mi-rol personaje [cp-minimo] [tank/dps/cleric/chanter]` | Publica una actividad PvE, define cantidades por rol y consulta el CP del líder en Kisk |
| `/ayuda` | Muestra las funciones del bot |
| `/test evento:<siege o nahma>` | Envía una vista previa (solo administradores, en el canal de eventos) |
| `!eventos` | Muestra el calendario completo de eventos |
| `!mejoras <personaje>` | Muestra las prioridades de mejora de un personaje de NA East / Zikel |

Las convocatorias PvE usan los roles **Tank, DPS, Cleric y Chanter**. En `/buscar-grupo`, las cantidades buscadas son el objetivo total del grupo e incluyen al líder; los espacios sin rol objetivo quedan flexibles. Al elegir un rol en la tarjeta, cada miembro ingresa el nombre de su personaje; el bot consulta Kisk para mostrar su clase y CP antes de agregarlo. Las voces temporales se crean al final de **═══════  ⋆ VOZ ⋆  ═════════════**. Los roles **Zenth** y **Amigo** pueden ver y conectar; quienes se unan a la convocatoria también reciben acceso. Los miembros conectados a otra voz se mueven automáticamente; si no están conectados, reciben el enlace para entrar. La voz se elimina tras 2 minutos vacía después de haber sido usada, o expira a los 15 minutos si nadie entra.

## 📢 Ejemplo de Notificación

Cuando llegue la hora, el bot enviará un mensaje así:

```
🔔 ¡AVISO! ⚔️ SIEGE - NA East / ZIKEL

@everyone
¡Comienza el Siege de Artefactos en el Abismo!

⏰ El evento comienza en aproximadamente 1 hora

🕘 Hora del Evento: 21:00 ET (Jueves)
📅 Días: Jueves y Sábados
📍 Ubicación: Chaotic Lower Reshanta (Abismo)

💡 Tips:
🛡️ Entra al Abismo al menos 20 min antes para hacer cola
👥 Coordina con tu legión antes del evento
⚔️ El Siege dura 30 minutos (21:00 - 21:30 ET)
🏰 Los Jefes Ejecutores aparecen a las 21:30 ET tras el Siege
```

## 🛠️ Estructura del Proyecto

```
aion2-discord-bot/
├── src/
│   ├── index.js       # Punto de entrada - cliente de Discord y crons
│   ├── events.js      # Configuración de eventos y horarios
│   ├── notifier.js    # Construcción y envío de embeds
│   └── upgrades.js    # Consulta de prioridades de mejora de Kisk
├── .env               # Variables de entorno (NO subir a Git)
├── .env.example       # Plantilla de configuración
├── .gitignore
├── package.json
└── README.md
```

## 🔧 Personalización

### Agregar más eventos

Edita `src/events.js` y agrega un nuevo objeto al array `EVENTS`:

```js
{
  id: "mi_evento",
  name: "🌀 Nombre del Evento",
  description: "Descripción del evento",
  color: 0x00ff88,
  schedules: [
    { cron: "0 0 19 * * 3", label: "Miércoles" }, // Miércoles 19:00 ET
  ],
  eventTime: "20:00 ET",
  days: "Miércoles",
  location: "Algún lugar en AION 2",
  tips: ["💡 Tip 1", "💡 Tip 2"],
}
```

### Cambiar el horario de aviso

El formato del cron es: `segundo minuto hora * * día-semana`

- `0 0 20 * * 4` = Jueves a las 20:00 (hora 20, 0 minutos)
- `0 30 19 * * 5` = Viernes a las 19:30

## ⚠️ Notas Importantes

- Todos los horarios están en **Eastern Time (ET)** ya que es la zona horaria de los servidores NA East de AION 2.
- `!mejoras` consulta recomendaciones públicas de Kisk.app; las respuestas se guardan brevemente en caché y tienen límite por usuario.
- El bot usa los horarios **publicados por la comunidad** (shugo.gg, aion2-meta.com). Si NCSoft cambia los horarios, actualiza `src/events.js`.
- **No compartas tu `.env`** ni tu token de Discord con nadie.

## 🌐 Recursos

- [Shugo.gg - Timer de Eventos](https://shugo.gg)
- [Discord Developer Portal](https://discord.com/developers/applications)
- [AION 2 Meta](https://aion2-meta.com)
