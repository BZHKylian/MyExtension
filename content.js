// ============================================================================
// WikiMasters Auto-Booster Pro — Content Script v3.1 (Final Production)
// ============================================================================

let isBotActive = false;
let loopTimeout = null;
let sessionTimeout = null;
let breakWatchdogTimeout = null;
let inspectionWatchdog = null;
let globalWatchdogTimer = null;

// Drapeaux d'état de boucle et verrous de transition
let isTransitioning = false;
let isProcessingCardInspection = false;
let isWaitingToOpenBooster = false;
let isHandlingCaptcha = false;

let lastBoosterOpenedTime = 0;
let breakCycleCount = 0;
let lastActivityTimestamp = Date.now();
let lastActivityDescription = "Initialisation";

let isPausedForBreak = false;
let isBreakPending = false;
let currentSessionEnd = 0;
let nextBreakDurationMin = 0;

// Références de synchronisation DOM et horodatage de la carte en cours
let lastProcessedCardElement = null;
let lastProcessedCardText = '';
let lastCardProcessedTimestamp = 0;

// Caches mémoire pour limiter les I/O de stockage
let totalPacksCountCache = 0;
let totalCardsCountCache = 0;
let rarityCountsCache = {
  'Commune': 0, 'Peu commune': 0, 'Rare': 0,
  'Super rare': 0, 'Ultra rare': 0, 'Légendaire': 0
};
let pulledCardsHistoryCache = [];
let currentBotLiveStatus = "Bot en veille";

// Stats du cycle en cours (réinitialisées à chaque pause)
let cycleStats = {
  packsOpened: 0,
  cardsPulled: 0,
  rarityCounts: {
    'Commune': 0, 'Peu commune': 0, 'Rare': 0,
    'Super rare': 0, 'Ultra rare': 0, 'Légendaire': 0
  },
  cards: []
};

// Stats cumulées de toute la session active (jusqu'à l'arrêt manuel)
let totalSessionStats = {
  packsOpened: 0,
  cardsPulled: 0,
  rarityCounts: {
    'Commune': 0, 'Peu commune': 0, 'Rare': 0,
    'Super rare': 0, 'Ultra rare': 0, 'Légendaire': 0
  },
  cards: []
};

let config = {
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

const seenCardsInCurrentPack = new Set();

const RARITY_MAP = {
  'c': 'Commune',
  'pc': 'Peu commune',
  'r': 'Rare',
  'sr': 'Super rare',
  'ur': 'Ultra rare',
  'l': 'Légendaire'
};

const IGNORED_TEXTS = new Set([
  'ouvrir', 'booster', 'pack', 'continuer', 'terminer', 'valider', 'fermer', 
  'stats', 'inventaire', 'collection', 'suivant', 'precedent', 'retour',
  'points', 'prix', 'edition', 'wiki', 'masters', 'carte', 'boutique', 'acheter', 'shop', 'wikibidous'
]);

// Expressions régulières pré-compilées
const RE_K = /([\d.,]+)\s*k\b/i;
const RE_NUM = /^\d+(?:[.,\s]\d{3})*(?:[.,]\d+)?|\d+/;
const RE_CLEAN_SPACES = /[\u00a0\s]/g;
const RE_CLEAN_DOTS = /[\s.]/g;

// Isolation mono-ligne stricte pour ne jamais capturer de chiffres hors contexte
const RE_LAST = /(?:derni[eè]re?\s+(?:vente|prix)|dernier)[^\d\n\r]*([\d\s\u00a0.,]+k?)/i;
const RE_MIN  = /(?:prix\s+min(?:imum)?|min(?:imum)?\s*:|plus\s+bas|plancher|floor)[^\d\n\r]*([\d\s\u00a0.,]+k?)/i;
const RE_AVG  = /(?:prix\s+moyen(?:ne)?|moyen(?:ne)?\s*:|m[eé]dian(?:ne)?)[^\d\n\r]*([\d\s\u00a0.,]+k?)/i;
const RE_MAX  = /(?:prix\s+max(?:imum)?|max(?:imum)?\s*:|plus\s+haut)[^\d\n\r]*([\d\s\u00a0.,]+k?)/i;
const RE_COIN_PRICE = /(?:([\d\s\u00a0.,]+k?)\s*🪙|🪙\s*([\d\s\u00a0.,]+k?))/i;

// AudioContext singleton
let cachedAudioCtx = null;

function isPullsPage() {
  const path = window.location.pathname.toLowerCase();
  return path.startsWith('/pulls') || path === '/pulls';
}

function getRandomFloat(min, max) {
  if (min > max) { const tmp = min; min = max; max = tmp; }
  return Math.random() * (max - min) + min;
}

function getRandomInt(min, max) {
  return Math.round(getRandomFloat(min, max));
}

function markActivity(description) {
  lastActivityTimestamp = Date.now();
  lastActivityDescription = description || "Activité en cours";
}

// Filtre de sécurité anti-clic header / navbar / wallet
function isHeaderOrWalletElement(el) {
  if (!el) return false;
  const isInHeader = el.closest('header, nav, .navbar, [class*="navbar"], [class*="header"], [class*="wallet"], [id*="header"], [id*="nav"], .wallet-container');
  return Boolean(isInHeader);
}

// Filtre de sécurité anti-clic monnaie / solde / boutique / Wikibidous
function isCurrencyOrShopElement(el) {
  if (!el) return false;
  
  const title = (el.getAttribute('title') || el.title || '').toLowerCase();
  const aria = (el.getAttribute('aria-label') || '').toLowerCase();
  const text = (el.innerText || el.textContent || '').toLowerCase();
  const id = (el.id || '').toLowerCase();
  const className = (el.className && typeof el.className === 'string') ? el.className.toLowerCase() : '';

  // 1. Détection formelle par les attributs title / aria / text / id / class
  const isShopOrCurrency = title.includes('boutique') || title.includes('shop') ||
                           aria.includes('boutique') || aria.includes('shop') ||
                           text.includes('boutique') || text.includes('shop') ||
                           title.includes('wikibidou') || aria.includes('wikibidou') ||
                           text.includes('wikibidou') || text.includes('wikibidous') ||
                           text.includes('🪙') || title.includes('🪙') ||
                           text.includes('solde') || title.includes('solde') || aria.includes('solde') ||
                           text.includes('balance') || title.includes('balance') || aria.includes('balance') ||
                           text.includes('portefeuille') || text.includes('wallet') ||
                           id.includes('wallet') || id.includes('balance') || id.includes('shop') ||
                           className.includes('wallet') || className.includes('balance') || className.includes('shop');

  // 2. Détection d'icône de monnaie / boutique SVG ou image
  const hasCoinOrShopIcon = Boolean(
    el.querySelector('img[alt*="coin" i], img[src*="coin" i], img[src*="piece" i], svg[class*="coin" i], svg[class*="wallet" i], svg[class*="shop" i], [class*="wikibidou"]')
  );

  return isShopOrCurrency || hasCoinOrShopIcon;
}

function parsePriceString(str) {
  if (!str) return 0;
  
  const kMatch = str.match(RE_K);
  if (kMatch) {
    const base = parseFloat(kMatch[1].replace(',', '.'));
    return Math.round(base * 1000);
  }

  const cleaned = str.replace(RE_CLEAN_SPACES, ' ').trim();
  const numMatch = cleaned.match(RE_NUM);
  if (!numMatch) return 0;

  const rawNum = numMatch[0].replace(RE_CLEAN_DOTS, '').replace(',', '.');
  return Math.round(parseFloat(rawNum)) || 0;
}

function setBotLiveStatus(statusText) {
  if (currentBotLiveStatus === statusText) return;
  currentBotLiveStatus = statusText;
  chrome.storage.local.set({
    botLiveStatus: {
      text: statusText,
      timestamp: Date.now()
    }
  });
}

// Synthèse Audio Dynamique Web Audio API
function playDynamicSound(soundType) {
  try {
    if (!cachedAudioCtx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) cachedAudioCtx = new AudioCtx();
    }
    if (!cachedAudioCtx) return;
    if (cachedAudioCtx.state === 'suspended') {
      cachedAudioCtx.resume();
    }
    const t0 = cachedAudioCtx.currentTime;

    if (soundType === 'legendary') {
      // Fanfare ascendante tri-tonale : C5 (523.25 Hz) -> E5 (659.25 Hz) -> G5 (783.99 Hz)
      const notes = [523.25, 659.25, 783.99];
      notes.forEach((freq, idx) => {
        const osc = cachedAudioCtx.createOscillator();
        const gain = cachedAudioCtx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, t0 + idx * 0.12);
        
        gain.gain.setValueAtTime(0, t0 + idx * 0.12);
        gain.gain.linearRampToValueAtTime(0.35, t0 + idx * 0.12 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.01, t0 + idx * 0.12 + 0.22);
        
        osc.connect(gain);
        gain.connect(cachedAudioCtx.destination);
        osc.start(t0 + idx * 0.12);
        osc.stop(t0 + idx * 0.12 + 0.25);
      });
    } else if (soundType === 'ultra') {
      // Double bip montant distinctif : D5 (587.33 Hz) -> A5 (880 Hz)
      const notes = [587.33, 880];
      notes.forEach((freq, idx) => {
        const osc = cachedAudioCtx.createOscillator();
        const gain = cachedAudioCtx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, t0 + idx * 0.14);
        
        gain.gain.setValueAtTime(0, t0 + idx * 0.14);
        gain.gain.linearRampToValueAtTime(0.3, t0 + idx * 0.14 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.01, t0 + idx * 0.14 + 0.18);
        
        osc.connect(gain);
        gain.connect(cachedAudioCtx.destination);
        osc.start(t0 + idx * 0.14);
        osc.stop(t0 + idx * 0.14 + 0.2);
      });
    } else if (soundType === 'super_rare') {
      // Bip simple court et discret : E5 (659.25 Hz)
      const osc = cachedAudioCtx.createOscillator();
      const gain = cachedAudioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(659.25, t0);
      
      gain.gain.setValueAtTime(0.25, t0);
      gain.gain.exponentialRampToValueAtTime(0.01, t0 + 0.15);
      
      osc.connect(gain);
      gain.connect(cachedAudioCtx.destination);
      osc.start(t0);
      osc.stop(t0 + 0.16);
    }
  } catch (e) {}
}

