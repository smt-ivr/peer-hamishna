import { ExamUpdateManager } from './client-exam-update.js';
import { StudentManager } from './client-students.js';
import { ExamManager } from './client-exams.js';
import { HistoryManager } from './client-history.js';
import { ReportManager } from './client-reports.js';

const API_BASE = 'https://smti.uk/peer/api';

// --- מערכת הודעות (Modals) מעוצבת תחליף ל-Alert, Confirm, Prompt ---
window.showCustomAlert = function(message, isError = false) {
    return new Promise((resolve) => {
        const overlay = document.getElementById('customAlertOverlay');
        document.getElementById('customAlertIcon').innerHTML = isError ? '<i class="fas fa-times-circle text-danger"></i>' : '<i class="fas fa-check-circle text-success" style="color:#10b981;"></i>';
        document.getElementById('customAlertTitle').innerText = isError ? 'שגיאת מערכת' : 'הודעת מערכת';
        document.getElementById('customAlertMessage').innerText = message;
        
        const btnContainer = document.getElementById('customAlertButtons');
        btnContainer.innerHTML = '<button class="btn btn-primary" id="customAlertOkBtn" style="min-width: 120px;">הבנתי</button>';
        
        overlay.classList.remove('hidden');
        document.getElementById('customAlertOkBtn').focus();
        
        document.getElementById('customAlertOkBtn').onclick = () => {
            overlay.classList.add('hidden');
            resolve(true);
        };
    });
};

window.showCustomConfirm = function(message) {
    return new Promise((resolve) => {
        const overlay = document.getElementById('customAlertOverlay');
        document.getElementById('customAlertIcon').innerHTML = '<i class="fas fa-question-circle text-warning"></i>';
        document.getElementById('customAlertTitle').innerText = 'אישור פעולה';
        document.getElementById('customAlertMessage').innerText = message;
        
        const btnContainer = document.getElementById('customAlertButtons');
        btnContainer.innerHTML = `
            <button class="btn btn-outline" id="customAlertCancelBtn" style="min-width: 100px;">ביטול</button>
            <button class="btn btn-primary" id="customAlertConfirmBtn" style="min-width: 100px;">אישור</button>
        `;
        
        overlay.classList.remove('hidden');
        
        document.getElementById('customAlertCancelBtn').onclick = () => {
            overlay.classList.add('hidden');
            resolve(false);
        };
        document.getElementById('customAlertConfirmBtn').onclick = () => {
            overlay.classList.add('hidden');
            resolve(true);
        };
    });
};

window.showCustomPrompt = function(message, defaultValue = '') {
    return new Promise((resolve) => {
        const overlay = document.getElementById('customAlertOverlay');
        document.getElementById('customAlertIcon').innerHTML = '<i class="fas fa-edit text-primary"></i>';
        document.getElementById('customAlertTitle').innerText = 'הזנת נתונים';
        document.getElementById('customAlertMessage').innerText = message;
        
        const btnContainer = document.getElementById('customAlertButtons');
        btnContainer.innerHTML = `
            <div style="width: 100%; display: flex; flex-direction: column; gap: 15px;">
                <input type="text" id="customPromptInput" class="exam-code-input" value="${defaultValue}" style="width: 100%; text-align: center; border: 2px solid var(--border-color); font-weight: bold; font-size: 1.1rem;">
                <div style="display: flex; gap: 10px; justify-content: center;">
                    <button class="btn btn-outline" id="customAlertCancelBtn" style="flex: 1;">ביטול</button>
                    <button class="btn btn-primary" id="customAlertConfirmBtn" style="flex: 1;">אישור ושמירה</button>
                </div>
            </div>
        `;
        
        overlay.classList.remove('hidden');
        setTimeout(() => document.getElementById('customPromptInput').focus(), 50);
        
        document.getElementById('customAlertCancelBtn').onclick = () => {
            overlay.classList.add('hidden');
            resolve(null);
        };
        document.getElementById('customAlertConfirmBtn').onclick = () => {
            const val = document.getElementById('customPromptInput').value;
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
            if (!response.ok && resource.indexOf('/auth-check') === -1) { // לא נקפיץ הודעה על בדיקת הרשאות ראשונית
                response.clone().json().then(data => {
                    if (data && data.message) {
                        window.showCustomAlert(data.message, true);
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
    await checkAuthAndInit();
});

async function checkAuthAndInit() {
    // אם ה-IP אושר ב-Session הנוכחי, נדלג על הבדיקה כדי לחסוך קריאות ולזרז את המערכת
    if (sessionStorage.getItem('peer_ip_allowed') === 'true') {
        document.getElementById('auth-overlay').classList.add('hidden');
        await initApp();
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/auth-check`);
        const data = await response.json();

        if (data.is_authorized) {
            if (data.is_ip_allowed) {
                sessionStorage.setItem('peer_ip_allowed', 'true');
            }
            document.getElementById('auth-overlay').classList.add('hidden');
            document.getElementById('loginError').style.display = 'none';
            await initApp();
        } else {
            document.getElementById('auth-overlay').classList.remove('hidden');
            document.getElementById('authMessage').innerText = 'כתובת ה-IP אינה מורשית, נדרשת סיסמה';
            if (data.message) {
                const errDiv = document.getElementById('loginError');
                errDiv.innerText = data.message;
                errDiv.style.display = 'block';
            }
        }
    } catch (e) {
        document.getElementById('auth-overlay').classList.remove('hidden');
        document.getElementById('loginError').innerText = 'שגיאת תקשורת בבדיקת ההרשאות.';
        document.getElementById('loginError').style.display = 'block';
    }
}

async function performLogin() {
    const key = document.getElementById('apiKeyInput').value.trim();
    if (!key) return;
    
    const btn = document.getElementById('loginBtn');
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> מאמת נתונים...';
    btn.disabled = true;
    
    localStorage.setItem('peer_api_key', key);
    await checkAuthAndInit();
    
    btn.innerHTML = 'המשך למערכת';
    btn.disabled = false;
}

function performLogout() {
    localStorage.removeItem('peer_api_key');
    sessionStorage.removeItem('peer_ip_allowed');
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
            resultsDropdown.innerHTML = '<div style="padding:15px;text-align:center;color:var(--text-muted);">לא נמצאו תלמידים</div>';
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
    document.getElementById('studentSearch').focus();
}
