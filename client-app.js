import { ExamUpdateManager } from './client-exam-update.js';
import { StudentManager } from './client-students.js';
import { ExamManager } from './client-exams.js';
import { HistoryManager } from './client-history.js';
import { ReportManager } from './client-reports.js';
import { DashboardManager } from './client-dashboard.js';
import { AdminManager } from './client-admin.js';

const API_BASE = 'https://smti.uk/peer/api';

// --- מערכת הודעות: טוסטים (הצלחה / שגיאה / אזהרה / מידע) + חלונות אישור ---
// ה-API נשאר זהה: customAlert(msg, isError) · customConfirm(msg) · customPrompt(msg, default) · showReadMessageModal(msg)
// חדש: window.notify(msg, type, { title, duration, actionLabel, onAction })
(function setupNotifications() {
    const svg = (inner) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
    const ICONS = {
        success: svg('<path d="M5 12.5l4.2 4.2L19 7"/>'),
        error: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
        warning: svg('<path d="M12 3.5l9.5 16.5h-19z"/><path d="M12 10v4.5"/><path d="M12 17.4v.01"/>'),
        info: svg('<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5"/><path d="M12 7.6v.01"/>'),
        question: svg('<circle cx="12" cy="12" r="9"/><path d="M9.4 9.6a2.6 2.6 0 1 1 3.7 2.3c-.8.4-1.1.9-1.1 1.8"/><path d="M12 17.2v.01"/>'),
        edit: svg('<path d="M4 20h4l10.5-10.5-4-4L4 16v4z"/><path d="M13.5 6.5l4 4"/>')
    };
    const TITLES = { success: 'בוצע בהצלחה', error: 'שגיאה', warning: 'שימו לב', info: 'הודעה' };
    const BASE_MS = { success: 4000, info: 5000, warning: 7000, error: 9000 };
    const MAX_VISIBLE = 4;

    const css = `
    #ntfStack { position: fixed; top: 16px; left: 50%; transform: translateX(-50%); width: min(440px, calc(100vw - 24px)); display: flex; flex-direction: column; gap: 10px; z-index: 10050; pointer-events: none; direction: rtl; }
    .ntf, .ntf-dicon { --c: #2563eb; --bg: #dbeafe; }
    .ntf.success, .ntf-dicon.success { --c: #059669; --bg: #d1fae5; }
    .ntf.error, .ntf-dicon.error { --c: #dc2626; --bg: #fee2e2; }
    .ntf.warning, .ntf-dicon.warning { --c: #d97706; --bg: #fef3c7; }
    .ntf { pointer-events: auto; position: relative; display: flex; gap: 12px; align-items: flex-start; background: #fff; border: 1px solid #e2e8f0; border-radius: 14px; padding: 13px 16px 16px 12px; box-shadow: 0 12px 32px rgba(15,23,42,.18), 0 2px 6px rgba(15,23,42,.08); overflow: hidden; animation: ntfIn .3s cubic-bezier(.2,.9,.3,1.2); }
    .ntf::before { content: ''; position: absolute; top: 0; bottom: 0; right: 0; width: 5px; background: var(--c); }
    .ntf.out { animation: ntfOut .2s ease-in forwards; }
    .ntf-ico { flex: none; width: 34px; height: 34px; border-radius: 50%; background: var(--bg); color: var(--c); display: flex; align-items: center; justify-content: center; margin-right: 4px; }
    .ntf-ico svg { width: 18px; height: 18px; }
    .ntf-body { flex: 1; min-width: 0; }
    .ntf-title { font-weight: 800; font-size: .92rem; color: #0f172a; display: flex; align-items: center; gap: 8px; }
    .ntf-count { background: var(--c); color: #fff; border-radius: 99px; font-size: .7rem; padding: 0 7px; line-height: 18px; font-weight: 700; }
    .ntf-msg { margin-top: 2px; font-size: .86rem; color: #475569; line-height: 1.5; white-space: pre-line; word-break: break-word; }
    .ntf-actions { margin-top: 9px; display: flex; gap: 8px; }
    .ntf-action { border: none; background: var(--bg); color: var(--c); font-weight: 800; font-size: .82rem; padding: 5px 14px; border-radius: 8px; cursor: pointer; }
    .ntf-action:hover { filter: brightness(.95); }
    .ntf-x { flex: none; border: none; background: none; color: #94a3b8; font-size: 1.25rem; line-height: 1; cursor: pointer; padding: 2px 6px; border-radius: 6px; }
    .ntf-x:hover { background: #f1f5f9; color: #475569; }
    .ntf-bar { position: absolute; bottom: 0; right: 0; left: 0; height: 3px; background: rgba(15,23,42,.05); }
    .ntf-bar i { display: block; height: 100%; background: var(--c); transform-origin: right; animation: ntfBar linear forwards; }
    .ntf.paused .ntf-bar i { animation-play-state: paused; }
    @keyframes ntfIn { from { opacity: 0; transform: translateY(-14px) scale(.96); } to { opacity: 1; transform: none; } }
    @keyframes ntfOut { to { opacity: 0; transform: translateY(-10px) scale(.96); } }
    @keyframes ntfBar { from { transform: scaleX(1); } to { transform: scaleX(0); } }
    @keyframes ntfPop { from { opacity: 0; transform: scale(.92) translateY(8px); } to { opacity: 1; transform: none; } }

    /* חלונות אישור / הזנה (אותו overlay שקיים ב-index.html) */
    #customModalOverlay { backdrop-filter: blur(3px); -webkit-backdrop-filter: blur(3px); }
    #customModalOverlay .modal-content { max-width: 420px !important; border-radius: 18px !important; padding: 28px 26px 22px !important; box-shadow: 0 24px 60px rgba(15,23,42,.3) !important; }
    #customModalOverlay:not(.hidden) .modal-content { animation: ntfPop .2s cubic-bezier(.2,.9,.3,1.2); }
    .ntf-dicon { width: 60px; height: 60px; border-radius: 50%; margin: 0 auto 12px; display: flex; align-items: center; justify-content: center; background: var(--bg); color: var(--c); }
    .ntf-dicon svg { width: 30px; height: 30px; }
    #customModalTitle { font-size: 1.15rem !important; font-weight: 800; color: #0f172a; }
    #customModalMessage { white-space: pre-line; line-height: 1.55; }
    #customModalButtons .btn { height: 38px; border-radius: 10px; font-weight: 700; min-width: 96px; justify-content: center; }
    #customModalButtons .ntf-danger { background: #dc2626; color: #fff; }
    #customModalButtons .ntf-danger:hover { background: #b91c1c; }
    @media (prefers-reduced-motion: reduce) { .ntf, .ntf.out, #customModalOverlay:not(.hidden) .modal-content, .ntf-bar i { animation: none; } }`;
    const style = document.createElement('style');
    style.id = 'ntfStyles';
    style.textContent = css;
    document.head.appendChild(style);

    // ---------- טוסטים ----------
    const live = new Map();   // key -> toast state

    function getStack() {
        let st = document.getElementById('ntfStack');
        if (!st) {
            st = document.createElement('div');
            st.id = 'ntfStack';
            st.setAttribute('aria-live', 'polite');
            document.body.appendChild(st);
        }
        return st;
    }

    function closeToast(t) {
        if (t.closed) return;
        t.closed = true;
        clearTimeout(t.timer);
        live.delete(t.key);
        t.el.classList.add('out');
        setTimeout(() => t.el.remove(), 200);
    }

    function armTimer(t) {
        if (!t.duration) return;
        clearTimeout(t.timer);
        t.startedAt = Date.now();
        t.timer = setTimeout(() => closeToast(t), t.remaining);
        const bar = t.el.querySelector('.ntf-bar i');
        bar.style.animation = 'none';
        void bar.offsetWidth;                       // מאתחל את האנימציה
        bar.style.animation = '';
        bar.style.animationDuration = t.remaining + 'ms';
        t.el.classList.remove('paused');
    }

    window.notify = function (message, type = 'info', opts = {}) {
        if (!ICONS[type] || type === 'question' || type === 'edit') type = 'info';
        message = String(message ?? '');
        const key = `${type}|${message}`;
        const existing = live.get(key);

        // אותה הודעה שוב ושוב → מונה במקום ערימה
        if (existing && !opts.actionLabel) {
            existing.count++;
            let badge = existing.el.querySelector('.ntf-count');
            if (!badge) {
                badge = document.createElement('span');
                badge.className = 'ntf-count';
                existing.el.querySelector('.ntf-title').appendChild(badge);
            }
            badge.textContent = '×' + existing.count;
            existing.remaining = existing.duration;
            armTimer(existing);
            return { close: () => closeToast(existing) };
        }

        const duration = opts.duration !== undefined ? opts.duration : Math.min(14000, BASE_MS[type] + message.length * 35);
        const el = document.createElement('div');
        el.className = `ntf ${type}`;
        el.setAttribute('role', type === 'error' || type === 'warning' ? 'alert' : 'status');

        const ico = document.createElement('div'); ico.className = 'ntf-ico'; ico.innerHTML = ICONS[type];
        const body = document.createElement('div'); body.className = 'ntf-body';
        const title = document.createElement('div'); title.className = 'ntf-title'; title.textContent = opts.title || TITLES[type];
        const msg = document.createElement('div'); msg.className = 'ntf-msg'; msg.textContent = message;
        body.append(title, msg);

        const t = { key, el, count: 1, duration, remaining: duration, closed: false };

        if (opts.actionLabel) {
            const actions = document.createElement('div'); actions.className = 'ntf-actions';
            const a = document.createElement('button'); a.type = 'button'; a.className = 'ntf-action'; a.textContent = opts.actionLabel;
            a.onclick = () => { closeToast(t); if (opts.onAction) opts.onAction(); };
            actions.appendChild(a);
            body.appendChild(actions);
        }

        const x = document.createElement('button'); x.type = 'button'; x.className = 'ntf-x'; x.setAttribute('aria-label', 'סגור'); x.textContent = '×';
        x.onclick = () => closeToast(t);
        el.append(ico, body, x);

        if (duration) {
            const bar = document.createElement('div'); bar.className = 'ntf-bar'; bar.innerHTML = '<i></i>';
            el.appendChild(bar);
            el.addEventListener('mouseenter', () => {
                if (t.closed) return;
                clearTimeout(t.timer);
                t.remaining = Math.max(600, t.remaining - (Date.now() - t.startedAt));
                el.classList.add('paused');
            });
            el.addEventListener('mouseleave', () => {
                if (t.closed) return;
                t.startedAt = Date.now();
                clearTimeout(t.timer);
                t.timer = setTimeout(() => closeToast(t), t.remaining);
                el.classList.remove('paused');
            });
        }

        const stack = getStack();
        stack.appendChild(el);
        live.set(key, t);
        while (stack.children.length > MAX_VISIBLE) {          // לא מציפים את המסך
            const oldest = [...live.values()].find(x2 => x2.el === stack.firstElementChild);
            if (oldest) closeToast(oldest); else stack.firstElementChild.remove();
        }
        if (duration) armTimer(t);
        return { close: () => closeToast(t) };
    };

    // ---------- חלונות אישור / הזנה (תור — חלון אחד בכל רגע) ----------
    let chain = Promise.resolve();

    function openDialog({ type, icon, title, message, input, buttons, focusCancel }) {
        const run = () => new Promise((resolve) => {
            const $ = (id) => document.getElementById(id);
            const overlay = $('customModalOverlay');
            const inputWrap = $('customModalInputContainer'), inputEl = $('customModalInput'), btnWrap = $('customModalButtons');

            $('customModalIcon').innerHTML = `<div class="ntf-dicon ${type}">${ICONS[icon || type]}</div>`;
            $('customModalTitle').textContent = title;
            $('customModalMessage').textContent = message;
            if (input) { inputWrap.classList.remove('hidden'); inputEl.value = input.value || ''; } else inputWrap.classList.add('hidden');

            btnWrap.textContent = '';
            let done = false;
            const finish = (val) => {
                if (done) return;
                done = true;
                document.removeEventListener('keydown', onKey, true);
                overlay.classList.add('hidden');
                resolve(val);
            };
            buttons.forEach((b) => {
                const el = document.createElement('button');
                el.type = 'button';
                el.className = 'btn ' + (b.danger ? 'ntf-danger' : (b.primary ? 'btn-primary' : 'btn-outline'));
                el.textContent = b.label;
                if (b.id) el.id = b.id;
                el.onclick = () => finish(b.fromInput ? inputEl.value : b.value);
                b.el = el;
                btnWrap.appendChild(el);
            });
            const cancelBtn = buttons.find((b) => b.cancel);
            const mainBtn = buttons.find((b) => b.primary || b.danger);

            function onKey(e) {
                if (e.key === 'Escape' && cancelBtn) { e.preventDefault(); e.stopPropagation(); finish(cancelBtn.fromInput ? null : cancelBtn.value); }
                else if (e.key === 'Enter') {
                    const ae = document.activeElement;
                    if (ae && ae.tagName === 'BUTTON') return;      // הכפתור הממוקד יטפל
                    e.preventDefault(); e.stopPropagation(); mainBtn.el.click();
                }
            }
            document.addEventListener('keydown', onKey, true);
            overlay.classList.remove('hidden');
            setTimeout(() => {
                const target = input ? inputEl : ((focusCancel && cancelBtn) ? cancelBtn.el : mainBtn.el);
                target.focus();
                if (input) inputEl.select();
            }, 30);
        });
        const p = chain.then(run);
        chain = p.catch(() => {});
        return p;
    }

    // ---------- ה-API הקיים ----------
    // isError: true → שגיאה · false/ריק → הצלחה · או מחרוזת: 'success' | 'error' | 'warning' | 'info'
    window.customAlert = function (message, isError = false) {
        const type = isError === true ? 'error' : (typeof isError === 'string' && TITLES[isError] ? isError : 'success');
        window.notify(message, type);
        return Promise.resolve(true);
    };

    window.showReadMessageModal = function (messageText) {
        return openDialog({
            type: 'info', title: 'הודעת מערכת', message: messageText,
            buttons: [{ label: 'קראתי', primary: true, cancel: true, value: true, id: 'msgReadBtn' }]
        });
    };

    window.customConfirm = function (message) {
        const danger = /מחק|למחוק|הסר|לאפס|איפוס|נקה/.test(String(message));
        return openDialog({
            type: danger ? 'error' : 'warning', icon: danger ? 'warning' : 'question',
            title: 'אישור פעולה', message, focusCancel: danger,
            buttons: [
                { label: 'ביטול', cancel: true, value: false, id: 'customModalCancelBtn' },
                { label: danger ? 'כן, המשך' : 'אישור', primary: !danger, danger, value: true, id: 'customModalConfirmBtn' }
            ]
        });
    };

    window.customPrompt = function (message, defaultValue = '') {
        return openDialog({
            type: 'info', icon: 'edit', title: 'הזנת נתונים', message, input: { value: defaultValue },
            buttons: [
                { label: 'ביטול', cancel: true, fromInput: true, value: null, id: 'customModalCancelBtn' },
                { label: 'שמור', primary: true, fromInput: true, id: 'customModalConfirmBtn' }
            ]
        });
    };
})();

