// ============================================
//   CloudVault — script.js (Supabase Edition)
// ============================================

// --- 1. Supabase Setup ---
const SUPABASE_URL = 'https://ekanctblvrpajgmxuzao.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVrYW5jdGJsdnJwYWpnbXh1emFvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgxNDQyMDYsImV4cCI6MjA5MzcyMDIwNn0.5pNiykooO_5iyHpLRCHoBEKTkUlJRs1JCAYCdFy07Kw';
const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// --- 2. DOM Elements ---
const authWrapper       = document.getElementById('auth-wrapper');
const mainApp           = document.getElementById('main-app');
const authForm          = document.getElementById('auth-form');
const authTitle         = document.getElementById('auth-title');
const authSubtitle      = document.getElementById('auth-subtitle');
const authBtn           = document.getElementById('auth-btn');
const toggleLink        = document.getElementById('toggle-link');
const authToggleText    = document.getElementById('auth-toggle-text');
const nameGroup         = document.getElementById('name-group');
const authError         = document.getElementById('auth-error');
const emailInput        = document.getElementById('email');
const passwordInput     = document.getElementById('password');
const nameInput         = document.getElementById('fullname');
const logoutBtn         = document.getElementById('logout-btn');
const displayUserName   = document.getElementById('display-user-name');

const views = {
  dashboard: document.getElementById('dashboard-view'),
  myfiles:   document.getElementById('myfiles-view'),
  upload:    document.getElementById('upload-view')
};

const navLinks          = document.querySelectorAll('aside a[data-view]');
const recentFilesList   = document.getElementById('recent-files-list');
const fileTableBody     = document.getElementById('file-table-body');
const myFilesCount      = document.getElementById('myfiles-count');
const dropZone          = document.getElementById('drop-zone');
const fileInput         = document.getElementById('file-input');
const uploadBtn         = document.getElementById('upload-btn');
const uploadStatus      = document.getElementById('upload-status');
const totalFilesCount   = document.getElementById('total-files-count');
const totalStorageUsed  = document.getElementById('total-storage-used');
const fileTypesCount    = document.getElementById('file-types-count');

// --- 3. State ---
let currentUser = null;
let filesData   = [];
let isLoginMode = true;

// --- 4. Auth — Toggle UI ---
toggleLink.addEventListener('click', () => {
  isLoginMode = !isLoginMode;
  authError.classList.add('hidden');

  if (isLoginMode) {
    authTitle.textContent    = 'Welcome Back';
    authSubtitle.textContent = 'Sign in to your Cloud Storage';
    authBtn.textContent      = 'Sign In';
    authToggleText.innerHTML = `Don't have an account? <span id="toggle-link" style="cursor:pointer;color:#3b82f6;font-weight:600;">Sign up</span>`;
    nameGroup.classList.add('hidden');
    nameInput.required = false;
  } else {
    authTitle.textContent    = 'Create Account';
    authSubtitle.textContent = 'Join Cloud Storage today';
    authBtn.textContent      = 'Sign Up';
    authToggleText.innerHTML = `Already have an account? <span id="toggle-link" style="cursor:pointer;color:#3b82f6;font-weight:600;">Sign in</span>`;
    nameGroup.classList.remove('hidden');
    nameInput.required = true;
  }

  document.getElementById('toggle-link').addEventListener('click', () => toggleLink.click());
});

// --- 5. Auth — Submit ---
authForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  authError.classList.add('hidden');
  authBtn.disabled    = true;
  authBtn.textContent = isLoginMode ? 'Signing in...' : 'Creating account...';

  const email    = emailInput.value.trim();
  const password = passwordInput.value;

  if (isLoginMode) {
    // ── LOGIN ──
    const { data, error } = await db.auth.signInWithPassword({ email, password });

    if (error) {
      showAuthError(error.message);
    } else {
      currentUser = data.user;
      setDisplayName();
      await loginSuccess();
    }

  } else {
    // ── SIGN UP ──
    const name = nameInput.value.trim();
    const { data, error } = await db.auth.signUp({
      email,
      password,
      options: { data: { name } }
    });

    if (error) {
      showAuthError(error.message);
    } else {
      currentUser = data.user;
      setDisplayName();
      await loginSuccess();
    }
  }

  authBtn.disabled    = false;
  authBtn.textContent = isLoginMode ? 'Sign In' : 'Sign Up';
});

function showAuthError(msg) {
  authError.textContent = msg;
  authError.classList.remove('hidden');
}

function setDisplayName() {
  if (!currentUser) return;
  const name = currentUser.user_metadata?.name || currentUser.email.split('@')[0];
  displayUserName.textContent = name;
}

