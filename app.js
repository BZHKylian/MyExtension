// ==========================================================================
// WikiMasters Pro — Dashboard Application Logic v3.0
// ==========================================================================

const RARITY_COLORS = {
  'Commune': '#94a3b8',
  'Peu commune': '#22c55e',
  'Rare': '#3b82f6',
  'Super rare': '#a855f7',
  'Ultra rare': '#f97316',
  'Légendaire': '#eab308'
};

const RARITY_SLUGS = {
  'Commune': 'commune',
  'Peu commune': 'peu-commune',
  'Rare': 'rare',
  'Super rare': 'super-rare',
  'Ultra rare': 'ultra-rare',
  'Légendaire': 'legendaire'
};

// État global de l'application
const state = {
  totalPacksCount: 0,
  pulledCardsHistory: [],
  rarityCounts: {
    'Commune': 0,
    'Peu commune': 0,
    'Rare': 0,
    'Super rare': 0,
    'Ultra rare': 0,
    'Légendaire': 0
  },
  botStatus: 'Bot Prêt',
  
  // Table Pagination & Filter State
  tableFilterRarity: 'ALL',
  tableSearchQuery: '',
  tableCurrentPage: 1,
  tablePageSize: 12
};

// Liste de cartes réalistes pour la génération de données démo
const DEMO_CARDS_POOL = [
  { name: 'Adèle Castillon', rarity: 'Légendaire', min: 1450, avg: 1720, max: 2100, suggested: 1650 },
  { name: 'Squeezie — Golden Edition', rarity: 'Légendaire', min: 1800, avg: 2200, max: 2600, suggested: 2000 },
  { name: 'Kameto — General KC', rarity: 'Ultra rare', min: 450, avg: 580, max: 720, suggested: 520 },
  { name: 'Inoxtag — Everest Peak', rarity: 'Ultra rare', min: 620, avg: 790, max: 950, suggested: 700 },
  { name: 'ZeratoR — ZLAN Master', rarity: 'Ultra rare', min: 510, avg: 640, max: 800, suggested: 580 },
  { name: 'Amixem — Red Box', rarity: 'Super rare', min: 180, avg: 240, max: 310, suggested: 210 },
  { name: 'Gotaga — The French Monster', rarity: 'Super rare', min: 220, avg: 290, max: 370, suggested: 260 },
  { name: 'Michou — Dance Floor', rarity: 'Super rare', min: 160, avg: 210, max: 280, suggested: 190 },
  { name: 'Mister V — Rap & Comedy', rarity: 'Super rare', min: 190, avg: 250, max: 330, suggested: 220 },
  { name: 'Domingo — Popcorn Host', rarity: 'Rare', min: 75, avg: 110, max: 150, suggested: 95 },
  { name: 'Joueur du Grenier', rarity: 'Rare', min: 80, avg: 120, max: 165, suggested: 105 },
  { name: 'Antoine Daniel — WTC', rarity: 'Rare', min: 70, avg: 100, max: 140, suggested: 88 },
  { name: 'Ponce — Fleuriste', rarity: 'Rare', min: 65, avg: 95, max: 130, suggested: 80 },
  { name: 'Maghla — Horror Stream', rarity: 'Peu commune', min: 25, avg: 38, max: 55, suggested: 32 },
  { name: 'Baghera Jones', rarity: 'Peu commune', min: 20, avg: 32, max: 48, suggested: 28 },
  { name: 'Etoiles — Nuit de la Culture', rarity: 'Peu commune', min: 30, avg: 45, max: 62, suggested: 38 },
  { name: 'Maxence', rarity: 'Peu commune', min: 18, avg: 28, max: 40, suggested: 24 },
  { name: 'Écran de Fin de Stream', rarity: 'Commune', min: 3, avg: 5, max: 9, suggested: 4 },
  { name: 'Micro Shure SM7B', rarity: 'Commune', min: 5, avg: 8, max: 12, suggested: 6 },
  { name: 'Fauteuil Gaming Usé', rarity: 'Commune', min: 2, avg: 4, max: 7, suggested: 3 },
  { name: 'Booster WikiMasters Pack', rarity: 'Commune', min: 4, avg: 6, max: 10, suggested: 5 },
  { name: 'Setup Double Écran', rarity: 'Commune', min: 6, avg: 9, max: 14, suggested: 8 }
];

// ==========================================================================
// 1. INITIALISATION & NAVIGATION
// ==========================================================================
document.addEventListener('DOMContentLoaded', () => {
  initNavigation();
  initDataStorage();
  initTableControls();
  initDataTools();
  initModal();
  renderAll();

  // Redimensionnement fluide des Canvas
  window.addEventListener('resize', () => {
    renderEvolutionChart();
    renderRarityDonut();
    renderPriceTiersChart();
  });
});

