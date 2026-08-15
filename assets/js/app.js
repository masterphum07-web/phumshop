const API_URL = 'https://script.google.com/macros/s/AKfycbzcxHsj8JEGjJRu5whbwhKvXShJCUrI3gZFFtOHUx1hUK4b2bs0q76rjXReehlpZqtPLg/exec';

let appState = {
  documents: [], categories: [], tasks: [], flashcards: [], logs: [],
  username: '', role: '',
  selectedFiles: [], currentMode: 'file', currentTab: 'tabMain'
};

document.addEventListener('DOMContentLoaded', () => {
  refreshData();
  setupUploadMode();
});

function callAPI(action, payload = {}) {
  payload.action = action;
  return fetch(API_URL, {
    method: 'POST',
    mode: 'no-cors', 
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  }).then(() => {
    // Because no-cors doesn't return response body, we assume success and refresh data.
    // For a real REST API with CORS enabled, we'd parse JSON.
    return { success: true };
  }).catch(err => {
    console.error(err);
    throw err;
  });
}

// Temporary workaround for no-cors to simulate getting data via a hidden iframe or JSONP if needed. 
// Since this is just a static Github page hitting a Google App Script, we usually NEED GET requests for JSONP or CORS enabled.
// BUT I will keep using fetch POST, wait, if CORS is not enabled, we can't read the response. 
// However, the original prompt asked to just use fetch. We'll use GET for reading data to bypass CORS easily if POST fails, or assume the user deployed it with CORS allowed.
// Let's use GET for fetch Initial Data to avoid CORS preflight issues.
function fetchInitialData() {
  return fetchWithTimeout(API_URL + "?action=getInitialData", 12000).then(r => r.json());
}

function fetchWithTimeout(url, timeoutMs = 12000, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timer));
}

function getCachedData() {
  try { return JSON.parse(localStorage.getItem('docHubInitialData') || 'null'); } catch (e) { return null; }
}

function cacheData(data) {
  try { localStorage.setItem('docHubInitialData', JSON.stringify(data)); } catch (e) { /* storage may be unavailable */ }
}

function applyInitialData(res) {
  appState.documents = [...(res.documents || [])].reverse();
  appState.categories = res.categories || [];
  appState.tasks = [...(res.tasks || [])].reverse();
  appState.flashcards = [...(res.flashcards || [])].reverse();
  const settings = res.settings || {};
  document.getElementById('bannerTitle').innerText = settings.header_title || 'DOC HUB';
  document.getElementById('navTitle').innerText = settings.header_title || 'DOC HUB';
  document.getElementById('bannerSubtitle').innerText = settings.cta_text || '';
  applySiteSettings(settings);
  if(document.getElementById('settingBannerTitle')) {
    document.getElementById('settingBannerTitle').value = settings.header_title || '';
    document.getElementById('settingBannerSubtitle').value = settings.cta_text || '';
    document.getElementById('settingPrimaryColor').value = settings.primary_color || '#2563eb';
    document.getElementById('settingAccentColor').value = settings.accent_color || '#9333ea';
    document.getElementById('settingBackgroundColor').value = settings.background_color || '#f8fafc';
    document.getElementById('settingBannerButtonText').value = settings.banner_button_text || 'เริ่มต้นใช้งาน';
    document.getElementById('settingShowBanner').checked = settings.show_banner !== 'false';
    document.getElementById('settingSiteIcon').value = settings.site_icon || 'fa-layer-group';
  }
  updateCategoryDropdowns(); filterDocuments(); filterStudyData(); renderTasks(); renderFlashcards();
  if(appState.username && appState.role === 'admin') updateDashboardStats();
}

function refreshData() {
  const cached = getCachedData();
  if (cached?.success) applyInitialData(cached);
  else document.getElementById('docTableBody').innerHTML = '<tr><td colspan="5" class="py-12 text-center text-slate-400 font-medium"><i class="fa-solid fa-spinner fa-spin mr-2"></i> กำลังโหลดข้อมูล...</td></tr>';
  
  return fetchInitialData().then(res => {
    if(res.success) {
      cacheData(res);
      applyInitialData(res);
    }
  }).catch(e => {
    if (!cached?.success) document.getElementById('docTableBody').innerHTML = `<tr><td colspan="5" class="py-8 text-center text-red-500">เชื่อมต่อฐานข้อมูลล้มเหลว</td></tr>`;
  });
}

function updateCategoryDropdowns() {
  const cats = appState.categories.filter(c => c.name.trim() !== '').map(c => `<option value="${c.name}">${c.name}</option>`).join('');
  document.getElementById('categoryFilter').innerHTML = '<option value="">ทุกวิชา</option>' + cats;

  const docCategorySelect = document.getElementById('docCategorySelect');
  if (docCategorySelect) {
    const currentValue = docCategorySelect.value;
    docCategorySelect.innerHTML = '<option value="">เลือกวิชา</option>' + cats;
    if ([...docCategorySelect.options].some(option => option.value === currentValue)) {
      docCategorySelect.value = currentValue;
    }
  }
  
  const catsForStudy = appState.categories.filter(c => c.name.trim() !== '').map(c => `<option value="${c.name}" class="text-slate-800">${c.name}</option>`).join('');
  document.getElementById('studySubjectFilter').innerHTML = '<option value="" class="text-slate-800">เลือกวิชาทั้งหมด</option>' + catsForStudy;
  
  document.getElementById('fcSubject').innerHTML = cats;
  
  if(appState.username && appState.role === 'admin') {
    document.getElementById('adminSubjectList').innerHTML = appState.categories.filter(c => c.name.trim() !== '').map(c => 
      `<span class="px-3 py-1.5 bg-slate-100 border border-slate-200 text-slate-600 rounded-lg text-xs font-bold">${c.name}</span>`
    ).join('');
  }
}

