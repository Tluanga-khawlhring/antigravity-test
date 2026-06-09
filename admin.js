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
    docs:   Array.isArray(d?.docs)   ? d.docs   : [],
    lyrics: Array.isArray(d?.lyrics) ? d.lyrics : []
  };
}

function localLoad() {
  try {
    return normalizeData(JSON.parse(localStorage.getItem(STORE_KEY)));
  } catch { return { photos: [], videos: [], docs: [], lyrics: [] }; }
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

async function fetchDriveFolderFiles(folderUrl) {
  const apiKey = getDriveKey();
  if (!apiKey) {
    throw new Error('Google Drive API Key is missing. Please set it in Settings.');
  }

  let folderId = null;
  const match = folderUrl.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (match) folderId = match[1];
  else {
    try {
      const params = new URLSearchParams(folderUrl.split('?')[1]);
      folderId = params.get('id');
    } catch (e) {}
  }

  if (!folderId) {
    throw new Error('Could not extract Folder ID from the URL.');
  }

  const query = encodeURIComponent(`'${folderId}' in parents and trashed = false`);
  let allFiles = [];
  let pageToken = '';

  do {
    const tokenParam = pageToken ? `&pageToken=${pageToken}` : '';
    const url = `https://www.googleapis.com/drive/v3/files?q=${query}&key=${apiKey}&fields=nextPageToken,files(id,name,mimeType)&pageSize=1000${tokenParam}`;
    
    const res = await fetch(url);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || 'Failed to fetch from Google Drive');
    }
    
    const data = await res.json();
    if (data.files) {
      allFiles = allFiles.concat(data.files);
    }
    pageToken = data.nextPageToken;
  } while (pageToken);

  return allFiles;
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
  const dl = document.getElementById('d-lyrics');
  if (dp) dp.textContent = d.photos?.length || 0;
  if (dv) dv.textContent = d.videos?.length || 0;
  if (dd) dd.textContent = d.docs?.length   || 0;
  if (dl) dl.textContent = d.lyrics?.length || 0;

  const dt = document.getElementById('d-traffic');
  const ds = document.getElementById('d-subscribers');
  if (dt || ds) {
    const url = getFirebaseUrl().replace(/\/$/, '');
    if (url) {
      try {
        if (dt) {
          const res = await fetch(url + '/traffic.json');
          if (res.ok) dt.textContent = await res.json() || 0;
        }
        if (ds) {
          const res = await fetch(url + '/subscribers.json');
          if (res.ok) {
            const subs = await res.json();
            ds.textContent = subs ? Object.keys(subs).length : 0;
          }
        }
      } catch {}
    } else {
      if (dt) dt.textContent = 0;
      if (ds) ds.textContent = 0;
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
  } else if (type === 'docs') {
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
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Category</label>
          <select class="form-control" id="edit-category">
            <option value="">Select…</option>${opts}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Upload Date</label>
          <input type="date" class="form-control" id="edit-date" value="${item.date||''}" />
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Public Release Date (Subscribers get instant access)</label>
        <input type="date" class="form-control" id="edit-release-date" value="${item.releaseDate||''}" />
      </div>`;
  } else if (type === 'lyrics') {
    title.innerHTML = '✏️ Edit Lyrics';
    body.innerHTML = `
      <div class="form-group">
        <label class="form-label">Song Title *</label>
        <input type="text" class="form-control" id="edit-title" value="${escHtml(item.title)}" />
      </div>
      <div class="form-group">
        <label class="form-label">Google Drive File URL *</label>
        <input type="url" class="form-control" id="edit-url" value="${escHtml(item.url)}" />
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
  if ((type==='photos'||type==='docs'||type==='lyrics') && !newUrl.includes('drive.google.com')) {
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
    if (type==='docs') {
      updated.category = document.getElementById('edit-category')?.value||'';
      updated.releaseDate = document.getElementById('edit-release-date')?.value||'';
    }

    data[type][idx] = updated;
    await saveData(data);
    closeEditModal();
    if (type==='photos')  await renderPhotosList();
    if (type==='videos')  await renderVideosList();
    if (type==='docs')    await renderDocsList();
    if (type==='lyrics')  await renderLyricsList();
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
  
  const now = new Date();
  
  list.innerHTML = docs.map(item => {
    let earlyAccessTag = '';
    if (item.releaseDate && new Date(item.releaseDate) > now) {
      earlyAccessTag = ` · <span style="color:var(--c-gold)">🔒 Early Access until ${formatDate(item.releaseDate)}</span>`;
    }
    
    return `
    <div class="admin-list-item">
      <div class="admin-list-icon">📄</div>
      <div class="admin-list-info">
        <div class="admin-list-name">${escHtml(item.title)}</div>
        <div class="admin-list-meta">${escHtml(item.category||'Document')} · ${formatDate(item.date)||'No upload date'}${earlyAccessTag}</div>
        <div class="admin-list-meta" style="margin-top:2px">
          <a href="${item.url}" target="_blank" style="color:var(--c-gold);opacity:.85">Open Drive File ↗</a></div>
      </div>
      <div class="admin-list-actions">
        <button class="btn btn-edit btn-sm" onclick="editItem('docs','${item.id}')">✏️ Edit</button>
        <button class="btn btn-danger btn-sm" onclick="deleteItem('docs','${item.id}')">Delete</button>
      </div>
    </div>`;
  }).join('');
}

async function addDoc() {
  const title       = document.getElementById('doc-title').value.trim();
  const url         = document.getElementById('doc-url').value.trim();
  const category    = document.getElementById('doc-category').value;
  const date        = document.getElementById('doc-date').value;
  const releaseDate = document.getElementById('doc-release-date').value;

  if (!title) { toast('Please enter a document title.','error'); return; }
  if (!url)   { toast('Please enter a Google Drive file URL.','error'); return; }
  if (!url.includes('drive.google.com')) { toast('URL must be a Google Drive link.','error'); return; }

  const btn = document.getElementById('addDocBtn');
  btn.disabled = true; btn.textContent = 'Adding…';
  try {
    const data = await loadData();
    data.docs.unshift({ id: uid(), title, url, category, date, releaseDate });
    const synced = await saveData(data);
    ['doc-title','doc-url','doc-date','doc-release-date'].forEach(id => document.getElementById(id).value='');
    document.getElementById('doc-category').value='';
    await renderDocsList();
    updateDashboard();
    toast(`Document "${title}" added!${!synced && getFirebaseUrl() ? ' (saved locally — Firebase sync pending)' : ''}`);
  } catch(e) { toast('Failed to save: ' + e.message, 'error'); }
  finally { btn.disabled = false; btn.textContent = 'Add Document'; }
}

async function addDocBulk() {
  const url = document.getElementById('doc-bulk-url').value.trim();
  const category = document.getElementById('doc-bulk-category').value;
  const date = document.getElementById('doc-bulk-date').value;

  if (!url) { toast('Please enter a Google Drive folder URL.','error'); return; }

  const btn = document.getElementById('addDocBulkBtn');
  btn.disabled = true; btn.textContent = 'Fetching…';

  try {
    const files = await fetchDriveFolderFiles(url);
    if (files.length === 0) {
      toast('No files found in this folder.', 'error');
      return;
    }

    const data = await loadData();
    let addedCount = 0;

    files.forEach(f => {
      const fileUrl = `https://drive.google.com/file/d/${f.id}/view`;
      const title = f.name.replace(/\.[^/.]+$/, "");
      data.docs.unshift({ id: uid(), title, url: fileUrl, category, date });
      addedCount++;
    });

    const synced = await saveData(data);
    
    ['doc-bulk-url','doc-bulk-date'].forEach(id => document.getElementById(id).value='');
    document.getElementById('doc-bulk-category').value='';
    await renderDocsList();
    updateDashboard();
    toast(`${addedCount} documents added!${!synced && getFirebaseUrl() ? ' (saved locally — Firebase sync pending)' : ''}`);
  } catch (e) {
    toast(e.message, 'error');
  } finally {
    btn.disabled = false; btn.textContent = 'Bulk Add Documents';
  }
}

/* ═══════════════════════════════════════════════════════════
   LYRICS
   ═══════════════════════════════════════════════════════════ */
async function renderLyricsList() {
  const list = document.getElementById('lyricsList');
  const cnt  = document.getElementById('lyric-count');
  if (!list) return;
  list.innerHTML = '<div class="admin-empty-list" style="opacity:.5">Loading…</div>';

  const { lyrics = [] } = await loadData();
  if (cnt) cnt.textContent = lyrics.length;

  if (lyrics.length === 0) {
    list.innerHTML = '<div class="admin-empty-list">No lyrics yet. Add your first lyric above.</div>';
    return;
  }
  list.innerHTML = lyrics.map(item => `
    <div class="admin-list-item">
      <div class="admin-list-icon">🎵</div>
      <div class="admin-list-info">
        <div class="admin-list-name">${escHtml(item.title)}</div>
        <div class="admin-list-meta">${formatDate(item.date)||'No date'}</div>
        <div class="admin-list-meta" style="margin-top:2px">
          <a href="${item.url}" target="_blank" style="color:var(--c-gold);opacity:.85">Open Drive File ↗</a></div>
      </div>
      <div class="admin-list-actions">
        <button class="btn btn-edit btn-sm" onclick="editItem('lyrics','${item.id}')">✏️ Edit</button>
        <button class="btn btn-danger btn-sm" onclick="deleteItem('lyrics','${item.id}')">Delete</button>
      </div>
    </div>`).join('');
}

async function addLyric() {
  const title    = document.getElementById('lyric-title').value.trim();
  const url      = document.getElementById('lyric-url').value.trim();
  const date     = document.getElementById('lyric-date').value;

  if (!title) { toast('Please enter a song title.','error'); return; }
  if (!url)   { toast('Please enter a Google Drive file URL.','error'); return; }
  if (!url.includes('drive.google.com')) { toast('URL must be a Google Drive link.','error'); return; }

  const btn = document.getElementById('addLyricBtn');
  btn.disabled = true; btn.textContent = 'Adding…';
  try {
    const data = await loadData();
    data.lyrics.unshift({ id: uid(), title, url, date });
    const synced = await saveData(data);
    ['lyric-title','lyric-url','lyric-date'].forEach(id => document.getElementById(id).value='');
    await renderLyricsList();
    updateDashboard();
    toast(`Lyric "${title}" added!${!synced && getFirebaseUrl() ? ' (saved locally — Firebase sync pending)' : ''}`);
  } catch(e) { toast('Failed to save: ' + e.message, 'error'); }
  finally { btn.disabled = false; btn.textContent = 'Add Lyrics'; }
}

async function addLyricBulk() {
  const url = document.getElementById('lyric-bulk-url').value.trim();
  const date = document.getElementById('lyric-bulk-date').value;

  if (!url) { toast('Please enter a Google Drive folder URL.','error'); return; }

  const btn = document.getElementById('addLyricBulkBtn');
  btn.disabled = true; btn.textContent = 'Fetching…';

  try {
    const files = await fetchDriveFolderFiles(url);
    if (files.length === 0) {
      toast('No files found in this folder.', 'error');
      return;
    }

    const data = await loadData();
    let addedCount = 0;

    files.forEach(f => {
      const fileUrl = `https://drive.google.com/file/d/${f.id}/view`;
      const title = f.name.replace(/\.[^/.]+$/, "");
      data.lyrics.unshift({ id: uid(), title, url: fileUrl, date });
      addedCount++;
    });

    const synced = await saveData(data);
    
    ['lyric-bulk-url','lyric-bulk-date'].forEach(id => document.getElementById(id).value='');
    await renderLyricsList();
    updateDashboard();
    toast(`${addedCount} lyrics added!${!synced && getFirebaseUrl() ? ' (saved locally — Firebase sync pending)' : ''}`);
  } catch (e) {
    toast(e.message, 'error');
  } finally {
    btn.disabled = false; btn.textContent = 'Bulk Add Lyrics';
  }
}

/* ═══════════════════════════════════════════════════════════
   SUBSCRIBERS
   ═══════════════════════════════════════════════════════════ */
async function renderSubscribersList() {
  const listPending = document.getElementById('subscribersPendingList');
  const listActive = document.getElementById('subscribersActiveList');
  const listExpired = document.getElementById('subscribersExpiredList');
  
  const cntPending = document.getElementById('subscriber-pending-count');
  const cntActive = document.getElementById('subscriber-active-count');
  const cntExpired = document.getElementById('subscriber-expired-count');
  
  if (!listPending || !listActive || !listExpired) return;

  const url = getFirebaseUrl().replace(/\/$/, '');
  if (!url) {
    listPending.innerHTML = '<div class="admin-empty-list">Please connect Firebase in Settings first.</div>';
    listActive.innerHTML = ''; listExpired.innerHTML = '';
    return;
  }

  try {
    const res = await fetch(url + '/subscribers.json');
    const data = await res.json();
    
    if (!data) {
      if (cntPending) cntPending.textContent = '0';
      if (cntActive) cntActive.textContent = '0';
      if (cntExpired) cntExpired.textContent = '0';
      listPending.innerHTML = '<div class="admin-empty-list">No pending subscribers.</div>';
      listActive.innerHTML = '<div class="admin-empty-list">No active subscribers.</div>';
      listExpired.innerHTML = '<div class="admin-empty-list">No expired subscribers.</div>';
      return;
    }

    const subsArray = Object.keys(data).map(key => ({
      uid: key,
      ...data[key]
    })).sort((a, b) => new Date(b.subscribedAt) - new Date(a.subscribedAt));

    const pending = [];
    const active = [];
    const expired = [];
    const now = new Date();

    subsArray.forEach(sub => {
      let isExpired = false;
      if (sub.paymentStatus === 'active' && sub.approvedAt) {
        const expiresAt = new Date(sub.approvedAt);
        expiresAt.setMonth(expiresAt.getMonth() + (sub.durationMonths || 1));
        sub.expiresAt = expiresAt;
        if (now > expiresAt) isExpired = true;
      }

      if (isExpired) {
        expired.push(sub);
      } else if (sub.paymentStatus === 'active') {
        active.push(sub);
      } else {
        // pending_verification or denied
        pending.push(sub);
      }
    });

    if (cntPending) cntPending.textContent = pending.length;
    if (cntActive) cntActive.textContent = active.length;
    if (cntExpired) cntExpired.textContent = expired.length;

    function renderItem(sub) {
      const isPending = sub.paymentStatus === 'pending_verification';
      const isDenied = sub.paymentStatus === 'denied';
      let isExpired = false;
      
      let statusColor = '#2ecc71';
      let statusText = 'Verified & Active';
      let expiryText = '';

      if (sub.expiresAt) {
        if (now > sub.expiresAt) {
          isExpired = true;
          statusColor = '#e74c3c';
          statusText = 'Expired';
        }
        expiryText = `<strong>Expires:</strong> ${formatDate(sub.expiresAt.toISOString())}`;
      }

      if (isPending) { statusColor = 'var(--c-gold)'; statusText = 'Pending Verification'; }
      else if (isDenied) { statusColor = '#e74c3c'; statusText = 'Denied'; }

      return `
      <div class="admin-list-item" style="align-items: center;">
        <div class="admin-list-icon">👥</div>
        <div class="admin-list-info" style="flex: 1;">
          <div class="admin-list-name" style="font-size: 1.05rem;">${escHtml(sub.name || 'Unknown')}</div>
          <div class="admin-list-meta" style="color: var(--c-text);">${escHtml(sub.email || 'No email')}</div>
          <div class="admin-list-meta" style="margin-top:4px;">
            <strong>Duration:</strong> ${sub.durationMonths || 1} Month(s) · 
            <strong>Total Paid:</strong> ₹${sub.totalPaid || 20}
          </div>
          <div class="admin-list-meta">
            <strong>UTR:</strong> <span style="font-family: monospace; letter-spacing: 1px;">${escHtml(sub.transactionId || 'N/A')}</span>
          </div>
          <div class="admin-list-meta">
            <strong>Status:</strong> <span style="color: ${statusColor}; font-weight: bold;">${statusText}</span>
            ${expiryText ? `<br/>${expiryText}` : ''}
          </div>
        </div>
        <div class="admin-list-actions" style="display: flex; flex-direction: column; gap: 0.5rem; justify-content: center;">
          ${isPending ? `
            <button class="btn btn-primary btn-sm" onclick="approveSubscriber('${sub.uid}')">Verify</button>
            <button class="btn btn-outline btn-sm" onclick="denySubscriber('${sub.uid}')" style="border-color:#e74c3c; color:#e74c3c">Deny</button>
          ` : ''}
          <button class="btn btn-danger btn-sm" onclick="deleteSubscriber('${sub.uid}')">Delete</button>
        </div>
      </div>`;
    }

    listPending.innerHTML = pending.length ? pending.map(renderItem).join('') : '<div class="admin-empty-list">No pending subscribers.</div>';
    listActive.innerHTML = active.length ? active.map(renderItem).join('') : '<div class="admin-empty-list">No active subscribers.</div>';
    listExpired.innerHTML = expired.length ? expired.map(renderItem).join('') : '<div class="admin-empty-list">No expired subscribers.</div>';

  } catch (e) {
    if (listPending) listPending.innerHTML = `<div class="admin-empty-list" style="color:var(--c-gold)">Error loading subscribers: ${e.message}</div>`;
  }
}

window.switchSubTab = function(tabName) {
  const tabs = ['active', 'pending', 'expired'];
  tabs.forEach(t => {
    const btn = document.getElementById(`tab-${t}`);
    const list = document.getElementById(`subscribers${t.charAt(0).toUpperCase() + t.slice(1)}List`);
    if (btn && list) {
      if (t === tabName) {
        btn.classList.add('active');
        list.style.display = 'block';
      } else {
        btn.classList.remove('active');
        list.style.display = 'none';
      }
    }
  });
};

window.approveSubscriber = async function(uid) {
  if (!confirm('Are you sure you want to verify this payment and activate the subscription?')) return;
  const url = getFirebaseUrl().replace(/\/$/, '');
  try {
    const res = await fetch(`${url}/subscribers/${uid}.json`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        paymentStatus: 'active',
        approvedAt: new Date().toISOString()
      })
    });
    if (!res.ok) throw new Error('Update failed');
    toast('Subscription verified successfully!');
    await renderSubscribersList();
  } catch(e) { toast('Verification failed: ' + e.message, 'error'); }
};

