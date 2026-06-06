/* ═══════════════════════════════════════════════════════════
   SAIKHAMAKAWN CHURCH — ADMIN SCRIPT
   ═══════════════════════════════════════════════════════════ */

/* ─── STAT CARD EXTRA STYLES ──────────────────────────────── */
(function injectStyles() {
  const s = document.createElement('style');
  s.textContent = `
    .stat-card {
      background: var(--c-surface);
      border: 1px solid var(--c-border);
      border-radius: var(--radius-md);
      padding: 1.4rem 1.2rem;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 6px;
      text-align: center;
      transition: var(--transition);
    }
    .stat-card:hover { border-color:rgba(201,168,76,.25); background:var(--c-surface2); }
    .stat-card-icon { font-size: 1.8rem; }
    .stat-card-num  { font-family:'Cinzel',serif; font-size:2rem; font-weight:700; color:var(--c-gold); line-height:1; }
    .stat-card-label{ font-size:.78rem; color:var(--c-text-sub); letter-spacing:.06em; text-transform:uppercase; }
  `;
  document.head.appendChild(s);
})();

/* ─── CONSTANTS ──────────────────────────────────────────── */
const STORE_KEY  = 'skchurch_data';
const CONFIG_KEY = 'skchurch_firebase_url';
const DRIVE_KEY  = 'skchurch_drive_key';

/* ─── FIREBASE URL ───────────────────────────────────────── */
function getFirebaseUrl() {
  return (window.SK_CONFIG?.firebaseUrl) ||
         localStorage.getItem(CONFIG_KEY) ||
         '';
}

function setFirebaseUrl(url) {
  localStorage.setItem(CONFIG_KEY, url.trim());
  // Also patch in-memory config so current session uses it
  if (!window.SK_CONFIG) window.SK_CONFIG = {};
  window.SK_CONFIG.firebaseUrl = url.trim();
}

function getDriveKey() {
  return (window.SK_CONFIG?.googleDriveApiKey) ||
         localStorage.getItem(DRIVE_KEY) ||
         '';
}

function setDriveKey(key) {
  localStorage.setItem(DRIVE_KEY, key.trim());
  if (!window.SK_CONFIG) window.SK_CONFIG = {};
  window.SK_CONFIG.googleDriveApiKey = key.trim();
}

/* ─── DATA LAYER ─────────────────────────────────────────── */
function normalizeData(d) {
  return {
    photos: Array.isArray(d?.photos) ? d.photos : [],
    videos: Array.isArray(d?.videos) ? d.videos : [],
    docs:   Array.isArray(d?.docs)   ? d.docs   : []
  };
}

function localLoad() {
  try {
    return normalizeData(JSON.parse(localStorage.getItem(STORE_KEY)));
  } catch { return { photos: [], videos: [], docs: [] }; }
}

async function loadData() {
  const url = getFirebaseUrl().replace(/\/$/, '');
  if (url) {
    try {
      const res = await fetch(url + '/data.json');
      if (!res.ok) throw new Error('Fetch failed');
      const raw = await res.json();
      if (raw !== null && typeof raw === 'object') return normalizeData(raw);
    } catch {}
  }
  return localLoad();
}

async function saveData(data) {
  // Always save locally first — this never fails
  localStorage.setItem(STORE_KEY, JSON.stringify(data));

  const url = getFirebaseUrl().replace(/\/$/, '');
  if (!url) return true; // No Firebase configured, local save is fine

  try {
    const res = await fetch(url + '/data.json', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return res.ok;
  } catch {
    return false; // Firebase failed but local save already succeeded
  }
}

/* ─── UTILS ──────────────────────────────────────────────── */
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2); }

function ytId(url) {
  const m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([^\?&\s]+)/);
  return m ? m[1] : null;
}

function ytThumb(id) { return id ? `https://img.youtube.com/vi/${id}/mqdefault.jpg` : ''; }

function formatDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-US', { year:'numeric', month:'short', day:'numeric' });
}

