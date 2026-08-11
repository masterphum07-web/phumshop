// URL API จาก Google Apps Script ที่ Deploy เป็น Web App (นี่คือฐานข้อมูลที่ถูกซ่อนไว้หลังบ้าน)
const API_URL = "https://script.google.com/macros/s/AKfycbzcxHsj8JEGjJRu5whbwhKvXShJCUrI3gZFFtOHUx1hUK4b2bs0q76rjXReehlpZqtPLg/exec";

let appState = { username: '', isAdmin: false, categories: [], documents: [], tasks: [], flashcards: [], selectedFiles: [], uploadMode: 'file' };

// ฟังก์ชันพื้นฐานสำหรับเรียก API
async function callAPI(action, payload = {}) {
  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action, ...payload })
    });
    const data = await response.json();
    return data;
  } catch (err) {
    console.error("API Call Error:", err);
    throw err;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  console.log("App Started: กำลังเรียกข้อมูลจาก Database API...");
  
  callAPI('getInitialData')
    .then(onInitialDataLoaded)
    .catch(err => {
      console.error("Server Error:", err);
      document.getElementById('systemMessageBanner').innerHTML = `<i class="fa-solid fa-circle-xmark"></i> โหลดข้อมูลล้มเหลว: ${err.message || err}`;
      document.getElementById('systemMessageBanner').classList.replace('bg-blue-100', 'bg-red-100');
      document.getElementById('systemMessageBanner').classList.replace('text-blue-700', 'text-red-700');
    });
});

function onInitialDataLoaded(res) {
  if (!res || !res.success) {
    document.getElementById('systemMessageBanner').innerHTML = `<i class="fa-solid fa-circle-xmark"></i> ${res ? res.error : 'ไม่สามารถเชื่อมต่อข้อมูลได้'}`;
    document.getElementById('systemMessageBanner').classList.replace('bg-blue-100', 'bg-red-100');
    document.getElementById('systemMessageBanner').classList.replace('text-blue-700', 'text-red-700');
    return; 
  }
  
  document.getElementById('systemMessageBanner').style.display = 'none';
  
  appState.categories = res.categories || [];
  appState.documents = res.documents || [];
  appState.tasks = res.tasks || [];
  appState.flashcards = res.flashcards || [];

  if (res.settings.header_title) document.getElementById('appTitleText').innerText = res.settings.header_title;
  if (res.settings.cta_text) document.getElementById('ctaText').innerText = res.settings.cta_text;

  renderCategoryOptions(); 
  renderCategoryCards(); 
  filterDocuments(); 
  renderTasks(); 
  renderFlashcards(); 
  loadActivityLogs();
}

// ==========================================
// ส่วนฟังก์ชันหน้าจอ UI ทั้งหมด
// ==========================================
function switchTab(tab) {
  document.getElementById('tabHome').classList.toggle('hidden', tab !== 'home');
  document.getElementById('tabStudy').classList.toggle('hidden', tab !== 'study');
  if(window.innerWidth < 768) toggleMobileSidebar();
}

function renderCategoryOptions() {
  const s = document.getElementById('docCategorySelect'), fs = document.getElementById('categoryFilter');
  s.innerHTML = '<option value="">-- เลือกวิชา --</option>'; fs.innerHTML = '<option value="ALL">ทุกวิชา</option>';
  appState.categories.forEach(c => { s.innerHTML += `<option value="${c.name}">${c.name}</option>`; fs.innerHTML += `<option value="${c.name}">${c.name}</option>`; });
}

function renderCategoryCards() {
  document.getElementById('categoryCardsGrid').innerHTML = appState.categories.map(c => 
    `<div onclick="document.getElementById('categoryFilter').value='${c.name}'; filterDocuments();" class="bg-white p-3 rounded-xl border cursor-pointer hover:border-blue-400 text-xs font-bold flex gap-2 items-center transition shadow-sm"><i class="fa-solid fa-folder text-blue-500"></i> ${c.name}</div>`
  ).join('');
}

