import { ExamUpdateManager } from './client-exam-update.js';
import { StudentManager } from './client-students.js';
import { ExamManager } from './client-exams.js';
import { HistoryManager } from './client-history.js';
import { ReportManager } from './client-reports.js';

const API_BASE = 'https://smti.uk/peer/api';

// --- מודולים מעוצבים המחליפים את ה-Alert, Confirm, Prompt של הדפדפן ---
window.customAlert = function(message, isError = false) {
    return new Promise((resolve) => {
        const overlay = document.getElementById('customModalOverlay');
        document.getElementById('customModalIcon').innerHTML = isError ? '<i class="fas fa-times-circle" style="color:var(--danger);"></i>' : '<i class="fas fa-check-circle" style="color:var(--success);"></i>';
        document.getElementById('customModalTitle').innerText = isError ? 'שגיאה' : 'הודעת מערכת';
        document.getElementById('customModalMessage').innerText = message;
        document.getElementById('customModalInputContainer').classList.add('hidden');
        
        const btnContainer = document.getElementById('customModalButtons');
        btnContainer.innerHTML = '<button class="btn btn-primary" id="customModalOkBtn" style="min-width: 100px;">אישור</button>';
        
        overlay.classList.remove('hidden');
        
        document.getElementById('customModalOkBtn').onclick = () => {
            overlay.classList.add('hidden');
            resolve(true);
        };
    });
};

// פונקציה להצגת חלונית הודעה עם כפתור "קראתי"
window.showReadMessageModal = function(messageText) {
    const overlay = document.getElementById('customModalOverlay');
    document.getElementById('customModalIcon').innerHTML = '<i class="fas fa-info-circle" style="color:var(--primary-color);"></i>';
    document.getElementById('customModalTitle').innerText = 'הודעת מערכת';
    document.getElementById('customModalMessage').innerText = messageText;
    document.getElementById('customModalInputContainer').classList.add('hidden');
    
    const btnContainer = document.getElementById('customModalButtons');
    btnContainer.innerHTML = '<button class="btn btn-primary" id="msgReadBtn" style="min-width: 120px; justify-content: center;">קראתי</button>';
    
    overlay.classList.remove('hidden');
    
    document.getElementById('msgReadBtn').onclick = () => {
        overlay.classList.add('hidden');
    };
};

window.customConfirm = function(message) {
    return new Promise((resolve) => {
        const overlay = document.getElementById('customModalOverlay');
        document.getElementById('customModalIcon').innerHTML = '<i class="fas fa-question-circle" style="color:var(--warning);"></i>';
        document.getElementById('customModalTitle').innerText = 'אישור פעולה';
        document.getElementById('customModalMessage').innerText = message;
        document.getElementById('customModalInputContainer').classList.add('hidden');
        
        const btnContainer = document.getElementById('customModalButtons');
        btnContainer.innerHTML = `
            <button class="btn btn-outline" id="customModalCancelBtn" style="min-width: 80px;">ביטול</button>
            <button class="btn btn-primary" id="customModalConfirmBtn" style="min-width: 80px;">אישור</button>
        `;
        
        overlay.classList.remove('hidden');
        
        document.getElementById('customModalCancelBtn').onclick = () => {
            overlay.classList.add('hidden');
            resolve(false);
        };
        document.getElementById('customModalConfirmBtn').onclick = () => {
            overlay.classList.add('hidden');
            resolve(true);
        };
    });
};

