const COLOR_MAP = {
  'Commune': 0x94a3b8,
  'Peu commune': 0x22c55e,
  'Rare': 0x3b82f6,
  'Super rare': 0xa855f7,
  'Ultra rare': 0xf97316,
  'Légendaire': 0xeab308
};

const RARITY_WEIGHTS = {
  'Légendaire': 6,
  'Ultra rare': 5,
  'Super rare': 4,
  'Rare': 3,
  'Peu commune': 2,
  'Commune': 1
};

function formatFrenchDate(dateObj) {
  const d = String(dateObj.getDate()).padStart(2, '0');
  const m = String(dateObj.getMonth() + 1).padStart(2, '0');
  const y = dateObj.getFullYear();
  const hh = String(dateObj.getHours()).padStart(2, '0');
  const mm = String(dateObj.getMinutes()).padStart(2, '0');
  const ss = String(dateObj.getSeconds()).padStart(2, '0');
  return `${d}/${m}/${y} à ${hh}:${mm}:${ss}`;
}

function resolvePriceTier(price) {
  const p = parseFloat(String(price).replace(/[^0-9.,]/g, '').replace(',', '.')) || 0;
  if (p >= 1000) return 'tier_1000_plus';
  if (p >= 250)  return 'tier_250_1000';
  if (p >= 100)  return 'tier_100_250';
  if (p >= 50)   return 'tier_50_100';
  return 'tier_0_50';
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'NOTIFY_DISCORD') {
    handleDiscordEmbedNotification(message.data);
    triggerNativeNotificationIfMajor(message.data);
  } else if (message.action === 'SEND_SESSION_SUMMARY') {
    handleSessionSummary(message.data);
  } else if (message.action === 'SEND_RESUME_STATUS') {
    handleResumeNotification(message.data);
  } else if (message.action === 'TRIGGER_OS_NOTIF') {
    triggerNativeNotificationIfMajor(message.data);
  }
});

// Écouteur pour la communication directe externe (Dashboard Web -> Extension)
chrome.runtime.onMessageExternal.addListener((request, sender, sendResponse) => {
  if (request.action === 'getWikiMastersData' || request.action === 'GET_DASHBOARD_DATA') {
    chrome.storage.local.get([
      'totalPacksCount',
      'totalCardsCount',
      'pulledCardsHistory',
      'rarityCounts',
      'totalSessionStats',
      'botLiveStatus',
      'autoBoosterEnabled',
      'isPausedForBreak',
      'cycleInfo',
      'botConfig'
    ], (data) => {
      sendResponse({ success: true, data: data, version: "3.1" });
    });
    return true; // Réponse asynchrone
  }

  if (request.action === 'ping') {
    sendResponse({ success: true, version: "3.1", timestamp: Date.now() });
    return true;
  }
});

function triggerNativeNotificationIfMajor({ cardData, config }) {
  if (!cardData) return;
  const { name, rarity, suggestedPrice, minPrice, avgPrice, maxPrice, lastPrice } = cardData;
  const targetPrice = suggestedPrice || parseFloat(minPrice) || parseFloat(avgPrice) || parseFloat(lastPrice) || 0;

  const targets = (config?.targetCardsList || []).map(t => (t || '').trim().toLowerCase()).filter(Boolean);
  const isTargetMatched = targets.some(t => name.toLowerCase().includes(t));

  const isMajorDrop = rarity === 'Légendaire' || rarity === 'Ultra rare' || isTargetMatched || targetPrice >= 1000;

  if (isMajorDrop) {
    try {
      const notifId = 'wm_drop_' + Date.now();
      const displayPrice = suggestedPrice || targetPrice || '-';
      chrome.notifications.create(notifId, {
        type: 'basic',
        iconUrl: 'icon.jpg',
        title: `🏆 WikiMasters Drop : ${name}`,
        message: `Rareté : ${rarity} | Revente conseillée : ${displayPrice} 🪙`,
        priority: 2
      }, () => {
        if (chrome.runtime.lastError) {
          // Ignoré si l'OS restreint les notifications
        }
      });
    } catch (err) {
      console.warn("Notification native non disponible :", err);
    }
  }
}

