/**
 * Script qui s'occupe de la recuperation et de la lecture des messages du chat Youtube
 */

const YT_API = "https://www.googleapis.com/youtube/v3";

async function findLiveVideoId(apiKey, channelId) {
  // La playlist "uploads" d'une chaîne a le même ID, avec "UC" remplacé par "UU"
  const uploads = "UU" + channelId.slice(2);

  const plRes = await fetch(`${YT_API}/playlistItems?part=contentDetails&playlistId=${uploads}&maxResults=10&key=${apiKey}`);
  const pl = await plRes.json();
  if (!plRes.ok) throw new Error(pl.error?.message || plRes.status);

  const ids = (pl.items || []).map(i => i.contentDetails.videoId);
  if (!ids.length) return null;

  const vRes = await fetch(`${YT_API}/videos?part=snippet&id=${ids.join(",")}&key=${apiKey}`);
  const v = await vRes.json();
  if (!vRes.ok) throw new Error(v.error?.message || vRes.status);

  // liveBroadcastContent vaut "live" pendant le direct ("upcoming" avant, "none" après)
  return v.items?.find(x => x.snippet.liveBroadcastContent === "live")?.id ?? null;
}

async function startYouTubeChatAuto({ apiKey, channelId, onMessage, minPollMs }) {
  let videoId = null;
  try {
    videoId = await findLiveVideoId(apiKey, channelId);
  } catch (e) {
    console.error("YouTube :", e.message);
  }

  if (!videoId) {
    console.log("YouTube : aucun live détecté, nouvelle tentative dans 60 s");
    return setTimeout(() => startYouTubeChatAuto({ apiKey, channelId, onMessage, minPollMs }), 60000);
  }

  console.log("YouTube : live trouvé", videoId);
  startYouTubeChat({ apiKey, videoId, onMessage, minPollMs });
}


async function getLiveChatId(apiKey, videoId) {
  const url = `${YT_API}/videos?part=liveStreamingDetails&id=${videoId}&key=${apiKey}`;
  const res = await fetch(url);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || res.status);
  const chatId = data.items?.[0]?.liveStreamingDetails?.activeLiveChatId;
  if (!chatId) throw new Error("Pas de chat actif : live non démarré ou ID de vidéo incorrect");
  return chatId;
}

async function startYouTubeChat({ apiKey, videoId, onMessage, minPollMs = 6000 }) {
  // 1. Trouver le chat du live (réessaie toutes les 15 s tant qu'il n'est pas actif)
  let liveChatId;
  try {
    liveChatId = await getLiveChatId(apiKey, videoId);
  } catch (e) {
    console.error("YouTube :", e.message);
    return setTimeout(() => startYouTubeChat({ apiKey, videoId, onMessage, minPollMs }), 15000);
  }

  // 2. Boucle de lecture des messages
  let pageToken = "";
  let firstBatch = true;   // ignore l'historique présent au démarrage

  const poll = async () => {
    let delay = minPollMs;
    try {
      const url = `${YT_API}/liveChat/messages?liveChatId=${liveChatId}` +
                  `&part=snippet,authorDetails&maxResults=200&key=${apiKey}` +
                  (pageToken ? `&pageToken=${pageToken}` : "");
      const res = await fetch(url);
      const data = await res.json();

      if (!res.ok) {
        const reason = data.error?.errors?.[0]?.reason;
        console.error("YouTube :", data.error?.message);
        if (reason === "liveChatEnded") return console.warn("YouTube : chat terminé");
        delay = (reason === "quotaExceeded" || reason === "rateLimitExceeded")
          ? 5 * 60 * 1000   // quota dépassé : pause 5 min
          : 15000;
      } else {
        pageToken = data.nextPageToken || pageToken;
        delay = Math.max(data.pollingIntervalMillis || 0, minPollMs);

        if (!firstBatch) {
          for (const item of data.items || []) {
            if (item.snippet.type !== "textMessageEvent") continue;
            onMessage({
              author: item.authorDetails.displayName,
              text: item.snippet.displayMessage,
              isOwner: item.authorDetails.isChatOwner,
              isModerator: item.authorDetails.isChatModerator,
              isMember: item.authorDetails.isChatSponsor,
              profileImage: item.authorDetails.profileImageUrl,
            });
          }
        }
        firstBatch = false;
      }
    } catch (e) {
      console.error("YouTube :", e);
      delay = 15000;
    }
    setTimeout(poll, delay);
  };
  poll();
}