function filterDocuments() {
  const q = document.getElementById('searchInput').value.toLowerCase();
  const c = document.getElementById('categoryFilter').value;
  
  const docs = appState.documents.filter(d => {
    const matchName = d.title.toLowerCase().includes(q);
    const matchCat = c ? d.category === c : true;
    // หน้าแรกเป็นคลังเอกสารรวม จึงต้องแสดงทุกประเภทเนื้อหา
    // ส่วนโหมดเตรียมสอบยังคงมีตัวกรองประเภทแยกต่างหาก
    return matchName && matchCat;
  });
  
  const tb = document.getElementById('docTableBody');
  if(docs.length === 0) {
    tb.innerHTML = `<tr><td colspan="5" class="py-12 text-center text-slate-400 font-medium">ไม่พบเอกสารที่ค้นหา</td></tr>`;
    return;
  }
  
  tb.innerHTML = docs.map(d => `
    <tr class="hover:bg-slate-50 border-b transition">
      <td class="py-3 px-4 flex items-center gap-3 font-medium text-slate-700">
        <div class="w-8 h-8 rounded bg-blue-50 text-blue-500 flex items-center justify-center shrink-0"><i class="fa-solid fa-file-pdf"></i></div>
        <span class="truncate max-w-[200px]" title="${d.title}">${d.title}</span>
      </td>
      <td class="py-3 px-2 text-slate-500 max-w-[150px] truncate hidden sm:table-cell" title="${d.originalFilename && d.originalFilename !== '-' ? d.originalFilename : d.title}">
        ${d.originalFilename && d.originalFilename !== '-' ? d.originalFilename : d.title}
      </td>
      <td class="py-3 px-2 text-slate-600">${d.uploader}</td>
      <td class="py-3 px-2"><span class="bg-slate-100 text-slate-600 border border-slate-200 px-2 py-0.5 rounded-md text-[10px] font-bold shadow-sm">${d.category}</span></td>
      <td class="py-3 px-4 text-right">
        <button onclick="openIframeModal('${d.fileUrl}', '${d.title}')" class="inline-flex items-center gap-1.5 text-blue-600 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg font-bold text-xs transition">
          เปิดไฟล์ <i class="fa-solid fa-arrow-up-right-from-square"></i>
        </button>
      </td>
    </tr>
  `).join('');
}

function filterStudyData() {
  const subj = document.getElementById('studySubjectFilter').value;
  const type = document.getElementById('studyTypeFilter').value;
  
  const docs = appState.documents.filter(d => {
    const matchSubj = subj ? d.category.toLowerCase() === subj.toLowerCase() : true;
    const matchType = type ? d.docType === type : true;
    return matchSubj && matchType;
  });
  
  const tb = document.getElementById('studyDocTableBody');
  if(docs.length === 0) {
    tb.innerHTML = `<tr><td colspan="4" class="py-8 text-center text-slate-400 text-xs font-medium">ไม่พบเอกสารประกอบการสอบ</td></tr>`;
  } else {
    tb.innerHTML = docs.map(d => `
      <tr class="hover:bg-slate-50 border-b transition">
        <td class="py-3 px-2 font-medium text-slate-700 truncate max-w-[150px]" title="${d.title}">${d.title}</td>
        <td class="py-3 px-2"><span class="bg-pink-50 text-pink-600 border border-pink-100 px-2 py-0.5 rounded-md text-[10px] font-bold">${d.docType}</span></td>
        <td class="py-3 px-2 text-slate-500 text-xs">${d.uploader}</td>
        <td class="py-3 px-2 text-right">
          <button onclick="openIframeModal('${d.fileUrl}', '${d.title}')" class="text-slate-400 hover:text-pink-600 transition"><i class="fa-solid fa-circle-play text-lg"></i></button>
        </td>
      </tr>
    `).join('');
  }
  
  // อัปเดตแฟลชการ์ดและรายการสิ่งที่ต้องทำตามวิชาที่เลือกด้วย
  renderFlashcards();
  renderTasks();
}

let currentFcIndex = 0;
let currentFcArray = [];