function initNavigation() {
  const navItems = document.querySelectorAll('.nav-item');
  const sections = document.querySelectorAll('.dashboard-section');
  const pageTitle = document.getElementById('currentPageTitle');
  const pageSubtitle = document.getElementById('currentPageSubtitle');
  const mobileMenuBtn = document.getElementById('mobileMenuBtn');
  const sidebar = document.getElementById('sidebar');

  const titles = {
    'section-overview': {
      title: 'Tableau de Bord Global',
      subtitle: 'Suivi des ouvertures, analyse du marché et rentabilité en temps réel'
    },
    'section-history': {
      title: 'Historique des Cartes Récoltées',
      subtitle: 'Liste complète des cartes tirées avec prix du marché et filtres'
    },
    'section-analytics': {
      title: 'Analyses Avancées & Raretés',
      subtitle: 'Distribution des valeurs, paliers de revente et fréquences de drop'
    },
    'section-data': {
      title: 'Gestion des Données & Synchronisation',
      subtitle: 'Importation, exportation et sauvegardes locales'
    }
  };

  const switchTab = (targetSectionId) => {
    navItems.forEach(item => {
      const match = item.dataset.target === targetSectionId;
      item.classList.toggle('active', match);
    });

    sections.forEach(sec => {
      const match = sec.id === targetSectionId;
      sec.classList.toggle('active', match);
    });

    if (titles[targetSectionId]) {
      pageTitle.textContent = titles[targetSectionId].title;
      pageSubtitle.textContent = titles[targetSectionId].subtitle;
    }

    if (window.innerWidth <= 768) {
      sidebar.classList.remove('mobile-open');
    }

    // Re-rendre les canvas lorsque l'onglet devient visible
    setTimeout(() => {
      renderEvolutionChart();
      renderRarityDonut();
      renderPriceTiersChart();
    }, 50);
  };

  navItems.forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const targetId = item.dataset.target;
      switchTab(targetId);
    });
  });

  // Liens internes de changement d'onglet
  document.querySelectorAll('.nav-switch-link').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      switchTab('section-history');
    });
  });

  // Menu mobile
  if (mobileMenuBtn) {
    mobileMenuBtn.addEventListener('click', () => {
      sidebar.classList.toggle('mobile-open');
    });
  }
}

// ==========================================================================
// 2. STOCKAGE LOCAL & GESTION DES DONNÉES
// ==========================================================================
function initDataStorage() {
  const saved = localStorage.getItem('wm_dashboard_data');
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      state.totalPacksCount = parsed.totalPacksCount || 0;
      state.pulledCardsHistory = parsed.pulledCardsHistory || [];
      state.rarityCounts = parsed.rarityCounts || state.rarityCounts;
      state.botStatus = parsed.botStatus || 'Bot Prêt';
    } catch (e) {
      console.warn("Erreur chargement localStorage :", e);
      generateDemoDataset();
    }
  } else {
    // Premier lancement : Générer un jeu de données réaliste pour émerveiller l'utilisateur
    generateDemoDataset();
  }
}

function saveStateToLocalStorage() {
  const payload = {
    totalPacksCount: state.totalPacksCount,
    pulledCardsHistory: state.pulledCardsHistory,
    rarityCounts: state.rarityCounts,
    botStatus: state.botStatus,
    savedAt: new Date().toISOString()
  };
  localStorage.setItem('wm_dashboard_data', JSON.stringify(payload));
}

function generateDemoDataset() {
  const packs = 28;
  const totalCards = packs * 5;
  const history = [];
  const rarityCounts = {
    'Commune': 0, 'Peu commune': 0, 'Rare': 0,
    'Super rare': 0, 'Ultra rare': 0, 'Légendaire': 0
  };

  const now = Date.now();
  for (let i = 0; i < totalCards; i++) {
    // Sélection pondérée réaliste
    const roll = Math.random();
    let sample = DEMO_CARDS_POOL[DEMO_CARDS_POOL.length - 1];

    if (roll < 0.02) {
      sample = DEMO_CARDS_POOL[0]; // Légendaire Adèle
    } else if (roll < 0.04) {
      sample = DEMO_CARDS_POOL[1]; // Légendaire Squeezie
    } else if (roll < 0.12) {
      sample = DEMO_CARDS_POOL[Math.floor(Math.random() * 3) + 2]; // Ultra rare
    } else if (roll < 0.28) {
      sample = DEMO_CARDS_POOL[Math.floor(Math.random() * 4) + 5]; // Super rare
    } else if (roll < 0.55) {
      sample = DEMO_CARDS_POOL[Math.floor(Math.random() * 4) + 9]; // Rare
    } else if (roll < 0.80) {
      sample = DEMO_CARDS_POOL[Math.floor(Math.random() * 4) + 13]; // Peu commune
    } else {
      sample = DEMO_CARDS_POOL[Math.floor(Math.random() * 5) + 17]; // Commune
    }

    const cardDate = new Date(now - (totalCards - i) * 75000);

    const cardObj = {
      name: sample.name,
      rarity: sample.rarity,
      imageUrl: 'icon.jpg',
      suggestedPrice: sample.suggested,
      minPrice: String(sample.min),
      avgPrice: String(sample.avg),
      maxPrice: String(sample.max),
      lastPrice: String(sample.min),
      date: cardDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    };

    history.push(cardObj);
    rarityCounts[sample.rarity] = (rarityCounts[sample.rarity] || 0) + 1;
  }

  state.totalPacksCount = packs;
  state.pulledCardsHistory = history;
  state.rarityCounts = rarityCounts;
  state.botStatus = 'En Action';
  saveStateToLocalStorage();
}

// ==========================================================================
// 3. RENDU GLOBAL DU DASHBOARD
// ==========================================================================
function renderAll() {
  renderHeaderAndKPIs();
  renderEvolutionChart();
  renderRarityDonut();
  renderPriceTiersChart();
  renderDropRates();
  renderTopValuableCards();
  renderRecentOverview();
  renderHistoryTable();
}