function escHtml(str) {
  return String(str)
    .replace(/&/g,'&amp;').replace(/"/g,'&quot;')
    .replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

/* ─── TOAST ──────────────────────────────────────────────── */
function toast(msg, type = 'success') {
  const c = document.getElementById('toastContainer');
  if (!c) return;
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.innerHTML = `<span>${type === 'success' ? '✅' : '❌'}</span> ${msg}`;
  c.appendChild(t);
  setTimeout(() => t.remove(), 3500);
}

/* ─── SIDEBAR NAV ────────────────────────────────────────── */
function initSidebar() {
  const buttons = document.querySelectorAll('.sidebar-btn');
  const panels  = document.querySelectorAll('.admin-panel');
  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      buttons.forEach(b => b.classList.remove('active'));
      panels.forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      const panel = document.getElementById(`panel-${btn.dataset.panel}`);
      if (panel) panel.classList.add('active');
      if (btn.dataset.panel === 'settings') initSettingsPanel();
      updateDashboard();
    });
  });
}

/* ─── DASHBOARD ──────────────────────────────────────────── */
async function updateDashboard() {
  const d = await loadData();
  const dp = document.getElementById('d-photos');
  const dv = document.getElementById('d-videos');
  const dd = document.getElementById('d-docs');
  if (dp) dp.textContent = d.photos?.length || 0;
  if (dv) dv.textContent = d.videos?.length || 0;
  if (dd) dd.textContent = d.docs?.length   || 0;

  const dt = document.getElementById('d-traffic');
  if (dt) {
    const url = getFirebaseUrl().replace(/\/$/, '');
    if (url) {
      try {
        const res = await fetch(url + '/traffic.json');
        if (res.ok) {
          const traffic = await res.json();
          dt.textContent = traffic || 0;
        }
      } catch {}
    } else {
      dt.textContent = 0;
    }
  }
}

/* ═══════════════════════════════════════════════════════════
   EDIT MODAL
   ═══════════════════════════════════════════════════════════ */
let _editCtx = null;

function openEditModal(type, id, item) {
  _editCtx = { type, id };
  const overlay = document.getElementById('editModalOverlay');
  const title   = document.getElementById('editModalTitle');
  const body    = document.getElementById('editModalBody');

  if (type === 'photos') {
    title.innerHTML = '✏️ Edit Photo Album';
    body.innerHTML = `
      <div class="form-group">
        <label class="form-label">Album Title *</label>
        <input type="text" class="form-control" id="edit-title" value="${escHtml(item.title)}" />
      </div>
      <div class="form-group">
        <label class="form-label">Google Drive Folder URL *</label>
        <input type="url" class="form-control" id="edit-url" value="${escHtml(item.url)}" />
      </div>
      <div class="form-group">
        <label class="form-label">Date</label>
        <input type="date" class="form-control" id="edit-date" value="${item.date||''}" />
      </div>
      <div class="form-group">
        <label class="form-label">Short Description</label>
        <input type="text" class="form-control" id="edit-desc" value="${escHtml(item.description||'')}" />
      </div>`;
  } else if (type === 'videos') {
    title.innerHTML = '✏️ Edit Video';
    body.innerHTML = `
      <div class="form-group">
        <label class="form-label">Video Title *</label>
        <input type="text" class="form-control" id="edit-title" value="${escHtml(item.title)}" />
      </div>
      <div class="form-group">
        <label class="form-label">YouTube URL *</label>
        <input type="url" class="form-control" id="edit-url" value="${escHtml(item.url)}" />
      </div>
      <div class="form-group">
        <label class="form-label">Preacher / Speaker</label>
        <input type="text" class="form-control" id="edit-preacher" value="${escHtml(item.preacher||'')}" />
      </div>
      <div class="form-group">
        <label class="form-label">Date</label>
        <input type="date" class="form-control" id="edit-date" value="${item.date||''}" />
      </div>`;
  } else {
    const cats = ['Bulletin','Sermon Notes','Announcement','Report','Forms','Other'];
    const opts = cats.map(c =>
      `<option value="${c}" ${item.category===c?'selected':''}>${c==='Bulletin'?'Weekly Bulletin':c==='Report'?'Annual Report':c}</option>`
    ).join('');
    title.innerHTML = '✏️ Edit Document';
    body.innerHTML = `
      <div class="form-group">
        <label class="form-label">Document Title *</label>
        <input type="text" class="form-control" id="edit-title" value="${escHtml(item.title)}" />
      </div>
      <div class="form-group">
        <label class="form-label">Google Drive File URL *</label>
        <input type="url" class="form-control" id="edit-url" value="${escHtml(item.url)}" />
      </div>
      <div class="form-group">
        <label class="form-label">Category</label>
        <select class="form-control" id="edit-category">
          <option value="">Select…</option>${opts}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Date</label>
        <input type="date" class="form-control" id="edit-date" value="${item.date||''}" />
      </div>`;
  }

  overlay.classList.add('open');
  document.body.style.overflow = 'hidden';
  setTimeout(() => body.querySelector('input,select')?.focus(), 50);
}

