// Navigation par onglets
const tabButtons = document.querySelectorAll('.tab-btn');
const tabContents = document.querySelectorAll('.tab-content');

tabButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    tabButtons.forEach(b => b.classList.remove('active'));
    tabContents.forEach(c => c.classList.remove('active'));

    btn.classList.add('active');
    const target = btn.dataset.tab;
    const content = document.getElementById(target);
    if (content) content.classList.add('active');
  });
});

// Éléments UI : En-tête & Contrôle principal
const toggleBtn = document.getElementById('toggleBtn');
const statusBadge = document.getElementById('statusBadge');
const statusText = document.getElementById('statusText');
const cycleLiveCard = document.getElementById('cycleLiveCard');
const cycleLiveText = document.getElementById('cycleLiveText');

// Éléments UI : Tableau de bord Stats
const packsCountEl = document.getElementById('packsCount');
const cardsCountEl = document.getElementById('cardsCount');

const countCommune = document.getElementById('countCommune');
const countPeuCommune = document.getElementById('countPeuCommune');
const countRare = document.getElementById('countRare');
const countSuperRare = document.getElementById('countSuperRare');
const countUltraRare = document.getElementById('countUltraRare');
const countLegendaire = document.getElementById('countLegendaire');

// Éléments UI : Onglet Live Feed
const liveActionText = document.getElementById('liveActionText');
const feedCountBadge = document.getElementById('feedCountBadge');
const liveFeedList = document.getElementById('liveFeedList');
const clearFeedBtn = document.getElementById('clearFeedBtn');

// Éléments UI : Paramètres
const minClickDelay = document.getElementById('minClickDelay');
const maxClickDelay = document.getElementById('maxClickDelay');
const minBoosterWaitSec = document.getElementById('minBoosterWaitSec');
const maxBoosterWaitSec = document.getElementById('maxBoosterWaitSec');

const humanCyclesEnabled = document.getElementById('humanCyclesEnabled');
const humanCyclesSettings = document.getElementById('humanCyclesSettings');
const minActiveMin = document.getElementById('minActiveMin');
const maxActiveMin = document.getElementById('maxActiveMin');
const minBreakMin = document.getElementById('minBreakMin');
const maxBreakMin = document.getElementById('maxBreakMin');

const discordWebhookUrl = document.getElementById('discordWebhookUrl');
const discordUserId = document.getElementById('discordUserId');
const pauseThreadId = document.getElementById('pauseThreadId');
const targetInput = document.getElementById('targetInput');

// Switches et conteneurs de routage
const rarityRoutingEnabled = document.getElementById('rarityRoutingEnabled');
const rarityThreadsGroup = document.getElementById('rarityThreadsGroup');
const priceRoutingEnabled = document.getElementById('priceRoutingEnabled');
const priceThreadsGroup = document.getElementById('priceThreadsGroup');

// Fils Discord : Rareté
const threadLegendaire = document.getElementById('threadLegendaire');
const threadUltraRare = document.getElementById('threadUltraRare');
const threadSuperRare = document.getElementById('threadSuperRare');
const threadRare = document.getElementById('threadRare');
const threadPeuCommune = document.getElementById('threadPeuCommune');
const threadCommune = document.getElementById('threadCommune');

// Fils Discord : Prix marché
const threadTier1000 = document.getElementById('threadTier1000');
const threadTier250 = document.getElementById('threadTier250');
const threadTier100 = document.getElementById('threadTier100');
const threadTier50 = document.getElementById('threadTier50');
const threadTier0 = document.getElementById('threadTier0');

const saveConfigBtn = document.getElementById('saveConfigBtn');
const exportCsvBtn = document.getElementById('exportCsvBtn');
const resetStatsBtn = document.getElementById('resetStatsBtn');

const DEFAULT_CONFIG = {
  minClickDelay: 1500,
  maxClickDelay: 2200,
  minBoosterWaitSec: 2.0,
  maxBoosterWaitSec: 4.0,
  humanCyclesEnabled: true,
  minActiveMin: 3,
  maxActiveMin: 5,
  minBreakMin: 10,
  maxBreakMin: 30,
  discordWebhookUrl: '',
  discordUserId: '',
  pauseThreadId: '',
  targetCardsList: ['Adèle Castillon'],
  rarityRoutingEnabled: true,
  priceRoutingEnabled: true,
  rarityThreads: {
    'Légendaire': '',
    'Ultra rare': '',
    'Super rare': '',
    'Rare': '',
    'Peu commune': '',
    'Commune': ''
  },
  priceThreads: {
    'tier_1000_plus': '',
    'tier_250_1000': '',
    'tier_100_250': '',
    'tier_50_100': '',
    'tier_0_50': ''
  }
};