async function loginSuccess() {
  authWrapper.classList.add('hidden');
  mainApp.classList.remove('hidden');
  emailInput.value   = '';
  passwordInput.value = '';
  await loadFiles();
  updateAllViews();
  switchView('dashboard');
}

// --- 6. Logout ---
logoutBtn.addEventListener('click', async () => {
  try {
    // Try Supabase logout with 3 second timeout
    await Promise.race([
      db.auth.signOut(),
      new Promise((_, reject) => setTimeout(() => reject(), 3000))
    ]);
  } catch {
    // If Supabase is down, force logout anyway
    console.log('Forced logout');
  } finally {
    // Always run this regardless
    currentUser = null;
    filesData   = [];
    mainApp.classList.add('hidden');
    authWrapper.classList.remove('hidden');
  }
});

// --- 7. Auto-login if session exists ---
db.auth.onAuthStateChange(async (event, session) => {
  if (session?.user && !currentUser) {
    currentUser = session.user;
    setDisplayName();
    authWrapper.classList.add('hidden');
    mainApp.classList.remove('hidden');
    await loadFiles();
    updateAllViews();
    switchView('dashboard');
  }
});

// --- 8. Load Files from Supabase ---
async function loadFiles() {
  if (!currentUser) return;

  const { data, error } = await db
    .from('files')
    .select('*')
    .eq('user_id', currentUser.id)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Load files error:', error.message);
    return;
  }

  filesData = data || [];
}

// --- 9. Upload File ---
async function handleUpload(file) {
  if (!file || !currentUser) return;

  // Show uploading state
  uploadBtn.disabled      = true;
  uploadStatus.textContent = '⏳ Uploading...';
  uploadStatus.style.color = '#3b82f6';
  uploadStatus.classList.remove('hidden');

  // Build unique file path: userId/timestamp.ext
  const ext      = file.name.split('.').pop();
  const filePath = `${currentUser.id}/${Date.now()}.${ext}`;

  // Upload to Supabase Storage
  const { error: storageError } = await db.storage
    .from('uploads')
    .upload(filePath, file);

  if (storageError) {
    uploadStatus.textContent = '❌ Upload failed. Try again.';
    uploadStatus.style.color = '#ef4444';
    uploadBtn.disabled       = false;
    return;
  }

  // Get public download URL
  const { data: urlData } = db.storage
    .from('uploads')
    .getPublicUrl(filePath);

  // Detect file type
  const type = detectFileType(file);

  // Save record to database
  const { error: dbError } = await db.from('files').insert({
    name:     file.name,
    size:     formatSize(file.size),
    type:     type,
    url:      urlData.publicUrl,
    user_id:  currentUser.id
  });

  if (dbError) {
    uploadStatus.textContent = '❌ Database error: ' + dbError.message;
    uploadStatus.style.color = '#ef4444';
    uploadBtn.disabled       = false;
    return;
  }

  // ✅ Success!
  uploadStatus.textContent = '✅ File uploaded successfully!';
  uploadStatus.style.color = '#22c55e';
  fileInput.value          = '';
  uploadBtn.disabled       = false;

  await loadFiles();
  updateAllViews();
  switchView('dashboard');

  setTimeout(() => uploadStatus.classList.add('hidden'), 3000);
}

// --- 10. Delete File ---
async function deleteFile(id) {
  const file = filesData.find(f => f.id === id);
  if (!file) return;

  // Extract storage path from public URL
  const marker    = '/object/public/uploads/';
  const pathStart = file.url.indexOf(marker);
  if (pathStart !== -1) {
    const storagePath = file.url.substring(pathStart + marker.length);
    await db.storage.from('uploads').remove([storagePath]);
  }

  // Delete from database
  const { error } = await db.from('files').delete().eq('id', id);

  if (!error) {
    await loadFiles();
    updateAllViews();
  }
}