function closeEditModal() {
  document.getElementById('editModalOverlay')?.classList.remove('open');
  document.body.style.overflow = '';
  _editCtx = null;
}

async function saveEdit() {
  if (!_editCtx) return;
  const { type, id } = _editCtx;
  const newTitle = document.getElementById('edit-title')?.value.trim();
  const newUrl   = document.getElementById('edit-url')?.value.trim();

  if (!newTitle) { toast('Title cannot be empty.', 'error'); return; }
  if (!newUrl)   { toast('URL cannot be empty.', 'error'); return; }
  if ((type==='photos'||type==='docs') && !newUrl.includes('drive.google.com')) {
    toast('URL must be a Google Drive link.', 'error'); return;
  }
  if (type==='videos' && !newUrl.includes('youtube') && !newUrl.includes('youtu.be')) {
    toast('URL must be a YouTube link.', 'error'); return;
  }

  const saveBtn = document.getElementById('editModalSave');
  if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Saving…'; }

  try {
    const data = await loadData();
    const idx  = data[type].findIndex(x => x.id === id);
    if (idx === -1) { toast('Item not found.', 'error'); return; }

    const updated = { ...data[type][idx], title: newTitle, url: newUrl,
      date: document.getElementById('edit-date')?.value || '' };
    if (type==='photos')  updated.description = document.getElementById('edit-desc')?.value.trim()||'';
    if (type==='videos')  updated.preacher    = document.getElementById('edit-preacher')?.value.trim()||'';
    if (type==='docs')    updated.category    = document.getElementById('edit-category')?.value||'';

    data[type][idx] = updated;
    await saveData(data);
    closeEditModal();
    if (type==='photos')  await renderPhotosList();
    if (type==='videos')  await renderVideosList();
    if (type==='docs')    await renderDocsList();
    updateDashboard();
    toast(`"${newTitle}" updated!`);
  } catch(e) {
    toast('Save failed: ' + e.message, 'error');
  } finally {
    if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = '💾 Save Changes'; }
  }
}

function initEditModal() {
  const overlay = document.getElementById('editModalOverlay');
  document.getElementById('editModalClose') ?.addEventListener('click', closeEditModal);
  document.getElementById('editModalCancel')?.addEventListener('click', closeEditModal);
  document.getElementById('editModalSave')  ?.addEventListener('click', saveEdit);
  overlay?.addEventListener('click', e => { if (e.target === overlay) closeEditModal(); });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && overlay?.classList.contains('open')) closeEditModal();
  });
}

/* ═══════════════════════════════════════════════════════════
   PHOTOS
   ═══════════════════════════════════════════════════════════ */
async function renderPhotosList() {
  const list = document.getElementById('photosList');
  const cnt  = document.getElementById('photo-count');
  if (!list) return;
  list.innerHTML = '<div class="admin-empty-list" style="opacity:.5">Loading…</div>';

  const { photos = [] } = await loadData();
  if (cnt) cnt.textContent = photos.length;

  if (photos.length === 0) {
    list.innerHTML = '<div class="admin-empty-list">No albums yet. Add your first album above.</div>';
    return;
  }
  list.innerHTML = photos.map(item => `
    <div class="admin-list-item">
      <div class="admin-list-icon">📁</div>
      <div class="admin-list-info">
        <div class="admin-list-name">${escHtml(item.title)}</div>
        <div class="admin-list-meta">${formatDate(item.date)||'No date'} ·
          <a href="${item.url}" target="_blank" style="color:var(--c-gold);opacity:.85">Open Drive ↗</a></div>
        ${item.description?`<div class="admin-list-meta" style="opacity:.65">${escHtml(item.description)}</div>`:''}
      </div>
      <div class="admin-list-actions">
        <button class="btn btn-edit btn-sm" onclick="editItem('photos','${item.id}')">✏️ Edit</button>
        <button class="btn btn-danger btn-sm" onclick="deleteItem('photos','${item.id}')">Delete</button>
      </div>
    </div>`).join('');
}