// Cache local de l'état du bot pour éviter tout polling I/O
let currentBotActive = false;
let currentIsBreak = false;
let currentCycleInfo = null;
let currentConfig = DEFAULT_CONFIG;
let saveDebounceTimer = null;

function formatRemainingTime(ms) {
  if (ms <= 0) return '00:00';
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

function getRaritySlug(rarity) {
  return (rarity || 'Commune')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, '-');
}

function updateStatusUI(isActive, isBreak, cycleInfo, cfg) {
  currentBotActive = isActive;
  currentIsBreak = isBreak;
  currentCycleInfo = cycleInfo;
  currentConfig = cfg || DEFAULT_CONFIG;

  if (!isActive) {
    statusBadge.className = 'status-badge';
    statusText.textContent = 'INACTIF';
    toggleBtn.className = 'toggle-main inactive';
    toggleBtn.innerHTML = '<span>⚡ LANCER LE BOT</span>';
    cycleLiveCard.className = 'cycle-live-card';
    cycleLiveText.textContent = 'Bot en veille';
    if (liveActionText && (!liveActionText.textContent || liveActionText.textContent === 'Bot en veille')) {
      liveActionText.textContent = 'Mode Manuel : Prêt';
    }
    return;
  }

  toggleBtn.className = 'toggle-main active';
  toggleBtn.innerHTML = '<span>🛑 ARRÊTER LE BOT</span>';

  if (!currentConfig.humanCyclesEnabled) {
    statusBadge.className = 'status-badge active';
    statusText.textContent = 'EN ACTION';
    cycleLiveCard.className = 'cycle-live-card';
    cycleLiveText.innerHTML = '⚡ <b>Farm continu</b> (Cycles désactivés)';
    return;
  }

  const now = Date.now();
  const remainingMs = Math.max(0, (cycleInfo?.currentSessionEnd || 0) - now);
  const remainingStr = formatRemainingTime(remainingMs);

  if (isBreak) {
    statusBadge.className = 'status-badge break';
    statusText.textContent = 'EN PAUSE';
    cycleLiveCard.className = 'cycle-live-card break-mode';
    cycleLiveText.innerHTML = `☕ <b>En pause :</b> reprise dans <b>${remainingStr}</b>`;
    if (liveActionText) liveActionText.textContent = `☕ Pause café (${remainingStr} restantes)`;
  } else {
    statusBadge.className = 'status-badge active';
    statusText.textContent = 'EN ACTION';
    cycleLiveCard.className = 'cycle-live-card';
    const nextBreak = cycleInfo?.nextBreakDurationMin || 0;
    cycleLiveText.innerHTML = `🟢 <b>En farm :</b> pause dans <b>${remainingStr}</b> (durée : ${nextBreak} min)`;
  }
}

// Tick mémoire ultra-léger pour le décompte (0 I/O disque)
function tickCountdownUI() {
  if (!currentBotActive || !currentConfig.humanCyclesEnabled || !currentCycleInfo?.currentSessionEnd) return;

  const now = Date.now();
  const remainingMs = Math.max(0, currentCycleInfo.currentSessionEnd - now);
  const remainingStr = formatRemainingTime(remainingMs);

  if (currentIsBreak) {
    cycleLiveText.innerHTML = `☕ <b>En pause :</b> reprise dans <b>${remainingStr}</b>`;
    if (liveActionText) liveActionText.textContent = `☕ Pause café (${remainingStr} restantes)`;
  } else {
    const nextBreak = currentCycleInfo.nextBreakDurationMin || 0;
    cycleLiveText.innerHTML = `🟢 <b>En farm :</b> pause dans <b>${remainingStr}</b> (durée : ${nextBreak} min)`;
  }
}

