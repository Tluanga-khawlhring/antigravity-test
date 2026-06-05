/* ═══════════════════════════════════════════════════════════
   SAIKHAMAKAWN CHURCH — MAIN SITE JS
   ═══════════════════════════════════════════════════════════ */

const STORE_KEY  = 'skchurch_data';
const CONFIG_KEY = 'skchurch_firebase_url';
const DRIVE_KEY  = 'skchurch_drive_key';

/* ─── DATA LAYER ─────────────────────────────────────────── */
function getFirebaseUrl() {
  // Priority: config.js file → localStorage override
  return (window.SK_CONFIG?.firebaseUrl) ||
         localStorage.getItem(CONFIG_KEY) ||
         '';
}

function getDriveKey() {
  return (window.SK_CONFIG?.googleDriveApiKey) ||
         localStorage.getItem(DRIVE_KEY) ||
         '';
}

function localLoad() {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY)) || { photos: [], videos: [], docs: [] };
  } catch { return { photos: [], videos: [], docs: [] }; }
}

async function fetchData() {
  const url = getFirebaseUrl().replace(/\/$/, '');
  if (url) {
    try {
      // 5-second timeout — never block the site from loading
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(url + '/data.json', { signal: controller.signal });
      clearTimeout(timer);
      if (!res.ok) throw new Error('Firebase fetch failed');
      const data = await res.json();
      if (data && typeof data === 'object') return data;
    } catch (e) {
      console.warn('Firebase unavailable, using local data.', e.message);
    }
  }
  return localLoad();
}

/* ─── UTILITIES ──────────────────────────────────────────── */
function ytId(url) {
  const m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([^\?&\s]+)/);
  return m ? m[1] : null;
}

function ytThumb(id) {
  return `https://img.youtube.com/vi/${id}/hqdefault.jpg`;
}

function driveThumbnail(url) {
  const m = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (m) return `https://drive.google.com/thumbnail?id=${m[1]}&sz=w400`;
  return null;
}

function getFolderId(url) {
  const m = url.match(/folders\/([a-zA-Z0-9_-]+)/);
  if (m) return m[1];
  const m2 = url.match(/id=([a-zA-Z0-9_-]+)/);
  return m2 ? m2[1] : null;
}

async function fetchDriveImages(folderId) {
  const apiKey = getDriveKey();
  if (!apiKey) return [];
  try {
    const url = `https://www.googleapis.com/drive/v3/files?q='${folderId}'+in+parents+and+mimeType+contains+'image/'&key=${apiKey}&fields=files(id,name,thumbnailLink,webContentLink)&pageSize=100`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('API fetch failed');
    const data = await res.json();
    return data.files || [];
  } catch(e) {
    console.warn('Drive API failed:', e.message);
    return [];
  }
}

function formatDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

/* ─── YOUTUBE OPEN ───────────────────────────────────────── */
function openYouTube(url) {
  window.open(url, '_blank');
}

/* ─── LOADER ─────────────────────────────────────────────── */
function hideLoader() {
  const el = document.getElementById('siteLoader');
  if (!el) return;
  el.style.opacity = '0';
  setTimeout(() => el.remove(), 500);
}

function openLightbox(html) {
  const lb   = document.getElementById('lightbox');
  const body = document.getElementById('lightboxBody');
  if (!lb || !body) return;
  body.innerHTML = html;
  lb.classList.add('open');
  document.body.style.overflow = 'hidden';
}

/* ─── STATS ──────────────────────────────────────────────── */
function updateStats(data) {
  animateCount('statPhotos', data.photos?.length || 0);
  animateCount('statVideos', data.videos?.length || 0);
  animateCount('statDocs',   data.docs?.length   || 0);
}

function animateCount(id, target) {
  const el = document.getElementById(id);
  if (!el) return;
  let current = 0;
  const step = Math.max(1, Math.floor(target / 20));
  const interval = setInterval(() => {
    current = Math.min(current + step, target);
    el.textContent = current;
    if (current >= target) clearInterval(interval);
  }, 40);
}