// --- 11. Download File ---
function downloadFile(id) {
  const file = filesData.find(f => f.id === id);
  if (!file) return;

  const a       = document.createElement('a');
  a.href        = file.url;
  a.download    = file.name;
  a.target      = '_blank';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

// --- 12. Helpers ---
function detectFileType(file) {
  const name = file.name.toLowerCase();
  const mime = file.type.toLowerCase();
  if (mime.includes('image'))                                      return 'image';
  if (mime.includes('pdf') || name.endsWith('.pdf'))               return 'pdf';
  if (name.endsWith('.docx') || name.endsWith('.doc'))             return 'word';
  if (name.endsWith('.xlsx') || name.endsWith('.xls') || name.endsWith('.csv')) return 'excel';
  if (mime.includes('video'))                                      return 'video';
  return 'file';
}

function formatSize(bytes) {
  if (bytes >= 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  if (bytes >= 1024)        return (bytes / 1024).toFixed(1) + ' KB';
  return bytes + ' B';
}

function getFileIconClass(type) {
  switch (type) {
    case 'pdf':   return 'fas fa-file-pdf';
    case 'image': return 'fas fa-file-image';
    case 'excel': return 'fas fa-file-excel';
    case 'word':  return 'fas fa-file-word';
    case 'video': return 'fas fa-file-video';
    default:      return 'fas fa-file';
  }
}

// --- 13. Render Functions ---
function renderDashboardStats() {
  totalFilesCount.textContent = filesData.length;
  const uniqueTypes = new Set(filesData.map(f => f.type));
  fileTypesCount.textContent  = uniqueTypes.size;

  let totalMb = 0;
  filesData.forEach(f => {
    const num = parseFloat(f.size);
    if (f.size.includes('MB'))      totalMb += num;
    else if (f.size.includes('KB')) totalMb += num / 1024;
  });
  totalStorageUsed.textContent = totalMb.toFixed(2) + ' MB';
}

function renderRecentFiles() {
  recentFilesList.innerHTML = '';
  const recent = filesData.slice(0, 5);

  if (recent.length === 0) {
    recentFilesList.innerHTML = '<li style="color:#9ca3af;padding:15px 0;">No files uploaded yet.</li>';
    return;
  }

  recent.forEach(file => {
    const li = document.createElement('li');
    li.innerHTML = `
      <div class="file-info">
        <i class="${getFileIconClass(file.type)} file-icon"></i>
        <span class="file-name">${file.name}</span>
      </div>
      <span class="file-size">${file.size}</span>
    `;
    recentFilesList.appendChild(li);
  });
}

function renderFilesTable() {
  fileTableBody.innerHTML    = '';
  myFilesCount.textContent   = `${filesData.length} files stored`;

  if (filesData.length === 0) {
    fileTableBody.innerHTML = `
      <tr>
        <td colspan="4" style="text-align:center;padding:50px 0;color:#9ca3af;">
          <div style="font-size:3rem;margin-bottom:10px;">📂</div>
          <div style="font-weight:600;margin-bottom:6px;">No files uploaded yet.</div>
          <div style="font-size:0.85rem;">Your uploaded files will appear here.</div>
        </td>
      </tr>`;
    return;
  }

  filesData.forEach(file => {
    const date = new Date(file.created_at).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric'
    });
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>
        <div class="file-name-cell">
          <i class="${getFileIconClass(file.type)} file-icon"></i>
          <span>${file.name}</span>
        </div>
      </td>
      <td>${file.size}</td>
      <td>${date}</td>
      <td class="actions-cell">
        <i class="fas fa-download" onclick="downloadFile(${file.id})" title="Download"></i>
        <i class="fas fa-trash-alt" onclick="deleteFile(${file.id})" title="Delete"></i>
      </td>
    `;
    fileTableBody.appendChild(row);
  });
}

function updateAllViews() {
  renderDashboardStats();
  renderRecentFiles();
  renderFilesTable();
}

// --- 14. Navigation ---
function switchView(targetViewId) {
  Object.values(views).forEach(v => v.classList.add('hidden'));
  navLinks.forEach(l => l.classList.remove('active'));

  if (views[targetViewId]) {
    views[targetViewId].classList.remove('hidden');
    const activeLink = document.querySelector(`aside a[data-view="${targetViewId}"]`);
    if (activeLink) activeLink.classList.add('active');
  }
}

navLinks.forEach(link => {
  link.addEventListener('click', function (e) {
    e.preventDefault();
    switchView(this.dataset.view);
  });
});

document.querySelectorAll('a[data-view="myfiles"]').forEach(link => {
  link.addEventListener('click', (e) => { e.preventDefault(); switchView('myfiles'); });
});

const goUploadLink = document.querySelector('.quick-upload-card a[data-view="upload"]');
if (goUploadLink) {
  goUploadLink.addEventListener('click', (e) => { e.preventDefault(); switchView('upload'); });
}

// --- 15. Upload Events ---
uploadBtn.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', (e) => handleUpload(e.target.files[0]));

dropZone.addEventListener('dragover',  (e) => { e.preventDefault(); dropZone.classList.add('active'); });
dropZone.addEventListener('dragleave', ()  => dropZone.classList.remove('active'));
dropZone.addEventListener('drop',      (e) => {
  e.preventDefault();
  dropZone.classList.remove('active');
  handleUpload(e.dataTransfer.files[0]);
});