// Rendu performant de l'historique Live Feed (10 dernières cartes)
function renderLiveFeed(history = []) {
  if (!liveFeedList) return;
  const recentCards = history.slice(-10).reverse();

  if (feedCountBadge) {
    feedCountBadge.textContent = `${history.length} carte${history.length > 1 ? 's' : ''}`;
  }

  if (recentCards.length === 0) {
    liveFeedList.innerHTML = '<div class="empty-feed">Aucune carte capturée pour l\'instant</div>';
    return;
  }

  let html = '';
  for (let i = 0; i < recentCards.length; i++) {
    const card = recentCards[i];
    const rarityClean = card.rarity || 'Commune';
    const slug = getRaritySlug(rarityClean);
    const price = card.suggestedPrice || card.minPrice || card.avgPrice || card.lastPrice || '-';
    const imgHtml = card.imageUrl 
      ? `<img src="${card.imageUrl}" class="feed-img" alt="${card.name}" onerror="this.src='icon.jpg'">`
      : `<img src="icon.jpg" class="feed-img" alt="${card.name}">`;

    html += `
      <div class="feed-item border-${slug}">
        <div class="feed-img-wrap">
          ${imgHtml}
        </div>
        <div class="feed-details">
          <div class="feed-top-row">
            <span class="feed-card-name" title="${card.name || ''}">${card.name || 'Carte inconnue'}</span>
            <span class="feed-time">${card.date || ''}</span>
          </div>
          <div class="feed-bottom-row">
            <span class="feed-rarity-tag fr-${slug}">${rarityClean}</span>
            <span class="feed-price">💡 ${price} 🪙</span>
          </div>
        </div>
      </div>
    `;
  }

  liveFeedList.innerHTML = html;
}

function toggleGroupState(container, isEnabled) {
  if (!container) return;
  if (isEnabled) {
    container.classList.remove('disabled-group');
  } else {
    container.classList.add('disabled-group');
  }
}

function getFormData() {
  const targets = targetInput.value.split(',').map(s => s.trim()).filter(Boolean);
  return {
    minClickDelay: Math.max(1500, parseInt(minClickDelay.value, 10) || 1500),
    maxClickDelay: Math.max(1500, parseInt(maxClickDelay.value, 10) || 2200),
    minBoosterWaitSec: Math.max(0.5, parseFloat(minBoosterWaitSec.value) || 2.0),
    maxBoosterWaitSec: Math.max(1.0, parseFloat(maxBoosterWaitSec.value) || 4.0),
    humanCyclesEnabled: humanCyclesEnabled.checked,
    minActiveMin: Math.max(0.1, parseFloat(minActiveMin.value) || 3),
    maxActiveMin: Math.max(0.1, parseFloat(maxActiveMin.value) || 5),
    minBreakMin: Math.max(0, parseFloat(minBreakMin.value) || 10),
    maxBreakMin: Math.max(0, parseFloat(maxBreakMin.value) || 30),
    discordWebhookUrl: (discordWebhookUrl.value || '').trim(),
    discordUserId: (discordUserId.value || '').trim(),
    pauseThreadId: (pauseThreadId.value || '').trim(),
    targetCardsList: targets,
    rarityRoutingEnabled: rarityRoutingEnabled.checked,
    priceRoutingEnabled: priceRoutingEnabled.checked,
    rarityThreads: {
      'Légendaire': (threadLegendaire.value || '').trim(),
      'Ultra rare': (threadUltraRare.value || '').trim(),
      'Super rare': (threadSuperRare.value || '').trim(),
      'Rare': (threadRare.value || '').trim(),
      'Peu commune': (threadPeuCommune.value || '').trim(),
      'Commune': (threadCommune.value || '').trim()
    },
    priceThreads: {
      'tier_1000_plus': (threadTier1000.value || '').trim(),
      'tier_250_1000': (threadTier250.value || '').trim(),
      'tier_100_250': (threadTier100.value || '').trim(),
      'tier_50_100': (threadTier50.value || '').trim(),
      'tier_0_50': (threadTier0.value || '').trim()
    }
  };
}

function saveCurrentConfig(showToast = false) {
  const cfg = getFormData();
  currentConfig = cfg;
  chrome.storage.local.set({ botConfig: cfg }, () => {
    if (showToast && saveConfigBtn) {
      saveConfigBtn.textContent = '✅ Configuration enregistrée !';
      setTimeout(() => {
        saveConfigBtn.textContent = '💾 Enregistrer la configuration';
      }, 1500);
    }
  });
}

function debouncedSaveConfig() {
  if (saveDebounceTimer) clearTimeout(saveDebounceTimer);
  saveDebounceTimer = setTimeout(() => {
    saveCurrentConfig(false);
  }, 300);
}

// Écouteurs debouncés pour une réactivité maximale sans spam disque
[minClickDelay, maxClickDelay, minBoosterWaitSec, maxBoosterWaitSec, minActiveMin, maxActiveMin, minBreakMin, maxBreakMin].forEach(input => {
  input.addEventListener('input', debouncedSaveConfig);
});