/* ─── RENDER PHOTOS ──────────────────────────────────────── */
async function renderPhotos(data) {
  const grid  = document.getElementById('photosGrid');
  const empty = document.getElementById('photosEmpty');
  if (!grid) return;

  const photos = data.photos || [];
  grid.innerHTML = '';

  if (photos.length === 0) {
    if (empty) empty.style.display = '';
    return;
  }
  if (empty) empty.style.display = 'none';

  for (const item of photos) {
    const albumContainer = document.createElement('div');
    albumContainer.className = 'album-container';
    
    const header = document.createElement('div');
    header.className = 'album-header';
    header.innerHTML = `
      <div class="album-header-content">
        <h3 class="album-title">
          <span class="album-toggle-icon">▼</span> ${item.title}
        </h3>
        <div class="album-meta">
          ${formatDate(item.date) ? `<span>📅 ${formatDate(item.date)}</span>` : ''}
          ${item.description ? `<span>· ${item.description}</span>` : ''}
        </div>
      </div>
      <a href="${item.url}" target="_blank" class="btn btn-outline btn-sm album-drive-btn" onclick="event.stopPropagation()">Open in Drive ↗</a>
    `;
    
    header.addEventListener('click', () => {
      albumContainer.classList.toggle('collapsed');
    });
    
    albumContainer.appendChild(header);

    const photoGrid = document.createElement('div');
    photoGrid.className = 'album-photo-grid';
    albumContainer.appendChild(photoGrid);
    
    grid.appendChild(albumContainer);

    const folderId = getFolderId(item.url);
    if (folderId && getDriveKey()) {
      // Show loading indicator
      photoGrid.innerHTML = '<div class="album-loading">Loading photos...</div>';
      
      const files = await fetchDriveImages(folderId);
      photoGrid.innerHTML = '';
      
      if (files.length > 0) {
        files.forEach(f => {
          const thumb = f.thumbnailLink ? f.thumbnailLink.replace('=s220', '=w400') : '';
          const imgUrl = f.thumbnailLink ? f.thumbnailLink.replace('=s220', '=s2000') : f.webContentLink;
          
          const photoCard = document.createElement('div');
          photoCard.className = 'album-photo-card';
          photoCard.innerHTML = `<img src="${thumb}" alt="${f.name}" loading="lazy">`;
          
          photoCard.addEventListener('click', () => {
            openLightbox(`<img src="${imgUrl}" alt="${f.name}" class="lightbox-img">`);
          });
          
          photoGrid.appendChild(photoCard);
        });
      } else {
        photoGrid.innerHTML = `<div class="album-empty">No images found, or folder is private.</div>`;
      }
    } else {
      photoGrid.innerHTML = `<div class="album-empty">API Key not set or invalid folder URL. <a href="${item.url}" target="_blank">View on Drive</a></div>`;
    }
  }
}

/* ─── RENDER VIDEOS ──────────────────────────────────────── */
function renderVideos(data) {
  const grid  = document.getElementById('videosGrid');
  const empty = document.getElementById('videosEmpty');
  if (!grid) return;

  const videos = data.videos || [];
  [...grid.querySelectorAll('.video-card')].forEach(el => el.remove());

  if (videos.length === 0) {
    if (empty) empty.style.display = '';
    return;
  }
  if (empty) empty.style.display = 'none';

  videos.forEach(item => {
    const id    = ytId(item.url);
    const thumb = id ? ytThumb(id) : '';

    const card = document.createElement('a');
    card.className = 'video-card';
    card.href   = item.url;
    card.target = '_blank';
    card.rel    = 'noopener noreferrer';
    card.innerHTML = `
      <div class="video-thumb-wrap">
        ${thumb
          ? `<img src="${thumb}" alt="${item.title}" loading="lazy">`
          : '<div style="width:100%;height:100%;background:var(--c-surface2);display:flex;align-items:center;justify-content:center;font-size:2rem">🎬</div>'}
        <div class="video-play-btn"></div>
      </div>
      <div class="video-card-body">
        <div class="video-card-title">${item.title}</div>
        <div class="video-card-meta">
          <span>🎬 YouTube</span>
          ${item.preacher ? `<span>· ${item.preacher}</span>` : ''}
          ${formatDate(item.date) ? `<span>· ${formatDate(item.date)}</span>` : ''}
        </div>
      </div>
    `;
    grid.appendChild(card);
  });
}

