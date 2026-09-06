import { ExamUpdateManager } from './client-exam-update.js';
import { StudentManager } from './client-students.js';
import { ExamManager } from './client-exams.js';
import { HistoryManager } from './client-history.js';
import { ReportManager } from './client-reports.js';

const API_BASE = 'https://smti.uk/peer/api';

// --- מעטפת Fetch גלובלית לטיפול ב-API Key ושגיאות השרת ---
const originalFetch = window.fetch;
window.fetch = async function(...args) {
    let [resource, config] = args;
    if (typeof resource === 'string' && resource.startsWith(API_BASE)) {
        config = config || {};
        config.headers = config.headers || {};
        
        // הוספת מפתח אימות אם קיים
        const key = localStorage.getItem('peer_api_key');
        if (key) {
            config.headers['x-api-key'] = key;
        }

        try {
            const response = await originalFetch(resource, config);
            
            // תפיסת שגיאות וקריאת הודעת השרת להקפצת Toast בכל המערכת
            if (!response.ok) {
                response.clone().json().then(data => {
                    if (data && data.message) {
                        showGlobalToast(data.message);
                    }
                }).catch(() => {}); // התעלמות אם לא הוחזר JSON
            }
            return response;
        } catch (err) {
            throw err;
        }
    }
    return originalFetch(...args);
};

// פונקציית הודעות שגיאה גלובלית 
function showGlobalToast(message) {
    const toast = document.createElement('div');
    toast.className = 'global-toast';
    toast.innerHTML = `<i class="fas fa-exclamation-circle"></i> <span>${message}</span>`;
    document.body.appendChild(toast);
    setTimeout(() => {
        toast.classList.add('fade-out');
        setTimeout(() => toast.remove(), 300);
    }, 5000);
}

let allStudents = [];
let allExams = [];

let examManager;
let studentManager;
let examListManager;
let historyManager;
let reportManager;
let refreshAllData;

document.addEventListener('DOMContentLoaded', async () => {
    
    // אירועי התחברות והתנתקות
    document.getElementById('loginBtn').addEventListener('click', performLogin);
    document.getElementById('logoutBtn').addEventListener('click', performLogout);

    // בדיקת אימות מול השרת לפני טעינת שאר הנתונים
    await checkAuthAndInit();
});

async function checkAuthAndInit() {
    try {
        const response = await fetch(`${API_BASE}/auth-check`);
        const data = await response.json();

        if (data.is_authorized) {
            document.getElementById('auth-overlay').classList.add('hidden');
            document.getElementById('loginError').style.display = 'none';
            await initApp();
        } else {
            document.getElementById('auth-overlay').classList.remove('hidden');
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
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> בודק...';
    btn.disabled = true;
    
    localStorage.setItem('peer_api_key', key);
    await checkAuthAndInit();
    
    btn.innerHTML = 'כניסה למערכת';
    btn.disabled = false;
}

function performLogout() {
    localStorage.removeItem('peer_api_key');
    location.reload();
}

async function initApp() {
    // פונקציית רענון גלובלית שנקראת מתוך רכיבים לאחר ביצוע שינוי בשרת
    refreshAllData = async () => {
        await Promise.all([fetchStudentsList(), fetchExamsList()]);
        if(examManager) examManager.setExams(allExams);
        if(studentManager) studentManager.render(allStudents);
        if(examListManager) examListManager.render(allExams);
        if(reportManager) reportManager.setStudents(allStudents);
        if(historyManager) historyManager.loadAndRender(allStudents, allExams);
    };

    // אתחול המנהלים
    examManager = new ExamUpdateManager(API_BASE, document.getElementById('student-portal'), onSwitchStudent);
    studentManager = new StudentManager(document.getElementById('view-students'), API_BASE, goToStudentUpdate, refreshAllData);
    examListManager = new ExamManager(document.getElementById('view-exams'));
    historyManager = new HistoryManager(document.getElementById('view-history'), API_BASE);
    reportManager = new ReportManager(document.getElementById('view-reports'), API_BASE);
    
    setupTabs();
    setupSearchBox();

    // טעינת נתונים ראשונית בעליית האתר
    await refreshAllData();
}

function setupTabs() {
    const menuItems = document.querySelectorAll('.menu-item:not(#logoutBtn)');
    const views = document.querySelectorAll('.view-section');

    menuItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const targetId = item.getAttribute('data-target');
            
            // עדכון כפתורים פעילים
            menuItems.forEach(mi => mi.classList.remove('active'));
            item.classList.add('active');

            // החלפת תצוגות
            views.forEach(view => {
                if (view.id === targetId) {
                    view.classList.remove('hidden');
                    view.classList.add('active');
                    
                    if (targetId === 'view-history') {
                        historyManager.loadAndRender(allStudents, allExams);
                    }
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
        if(response.ok) {
            allStudents = await response.json();
        }
    } catch(error) {
        console.error('שגיאה בטעינת תלמידים:', error);
    }
}

async function fetchExamsList() {
    try {
        const response = await fetch(`${API_BASE}/exams`);
        if(response.ok) {
            allExams = await response.json();
        }
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
    document.getElementById('studentSearch').focus();
}