[
  threadLegendaire, threadUltraRare, threadSuperRare, threadRare, threadPeuCommune, threadCommune,
  threadTier1000, threadTier250, threadTier100, threadTier50, threadTier0,
  pauseThreadId
].forEach(input => {
  input.addEventListener('input', debouncedSaveConfig);
});

rarityRoutingEnabled.addEventListener('change', () => {
  toggleGroupState(rarityThreadsGroup, rarityRoutingEnabled.checked);
  saveCurrentConfig(false);
});

priceRoutingEnabled.addEventListener('change', () => {
  toggleGroupState(priceThreadsGroup, priceRoutingEnabled.checked);
  saveCurrentConfig(false);
});

humanCyclesEnabled.addEventListener('change', () => {
  toggleGroupState(humanCyclesSettings, humanCyclesEnabled.checked);
  saveCurrentConfig(false);
});

discordWebhookUrl.addEventListener('change', () => saveCurrentConfig(false));
discordUserId.addEventListener('change', () => saveCurrentConfig(false));
targetInput.addEventListener('change', () => saveCurrentConfig(false));
saveConfigBtn.addEventListener('click', () => saveCurrentConfig(true));

function initFormFields() {
  chrome.storage.local.get(['botConfig'], (res) => {
    const config = res.botConfig || DEFAULT_CONFIG;
    currentConfig = config;

    minClickDelay.value = config.minClickDelay ?? 450;
    maxClickDelay.value = config.maxClickDelay ?? 1200;
    minBoosterWaitSec.value = config.minBoosterWaitSec ?? 2.0;
    maxBoosterWaitSec.value = config.maxBoosterWaitSec ?? 4.0;
    
    humanCyclesEnabled.checked = config.humanCyclesEnabled ?? true;
    toggleGroupState(humanCyclesSettings, humanCyclesEnabled.checked);

    minActiveMin.value = config.minActiveMin ?? 3;
    maxActiveMin.value = config.maxActiveMin ?? 5;
    minBreakMin.value = config.minBreakMin ?? 10;
    maxBreakMin.value = config.maxBreakMin ?? 30;
    
    discordWebhookUrl.value = config.discordWebhookUrl ?? '';
    discordUserId.value = config.discordUserId ?? '';
    pauseThreadId.value = config.pauseThreadId ?? '';
    targetInput.value = (config.targetCardsList || []).join(', ');

    // Commutateurs
    rarityRoutingEnabled.checked = config.rarityRoutingEnabled ?? true;
    toggleGroupState(rarityThreadsGroup, rarityRoutingEnabled.checked);

    priceRoutingEnabled.checked = config.priceRoutingEnabled ?? true;
    toggleGroupState(priceThreadsGroup, priceRoutingEnabled.checked);

    // Threads par rareté
    const rt = config.rarityThreads || DEFAULT_CONFIG.rarityThreads;
    threadLegendaire.value = rt['Légendaire'] || '';
    threadUltraRare.value = rt['Ultra rare'] || '';
    threadSuperRare.value = rt['Super rare'] || '';
    threadRare.value = rt['Rare'] || '';
    threadPeuCommune.value = rt['Peu commune'] || '';
    threadCommune.value = rt['Commune'] || '';

    // Threads par prix
    const pt = config.priceThreads || DEFAULT_CONFIG.priceThreads;
    threadTier1000.value = pt['tier_1000_plus'] || '';
    threadTier250.value = pt['tier_250_1000'] || '';
    threadTier100.value = pt['tier_100_250'] || '';
    threadTier50.value = pt['tier_50_100'] || '';
    threadTier0.value = pt['tier_0_50'] || '';
  });
}

function updateStatsFromData(data) {
  if (data.totalPacksCount !== undefined) packsCountEl.textContent = data.totalPacksCount;
  if (data.totalCardsCount !== undefined) cardsCountEl.textContent = data.totalCardsCount;

  if (data.rarityCounts) {
    const rarities = data.rarityCounts;
    countCommune.textContent = rarities['Commune'] || 0;
    countPeuCommune.textContent = rarities['Peu commune'] || 0;
    countRare.textContent = rarities['Rare'] || 0;
    countSuperRare.textContent = rarities['Super rare'] || 0;
    countUltraRare.textContent = rarities['Ultra rare'] || 0;
    countLegendaire.textContent = rarities['Légendaire'] || 0;
  }
}