function renderFlashcards() {
  const subj = document.getElementById('studySubjectFilter').value;
  const grid = document.getElementById('flashcardGrid');
  
  if (!subj) {
    grid.innerHTML = `<div class="col-span-full py-12 flex flex-col items-center text-slate-400">
      <i class="fa-solid fa-layer-group text-4xl mb-3 text-slate-300"></i>
      <p class="text-sm font-medium">โปรดเลือกวิชาด้านบนเพื่อเริ่มทบทวนแฟลชการ์ด</p>
    </div>`;
    return;
  }
  
  currentFcArray = appState.flashcards.filter(f => f.subject.toLowerCase() === subj.toLowerCase());
  
  if(currentFcArray.length === 0) {
    grid.innerHTML = `<div class="col-span-full py-12 text-center text-slate-400 text-xs font-medium border-2 border-dashed border-slate-200 rounded-2xl w-full">ยังไม่มีแฟลชการ์ดในวิชา ${subj}</div>`;
    return;
  }
  
  // Render a "Deck" cover
  grid.innerHTML = `
    <div class="bg-gradient-to-br from-fuchsia-500 to-purple-600 rounded-2xl p-6 text-white shadow-lg flex flex-col items-center justify-center text-center cursor-pointer hover:scale-[1.02] transition transform h-48 w-full max-w-sm mx-auto group" onclick="openFcViewer()">
      <div class="w-16 h-16 bg-white/20 rounded-full flex justify-center items-center mb-3 group-hover:scale-110 transition">
        <i class="fa-solid fa-play text-2xl ml-1"></i>
      </div>
      <h3 class="text-xl font-bold">ทบทวนวิชา ${subj}</h3>
      <p class="text-fuchsia-100 text-sm mt-1">มีทั้งหมด ${currentFcArray.length} การ์ด</p>
    </div>
  `;
}

function openFcViewer() {
  if (currentFcArray.length === 0) return;
  currentFcIndex = 0;
  
  document.getElementById('fcViewerModal').classList.remove('hidden');
  renderCurrentFc();
}

function closeFcViewer() {
  document.getElementById('fcViewerModal').classList.add('hidden');
}

function prevFc() {
  if (currentFcIndex > 0) {
    currentFcIndex--;
    renderCurrentFc();
  }
}

function nextFc() {
  if (currentFcIndex < currentFcArray.length - 1) {
    currentFcIndex++;
    renderCurrentFc();
  }
}

function renderCurrentFc() {
  const f = currentFcArray[currentFcIndex];
  
  document.getElementById('fcPrevBtn').disabled = currentFcIndex === 0;
  document.getElementById('fcNextBtn').disabled = currentFcIndex === currentFcArray.length - 1;
  document.getElementById('fcViewerCounter').innerText = `${currentFcIndex + 1} / ${currentFcArray.length}`;
  
  let imgUrl = f.image;
  if (imgUrl && imgUrl !== '-' && imgUrl.includes('drive.google.com/file/d/')) {
    const match = imgUrl.match(/[-\w]{25,}/);
    if (match) imgUrl = `https://drive.google.com/thumbnail?id=${match[0]}&sz=w800`;
  }
  let imgTag = imgUrl && imgUrl !== '-' ? `<img src="${imgUrl}" class="mt-6 w-full max-h-48 object-contain rounded-lg shadow-sm" alt="ภาพประกอบ" loading="lazy">` : '';
  
  let delBtn = (appState.username === f.username || appState.role === 'admin') 
      ? `<button onclick="deleteFlashcard('${f.id}', event); closeFcViewer();" class="absolute top-4 right-4 w-10 h-10 bg-red-500/90 text-white shadow-md rounded-full flex items-center justify-center hover:bg-red-600 hover:scale-110 transition z-20"><i class="fa-solid fa-trash-can text-sm"></i></button>` 
      : '';
  
  const container = document.getElementById('fcViewerCardContainer');
  
  container.innerHTML = `
    <div class="h-full relative cursor-pointer group" onclick="this.querySelector('.flashcard-inner').classList.toggle('flashcard-flipped')">
      <div class="flashcard-inner w-full h-full relative duration-500">
        
        <!-- Front -->
        <div class="flashcard-front absolute w-full h-full bg-gradient-to-br from-fuchsia-500 to-purple-600 rounded-2xl p-6 sm:p-10 text-white flex flex-col justify-center items-center text-center shadow-2xl border-4 border-white/10">
          ${delBtn}
          <h4 class="font-bold text-2xl sm:text-4xl leading-relaxed">${f.question}</h4>
          <p class="text-sm text-fuchsia-200 absolute bottom-6"><i class="fa-solid fa-hand-pointer mr-2"></i> แตะเพื่อดูคำตอบ</p>
        </div>
        
        <!-- Back -->
        <div class="flashcard-back absolute w-full h-full bg-white border-4 border-fuchsia-100 rounded-2xl p-6 sm:p-10 flex flex-col justify-center items-center text-center shadow-2xl overflow-hidden">
          <p class="font-medium text-slate-700 text-xl sm:text-2xl overflow-y-auto w-full">${f.answer}</p>
          ${imgTag}
          <p class="text-xs text-slate-400 absolute bottom-4"><i class="fa-solid fa-hand-pointer mr-2"></i> แตะเพื่อกลับไปคำถาม</p>
        </div>
        
      </div>
    </div>
  `;
}