// Clic forcé de pointeur universel — STRICTEMENT SANS ÉVÉNEMENT CLAVIER
function forceClickElement(el) {
  if (!el) return;
  try {
    const rect = el.getBoundingClientRect();
    const offsetX = (rect.width > 0 ? rect.width : 20) * getRandomFloat(0.3, 0.7);
    const offsetY = (rect.height > 0 ? rect.height : 20) * getRandomFloat(0.3, 0.7);
    
    const clientX = rect.left + offsetX;
    const clientY = rect.top + offsetY;
    const screenX = (window.screenX || 0) + clientX;
    const screenY = (window.screenY || 0) + clientY;

    const eventInit = {
      bubbles: true,
      cancelable: true,
      view: window,
      detail: 1,
      screenX: Math.round(screenX),
      screenY: Math.round(screenY),
      clientX: Math.round(clientX),
      clientY: Math.round(clientY),
      button: 0,
      buttons: 1
    };

    el.dispatchEvent(new PointerEvent('pointerdown', eventInit));
    el.dispatchEvent(new MouseEvent('mousedown', eventInit));
    el.dispatchEvent(new PointerEvent('pointerup', eventInit));
    el.dispatchEvent(new MouseEvent('mouseup', eventInit));
    el.dispatchEvent(new MouseEvent('click', eventInit));

    if (typeof el.click === 'function') {
      el.click();
    }
  } catch (e) {
    try {
      if (typeof el.click === 'function') el.click();
    } catch (_) {}
  }
}

function clickElement(el) {
  forceClickElement(el);
}

// Recherche intelligente du bouton flèche droite
function findNextArrowButton() {
  // 1. Détection par SVG / icône Chevron Right
  const rightArrowSvg = document.querySelector(
    'svg polyline[points="9 18 15 12 9 6"], ' +
    'svg polyline[points="9 6 15 12 9 18"], ' +
    'svg[class*="lucide-chevron-right"], ' +
    'svg[class*="chevron-right"], ' +
    'svg[class*="arrow-right"], ' +
    'svg path[d*="M9 5l7 7-7 7"], ' +
    'svg path[d*="m9 18 6-6-6-6"], ' +
    'svg path[d*="m9 6 6 6-6 6"]'
  );
  if (rightArrowSvg) {
    const btn = rightArrowSvg.closest('button, [role="button"], a, div');
    if (btn && !btn.disabled && !btn.hasAttribute('disabled') && btn.offsetParent !== null && !isHeaderOrWalletElement(btn) && !isCurrencyOrShopElement(btn)) {
      return btn;
    }
  }

  // 2. Détection par aria-label ou classes
  const ariaBtn = document.querySelector(
    'button[aria-label*="suivant" i], button[aria-label*="next" i], button[aria-label*="droite" i], ' +
    'button[class*="next" i], button[class*="arrow-right" i]'
  );
  if (ariaBtn && !ariaBtn.disabled && !ariaBtn.hasAttribute('disabled') && ariaBtn.offsetParent !== null && !isHeaderOrWalletElement(ariaBtn) && !isCurrencyOrShopElement(ariaBtn)) {
    return ariaBtn;
  }

  // 3. Détection des boutons ronds de navigation situés sur la droite de l'écran
  const roundButtons = Array.from(document.querySelectorAll('button.w-12.rounded-full:not([disabled]), button[class*="rounded-full"]:not([disabled])'))
    .filter(b => b.offsetParent !== null && !b.hasAttribute('disabled') && !isHeaderOrWalletElement(b) && !isCurrencyOrShopElement(b));

  if (roundButtons.length > 0) {
    roundButtons.sort((a, b) => b.getBoundingClientRect().left - a.getBoundingClientRect().left);
    const rightmost = roundButtons[0];
    if (!rightmost.querySelector('svg polyline[points="15 18 9 12 15 6"]')) {
      return rightmost;
    }
  }

  return null;
}

function findFinishPackButton() {
  const allButtons = Array.from(document.querySelectorAll('button, div[role="button"], a'));
  return allButtons.find(b => {
    if (b.disabled || b.hasAttribute('disabled') || b.offsetParent === null) return false;
    if (isHeaderOrWalletElement(b) || isCurrencyOrShopElement(b)) return false;

    const txt = (b.innerText || b.textContent || '').trim().toLowerCase();
    const aria = (b.getAttribute('aria-label') || '').toLowerCase();
    const isFinishText = (
      txt.includes('terminer') ||
      txt.includes('valider') ||
      txt.includes('continuer') ||
      txt.includes('fermer') ||
      aria.includes('terminer') ||
      aria.includes('valider') ||
      aria.includes('continuer') ||
      aria.includes('fermer')
    );
    return isFinishText && !txt.includes('marché') && !txt.includes('booster') && !txt.includes('ouvrir') && !txt.includes('boutique') && !txt.includes('shop');
  });
}

// Ciblage précis et prioritaire de l'image de paquet (card_pack.png / alt="Ouvrir un paquet")
function findOpenBoosterButton() {
  // 1. Cherche en priorité absolue le bouton qui contient l'image du paquet de cartes ou l'attribut alt exact
  const packImg = document.querySelector('img[alt="Ouvrir un paquet" i], img[src*="card_pack.png" i], img[src*="card_pack" i]');
  if (packImg) {
    const btn = packImg.closest('button, div[role="button"], a');
    if (btn && !btn.disabled && !btn.hasAttribute('disabled') && !isHeaderOrWalletElement(btn) && !isCurrencyOrShopElement(btn)) {
      return btn;
    }
  }

  // 2. Repli strict : un bouton d'ouverture réel, mais JAMAIS la boutique/solde/header
  const buttons = Array.from(document.querySelectorAll('button, div[role="button"], a')).filter(el => {
    if (el.disabled || el.hasAttribute('disabled') || el.offsetParent === null) return false;
    if (isHeaderOrWalletElement(el) || isCurrencyOrShopElement(el)) return false;

    const title = (el.getAttribute('title') || el.title || '').toLowerCase();
    const aria = (el.getAttribute('aria-label') || '').toLowerCase();
    const text = (el.innerText || el.textContent || '').trim().toLowerCase();

    // Rejet formel et absolu de toute mention boutique / wikibidous
    if (title.includes('boutique') || aria.includes('boutique') || text.includes('boutique') ||
        text.includes('wikibidou') || text.includes('marché') || text.includes('acheter') || text.includes('vente') || text.includes('fermer')) {
      return false;
    }

    return text === 'ouvrir' || text === 'ouvrir un paquet' || text === 'ouvrir un booster' || 
           aria === 'ouvrir' || aria === 'ouvrir un paquet' || aria.includes('ouvrir');
  });

  return buttons[0] || null;
}