async function addPhoto() {
  const title = document.getElementById('photo-title').value.trim();
  const url   = document.getElementById('photo-url').value.trim();
  const date  = document.getElementById('photo-date').value;
  const desc  = document.getElementById('photo-desc').value.trim();

  if (!title) { toast('Please enter an album title.','error'); return; }
  if (!url)   { toast('Please enter a Google Drive folder URL.','error'); return; }
  if (!url.includes('drive.google.com')) { toast('URL must be a Google Drive link.','error'); return; }

  const btn = document.getElementById('addPhotoBtn');
  btn.disabled = true; btn.textContent = 'Adding…';
  try {
    const data = await loadData();
    data.photos.unshift({ id: uid(), title, url, date, description: desc });
    const synced = await saveData(data);
    ['photo-title','photo-url','photo-date','photo-desc'].forEach(id => document.getElementById(id).value='');
    await renderPhotosList();
    updateDashboard();
    toast(`Album "${title}" added!${!synced && getFirebaseUrl() ? ' (saved locally — Firebase sync pending)' : ''}`);
  } catch(e) { toast('Failed to save: ' + e.message, 'error'); }
  finally { btn.disabled = false; btn.textContent = 'Add Album'; }
}

/* ═══════════════════════════════════════════════════════════
   VIDEOS
   ═══════════════════════════════════════════════════════════ */
async function renderVideosList() {
  const list = document.getElementById('videosList');
  const cnt  = document.getElementById('video-count');
  if (!list) return;
  list.innerHTML = '<div class="admin-empty-list" style="opacity:.5">Loading…</div>';

  const { videos = [] } = await loadData();
  if (cnt) cnt.textContent = videos.length;

  if (videos.length === 0) {
    list.innerHTML = '<div class="admin-empty-list">No videos yet. Add your first video above.</div>';
    return;
  }
  list.innerHTML = videos.map(item => {
    const vid = ytId(item.url), thumb = ytThumb(vid);
    return `
    <div class="admin-list-item">
      ${thumb ? `<img class="admin-list-thumb" src="${thumb}" alt="${escHtml(item.title)}" onerror="this.style.display='none'">` : `<div class="admin-list-icon">🎬</div>`}
      <div class="admin-list-info">
        <div class="admin-list-name">${escHtml(item.title)}</div>
        <div class="admin-list-meta">${item.preacher?escHtml(item.preacher)+' · ':''}${formatDate(item.date)||'No date'}</div>
        <div class="admin-list-meta" style="margin-top:2px">
          <a href="${item.url}" target="_blank" style="color:var(--c-gold);opacity:.85">Open YouTube ↗</a></div>
      </div>
      <div class="admin-list-actions">
        <button class="btn btn-edit btn-sm" onclick="editItem('videos','${item.id}')">✏️ Edit</button>
        <button class="btn btn-danger btn-sm" onclick="deleteItem('videos','${item.id}')">Delete</button>
      </div>
    </div>`;
  }).join('');
}

async function addVideo() {
  const title    = document.getElementById('video-title').value.trim();
  const url      = document.getElementById('video-url').value.trim();
  const preacher = document.getElementById('video-preacher').value.trim();
  const date     = document.getElementById('video-date').value;

  if (!title) { toast('Please enter a video title.','error'); return; }
  if (!url)   { toast('Please enter a YouTube URL.','error'); return; }
  if (!url.includes('youtube') && !url.includes('youtu.be')) { toast('URL must be a YouTube link.','error'); return; }

  const btn = document.getElementById('addVideoBtn');
  btn.disabled = true; btn.textContent = 'Adding…';
  try {
    const data = await loadData();
    data.videos.unshift({ id: uid(), title, url, preacher, date });
    const synced = await saveData(data);
    ['video-title','video-url','video-preacher','video-date'].forEach(id => document.getElementById(id).value='');
    await renderVideosList();
    updateDashboard();
    toast(`Video "${title}" added!${!synced && getFirebaseUrl() ? ' (saved locally — Firebase sync pending)' : ''}`);
  } catch(e) { toast('Failed to save: ' + e.message, 'error'); }
  finally { btn.disabled = false; btn.textContent = 'Add Video'; }
}