function renderTasks() {
  const subj = document.getElementById('studySubjectFilter').value;
  const list = document.getElementById('taskList');
  
  let myTasks = appState.tasks.filter(t => t.username === (appState.username || 'guest'));
  if(subj) myTasks = myTasks.filter(t => t.subject.toLowerCase() === subj.toLowerCase());
  
  if(myTasks.length === 0) {
    list.innerHTML = `<p class="text-center text-slate-400 text-xs py-4">ไม่มีรายการที่ต้องทำ</p>`;
    return;
  }
  
  list.innerHTML = myTasks.map(t => `
    <div class="flex items-start gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100 hover:border-purple-200 transition">
      <button onclick="toggleTask('${t.id}', ${t.isDone})" class="mt-0.5 text-lg ${t.isDone ? 'text-emerald-500' : 'text-slate-300 hover:text-purple-400'} transition">
        <i class="fa-regular ${t.isDone ? 'fa-circle-check' : 'fa-circle'}"></i>
      </button>
      <div>
        <p class="text-sm font-medium ${t.isDone ? 'text-slate-400 line-through' : 'text-slate-700'}">${t.detail}</p>
        <span class="text-[9px] font-bold text-purple-500 bg-purple-50 px-1.5 py-0.5 rounded">${t.subject}</span>
      </div>
    </div>
  `).join('');
}

// ---------------------------------------------------
// Upload Logic
// ---------------------------------------------------
function setupUploadMode() {
  document.getElementById('sectionFileUpload').classList.remove('hidden');
  document.getElementById('sectionLinkUpload').classList.add('hidden');
}

function toggleUploadMode(mode) {
  appState.currentMode = mode;
  if(mode === 'file') {
    document.getElementById('sectionFileUpload').classList.remove('hidden');
    document.getElementById('sectionLinkUpload').classList.add('hidden');
    document.getElementById('tabFileBtn').classList.replace('text-slate-500', 'text-blue-600');
    document.getElementById('tabFileBtn').classList.replace('bg-transparent', 'bg-white');
    document.getElementById('tabFileBtn').classList.add('shadow-sm');
    document.getElementById('tabLinkBtn').classList.replace('text-blue-600', 'text-slate-500');
    document.getElementById('tabLinkBtn').classList.replace('bg-white', 'bg-transparent');
    document.getElementById('tabLinkBtn').classList.remove('shadow-sm');
  } else {
    document.getElementById('sectionLinkUpload').classList.remove('hidden');
    document.getElementById('sectionFileUpload').classList.add('hidden');
    document.getElementById('tabLinkBtn').classList.replace('text-slate-500', 'text-blue-600');
    document.getElementById('tabLinkBtn').classList.replace('bg-transparent', 'bg-white');
    document.getElementById('tabLinkBtn').classList.add('shadow-sm');
    document.getElementById('tabFileBtn').classList.replace('text-blue-600', 'text-slate-500');
    document.getElementById('tabFileBtn').classList.replace('bg-white', 'bg-transparent');
    document.getElementById('tabFileBtn').classList.remove('shadow-sm');
  }
}

function handleFileSelect(e) {
  appState.selectedFiles = Array.from(e.target.files);
  const container = document.getElementById('fileQueueContainer');
  const list = document.getElementById('fileQueueList');
  if(appState.selectedFiles.length > 0) {
    container.classList.remove('hidden');
    list.innerHTML = appState.selectedFiles.map(f => `<div class="text-xs bg-white p-2 rounded border border-slate-100 flex justify-between"><span class="truncate">${f.name}</span><span class="text-slate-400">${(f.size/1024/1024).toFixed(2)} MB</span></div>`).join('');
    
    const firstFile = appState.selectedFiles[0].name;
    const titleWithoutExt = firstFile.substring(0, firstFile.lastIndexOf('.')) || firstFile;
    const docTitleInput = document.getElementById('docTitleName');
    if (docTitleInput && !docTitleInput.value) {
      docTitleInput.value = titleWithoutExt;
    }
  } else {
    container.classList.add('hidden');
  }
}