window.denySubscriber = async function(uid) {
  if (!confirm('Are you sure you want to DENY this payment? The user will be asked to re-enter a valid UTR.')) return;
  const url = getFirebaseUrl().replace(/\/$/, '');
  try {
    const res = await fetch(`${url}/subscribers/${uid}.json`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paymentStatus: 'denied' })
    });
    if (!res.ok) throw new Error('Update failed');
    toast('Subscription denied.');
    await renderSubscribersList();
  } catch(e) { toast('Deny failed: ' + e.message, 'error'); }
};

window.deleteSubscriber = async function(uid) {
  if (!confirm('Are you sure you want to completely delete this subscriber?')) return;
  const url = getFirebaseUrl().replace(/\/$/, '');
  try {
    const res = await fetch(`${url}/subscribers/${uid}.json`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Delete failed');
    toast('Subscriber deleted.');
    await renderSubscribersList();
    updateDashboard();
  } catch(e) { toast('Delete failed: ' + e.message, 'error'); }
};

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
    if (type==='lyrics') await renderLyricsList();
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

/* ─── CLEAR SECTIONS ─────────────────────────────────────── */
function initClearSections() {
  const types = [
    { btn: 'clearPhotosBtn', type: 'photos', name: 'Albums', render: renderPhotosList },
    { btn: 'clearVideosBtn', type: 'videos', name: 'Videos', render: renderVideosList },
    { btn: 'clearDocsBtn', type: 'docs', name: 'Documents', render: renderDocsList },
    { btn: 'clearLyricsBtn', type: 'lyrics', name: 'Lyrics', render: renderLyricsList }
  ];

  types.forEach(({ btn, type, name, render }) => {
    document.getElementById(btn)?.addEventListener('click', async () => {
      if (!confirm(`⚠️ This will permanently delete ALL ${name}. Continue?`)) return;
      try {
        const data = await loadData();
        data[type] = [];
        await saveData(data);
        await render();
        updateDashboard();
        toast(`All ${name} cleared.`);
      } catch(e) { toast(`Clear failed: ` + e.message, 'error'); }
    });
  });
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

  const targets = document.querySelectorAll('.admin-panel-title, .admin-panel-sub, .stat-card, .admin-form, .admin-list-item');
  
  targets.forEach(el => {
    if (!el.classList.contains('fade-in-up')) {
      el.classList.add('fade-in-up');
    }
    observer.observe(el);
  });
}

/* ─── INIT ───────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', async () => {
  initSidebar();
  initEditModal();
  initClearSections();
  await updateDashboard();
  await renderPhotosList();
  await renderVideosList();
  await renderDocsList();
  await renderLyricsList();
  await renderSubscribersList();
  
  initScrollAnimations();

  document.getElementById('addPhotoBtn')?.addEventListener('click', addPhoto);
  document.getElementById('addVideoBtn')?.addEventListener('click', addVideo);
  document.getElementById('addDocBtn')  ?.addEventListener('click', addDoc);
  document.getElementById('addDocBulkBtn')?.addEventListener('click', addDocBulk);
  document.getElementById('addLyricBtn')?.addEventListener('click', addLyric);
  document.getElementById('addLyricBulkBtn')?.addEventListener('click', addLyricBulk);

  document.addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    if (document.getElementById('editModalOverlay')?.classList.contains('open')) return;
    const active = document.querySelector('.admin-panel.active');
    if (!active) return;
    if (active.id === 'panel-photos')    addPhoto();
    if (active.id === 'panel-videos')    addVideo();
    if (active.id === 'panel-documents') addDoc();
    if (active.id === 'panel-lyrics')    addLyric();
  });
});
