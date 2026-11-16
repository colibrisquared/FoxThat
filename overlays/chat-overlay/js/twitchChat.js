/**
 * Script qui s'occupe de la recuperation et de la lecture des messages du chat Twitch
 */



// Chat Twitch en lecture seule via IRC WebSocket (connexion anonyme, aucune clé requise)


// - var -
const chatEl = document.getElementById("chat");
const MAX_MESSAGES = 15; // limite pour ne pas saturer la page
let socket = null;
let reconnectTimer = null;
let currentChannel = CONFIG.twitchChannel;

// - func -

// Remplace les emotes Twitch par des images
// "offset" = nombre de caractères du début à ne pas afficher (le "@pseudo " d'une réponse)
function renderMessage(text, emotesTag, offset = 0) {
  const chars = Array.from(text);
  if (!emotesTag) return safeText(chars.slice(offset).join(""));

  const ranges = [];
  emotesTag.split("/").forEach((entry) => {
    const [id, positions] = entry.split(":");
    positions.split(",").forEach((p) => {
      const [start, end] = p.split("-").map(Number);
      if (start >= offset) ranges.push({ id, start, end });
    });
  });
  ranges.sort((a, b) => a.start - b.start);

  let html = "";
  let cursor = offset;
  for (const { id, start, end } of ranges) {
    html += safeText(chars.slice(cursor, start).join(""));
    const name = escapeHtml(chars.slice(start, end + 1).join(""));
    html += `<img class="emote" alt="${name}" title="${name}" src="https://static-cdn.jtvnw.net/emoticons/v2/${id}/default/dark/1.0">`;
    cursor = end + 1;
  }
  html += safeText(chars.slice(cursor).join(""));
  return html;
}

function addMessage(tags, user, text) {
  // Modération : un mot banni (dans le message ou le pseudo) annule l'affichage
  const displayName = tags["display-name"] || user;
  if (isBanned(text) || isBanned(displayName)) return;

  const nearBottom =
    chatEl.scrollHeight - chatEl.scrollTop - chatEl.clientHeight < 80;

  const div = document.createElement("div");
  div.className = "msg";
  const color = /^#[0-9a-fA-F]{6}$/.test(tags["color"]) ? tags["color"] : "#9147ff";
  const name = safeText(displayName);

  let offset = 0;
  if (tags["reply-parent-msg-id"]) {
    const m = text.match(/^@\S+\s?/);
    if (m) offset = Array.from(m[0]).length;
  }

  var str = renderBadges(tags["badges"]) +
  `<span class="user" style="color:${color}">${name}</span>: ` +
  renderMessage(text, tags["emotes"], offset);

  if (CONFIG.multistream){
    str = `<img class="platform" src="icon/twitchLogo.png" alt="Tch"> ` + str
  }

  div.innerHTML = renderNote(tags) + str;
  chatEl.appendChild(div);

  if (nearBottom) chatEl.scrollTop = chatEl.scrollHeight;
}