function renderHeaderAndKPIs() {
  const totalPacks = state.totalPacksCount || Math.ceil(state.pulledCardsHistory.length / 5) || 0;
  const totalCards = state.pulledCardsHistory.length;

  let totalEstimatedValue = 0;
  state.pulledCardsHistory.forEach(c => {
    totalEstimatedValue += (c.suggestedPrice || parseFloat(c.minPrice) || parseFloat(c.avgPrice) || 0);
  });

  const legCount = state.rarityCounts['Légendaire'] || 0;
  const urCount = state.rarityCounts['Ultra rare'] || 0;
  const srCount = state.rarityCounts['Super rare'] || 0;
  const majorDrops = legCount + urCount + srCount;

  const avgPackVal = totalPacks > 0 ? Math.round(totalEstimatedValue / totalPacks) : 0;

  // Header
  document.getElementById('headerTotalBalance').textContent = `${totalEstimatedValue.toLocaleString('fr-FR')} 🪙`;
  document.getElementById('botStatusText').textContent = state.botStatus || 'Bot Prêt';

  // KPI 1 : Packs
  document.getElementById('kpiTotalPacks').textContent = totalPacks.toLocaleString('fr-FR');
  document.getElementById('kpiCardsRatio').textContent = `${totalCards} cartes`;

  // KPI 2 : Valeur Totale
  document.getElementById('kpiTotalValue').textContent = `${totalEstimatedValue.toLocaleString('fr-FR')} 🪙`;

  // KPI 3 : Drops Majeurs
  document.getElementById('kpiMajorDrops').textContent = majorDrops.toLocaleString('fr-FR');
  document.getElementById('kpiLegendaryCount').textContent = `${legCount} Légendaire${legCount > 1 ? 's' : ''} • ${urCount} Ultra`;

  // KPI 4 : Rentabilité Moyenne
  document.getElementById('kpiAvgPackValue').textContent = `${avgPackVal.toLocaleString('fr-FR')} 🪙`;
}

// ==========================================================================
// 4. MOTEUR GRAPHIQUE CANVAS NATIF (SANS LIBRAIRIE)
// ==========================================================================

// A. Graphique Linéaire d'Évolution des Gains Cumulés
function renderEvolutionChart() {
  const canvas = document.getElementById('evolutionChartCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const rect = canvas.parentElement.getBoundingClientRect();

  // Prise en charge du Retina Display
  const dpr = window.devicePixelRatio || 1;
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);

  const w = rect.width;
  const h = rect.height;

  ctx.clearRect(0, 0, w, h);

  const cards = state.pulledCardsHistory;
  if (cards.length === 0) {
    ctx.fillStyle = '#64748b';
    ctx.font = '12px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Aucune donnée d\'évolution disponible', w / 2, h / 2);
    return;
  }

  // Calcul des points de gains cumulés
  const points = [];
  let runningTotal = 0;
  cards.forEach((c, idx) => {
    runningTotal += (c.suggestedPrice || parseFloat(c.minPrice) || parseFloat(c.avgPrice) || 0);
    points.push({ xIndex: idx, val: runningTotal, name: c.name, date: c.date });
  });

  const maxVal = Math.max(...points.map(p => p.val), 100);
  const padLeft = 50;
  const padRight = 20;
  const padTop = 20;
  const padBottom = 30;

  const chartW = w - padLeft - padRight;
  const chartH = h - padTop - padBottom;

  // 1. Grille de fond & Échelle Y
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
  ctx.lineWidth = 1;
  ctx.fillStyle = '#64748b';
  ctx.font = '10px Inter, sans-serif';
  ctx.textAlign = 'right';

  const gridSteps = 4;
  for (let i = 0; i <= gridSteps; i++) {
    const yVal = Math.round((maxVal / gridSteps) * i);
    const yPos = h - padBottom - (chartH / gridSteps) * i;

    ctx.beginPath();
    ctx.moveTo(padLeft, yPos);
    ctx.lineTo(w - padRight, yPos);
    ctx.stroke();

    ctx.fillText(`${yVal} 🪙`, padLeft - 8, yPos + 3);
  }

  // 2. Tracé de la courbe
  const getX = (idx) => padLeft + (chartW / Math.max(1, points.length - 1)) * idx;
  const getY = (val) => h - padBottom - (chartH * (val / maxVal));

  ctx.beginPath();
  ctx.moveTo(getX(0), getY(points[0].val));

  for (let i = 1; i < points.length; i++) {
    const prevX = getX(i - 1);
    const prevY = getY(points[i - 1].val);
    const currX = getX(i);
    const currY = getY(points[i].val);

    const cpX1 = prevX + (currX - prevX) / 2;
    const cpY1 = prevY;
    const cpX2 = prevX + (currX - prevX) / 2;
    const cpY2 = currY;

    ctx.bezierCurveTo(cpX1, cpY1, cpX2, cpY2, currX, currY);
  }

  // Gradient de remplissage sous la courbe
  const gradient = ctx.createLinearGradient(0, padTop, 0, h - padBottom);
  gradient.addColorStop(0, 'rgba(56, 189, 248, 0.25)');
  gradient.addColorStop(1, 'rgba(56, 189, 248, 0.0)');

  // Fermeture du chemin pour le remplissage
  const fillPath = new Path2D(ctx);
  fillPath.lineTo(getX(points.length - 1), h - padBottom);
  fillPath.lineTo(getX(0), h - padBottom);
  fillPath.closePath();
  ctx.fillStyle = gradient;
  ctx.fill(fillPath);

  // Ligne de contour lumineuse
  ctx.strokeStyle = '#38bdf8';
  ctx.lineWidth = 2.5;
  ctx.shadowColor = 'rgba(56, 189, 248, 0.5)';
  ctx.shadowBlur = 8;
  ctx.stroke();
  ctx.shadowBlur = 0; // Reset shadow

  // 3. Point final avec halo
  const lastPoint = points[points.length - 1];
  const lastX = getX(points.length - 1);
  const lastY = getY(lastPoint.val);

  ctx.beginPath();
  ctx.arc(lastX, lastY, 4, 0, Math.PI * 2);
  ctx.fillStyle = '#fff';
  ctx.fill();
  ctx.strokeStyle = '#38bdf8';
  ctx.lineWidth = 2;
  ctx.stroke();
}