window.customPrompt = function(message, defaultValue = '') {
    return new Promise((resolve) => {
        const overlay = document.getElementById('customModalOverlay');
        document.getElementById('customModalIcon').innerHTML = '<i class="fas fa-edit" style="color:var(--primary-color);"></i>';
        document.getElementById('customModalTitle').innerText = 'הזנת נתונים';
        document.getElementById('customModalMessage').innerText = message;
        document.getElementById('customModalInputContainer').classList.remove('hidden');
        const input = document.getElementById('customModalInput');
        input.value = defaultValue;
        
        const btnContainer = document.getElementById('customModalButtons');
        btnContainer.innerHTML = `
            <button class="btn btn-outline" id="customModalCancelBtn" style="flex:1;">ביטול</button>
            <button class="btn btn-primary" id="customModalConfirmBtn" style="flex:1;">שמור</button>
        `;
        
        overlay.classList.remove('hidden');
        setTimeout(() => input.focus(), 50);
        
        document.getElementById('customModalCancelBtn').onclick = () => {
            overlay.classList.add('hidden');
            resolve(null);
        };
        document.getElementById('customModalConfirmBtn').onclick = () => {
            const val = input.value;
            overlay.classList.add('hidden');
            resolve(val);
        };
    });
};

// --- מעטפת Fetch גלובלית ---
const originalFetch = window.fetch;
window.fetch = async function(...args) {
    let [resource, config] = args;
    if (typeof resource === 'string' && resource.startsWith(API_BASE)) {
        config = config || {};
        config.headers = config.headers || {};
        const key = localStorage.getItem('peer_api_key');
        if (key) {
            config.headers['x-api-key'] = key;
        }

        try {
            const response = await originalFetch(resource, config);
            if (!response.ok && resource.indexOf('/auth-check') === -1) { 
                response.clone().json().then(data => {
                    if (data && data.message) {
                        window.customAlert(data.message, true);
                    }
                }).catch(() => {});
            }
            return response;
        } catch (err) {
            throw err;
        }
    }
    return originalFetch(...args);
};


let allStudents = [];
let allExams = [];

let examManager;
let studentManager;
let examListManager;
let historyManager;
let reportManager;
let refreshAllData;

document.addEventListener('DOMContentLoaded', async () => {
    document.getElementById('loginBtn').addEventListener('click', performLogin);
    document.getElementById('logoutBtn').addEventListener('click', performLogout);
    
    const apiKeyInput = document.getElementById('apiKeyInput');
    apiKeyInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            performLogin();
        }
    });
    
    // אם ה-IP כבר מאושר בזיכרון, מדלגים על הבדיקה ונכנסים מיד
    if (localStorage.getItem('peer_ip_allowed') === 'true') {
        // מביאים נתונים ברקע כדי לעדכן את הסרגל העליון אם צריך
        fetchAuthAndSetupUI();
        await initApp();
    } else {
        await checkAuthAndInit();
    }
});

// פונקציה לעדכון הנתונים בסרגל העליון בהתאם לפרמטרים הנדרשים
function updateTopbarInfo(data) {
    const container = document.getElementById('topbar-info');
    if (!container) return;

    let html = '';

    // 1. שם מ-client_name או IP מ-client_ip
    const identifier = data.client_name || data.client_ip;
    if (identifier) {
        html += `<span class="topbar-badge"><i class="fas fa-user-circle"></i> ${identifier}</span>`;
    }

    // 2. אם is_key_valid מופיע כ"כן"
    if (data.is_key_valid === 'כן') {
        html += `<span class="topbar-badge"><i class="fas fa-key" style="color:var(--primary-color);"></i> התחברות באמצעות סיסמא</span>`;
    }

    // 3. רמת הרשאה (admin או read_only בבולט)
    if (data.access_level === 'admin') {
        html += `<span class="topbar-badge" style="color:var(--success); border-color:#a7f3d0; background:#ecfdf5;"><i class="fas fa-shield-alt"></i> הרשאה מלאה</span>`;
    } else if (data.access_level === 'read_only') {
        html += `<span class="topbar-badge" style="color:var(--warning); border-color:#fde68a; background:#fffbeb;"><strong>הרשאה לצפייה בלבד</strong></span>`;
    }

    container.innerHTML = html;

    // 4. אם קיים פרמטר message - הקפצת חלונית עם כפתור "קראתי"
    if (data.message && !window._hasShownServerMsg) {
        window._hasShownServerMsg = true;
        window.showReadMessageModal(data.message);
    }
}