function handleLine(line) {
  if (line.startsWith("PING")) {
    socket.send("PONG :tmi.twitch.tv");
    return;
  }
  // Format : @tags :user!user@user.tmi.twitch.tv PRIVMSG #chan :message
  const match = line.match(/^(@\S+) :(\w+)!\w+@\w+\.tmi\.twitch\.tv PRIVMSG #\w+ :(.*)$/);
  if (match) {
    addMessage(parseTags(match[1]), match[2], match[3]);
  }
}

function connect() {
  chatEl.innerHTML = "";

  socket = new WebSocket("wss://irc-ws.chat.twitch.tv:443");

  socket.onopen = () => {
    socket.send("CAP REQ :twitch.tv/tags twitch.tv/commands");
    socket.send("PASS PHINGEOHGPSIEH"); // mot de passe bidon pour la connexion anonyme
    socket.send(`NICK justinfan${Math.floor(Math.random() * 90000 + 10000)}`);
    socket.send(`JOIN #${currentChannel}`);
  };

  socket.onmessage = (event) => {
    event.data.split("\r\n").filter(Boolean).forEach(handleLine);
  };

  socket.onclose = () => {
    if (currentChannel) {
      reconnectTimer = setTimeout(() => connect(currentChannel), 3000);
    }
  };

  socket.onerror = () => socket.close();
}

function escapeHtml(str) {
  return str.replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

// Parse les tags IRCv3 : "@a=b;c=d" -> { a: "b", c: "d" }
function parseTags(raw) {
  const tags = {};
  raw.slice(1).split(";").forEach((pair) => {
    const [k, v] = pair.split("=");
    tags[k] = v || "";
  });
  return tags;
}

// RENDER des badges
// Depend d'une autre API que twitch

const badgeMap = {};

async function loadBadges() {
  const urls = [
    "https://api.ivr.fi/v2/twitch/badges/global",
    `https://api.ivr.fi/v2/twitch/badges/channel?login=${currentChannel}`, // en dernier : écrase les globaux (badges sub personnalisés)
  ];
  for (const url of urls) {
    try {
      const res = await fetch(url);
      const sets = await res.json();
      sets.forEach((set) =>
        (set.versions || []).forEach((v) => {
            badgeMap[`${set.set_id || set.setID}/${v.id}`] = v.image_url_1x;
        })
    );
    } catch (e) {
      console.warn("Badges indisponibles :", url, e);
    }
  }
}

function renderBadges(badgesTag) {
  if (!badgesTag) return "";
  return badgesTag
    .split(",")
    .map((b) => (badgeMap[b] ? `<img class="badge" alt="${escapeHtml(b)}" src="${badgeMap[b]}">` : ""))
    .join("");
}

loadBadges().then(connect);


// Petite note au-dessus du message : "Premier message !" et/ou "Répond à @XXX"
function renderNote(tags) {
  const notes = [];

  if (tags["first-msg"] === "1") {
    notes.push(`<span class="first">✨ Premier message !</span>`);
  }

  if (tags["reply-parent-msg-id"]) {
    const target = escapeHtml(tags["reply-parent-display-name"] || "?");
    notes.push(`<span class="reply">↪ Répond à @${target}</span>`);
  }

  return notes.length
    ? `<div class="msg-note">${notes.join(" · ")}</div>`
    : "";
}



// ---------- Modération ----------

const WHOLE_WORD = true;            // false : détecte aussi les mots à l'intérieur d'un autre ("con" dans "concert")
 
// Minuscules + sans accents, en gardant exactement la même longueur (pour retrouver les positions)
function fold(str) {
  return Array.from(str).map((c) => {
    let b = c.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
    return b.length === c.length ? b : c;
  }).join("");
}

function buildWordRegex(words) {
  const list = (words || [])
    .map((w) => fold(String(w).trim()))
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)
    .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (!list.length) return null;
  const body = `(?:${list.join("|")})`;
  return new RegExp(
    WHOLE_WORD ? `(?<![\\p{L}\\p{N}])${body}(?![\\p{L}\\p{N}])` : body,
    "gu"
  );
}

let banRe = null;
let filterRe = null;

function initModeration() {
  const mod = typeof MODERATION !== "undefined" ? MODERATION : {};
  if (typeof MODERATION === "undefined") {
    console.warn("Modération : MODERATION introuvable, vérifie l'ordre des <script>");
  }
  try {
    banRe = buildWordRegex(mod.banWord);
    filterRe = buildWordRegex(mod.filterWord);
  } catch (e) {
    console.error("Modération : mots invalides dans la config", e);
  }
}
initModeration();

// true si le texte contient un mot banni
function isBanned(text) {
  return !!banRe && fold(text).search(banRe) !== -1;
}

// true si le texte contient un mot à filtrer
function hasFilteredWord(text) {
  return !!filterRe && fold(text).search(filterRe) !== -1;
}

// Remplace les mots filtrés par <filtered> (texte brut, non échappé)
function filterText(text) {
  if (!filterRe) return text;
  const f = fold(text);
  let out = "", last = 0;
  for (const m of f.matchAll(filterRe)) {
    out += text.slice(last, m.index) + getFilterText();
    last = m.index + m[0].length;
  }
  return out + text.slice(last);
}

// Filtre puis échappe (indispensable : "<filtered>" doit s'afficher tel quel et pas être lu comme du HTML)
function safeText(text) {
  return escapeHtml(filterText(text));
}

function getFilterText() {
  return (typeof MODERATION !== "undefined" && MODERATION.filterText) || "<filtered>";
}