async function sendEmbedToThread(webhookUrl, threadId, embedPayload) {
  let targetUrl = webhookUrl;
  if (threadId) {
    targetUrl += (targetUrl.includes('?') ? '&' : '?') + `thread_id=${threadId}`;
  }

  return fetch(targetUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(embedPayload),
    signal: AbortSignal.timeout(8000)
  });
}

// Nettoyage et suppression sécurisée du message de statut précédent
async function deletePreviousStatusMessage(webhookUrl, threadId) {
  try {
    const data = await chrome.storage.local.get(['lastStatusMessageId']);
    const prevId = data.lastStatusMessageId;
    if (!prevId || !webhookUrl) return;

    const baseWebhookUrl = webhookUrl.split('?')[0].replace(/\/messages\/.*$/, '').replace(/\/$/, '');
    let deleteUrl = `${baseWebhookUrl}/messages/${prevId}`;
    if (threadId) {
      deleteUrl += `?thread_id=${threadId}`;
    }

    const res = await fetch(deleteUrl, {
      method: 'DELETE',
      signal: AbortSignal.timeout(5000)
    });

    if (res.ok || res.status === 404) {
      console.log(`🗑️ [Discord] Ancien message de statut (${prevId}) nettoyé.`);
    }
  } catch (err) {
    console.warn("Notice: Impossible de supprimer l'ancien message de statut (ignoré) :", err);
  }
}

// Envoi d'un message de statut avec ?wait=true et enregistrement de l'ID pour nettoyage futur
async function sendStatusEmbedWithTracking(webhookUrl, threadId, payload) {
  // 1. Supprimer l'ancien message de statut pour garder le salon propre
  await deletePreviousStatusMessage(webhookUrl, threadId);

  // 2. Préparer l'URL avec ?wait=true pour obtenir l'ID du message créé
  let targetUrl = webhookUrl;
  const separator = targetUrl.includes('?') ? '&' : '?';
  targetUrl += `${separator}wait=true`;
  if (threadId) {
    targetUrl += `&thread_id=${threadId}`;
  }

  try {
    const res = await fetch(targetUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(8000)
    });

    if (res.ok) {
      const msgData = await res.json().catch(() => null);
      if (msgData && msgData.id) {
        await chrome.storage.local.set({ lastStatusMessageId: msgData.id });
        console.log(`📌 [Discord] Nouveau message de statut enregistré : ID ${msgData.id}`);
      }
    }
  } catch (err) {
    console.error("Erreur lors de l'envoi du message de statut :", err);
  }
}