function filterDocuments() {
  const tb = document.getElementById('documentsTableBody');
  const s = String(document.getElementById('searchInput').value).toLowerCase();
  const cf = document.getElementById('categoryFilter').value;
  const docs = appState.documents.filter(d => (String(d.title).toLowerCase().includes(s) || String(d.uploader).toLowerCase().includes(s)) && (cf === 'ALL' || d.category === cf));
  if(docs.length === 0) { tb.innerHTML = `<tr><td colspan="5" class="py-10 text-center text-slate-400">ไม่พบเอกสาร</td></tr>`; return; }
  
  tb.innerHTML = docs.map(d => `
    <tr class="hover:bg-slate-50 border-b transition">
      <td class="py-3 px-2 flex gap-2 font-medium"><i class="fa-solid fa-file text-blue-500 mt-0.5"></i> ${d.title}</td>
      <td class="py-3 px-2 text-slate-500 max-w-[150px] truncate" title="${d.originalFilename || '-'}">${d.originalFilename || '-'}</td>
      <td class="py-3 px-2">${d.uploader}</td>
      <td class="py-3 px-2"><span class="bg-slate-100 text-slate-600 border border-slate-200 px-2 py-0.5 rounded-full text-[10px] font-semibold">${d.category}</span></td>
      <td class="py-3 px-2 text-right"><a href="${d.fileUrl}" target="_blank" class="text-blue-600 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg font-semibold transition">เปิดไฟล์ <i class="fa-solid fa-arrow-up-right-from-square text-[10px] ml-1"></i></a></td>
    </tr>
  `).join('');
}

function renderTasks() {
  let ts = appState.username ? appState.tasks.filter(t => t.username === appState.username) : appState.tasks;
  document.getElementById('tasksListContainer').innerHTML = ts.length === 0 ? `<p class="text-slate-400">ไม่มีข้อมูล</p>` : ts.map(t => 
    `<label class="flex items-center gap-3 p-3 border rounded-xl hover:bg-slate-50 cursor-pointer transition shadow-sm bg-white"><input type="checkbox" class="w-4 h-4 text-emerald-500 rounded border-gray-300 focus:ring-emerald-500" ${t.isDone ? 'checked' : ''} onchange="uiToggleTask('${t.id}', ${t.isDone})"><span class="${t.isDone ? 'line-through text-slate-400' : 'font-medium'}">${t.detail}</span></label>`
  ).join('');
}

function renderFlashcards() {
  let fs = appState.username ? appState.flashcards.filter(f => f.username === appState.username) : appState.flashcards;
  document.getElementById('flashcardsGrid').innerHTML = fs.length === 0 ? `<div class="text-slate-400 col-span-full">ไม่มีแฟลชการ์ด</div>` : fs.map(f => 
    `<div class="flashcard perspective-1000 w-full h-32 cursor-pointer" onclick="this.classList.toggle('flipped')"><div class="flashcard-inner relative w-full h-full text-center rounded-xl border-2 border-amber-100 shadow-sm"><div class="absolute w-full h-full backface-hidden bg-amber-50/50 rounded-xl p-3 flex items-center justify-center font-bold text-sm text-amber-800">${f.question}</div><div class="absolute w-full h-full backface-hidden rotate-y-180 bg-amber-600 text-white rounded-xl p-3 flex items-center justify-center text-xs shadow-inner">${f.answer}</div></div></div>`
  ).join('');
}

// ==========================================
// ฝั่ง Action / ส่งข้อมูลไป API (Code.gs)
// ==========================================
function refreshData(showToast = false) {
  if(showToast) Swal.fire({title: 'กำลังอัปเดตข้อมูล...', toast: true, position: 'top-end', showConfirmButton: false, timer: 1500});
  callAPI('getInitialData').then(onInitialDataLoaded);
}