async function fetchAuthAndSetupUI() {
    try {
        const response = await fetch(`${API_BASE}/auth-check`);
        if (response.ok) {
            const data = await response.json();
            updateTopbarInfo(data);
        }
    } catch(e) {}
}

async function checkAuthAndInit() {
    const authMessage = document.getElementById('authMessage');
    const apiKeyInput = document.getElementById('apiKeyInput');
    const loginBtn = document.getElementById('loginBtn');

    try {
        const response = await fetch(`${API_BASE}/auth-check`);
        const data = await response.json();

        if (data.is_authorized) {
            if (data.is_ip_allowed) {
                localStorage.setItem('peer_ip_allowed', 'true');
            }
            hideAuthOverlay();
            updateTopbarInfo(data);
            await initApp();
        } else {
            // ה-IP אינו מורשה - שמירת peer_ip_allowed לא קיימת, הצגת הודעת השרת בחלונית הסיסמה
            authMessage.innerText = data.message || 'כתובת ה-IP אינה מורשית, נדרשת סיסמה';
            
            apiKeyInput.disabled = false;
            loginBtn.disabled = false;
            loginBtn.innerHTML = '<span>כניסה למערכת</span> <i class="fas fa-arrow-left" style="margin-right: 8px;"></i>';
            apiKeyInput.focus();
            
            updateTopbarInfo(data);
        }
    } catch (e) {
        authMessage.innerText = 'שגיאת תקשורת בבדיקת הרשאות מול השרת.';
        apiKeyInput.disabled = false;
        loginBtn.disabled = false;
        loginBtn.innerHTML = '<span>כניסה למערכת</span> <i class="fas fa-arrow-left" style="margin-right: 8px;"></i>';
        apiKeyInput.focus();
    }
}

function hideAuthOverlay() {
    const overlay = document.getElementById('auth-overlay');
    overlay.style.opacity = '0';
    setTimeout(() => {
        overlay.style.display = 'none';
        overlay.style.opacity = '1';
    }, 300);
    document.getElementById('mainContainer').classList.remove('blurred-bg');
}

async function performLogin() {
    const key = document.getElementById('apiKeyInput').value.trim();
    if (!key) return;
    
    const btn = document.getElementById('loginBtn');
    const errDiv = document.getElementById('loginError');
    const errText = document.getElementById('loginErrorText');
    
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> <span>מאמת נתונים...</span>';
    btn.disabled = true;
    
    errDiv.classList.add('hidden');
    errDiv.style.animation = 'none';
    
    localStorage.setItem('peer_api_key', key);
    
    try {
        const response = await fetch(`${API_BASE}/auth-check`);
        const data = await response.json();

        if (data.is_authorized) {
            if (data.is_ip_allowed) {
                localStorage.setItem('peer_ip_allowed', 'true');
            }
            
            hideAuthOverlay();
            updateTopbarInfo(data);
            await initApp();
        } else {
            errText.innerText = data.message || 'סיסמה שגויה, נסה שוב.';
            errDiv.classList.remove('hidden');
            setTimeout(() => { errDiv.style.animation = ''; }, 10);
            
            localStorage.removeItem('peer_api_key');
            document.getElementById('apiKeyInput').value = '';
            document.getElementById('apiKeyInput').focus();
        }
    } catch (e) {
        errText.innerText = 'שגיאת תקשורת עם השרת.';
        errDiv.classList.remove('hidden');
    } finally {
        btn.innerHTML = '<span>כניסה למערכת</span> <i class="fas fa-arrow-left" style="margin-right: 8px;"></i>';
        btn.disabled = false;
    }
}

function performLogout() {
    localStorage.removeItem('peer_api_key');
    localStorage.removeItem('peer_ip_allowed'); 
    location.reload();
}