async function handleDiscordEmbedNotification({ cardData, webhookUrl, config }) {
  if (!webhookUrl) return;

  try {
    const nowFormatted = formatFrenchDate(new Date());
    const { name, rarity, description, imageUrl, attack, defense, lastPrice, minPrice, avgPrice, maxPrice, suggestedPrice } = cardData;

    const embed = {
      title: name,
      description: description || undefined,
      color: COLOR_MAP[rarity] || 0x38bdf8,
      fields: [
        { name: "Rareté", value: `\`${rarity}\``, inline: true }
      ],
      footer: { text: `WikiMasters • Packé le ${nowFormatted}` },
      timestamp: new Date().toISOString()
    };

    if (attack || defense) {
      embed.fields.push({
        name: "Combat",
        value: `⚔️ **${attack || '-'}** | 🛡️ **${defense || '-'}**`,
        inline: true
      });
    }

    const hasMarketPrice = Boolean(suggestedPrice || minPrice || avgPrice || maxPrice || lastPrice);

    if (hasMarketPrice) {
      const priceLines = [];

      if (suggestedPrice > 0) {
        priceLines.push(`💡 **Revente : ${suggestedPrice} 🪙**`);
      }
      if (minPrice) {
        priceLines.push(`• Min : **${minPrice} 🪙**`);
      }
      if (avgPrice) {
        priceLines.push(`• Moyen : **${avgPrice} 🪙**`);
      }
      if (maxPrice) {
        priceLines.push(`• Max : **${maxPrice} 🪙**`);
      }
      if (lastPrice) {
        priceLines.push(`• Dernier : **${lastPrice} 🪙**`);
      }

      embed.fields.push({
        name: "Marché 🪙",
        value: priceLines.join('\n'),
        inline: true
      });
    }

    if (imageUrl) {
      embed.image = { url: imageUrl };
    }

    // Mentions ciblées Discord pour les drops majeurs (Légendaire, Carte Cible, ou >= 1000 🪙)
    const targets = (config?.targetCardsList || []).map(t => (t || '').trim().toLowerCase()).filter(Boolean);
    const isTargetMatched = targets.some(t => name.toLowerCase().includes(t));
    const targetPrice = suggestedPrice || parseFloat(minPrice) || parseFloat(avgPrice) || parseFloat(lastPrice) || 0;
    const isMajorDrop = rarity === 'Légendaire' || isTargetMatched || targetPrice >= 1000;

    let dropMention = undefined;
    if (isMajorDrop && config?.discordUserId) {
      const cleanId = config.discordUserId.trim();
      dropMention = cleanId.startsWith('@') ? cleanId : `<@${cleanId}>`;
    }

    const payload = {
      username: "WikiMasters Alert",
      avatar_url: "https://i.imgur.com/MUpcyUn.jpeg",
      content: dropMention,
      embeds: [embed]
    };

    const targetThreads = new Set();

    // 1. Routage Rareté (si actif)
    if (config?.rarityRoutingEnabled !== false) {
      const rThread = (config?.rarityThreads && config.rarityThreads[rarity]) ? config.rarityThreads[rarity] : null;
      if (rThread) targetThreads.add(rThread);
    }

    // 2. Routage Prix (basé sur le prix de revente suggéré)
    if (config?.priceRoutingEnabled !== false && hasMarketPrice) {
      if (targetPrice > 0) {
        const tierKey = resolvePriceTier(targetPrice);
        const pThread = (config?.priceThreads && config.priceThreads[tierKey]) ? config.priceThreads[tierKey] : null;
        if (pThread) targetThreads.add(pThread);
      }
    }

    // Envoi parallèle (vers les threads configurés ou vers le canal principal par défaut)
    if (targetThreads.size > 0) {
      await Promise.allSettled(
        Array.from(targetThreads).map(threadId => sendEmbedToThread(webhookUrl, threadId, payload))
      );
    } else {
      await sendEmbedToThread(webhookUrl, null, payload);
    }

    console.log(`✨ [Discord] Traitement terminé pour : "${name}" (${rarity})`);
  } catch (err) {
    console.error("Erreur lors de l'envoi Discord :", err);
  }
}