const findBoosterOpenButton = findOpenBoosterButton;

function isIgnoredTitle(txt) {
  if (!txt || txt.length < 2 || txt.length > 55) return true;
  const lower = txt.toLowerCase();
  if (
    lower.includes('wikimasters') ||
    lower.includes('wiki masters') ||
    lower.includes('ouvrir') ||
    lower.includes('pack') ||
    lower.includes('booster') ||
    lower.includes('continuer') ||
    lower.includes('terminer') ||
    lower.includes('valider') ||
    lower.includes('fermer') ||
    lower.includes('boutique') ||
    lower.includes('acheter') ||
    lower.includes('shop') ||
    lower.includes('wikibidous') ||
    IGNORED_TEXTS.has(lower)
  ) {
    return true;
  }
  return false;
}

// Récupère l'élément titre actuellement visible de la carte à l'écran (h3.text-base)
function getVisibleCardTitleElement() {
  const titleCandidates = document.querySelectorAll('h3.text-base, div[class*="top-[45%]"] h3, .card h3, div[class*="glow-"] h3, h3');
  for (let i = 0; i < titleCandidates.length; i++) {
    const candidate = titleCandidates[i];
    if (candidate && candidate.offsetParent !== null && !isHeaderOrWalletElement(candidate) && !isCurrencyOrShopElement(candidate)) {
      const txt = (candidate.innerText || candidate.textContent || '').trim();
      if (txt && !isIgnoredTitle(txt)) {
        return { element: candidate, text: txt };
      }
    }
  }
  return null;
}