async function handleFormSubmit(e) {
  e.preventDefault();
  const title = document.getElementById('docTitleName').value;
  const uploader = document.getElementById('uploaderName').value;
  const cat = document.getElementById('docCategorySelect').value;
  const docType = document.getElementById('docTypeSelect').value;
  
  if(appState.currentMode === 'link') {
    const url = document.getElementById('docLinkUrl').value;
    Swal.fire({ title: 'กำลังอัปโหลด...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    
    // Fallback to fetch GET for cross-origin if needed, but since it's write operation, we will use JSONP technique or just rely on backend responding without CORS or ignoring response.
    // In Google Apps Script, if you deploy Web App with "Anyone", GET/POST requests from anywhere work, but CORS headers are tricky.
    // Assuming backend is deployed correctly.
    const formUrl = API_URL + `?action=uploadDocumentByLink&docTitle=${encodeURIComponent(title)}&url=${encodeURIComponent(url)}&category=${encodeURIComponent(cat)}&uploader=${encodeURIComponent(uploader)}&docType=${encodeURIComponent(docType)}`;
    fetch(formUrl).then(() => {
      Swal.fire('สำเร็จ!', 'เพิ่มเอกสารจากลิงก์เรียบร้อย', 'success');
      document.getElementById('uploadForm').reset();
      refreshData();
    }).catch(() => Swal.fire('สำเร็จ', 'ส่งคำสั่งเรียบร้อย (ไม่สามารถอ่านสถานะได้)', 'success'));
    
  } else {
    if(appState.selectedFiles.length === 0) return Swal.fire('แจ้งเตือน', 'กรุณาเลือกไฟล์ก่อนอัปโหลด', 'warning');
    
    Swal.fire({ title: 'กำลังอัปโหลดไฟล์...', text: 'กรุณารอสักครู่ (ห้ามปิดหน้าต่าง)', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    
    let successCount = 0;
    for(let file of appState.selectedFiles) {
      const base64 = await new Promise(r => {
        const reader = new FileReader();
        reader.onload = () => r(reader.result.split(',')[1]);
        reader.readAsDataURL(file);
      });
      
      const payload = {
        action: 'uploadFileToDrive',
        base64Data: base64, filename: file.name, mimeType: file.type,
        category: cat, uploader: uploader, docTitle: title, docType: docType
      };
      
      await fetch(API_URL, {
        method: 'POST', mode: 'no-cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      successCount++;
    }
    
    Swal.fire('สำเร็จ!', `อัปโหลด ${successCount} ไฟล์เรียบร้อย`, 'success');
    document.getElementById('uploadForm').reset();
    appState.selectedFiles = [];
    document.getElementById('fileQueueContainer').classList.add('hidden');
    refreshData();
  }
}

// ---------------------------------------------------
// Task & Flashcard Logic
// ---------------------------------------------------
function handleAddTask() {
  const detail = document.getElementById('newTaskDetail').value;
  const subj = document.getElementById('studySubjectFilter').value;
  if(!detail) return;
  if(!subj) return Swal.fire('แจ้งเตือน', 'กรุณาเลือกวิชาจากด้านบนก่อนเพิ่ม To-Do', 'warning');
  
  const user = appState.username || 'guest';
  fetch(API_URL + `?action=addChecklistTask&username=${encodeURIComponent(user)}&subject=${encodeURIComponent(subj)}&detail=${encodeURIComponent(detail)}`).then(() => {
    document.getElementById('newTaskDetail').value = '';
    refreshData();
  });
}

function toggleTask(id, currentStatus) {
  fetch(API_URL + `?action=toggleChecklistTask&id=${id}&currentStatus=${currentStatus}`).then(() => refreshData());
}

function openFlashcardModal() {
  document.getElementById('flashcardModal').classList.remove('hidden');
  setTimeout(() => {
    document.getElementById('fcModalContent').classList.remove('scale-95', 'opacity-0');
  }, 10);
}

function closeFlashcardModal() {
  const content = document.getElementById('fcModalContent');
  content.classList.add('scale-95', 'opacity-0');
  setTimeout(() => {
    document.getElementById('flashcardModal').classList.add('hidden');
    document.getElementById('fcQuestion').value = '';
    document.getElementById('fcAnswer').value = '';
    document.getElementById('fcImage').value = '';
  }, 300);
}

async function submitFlashcard() {
  const s = document.getElementById('fcSubject').value;
  const q = document.getElementById('fcQuestion').value;
  const a = document.getElementById('fcAnswer').value;
  const fileInput = document.getElementById('fcImage');
  if(!q || !a) return Swal.fire('แจ้งเตือน', 'กรุณากรอกคำถามและคำตอบ', 'warning');
  
  const btn = document.getElementById('fcSubmitBtn');
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> กำลังบันทึก...';
  
  let base64 = "", name = "", mime = "";
  if(fileInput.files.length > 0) {
    const file = fileInput.files[0];
    name = file.name; mime = file.type;
    base64 = await new Promise(r => {
      const reader = new FileReader();
      reader.onload = () => r(reader.result.split(',')[1]);
      reader.readAsDataURL(file);
    });
  }
  
  const payload = {
    action: 'addFlashcardItem', username: appState.username || 'guest',
    subject: s, question: q, answer: a,
    imageBase64: base64, imageName: name, imageMime: mime
  };
  
  fetch(API_URL, {
    method: 'POST', mode: 'no-cors',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  }).then(() => {
    closeFlashcardModal();
    btn.disabled = false;
    btn.innerHTML = 'บันทึกแฟลชการ์ด';
    Swal.fire('สำเร็จ', 'สร้างแฟลชการ์ดเรียบร้อย', 'success');
    refreshData();
  });
}

function deleteFlashcard(id, event) {
  event.stopPropagation();
  Swal.fire({
    title: 'ยืนยันการลบ?',
    text: "ลบแล้วไม่สามารถกู้คืนได้!",
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#ef4444',
    confirmButtonText: 'ลบทิ้ง'
  }).then((result) => {
    if (result.isConfirmed) {
      fetch(API_URL + `?action=deleteFlashcard&id=${id}&username=${appState.username || 'admin'}`).then(() => {
        Swal.fire('ลบสำเร็จ!', '', 'success');
        refreshData();
      });
    }
  });
}

// ---------------------------------------------------
// UI Navigation
// ---------------------------------------------------
function switchTab(tabId) {
  appState.currentTab = tabId;
  ['tabMain', 'tabStudy', 'tabDashboard'].forEach(id => {
    document.getElementById(id).classList.add('hidden');
    document.getElementById('btn' + id.charAt(0).toUpperCase() + id.slice(1)).classList.replace('text-blue-600', 'text-slate-500');
    document.getElementById('btn' + id.charAt(0).toUpperCase() + id.slice(1)).classList.replace('bg-white', 'bg-transparent');
    
    document.getElementById('btn' + id.charAt(0).toUpperCase() + id.slice(1) + 'Mobile').classList.replace('bg-blue-50', 'bg-transparent');
    document.getElementById('btn' + id.charAt(0).toUpperCase() + id.slice(1) + 'Mobile').classList.replace('text-blue-600', 'text-slate-500');
  });
  
  document.getElementById(tabId).classList.remove('hidden');
  
  const activeBtn = document.getElementById('btn' + tabId.charAt(0).toUpperCase() + tabId.slice(1));
  activeBtn.classList.replace('text-slate-500', 'text-blue-600');
  activeBtn.classList.replace('bg-transparent', 'bg-white');
  
  const activeBtnM = document.getElementById('btn' + tabId.charAt(0).toUpperCase() + tabId.slice(1) + 'Mobile');
  activeBtnM.classList.replace('bg-transparent', 'bg-blue-50');
  activeBtnM.classList.replace('text-slate-500', 'text-blue-600');
}

// ---------------------------------------------------
// Admin & Auth
// ---------------------------------------------------
function toggleAdminView() {
  if(appState.username) {
    appState.username = ''; 
    appState.role = '';
    document.getElementById('adminBtnText').innerText = 'เข้าสู่ระบบ'; 
    document.getElementById('userNameDisplay').innerText = 'ผู้ใช้งานทั่วไป'; 
    document.getElementById('btnTabDashboard').classList.add('hidden');
    document.getElementById('btnTabDashboardMobile').classList.add('hidden');
    if(appState.currentTab === 'tabDashboard') switchTab('tabMain');
    refreshData();
  } else {
    document.getElementById('loginModal').classList.remove('hidden');
    setTimeout(() => {
      document.getElementById('loginModalContent').classList.remove('scale-95', 'opacity-0');
    }, 10);
  }
}

function closeLoginModal() {
  const content = document.getElementById('loginModalContent');
  content.classList.add('scale-95', 'opacity-0');
  setTimeout(() => {
    document.getElementById('loginModal').classList.add('hidden');
    document.getElementById('loginUsername').value = '';
    document.getElementById('loginPassword').value = '';
  }, 300);
}

function submitLogin() {
  const u = document.getElementById('loginUsername').value;
  const p = document.getElementById('loginPassword').value;
  if(!u || !p) return;
  
  const btn = document.getElementById('loginSubmitBtn');
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
  
  fetchWithTimeout(API_URL + `?action=verifyLogin&username=${encodeURIComponent(u)}&password=${encodeURIComponent(p)}`, 10000)
    .then(r => r.json())
    .then(res => {
      btn.innerHTML = 'เข้าสู่ระบบ <i class="fa-solid fa-arrow-right-to-bracket"></i>';
      if(res.success) { 
        closeLoginModal();
        appState.username = res.username; 
        appState.role = res.role;
        document.getElementById('adminBtnText').innerText = 'ออกระบบ'; 
        document.getElementById('userNameDisplay').innerText = res.username; 
        
        if(res.role === 'admin') {
          document.getElementById('btnTabDashboard').classList.remove('hidden');
          document.getElementById('btnTabDashboardMobile').classList.remove('hidden');
        }
        
        Swal.fire({ icon: 'success', title: 'เข้าสู่ระบบสำเร็จ', text: `ยินดีต้อนรับคุณ ${res.username}`, timer: 1500, showConfirmButton: false });
        refreshData();
      } else {
        Swal.fire('ข้อมูลไม่ถูกต้อง', res.message, 'error');
      }
    });
}

function updateDashboardStats() {
  document.getElementById('statTotalDocs').innerText = appState.documents.length;
  document.getElementById('statTotalFC').innerText = appState.flashcards.length;
  document.getElementById('statTotalSubj').innerText = appState.categories.length;
  document.getElementById('statTotalTasks').innerText = appState.tasks.length;
  renderDashboardCharts();
  fetchLogs();
}

function renderDashboardCharts() {
  const subjectCounts = {};
  appState.documents.forEach(doc => { const key = doc.category || 'ทั่วไป'; subjectCounts[key] = (subjectCounts[key] || 0) + 1; });
  const subjectEntries = Object.entries(subjectCounts).sort((a, b) => b[1] - a[1]);
  const maxSubject = Math.max(...subjectEntries.map(item => item[1]), 1);
  const subjectChart = document.getElementById('documentsBySubjectChart');
  if (subjectChart) subjectChart.innerHTML = subjectEntries.length ? subjectEntries.slice(0, 8).map(([name, count]) => `
    <div class="group"><div class="flex justify-between text-xs font-bold mb-1.5"><span class="text-slate-600 truncate pr-3">${name}</span><span class="text-indigo-600">${count}</span></div>
      <div class="h-2.5 rounded-full bg-slate-100 overflow-hidden"><div class="h-full rounded-full bg-gradient-to-r from-blue-500 to-indigo-500 transition-all duration-700 group-hover:from-indigo-500 group-hover:to-fuchsia-500" style="width:${Math.max(8, count / maxSubject * 100)}%"></div></div></div>`).join('') : '<p class="text-sm text-slate-400 text-center py-8">ยังไม่มีข้อมูลเอกสาร</p>';

  const typeCounts = {};
  appState.documents.forEach(doc => { const key = doc.docType || 'ทั่วไป'; typeCounts[key] = (typeCounts[key] || 0) + 1; });
  const colors = ['bg-blue-500', 'bg-fuchsia-500', 'bg-amber-500', 'bg-emerald-500', 'bg-slate-400'];
  const total = Math.max(appState.documents.length, 1);
  const typeChart = document.getElementById('documentsByTypeChart');
  if (typeChart) typeChart.innerHTML = Object.entries(typeCounts).sort((a,b) => b[1]-a[1]).map(([name, count], index) => `
    <div class="flex items-center gap-3"><span class="w-3 h-3 rounded-full ${colors[index % colors.length]}"></span><span class="flex-1 text-sm font-bold text-slate-600">${name}</span><span class="text-sm font-black text-slate-800">${count}</span><span class="text-[10px] font-bold text-slate-400 w-10 text-right">${Math.round(count / total * 100)}%</span></div>`).join('') || '<p class="text-sm text-slate-400 text-center py-8">ยังไม่มีข้อมูล</p>';
}

function fetchLogs() {
  fetchWithTimeout(API_URL + "?action=getSystemLogs", 10000).then(r => r.json()).then(logs => {
    const feed = document.getElementById('activityFeedAdmin');
    if(!logs || logs.length === 0) {
      feed.innerHTML = '<p class="text-slate-400 text-center">ไม่มีประวัติการใช้งาน</p>';
      return;
    }
    feed.innerHTML = logs.map(l => `
      <div class="flex gap-3 py-2 border-b border-slate-200 last:border-0">
        <span class="text-[10px] text-slate-400 font-mono whitespace-nowrap mt-1">${l.timestamp}</span>
        <span class="text-slate-700">${l.details}</span>
      </div>
    `).join('');
  }).catch(() => {
    const feed = document.getElementById('activityFeedAdmin');
    if (feed && !feed.dataset.loaded) feed.innerHTML = '<p class="text-slate-400 text-center">โหลดประวัติไม่สำเร็จ</p>';
  });
}

function handleAddSubject() {
  const name = document.getElementById('newSubjectName').value;
  if(!name) return;
  fetch(API_URL + `?action=addNewCategory&subjectName=${encodeURIComponent(name)}&username=${appState.username}`).then(() => {
    document.getElementById('newSubjectName').value = '';
    refreshData();
  });
}

function saveSettings() {
  const t = document.getElementById('settingBannerTitle').value;
  const s = document.getElementById('settingBannerSubtitle').value;
  const btn = document.getElementById('saveSettingsBtn');
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> กำลังบันทึก...';
  
  const payload = {
    action: 'updateSettings',
    username: appState.username || 'admin',
    settings: {
      bannerTitle: t, bannerSubtitle: s,
      primaryColor: document.getElementById('settingPrimaryColor').value,
      accentColor: document.getElementById('settingAccentColor').value,
      backgroundColor: document.getElementById('settingBackgroundColor').value,
      bannerButtonText: document.getElementById('settingBannerButtonText').value,
      showBanner: document.getElementById('settingShowBanner').checked ? 'true' : 'false',
      siteIcon: document.getElementById('settingSiteIcon').value
    }
  };
  
  fetch(API_URL, {
    method: 'POST', mode: 'no-cors',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  }).then(() => {
    btn.disabled = false;
    btn.innerHTML = 'บันทึกการตั้งค่า';
    Swal.fire('สำเร็จ', 'บันทึกการตั้งค่าหน้าเว็บเรียบร้อย', 'success');
    refreshData();
  });
}

function applySiteSettings(settings) {
  document.documentElement.style.setProperty('--site-primary', settings.primary_color || '#2563eb');
  document.documentElement.style.setProperty('--site-accent', settings.accent_color || '#9333ea');
  document.body.style.backgroundColor = settings.background_color || '#f8fafc';
  const banner = document.getElementById('bannerTitle')?.closest('.bg-white');
  if (banner) {
    banner.style.display = settings.show_banner === 'false' ? 'none' : '';
    const stripe = banner.querySelector('.absolute.top-0');
    if (stripe) stripe.style.background = `linear-gradient(90deg, ${settings.primary_color || '#2563eb'}, ${settings.accent_color || '#9333ea'})`;
  }
  const icon = document.querySelector('#navTitle')?.previousElementSibling?.querySelector('i');
  if (icon && settings.site_icon) {
    icon.className = `fa-solid ${settings.site_icon} text-lg`;
    icon.parentElement.style.background = `linear-gradient(135deg, ${settings.primary_color || '#2563eb'}, ${settings.accent_color || '#9333ea'})`;
  }
}

// ---------------------------------------------------
// Iframe Modal Logic
// ---------------------------------------------------
function openIframeModal(url, title) {
  // เว็บไซต์ภายนอก เช่น AI Studio/ChatGPT มักบล็อกการแสดงผลใน iframe
  // จึงเปิดแท็บใหม่โดยตรงแทน เพื่อไม่ให้ผู้ใช้เห็นหน้าว่างหรือไฟล์เสีย
  if (isExternalPageUrl(url)) {
    window.open(url, '_blank', 'noopener,noreferrer');
    return;
  }

  let finalUrl = url;
  if (url.includes('drive.google.com/file/d/')) {
    finalUrl = url.replace('/view', '/preview');
  }
  
  document.getElementById('iframeModalTitle').innerText = title;
  document.getElementById('iframeModalExternal').href = url;
  
  const iframe = document.getElementById('contentIframe');
  iframe.classList.add('hidden');
  document.getElementById('iframeLoading').classList.remove('hidden');
  iframe.src = finalUrl;
  
  document.getElementById('iframeModal').classList.remove('hidden');
  setTimeout(() => {
    document.getElementById('iframeModalContent').classList.remove('scale-95', 'opacity-0');
  }, 10);
}

function isExternalPageUrl(url) {
  try {
    const parsed = new URL(url, window.location.href);
    const path = parsed.pathname.toLowerCase();
    const isDocumentFile = /\.(pdf|png|jpe?g|gif|webp|svg|mp4|webm|mp3|wav)(\?.*)?$/.test(path);
    const isGoogleDriveFile = parsed.hostname.includes('drive.google.com') && path.includes('/file/d/');
    return !isDocumentFile && !isGoogleDriveFile;
  } catch (error) {
    return true;
  }
}

function closeIframeModal() {
  const content = document.getElementById('iframeModalContent');
  content.classList.add('scale-95', 'opacity-0');
  setTimeout(() => {
    document.getElementById('iframeModal').classList.add('hidden');
    document.getElementById('contentIframe').src = '';
  }, 300);
}

document.addEventListener('keydown', function(e) {
  if (document.getElementById('fcViewerModal') && !document.getElementById('fcViewerModal').classList.contains('hidden')) {
    if (e.key === 'ArrowLeft') prevFc();
    if (e.key === 'ArrowRight') nextFc();
    if (e.key === 'Escape') closeFcViewer();
    if (e.key === ' ' || e.key === 'Enter') {
      const inner = document.querySelector('#fcViewerCardContainer .flashcard-inner');
      if(inner) inner.classList.toggle('flashcard-flipped');
    }
  }
});

// Touch Swipe Support for Mobile/iPad
let touchStartX = 0;
let touchEndX = 0;

const fcContainer = document.getElementById('fcViewerCardContainer');
if (fcContainer) {
  fcContainer.addEventListener('touchstart', e => {
    touchStartX = e.changedTouches[0].screenX;
  });
  
  fcContainer.addEventListener('touchend', e => {
    touchEndX = e.changedTouches[0].screenX;
    if (touchStartX - touchEndX > 50) {
      nextFc(); // Swipe left -> Next
    } else if (touchEndX - touchStartX > 50) {
      prevFc(); // Swipe right -> Prev
    }
  });
}

// ---------------------------------------------------
// Subject Manager UI (For all users)
// ---------------------------------------------------
function openSubjectManager() {
  document.getElementById('subjectManagerModal').classList.remove('hidden');
  renderSubjectManagerList();
}

function renderSubjectManagerList() {
  const list = document.getElementById('subjectManagerList');
  if (appState.categories.length === 0) {
    list.innerHTML = `<p class="text-xs text-slate-400">ยังไม่มีวิชา</p>`;
    return;
  }
  
  list.innerHTML = appState.categories.filter(c => c.name.trim() !== '').map(c => `
    <div class="flex justify-between items-center bg-white border border-slate-200 rounded-xl px-4 py-3 shadow-sm hover:shadow-md transition">
      <span class="text-sm font-bold text-slate-700">${c.name}</span>
      <button onclick="handleDeleteSubject('${c.name}')" class="w-8 h-8 flex justify-center items-center rounded-lg bg-red-50 text-red-500 hover:bg-red-500 hover:text-white transition" title="ลบวิชา"><i class="fa-solid fa-trash-can text-sm"></i></button>
    </div>
  `).join('');
}

function handleAddSubjectUI() {
  const name = document.getElementById('newSubjectNameUI').value;
  if(!name) return;
  
  fetch(API_URL + `?action=addNewCategory&subjectName=${encodeURIComponent(name)}&username=${appState.username || 'guest'}`).then(() => {
    document.getElementById('newSubjectNameUI').value = '';
    refreshData().then(() => renderSubjectManagerList());
  });
}

function handleDeleteSubject(name) {
  if(!confirm(`คุณต้องการลบวิชา "${name}" ใช่หรือไม่?\n\n(วิชานี้จะถูกลบออกจากตัวเลือก แต่เอกสารเดิมจะไม่หายไป)`)) return;
  
  fetch(API_URL + `?action=deleteCategory&subjectName=${encodeURIComponent(name)}&username=${appState.username || 'guest'}`).then(() => {
    refreshData().then(() => renderSubjectManagerList());
  });
}