function toggleUploadMode(m) {
  appState.uploadMode = m;
  document.getElementById('sectionFileUpload').classList.toggle('hidden', m !== 'file');
  document.getElementById('sectionLinkUpload').classList.toggle('hidden', m !== 'link');
  document.getElementById('docLinkUrl').required = (m === 'link');
  
  if (m === 'file') {
    document.getElementById('tabFileBtn').classList.add('bg-white', 'text-blue-600', 'shadow-sm');
    document.getElementById('tabFileBtn').classList.remove('text-slate-500');
    document.getElementById('tabLinkBtn').classList.remove('bg-white', 'text-blue-600', 'shadow-sm');
    document.getElementById('tabLinkBtn').classList.add('text-slate-500');
  } else {
    document.getElementById('tabLinkBtn').classList.add('bg-white', 'text-blue-600', 'shadow-sm');
    document.getElementById('tabLinkBtn').classList.remove('text-slate-500');
    document.getElementById('tabFileBtn').classList.remove('bg-white', 'text-blue-600', 'shadow-sm');
    document.getElementById('tabFileBtn').classList.add('text-slate-500');
  }
}

function handleFileSelect(e) { 
  Array.from(e.target.files).forEach(f => {
    appState.selectedFiles.push({ file: f, id: Math.random().toString(36).substr(2, 9) });
    if(!document.getElementById('docTitleName').value) document.getElementById('docTitleName').value = f.name;
  }); 
  document.getElementById('fileQueueContainer').classList.remove('hidden');
  document.getElementById('fileQueueList').innerHTML = appState.selectedFiles.map(i => `<div class="bg-white p-2 flex justify-between items-center border rounded-lg shadow-sm text-xs font-medium"><span class="truncate max-w-[200px]"><i class="fa-solid fa-file-lines text-slate-400 mr-1"></i> ${i.file.name}</span><button type="button" onclick="appState.selectedFiles=appState.selectedFiles.filter(x=>x.id!=='${i.id}');this.parentElement.remove()" class="text-red-500 hover:bg-red-50 w-6 h-6 rounded-full flex items-center justify-center transition"><i class="fa-solid fa-xmark"></i></button></div>`).join('');
}

async function handleFormSubmit(e) {
  e.preventDefault();
  const title = document.getElementById('docTitleName').value, up = document.getElementById('uploaderName').value, cat = document.getElementById('docCategorySelect').value;
  
  if (appState.uploadMode === 'file') {
    if (appState.selectedFiles.length === 0) return Swal.fire('แจ้งเตือน', 'กรุณาเลือกไฟล์!', 'warning');
    Swal.fire({ title: 'กำลังอัปโหลดไฟล์ (ห้ามปิดหน้าจอ)...', didOpen: () => Swal.showLoading() });
    
    try {
      for (let item of appState.selectedFiles) {
        const base64 = await new Promise(r => { const reader = new FileReader(); reader.onload = () => r(reader.result.split(',')[1]); reader.readAsDataURL(item.file); });
        await callAPI('uploadFileToDrive', { base64Data: base64, filename: item.file.name, mimeType: item.file.type, category: cat, uploader: up, docTitle: title });
      }
      Swal.fire('สำเร็จ!', 'ไฟล์ถูกอัปโหลดเรียบร้อยแล้ว', 'success');
      appState.selectedFiles = []; document.getElementById('fileQueueContainer').classList.add('hidden'); document.getElementById('uploadForm').reset(); refreshData();
    } catch(err) { Swal.fire('อัปโหลดล้มเหลว', err.toString(), 'error'); }
  } else {
    const url = document.getElementById('docLinkUrl').value;
    Swal.fire({ title: 'กำลังบันทึกลิงก์...', didOpen: () => Swal.showLoading() });
    
    callAPI('uploadDocumentByLink', { docTitle: title, url: url, category: cat, uploader: up })
      .then(() => { Swal.fire('สำเร็จ!', 'บันทึกลิงก์เรียบร้อยแล้ว', 'success'); document.getElementById('uploadForm').reset(); refreshData(); })
      .catch(err => Swal.fire('ล้มเหลว', err.toString(), 'error'));
  }
}