function extractCardData(titleElement, detectedRarity) {
  const bottomBox = titleElement.closest('div[class*="top-[45%"]') || titleElement.parentElement;
  const fullCard = bottomBox ? bottomBox.parentElement : null;

  const name = (titleElement.innerText || titleElement.textContent || '').trim();
  const descEl = bottomBox ? bottomBox.querySelector('p') : null;
  const description = descEl ? descEl.innerText.trim() : '';

  let imageUrl = null;
  if (fullCard) {
    const topImageBox = fullCard.querySelector('div[class*="h-[45%"]');
    const illustrationImg = topImageBox ? topImageBox.querySelector('img') : null;

    if (illustrationImg) {
      imageUrl = illustrationImg.currentSrc || illustrationImg.src || illustrationImg.getAttribute('src');
    }

    if (!imageUrl) {
      const allImgs = fullCard.querySelectorAll('img');
      for (let i = 0; i < allImgs.length; i++) {
        const img = allImgs[i];
        const src = (img.src || img.getAttribute('src') || '').toLowerCase();
        if (!src.includes('commun.png') && 
            !src.includes('rare.png') && 
            !src.includes('legendaire.png') && 
            !src.includes('avatar') &&
            !src.includes('icon')) {
          imageUrl = img.currentSrc || img.src || img.getAttribute('src');
          break;
        }
      }
    }

    if (!imageUrl) {
      const elementsWithBg = fullCard.querySelectorAll('div, span, figure');
      for (let i = 0; i < elementsWithBg.length; i++) {
        const el = elementsWithBg[i];
        const bg = window.getComputedStyle(el).backgroundImage;
        if (bg && bg.startsWith('url(')) {
          const cleanUrl = bg.slice(4, -1).replace(/["']/g, '');
          if (cleanUrl && !cleanUrl.includes('data:image') && !cleanUrl.includes('.png')) {
            imageUrl = cleanUrl;
            break;
          }
        }
      }
    }

    if (imageUrl) {
      if (imageUrl.startsWith('//')) {
        imageUrl = window.location.protocol + imageUrl;
      } else if (imageUrl.startsWith('/')) {
        imageUrl = window.location.origin + imageUrl;
      }
    }
  }

  let attack = '';
  let defense = '';
  if (bottomBox) {
    const statSpans = bottomBox.querySelectorAll('span.font-bold');
    if (statSpans.length >= 2) {
      attack = statSpans[0].innerText.trim();
      defense = statSpans[1].innerText.trim();
    }
  }

  return {
    name,
    rarity: detectedRarity,
    description,
    imageUrl,
    attack,
    defense,
    lastPrice: '',
    minPrice: '',
    avgPrice: '',
    maxPrice: '',
    suggestedPrice: 0
  };
}

// Détection de rareté hautement optimisée
function getRarityFromBadge() {
  const badges = document.querySelectorAll(
    'div[style*="--color-rarity-"], .absolute.top-2.left-2, [class*="rounded-md"][class*="font-bold"], [class*="glow-"]'
  );

  for (let i = 0; i < badges.length; i++) {
    const b = badges[i];
    const rawText = (b.innerText || b.textContent || '').trim().toLowerCase();
    if (RARITY_MAP[rawText]) {
      return RARITY_MAP[rawText];
    }

    const styleAttr = (b.getAttribute('style') || '').toLowerCase();
    if (styleAttr.includes('--color-rarity-l')) return 'Légendaire';
    if (styleAttr.includes('--color-rarity-ur')) return 'Ultra rare';
    if (styleAttr.includes('--color-rarity-sr')) return 'Super rare';
    if (styleAttr.includes('--color-rarity-r')) return 'Rare';
    if (styleAttr.includes('--color-rarity-pc')) return 'Peu commune';
    if (styleAttr.includes('--color-rarity-c')) return 'Commune';
  }

  // Scan ciblé de fallback
  const fallbackBadges = document.querySelectorAll(
    'span.font-bold, div.font-bold, [class*="badge"], [class*="tag"], .absolute'
  );
  for (let i = 0; i < fallbackBadges.length; i++) {
    const el = fallbackBadges[i];
    if (el.children.length > 0) continue;
    const txt = (el.textContent || '').trim().toLowerCase();
    if (['ur', 'sr', 'pc', 'l', 'r', 'c'].includes(txt)) {
      return RARITY_MAP[txt];
    }
  }

  return 'Commune';
}

function forceCloseModal(modal) {
  if (!modal) return;
  try {
    const closeBtn = modal.querySelector('button[aria-label="Fermer"], button:has(svg), svg[class*="lucide-x"]');
    if (closeBtn) {
      forceClickElement(closeBtn.closest('button') || closeBtn);
    } else {
      forceClickElement(modal);
    }
  } catch (e) {}
}

// Injection statique unique de la règle de style masquant la modale lors de l'inspection
function ensureStealthStyle() {
  if (document.getElementById('wm-stealth-modal-style')) return;
  const stealthStyle = document.createElement('style');
  stealthStyle.id = 'wm-stealth-modal-style';
  stealthStyle.textContent = `
    div.fixed.inset-0.z-50.wm-inspecting {
      opacity: 0 !important;
      pointer-events: none !important;
      transition: none !important;
    }
  `;
  (document.head || document.documentElement).appendChild(stealthStyle);
}
ensureStealthStyle();

function inspectCardPricesStealth(cardElement, cardData, callback) {
  let isCallbackTriggered = false;
  let activeModalRef = null;
  let pollModal = null;
  let pollMarketData = null;

  const finishInspection = () => {
    if (isCallbackTriggered) return;
    isCallbackTriggered = true;

    if (inspectionWatchdog) {
      clearTimeout(inspectionWatchdog);
      inspectionWatchdog = null;
    }
    if (pollModal) clearInterval(pollModal);
    if (pollMarketData) clearInterval(pollMarketData);

    try {
      if (activeModalRef) {
        activeModalRef.classList.remove('wm-inspecting');
        forceCloseModal(activeModalRef);
      } else {
        const openModal = document.querySelector('div.fixed.inset-0.z-50');
        if (openModal) {
          openModal.classList.remove('wm-inspecting');
          forceCloseModal(openModal);
        }
      }
    } catch (e) {
      console.warn("Notice: Fermeture modale :", e);
    }

    setTimeout(() => {
      try {
        callback();
      } catch (err) {
        console.error("Erreur callback inspection :", err);
        isProcessingCardInspection = false;
      }
    }, 40);
  };

  inspectionWatchdog = setTimeout(() => {
    console.warn("⚠️ [Watchdog] Inspection trop longue (3.5s), reprise forcée.");
    finishInspection();
  }, 3500);

  try {
    forceClickElement(cardElement);
  } catch (err) {
    finishInspection();
    return;
  }

  let openAttempts = 0;
  pollModal = setInterval(() => {
    openAttempts++;
    const modal = document.querySelector('div.fixed.inset-0.z-50');

    if (modal) {
      clearInterval(pollModal);
      activeModalRef = modal;
      modal.classList.add('wm-inspecting');
      setBotLiveStatus(`💰 Consultation marché (${cardData.name})...`);

      const tabs = Array.from(modal.querySelectorAll('button[role="tab"], button, div[role="button"]'));
      const marketTab = tabs.find(t => {
        const txt = (t.innerText || t.textContent || '').toLowerCase();
        return txt.includes('march') || txt.includes('vente') || txt.includes('historique');
      });
      if (marketTab) forceClickElement(marketTab);

      let waitDataAttempts = 0;
      pollMarketData = setInterval(() => {
        waitDataAttempts++;

        // 1. Isoler strictement la section marché / onglet actif et exclure titres et descriptions de la carte
        const marketContainer = modal.querySelector('[role="tabpanel"], div[class*="tab-content"], div[class*="market"], div[class*="table"], div[class*="history"], div[class*="ventes"]') || modal;
        
        let marketText = '';
        if (marketContainer) {
          const cloned = marketContainer.cloneNode(true);
          const elementsToRemove = cloned.querySelectorAll('h1, h2, h3, h4, p.text-sm, [class*="description"], [class*="stats"], [class*="badge"], [class*="card-title"]');
          elementsToRemove.forEach(el => el.remove());
          marketText = (cloned.innerText || cloned.textContent || '');
        }

        const extractFromRegex = (regex) => {
          const m = marketText.match(regex);
          return m ? parsePriceString(m[1]) : 0;
        };

        const lastVal = extractFromRegex(RE_LAST);
        const minVal  = extractFromRegex(RE_MIN);
        const avgVal  = extractFromRegex(RE_AVG);
        const maxVal  = extractFromRegex(RE_MAX);

        // Recherche complémentaire dans les badges/lignes d'offres explicites avec le symbole 🪙
        let listingPrices = [];
        const coinPriceElements = marketContainer.querySelectorAll('span, div, td, p');
        for (let i = 0; i < coinPriceElements.length; i++) {
          const el = coinPriceElements[i];
          if (el.children.length === 0) {
            const rawText = (el.innerText || el.textContent || '').trim();
            const coinMatch = rawText.match(RE_COIN_PRICE);
            if (coinMatch) {
              const pStr = coinMatch[1] || coinMatch[2];
              const pVal = parsePriceString(pStr);
              if (pVal > 0 && pVal < 10000000) {
                listingPrices.push(pVal);
              }
            }
          }
        }

        const hasFoundRegexPrice = lastVal > 0 || minVal > 0 || avgVal > 0 || maxVal > 0;
        const hasFoundListingPrice = listingPrices.length > 0;

        if (hasFoundRegexPrice || hasFoundListingPrice || waitDataAttempts >= 12) {
          clearInterval(pollMarketData);

          if (lastVal > 0) cardData.lastPrice = String(lastVal);
          if (minVal > 0)  cardData.minPrice = String(minVal);
          if (avgVal > 0)  cardData.avgPrice = String(avgVal);
          if (maxVal > 0)  cardData.maxPrice = String(maxVal);

          // Si des prix d'offres individuelles sont trouvés sans agrégats explicites
          if (listingPrices.length > 0) {
            const sortedPrices = [...listingPrices].sort((a, b) => a - b);
            if (!cardData.minPrice || cardData.minPrice === '0') {
              cardData.minPrice = String(sortedPrices[0]);
            }
            if (!cardData.maxPrice || cardData.maxPrice === '0') {
              cardData.maxPrice = String(sortedPrices[sortedPrices.length - 1]);
            }
            if (!cardData.avgPrice || cardData.avgPrice === '0') {
              const sum = sortedPrices.reduce((a, b) => a + b, 0);
              cardData.avgPrice = String(Math.round(sum / sortedPrices.length));
            }
            if (!cardData.lastPrice || cardData.lastPrice === '0') {
              cardData.lastPrice = String(listingPrices[0]);
            }
          }

          const parsedMin = parseFloat(cardData.minPrice) || 0;
          const parsedAvg = parseFloat(cardData.avgPrice) || 0;
          const parsedLast = parseFloat(cardData.lastPrice) || 0;

          // Calcul intelligent du prix de revente conseillé
          if (parsedMin > 0 && parsedAvg > 0) {
            if (parsedAvg > parsedMin * 2.5) {
              cardData.suggestedPrice = Math.round(parsedMin * 1.15) || (parsedMin + 1);
            } else {
              cardData.suggestedPrice = Math.round((parsedMin + parsedAvg) / 2);
            }
          } else {
            cardData.suggestedPrice = Math.round(parsedMin || parsedAvg || parsedLast || 0);
          }

          finishInspection();
        }
      }, 80);
      return;
    }

    if (openAttempts > 8) {
      clearInterval(pollModal);
      finishInspection();
    }
  }, 50);
}

// Enregistrement atomique des cartes tirées pour stats et Live Feed
function recordPulledCard(detectedRarity, cardData) {
  cycleStats.cardsPulled++;
  cycleStats.rarityCounts[detectedRarity] = (cycleStats.rarityCounts[detectedRarity] || 0) + 1;
  cycleStats.cards.push(cardData);

  totalSessionStats.cardsPulled++;
  totalSessionStats.rarityCounts[detectedRarity] = (totalSessionStats.rarityCounts[detectedRarity] || 0) + 1;
  totalSessionStats.cards.push(cardData);

  totalCardsCountCache++;
  rarityCountsCache[detectedRarity] = (rarityCountsCache[detectedRarity] || 0) + 1;

  pulledCardsHistoryCache.push({
    name: cardData.name,
    rarity: detectedRarity,
    imageUrl: cardData.imageUrl || '',
    lastPrice: cardData.lastPrice,
    minPrice: cardData.minPrice,
    avgPrice: cardData.avgPrice,
    maxPrice: cardData.maxPrice,
    suggestedPrice: cardData.suggestedPrice,
    date: new Date().toLocaleTimeString()
  });

  if (pulledCardsHistoryCache.length > 1000) {
    pulledCardsHistoryCache = pulledCardsHistoryCache.slice(-1000);
  }

  chrome.storage.local.set({
    totalSessionStats,
    totalCardsCount: totalCardsCountCache,
    rarityCounts: rarityCountsCache,
    pulledCardsHistory: pulledCardsHistoryCache
  });
}

function recordPackOpened() {
  seenCardsInCurrentPack.clear();
  lastProcessedCardElement = null;
  lastProcessedCardText = '';
  lastCardProcessedTimestamp = 0;
  isTransitioning = false;

  cycleStats.packsOpened++;
  totalSessionStats.packsOpened++;
  totalPacksCountCache++;

  chrome.storage.local.set({
    totalSessionStats,
    totalPacksCount: totalPacksCountCache
  });
}

// Traitement centralisé d'une carte détectée
function processDetectedCard(candidate) {
  if (!isPullsPage() || isHandlingCaptcha || isProcessingCardInspection) return;

  const txt = (candidate.innerText || candidate.textContent || '').trim();
  if (!txt || isIgnoredTitle(txt)) return;

  // Si c'est exactement la même carte et le même élément déjà inspecté, ignorer
  if (candidate === lastProcessedCardElement && txt === lastProcessedCardText) return;

  const detectedRarity = getRarityFromBadge();
  const cardData = extractCardData(candidate, detectedRarity);

  // Enregistrement immédiat
  seenCardsInCurrentPack.add(txt);
  lastProcessedCardElement = candidate;
  lastProcessedCardText = txt;
  lastCardProcessedTimestamp = Date.now();
  markActivity(`Inspection carte ${seenCardsInCurrentPack.size}/5 (${txt})`);

  isProcessingCardInspection = true;
  if (isBotActive && !isPausedForBreak) {
    setBotLiveStatus(`🔍 Analyse carte ${seenCardsInCurrentPack.size}/5...`);
  } else {
    setBotLiveStatus(isPausedForBreak ? `☕ Pause : Scan "${cardData.name}"` : `🃏 Détection manuelle : ${cardData.name}`);
  }

  const cardContainer = candidate.closest('div.glow-c, div.glow-pc, div.glow-r, div.glow-sr, div.glow-ur, div.glow-l') || candidate;
  
  inspectCardPricesStealth(cardContainer, cardData, () => {
    try {
      recordPulledCard(detectedRarity, cardData);

      const targets = (config.targetCardsList || []).map(t => (t || '').trim().toLowerCase()).filter(Boolean);
      const isTargetMatched = targets.some(t => cardData.name.toLowerCase().includes(t));
      const priceVal = cardData.suggestedPrice || parseFloat(cardData.minPrice) || parseFloat(cardData.avgPrice) || 0;

      // A. Synthèse Audio Dynamique
      if (detectedRarity === 'Légendaire' || isTargetMatched) {
        playDynamicSound('legendary');
      } else if (detectedRarity === 'Ultra rare' || priceVal >= 1000) {
        playDynamicSound('ultra');
      } else if (detectedRarity === 'Super rare') {
        playDynamicSound('super_rare');
      }

      // B. Notifications & Discord
      if (config.discordWebhookUrl) {
        chrome.runtime.sendMessage({
          action: 'NOTIFY_DISCORD',
          data: { cardData, webhookUrl: config.discordWebhookUrl, config }
        });
      } else {
        chrome.runtime.sendMessage({
          action: 'TRIGGER_OS_NOTIF',
          data: { cardData, config }
        });
      }

      console.log(`🃏 [Carte ${seenCardsInCurrentPack.size}/5] : "${cardData.name}" [${detectedRarity}] | Max: ${cardData.maxPrice || '-'} | Conseillé : ${cardData.suggestedPrice || '-'}`);
    } catch (err) {
      console.error("Erreur post-inspection :", err);
    } finally {
      isProcessingCardInspection = false;
      markActivity(`Fin inspection ${cardData.name}`);
    }

    if (isBotActive && !isPausedForBreak) {
      // Temporisation minimale garantie de 1500ms par carte (y compris la 5ème)
      const elapsed = Date.now() - lastCardProcessedTimestamp;
      const targetDelay = getRandomInt(config.minClickDelay || 1500, config.maxClickDelay || 2200);
      const remainingDelay = Math.max(1500 - elapsed, targetDelay - elapsed, 1500);

      setTimeout(() => {
        if (!isBotActive || isPausedForBreak) return;
        runCycle();
      }, remainingDelay);
    } else {
      const remainingStr = isPausedForBreak ? "☕ En pause" : "Mode Manuel : Prêt";
      setBotLiveStatus(seenCardsInCurrentPack.size >= 5 ? (isPausedForBreak ? "☕ En pause (Pack scanné)" : "✨ Fin du pack manuel") : remainingStr);
    }
  });
}

// Fonction de détection appelée par l'observateur DOM (ouvertures manuelles)
function checkAndProcessVisibleCard() {
  if (isProcessingCardInspection || isHandlingCaptcha || !isPullsPage()) return;

  const visible = getVisibleCardTitleElement();
  if (visible) {
    const { element, text } = visible;
    if (element !== lastProcessedCardElement || text !== lastProcessedCardText) {
      processDetectedCard(element);
    }
  }
}

// Navigation synchronisée vers la carte suivante avec VERROUILLAGE isTransitioning & Pointeur Pur
function performSynchronizedCardSwipe() {
  if (isTransitioning || !isBotActive || isPausedForBreak) return;

  const currentVisible = getVisibleCardTitleElement();
  const currentElem = currentVisible ? currentVisible.element : lastProcessedCardElement;
  const currentText = currentVisible ? currentVisible.text : lastProcessedCardText;

  const nextArrowBtn = findNextArrowButton();
  if (!nextArrowBtn) {
    const finishBtn = findFinishPackButton();
    if (finishBtn) {
      markActivity("Clic terminer fin pack");
      seenCardsInCurrentPack.clear();
      lastProcessedCardElement = null;
      lastProcessedCardText = '';
      lastCardProcessedTimestamp = 0;
      forceClickElement(finishBtn);
      setTimeout(scheduleNextClick, 600);
      return;
    }
    scheduleNextClick();
    return;
  }

  // Verrouillage de transition strict
  isTransitioning = true;
  markActivity(`Swipe carte suivante (${seenCardsInCurrentPack.size}/5)`);
  setBotLiveStatus(isBreakPending ? `➡️ Finalisation pack (${seenCardsInCurrentPack.size}/5)...` : `➡️ Carte suivante (${seenCardsInCurrentPack.size}/5)...`);

  // Clic de pointeur forcé sur la flèche droite (sans événement clavier)
  forceClickElement(nextArrowBtn);

  let pollAttempts = 0;
  const pollInterval = 100;
  const maxPollAttempts = 30; // 3000ms max

  const checkDomChangeInterval = setInterval(() => {
    pollAttempts++;

    if (!isBotActive || isPausedForBreak) {
      clearInterval(checkDomChangeInterval);
      isTransitioning = false;
      return;
    }

    // A. Bouton de fin de paquet apparu ?
    const finishBtn = findFinishPackButton();
    if (finishBtn) {
      clearInterval(checkDomChangeInterval);
      isTransitioning = false;
      markActivity("Fin de pack détectée après swipe");
      runCycle();
      return;
    }

    // B. Nouvelle carte détectée dans le DOM (h3.text-base différent) ?
    const newVisible = getVisibleCardTitleElement();
    if (newVisible) {
      const isDifferentCard = (newVisible.element !== currentElem || newVisible.text !== currentText);
      if (isDifferentCard) {
        clearInterval(checkDomChangeInterval);
        isTransitioning = false;
        markActivity(`Nouvelle carte DOM stabilisée : ${newVisible.text}`);
        runCycle();
        return;
      }
    }

    // C. Si après 300ms (3 ticks de 100ms), la même carte est toujours affichée :
    // Interdire de swiper aveuglément : forcer un nouveau clic de pointeur
    if (pollAttempts === 3 || pollAttempts === 7 || pollAttempts === 12) {
      const retryArrowBtn = findNextArrowButton();
      if (retryArrowBtn) {
        console.log("🔄 [DOM Sync] Carte inchangée après 300ms. Re-clic de pointeur forcé...");
        forceClickElement(retryArrowBtn);
      }
    }

    // D. Dépassement du délai de transition (Watchdog local de secours)
    if (pollAttempts >= maxPollAttempts) {
      clearInterval(checkDomChangeInterval);
      isTransitioning = false;
      console.warn("⚠️ [DOM Sync] Timeout de transition DOM (3s). Poursuite du cycle.");
      runCycle();
    }
  }, pollInterval);
}

// Watchdog Global de Sécurité (Max 5 secondes) sans événement clavier
function initGlobalWatchdog() {
  if (globalWatchdogTimer) clearInterval(globalWatchdogTimer);
  globalWatchdogTimer = setInterval(() => {
    if (!isBotActive || isPausedForBreak) return;

    const now = Date.now();
    const elapsed = now - lastActivityTimestamp;

    // Si on est en attente légitime d'ouverture de booster, accorder un délai adapté
    if (isWaitingToOpenBooster) {
      const allowedWait = ((config.maxBoosterWaitSec || 4.0) + 2.0) * 1000;
      if (elapsed < allowedWait) return;
    }

    // Si le bot stagne sur la même action ou le même état pendant plus de 5 secondes consécutives
    if (elapsed >= 5000) {
      console.warn(`⚠️ [Watchdog 5s] Stagnation détectée sur "${lastActivityDescription}" depuis ${(elapsed / 1000).toFixed(1)}s. Forçage du déblocage...`);
      setBotLiveStatus("⚠️ Déblocage sécurité (Watchdog)...");

      // 1. Réinitialiser tous les drapeaux d'état bloquants
      isProcessingCardInspection = false;
      isWaitingToOpenBooster = false;
      isHandlingCaptcha = false;
      isTransitioning = false;

      if (inspectionWatchdog) {
        clearTimeout(inspectionWatchdog);
        inspectionWatchdog = null;
      }
      if (loopTimeout) {
        clearTimeout(loopTimeout);
        loopTimeout = null;
      }

      // 2. Fermer de force les modales ouvertes
      const openModal = document.querySelector('div.fixed.inset-0.z-50');
      if (openModal) {
        openModal.classList.remove('wm-inspecting');
        forceCloseModal(openModal);
      }

      // 3. Mécanisme de secours (sans événements clavier) :
      // A. Clic forcé sur bouton Terminer / Valider / Continuer
      const finishBtn = findFinishPackButton();
      if (finishBtn) {
        console.log("🛡️ [Watchdog 5s] Déblocage via bouton Terminer/Valider.");
        seenCardsInCurrentPack.clear();
        lastProcessedCardElement = null;
        lastProcessedCardText = '';
        lastCardProcessedTimestamp = 0;
        forceClickElement(finishBtn);
        markActivity("Watchdog Déblocage Finish");
        setTimeout(scheduleNextClick, 600);
        return;
      }

      // B. Clic forcé sur bouton flèche droite
      const arrowBtn = findNextArrowButton();
      if (arrowBtn && seenCardsInCurrentPack.size < 5) {
        console.log("🛡️ [Watchdog 5s] Déblocage via bouton Flèche Droite.");
        forceClickElement(arrowBtn);
        markActivity("Watchdog Déblocage Arrow");
        setTimeout(scheduleNextClick, 600);
        return;
      }

      // C. Clic forcé sur bouton Ouvrir booster (ciblant le paquet card_pack.png)
      const openBtn = findOpenBoosterButton();
      if (openBtn) {
        console.log("🛡️ [Watchdog 5s] Déblocage via bouton Ouvrir Booster.");
        seenCardsInCurrentPack.clear();
        lastProcessedCardElement = null;
        lastProcessedCardText = '';
        lastCardProcessedTimestamp = 0;
        lastBoosterOpenedTime = Date.now();
        recordPackOpened();
        forceClickElement(openBtn);
        markActivity("Watchdog Déblocage Open");
        setTimeout(scheduleNextClick, 800);
        return;
      }

      // D. Réinitialisation complète et relance
      console.log("🛡️ [Watchdog 5s] Réinitialisation d'état et relance du cycle.");
      seenCardsInCurrentPack.clear();
      lastProcessedCardElement = null;
      lastProcessedCardText = '';
      lastCardProcessedTimestamp = 0;
      markActivity("Watchdog Reset");
      scheduleNextClick();
    }
  }, 1000);
}
initGlobalWatchdog();

function sendSummary(type) {
  if (!config.discordWebhookUrl) return;

  const statsToSend = type === 'stop' ? totalSessionStats : cycleStats;
  if (statsToSend.cardsPulled === 0) return;

  const pauseEndSec = type === 'pause' ? Math.floor(currentSessionEnd / 1000) : null;

  chrome.runtime.sendMessage({
    action: 'SEND_SESSION_SUMMARY',
    data: {
      summaryType: type,
      sessionStats: statsToSend,
      webhookUrl: config.discordWebhookUrl,
      discordUserId: config.discordUserId,
      pauseThreadId: config.pauseThreadId,
      pauseEndTimestamp: pauseEndSec
    }
  });

  if (type === 'pause') {
    cycleStats = {
      packsOpened: 0,
      cardsPulled: 0,
      rarityCounts: {
        'Commune': 0, 'Peu commune': 0, 'Rare': 0,
        'Super rare': 0, 'Ultra rare': 0, 'Légendaire': 0
      },
      cards: []
    };
  } else if (type === 'stop') {
    cycleStats = { packsOpened: 0, cardsPulled: 0, rarityCounts: {}, cards: [] };
    totalSessionStats = { packsOpened: 0, cardsPulled: 0, rarityCounts: {}, cards: [] };
    chrome.storage.local.remove('totalSessionStats');
  }
}

function syncCycleState(isBreak) {
  chrome.storage.local.set({
    isPausedForBreak: isBreak,
    cycleInfo: {
      currentSessionEnd: currentSessionEnd,
      nextBreakDurationMin: nextBreakDurationMin,
      isPausedForBreak: isBreak
    }
  });
}

function triggerBreakPending() {
  if (isBreakPending || isPausedForBreak || !isBotActive) return;
  isBreakPending = true;
  console.log("⏳ [Session] Fin du booster en cours avant pause (Watchdog 4s armé)...");
  setBotLiveStatus("⏳ Fin du booster avant pause...");

  if (breakWatchdogTimeout) clearTimeout(breakWatchdogTimeout);
  breakWatchdogTimeout = setTimeout(() => {
    if (isBreakPending && !isPausedForBreak && isBotActive) {
      console.warn("⚠️ [Watchdog Pause] Timeout de 4s atteint. Forçage immédiat de la pause.");
      const finishBtn = findFinishPackButton();
      if (finishBtn) forceClickElement(finishBtn);
      seenCardsInCurrentPack.clear();
      lastProcessedCardElement = null;
      lastProcessedCardText = '';
      lastCardProcessedTimestamp = 0;
      executeBreak();
    }
  }, 4000);

  if (!isProcessingCardInspection && !isWaitingToOpenBooster && !isTransitioning) {
    if (loopTimeout) clearTimeout(loopTimeout);
    loopTimeout = setTimeout(runCycle, 150);
  }
}

function startNewActiveSession(isResumingFromBreak = false) {
  if (!isBotActive) return;
  if (breakWatchdogTimeout) clearTimeout(breakWatchdogTimeout);
  isPausedForBreak = false;
  isBreakPending = false;
  isWaitingToOpenBooster = false;
  isProcessingCardInspection = false;
  isHandlingCaptcha = false;
  isTransitioning = false;
  lastProcessedCardElement = null;
  lastProcessedCardText = '';
  lastCardProcessedTimestamp = 0;
  seenCardsInCurrentPack.clear();
  markActivity("Démarrage nouvelle session active");

  setBotLiveStatus("⚡ En attente de pack");

  if (isResumingFromBreak && config.discordWebhookUrl) {
    chrome.runtime.sendMessage({
      action: 'SEND_RESUME_STATUS',
      data: {
        webhookUrl: config.discordWebhookUrl,
        pauseThreadId: config.pauseThreadId,
        discordUserId: config.discordUserId
      }
    });
  }

  cycleStats = {
    packsOpened: 0,
    cardsPulled: 0,
    rarityCounts: {
      'Commune': 0, 'Peu commune': 0, 'Rare': 0,
      'Super rare': 0, 'Ultra rare': 0, 'Légendaire': 0
    },
    cards: []
  };

  if (config.humanCyclesEnabled) {
    const minMs = config.minActiveMin * 60 * 1000;
    const maxMs = config.maxActiveMin * 60 * 1000;
    const durationMs = Math.round(getRandomFloat(minMs, maxMs));
    currentSessionEnd = Date.now() + durationMs;

    const minBreakMs = config.minBreakMin * 60 * 1000;
    const maxBreakMs = config.maxBreakMin * 60 * 1000;
    const breakDurationMs = Math.round(getRandomFloat(minBreakMs, maxBreakMs));
    nextBreakDurationMin = (breakDurationMs / (60 * 1000)).toFixed(1);

    const activeSec = Math.round(durationMs / 1000);
    const m = Math.floor(activeSec / 60);
    const s = activeSec % 60;

    syncCycleState(false);
    console.log(`🟢 [Session] Nouveau farm actif : ${m}m ${s}s (pause de ${nextBreakDurationMin} min prévue).`);

    if (sessionTimeout) clearTimeout(sessionTimeout);
    if (config.maxBreakMin > 0) {
      sessionTimeout = setTimeout(triggerBreakPending, durationMs);
    }
  } else {
    syncCycleState(false);
  }

  const finishBtn = findFinishPackButton();
  if (finishBtn) {
    forceClickElement(finishBtn);
    setTimeout(scheduleNextClick, 600);
    return;
  }

  scheduleNextClick();
}

function executeBreak() {
  if (breakWatchdogTimeout) clearTimeout(breakWatchdogTimeout);
  isBreakPending = false;
  isPausedForBreak = true;
  isWaitingToOpenBooster = false;
  isProcessingCardInspection = false;
  isTransitioning = false;
  lastProcessedCardElement = null;
  lastProcessedCardText = '';
  lastCardProcessedTimestamp = 0;
  seenCardsInCurrentPack.clear();

  if (loopTimeout) clearTimeout(loopTimeout);

  const minBreakMs = config.minBreakMin * 60 * 1000;
  const maxBreakMs = config.maxBreakMin * 60 * 1000;
  const durationMs = Math.round(getRandomFloat(minBreakMs, maxBreakMs));

  if (durationMs <= 0) {
    startNewActiveSession(false);
    return;
  }

  currentSessionEnd = Date.now() + durationMs;
  breakCycleCount++;

  syncCycleState(true);
  sendSummary('pause');

  setBotLiveStatus(`☕ Pause café (${(durationMs / 60000).toFixed(1)} min)`);
  console.log(`☕ [Session] Booster terminé avec succès ! Pause de ${(durationMs / 60000).toFixed(1)}m.`);

  if (breakCycleCount % 4 === 0) {
    setTimeout(() => location.reload(), 3000);
    return;
  }

  if (sessionTimeout) clearTimeout(sessionTimeout);
  sessionTimeout = setTimeout(() => startNewActiveSession(true), durationMs);
}

function resumeSessionFromStorage(cycleInfo, isBreakStored) {
  const now = Date.now();
  const savedEnd = cycleInfo?.currentSessionEnd || 0;
  const remainingMs = savedEnd - now;

  if (isBreakStored) {
    if (remainingMs > 1000) {
      isPausedForBreak = true;
      isBreakPending = false;
      currentSessionEnd = savedEnd;
      nextBreakDurationMin = cycleInfo?.nextBreakDurationMin || 0;
      syncCycleState(true);
      setBotLiveStatus(`☕ Pause café (${(remainingMs / 60000).toFixed(1)} min restantes)`);
      console.log(`☕ [Reprise] Pause en cours : ${(remainingMs / 60000).toFixed(1)} min restantes.`);

      if (sessionTimeout) clearTimeout(sessionTimeout);
      sessionTimeout = setTimeout(() => startNewActiveSession(true), remainingMs);
    } else {
      console.log("☕ [Reprise] Pause écoulée pendant le rechargement. Relance.");
      startNewActiveSession(true);
    }
  } else {
    if (remainingMs > 1000 && config.humanCyclesEnabled) {
      isPausedForBreak = false;
      isBreakPending = false;
      currentSessionEnd = savedEnd;
      nextBreakDurationMin = cycleInfo?.nextBreakDurationMin || 0;
      syncCycleState(false);
      setBotLiveStatus("⚡ En attente de pack");
      console.log(`🟢 [Reprise] Farm en cours : ${(remainingMs / 60000).toFixed(1)} min restantes.`);

      if (sessionTimeout) clearTimeout(sessionTimeout);
      sessionTimeout = setTimeout(triggerBreakPending, remainingMs);

      scheduleNextClick();
    } else {
      startNewActiveSession(false);
    }
  }
}

// Boucle principale d'automatisation
function runCycle() {
  if (!isBotActive || isPausedForBreak || isWaitingToOpenBooster || isProcessingCardInspection || isTransitioning) return;

  if (!isPullsPage()) {
    scheduleNextClick();
    return;
  }

  // 1. Anti-robot / Captcha
  const captchaCheckbox = document.querySelector('input[type="checkbox"]:not(:checked)');
  const captchaModal = document.querySelector('div[class*="captcha"], div[class*="challenge"], [data-sitekey]');
  
  if (captchaCheckbox && captchaCheckbox.offsetParent !== null) {
    isHandlingCaptcha = true;
    markActivity("Résolution Captcha");
    setBotLiveStatus("⚠️ Résolution Captcha...");
    playDynamicSound('super_rare');
    forceClickElement(captchaCheckbox);
    setTimeout(scheduleNextClick, 1000);
    return;
  }

  if (isHandlingCaptcha || captchaModal) {
    const validateCaptchaBtn = Array.from(document.querySelectorAll('button')).find(b => {
      if (b.disabled || b.hasAttribute('disabled') || b.offsetParent === null) return false;
      const t = (b.innerText || '').toLowerCase();
      return t.includes('valider') || t.includes('continuer') || t.includes('vérifier');
    });

    if (validateCaptchaBtn) {
      markActivity("Validation Captcha");
      setBotLiveStatus("⚠️ Validation Captcha...");
      forceClickElement(validateCaptchaBtn);
      setTimeout(() => {
        isHandlingCaptcha = false;
        scheduleNextClick();
      }, 1200);
      return;
    }
  }

  if (!captchaCheckbox && !captchaModal) {
    isHandlingCaptcha = false;
  }

  // 2. Scan prioritaire de la carte visible actuelle (h3.text-base)
  // S'il reste des cartes à scanner (< 5), on scanne d'abord la carte avant toute action de fin de pack !
  if (seenCardsInCurrentPack.size < 5) {
    const visibleCard = getVisibleCardTitleElement();
    if (visibleCard) {
      const { element, text } = visibleCard;
      const isNewCard = (element !== lastProcessedCardElement || text !== lastProcessedCardText);

      if (isNewCard && !seenCardsInCurrentPack.has(text)) {
        processDetectedCard(element);
        return;
      }
    }
  }

  // 3. Navigation synchronisée vers la carte suivante si cartes 1 à 4 terminées
  if (seenCardsInCurrentPack.size > 0 && seenCardsInCurrentPack.size < 5) {
    performSynchronizedCardSwipe();
    return;
  }

  // 4. Détection d'un bouton de fin de paquet (Terminer / Valider / Continuer / Fermer)
  // IMPÉRATIF : Attendre que la 5ème carte ait bénéficié de son délai complet de 1500 ms !
  const finishPackBtn = findFinishPackButton();
  if (finishPackBtn) {
    const elapsedSinceLastCard = Date.now() - lastCardProcessedTimestamp;
    if (lastCardProcessedTimestamp > 0 && elapsedSinceLastCard < 1500) {
      setTimeout(runCycle, 1500 - elapsedSinceLastCard + 100);
      return;
    }

    markActivity("Validation du pack");
    if (isBreakPending) {
      if (breakWatchdogTimeout) clearTimeout(breakWatchdogTimeout);
      setBotLiveStatus("✨ Fin du pack, passage en pause");
      seenCardsInCurrentPack.clear();
      lastProcessedCardElement = null;
      lastProcessedCardText = '';
      lastCardProcessedTimestamp = 0;
      forceClickElement(finishPackBtn);
      setTimeout(executeBreak, 400);
      return;
    }

    setBotLiveStatus("✨ Validation du pack");
    seenCardsInCurrentPack.clear();
    lastProcessedCardElement = null;
    lastProcessedCardText = '';
    lastCardProcessedTimestamp = 0;
    forceClickElement(finishPackBtn);
    setTimeout(scheduleNextClick, 800);
    return;
  }

  // 5. Ouverture d'un booster (strictement dans la grille d'inventaire centrale via card_pack.png)
  const openBoosterBtn = findOpenBoosterButton();
  if (openBoosterBtn) {
    if (isBreakPending) {
      executeBreak();
      return;
    }

    const now = Date.now();
    if (now - lastBoosterOpenedTime < 2500) {
      scheduleNextClick();
      return;
    }

    const waitSec = getRandomFloat(config.minBoosterWaitSec || 2.0, config.maxBoosterWaitSec || 4.0);
    const waitMs = Math.round(waitSec * 1000);

    markActivity(`Temporisation ouverture booster (${waitSec.toFixed(1)}s)`);
    setBotLiveStatus(`⏳ Temporisation (${waitSec.toFixed(1)}s)...`);
    console.log(`📦 [Booster] Temporisation de ${waitSec.toFixed(1)}s avant ouverture...`);
    isWaitingToOpenBooster = true;

    setTimeout(() => {
      isWaitingToOpenBooster = false;
      if (!isBotActive || isPausedForBreak) return;

      if (isBreakPending) {
        executeBreak();
        return;
      }

      lastBoosterOpenedTime = Date.now();
      recordPackOpened();
      lastProcessedCardElement = null;
      lastProcessedCardText = '';
      lastCardProcessedTimestamp = 0;
      markActivity("Clic ouverture booster");
      setBotLiveStatus("📦 Ouverture du booster...");

      forceClickElement(openBoosterBtn);
      setTimeout(scheduleNextClick, 800);
    }, waitMs);
    return;
  }

  setBotLiveStatus("⚡ En attente de pack");
  scheduleNextClick();
}

function scheduleNextClick() {
  if (loopTimeout) clearTimeout(loopTimeout);
  if (!isBotActive || isPausedForBreak || isWaitingToOpenBooster || isProcessingCardInspection || isTransitioning) return;

  const nextDelay = Math.max(1500, getRandomInt(config.minClickDelay || 1500, config.maxClickDelay || 2200));
  loopTimeout = setTimeout(runCycle, nextDelay);
}

// Surveillance permanente du DOM pour les ouvertures manuelles et en pause
let isObserverFramePending = false;
const domObserver = new MutationObserver(() => {
  const isAutoLoopActive = isBotActive && !isPausedForBreak && !isWaitingToOpenBooster;
  if (isAutoLoopActive || !isPullsPage() || isProcessingCardInspection || isHandlingCaptcha || isObserverFramePending) return;

  isObserverFramePending = true;
  requestAnimationFrame(() => {
    isObserverFramePending = false;
    const isAutoLoopNow = isBotActive && !isPausedForBreak && !isWaitingToOpenBooster;
    if (isAutoLoopNow || !isPullsPage() || isProcessingCardInspection || isHandlingCaptcha) return;

    checkAndProcessVisibleCard();
  });
});

domObserver.observe(document.body, {
  childList: true,
  subtree: true
});

// Détection manuelle des ouvertures et interactions de paquet (Mode Manuel / En Pause)
document.addEventListener('click', (e) => {
  if (!isPullsPage() || isHandlingCaptcha) return;

  const target = e.target.closest('button, [role="button"], a, div');
  if (!target) return;

  // Ignorer absolument les interactions sur le header, la navbar et les boutons de boutique/solde
  if (isHeaderOrWalletElement(target) || isCurrencyOrShopElement(target)) return;

  const targetText = (target.innerText || target.textContent || '').trim().toLowerCase();

  const isRealOpenAction = (targetText.includes('ouvrir') || targetText.includes('booster')) &&
                           !targetText.includes('continuer') &&
                           !targetText.includes('valider') &&
                           !targetText.includes('marché') &&
                           !targetText.includes('boutique') &&
                           !targetText.includes('shop') &&
                           !targetText.includes('acheter');

  const isFinishAction = targetText.includes('terminer') || 
                         targetText.includes('fermer') || 
                         targetText.includes('valider') || 
                         targetText.includes('continuer');

  if (isRealOpenAction) {
    seenCardsInCurrentPack.clear();
    lastProcessedCardElement = null;
    lastProcessedCardText = '';
    lastCardProcessedTimestamp = 0;
    isTransitioning = false;
    setBotLiveStatus(isPausedForBreak ? "☕ En pause (Pack manuel ouvert)" : "Mode Manuel : Ouverture pack");
    if (!isBotActive || isPausedForBreak) {
      recordPackOpened();
    }
  } else if (isFinishAction) {
    seenCardsInCurrentPack.clear();
    lastProcessedCardElement = null;
    lastProcessedCardText = '';
    lastCardProcessedTimestamp = 0;
    isTransitioning = false;
    if (!isBotActive || isPausedForBreak) {
      setBotLiveStatus(isPausedForBreak ? "☕ En pause" : "Mode Manuel : Prêt");
    }
  } else {
    const isAutoLoopActive = isBotActive && !isPausedForBreak;
    if (!isAutoLoopActive && !isProcessingCardInspection) {
      requestAnimationFrame(() => {
        checkAndProcessVisibleCard();
      });
      setTimeout(() => {
        checkAndProcessVisibleCard();
      }, 150);
    }
  }
}, true);

// Initialisation globale au chargement de la page avec mise en cache mémoire
chrome.storage.local.get([
  'autoBoosterEnabled',
  'botConfig',
  'isPausedForBreak',
  'cycleInfo',
  'totalSessionStats',
  'totalPacksCount',
  'totalCardsCount',
  'rarityCounts',
  'pulledCardsHistory'
], (result) => {
  isBotActive = !!result.autoBoosterEnabled;
  if (result.botConfig) config = { ...config, ...result.botConfig };
  if (result.totalSessionStats) totalSessionStats = result.totalSessionStats;
  if (typeof result.totalPacksCount === 'number') totalPacksCountCache = result.totalPacksCount;
  if (typeof result.totalCardsCount === 'number') totalCardsCountCache = result.totalCardsCount;
  if (result.rarityCounts) rarityCountsCache = result.rarityCounts;
  if (result.pulledCardsHistory) pulledCardsHistoryCache = result.pulledCardsHistory;

  if (isBotActive) {
    resumeSessionFromStorage(result.cycleInfo, !!result.isPausedForBreak);
  } else {
    setBotLiveStatus("Mode Manuel : Prêt");
  }
});

chrome.storage.onChanged.addListener((changes) => {
  if (changes.totalPacksCount) totalPacksCountCache = changes.totalPacksCount.newValue || 0;
  if (changes.totalCardsCount) totalCardsCountCache = changes.totalCardsCount.newValue || 0;
  if (changes.rarityCounts) rarityCountsCache = changes.rarityCounts.newValue || rarityCountsCache;
  if (changes.pulledCardsHistory) pulledCardsHistoryCache = changes.pulledCardsHistory.newValue || [];

  if (changes.autoBoosterEnabled) {
    const nextState = changes.autoBoosterEnabled.newValue;
    if (isBotActive && !nextState && totalSessionStats.cardsPulled > 0) {
      sendSummary('stop');
    }
    isBotActive = nextState;
    if (isBotActive) {
      totalSessionStats = { packsOpened: 0, cardsPulled: 0, rarityCounts: {}, cards: [] };
      chrome.storage.local.remove('totalSessionStats');
      seenCardsInCurrentPack.clear();
      lastProcessedCardElement = null;
      lastProcessedCardText = '';
      lastCardProcessedTimestamp = 0;
      isTransitioning = false;
      markActivity("Démarrage du bot");
      setBotLiveStatus("⚡ En attente de pack");
      startNewActiveSession(false);
    } else {
      if (loopTimeout) clearTimeout(loopTimeout);
      if (sessionTimeout) clearTimeout(sessionTimeout);
      if (breakWatchdogTimeout) clearTimeout(breakWatchdogTimeout);
      if (inspectionWatchdog) clearTimeout(inspectionWatchdog);
      isPausedForBreak = false;
      isBreakPending = false;
      isWaitingToOpenBooster = false;
      isProcessingCardInspection = false;
      isHandlingCaptcha = false;
      isTransitioning = false;
      lastProcessedCardElement = null;
      lastProcessedCardText = '';
      lastCardProcessedTimestamp = 0;
      seenCardsInCurrentPack.clear();
      setBotLiveStatus("Mode Manuel : Prêt");
      syncCycleState(false);
    }
  }

  if (changes.botConfig) {
    config = { ...config, ...changes.botConfig.newValue };
    if (!config.humanCyclesEnabled && isPausedForBreak) {
      isPausedForBreak = false;
      isBreakPending = false;
      startNewActiveSession(false);
    }
  }
});