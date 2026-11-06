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

// Remplace les emotes Twitch par des images
function renderMessage(text, emotesTag) {
  const chars = Array.from(text); // gère correctement les emojis
  if (!emotesTag) return escapeHtml(text);

  const ranges = [];
  emotesTag.split("/").forEach((entry) => {
    const [id, positions] = entry.split(":");
    positions.split(",").forEach((p) => {
      const [start, end] = p.split("-").map(Number);
      ranges.push({ id, start, end });
    });
  });
  ranges.sort((a, b) => a.start - b.start);

  let html = "";
  let cursor = 0;
  for (const { id, start, end } of ranges) {
    html += escapeHtml(chars.slice(cursor, start).join(""));
    const name = escapeHtml(chars.slice(start, end + 1).join(""));
    html += `<img class="emote" alt="${name}" title="${name}" src="https://static-cdn.jtvnw.net/emoticons/v2/${id}/default/dark/1.0">`;
    cursor = end + 1;
  }
  html += escapeHtml(chars.slice(cursor).join(""));
  return html;
}

function addMessage(tags, user, text) {
  const nearBottom =
    chatEl.scrollHeight - chatEl.scrollTop - chatEl.clientHeight < 80;

  const div = document.createElement("div");
  div.className = "msg";
  const color = /^#[0-9a-fA-F]{6}$/.test(tags["color"]) ? tags["color"] : "#9147ff";
  const name = escapeHtml(tags["display-name"] || user);
  div.innerHTML =
  `<img class="platform" src="icon/twitchLogo.png" alt="Tch"> ` +
  renderBadges(tags["badges"]) +
  `<span class="user" style="color:${color}">${name}</span>: ` +
  renderMessage(text, tags["emotes"]);
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