function initialLoadData() {
  chrome.storage.local.get([
    'autoBoosterEnabled',
    'isPausedForBreak',
    'cycleInfo',
    'totalPacksCount',
    'totalCardsCount',
    'rarityCounts',
    'botConfig',
    'pulledCardsHistory',
    'botLiveStatus'
  ], (res) => {
    updateStatsFromData(res);
    renderLiveFeed(res.pulledCardsHistory || []);

    if (liveActionText) {
      if (res.botLiveStatus && res.botLiveStatus.text) {
        liveActionText.textContent = res.botLiveStatus.text;
      } else {
        liveActionText.textContent = res.autoBoosterEnabled ? "⚡ En attente de pack" : "Mode Manuel : Prêt";
      }
    }

    const cfg = res.botConfig || DEFAULT_CONFIG;
    updateStatusUI(!!res.autoBoosterEnabled, !!res.isPausedForBreak, res.cycleInfo, cfg);
  });
}

// Réactivité instantanée par événements (remplace l'ancien polling setInterval 1s)
chrome.storage.onChanged.addListener((changes) => {
  const partialData = {};
  if (changes.totalPacksCount) partialData.totalPacksCount = changes.totalPacksCount.newValue;
  if (changes.totalCardsCount) partialData.totalCardsCount = changes.totalCardsCount.newValue;
  if (changes.rarityCounts) partialData.rarityCounts = changes.rarityCounts.newValue;
  updateStatsFromData(partialData);

  if (changes.pulledCardsHistory) {
    renderLiveFeed(changes.pulledCardsHistory.newValue || []);
  }

  if (changes.botLiveStatus && liveActionText) {
    liveActionText.textContent = changes.botLiveStatus.newValue?.text || 'Mode Manuel : Prêt';
  }

  const isActive = changes.autoBoosterEnabled ? changes.autoBoosterEnabled.newValue : currentBotActive;
  const isBreak = changes.isPausedForBreak ? changes.isPausedForBreak.newValue : currentIsBreak;
  const cycleInfo = changes.cycleInfo ? changes.cycleInfo.newValue : currentCycleInfo;
  const cfg = changes.botConfig ? changes.botConfig.newValue : currentConfig;

  updateStatusUI(!!isActive, !!isBreak, cycleInfo, cfg);
});

toggleBtn.addEventListener('click', () => {
  chrome.storage.local.get(['autoBoosterEnabled', 'botConfig'], (res) => {
    const nextState = !res.autoBoosterEnabled;
    chrome.storage.local.set({ autoBoosterEnabled: nextState }, () => {
      updateStatusUI(nextState, false, null, res.botConfig || DEFAULT_CONFIG);
    });
  });
});

clearFeedBtn.addEventListener('click', () => {
  if (confirm('Vider l\'historique des cartes du Live Feed ?')) {
    chrome.storage.local.set({ pulledCardsHistory: [] }, () => {
      renderLiveFeed([]);
    });
  }
});

resetStatsBtn.addEventListener('click', () => {
  if (confirm('Remettre à zéro les statistiques globales, les raretés et l\'historique ?')) {
    chrome.storage.local.set({
      totalPacksCount: 0,
      totalCardsCount: 0,
      rarityCounts: {
        'Commune': 0,
        'Peu commune': 0,
        'Rare': 0,
        'Super rare': 0,
        'Ultra rare': 0,
        'Légendaire': 0
      },
      pulledCardsHistory: []
    }, initialLoadData);
  }
});

exportCsvBtn.addEventListener('click', () => {
  chrome.storage.local.get({ pulledCardsHistory: [] }, (res) => {
    if (!res.pulledCardsHistory || !res.pulledCardsHistory.length) {
      alert('Aucune carte enregistrée.');
      return;
    }

    let csv = '\uFEFFDate / Heure;Nom de la carte;Rareté;Prix Min;Prix Moyen;Prix Max;Dernier Prix;Revente Conseillée\n';
    const history = res.pulledCardsHistory;
    for (let i = 0; i < history.length; i++) {
      const row = history[i];
      csv += `"${row.date}";"${(row.name || '').replace(/"/g, '""')}";"${(row.rarity || 'Inconnue').replace(/"/g, '""')}";"${row.minPrice || '-'}";"${row.avgPrice || '-'}";"${row.maxPrice || '-'}";"${row.lastPrice || '-'}";"${row.suggestedPrice || '-'}"\n`;
    }

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `wikimasters_cards_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  });
});

initFormFields();
initialLoadData();
setInterval(tickCountdownUI, 1000);