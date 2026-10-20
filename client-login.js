// ============================================================
//  client-login.js — תוספות למסך הכניסה (עיצוב/נוחות בלבד, הבדיקה עצמה ב-client-app.js)
//  setupLoginScreen()          כפתור הצגת סיסמה + התראת Caps Lock
//  logEntry(apiBase)           רישום כניסה אוטומטית (IP / סיסמה שמורה) — פעם אחת לכל חלון דפדפן
//  setupMobileNav()            בטלפון: גלילת הטאב הפעיל לתוך התצוגה בסרגל העליון
// ============================================================

export function setupLoginScreen() {
    const input = document.getElementById('apiKeyInput');
    const eye = document.getElementById('lgEye');
    const caps = document.getElementById('lgCaps');
    if (!input) return;

    if (eye) {
        eye.addEventListener('click', () => {
            const show = input.type === 'password';
            input.type = show ? 'text' : 'password';
            eye.innerHTML = `<i class="fas ${show ? 'fa-eye-slash' : 'fa-eye'}"></i>`;
            eye.setAttribute('aria-label', show ? 'הסתרת סיסמה' : 'הצגת סיסמה');
            input.focus();
        });
    }
    if (caps) {
        const check = (e) => { if (e.getModifierState) caps.classList.toggle('hidden', !e.getModifierState('CapsLock')); };
        input.addEventListener('keydown', check);
        input.addEventListener('keyup', check);
        input.addEventListener('blur', () => caps.classList.add('hidden'));
    }
}

export function logEntry(apiBase) {
    try {
        if (sessionStorage.getItem('peer_entry_logged')) return;
        sessionStorage.setItem('peer_entry_logged', '1');
    } catch (e) {}
    fetch(`${apiBase}/auth/login`, {
        method: 'POST', silent: true,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'auto' })
    }).catch(() => {});
}

export function setupMobileNav() {
    const mq = window.matchMedia('(max-width: 768px)');
    document.querySelectorAll('.menu-item').forEach(item => {
        item.addEventListener('click', () => {
            if (!mq.matches) return;
            item.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
    });
}