// B. Diagramme Donut des Raretés
function renderRarityDonut() {
  const canvas = document.getElementById('rarityDonutCanvas');
  const legendEl = document.getElementById('donutLegend');
  if (!canvas || !legendEl) return;

  const ctx = canvas.getContext('2d');
  const rect = canvas.parentElement.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;

  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);

  const w = rect.width;
  const h = rect.height;
  const cx = w / 2;
  const cy = h / 2;
  const radius = Math.min(w, h) / 2 - 4;
  const cutout = radius * 0.65;

  ctx.clearRect(0, 0, w, h);

  const rarities = ['Légendaire', 'Ultra rare', 'Super rare', 'Rare', 'Peu commune', 'Commune'];
  const counts = state.rarityCounts;
  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  if (total === 0) {
    ctx.fillStyle = '#64748b';
    ctx.font = '10px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Aucune carte', cx, cy);
    legendEl.innerHTML = '';
    return;
  }

  let startAngle = -Math.PI / 2;
  let legendHtml = '';

  rarities.forEach(r => {
    const val = counts[r] || 0;
    const pct = ((val / total) * 100).toFixed(1);
    const sliceAngle = (val / total) * (Math.PI * 2);
    const color = RARITY_COLORS[r] || '#94a3b8';

    if (val > 0) {
      ctx.beginPath();
      ctx.arc(cx, cy, radius, startAngle, startAngle + sliceAngle);
      ctx.arc(cx, cy, cutout, startAngle + sliceAngle, startAngle, true);
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
      startAngle += sliceAngle;
    }

    legendHtml += `
      <div class="legend-item">
        <span><span class="legend-color-dot" style="background: ${color};"></span>${r}</span>
        <span class="legend-count">${val} <small style="color: var(--text-dim); font-weight: normal;">(${pct}%)</small></span>
      </div>
    `;
  });

  // Texte central au cœur du Donut
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 16px Outfit, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(total, cx, cy - 2);

  ctx.fillStyle = '#94a3b8';
  ctx.font = '8.5px Inter, sans-serif';
  ctx.fillText('CARTES', cx, cy + 12);

  legendEl.innerHTML = legendHtml;
}

// C. Graphique des Paliers de Prix (Barres Horizontales Canvas)
function renderPriceTiersChart() {
  const canvas = document.getElementById('priceTiersChartCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const rect = canvas.parentElement.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;

  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);

  const w = rect.width;
  const h = rect.height;
  ctx.clearRect(0, 0, w, h);

  const tiers = [
    { label: '+1000 🪙', color: '#f59e0b', min: 1000, max: Infinity, count: 0 },
    { label: '250 - 1000 🪙', color: '#a855f7', min: 250, max: 1000, count: 0 },
    { label: '100 - 250 🪙', color: '#3b82f6', min: 100, max: 250, count: 0 },
    { label: '50 - 100 🪙', color: '#22c55e', min: 50, max: 100, count: 0 },
    { label: '0 - 50 🪙', color: '#94a3b8', min: 0, max: 50, count: 0 }
  ];

  state.pulledCardsHistory.forEach(c => {
    const p = (c.suggestedPrice || parseFloat(c.minPrice) || parseFloat(c.avgPrice) || 0);
    for (let t of tiers) {
      if (p >= t.min && p < t.max) {
        t.count++;
        break;
      }
    }
  });

  const maxCount = Math.max(...tiers.map(t => t.count), 1);
  const rowHeight = (h - 20) / tiers.length;
  const labelWidth = 100;
  const barMaxWidth = w - labelWidth - 60;

  tiers.forEach((t, idx) => {
    const y = 10 + idx * rowHeight;
    const barW = Math.max(4, (t.count / maxCount) * barMaxWidth);

    // Label
    ctx.fillStyle = '#cbd5e1';
    ctx.font = '11px Inter, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(t.label, 10, y + rowHeight / 2 + 4);

    // Fond de barre
    ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
    ctx.beginPath();
    ctx.roundRect(labelWidth, y + 6, barMaxWidth, rowHeight - 12, 4);
    ctx.fill();

    // Barre active colorée
    ctx.fillStyle = t.color;
    ctx.beginPath();
    ctx.roundRect(labelWidth, y + 6, barW, rowHeight - 12, 4);
    ctx.fill();

    // Compteur
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 11px Inter, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`${t.count}`, labelWidth + barW + 8, y + rowHeight / 2 + 4);
  });
}