async function handleSessionSummary({ summaryType, sessionStats, webhookUrl, discordUserId, pauseThreadId, pauseEndTimestamp }) {
  if (!webhookUrl || !sessionStats || sessionStats.cardsPulled === 0) return;

  try {
    const nowFormatted = formatFrenchDate(new Date());
    const isManualStop = summaryType === 'stop';

    let bestCard = null;
    if (sessionStats.cards && sessionStats.cards.length > 0) {
      bestCard = sessionStats.cards.reduce((prev, curr) => {
        const prevW = RARITY_WEIGHTS[prev.rarity] || 1;
        const currW = RARITY_WEIGHTS[curr.rarity] || 1;
        if (currW > prevW) return curr;
        if (currW === prevW) {
          const prevScore = (parseInt(prev.attack) || 0) + (parseInt(prev.defense) || 0);
          const currScore = (parseInt(curr.attack) || 0) + (parseInt(curr.defense) || 0);
          return currScore > prevScore ? curr : prev;
        }
        return prev;
      });
    }

    const rarityLines = Object.entries(sessionStats.rarityCounts)
      .filter(([_, count]) => count > 0)
      .map(([rarity, count]) => {
        const percentage = ((count / sessionStats.cardsPulled) * 100.0).toFixed(1).replace('.', ',');
        return `• **${rarity}** : \`${count}\` (\`${percentage} %\`)`;
      })
      .join('\n') || 'Aucune carte enregistrée';

    const embed = {
      title: isManualStop ? "🛑 GRAND BILAN DE SESSION (Arrêt manuel)" : "☕ Bilan du Cycle de Farm (Pause en cours)",
      color: isManualStop ? 0xf43f5e : 0x818cf8,
      description: isManualStop 
        ? "Session de farm terminée par l'utilisateur. Voici le rapport consolidé de l'activité :" 
        : "Le bot a terminé sa session de farm active et prend une pause bien méritée ! ☕",
      fields: [
        {
          name: isManualStop ? "📊 Volume Total Récolté" : "📈 Volume du Cycle",
          value: `📦 **${sessionStats.packsOpened}** boosters ouverts\n🃏 **${sessionStats.cardsPulled}** cartes packées`,
          inline: false
        },
        {
          name: "✨ Taux de Drop Réels",
          value: rarityLines,
          inline: false
        }
      ],
      footer: { text: `WikiMasters Tracker • ${nowFormatted}` },
      timestamp: new Date().toISOString()
    };

    // Compte à rebours dynamique Discord natif pour la pause
    if (!isManualStop && pauseEndTimestamp) {
      embed.fields.push({
        name: "⏳ Compte à Rebours de Pause",
        value: `Reprise automatique : **<t:${pauseEndTimestamp}:R>**\n(Heure prévue : <t:${pauseEndTimestamp}:t>)`,
        inline: false
      });
    }

    if (bestCard) {
      const bestPrice = bestCard.suggestedPrice || bestCard.minPrice || bestCard.avgPrice || '-';
      embed.fields.push({
        name: "🏆 Meilleure Carte Obtenue",
        value: `**${bestCard.name}** (\`${bestCard.rarity}\`)\n💡 Revente : **${bestPrice} 🪙**`,
        inline: false
      });
      if (bestCard.imageUrl) {
        embed.thumbnail = { url: bestCard.imageUrl };
      }
    }

    let summaryMention = undefined;
    if (discordUserId) {
      const cleanId = discordUserId.trim();
      summaryMention = cleanId.startsWith('@') ? cleanId : `<@${cleanId}>`;
    }

    const payload = {
      username: "WikiMasters Tracker",
      avatar_url: "https://i.imgur.com/MUpcyUn.jpeg",
      content: summaryMention,
      embeds: [embed]
    };

    const targetThread = !isManualStop ? (pauseThreadId || null) : null;
    await sendStatusEmbedWithTracking(webhookUrl, targetThread, payload);

    console.log("📊 [Discord] Bilan de session expédié avec succès.");
  } catch (err) {
    console.error("Erreur lors de l'envoi du récapitulatif Discord :", err);
  }
}

async function handleResumeNotification({ webhookUrl, pauseThreadId }) {
  if (!webhookUrl) return;

  try {
    const nowSec = Math.floor(Date.now() / 1000);
    const embed = {
      title: "🟢 Reprise du Farm Active !",
      description: `La pause café est terminée ! Le bot a repris l'ouverture des boosters à <t:${nowSec}:t>.`,
      color: 0x10b981,
      footer: { text: "WikiMasters Bot • Statut" },
      timestamp: new Date().toISOString()
    };

    const payload = {
      username: "WikiMasters Tracker",
      avatar_url: "https://i.imgur.com/MUpcyUn.jpeg",
      embeds: [embed]
    };

    await sendStatusEmbedWithTracking(webhookUrl, pauseThreadId || null, payload);
    console.log("🟢 [Discord] Notification de reprise du farm expédiée.");
  } catch (err) {
    console.error("Erreur lors de l'envoi du statut de reprise Discord :", err);
  }
}