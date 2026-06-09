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

function getDriveFileId(url) {
  const m1 = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (m1) return m1[1];
  const m2 = url.match(/id=([a-zA-Z0-9_-]+)/);
  return m2 ? m2[1] : null;
}

function openDocumentPreview(e, url, title = 'document.pdf') {
  e.preventDefault();
  const fileId = getDriveFileId(url);
  if (fileId) {
    const safeName = title.replace(/'/g, "\\'").replace(/"/g, '&quot;');
    const previewUrl = `https://drive.google.com/file/d/${fileId}/preview`;
    openLightbox(`
      <button onclick="downloadDrivePhoto('${fileId}', '${safeName}')" class="lightbox-download" title="Download Document">
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
      </button>
      <iframe src="${previewUrl}" class="doc-preview" allow="autoplay"></iframe>
    `);
  } else {
    window.open(url, '_blank');
  }
}

async function fetchDriveImages(folderId) {
  const apiKey = getDriveKey();
  if (!apiKey) return [];
  try {
    let allFiles = [];
    let pageToken = '';
    do {
      const tokenParam = pageToken ? `&pageToken=${pageToken}` : '';
      const url = `https://www.googleapis.com/drive/v3/files?q='${folderId}'+in+parents+and+(mimeType+contains+'image/'+or+mimeType+contains+'video/')&key=${apiKey}&fields=nextPageToken,files(id,name,mimeType,thumbnailLink,webContentLink)&pageSize=1000${tokenParam}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error('API fetch failed');
      const data = await res.json();
      allFiles = allFiles.concat(data.files || []);
      pageToken = data.nextPageToken || '';
    } while (pageToken);
    return allFiles;
  } catch(e) {
    console.warn('Drive API failed:', e.message);
    return [];
  }
}

function formatDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function sortByDateDesc(arr) {
  return arr.sort((a, b) => {
    if (!a.date) return 1;
    if (!b.date) return -1;
    return new Date(b.date) - new Date(a.date);
  });
}

/* ─── YOUTUBE OPEN ───────────────────────────────────────── */
function openYouTube(url) {
  window.open(url, '_blank');
}

/* ─── DRIVE DOWNLOAD ─────────────────────────────────────── */
async function downloadDrivePhoto(fileId, fileName) {
  const apiKey = getDriveKey();
  try {
    const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&key=${apiKey}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('Download failed');
    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = fileName || 'photo.jpg';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(blobUrl);
  } catch(e) {
    console.warn('Blob download failed, falling back to Drive link:', e.message);
    const a = document.createElement('a');
    a.href = `https://drive.google.com/uc?export=download&id=${fileId}`;
    a.target = '_blank';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }
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
  animateCount('statLyrics', data.lyrics?.length || 0);
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

/* ─── TRAFFIC ────────────────────────────────────────────── */
async function trackTraffic() {
  const url = getFirebaseUrl().replace(/\/$/, '');
  if (!url) return;
  
  try {
    const res = await fetch(url + '/traffic.json');
    let currentTraffic = 0;
    if (res.ok) {
      const data = await res.json();
      if (data) currentTraffic = parseInt(data, 10);
    }
    
    // Only increment once per browser session
    if (!sessionStorage.getItem('sk_tracked')) {
      sessionStorage.setItem('sk_tracked', '1');
      currentTraffic += 1;
      
      await fetch(url + '/traffic.json', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(currentTraffic)
      });
    }

    animateCount('statTraffic', currentTraffic);
  } catch (e) {
    console.warn('Traffic tracking failed:', e.message);
  }
}


/* ─── RENDER PHOTOS ──────────────────────────────────────── */
async function renderPhotos(data) {
  const grid  = document.getElementById('photosGrid');
  const empty = document.getElementById('photosEmpty');
  if (!grid) return;

  const photos = sortByDateDesc([...(data.photos || [])]);
  grid.innerHTML = '';

  if (photos.length === 0) {
    if (empty) empty.style.display = '';
    return;
  }
  if (empty) empty.style.display = 'none';

  // Build all album shells first, then load photos in parallel
  const loadTasks = [];

  for (const item of photos) {
    const albumContainer = document.createElement('div');
    albumContainer.className = 'album-container collapsed';
    
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
    
    const albumFooter = document.createElement('div');
    albumFooter.className = 'album-footer';
    albumFooter.innerHTML = `<button class="btn btn-outline btn-sm album-collapse-btn">▲ Collapse Album</button>`;
    albumFooter.querySelector('.album-collapse-btn').addEventListener('click', () => {
      albumContainer.classList.add('collapsed');
      header.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    albumContainer.appendChild(albumFooter);
    
    grid.appendChild(albumContainer);

    const folderId = getFolderId(item.url);
    if (folderId && getDriveKey()) {
      photoGrid.innerHTML = '<div class="album-loading">Loading photos...</div>';
      
      // Queue the fetch — don't await yet
      loadTasks.push(
        fetchDriveImages(folderId).then(files => {
          photoGrid.innerHTML = '';
          
          if (files.length > 0) {
            const BATCH = 20;
            let shown = 0;

            function renderBatch() {
              const batch = files.slice(shown, shown + BATCH);
              batch.forEach(f => {
                const thumb  = `https://drive.google.com/thumbnail?id=${f.id}&sz=w200`;
                const imgUrl = `https://drive.google.com/thumbnail?id=${f.id}&sz=w2000`;
                
                const photoCard = document.createElement('div');
                photoCard.className = 'album-photo-card';
                photoCard.innerHTML = `<img src="${thumb}" alt="${f.name}" loading="lazy">`;
                
                photoCard.addEventListener('click', () => {
                  const safeName = f.name.replace(/'/g, "\\'").replace(/"/g, '&quot;');
                  openLightbox(`
                    <button class="lightbox-download" onclick="downloadDrivePhoto('${f.id}', '${safeName}')"
                      title="Download Original">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                    </button>
                    <img src="${imgUrl}" alt="${safeName}" class="lightbox-img">
                  `);
                });
                
                photoGrid.appendChild(photoCard);
              });
              shown += batch.length;

              if (shown >= files.length) {
                showMoreBtn.style.display = 'none';
              } else {
                showMoreBtn.textContent = `Show More Photos (${files.length - shown} remaining)`;
                showMoreBtn.style.display = '';
              }
            }

            const showMoreBtn = document.createElement('button');
            showMoreBtn.className = 'btn btn-outline album-show-more';
            showMoreBtn.addEventListener('click', renderBatch);
            albumFooter.insertBefore(showMoreBtn, albumFooter.firstChild);

            renderBatch();
          } else {
            photoGrid.innerHTML = `<div class="album-empty">No images found, or folder is private.</div>`;
          }
        })
      );
    } else {
      photoGrid.innerHTML = `<div class="album-empty">API Key not set or invalid folder URL. <a href="${item.url}" target="_blank">View on Drive</a></div>`;
    }
  }

  // Wait for all albums to finish loading in parallel
  await Promise.all(loadTasks);
}

/* ─── RENDER VIDEOS ──────────────────────────────────────── */
function renderVideos(data) {
  const grid  = document.getElementById('videosGrid');
  const empty = document.getElementById('videosEmpty');
  if (!grid) return;

  const videos = sortByDateDesc([...(data.videos || [])]);
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

  const docs = sortByDateDesc([...(data.docs || [])]);
  [...grid.querySelectorAll('.doc-card')].forEach(el => el.remove());

  if (docs.length === 0) {
    if (empty) empty.style.display = '';
    return;
  }
  if (empty) empty.style.display = 'none';

  const now = new Date();

  docs.forEach(item => {
    const isLocked = item.releaseDate && new Date(item.releaseDate) > now;
    const canView = window.currentUserSubscriptionStatus === 'active';
    
    const card = document.createElement('a');
    card.className = 'doc-card';
    
    if (isLocked && !canView) {
      // Locked State
      card.href = 'javascript:void(0)';
      card.onclick = (e) => {
        e.preventDefault();
        if (!window.currentUserUid) {
          alert('Please login with Google first to subscribe for early access!');
          return;
        }
        
        const overlay = document.getElementById('paymentModalOverlay');
        if (overlay) {
          overlay.classList.add('open');
          document.body.style.overflow = 'hidden';
        } else {
          alert('Please login and subscribe to access this document early.');
        }
      };
      
      card.innerHTML = `
        <div class="doc-icon" style="font-size: 1.5rem;">🔒</div>
        <div class="doc-info">
          <div class="doc-title">${item.title}</div>
          <div class="doc-meta" style="color:var(--c-gold)">Early Access for Subscribers · Free on ${formatDate(item.releaseDate)}</div>
        </div>
      `;
    } else {
      // Unlocked or Subscribed
      card.href = item.url;
      card.onclick = (e) => openDocumentPreview(e, item.url, item.title + '.pdf');
      card.target = '_blank';
      card.rel = 'noopener noreferrer';
      
      let earlyAccessTag = '';
      if (isLocked && canView) {
        earlyAccessTag = ` · <span style="color:var(--c-gold)">🔒 Subscriber Early Access</span>`;
      }
      
      card.innerHTML = `
        <div class="doc-icon">📄</div>
        <div class="doc-info">
          <div class="doc-title">${item.title}</div>
          <div class="doc-meta">${item.category || 'Document'} · ${formatDate(item.date) || ''}${earlyAccessTag}</div>
        </div>
      `;
    }
    grid.appendChild(card);
  });
}

/* ─── RENDER LYRICS ──────────────────────────────────────── */
function renderLyrics(data) {
  const grid  = document.getElementById('lyricsGrid');
  const empty = document.getElementById('lyricsEmpty');
  if (!grid) return;

  const lyrics = sortByDateDesc([...(data.lyrics || [])]);
  [...grid.querySelectorAll('.doc-card')].forEach(el => el.remove());

  if (lyrics.length === 0) {
    if (empty) empty.style.display = '';
    return;
  }
  if (empty) empty.style.display = 'none';

  lyrics.forEach(item => {
    const card = document.createElement('a');
    card.className = 'doc-card';
    card.href = item.url;
    card.onclick = (e) => openDocumentPreview(e, item.url, item.title + '.pdf');
    card.target = '_blank';
    card.rel = 'noopener noreferrer';
    card.innerHTML = `
      <div class="doc-icon">🎵</div>
      <div class="doc-info">
        <div class="doc-title">${item.title}</div>
        <div class="doc-meta">${formatDate(item.date) || ''}</div>
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

  const links = document.querySelectorAll('.nav-link');
  const currentPath = window.location.pathname.split('/').pop() || 'index.html';

  links.forEach(l => {
    l.classList.remove('active');
    const href = l.getAttribute('href');
    if (href === currentPath || (currentPath === '' && href === 'index.html')) {
      l.classList.add('active');
    }
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

/* ─── SCROLL ANIMATIONS ──────────────────────────────────── */
function initScrollAnimations() {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1, rootMargin: '0px 0px -30px 0px' });

  const targets = document.querySelectorAll('.section-header, .stat-item, .album-container, .video-card, .doc-card, .empty-state, .hero-content > *');
  
  targets.forEach(el => {
    el.classList.add('fade-in-up');
    observer.observe(el);
  });
}

/* ─── LOGIN ──────────────────────────────────────────────── */
function initLogin() {
  const loginBtn = document.getElementById('googleLoginBtn');
  if (!loginBtn) return;

  // Initialize Firebase Auth using the existing config data
  const firebaseConfig = window.SK_CONFIG?.firebaseConfig || {
    apiKey: window.SK_CONFIG?.googleDriveApiKey || '', // Fallback
    authDomain: "skkktp.firebaseapp.com",
    databaseURL: getFirebaseUrl(),
    projectId: "skkktp"
  };

  if (typeof firebase !== 'undefined' && !firebase.apps.length) {
    try {
      firebase.initializeApp(firebaseConfig);
    } catch(e) {
      console.warn("Firebase Init Error:", e);
    }
  }

  window.currentUserSubscriptionStatus = null;

  async function updateButtonState(user) {
    const benefitsText = document.getElementById('subscribeBenefits');
    
    if (!user) {
      loginBtn.innerHTML = `
        <svg width="20" height="20" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
        </svg>
        Login/Signup with Google
      `;
      loginBtn.className = 'btn btn-google';
      if (benefitsText) benefitsText.style.display = 'none';
      return;
    }

    loginBtn.innerHTML = 'Loading status...';
    loginBtn.className = 'btn btn-outline';
    
    const dbUrl = getFirebaseUrl().replace(/\/$/, '');
    if (!dbUrl) return;

    try {
      const res = await fetch(`${dbUrl}/subscribers/${user.uid}.json`);
      const subData = await res.json();
      
      if (!subData) {
        window.currentUserSubscriptionStatus = 'not_subscribed';
        loginBtn.innerHTML = `Click to Subscribe`;
        loginBtn.className = 'btn btn-subscribe';
        if (benefitsText) benefitsText.style.display = 'block';
      } else {
        let isExpired = false;
        if (subData.paymentStatus === 'active' && subData.approvedAt) {
          const expiresAt = new Date(subData.approvedAt);
          expiresAt.setMonth(expiresAt.getMonth() + (subData.durationMonths || 1));
          if (new Date() > expiresAt) isExpired = true;
        }

        if (isExpired) {
          window.currentUserSubscriptionStatus = 'expired';
          loginBtn.innerHTML = `Subscription Expired - Click to Renew`;
          loginBtn.className = 'btn btn-subscribe';
          if (benefitsText) benefitsText.style.display = 'block';
        } else {
          window.currentUserSubscriptionStatus = subData.paymentStatus;
          if (subData.paymentStatus === 'pending_verification') {
            loginBtn.innerHTML = `Pending Subscription`;
            loginBtn.className = 'btn btn-pending';
            if (benefitsText) benefitsText.style.display = 'none';
          } else if (subData.paymentStatus === 'active') {
            loginBtn.innerHTML = `Thank you for subscribing!`;
            loginBtn.className = 'btn btn-active';
            if (benefitsText) benefitsText.style.display = 'none';
          } else if (subData.paymentStatus === 'denied') {
            loginBtn.innerHTML = `Incorrect payment, re-enter correct Transaction ID`;
            loginBtn.className = 'btn btn-denied';
            if (benefitsText) benefitsText.style.display = 'none';
          }
        }
      }
    } catch(e) {
      window.currentUserSubscriptionStatus = 'error';
      loginBtn.innerHTML = `Click to Subscribe`;
      loginBtn.className = 'btn btn-subscribe';
    }
  }

  // Re-render documents if data is available, to update locks based on auth state
  if (window._lastLoadedData) {
    renderDocs(window._lastLoadedData);
  }
}

  // Listen for auth state changes to persist login automatically
  if (typeof firebase !== 'undefined') {
    firebase.auth().onAuthStateChanged((user) => {
      updateButtonState(user);
    });
  }

  // Payment Modal Logic
  const paymentModalOverlay = document.getElementById('paymentModalOverlay');
  const paymentClose = document.getElementById('paymentClose');
  const paymentForm = document.getElementById('paymentForm');
  const paySubmitBtn = document.getElementById('paySubmitBtn');

  function closePaymentModal() {
    if (paymentModalOverlay) {
      paymentModalOverlay.classList.remove('open');
      document.body.style.overflow = '';
      if (paymentForm) paymentForm.reset();
    }
  }

  if (paymentClose) {
    paymentClose.addEventListener('click', closePaymentModal);
  }

  if (paymentModalOverlay) {
    paymentModalOverlay.addEventListener('click', (e) => {
      if (e.target === paymentModalOverlay) closePaymentModal();
    });
  }

  loginBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    if (typeof firebase === 'undefined') {
      alert("Firebase SDK is not loaded.");
      return;
    }

    try {
      const user = firebase.auth().currentUser;
      if (user) {
        if (window.currentUserSubscriptionStatus === 'pending_verification' || window.currentUserSubscriptionStatus === 'active') {
          return; // Button disabled in these states
        }
        // Handle Subscribe Action -> Open Payment Modal First
        if (paymentModalOverlay) {
          paymentModalOverlay.classList.add('open');
          document.body.style.overflow = 'hidden';
        }
      } else {
        const provider = new firebase.auth.GoogleAuthProvider();
        await firebase.auth().signInWithPopup(provider);
      }
    } catch (error) {
      console.error('Authentication Error:', error);
      alert('Authentication failed: ' + error.message + '\nMake sure Google Sign-in is enabled in your Firebase console.');
    }
  });

  // Handle Dynamic Pricing with Buttons
  const durationButtons = document.querySelectorAll('.btn-duration');
  const dynamicAmountText = document.getElementById('dynamicAmountText');
  const btnAmountText = document.getElementById('btnAmountText');
  const upiQrCode = document.getElementById('upiQrCode');
  const upiDeepLink = document.getElementById('upiDeepLink');
  let selectedMonths = 1;

  function updateDynamicPaymentInfo() {
    if (!upiQrCode || !upiDeepLink) return;
    const totalFee = selectedMonths * 20;

    // Update Text Elements
    if (dynamicAmountText) dynamicAmountText.textContent = `₹${totalFee}`;
    if (btnAmountText) btnAmountText.textContent = `₹${totalFee}`;

    // Update Links
    const upiId = "tluangakhawlhring17@oksbi";
    const upiUri = `upi://pay?pa=${upiId}&pn=SKK%20KTP&cu=INR&am=${totalFee}`;
    upiDeepLink.href = upiUri;
    upiQrCode.src = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(upiUri)}`;
  }

  // Initialize payment links and listen for button clicks
  if (durationButtons.length > 0) {
    updateDynamicPaymentInfo();
    durationButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        // Remove active class from all
        durationButtons.forEach(b => b.classList.remove('active'));
        // Add active class to clicked
        btn.classList.add('active');
        // Update state
        selectedMonths = parseInt(btn.getAttribute('data-months'), 10) || 1;
        updateDynamicPaymentInfo();
      });
    });
  }

  if (paymentForm) {
    paymentForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const user = firebase.auth().currentUser;
      if (!user) return;

      const dbUrl = getFirebaseUrl().replace(/\/$/, '');
      if (!dbUrl) {
        alert("Database URL is not configured.");
        return;
      }

      // Process UPI Verification
      const transactionIdInput = document.getElementById('transactionId');
      const transactionId = transactionIdInput ? transactionIdInput.value.trim() : 'N/A';

      if (transactionId.length !== 12) {
        alert("Please enter a valid 12-digit UTR number.");
        return;
      }

      const months = selectedMonths;
      const totalPaid = months * 20;

      paySubmitBtn.disabled = true;
      paySubmitBtn.innerHTML = 'Verifying...';

      try {
        const subscriberData = {
          uid: user.uid,
          email: user.email,
          name: user.displayName,
          subscribedAt: new Date().toISOString(),
          paymentStatus: 'pending_verification',
          transactionId: transactionId,
          durationMonths: months,
          totalPaid: totalPaid
        };

        await fetch(`${dbUrl}/subscribers/${user.uid}.json`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(subscriberData)
        });

        alert(`Subscription recorded! Thanks for paying ₹${totalPaid}, ${user.displayName || 'friend'}. We will verify your UTR (${transactionId}) shortly.`);
        
        // Refresh the button on the UI instantly
        await updateButtonState(user);
        
        closePaymentModal();
      } catch (err) {
        console.error("Database Error:", err);
        alert("We had trouble saving your subscription. Please contact support.");
      } finally {
        paySubmitBtn.disabled = false;
        paySubmitBtn.innerHTML = 'Confirm Payment';
      }
    });
  }
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
    initLogin();

    // Back to top
    const backBtn = document.getElementById('backToTop');
    if (backBtn) backBtn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));

    // Load data (Firebase or local)
    const data = await fetchData();
    window._lastLoadedData = data;
    trackTraffic();

    renderPhotos(data);
    renderVideos(data);
    renderDocs(data);
    renderLyrics(data);
    updateStats(data);
    
    initScrollAnimations();
  } catch(e) {
    console.error('Site init error:', e);
  } finally {
    // Always hide the loader — site must always become visible
    hideLoader();
  }
});