// --- מעטפת Fetch גלובלית ---
const originalFetch = window.fetch;
window.fetch = async function(...args) {
    let [resource, config] = args;
    if (typeof resource === 'string' && resource.startsWith(API_BASE)) {
        config = { ...(config || {}) };
        const silent = config.silent === true;      // { silent: true } = הקורא מציג שגיאות בעצמה, בלי טוסט גלובלי
        delete config.silent;
        config.headers = config.headers || {};
        const key = localStorage.getItem('peer_api_key');
        if (key) {
            config.headers['x-api-key'] = key;
        }

        try {
            const response = await originalFetch(resource, config);
            if (!response.ok && !silent && resource.indexOf('/auth-check') === -1) { 
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
let dashboardManager;
let adminManager;
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
        if(dashboardManager) dashboardManager.load();
    };

    examManager = new ExamUpdateManager(API_BASE, document.getElementById('student-portal'), onSwitchStudent, refreshAllData);
    studentManager = new StudentManager(document.getElementById('view-students'), API_BASE, goToStudentUpdate, refreshAllData);
    examListManager = new ExamManager(document.getElementById('view-exams'), API_BASE, refreshAllData);
    historyManager = new HistoryManager(document.getElementById('view-history'), API_BASE, openStudentCard, refreshAllData);
    reportManager = new ReportManager(document.getElementById('view-reports'), API_BASE);
    dashboardManager = new DashboardManager(document.getElementById('view-dashboard'), API_BASE, openStudentCard);
    adminManager = new AdminManager(document.getElementById('view-admin'), API_BASE, document.getElementById('adminMenuItem'));
    adminManager.init();
    
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

// מההיסטוריה: מעבר לניהול תלמידים ופתיחת כרטיס התלמיד
function openStudentCard(studentCode) {
    document.querySelector('[data-target="view-students"]').click();
    if (studentManager) studentManager.openCard(studentCode);
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
    document.getElementById('studentSearch').focus();
}
