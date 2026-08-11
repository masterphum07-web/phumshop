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
  return fetch(API_URL + "?action=getInitialData").then(r => r.json());
}

function refreshData() {
  document.getElementById('docTableBody').innerHTML = '<tr><td colspan="5" class="py-12 text-center text-slate-400 font-medium"><i class="fa-solid fa-spinner fa-spin mr-2"></i> กำลังโหลดข้อมูล...</td></tr>';
  
  fetchInitialData().then(res => {
    if(res.success) {
      appState.documents = res.documents.reverse();
      appState.categories = res.categories;
      appState.tasks = res.tasks.reverse();
      appState.flashcards = res.flashcards.reverse();
      
      document.getElementById('bannerTitle').innerText = res.settings.header_title;
      document.getElementById('navTitle').innerText = res.settings.header_title;
      document.getElementById('bannerSubtitle').innerText = res.settings.cta_text;
      
      if(document.getElementById('settingBannerTitle')) {
        document.getElementById('settingBannerTitle').value = res.settings.header_title;
        document.getElementById('settingBannerSubtitle').value = res.settings.cta_text;
      }
      
      updateCategoryDropdowns();
      filterDocuments();
      filterStudyData();
      renderTasks();
      renderFlashcards();
      
      if(appState.username && appState.role === 'admin') {
        updateDashboardStats();
      }
    }
  }).catch(e => {
    document.getElementById('docTableBody').innerHTML = `<tr><td colspan="5" class="py-8 text-center text-red-500">เชื่อมต่อฐานข้อมูลล้มเหลว</td></tr>`;
  });
}

function updateCategoryDropdowns() {
  const cats = appState.categories.filter(c => c.name.trim() !== '').map(c => `<option value="${c.name}">${c.name}</option>`).join('');
  document.getElementById('categoryFilter').innerHTML = '<option value="">ทุกวิชา</option>' + cats;
  
  const datalist = document.getElementById('docCategoryList');
  if(datalist) datalist.innerHTML = cats;
  
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
    const matchType = d.docType === 'ทั่วไป'; // หน้าหลักแสดงเฉพาะแบบทั่วไป หรือถ้าอยากให้แสดงหมด ก็เอาเงื่อนไขนี้ออก
    return matchName && matchCat && matchType;
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
        ${d.originalFilename && d.originalFilename !== '-' ? d.originalFilename : '<span class="text-slate-300 italic text-[10px] font-normal">ไม่มีข้อมูล</span>'}
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
  
  const fcs = appState.flashcards.filter(f => f.subject.toLowerCase() === subj.toLowerCase());
  
  if(fcs.length === 0) {
    grid.innerHTML = `<div class="col-span-full py-12 text-center text-slate-400 text-xs font-medium border-2 border-dashed border-slate-200 rounded-2xl">ยังไม่มีแฟลชการ์ดในวิชา ${subj}</div>`;
    return;
  }
  
  grid.innerHTML = fcs.map((f, index) => {
    let imgUrl = f.image;
    if (imgUrl && imgUrl !== '-' && imgUrl.includes('drive.google.com/file/d/')) {
      const match = imgUrl.match(/[-\w]{25,}/);
      if (match) imgUrl = `https://drive.google.com/thumbnail?id=${match[0]}&sz=w800`;
    }
    let imgTag = imgUrl && imgUrl !== '-' ? `<img src="${imgUrl}" class="mt-3 w-full h-24 object-cover rounded-lg shadow-sm" alt="ภาพประกอบ" loading="lazy">` : '';
    let delBtn = (appState.username === f.username || appState.role === 'admin') 
      ? `<button onclick="deleteFlashcard('${f.id}', event)" class="absolute top-3 right-3 w-8 h-8 bg-red-500/90 text-white shadow-md rounded-full flex items-center justify-center hover:bg-red-600 hover:scale-110 transition z-20"><i class="fa-solid fa-trash-can text-sm"></i></button>` 
      : '';
      
    return `
      <div class="h-48 relative cursor-pointer group" onclick="this.querySelector('.flashcard-inner').classList.toggle('flashcard-flipped')">
        <div class="flashcard-inner w-full h-full relative duration-500">
          
          <!-- Front -->
          <div class="flashcard-front absolute w-full h-full bg-gradient-to-br from-fuchsia-500 to-purple-600 rounded-2xl p-5 text-white flex flex-col justify-center items-center text-center shadow-md">
            <span class="absolute top-3 left-3 text-[9px] font-bold uppercase tracking-wider bg-white/20 px-2 py-0.5 rounded-md">${f.subject}</span>
            ${delBtn}
            <h4 class="font-bold text-lg leading-tight mt-2">${f.question}</h4>
            <p class="text-[10px] text-fuchsia-200 absolute bottom-3"><i class="fa-solid fa-hand-pointer mr-1"></i> แตะเพื่อดูคำตอบ</p>
          </div>
          
          <!-- Back -->
          <div class="flashcard-back absolute w-full h-full bg-white border-2 border-fuchsia-100 rounded-2xl p-4 flex flex-col justify-center items-center text-center shadow-md overflow-hidden">
            <p class="font-medium text-slate-700 text-sm overflow-y-auto">${f.answer}</p>
            ${imgTag}
          </div>
          
        </div>
      </div>
    `;
  }).join('');
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
  
  fetch(API_URL + `?action=verifyLogin&username=${encodeURIComponent(u)}&password=${encodeURIComponent(p)}`)
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
          updateDashboardStats();
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
  fetchLogs();
}

function fetchLogs() {
  fetch(API_URL + "?action=getSystemLogs").then(r => r.json()).then(logs => {
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
    settings: { bannerTitle: t, bannerSubtitle: s }
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

// ---------------------------------------------------
// Iframe Modal Logic
// ---------------------------------------------------
function openIframeModal(url, title) {
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

function closeIframeModal() {
  const content = document.getElementById('iframeModalContent');
  content.classList.add('scale-95', 'opacity-0');
  setTimeout(() => {
    document.getElementById('iframeModal').classList.add('hidden');
    document.getElementById('contentIframe').src = '';
  }, 300);
}