function renderDropRates() {
  const container = document.getElementById('dropRatesList');
  if (!container) return;

  const total = state.pulledCardsHistory.length || 1;
  const rarities = [
    { name: 'Légendaire', theo: '0.8%', color: 'var(--c-legendaire)' },
    { name: 'Ultra rare', theo: '4.2%', color: 'var(--c-ultra-rare)' },
    { name: 'Super rare', theo: '12.0%', color: 'var(--c-super-rare)' },
    { name: 'Rare', theo: '25.0%', color: 'var(--c-rare)' },
    { name: 'Peu commune', theo: '28.0%', color: 'var(--c-peu-commune)' },
    { name: 'Commune', theo: '30.0%', color: 'var(--c-commune)' }
  ];

  let html = '';
  rarities.forEach(r => {
    const count = state.rarityCounts[r.name] || 0;
    const actualPct = ((count / total) * 100).toFixed(1);

    html += `
      <div style="background: rgba(15, 23, 42, 0.5); border: 1px solid var(--border); border-radius: var(--radius-md); padding: 10px 14px; display: flex; align-items: center; justify-content: space-between;">
        <div>
          <span style="color: ${r.color}; font-weight: 800; font-size: 12px;">${r.name}</span>
          <div style="font-size: 10.5px; color: var(--text-dim); margin-top: 2px;">Taux théorique : ${r.theo}</div>
        </div>
        <div style="text-align: right;">
          <div style="font-size: 13px; font-weight: 800; color: #fff;">${actualPct}%</div>
          <div style="font-size: 10.5px; color: var(--text-muted);">${count} carte${count > 1 ? 's' : ''}</div>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
}

// ==========================================================================
// 5. LEADERBOARD & FLUX EN DIRECT
// ==========================================================================
function renderTopValuableCards() {
  const container = document.getElementById('topValuableCardsList');
  if (!container) return;

  const sorted = [...state.pulledCardsHistory].sort((a, b) => {
    const priceA = a.suggestedPrice || parseFloat(a.minPrice) || 0;
    const priceB = b.suggestedPrice || parseFloat(b.minPrice) || 0;
    return priceB - priceA;
  });

  const top5 = sorted.slice(0, 5);

  if (top5.length === 0) {
    container.innerHTML = '<div style="color: var(--text-dim); font-size: 12px; text-align: center; padding: 20px;">Aucune carte enregistrée</div>';
    return;
  }

  let html = '';
  top5.forEach((card, idx) => {
    const slug = RARITY_SLUGS[card.rarity] || 'commune';
    const price = card.suggestedPrice || card.minPrice || card.avgPrice || '-';
    const imgUrl = card.imageUrl || 'icon.jpg';

    html += `
      <div class="top-card-item" onclick="openCardModalByName('${escapeHtml(card.name)}')">
        <span class="top-rank-badge rank-${idx + 1}">#${idx + 1}</span>
        <div class="top-card-img-wrap">
          <img src="${imgUrl}" alt="${card.name}" class="top-card-img" onerror="this.src='icon.jpg'">
        </div>
        <div class="top-card-info">
          <div class="top-card-name">${card.name}</div>
          <span class="top-card-rarity" style="color: ${RARITY_COLORS[card.rarity] || '#94a3b8'};">${card.rarity}</span>
        </div>
        <div class="top-card-price">💡 ${price} 🪙</div>
      </div>
    `;
  });

  container.innerHTML = html;
}

function renderRecentOverview() {
  const container = document.getElementById('recentOverviewList');
  if (!container) return;

  const recent = state.pulledCardsHistory.slice(-5).reverse();

  if (recent.length === 0) {
    container.innerHTML = '<div style="color: var(--text-dim); font-size: 12px; text-align: center; padding: 20px;">Aucune carte dans l\'historique</div>';
    return;
  }

  let html = '';
  recent.forEach((card) => {
    const price = card.suggestedPrice || card.minPrice || '-';
    const imgUrl = card.imageUrl || 'icon.jpg';

    html += `
      <div class="top-card-item" onclick="openCardModalByName('${escapeHtml(card.name)}')">
        <div class="top-card-img-wrap">
          <img src="${imgUrl}" alt="${card.name}" class="top-card-img" onerror="this.src='icon.jpg'">
        </div>
        <div class="top-card-info">
          <div class="top-card-name">${card.name}</div>
          <span class="top-card-rarity" style="color: ${RARITY_COLORS[card.rarity] || '#94a3b8'};">${card.rarity}</span>
        </div>
        <div style="text-align: right;">
          <div style="font-size: 12px; font-weight: 700; color: var(--accent-gold);">💡 ${price} 🪙</div>
          <div style="font-size: 9.5px; color: var(--text-dim);">${card.date || ''}</div>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
}

// ==========================================================================
// 6. HISTORIQUE COMPLET (TABLE & RECHERCHE)
// ==========================================================================
function initTableControls() {
  const searchInput = document.getElementById('historySearchInput');
  const filterPills = document.querySelectorAll('.filter-pill');
  const prevBtn = document.getElementById('btnPrevPage');
  const nextBtn = document.getElementById('btnNextPage');

  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      state.tableSearchQuery = e.target.value.trim().toLowerCase();
      state.tableCurrentPage = 1;
      renderHistoryTable();
    });
  }

  filterPills.forEach(pill => {
    pill.addEventListener('click', () => {
      filterPills.forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      state.tableFilterRarity = pill.dataset.rarity;
      state.tableCurrentPage = 1;
      renderHistoryTable();
    });
  });

  if (prevBtn) {
    prevBtn.addEventListener('click', () => {
      if (state.tableCurrentPage > 1) {
        state.tableCurrentPage--;
        renderHistoryTable();
      }
    });
  }

  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      state.tableCurrentPage++;
      renderHistoryTable();
    });
  }
}