/* ─── RENDER DOCS ────────────────────────────────────────── */
function renderDocs(data) {
  const grid  = document.getElementById('docsGrid');
  const empty = document.getElementById('docsEmpty');
  if (!grid) return;

  const docs = data.docs || [];
  [...grid.querySelectorAll('.doc-card')].forEach(el => el.remove());

  if (docs.length === 0) {
    if (empty) empty.style.display = '';
    return;
  }
  if (empty) empty.style.display = 'none';

  docs.forEach(item => {
    const card = document.createElement('div');
    card.className = 'doc-card';
    card.innerHTML = `
      <div class="doc-icon">📄</div>
      <div class="doc-info">
        <div class="doc-title">${item.title}</div>
        <div class="doc-meta">${item.category || 'Document'} · ${formatDate(item.date) || ''}</div>
      </div>
      <div class="doc-actions">
        <a href="${item.url}" target="_blank" class="btn btn-sm btn-outline">Open</a>
      </div>
    `;
    grid.appendChild(card);
  });
}

/* ─── NAVBAR ─────────────────────────────────────────────── */
function initNavbar() {
  const navbar    = document.getElementById('navbar');
  const hamburger = document.getElementById('hamburger');
  const navLinks  = document.getElementById('navLinks');

  if (!navbar) return;

  window.addEventListener('scroll', () => {
    navbar.classList.toggle('scrolled', window.scrollY > 40);
  });

  if (hamburger && navLinks) {
    hamburger.addEventListener('click', () => navLinks.classList.toggle('open'));
    navLinks.addEventListener('click', () => navLinks.classList.remove('open'));
  }

  const sections = ['home','photos','videos','documents'];
  const links    = document.querySelectorAll('.nav-link');

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        links.forEach(l => l.classList.remove('active'));
        const match = document.querySelector(`.nav-link[data-section="${entry.target.id}"]`);
        if (match) match.classList.add('active');
      }
    });
  }, { rootMargin: '-40% 0px -40% 0px' });

  sections.forEach(id => {
    const el = document.getElementById(id);
    if (el) observer.observe(el);
  });
}

/* ─── PARTICLES ──────────────────────────────────────────── */
function initParticles() {
  const container = document.getElementById('particles');
  if (!container) return;
  const COUNT = 22;
  for (let i = 0; i < COUNT; i++) {
    const p = document.createElement('div');
    const size  = Math.random() * 3 + 1;
    const x     = Math.random() * 100;
    const y     = Math.random() * 100;
    const delay = Math.random() * 8;
    const dur   = 8 + Math.random() * 10;
    const op    = 0.1 + Math.random() * 0.3;
    const dx    = (Math.random() * 40 - 20).toFixed(1);
    const dy    = (Math.random() * 60 - 30).toFixed(1);
    const kfName = `pf${i}`;

    p.style.cssText = `
      position:absolute;width:${size}px;height:${size}px;border-radius:50%;
      background:rgba(201,168,76,${op});left:${x}%;top:${y}%;
      animation:${kfName} ${dur}s ${delay}s ease-in-out infinite alternate;
      pointer-events:none;
    `;
    container.appendChild(p);

    const style = document.createElement('style');
    style.textContent = `@keyframes ${kfName}{from{transform:translate(0,0);opacity:.1}to{transform:translate(${dx}px,${dy}px);opacity:.4}}`;
    document.head.appendChild(style);
  }
}

/* ─── LIGHTBOX ───────────────────────────────────────────── */
function closeLightbox() {
  const lb   = document.getElementById('lightbox');
  const body = document.getElementById('lightboxBody');
  if (!lb) return;
  lb.classList.remove('open');
  if (body) body.innerHTML = '';
  document.body.style.overflow = '';
}

/* ─── INIT ───────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', async () => {
  try {
    // Footer year
    const yr = document.getElementById('footerYear');
    if (yr) yr.textContent = new Date().getFullYear();

    // Lightbox
    const lbClose = document.getElementById('lightboxClose');
    const lb      = document.getElementById('lightbox');
    if (lbClose) lbClose.addEventListener('click', closeLightbox);
    if (lb)      lb.addEventListener('click', e => { if (e.target === lb) closeLightbox(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeLightbox(); });

    initNavbar();
    initParticles();

    // Back to top
    const backBtn = document.getElementById('backToTop');
    if (backBtn) backBtn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));

    // Load data (Firebase or local)
    const data = await fetchData();

    renderPhotos(data);
    renderVideos(data);
    renderDocs(data);
    updateStats(data);
  } catch(e) {
    console.error('Site init error:', e);
  } finally {
    // Always hide the loader — site must always become visible
    hideLoader();
  }
});