function toggleAdminView() {
  if(appState.username) {
    appState.username = ''; document.getElementById('adminBtnText').innerText = 'เข้าสู่ระบบ'; document.getElementById('userNameDisplay').innerText = 'ผู้ใช้งานทั่วไป'; refreshData();
  } else {
    Swal.fire({
      title: 'เข้าสู่ระบบ', html: '<input id="u" class="swal2-input" placeholder="Username"><input id="p" type="password" class="swal2-input" placeholder="Password">',
      preConfirm: () => ({ u: document.getElementById('u').value, p: document.getElementById('p').value }),
      confirmButtonText: 'Login',
      confirmButtonColor: '#2563eb'
    }).then(r => {
      if(r.isConfirmed) {
        Swal.fire({ title: 'กำลังตรวจสอบ...', didOpen: () => Swal.showLoading() });
        callAPI('verifyLogin', { username: r.value.u, password: r.value.p }).then(res => {
          if(res.success) { appState.username = res.username; document.getElementById('adminBtnText').innerText = 'ออกระบบ'; document.getElementById('userNameDisplay').innerText = res.username; Swal.fire('เข้าสู่ระบบสำเร็จ', `ยินดีต้อนรับคุณ ${res.username}`, 'success'); refreshData(); }
          else Swal.fire('ข้อมูลไม่ถูกต้อง', res.message, 'error');
        });
      }
    });
  }
}

function loadActivityLogs() {
  callAPI('getSystemLogs').then(logs => {
    document.getElementById('activityFeed').innerHTML = logs.slice(0,5).map(l => `<div class="border-b border-slate-100 pb-2"><p class="text-slate-700 font-medium">${l.details}</p><p class="text-[10px] text-slate-400 mt-1 flex items-center gap-1"><i class="fa-regular fa-clock"></i> ${l.timestamp}</p></div>`).join('');
  });
}

function uiAddNewCategory() {
  Swal.fire({ title: 'เพิ่มหมวดหมู่วิชาใหม่', input: 'text', showCancelButton: true, confirmButtonText: 'เพิ่ม', confirmButtonColor: '#10b981' }).then(r => {
    if (r.isConfirmed && r.value) {
      Swal.fire({ title: 'กำลังบันทึก...', didOpen: () => Swal.showLoading() });
      callAPI('addNewCategory', { subjectName: r.value, username: appState.username }).then(() => {
        Swal.fire('สำเร็จ', `เพิ่มวิชา ${r.value} แล้ว`, 'success'); refreshData();
      });
    }
  });
}

function uiAddTask() {
  const v = document.getElementById('newTaskInput').value.trim();
  if(v) {
    document.getElementById('newTaskInput').value = 'กำลังเพิ่ม...';
    document.getElementById('newTaskInput').disabled = true;
    callAPI('addChecklistTask', { username: appState.username || 'guest', subject: "ทั่วไป", detail: v }).then(() => {
      document.getElementById('newTaskInput').value=''; 
      document.getElementById('newTaskInput').disabled = false;
      refreshData();
    });
  }
}

function uiToggleTask(id, stat) { 
  callAPI('toggleChecklistTask', { id: id, currentStatus: stat }).then(() => refreshData()); 
}

function uiShowAddFlashcard() {
  const opts = appState.categories.map(c => `<option value="${c.name}">${c.name}</option>`).join('');
  Swal.fire({ 
    title: 'สร้างแฟลชการ์ดใหม่', 
    html: `<select id="fc-s" class="swal2-input border-slate-200">${opts}</select><input id="fc-q" class="swal2-input border-slate-200" placeholder="คำถาม (ด้านหน้า)"><input id="fc-a" class="swal2-input border-slate-200" placeholder="คำตอบ (ด้านหลัง)">`, 
    preConfirm: () => ({ s: document.getElementById('fc-s').value, q: document.getElementById('fc-q').value, a: document.getElementById('fc-a').value }),
    confirmButtonText: 'สร้างเลย',
    confirmButtonColor: '#f59e0b'
  }).then(r => {
    if(r.isConfirmed && r.value.q && r.value.a) {
      Swal.fire({ title: 'กำลังสร้าง...', didOpen: () => Swal.showLoading() });
      callAPI('addFlashcardItem', { username: appState.username || 'guest', subject: r.value.s, question: r.value.q, answer: r.value.a, imageBase64: null, imageName: null, imageMime: null })
        .then(() => { Swal.fire('สำเร็จ', 'เพิ่มแฟลชการ์ดเรียบร้อย', 'success'); refreshData(); });
    }
  });
}

function toggleMobileSidebar() { document.getElementById('sidebar').classList.toggle('-translate-x-full'); document.getElementById('mobileBackdrop').classList.toggle('hidden'); }