function renderHistoryTable() {
  const tbody = document.getElementById('historyTableBody');
  const badgeCount = document.getElementById('historyTotalCountBadge');
  const infoText = document.getElementById('paginationInfoText');
  const prevBtn = document.getElementById('btnPrevPage');
  const nextBtn = document.getElementById('btnNextPage');
  if (!tbody) return;

  const allCards = [...state.pulledCardsHistory].reverse();

  // 1. Filtrage
  const filtered = allCards.filter(c => {
    const matchRarity = (state.tableFilterRarity === 'ALL') || (c.rarity === state.tableFilterRarity);
    const matchSearch = (!state.tableSearchQuery) || (c.name && c.name.toLowerCase().includes(state.tableSearchQuery));
    return matchRarity && matchSearch;
  });

  if (badgeCount) {
    badgeCount.textContent = `${filtered.length} Carte${filtered.length > 1 ? 's' : ''}`;
  }

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align: center; color: var(--text-dim); padding: 30px;">
          Aucune carte ne correspond aux critères de recherche
        </td>
      </tr>
    `;
    if (infoText) infoText.textContent = 'Affichage de 0 sur 0 cartes';
    if (prevBtn) prevBtn.disabled = true;
    if (nextBtn) nextBtn.disabled = true;
    return;
  }

  // 2. Pagination
  const totalPages = Math.ceil(filtered.length / state.tablePageSize);
  state.tableCurrentPage = Math.min(state.tableCurrentPage, totalPages);
  const startIdx = (state.tableCurrentPage - 1) * state.tablePageSize;
  const endIdx = Math.min(startIdx + state.tablePageSize, filtered.length);
  const paginated = filtered.slice(startIdx, endIdx);

  if (infoText) {
    infoText.textContent = `Affichage de ${startIdx + 1} à ${endIdx} sur ${filtered.length} cartes`;
  }
  if (prevBtn) prevBtn.disabled = (state.tableCurrentPage <= 1);
  if (nextBtn) nextBtn.disabled = (state.tableCurrentPage >= totalPages);

  // 3. Rendu des lignes
  let rowsHtml = '';
  paginated.forEach(card => {
    const slug = RARITY_SLUGS[card.rarity] || 'commune';
    const suggested = card.suggestedPrice || card.minPrice || '-';
    const imgUrl = card.imageUrl || 'icon.jpg';

    rowsHtml += `
      <tr style="cursor: pointer;" onclick="openCardModalByName('${escapeHtml(card.name)}')">
        <td>
          <div class="card-cell-info">
            <img src="${imgUrl}" alt="${card.name}" class="card-cell-img" onerror="this.src='icon.jpg'">
            <span class="card-cell-title">${card.name}</span>
          </div>
        </td>
        <td>
          <span class="badge-rarity r-${slug}">${card.rarity}</span>
        </td>
        <td class="price-tag-gold">💡 ${suggested} 🪙</td>
        <td>${card.minPrice || '-'} 🪙</td>
        <td>${card.avgPrice || '-'} 🪙</td>
        <td>${card.maxPrice || '-'} 🪙</td>
        <td style="color: var(--text-muted); font-size: 11px;">${card.date || '-'}</td>
      </tr>
    `;
  });

  tbody.innerHTML = rowsHtml;
}

// ==========================================================================
// 7. IMPORT / EXPORT & OUTILS
// ==========================================================================
function initDataTools() {
  const dropZone = document.getElementById('dropZone');
  const fileInput = document.getElementById('fileInput');
  const rawJsonInput = document.getElementById('rawJsonInput');
  const btnApplyRawJson = document.getElementById('btnApplyRawJson');
  const btnGenerateDemoData = document.getElementById('btnGenerateDemoData');
  const btnQuickDemo = document.getElementById('btnQuickDemo');
  const btnExportJson = document.getElementById('btnExportJson');
  const btnExportCsv = document.getElementById('btnExportCsv');
  const btnClearAllData = document.getElementById('btnClearAllData');

  if (dropZone && fileInput) {
    dropZone.addEventListener('click', () => fileInput.click());
    dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropZone.classList.add('dragover');
    });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropZone.classList.remove('dragover');
      if (e.dataTransfer.files.length > 0) {
        handleFileImport(e.dataTransfer.files[0]);
      }
    });

    fileInput.addEventListener('change', (e) => {
      if (e.target.files.length > 0) {
        handleFileImport(e.target.files[0]);
      }
    });
  }

  if (btnApplyRawJson) {
    btnApplyRawJson.addEventListener('click', () => {
      const text = rawJsonInput.value.trim();
      if (!text) {
        alert('Veuillez coller un contenu JSON valide.');
        return;
      }
      try {
        const parsed = JSON.parse(text);
        importParsedData(parsed);
        rawJsonInput.value = '';
        alert('✅ Données importées avec succès !');
      } catch (err) {
        alert('❌ Erreur : Format JSON invalide.');
      }
    });
  }

  const triggerDemoGen = () => {
    generateDemoDataset();
    renderAll();
    alert('🎲 Données de démonstration réalistes générées avec succès !');
  };

  if (btnGenerateDemoData) btnGenerateDemoData.addEventListener('click', triggerDemoGen);
  if (btnQuickDemo) btnQuickDemo.addEventListener('click', triggerDemoGen);

  if (btnExportJson) {
    btnExportJson.addEventListener('click', () => {
      const exportData = {
        totalPacksCount: state.totalPacksCount,
        pulledCardsHistory: state.pulledCardsHistory,
        rarityCounts: state.rarityCounts,
        exportDate: new Date().toISOString()
      };
      downloadFile(JSON.stringify(exportData, null, 2), `wikimasters-stats-${Date.now()}.json`, 'application/json');
    });
  }

  if (btnExportCsv) {
    btnExportCsv.addEventListener('click', () => {
      let csv = "Nom;Rareté;Prix Conseillé;Prix Min;Prix Moyen;Prix Max;Date\n";
      state.pulledCardsHistory.forEach(c => {
        csv += `"${c.name}";"${c.rarity}";"${c.suggestedPrice || ''}";"${c.minPrice || ''}";"${c.avgPrice || ''}";"${c.maxPrice || ''}";"${c.date || ''}"\n`;
      });
      downloadFile(csv, `wikimasters-cartes-${Date.now()}.csv`, 'text/csv;charset=utf-8;');
    });
  }

  if (btnClearAllData) {
    btnClearAllData.addEventListener('click', () => {
      if (confirm('Voulez-vous vraiment effacer toutes les données locales du Dashboard ?')) {
        state.totalPacksCount = 0;
        state.pulledCardsHistory = [];
        state.rarityCounts = { 'Commune': 0, 'Peu commune': 0, 'Rare': 0, 'Super rare': 0, 'Ultra rare': 0, 'Légendaire': 0 };
        localStorage.removeItem('wm_dashboard_data');
        renderAll();
      }
    });
  }

  // Initialisation de la liaison directe extension Chrome
  initDirectExtensionBridge();
}

let autoSyncInterval = null;

function initDirectExtensionBridge() {
  const extensionIdInput = document.getElementById('extensionIdInput');
  const btnSaveExtensionId = document.getElementById('btnSaveExtensionId');
  const btnDirectSyncNow = document.getElementById('btnDirectSyncNow');
  const btnHeaderDirectSync = document.getElementById('btnHeaderDirectSync');
  const autoSyncCheckbox = document.getElementById('autoSyncCheckbox');

  const savedId = localStorage.getItem('wm_extension_id') || '';
  if (extensionIdInput) {
    extensionIdInput.value = savedId;
  }

  if (btnSaveExtensionId && extensionIdInput) {
    btnSaveExtensionId.addEventListener('click', () => {
      const val = extensionIdInput.value.trim();
      localStorage.setItem('wm_extension_id', val);
      alert('💾 ID de l\'extension enregistré avec succès !');
      triggerDirectExtensionSync(true);
    });
  }

  if (btnDirectSyncNow) {
    btnDirectSyncNow.addEventListener('click', () => {
      triggerDirectExtensionSync(true);
    });
  }

  if (btnHeaderDirectSync) {
    btnHeaderDirectSync.addEventListener('click', () => {
      triggerDirectExtensionSync(true);
    });
  }

  if (autoSyncCheckbox) {
    const savedAutoSync = localStorage.getItem('wm_auto_sync') === 'true';
    autoSyncCheckbox.checked = savedAutoSync;

    autoSyncCheckbox.addEventListener('change', (e) => {
      localStorage.setItem('wm_auto_sync', e.target.checked ? 'true' : 'false');
      setupAutoSyncInterval(e.target.checked);
    });

    if (savedAutoSync) {
      setupAutoSyncInterval(true);
    }
  }

  // Tentative automatique de connexion au chargement si un ID est configuré
  if (savedId) {
    setTimeout(() => triggerDirectExtensionSync(false), 500);
  }
}

function setupAutoSyncInterval(enabled) {
  if (autoSyncInterval) {
    clearInterval(autoSyncInterval);
    autoSyncInterval = null;
  }

  if (enabled) {
    autoSyncInterval = setInterval(() => {
      triggerDirectExtensionSync(false);
    }, 5000);
  }
}

function updateDirectSyncUI(isConnected, text) {
  const indicator = document.getElementById('directSyncStatusIndicator');
  const statusText = document.getElementById('directSyncStatusText');
  const sidebarSyncStatus = document.getElementById('sidebarSyncStatus');
  const headerBotStatus = document.getElementById('headerBotStatus');
  const botStatusText = document.getElementById('botStatusText');

  if (indicator && statusText) {
    if (isConnected) {
      indicator.className = 'status-pill';
      statusText.textContent = text || 'Connecté en Direct';
    } else {
      indicator.className = 'status-pill offline';
      statusText.textContent = text || 'Non Connecté';
    }
  }

  if (sidebarSyncStatus) {
    if (isConnected) {
      sidebarSyncStatus.innerHTML = '<span class="status-dot-pulse" style="color: var(--accent-emerald);"></span> En Direct';
    } else {
      sidebarSyncStatus.innerHTML = '<span class="status-dot-pulse" style="color: var(--text-dim);"></span> Déconnecté';
    }
  }

  if (headerBotStatus && botStatusText) {
    if (isConnected) {
      headerBotStatus.className = 'status-pill';
      botStatusText.textContent = 'Extension Connectée';
    }
  }
}

function triggerDirectExtensionSync(showNotification = false) {
  const extensionIdInput = document.getElementById('extensionIdInput');
  const extensionId = (extensionIdInput?.value || localStorage.getItem('wm_extension_id') || '').trim();

  if (!window.chrome || !chrome.runtime || !chrome.runtime.sendMessage) {
    updateDirectSyncUI(false, 'API Chrome Non Disponible');
    if (showNotification) {
      alert("⚠️ L'API Chrome externally_connectable n'est disponible que dans un navigateur basé sur Chromium (Google Chrome, Edge, Brave...).");
    }
    return;
  }

  if (!extensionId) {
    updateDirectSyncUI(false, 'ID Manquant');
    if (showNotification) {
      alert("⚠️ Veuillez renseigner l'ID de votre extension dans l'onglet 'Données & Sync' (visible sur chrome://extensions).");
    }
    return;
  }

  try {
    chrome.runtime.sendMessage(extensionId, { action: "getWikiMastersData" }, (response) => {
      if (chrome.runtime.lastError || !response || !response.success) {
        console.warn("Liaison extension directe non aboutie :", chrome.runtime.lastError);
        updateDirectSyncUI(false, 'Non Connecté');
        if (showNotification) {
          alert("❌ Impossible de joindre l'extension.\n\nVérifiez que :\n1. L'ID de l'extension est correct.\n2. L'extension est activée dans chrome://extensions.\n3. Vous avez rechargé l'extension.");
        }
        return;
      }

      // Succès : mise à jour des données en temps réel
      updateDirectSyncUI(true, 'Connecté en Direct');
      const data = response.data || {};
      
      if (data.pulledCardsHistory && Array.isArray(data.pulledCardsHistory)) {
        state.pulledCardsHistory = data.pulledCardsHistory;
      }
      if (typeof data.totalPacksCount === 'number') {
        state.totalPacksCount = data.totalPacksCount;
      } else {
        state.totalPacksCount = Math.ceil(state.pulledCardsHistory.length / 5);
      }
      if (data.rarityCounts) {
        state.rarityCounts = data.rarityCounts;
      } else {
        recalculateRaritiesFromHistory();
      }
      if (data.botLiveStatus && data.botLiveStatus.text) {
        state.botStatus = data.botLiveStatus.text;
      } else if (data.autoBoosterEnabled) {
        state.botStatus = data.isPausedForBreak ? 'En Pause' : 'En Action';
      }

      saveStateToLocalStorage();
      renderAll();

      if (showNotification) {
        alert(`✅ Synchronisation réussie ! (${state.pulledCardsHistory.length} cartes, ${state.totalPacksCount} boosters)`);
      }
    });
  } catch (err) {
    console.error("Erreur direct sync :", err);
    updateDirectSyncUI(false, 'Erreur de Connexion');
  }
}

function handleFileImport(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const parsed = JSON.parse(e.target.result);
      importParsedData(parsed);
      alert('✅ Fichier importé avec succès !');
    } catch (err) {
      alert('❌ Erreur lors de la lecture du fichier JSON.');
    }
  };
  reader.readAsText(file);
}

function importParsedData(data) {
  if (Array.isArray(data)) {
    // Si c'est un tableau brut de cartes (ex: pulledCardsHistory)
    state.pulledCardsHistory = data;
    state.totalPacksCount = Math.ceil(data.length / 5);
    recalculateRaritiesFromHistory();
  } else if (typeof data === 'object') {
    if (data.pulledCardsHistory && Array.isArray(data.pulledCardsHistory)) {
      state.pulledCardsHistory = data.pulledCardsHistory;
    }
    if (typeof data.totalPacksCount === 'number') {
      state.totalPacksCount = data.totalPacksCount;
    } else {
      state.totalPacksCount = Math.ceil(state.pulledCardsHistory.length / 5);
    }
    if (data.rarityCounts) {
      state.rarityCounts = data.rarityCounts;
    } else {
      recalculateRaritiesFromHistory();
    }
  }

  saveStateToLocalStorage();
  renderAll();
}

function recalculateRaritiesFromHistory() {
  const counts = { 'Commune': 0, 'Peu commune': 0, 'Rare': 0, 'Super rare': 0, 'Ultra rare': 0, 'Légendaire': 0 };
  state.pulledCardsHistory.forEach(c => {
    if (counts[c.rarity] !== undefined) counts[c.rarity]++;
    else counts['Commune']++;
  });
  state.rarityCounts = counts;
}

function downloadFile(content, fileName, contentType) {
  const a = document.createElement("a");
  const file = new Blob([content], { type: contentType });
  a.href = URL.createObjectURL(file);
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(a.href);
}

// ==========================================================================
// 8. MODALE DE DÉTAIL DE CARTE
// ==========================================================================
function initModal() {
  const modal = document.getElementById('cardDetailModal');
  const closeBtn = document.getElementById('modalCloseBtn');

  if (closeBtn && modal) {
    closeBtn.addEventListener('click', () => modal.classList.remove('open'));
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.classList.remove('open');
    });
  }
}

window.openCardModalByName = function(cardName) {
  const card = state.pulledCardsHistory.find(c => c.name === cardName);
  if (!card) return;

  const modal = document.getElementById('cardDetailModal');
  const imgEl = document.getElementById('modalCardImg');
  const nameEl = document.getElementById('modalCardName');
  const rarityEl = document.getElementById('modalCardRarityBadge');
  const priceSug = document.getElementById('modalPriceSuggested');
  const priceMin = document.getElementById('modalPriceMin');
  const priceAvg = document.getElementById('modalPriceAvg');
  const priceMax = document.getElementById('modalPriceMax');
  const dateEl = document.getElementById('modalCardDate');

  const slug = RARITY_SLUGS[card.rarity] || 'commune';

  imgEl.src = card.imageUrl || 'icon.jpg';
  nameEl.textContent = card.name;
  rarityEl.className = `badge-rarity r-${slug}`;
  rarityEl.textContent = card.rarity;

  priceSug.textContent = `${card.suggestedPrice || card.minPrice || '-'} 🪙`;
  priceMin.textContent = `${card.minPrice || '-'} 🪙`;
  priceAvg.textContent = `${card.avgPrice || '-'} 🪙`;
  priceMax.textContent = `${card.maxPrice || '-'} 🪙`;
  dateEl.textContent = card.date || '-';

  modal.classList.add('open');
};

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/'/g, "\\'").replace(/"/g, '&quot;');
}