async function initApp() {
    refreshAllData = async () => {
        await Promise.all([fetchStudentsList(), fetchExamsList()]);
        if(examManager) examManager.setExams(allExams);
        if(studentManager) studentManager.render(allStudents);
        if(examListManager) examListManager.render(allExams);
        if(reportManager) reportManager.setStudents(allStudents);
        if(historyManager) historyManager.loadAndRender(allStudents, allExams);
    };

    examManager = new ExamUpdateManager(API_BASE, document.getElementById('student-portal'), onSwitchStudent);
    studentManager = new StudentManager(document.getElementById('view-students'), API_BASE, goToStudentUpdate, refreshAllData);
    examListManager = new ExamManager(document.getElementById('view-exams'));
    historyManager = new HistoryManager(document.getElementById('view-history'), API_BASE);
    reportManager = new ReportManager(document.getElementById('view-reports'), API_BASE);
    
    setupTabs();
    setupSearchBox();
    await refreshAllData();
}

function setupTabs() {
    const menuItems = document.querySelectorAll('.menu-item:not(#logoutBtn)');
    const views = document.querySelectorAll('.view-section');

    menuItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const targetId = item.getAttribute('data-target');
            
            menuItems.forEach(mi => mi.classList.remove('active'));
            item.classList.add('active');

            views.forEach(view => {
                if (view.id === targetId) {
                    view.classList.remove('hidden');
                    view.classList.add('active');
                    if (targetId === 'view-history') historyManager.loadAndRender(allStudents, allExams);
                } else {
                    view.classList.add('hidden');
                    view.classList.remove('active');
                }
            });
        });
    });
}

function goToStudentUpdate(studentCode) {
    document.querySelector('[data-target="view-update"]').click();
    document.getElementById('studentSearch').value = '';
    document.getElementById('search-section').classList.add('hidden');
    examManager.loadStudentData(studentCode);
}

async function fetchStudentsList() {
    try {
        const response = await fetch(`${API_BASE}/students?full_details=true`);
        if(response.ok) allStudents = await response.json();
    } catch(error) {
        console.error('שגיאה בטעינת תלמידים:', error);
    }
}

async function fetchExamsList() {
    try {
        const response = await fetch(`${API_BASE}/exams`);
        if(response.ok) allExams = await response.json();
    } catch(error) {
        console.error('שגיאה בטעינת מבחנים:', error);
    }
}

function setupSearchBox() {
    const searchInput = document.getElementById('studentSearch');
    const resultsDropdown = document.getElementById('searchResults');

    searchInput.addEventListener('input', (e) => {
        const term = e.target.value.trim();
        if(term.length === 0) {
            resultsDropdown.innerHTML = '';
            resultsDropdown.classList.add('hidden');
            return;
        }

        const filtered = allStudents.filter(s => 
            s.student_code.includes(term) || 
            s.first_name.includes(term) || 
            s.last_name.includes(term) ||
            `${s.first_name} ${s.last_name}`.includes(term)
        );

        resultsDropdown.innerHTML = '';
        if(filtered.length === 0) {
            resultsDropdown.innerHTML = '<div style="padding:10px;text-align:center;">לא נמצאו תלמידים</div>';
        } else {
            filtered.forEach(student => {
                const item = document.createElement('div');
                item.className = 'search-result-item';
                item.innerHTML = `
                    <div>
                        <span class="result-name">${student.first_name} ${student.last_name}</span>
                        <span class="result-class">כיתה ${student.class_grade || '-'}</span>
                    </div>
                    <div class="result-code">${student.student_code}</div>
                `;
                
                item.addEventListener('click', () => {
                    searchInput.value = '';
                    resultsDropdown.classList.add('hidden');
                    document.getElementById('search-section').classList.add('hidden');
                    examManager.loadStudentData(student.student_code);
                });
                resultsDropdown.appendChild(item);
            });
        }
        resultsDropdown.classList.remove('hidden');
    });

    document.addEventListener('click', (e) => {
        if(!searchInput.contains(e.target) && !resultsDropdown.contains(e.target)) {
            resultsDropdown.classList.add('hidden');
        }
    });
}

function onSwitchStudent() {
    document.getElementById('student-portal').classList.add('hidden');
    document.getElementById('search-section').classList.remove('hidden');
    document.getElementById('studentSearch').value = '';
    document.getElementById('studentSearch'].focus();
}