/* ═══════════════════════════════════════════════════════════
   DOCUMENTS
   ═══════════════════════════════════════════════════════════ */
async function renderDocsList() {
  const list = document.getElementById('docsList');
  const cnt  = document.getElementById('doc-count');
  if (!list) return;
  list.innerHTML = '<div class="admin-empty-list" style="opacity:.5">Loading…</div>';

  const { docs = [] } = await loadData();
  if (cnt) cnt.textContent = docs.length;

  if (docs.length === 0) {
    list.innerHTML = '<div class="admin-empty-list">No documents yet. Add your first document above.</div>';
    return;
  }
  list.innerHTML = docs.map(item => `
    <div class="admin-list-item">
      <div class="admin-list-icon">📄</div>
      <div class="admin-list-info">
        <div class="admin-list-name">${escHtml(item.title)}</div>
        <div class="admin-list-meta">${escHtml(item.category||'Document')} · ${formatDate(item.date)||'No date'}</div>
        <div class="admin-list-meta" style="margin-top:2px">
          <a href="${item.url}" target="_blank" style="color:var(--c-gold);opacity:.85">Open Drive File ↗</a></div>
      </div>
      <div class="admin-list-actions">
        <button class="btn btn-edit btn-sm" onclick="editItem('docs','${item.id}')">✏️ Edit</button>
        <button class="btn btn-danger btn-sm" onclick="deleteItem('docs','${item.id}')">Delete</button>
      </div>
    </div>`).join('');
}

async function addDoc() {
  const title    = document.getElementById('doc-title').value.trim();
  const url      = document.getElementById('doc-url').value.trim();
  const category = document.getElementById('doc-category').value;
  const date     = document.getElementById('doc-date').value;

  if (!title) { toast('Please enter a document title.','error'); return; }
  if (!url)   { toast('Please enter a Google Drive file URL.','error'); return; }
  if (!url.includes('drive.google.com')) { toast('URL must be a Google Drive link.','error'); return; }

  const btn = document.getElementById('addDocBtn');
  btn.disabled = true; btn.textContent = 'Adding…';
  try {
    const data = await loadData();
    data.docs.unshift({ id: uid(), title, url, category, date });
    const synced = await saveData(data);
    ['doc-title','doc-url','doc-date'].forEach(id => document.getElementById(id).value='');
    document.getElementById('doc-category').value='';
    await renderDocsList();
    updateDashboard();
    toast(`Document "${title}" added!${!synced && getFirebaseUrl() ? ' (saved locally — Firebase sync pending)' : ''}`);
  } catch(e) { toast('Failed to save: ' + e.message, 'error'); }
  finally { btn.disabled = false; btn.textContent = 'Add Document'; }
}

/* ─── GLOBAL EDIT / DELETE ───────────────────────────────── */
window.editItem = async function(type, id) {
  const data = await loadData();
  const item = data[type]?.find(x => x.id === id);
  if (item) openEditModal(type, id, item);
};

window.deleteItem = async function(type, id) {
  if (!confirm('Are you sure you want to delete this item?')) return;
  try {
    const data = await loadData();
    data[type] = data[type].filter(x => x.id !== id);
    await saveData(data);
    if (type==='photos') await renderPhotosList();
    if (type==='videos') await renderVideosList();
    if (type==='docs')   await renderDocsList();
    updateDashboard();
    toast('Item deleted.');
  } catch(e) { toast('Delete failed: ' + e.message, 'error'); }
};

/* ═══════════════════════════════════════════════════════════
   SETTINGS PANEL
   ═══════════════════════════════════════════════════════════ */
async function initSettingsPanel() {
  const input  = document.getElementById('fbUrl');
  const driveInput = document.getElementById('driveKey');
  const dot    = document.getElementById('statusDot');
  const text   = document.getElementById('statusText');
  if (!input) return;

  // Pre-fill current URL & Key
  const current = getFirebaseUrl();
  input.value = current;
  if (driveInput) driveInput.value = getDriveKey();

  // Check connection status
  async function checkStatus(url) {
    dot.className = 'settings-status-dot checking';
    text.textContent = 'Checking connection…';
    if (!url) {
      dot.className = 'settings-status-dot disconnected';
      text.textContent = 'Not connected — content only visible on this device.';
      return false;
    }
    try {
      const res = await fetch(url.replace(/\/$/, '') + '/data.json');
      if (!res.ok) throw new Error();
      dot.className = 'settings-status-dot connected';
      text.textContent = 'Connected to Firebase — content visible on all devices ✓';
      return true;
    } catch {
      dot.className = 'settings-status-dot disconnected';
      text.textContent = 'Cannot reach Firebase. Check the URL and try again.';
      return false;
    }
  }

  await checkStatus(current);

  // Save & Test
  document.getElementById('saveConfigBtn').onclick = async () => {
    const url = input.value.trim();
    if (!url) { toast('Please enter a Firebase URL.', 'error'); return; }
    if (!url.startsWith('https://') || (!url.includes('firebaseio.com') && !url.includes('firebasedatabase.app'))) {
      toast('URL should look like: https://your-project-rtdb.firebasedatabase.app', 'error'); return;
    }
    setFirebaseUrl(url);
    if (driveInput) setDriveKey(driveInput.value.trim());
    
    const ok = await checkStatus(url);
    if (ok) toast('Configuration saved and Firebase connected! ✓');
    else toast('Configuration saved, but could not connect to Firebase.', 'error');
  };

  // Download config.js
  document.getElementById('downloadConfigBtn').onclick = () => {
    const url = input.value.trim() || getFirebaseUrl();
    const dKey = driveInput ? driveInput.value.trim() : getDriveKey();
    const content = `/**\n * SAIKHAMAKAWN CHURCH — CONFIG\n * Auto-generated — upload this file to Netlify to sync across all devices.\n */\nwindow.SK_CONFIG = {\n  firebaseUrl: '${url}',\n  googleDriveApiKey: '${dKey}'\n};\n`;
    const blob = new Blob([content], { type: 'text/javascript' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'config.js';
    a.click();
    toast('config.js downloaded! Upload it to Netlify.');
  };

  // Migrate local data to Firebase
  document.getElementById('migrateBtn').onclick = async () => {
    const url = getFirebaseUrl().replace(/\/$/, '');
    if (!url) { toast('Set up Firebase first.', 'error'); return; }
    const local = localLoad();
    if (!local.photos.length && !local.videos.length && !local.docs.length) {
      toast('No local data found to migrate.', 'error'); return;
    }
    try {
      const res = await fetch(url + '/data.json', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(local)
      });
      if (!res.ok) throw new Error('Upload failed');
      toast(`Migrated ${local.photos.length} albums, ${local.videos.length} videos, ${local.docs.length} docs to Firebase! ✓`);
    } catch(e) {
      toast('Migration failed: ' + e.message, 'error');
    }
  };
}

/* ─── CLEAR ALL ──────────────────────────────────────────── */
function initClearAll() {
  document.getElementById('clearAllBtn')?.addEventListener('click', async () => {
    if (!confirm('⚠️ This will permanently delete ALL content. Continue?')) return;
    try {
      await saveData({ photos: [], videos: [], docs: [] });
      await renderPhotosList();
      await renderVideosList();
      await renderDocsList();
      updateDashboard();
      toast('All data cleared.');
    } catch(e) { toast('Clear failed: ' + e.message, 'error'); }
  });
}

/* ─── INIT ───────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', async () => {
  initSidebar();
  initEditModal();
  initClearAll();
  await updateDashboard();
  await renderPhotosList();
  await renderVideosList();
  await renderDocsList();

  document.getElementById('addPhotoBtn')?.addEventListener('click', addPhoto);
  document.getElementById('addVideoBtn')?.addEventListener('click', addVideo);
  document.getElementById('addDocBtn')  ?.addEventListener('click', addDoc);

  document.addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    if (document.getElementById('editModalOverlay')?.classList.contains('open')) return;
    const active = document.querySelector('.admin-panel.active');
    if (!active) return;
    if (active.id === 'panel-photos')    addPhoto();
    if (active.id === 'panel-videos')    addVideo();
    if (active.id === 'panel-documents') addDoc();
  });
});
