// ============================================================
//  client-exams.js — ניהול מבחנים: טבלה מתקדמת + הוספה / עריכה / הוספה מרוכזת
//  new ExamManager(container, API_BASE, onChanged)   (בלי apiBase — תצוגה בלבד)
// ============================================================

const GRADES = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח', 'ט', 'י', 'יא', 'יב'];

// מסכתות הש"ס (בבלי) — להשלמה אוטומטית
const BAVLI = ['ברכות', 'שבת', 'עירובין', 'פסחים', 'יומא', 'סוכה', 'ביצה', 'ראש השנה', 'תענית', 'מגילה', 'מועד קטן', 'חגיגה',
    'יבמות', 'כתובות', 'נדרים', 'נזיר', 'סוטה', 'גיטין', 'קידושין', 'בבא קמא', 'בבא מציעא', 'בבא בתרא', 'סנהדרין', 'מכות', 'שבועות',
    'עבודה זרה', 'הוריות', 'זבחים', 'מנחות', 'חולין', 'בכורות', 'ערכין', 'תמורה', 'כריתות', 'מעילה', 'תמיד', 'נידה'];

// מסכתות המשנה + מספר הפרקים (להצעה בעת יצירת פרקים אוטומטית; אפשר לערוך)
const MISHNAH = {
    'ברכות': 9, 'פאה': 8, 'דמאי': 7, 'כלאים': 9, 'שביעית': 10, 'תרומות': 11, 'מעשרות': 5, 'מעשר שני': 5, 'חלה': 4, 'ערלה': 3, 'ביכורים': 4,
    'שבת': 24, 'עירובין': 10, 'פסחים': 10, 'שקלים': 8, 'יומא': 8, 'סוכה': 5, 'ביצה': 5, 'ראש השנה': 4, 'תענית': 4, 'מגילה': 4, 'מועד קטן': 3, 'חגיגה': 3,
    'יבמות': 16, 'כתובות': 13, 'נדרים': 11, 'נזיר': 9, 'סוטה': 9, 'גיטין': 9, 'קידושין': 4,
    'בבא קמא': 10, 'בבא מציעא': 10, 'בבא בתרא': 10, 'סנהדרין': 11, 'מכות': 3, 'שבועות': 8, 'עדיות': 8, 'עבודה זרה': 5, 'אבות': 5, 'הוריות': 3,
    'זבחים': 14, 'מנחות': 13, 'חולין': 12, 'בכורות': 9, 'ערכין': 9, 'תמורה': 7, 'כריתות': 6, 'מעילה': 6, 'תמיד': 7, 'מידות': 5, 'קינים': 3,
    'כלים': 30, 'אהלות': 18, 'נגעים': 14, 'פרה': 12, 'טהרות': 10, 'מקואות': 10, 'נידה': 10, 'מכשירין': 6, 'זבים': 5, 'טבול יום': 4, 'ידיים': 4, 'עוקצין': 3
};

// ---------- עזרים (מיוצאים לבדיקות) ----------

export function esc(v) {
    return String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function csvCell(v) {
    let s = String(v ?? '');
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return `"${s.replace(/"/g, '""')}"`;
}

const ORD = ['', 'ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שביעי', 'שמיני', 'תשיעי', 'עשירי'];
const TEENS = ['', 'אחד עשר', 'שנים עשר', 'שלושה עשר', 'ארבעה עשר', 'חמישה עשר', 'ששה עשר', 'שבעה עשר', 'שמונה עשר', 'תשעה עשר'];
const UNITS = ['', 'אחד', 'שנים', 'שלושה', 'ארבעה', 'חמישה', 'ששה', 'שבעה', 'שמונה', 'תשעה'];

// 1 → "ראשון", 11 → "אחד עשר", 21 → "עשרים ואחד" (באותו סגנון שבו המבחנים רשומים היום)
export function chapterName(n) {
    n = parseInt(n, 10);
    if (!n || n < 1 || n > 99) return '';
    if (n <= 10) return ORD[n];
    if (n < 20) return TEENS[n - 10];
    const tens = { 20: 'עשרים', 30: 'שלושים', 40: 'ארבעים', 50: 'חמישים', 60: 'שישים', 70: 'שבעים', 80: 'שמונים', 90: 'תשעים' };
    const t = Math.floor(n / 10) * 10, u = n % 10;
    return u === 0 ? tens[t] : `${tens[t]} ו${UNITS[u]}`;
}

// קוד = מספר + א/ב
export function codeRank(code) {
    const m = String(code || '').match(/^(\d+)([אב])$/);
    return m ? parseInt(m[1], 10) * 2 + (m[2] === 'ב' ? 1 : 0) : Number.MAX_SAFE_INTEGER;
}

export function nextCodeAfter(code) {
    const m = String(code || '').match(/^(\d+)([אב])$/);
    if (!m) return '1א';
    const n = parseInt(m[1], 10);
    return m[2] === 'א' ? `${n}ב` : `${n + 1}א`;
}

const typeLabel = t => (t === 'mishnayot' ? 'משניות' : (t === 'gemara' ? 'גמרא' : 'אחר'));
const typeCls = t => (t === 'mishnayot' ? 'm' : (t === 'gemara' ? 'g' : 'o'));
const fmtMoney = v => '₪' + (Number(v) || 0).toFixed(1);

function toBody(ex, over = {}) {
    const d = ex.details || {};
    return {
        exam_type: ex.exam_type, masechet: d.masechet, chapter_num: d.chapter_num, chapter_name: d.chapter_name,
        chapter_title: d.chapter_title, from_page: d.from_page, to_page: d.to_page,
        total_mishnayot: d.total_mishnayot, gemara_pages: d.gemara_pages, target_grade: ex.target_grade, ...over
    };
}

// אימות קלט (משקף את האימות בשרת — כדי לתת משוב מיידי)
export function validateBody(b) {
    if (!['mishnayot', 'gemara'].includes(b.exam_type)) return 'יש לבחור סוג מבחן';
    if (!String(b.masechet || '').trim()) return 'חובה להזין שם מסכת';
    if (b.exam_type === 'mishnayot') {
        const num = b.chapter_num === '' || b.chapter_num == null ? null : Number(b.chapter_num);
        if (num !== null && (!Number.isInteger(num) || num < 1 || num > 99)) return 'מספר פרק: מספר שלם בין 1 ל-99';
        if (num === null && !String(b.chapter_name || '').trim()) return 'יש להזין מספר פרק או שם פרק';
        const c = Number(b.total_mishnayot);
        if (b.total_mishnayot === '' || b.total_mishnayot == null || !Number.isInteger(c) || c < 1 || c > 99) return 'מספר משניות: מספר שלם בין 1 ל-99';
    } else {
        if (!String(b.from_page || '').trim() || !String(b.to_page || '').trim()) return 'בגמרא חובה להזין "מדף" ו"עד דף"';
        const p = Number(b.gemara_pages);
        if (b.gemara_pages === '' || b.gemara_pages == null || !isFinite(p) || p <= 0 || p > 99) return 'מספר דפים: מספר חיובי (עד 99)';
    }
    return '';
}

// ============================================================
//  המחלקה
// ============================================================

export class ExamManager {
    constructor(container, apiBase = null, onChanged = null) {
        this.container = container;
        this.apiBase = apiBase;
        this.onChanged = onChanged;
        this.canEdit = !!apiBase;

        this.exams = [];
        this.rates = {};
        this.nextCode = null;
        this.f = { text: '', type: '', grade: '', masechet: '', sortKey: 'code', sortDir: 1, trash: false };
        this.sel = new Set();
        this.ed = null;
        this.bk = null;
        this._busy = false;

        this.injectStyles();
        if (this.canEdit) this.injectModals();
        this.bindEvents();
    }

    // ---------- API ----------

    async api(method, path, body) {
        const opt = { method };
        if (body !== undefined) { opt.headers = { 'Content-Type': 'application/json' }; opt.body = JSON.stringify(body); }
        try {
            const res = await fetch(`${this.apiBase}${path}`, opt);
            let data = null;
            try { data = await res.json(); } catch (e) { /* ignore */ }
            return { ok: res.ok, status: res.status, data };
        } catch (e) {
            await window.customAlert('שגיאת תקשורת מול השרת.', true);
            return { ok: false, status: 0, data: null };
        }
    }

    // הודעת שגיאה כללית רק אם השרת לא שלח הודעה (ההודעות של השרת כבר מוצגות ע"י המעטפת הגלובלית)
    async failed(res, fallback) {
        if (res.status !== 0 && !(res.data && res.data.message)) await window.customAlert(fallback, true);
    }

    // נקרא מ-client-app בכל רענון נתונים
    render(exams) {
        this.exams = (exams || []).slice();
        this.renderShell();
        this.renderBody();
        this.refresh();
    }

    async refresh() {
        if (!this.canEdit) return;
        const [list, meta] = await Promise.all([
            this.api('GET', '/exams?with_usage=true&include_deleted=true'),
            this.api('GET', '/exams/meta')
        ]);
        if (list.ok && Array.isArray(list.data)) this.exams = list.data;
        if (meta.ok && meta.data) { this.rates = meta.data.rates || {}; this.nextCode = meta.data.next_code || this.nextCode; }
        this.renderBody();
    }

    // מרענן את שאר המסכים (פעם אחת, אחרי שורת שינויים)
    scheduleSync() {
        clearTimeout(this._syncT);
        this._syncT = setTimeout(() => { if (this.onChanged) this.onChanged(); }, 1500);
    }

    // ---------- נתונים נגזרים ----------

    active() { return this.exams.filter(e => !e.is_deleted); }
    trashed() { return this.exams.filter(e => e.is_deleted); }
    byCode(code) { return this.exams.find(e => e.exam_code === code); }

    upsert(ex) {
        const i = this.exams.findIndex(e => e.exam_code === ex.exam_code);
        if (i >= 0) this.exams[i] = { ...this.exams[i], ...ex, results_count: ex.results_count ?? this.exams[i].results_count };
        else this.exams.push(ex);
        this.nextCode = nextCodeAfter(this.exams.reduce((m, e) => (codeRank(e.exam_code) > codeRank(m) && codeRank(e.exam_code) < Number.MAX_SAFE_INTEGER ? e.exam_code : m), '0א'));
    }

    masechtot() {
        return [...new Set(this.active().map(e => (e.details || {}).masechet).filter(Boolean))];
    }

    getRows() {
        const f = this.f;
        const term = f.text.trim().toLowerCase();
        let rows = this.exams.filter(e => !!e.is_deleted === f.trash);
        rows = rows.filter(e => {
            const d = e.details || {};
            if (f.type && e.exam_type !== f.type) return false;
            if (f.grade === '__none') { if (e.target_grade) return false; }
            else if (f.grade && e.target_grade !== f.grade) return false;
            if (f.masechet && d.masechet !== f.masechet) return false;
            if (!term) return true;
            return e.exam_code.toLowerCase().includes(term) || Object.values(d).some(v => String(v ?? '').toLowerCase().includes(term));
        });
        const val = e => {
            const d = e.details || {};
            switch (f.sortKey) {
                case 'type': return e.exam_type || '';
                case 'masechet': return d.masechet || '';
                case 'grade': return e.target_grade || '';
                case 'reward': return Number(e.reward_price) || 0;
                case 'usage': return e.results_count ?? -1;
                default: return codeRank(e.exam_code);
            }
        };
        return rows.sort((a, b) => {
            const va = val(a), vb = val(b);
            const c = (typeof va === 'number' && typeof vb === 'number') ? va - vb : String(va).localeCompare(String(vb), 'he', { numeric: true });
            return (c || (codeRank(a.exam_code) - codeRank(b.exam_code))) * f.sortDir;
        });
    }

    // ============================================================
    //  CSS
    // ============================================================

    injectStyles() {
        if (document.getElementById('examStyles')) return;
        const css = `
        .ex-root { display: flex; flex-direction: column; height: 100%; min-height: 0; gap: 10px; }
        .ex-card { background: #fff; border: 1px solid var(--border-color); border-radius: 10px; box-shadow: 0 1px 3px rgba(0,0,0,.04); }
        .ex-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; padding: 12px 16px; }
        .ex-head h3 { margin: 0; font-size: 1.1rem; display: flex; align-items: center; gap: 8px; color: #0f172a; }
        .ex-head h3 i { color: var(--primary-color); }
        .ex-chips { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 6px; }
        .ex-stat { background: #f1f5f9; border: 1px solid var(--border-color); border-radius: 999px; padding: 2px 10px; font-size: .76rem; color: #475569; font-weight: 600; }
        .ex-stat b { color: #0f172a; }
        .ex-actions { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
        .ex-toolbar { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; padding: 10px 16px; }
        .ex-search { position: relative; flex: 1; min-width: 200px; }
        .ex-search i { position: absolute; right: 11px; top: 50%; transform: translateY(-50%); color: #94a3b8; font-size: .85rem; }
        .ex-search input { width: 100%; padding: 7px 32px 7px 10px; border: 1px solid var(--border-color); border-radius: 8px; font-size: .88rem; outline: none; background: #f8fafc; }
        .ex-search input:focus { border-color: var(--primary-color); background: #fff; box-shadow: 0 0 0 3px rgba(37,99,235,.12); }
        .ex-seg { display: inline-flex; border: 1px solid var(--border-color); border-radius: 8px; overflow: hidden; background: #fff; }
        .ex-seg button { border: none; background: transparent; padding: 6px 13px; font-size: .84rem; font-weight: 600; color: #475569; cursor: pointer; }
        .ex-seg button + button { border-right: 1px solid var(--border-color); }
        .ex-seg button:hover { background: #f1f5f9; }
        .ex-seg button.active { background: var(--primary-color); color: #fff; }
        .ex-select { padding: 6px 9px; border: 1px solid var(--border-color); border-radius: 8px; background: #fff; font-size: .84rem; outline: none; }
        .ex-trash-on { background: #fef3c7 !important; border-color: #fcd34d !important; color: #92400e !important; }
        .ex-bulk { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; padding: 8px 16px; background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 10px; font-size: .86rem; color: #1e3a8a; }
        .ex-bulk b { font-size: 1rem; }
        .ex-tablewrap { flex: 1; min-height: 0; overflow: auto; padding: 0; }
        .ex-table { width: 100%; border-collapse: separate; border-spacing: 0; font-size: .86rem; }
        .ex-table th { position: sticky; top: 0; z-index: 2; background: #f1f5f9; color: #475569; font-size: .76rem; font-weight: 700; text-align: right; padding: 9px 10px; border-bottom: 1px solid var(--border-color); white-space: nowrap; user-select: none; }
        .ex-table th[data-sort] { cursor: pointer; }
        .ex-table th[data-sort]:hover { color: var(--primary-color); }
        .ex-table td { padding: 7px 10px; border-bottom: 1px solid #eef2f7; vertical-align: middle; }
        .ex-table tbody tr { transition: background .12s; }
        .ex-table tbody tr.ex-click { cursor: pointer; }
        .ex-table tbody tr:hover { background: #f8fafc; }
        .ex-table tbody tr.sel { background: #eff6ff; }
        .ex-table input[type=checkbox] { width: 16px; height: 16px; accent-color: var(--primary-color); cursor: pointer; }
        .ex-code { font-weight: 800; color: #0f172a; white-space: nowrap; }
        .ex-type { display: inline-block; padding: 2px 9px; border-radius: 999px; font-size: .74rem; font-weight: 700; border: 1px solid; }
        .ex-type.m { background: #eff6ff; color: #1d4ed8; border-color: #bfdbfe; }
        .ex-type.g { background: #fffbeb; color: #92400e; border-color: #fde68a; }
        .ex-type.o { background: #f1f5f9; color: #475569; border-color: #e2e8f0; }
        .ex-muted { color: #64748b; }
        .ex-count { background: #f1f5f9; border-radius: 6px; padding: 1px 7px; font-size: .74rem; color: #475569; white-space: nowrap; margin-right: 4px; }
        .ex-grade { background: #f8fafc; border: 1px solid var(--border-color); border-radius: 6px; padding: 1px 8px; font-size: .78rem; font-weight: 600; }
        .ex-money { font-weight: 700; color: #0369a1; white-space: nowrap; }
        .ex-use { font-weight: 700; color: #047857; }
        .ex-use.zero { color: #94a3b8; font-weight: 500; }
        .ex-rowbtns { display: inline-flex; gap: 4px; }
        .ex-ib { border: 1px solid var(--border-color); background: #fff; width: 28px; height: 28px; border-radius: 7px; cursor: pointer; color: #475569; font-size: .8rem; transition: .15s; }
        .ex-ib:hover { background: #eff6ff; border-color: #93c5fd; color: var(--primary-color); }
        .ex-ib.danger:hover { background: #fef2f2; border-color: #fecaca; color: #dc2626; }
        .ex-empty td { text-align: center; padding: 36px 10px !important; color: var(--text-muted); }
        .ex-foot { display: flex; justify-content: space-between; align-items: center; padding: 7px 16px; font-size: .78rem; color: var(--text-muted); }
        .ex-link { background: none; border: none; color: var(--primary-color); cursor: pointer; font-size: .8rem; font-weight: 600; }
        .ex-link:hover { text-decoration: underline; }

        /* מודלים */
        .ex-modal { max-width: 660px; width: 94%; height: auto; max-height: 94vh; border-radius: 14px; }
        .ex-modal.wide { max-width: 980px; }
        .ex-body { overflow: auto; padding: 16px 20px; display: flex; flex-direction: column; gap: 12px; }
        .ex-grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        .ex-grid3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; }
        .ex-f label { display: block; font-size: .78rem; font-weight: 600; color: #475569; margin-bottom: 4px; }
        .ex-f input, .ex-f select { width: 100%; padding: 8px 10px; border: 1px solid var(--border-color); border-radius: 8px; font-size: .9rem; outline: none; background: #f8fafc; font-family: inherit; }
        .ex-f input:focus, .ex-f select:focus { border-color: var(--primary-color); background: #fff; box-shadow: 0 0 0 3px rgba(37,99,235,.12); }
        .ex-f small { display: block; margin-top: 3px; font-size: .72rem; color: var(--text-muted); }
        .ex-typeseg { display: flex; gap: 8px; }
        .ex-typeseg button { flex: 1; padding: 10px; border: 2px solid var(--border-color); background: #fff; border-radius: 10px; font-size: .95rem; font-weight: 700; cursor: pointer; color: #475569; transition: .15s; }
        .ex-typeseg button.active[data-type=mishnayot] { border-color: #2563eb; background: #eff6ff; color: #1d4ed8; }
        .ex-typeseg button.active[data-type=gemara] { border-color: #d97706; background: #fffbeb; color: #92400e; }
        .ex-preview { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; background: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 10px; padding: 10px 14px; font-size: .84rem; }
        .ex-preview .k { color: var(--text-muted); font-size: .74rem; display: block; }
        .ex-preview .v { font-weight: 800; color: #0f172a; font-size: 1rem; }
        .ex-minirow { display: inline-flex; align-items: center; gap: 8px; background: #fff; border: 1px solid #cbd5e1; border-radius: 6px; padding: 3px 10px; font-weight: 700; }
        .ex-minirow .pill { background: #1e293b; color: #fff; border-radius: 99px; padding: 0 8px; font-size: .72rem; }
        .ex-warn { background: #fffbeb; border: 1px solid #fde68a; color: #92400e; border-radius: 8px; padding: 8px 12px; font-size: .82rem; }
        .ex-err { color: #b91c1c; font-size: .82rem; min-height: 18px; font-weight: 600; }
        .ex-mfoot { display: flex; align-items: center; justify-content: flex-end; gap: 8px; padding: 12px 20px; border-top: 1px solid var(--border-color); background: #f8fafc; border-radius: 0 0 14px 14px; flex-wrap: wrap; }
        .ex-mfoot .grow { flex: 1; font-size: .82rem; color: var(--text-muted); }
        .ex-mfoot .btn:disabled { opacity: .45; cursor: not-allowed; }
        .ex-gridwrap { max-height: 42vh; overflow: auto; border: 1px solid var(--border-color); border-radius: 10px; }
        .ex-grid-t { width: 100%; border-collapse: separate; border-spacing: 0; font-size: .84rem; }
        .ex-grid-t th { position: sticky; top: 0; background: #f1f5f9; padding: 7px 8px; font-size: .74rem; color: #475569; text-align: right; z-index: 1; }
        .ex-grid-t td { padding: 4px 5px; border-bottom: 1px solid #eef2f7; }
        .ex-grid-t td.n { width: 28px; color: #94a3b8; text-align: center; }
        .ex-grid-t td.c { width: 54px; font-weight: 800; color: #0f172a; text-align: center; }
        .ex-grid-t input { width: 100%; padding: 5px 7px; border: 1px solid transparent; border-radius: 6px; background: #f8fafc; font-size: .84rem; outline: none; }
        .ex-grid-t input:focus { border-color: var(--primary-color); background: #fff; }
        .ex-grid-t tr.bad input { border-color: #fca5a5; background: #fef2f2; }
        .ex-x { border: none; background: none; color: #94a3b8; cursor: pointer; font-size: 1.1rem; }
        .ex-x:hover { color: #dc2626; }
        .ex-gen { display: flex; gap: 10px; align-items: flex-end; flex-wrap: wrap; background: #f8fafc; border: 1px solid var(--border-color); border-radius: 10px; padding: 10px 12px; }
        .ex-gen .ex-f { min-width: 90px; }
        .ex-toast { position: fixed; bottom: 22px; left: 50%; transform: translateX(-50%); background: #0f172a; color: #fff; padding: 10px 16px; border-radius: 10px; display: flex; gap: 14px; align-items: center; font-size: .88rem; box-shadow: 0 10px 25px rgba(0,0,0,.25); z-index: 10002; }
        .ex-toast button { background: none; border: none; color: #93c5fd; font-weight: 700; cursor: pointer; }
        @media (max-width: 700px) { .ex-grid2, .ex-grid3 { grid-template-columns: 1fr; } }`;
        const style = document.createElement('style');
        style.id = 'examStyles';
        style.textContent = css;
        document.head.appendChild(style);
    }

    // ============================================================
    //  הטבלה
    // ============================================================

    renderShell() {
        const f = this.f;
        const masechtot = [...new Set(this.exams.map(e => (e.details || {}).masechet).filter(Boolean))];
        const ce = this.canEdit;

        this.container.innerHTML = `
        <div class="ex-root">
            <div class="ex-card ex-head">
                <div>
                    <h3><i class="fas fa-file-alt"></i> ניהול מבחנים</h3>
                    <div class="ex-chips" id="exChips"></div>
                </div>
                <div class="ex-actions">
                    ${ce ? `<button class="btn btn-primary" id="exAddBtn"><i class="fas fa-plus"></i> מבחן חדש</button>
                    <button class="btn btn-secondary" id="exBulkAddBtn"><i class="fas fa-layer-group"></i> הוספה מרוכזת</button>` : ''}
                    <button class="btn btn-outline" id="exExportBtn"><i class="fas fa-file-excel"></i> ייצוא</button>
                    ${ce ? `<button class="btn btn-outline ${f.trash ? 'ex-trash-on' : ''}" id="exTrashBtn"><i class="fas fa-trash-restore"></i> <span id="exTrashLbl"></span></button>` : ''}
                </div>
            </div>

            <div class="ex-card ex-toolbar">
                <div class="ex-search"><i class="fas fa-search"></i><input type="text" id="exSearch" placeholder="חיפוש לפי קוד, מסכת, פרק או דפים..." value="${esc(f.text)}" autocomplete="off"></div>
                <div class="ex-seg" id="exTypeSeg">
                    <button data-t="" class="${f.type === '' ? 'active' : ''}">הכל</button>
                    <button data-t="mishnayot" class="${f.type === 'mishnayot' ? 'active' : ''}">משניות</button>
                    <button data-t="gemara" class="${f.type === 'gemara' ? 'active' : ''}">גמרא</button>
                </div>
                <select class="ex-select" id="exMasSel"><option value="">כל המסכתות</option>${masechtot.map(m => `<option value="${esc(m)}" ${f.masechet === m ? 'selected' : ''}>${esc(m)}</option>`).join('')}</select>
                <select class="ex-select" id="exGradeSel">
                    <option value="">כל הכיתות</option><option value="__none" ${f.grade === '__none' ? 'selected' : ''}>ללא כיתת יעד</option>
                    ${GRADES.map(g => `<option value="${g}" ${f.grade === g ? 'selected' : ''}>כיתה ${g}</option>`).join('')}
                </select>
            </div>

            <div class="ex-bulk hidden" id="exBulkBar"></div>

            <div class="ex-card ex-tablewrap">
                <table class="ex-table">
                    <thead><tr>
                        ${ce ? '<th style="width:34px"><input type="checkbox" id="exCheckAll" title="בחר את כל המוצגים"></th>' : ''}
                        <th data-sort="code">קוד</th><th data-sort="type">סוג</th><th data-sort="masechet">מסכת</th><th>פרטים</th>
                        <th data-sort="grade">כיתת יעד</th><th data-sort="reward">שווי</th>${ce ? '<th data-sort="usage" title="כמה תלמידים כבר נבחנו">נבחנו</th>' : ''}<th></th>
                    </tr></thead>
                    <tbody id="exTbody"></tbody>
                </table>
            </div>
            <div class="ex-foot"><span id="exFootInfo"></span><span id="exFootRight"></span></div>
        </div>`;
    }

    renderBody() {
        const tbody = document.getElementById('exTbody');
        if (!tbody) return;
        const ce = this.canEdit;
        const rows = this.getRows();
        const act = this.active();
        const trash = this.trashed();

        // סטטיסטיקה
        const chips = document.getElementById('exChips');
        if (chips) chips.innerHTML = `<span class="ex-stat">סה"כ <b>${act.length}</b></span>
            <span class="ex-stat">משניות <b>${act.filter(e => e.exam_type === 'mishnayot').length}</b></span>
            <span class="ex-stat">גמרא <b>${act.filter(e => e.exam_type === 'gemara').length}</b></span>
            ${ce && this.nextCode ? `<span class="ex-stat">הקוד הבא <b>${esc(this.nextCode)}</b></span>` : ''}`;
        const tl = document.getElementById('exTrashLbl');
        if (tl) tl.textContent = this.f.trash ? 'חזרה למבחנים' : `סל מחזור${trash.length ? ` (${trash.length})` : ''}`;

        if (rows.length === 0) {
            tbody.innerHTML = `<tr class="ex-empty"><td colspan="9">${this.f.trash ? 'סל המחזור ריק' : 'לא נמצאו מבחנים'}</td></tr>`;
        } else {
            tbody.innerHTML = rows.map(e => this.rowHtml(e)).join('');
        }

        document.querySelectorAll('.ex-table th[data-sort]').forEach(th => {
            const on = th.dataset.sort === this.f.sortKey;
            th.textContent = th.textContent.replace(/[ ▲▼]+$/, '') + (on ? (this.f.sortDir === 1 ? ' ▲' : ' ▼') : '');
        });
        const foot = document.getElementById('exFootInfo');
        if (foot) foot.textContent = `מוצגים ${rows.length} מתוך ${this.f.trash ? trash.length : act.length}`;
        const sum = rows.reduce((s, e) => s + (Number(e.reward_price) || 0), 0);
        const fr = document.getElementById('exFootRight');
        if (fr) fr.textContent = this.f.trash ? '' : `שווי כולל של המוצגים: ${fmtMoney(sum)}`;

        this.renderBulkBar();
    }

    rowHtml(e) {
        const d = e.details || {};
        const ce = this.canEdit;
        let detail = '';
        if (e.exam_type === 'mishnayot') {
            detail = `<strong>פרק ${esc(d.chapter_name || d.chapter_num || '')}</strong>${d.chapter_title ? ` <span class="ex-muted">— ${esc(d.chapter_title)}</span>` : ''} <span class="ex-count">${esc(d.total_mishnayot ?? 0)} משניות</span>`;
        } else if (e.exam_type === 'gemara') {
            detail = `<strong>${esc(d.from_page)} – ${esc(d.to_page)}</strong>${d.chapter_title ? ` <span class="ex-muted">— ${esc(d.chapter_title)}</span>` : ''} <span class="ex-count">${esc(d.gemara_pages ?? 0)} דפים</span>`;
        } else {
            detail = esc(Object.values(d).filter(v => v !== null && v !== '').join(', '));
        }
        const used = e.results_count;
        const useCell = used === undefined ? '<span class="ex-muted">—</span>' : `<span class="ex-use ${used ? '' : 'zero'}">${used}</span>`;
        const sel = this.sel.has(e.exam_code);

        const btns = this.f.trash
            ? `<button class="ex-ib" data-act="restore" title="שחזר"><i class="fas fa-undo"></i></button>`
            : `<button class="ex-ib" data-act="edit" title="עריכה"><i class="fas fa-pen"></i></button>
               <button class="ex-ib" data-act="dup" title="שכפול"><i class="fas fa-clone"></i></button>
               <button class="ex-ib danger" data-act="del" title="מחיקה"><i class="fas fa-trash"></i></button>`;

        return `<tr data-code="${esc(e.exam_code)}" class="${ce && !this.f.trash ? 'ex-click' : ''} ${sel ? 'sel' : ''}">
            ${ce ? `<td><input type="checkbox" class="ex-chk" ${sel ? 'checked' : ''}></td>` : ''}
            <td class="ex-code">${esc(e.exam_code)}</td>
            <td><span class="ex-type ${typeCls(e.exam_type)}">${typeLabel(e.exam_type)}</span></td>
            <td>${esc(d.masechet || '')}</td>
            <td>${detail}</td>
            <td>${e.target_grade ? `<span class="ex-grade">${esc(e.target_grade)}</span>` : '<span class="ex-muted">הכל</span>'}</td>
            <td class="ex-money">${fmtMoney(e.reward_price)}</td>
            ${ce ? `<td>${useCell}</td>` : ''}
            <td>${ce ? `<span class="ex-rowbtns">${btns}</span>` : ''}</td>
        </tr>`;
    }

    renderBulkBar() {
        const bar = document.getElementById('exBulkBar');
        if (!bar) return;
        const n = this.sel.size;
        const all = document.getElementById('exCheckAll');
        if (all) {
            const rows = this.getRows();
            const inSel = rows.filter(e => this.sel.has(e.exam_code)).length;
            all.checked = rows.length > 0 && inSel === rows.length;
            all.indeterminate = inSel > 0 && inSel < rows.length;
        }
        if (!n) { bar.classList.add('hidden'); bar.innerHTML = ''; return; }
        bar.classList.remove('hidden');
        bar.innerHTML = this.f.trash
            ? `<span>נבחרו <b>${n}</b></span><button class="btn btn-secondary btn-sm" id="exBulkRestore"><i class="fas fa-undo"></i> שחזר</button><button class="ex-link" id="exBulkClear">נקה בחירה</button>`
            : `<span>נבחרו <b>${n}</b></span>
               <select class="ex-select" id="exBulkGrade"><option value="">שנה כיתת יעד ל...</option><option value="__none">ללא כיתת יעד</option>${GRADES.map(g => `<option value="${g}">כיתה ${g}</option>`).join('')}</select>
               <button class="btn btn-outline btn-sm" id="exBulkDel" style="color:#dc2626"><i class="fas fa-trash"></i> מחק</button>
               <button class="ex-link" id="exBulkClear">נקה בחירה</button>`;
    }

    // ---------- אירועים (מחוברים פעם אחת למיכל) ----------

    bindEvents() {
        const c = this.container;

        c.addEventListener('input', (e) => {
            if (e.target.id === 'exSearch') { this.f.text = e.target.value; this.renderBody(); }
        });
        c.addEventListener('change', (e) => {
            const id = e.target.id;
            if (id === 'exMasSel') { this.f.masechet = e.target.value; this.renderBody(); }
            else if (id === 'exGradeSel') { this.f.grade = e.target.value; this.renderBody(); }
            else if (id === 'exCheckAll') {
                this.getRows().forEach(x => (e.target.checked ? this.sel.add(x.exam_code) : this.sel.delete(x.exam_code)));
                this.renderBody();
            } else if (id === 'exBulkGrade' && e.target.value) this.bulkGrade(e.target.value);
        });
        c.addEventListener('click', (e) => {
            const t = e.target;
            const seg = t.closest('#exTypeSeg button');
            if (seg) { this.f.type = seg.dataset.t; this.renderShell(); this.renderBody(); return; }
            const th = t.closest('th[data-sort]');
            if (th) {
                if (this.f.sortKey === th.dataset.sort) this.f.sortDir *= -1; else { this.f.sortKey = th.dataset.sort; this.f.sortDir = 1; }
                this.renderBody(); return;
            }
            if (t.closest('#exAddBtn')) return this.openEditor();
            if (t.closest('#exBulkAddBtn')) return this.openBulk();
            if (t.closest('#exExportBtn')) return this.exportCsv();
            if (t.closest('#exTrashBtn')) { this.f.trash = !this.f.trash; this.sel.clear(); this.renderShell(); this.renderBody(); return; }
            if (t.closest('#exBulkClear')) { this.sel.clear(); this.renderBody(); return; }
            if (t.closest('#exBulkDel')) return this.bulkDelete();
            if (t.closest('#exBulkRestore')) return this.bulkRestore();

            const tr = t.closest('#exTbody tr[data-code]');
            if (!tr) return;
            const code = tr.dataset.code;
            const btn = t.closest('[data-act]');
            if (btn) {
                const act = btn.dataset.act;
                if (act === 'edit') this.openEditor(this.byCode(code));
                else if (act === 'dup') this.openEditor(null, this.byCode(code));
                else if (act === 'del') this.deleteOne(code);
                else if (act === 'restore') this.restoreOne(code);
                return;
            }
            if (t.classList.contains('ex-chk')) {
                if (t.checked) this.sel.add(code); else this.sel.delete(code);
                tr.classList.toggle('sel', t.checked);
                this.renderBulkBar();
                return;
            }
            if (this.canEdit && !this.f.trash) this.openEditor(this.byCode(code));
        });
    }

    toast(msg, actionLabel, onAction) {
        document.querySelectorAll('.ex-toast').forEach(x => x.remove());
        const el = document.createElement('div');
        el.className = 'ex-toast';
        const span = document.createElement('span');
        span.textContent = msg;
        el.appendChild(span);
        if (actionLabel) {
            const b = document.createElement('button');
            b.textContent = actionLabel;
            b.onclick = () => { el.remove(); onAction(); };
            el.appendChild(b);
        }
        document.body.appendChild(el);
        setTimeout(() => el.remove(), actionLabel ? 9000 : 3500);
    }

    // ============================================================
    //  פעולות: מחיקה / שחזור / קבוצתי
    // ============================================================

    async deleteOne(code) {
        const ex = this.byCode(code);
        if (!ex) return;
        const used = ex.results_count || 0;
        const ok = await window.customConfirm(`למחוק את מבחן ${code}?` + (used ? `\nכבר נבחנו בו ${used} תלמידים. התוצאות נשמרות, אבל המבחן לא יוצג והמלגה שלו לא תיספר עד לשחזור.` : '\nאפשר לשחזר מסל המחזור.'));
        if (!ok) return;
        const res = await this.api('DELETE', `/exams/${encodeURIComponent(code)}`);
        if (!res.ok) return this.failed(res, 'המחיקה נכשלה.');
        ex.is_deleted = true;
        this.sel.delete(code);
        this.renderBody();
        this.scheduleSync();
        this.toast(`מבחן ${code} נמחק`, 'בטל', () => this.restoreOne(code, true));
    }

    async restoreOne(code, quiet = false) {
        const res = await this.api('POST', `/exams/${encodeURIComponent(code)}/restore`);
        if (!res.ok) return this.failed(res, 'השחזור נכשל.');
        this.upsert(res.data);
        this.renderBody();
        this.scheduleSync();
        if (!quiet) this.toast(`מבחן ${code} שוחזר`);
        else this.toast(`מבחן ${code} שוחזר`);
    }

    async pool(items, worker, limit = 4) {
        let i = 0, failures = 0;
        await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
            while (i < items.length) {
                const item = items[i++];
                try { if (!(await worker(item))) failures++; } catch (e) { failures++; }
            }
        }));
        return failures;
    }

    async bulkDelete() {
        const codes = [...this.sel];
        const used = codes.reduce((s, c) => s + ((this.byCode(c) || {}).results_count || 0), 0);
        const ok = await window.customConfirm(`למחוק ${codes.length} מבחנים?` + (used ? `\nסה"כ ${used} תוצאות תלמידים קיימות בהם (נשמרות, אבל לא יוצגו עד לשחזור).` : ''));
        if (!ok) return;
        const done = [];
        const failures = await this.pool(codes, async (c) => {
            const r = await this.api('DELETE', `/exams/${encodeURIComponent(c)}`);
            if (r.ok) { const ex = this.byCode(c); if (ex) ex.is_deleted = true; done.push(c); }
            return r.ok;
        });
        this.sel.clear();
        this.renderBody();
        this.scheduleSync();
        this.toast(`${done.length} מבחנים נמחקו${failures ? `, ${failures} נכשלו` : ''}`, 'בטל', async () => {
            await this.pool(done, async (c) => { const r = await this.api('POST', `/exams/${encodeURIComponent(c)}/restore`); if (r.ok) this.upsert(r.data); return r.ok; });
            this.renderBody(); this.scheduleSync();
        });
    }

    async bulkRestore() {
        const codes = [...this.sel];
        await this.pool(codes, async (c) => { const r = await this.api('POST', `/exams/${encodeURIComponent(c)}/restore`); if (r.ok) this.upsert(r.data); return r.ok; });
        this.sel.clear();
        this.renderBody();
        this.scheduleSync();
        this.toast(`${codes.length} מבחנים שוחזרו`);
    }

    async bulkGrade(value) {
        const grade = value === '__none' ? '' : value;
        const codes = [...this.sel];
        const ok = await window.customConfirm(`לשנות את כיתת היעד של ${codes.length} מבחנים ל${grade ? `כיתה ${grade}` : '"ללא כיתת יעד"'}?`);
        if (!ok) { this.renderBulkBar(); return; }
        const failures = await this.pool(codes, async (c) => {
            const ex = this.byCode(c);
            if (!ex) return false;
            const r = await this.api('PUT', `/exams/${encodeURIComponent(c)}`, toBody(ex, { target_grade: grade }));
            if (r.ok) this.upsert(r.data);
            return r.ok;
        });
        this.sel.clear();
        this.renderBody();
        this.scheduleSync();
        this.toast(failures ? `עודכנו ${codes.length - failures}, נכשלו ${failures}` : `כיתת היעד עודכנה ב-${codes.length} מבחנים`);
    }

    exportCsv() {
        const rows = this.getRows();
        const header = ['קוד', 'סוג', 'מסכת', 'פרק (מספר)', 'פרק (שם)', 'כותרת', 'מדף', 'עד דף', 'מס׳ משניות', 'מס׳ דפים', 'כיתת יעד', 'שווי', 'נבחנו'];
        const lines = [header.map(csvCell).join(',')];
        rows.forEach(e => {
            const d = e.details || {};
            lines.push([e.exam_code, typeLabel(e.exam_type), d.masechet, d.chapter_num, d.chapter_name, d.chapter_title, d.from_page, d.to_page,
                d.total_mishnayot, d.gemara_pages, e.target_grade, e.reward_price, e.results_count ?? ''].map(csvCell).join(','));
        });
        const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `מבחנים_${this.f.trash ? 'סל_מחזור' : 'פעילים'}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }

    // ============================================================
    //  מודלים: הוספה / עריכה
    // ============================================================

    injectModals() {
        if (document.getElementById('exEditModal')) return;
        document.body.insertAdjacentHTML('beforeend', `
        <datalist id="exMasechtotList"></datalist>

        <div id="exEditModal" class="modal hidden no-print" style="z-index: 9990;">
            <div class="modal-content ex-modal">
                <div class="modal-header"><h3 id="exEdTitle"></h3><button class="close-modal-btn" id="exEdClose">&times;</button></div>
                <form id="exForm" autocomplete="off" style="display:flex;flex-direction:column;min-height:0;flex:1;">
                    <div class="ex-body">
                        <div class="ex-warn hidden" id="exWarn"></div>
                        <div class="ex-typeseg" id="exEdType"><button type="button" data-type="mishnayot">משניות</button><button type="button" data-type="gemara">גמרא</button></div>
                        <div class="ex-grid2">
                            <div class="ex-f"><label>מסכת</label><input type="text" id="exMas" list="exMasechtotList" placeholder="לדוגמה: ברכות"></div>
                            <div class="ex-f"><label>כיתת יעד</label><select id="exGr"><option value="">כל הכיתות</option>${GRADES.map(g => `<option value="${g}">כיתה ${g} ומעלה</option>`).join('')}</select><small>תלמידים בכיתה נמוכה יותר לא יוכלו להיבחן</small></div>
                        </div>
                        <div class="ex-grid3" id="exSecM">
                            <div class="ex-f"><label>מספר פרק</label><input type="number" id="exChNum" min="1" max="99"></div>
                            <div class="ex-f"><label>שם הפרק</label><input type="text" id="exChName" placeholder="ראשון"></div>
                            <div class="ex-f"><label>מספר משניות</label><input type="number" id="exCount" min="1" max="99"></div>
                        </div>
                        <div class="ex-grid3" id="exSecG">
                            <div class="ex-f"><label>מדף</label><input type="text" id="exFrom" placeholder="כג:" maxlength="10"></div>
                            <div class="ex-f"><label>עד דף</label><input type="text" id="exTo" placeholder="כז." maxlength="10"></div>
                            <div class="ex-f"><label>מספר דפים</label><input type="number" id="exPages" min="0.5" max="99" step="0.5"></div>
                        </div>
                        <div class="ex-f"><label>כותרת / תחילת הקטע (לא חובה)</label><input type="text" id="exTitle" maxlength="120" placeholder="לדוגמה: מאימתי / ומחרוזת של דג"></div>
                        <div class="ex-preview">
                            <div><span class="k">קוד</span><span class="v" id="exPvCode"></span></div>
                            <div><span class="k">שווי המבחן</span><span class="v" id="exPvReward"></span></div>
                            <div style="flex:1"><span class="k">כך יופיע בדוח</span><span class="ex-minirow" id="exPvRow"></span></div>
                        </div>
                        <div class="ex-err" id="exErr"></div>
                    </div>
                    <div class="ex-mfoot">
                        <span class="grow" id="exEdHint"></span>
                        <button type="button" class="btn btn-outline" id="exEdCancel">ביטול</button>
                        <button type="button" class="btn btn-secondary" id="exEdSaveMore">שמור והוסף עוד</button>
                        <button type="submit" class="btn btn-primary" id="exEdSave"><i class="fas fa-save"></i> שמור</button>
                    </div>
                </form>
            </div>
        </div>

        <div id="exBulkModal" class="modal hidden no-print" style="z-index: 9990;">
            <div class="modal-content ex-modal wide">
                <div class="modal-header"><h3><i class="fas fa-layer-group" style="color:var(--primary-color)"></i> הוספה מרוכזת של מבחנים</h3><button class="close-modal-btn" id="exBkClose">&times;</button></div>
                <div class="ex-body">
                    <div class="ex-typeseg" id="exBkType"><button type="button" data-type="mishnayot">משניות</button><button type="button" data-type="gemara">גמרא</button></div>
                    <div class="ex-grid2">
                        <div class="ex-f"><label>מסכת</label><input type="text" id="exBkMas" list="exMasechtotList" placeholder="לדוגמה: שבת"><small id="exBkMasHint"></small></div>
                        <div class="ex-f"><label>כיתת יעד (לכל השורות)</label><select id="exBkGr"><option value="">כל הכיתות</option>${GRADES.map(g => `<option value="${g}">כיתה ${g} ומעלה</option>`).join('')}</select></div>
                    </div>
                    <div class="ex-gen" id="exBkGen">
                        <div class="ex-f"><label>מפרק</label><input type="number" id="exBkFrom" min="1" max="99" value="1"></div>
                        <div class="ex-f"><label>עד פרק</label><input type="number" id="exBkTo" min="1" max="99" value="10"></div>
                        <button type="button" class="btn btn-secondary" id="exBkGenBtn"><i class="fas fa-magic"></i> צור שורות לפרקים</button>
                        <span class="ex-muted" style="font-size:.76rem;flex:1;min-width:160px">נוצרות שורות עם מספרי ושמות פרקים. נשאר רק להזין כמה משניות בכל פרק.</span>
                    </div>
                    <div class="ex-gridwrap"><table class="ex-grid-t"><thead id="exBkHead"></thead><tbody id="exBkBody"></tbody></table></div>
                    <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">
                        <button type="button" class="btn btn-outline btn-sm" id="exBkAddRow"><i class="fas fa-plus"></i> הוסף שורה</button>
                        <details style="flex:1;min-width:240px"><summary class="ex-link" style="cursor:pointer">הדבקה מאקסל / טקסט</summary>
                            <div style="margin-top:8px;display:flex;gap:8px;align-items:flex-start">
                                <textarea id="exBkPaste" rows="4" style="flex:1;padding:8px;border:1px solid var(--border-color);border-radius:8px;font-size:.82rem;direction:rtl;font-family:inherit" placeholder=""></textarea>
                                <button type="button" class="btn btn-secondary btn-sm" id="exBkPasteBtn">קלוט</button>
                            </div>
                            <div class="ex-muted" style="font-size:.74rem;margin-top:4px" id="exBkPasteHint"></div>
                        </details>
                    </div>
                    <div class="ex-err" id="exBkErr"></div>
                </div>
                <div class="ex-mfoot">
                    <span class="grow" id="exBkSummary"></span>
                    <button type="button" class="btn btn-outline" id="exBkCancel">ביטול</button>
                    <button type="button" class="btn btn-primary" id="exBkSave"><i class="fas fa-save"></i> הוסף את כל המבחנים</button>
                </div>
            </div>
        </div>`);

        const $ = id => document.getElementById(id);

        // ---- עריכה ----
        $('exEdClose').onclick = $('exEdCancel').onclick = () => this.closeEditor();
        $('exEdType').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) this.setEdType(b.dataset.type); });
        $('exForm').addEventListener('input', (e) => {
            if (e.target.id === 'exChName') this.ed.nameAuto = false;
            if (e.target.id === 'exChNum' && this.ed.nameAuto) $('exChName').value = chapterName($('exChNum').value);
            this.ed.touched = true;
            this.updateEditor();
        });
        $('exForm').addEventListener('submit', (e) => { e.preventDefault(); this.submitEditor(false); });
        $('exEdSaveMore').onclick = () => this.submitEditor(true);

        // ---- מרוכז ----
        $('exBkClose').onclick = $('exBkCancel').onclick = () => this.closeBulk();
        $('exBkType').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) this.setBkType(b.dataset.type); });
        $('exBkMas').addEventListener('input', () => this.updateBkMasHint());
        $('exBkGenBtn').onclick = () => this.generateRows();
        $('exBkAddRow').onclick = () => this.addBkRow();
        $('exBkPasteBtn').onclick = () => this.pasteRows();
        $('exBkSave').onclick = () => this.saveBulk();
        $('exBkBody').addEventListener('input', (e) => {
            const tr = e.target.closest('tr[data-i]');
            if (!tr || !e.target.dataset.f) return;
            const r = this.bk.rows[+tr.dataset.i];
            r[e.target.dataset.f] = e.target.value;
            if (e.target.dataset.f === 'chapter_name') r._auto = false;
            if (e.target.dataset.f === 'chapter_num' && r._auto) { r.chapter_name = chapterName(e.target.value); tr.querySelector('[data-f=chapter_name]').value = r.chapter_name; }
            tr.classList.remove('bad');
            $('exBkErr').textContent = '';
            this.updateBkSummary();
        });
        $('exBkBody').addEventListener('click', (e) => {
            const d = e.target.closest('[data-del]');
            if (d) { this.bk.rows.splice(+d.dataset.del, 1); this.renderBkRows(); }
        });

        document.addEventListener('keydown', (e) => {
            if (e.key !== 'Escape') return;
            if (!$('exEditModal').classList.contains('hidden')) this.closeEditor();
            else if (!$('exBulkModal').classList.contains('hidden')) this.closeBulk();
        });
    }

    fillMasechtot(type) {
        const base = type === 'mishnayot' ? Object.keys(MISHNAH) : BAVLI;
        const extra = this.masechtot().filter(m => !base.includes(m));
        document.getElementById('exMasechtotList').innerHTML = [...base, ...extra].map(m => `<option value="${esc(m)}"></option>`).join('');
    }

    // ---------- חלון הוספה / עריכה ----------

    openEditor(exam = null, copyFrom = null) {
        const $ = id => document.getElementById(id);
        const src = exam || copyFrom;
        const d = (src && src.details) || {};
        const type = src ? (src.exam_type === 'gemara' ? 'gemara' : 'mishnayot') : (this._lastType || 'mishnayot');
        this.ed = { mode: exam ? 'edit' : 'add', exam, type, nameAuto: !exam, touched: false };

        $('exEdTitle').innerHTML = exam ? `<i class="fas fa-pen" style="color:var(--primary-color)"></i> עריכת מבחן ${esc(exam.exam_code)}` : `<i class="fas fa-plus" style="color:var(--primary-color)"></i> מבחן חדש${copyFrom ? ' (שכפול)' : ''}`;
        $('exMas').value = d.masechet || this._lastMas || '';
        $('exGr').value = src ? (src.target_grade || '') : (this._lastGrade || '');
        $('exTitle').value = d.chapter_title || '';

        let num = d.chapter_num, name = d.chapter_name, count = d.total_mishnayot;
        if (copyFrom) {           // בשכפול של משניות — מקדמים לפרק הבא
            if (num) { num = Number(num) + 1; name = chapterName(num); count = ''; }
        }
        $('exChNum').value = num ?? '';
        $('exChName').value = name || '';
        $('exCount').value = count ?? '';
        $('exFrom').value = copyFrom ? '' : (d.from_page || '');
        $('exTo').value = copyFrom ? '' : (d.to_page || '');
        $('exPages').value = copyFrom ? '' : (d.gemara_pages ?? '');
        if (exam && exam.exam_type !== type) $('exEdType').dataset.legacy = '1';

        const warn = $('exWarn');
        if (exam && exam.results_count) {
            warn.classList.remove('hidden');
            warn.textContent = `כבר נבחנו במבחן הזה ${exam.results_count} תלמידים. שינוי בכמות המשניות / הדפים משנה גם את המלגה שלהם.`;
        } else warn.classList.add('hidden');

        $('exEdSaveMore').style.display = exam ? 'none' : '';
        $('exEdHint').textContent = exam ? 'קוד המבחן קבוע ולא משתנה' : 'הקוד נקבע אוטומטית';
        this.setEdType(type, true);
        $('exEditModal').classList.remove('hidden');
        setTimeout(() => $(exam ? 'exMas' : (this.ed.type === 'mishnayot' && $('exMas').value ? 'exCount' : 'exMas')).focus(), 50);
    }

    closeEditor() {
        document.getElementById('exEditModal').classList.add('hidden');
        this.ed = null;
    }

    setEdType(type, silent = false) {
        const $ = id => document.getElementById(id);
        this.ed.type = type;
        $('exEdType').querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.type === type));
        $('exSecM').style.display = type === 'mishnayot' ? '' : 'none';
        $('exSecG').style.display = type === 'gemara' ? '' : 'none';
        this.fillMasechtot(type);
        if (!silent) this.ed.touched = true;
        this.updateEditor();
    }

    readEditor() {
        const $ = id => document.getElementById(id);
        const t = this.ed.type;
        return {
            exam_type: t, masechet: $('exMas').value.trim(), target_grade: $('exGr').value,
            chapter_title: $('exTitle').value.trim(),
            chapter_num: t === 'mishnayot' ? $('exChNum').value : null,
            chapter_name: t === 'mishnayot' ? $('exChName').value.trim() : null,
            total_mishnayot: t === 'mishnayot' ? $('exCount').value : null,
            from_page: t === 'gemara' ? $('exFrom').value.trim() : null,
            to_page: t === 'gemara' ? $('exTo').value.trim() : null,
            gemara_pages: t === 'gemara' ? $('exPages').value : null
        };
    }

    updateEditor() {
        if (!this.ed) return;
        const $ = id => document.getElementById(id);
        const b = this.readEditor();
        const err = validateBody(b);

        $('exErr').textContent = this.ed.touched ? err : '';
        $('exEdSave').disabled = !!err;
        $('exEdSaveMore').disabled = !!err;

        const code = this.ed.exam ? this.ed.exam.exam_code : (this.nextCode || '…');
        $('exPvCode').textContent = code;
        const rate = this.rates[b.exam_type === 'mishnayot' ? 'mishnayot' : 'gemara_pages'];
        const qty = Number(b.exam_type === 'mishnayot' ? b.total_mishnayot : b.gemara_pages);
        $('exPvReward').textContent = (rate != null && qty > 0) ? fmtMoney(rate * qty) : '—';

        const row = $('exPvRow');
        const label = b.exam_type === 'mishnayot' ? (b.chapter_name || (b.chapter_num ? `פרק ${b.chapter_num}` : '')) : (b.from_page && b.to_page ? `${b.from_page} – ${b.to_page}` : '');
        row.innerHTML = `<span class="pill">${typeLabel(b.exam_type)}</span> ${esc(b.masechet || 'מסכת')} · ${esc(code)}${label ? ` · ${esc(label)}` : ''}`;
    }

    async submitEditor(addMore) {
        const b = this.readEditor();
        if (validateBody(b)) { this.ed.touched = true; return this.updateEditor(); }
        const edit = this.ed.mode === 'edit';
        const btns = ['exEdSave', 'exEdSaveMore'].map(id => document.getElementById(id));
        btns.forEach(x => { x.disabled = true; });

        const res = edit
            ? await this.api('PUT', `/exams/${encodeURIComponent(this.ed.exam.exam_code)}`, b)
            : await this.api('POST', '/exams', b);

        if (!res.ok) { btns.forEach(x => { x.disabled = false; }); return this.failed(res, 'השמירה נכשלה.'); }

        this._lastType = b.exam_type; this._lastMas = b.masechet; this._lastGrade = b.target_grade || '';
        this.upsert(res.data);
        this.renderBody();
        this.scheduleSync();

        if (addMore) {
            // שומרים מסכת / כיתה, מקדמים פרק, ומנקים את הכמויות
            const $ = id => document.getElementById(id);
            this.toast(`נוסף מבחן ${res.data.exam_code}`);
            if (b.exam_type === 'mishnayot' && b.chapter_num) {
                const n = Number(b.chapter_num) + 1;
                $('exChNum').value = n; $('exChName').value = chapterName(n); this.ed.nameAuto = true;
            } else { $('exChNum').value = ''; $('exChName').value = ''; }
            ['exCount', 'exFrom', 'exTo', 'exPages', 'exTitle'].forEach(id => { $(id).value = ''; });
            this.ed.touched = false;
            this.updateEditor();
            $(b.exam_type === 'mishnayot' ? 'exCount' : 'exFrom').focus();
        } else {
            this.closeEditor();
            this.toast(edit ? `מבחן ${res.data.exam_code} עודכן` : `נוסף מבחן ${res.data.exam_code}`);
        }
    }

    // ============================================================
    //  הוספה מרוכזת
    // ============================================================

    openBulk() {
        const $ = id => document.getElementById(id);
        this.bk = { type: this._lastType || 'mishnayot', rows: [] };
        $('exBkMas').value = this._lastMas || '';
        $('exBkGr').value = this._lastGrade || '';
        $('exBkErr').textContent = '';
        $('exBkPaste').value = '';
        this.setBkType(this.bk.type);
        $('exBulkModal').classList.remove('hidden');
        setTimeout(() => $('exBkMas').focus(), 50);
    }

    closeBulk() {
        document.getElementById('exBulkModal').classList.add('hidden');
        this.bk = null;
    }

    emptyRow() {
        return this.bk.type === 'mishnayot'
            ? { chapter_num: '', chapter_name: '', chapter_title: '', total_mishnayot: '', _auto: true }
            : { from_page: '', chapter_title: '', to_page: '', gemara_pages: '' };
    }

    setBkType(type) {
        const $ = id => document.getElementById(id);
        this.bk.type = type;
        $('exBkType').querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.type === type));
        $('exBkGen').style.display = type === 'mishnayot' ? '' : 'none';
        $('exBkHead').innerHTML = type === 'mishnayot'
            ? '<tr><th></th><th>קוד</th><th>מס׳ פרק</th><th>שם הפרק</th><th>כותרת (לא חובה)</th><th>מס׳ משניות</th><th></th></tr>'
            : '<tr><th></th><th>קוד</th><th>מדף</th><th>כותרת / תחילת הקטע</th><th>עד דף</th><th>מס׳ דפים</th><th></th></tr>';
        $('exBkPaste').placeholder = type === 'mishnayot' ? 'מס׳ פרק \t שם פרק \t כותרת \t מס׳ משניות' : 'מדף \t כותרת \t עד דף \t מס׳ דפים';
        $('exBkPasteHint').textContent = `כל שורה = מבחן. עמודות לפי הסדר: ${type === 'mishnayot' ? 'מספר פרק, שם פרק, כותרת, מספר משניות' : 'מדף, כותרת, עד דף, מספר דפים'} (מופרדות בטאב או בפסיק).`;
        this.fillMasechtot(type);
        this.bk.rows = [this.emptyRow()];
        this.updateBkMasHint();
        this.renderBkRows();
    }

    updateBkMasHint() {
        const m = document.getElementById('exBkMas').value.trim();
        const n = this.bk && this.bk.type === 'mishnayot' ? MISHNAH[m] : null;
        document.getElementById('exBkMasHint').textContent = n ? `במשנה: ${n} פרקים` : '';
        if (n) document.getElementById('exBkTo').value = n;
    }

    plannedCodes(n) {
        const out = [];
        let c = this.nextCode ? this.nextCode : '1א';
        for (let i = 0; i < n; i++) { out.push(c); c = nextCodeAfter(c); }
        return out;
    }

    renderBkRows() {
        const isM = this.bk.type === 'mishnayot';
        const codes = this.plannedCodes(this.bk.rows.length);
        const inp = (f, r, extra = '') => `<td><input data-f="${f}" value="${esc(r[f])}" ${extra}></td>`;
        document.getElementById('exBkBody').innerHTML = this.bk.rows.map((r, i) => `<tr data-i="${i}" class="${r._bad ? 'bad' : ''}">
            <td class="n">${i + 1}</td><td class="c">${esc(codes[i])}</td>
            ${isM
                ? inp('chapter_num', r, 'type="number" min="1" max="99"') + inp('chapter_name', r) + inp('chapter_title', r) + inp('total_mishnayot', r, 'type="number" min="1" max="99"')
                : inp('from_page', r, 'maxlength="10"') + inp('chapter_title', r) + inp('to_page', r, 'maxlength="10"') + inp('gemara_pages', r, 'type="number" min="0.5" step="0.5"')}
            <td><button type="button" class="ex-x" data-del="${i}" title="הסר שורה">×</button></td></tr>`).join('');
        this.updateBkSummary();
    }

    addBkRow() {
        const r = this.emptyRow();
        const last = this.bk.rows[this.bk.rows.length - 1];
        if (this.bk.type === 'mishnayot' && last && last.chapter_num) { r.chapter_num = Number(last.chapter_num) + 1; r.chapter_name = chapterName(r.chapter_num); }
        this.bk.rows.push(r);
        this.renderBkRows();
        const inputs = document.querySelectorAll('#exBkBody tr:last-child input');
        if (inputs.length) inputs[inputs.length - 1].focus();
    }

    generateRows() {
        const from = parseInt(document.getElementById('exBkFrom').value, 10), to = parseInt(document.getElementById('exBkTo').value, 10);
        if (!from || !to || from > to || to > 99) { document.getElementById('exBkErr').textContent = 'טווח פרקים לא תקין'; return; }
        document.getElementById('exBkErr').textContent = '';
        this.bk.rows = [];
        for (let n = from; n <= to; n++) this.bk.rows.push({ chapter_num: n, chapter_name: chapterName(n), chapter_title: '', total_mishnayot: '', _auto: true });
        this.renderBkRows();
        const first = document.querySelector('#exBkBody tr:first-child [data-f=total_mishnayot]');
        if (first) first.focus();
    }

    pasteRows() {
        const text = document.getElementById('exBkPaste').value.trim();
        if (!text) return;
        const isM = this.bk.type === 'mishnayot';
        const rows = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean).map(line => {
            const cells = (line.includes('\t') ? line.split('\t') : line.split(',')).map(c => c.trim());
            return isM
                ? { chapter_num: cells[0] || '', chapter_name: cells[1] || chapterName(cells[0]), chapter_title: cells[2] || '', total_mishnayot: cells[3] || '', _auto: !cells[1] }
                : { from_page: cells[0] || '', chapter_title: cells[1] || '', to_page: cells[2] || '', gemara_pages: cells[3] || '' };
        });
        if (!rows.length) return;
        const onlyEmpty = this.bk.rows.length === 1 && !Object.values(this.bk.rows[0]).some(v => v && v !== true);
        this.bk.rows = onlyEmpty ? rows : this.bk.rows.concat(rows);
        document.getElementById('exBkPaste').value = '';
        this.renderBkRows();
    }

    bkBodies() {
        const mas = document.getElementById('exBkMas').value.trim();
        const grade = document.getElementById('exBkGr').value;
        return this.bk.rows.map(r => this.bk.type === 'mishnayot'
            ? { exam_type: 'mishnayot', masechet: mas, target_grade: grade, chapter_num: r.chapter_num, chapter_name: r.chapter_name, chapter_title: r.chapter_title, total_mishnayot: r.total_mishnayot }
            : { exam_type: 'gemara', masechet: mas, target_grade: grade, chapter_title: r.chapter_title, from_page: r.from_page, to_page: r.to_page, gemara_pages: r.gemara_pages });
    }

    updateBkSummary() {
        const n = this.bk.rows.length;
        const codes = this.plannedCodes(n);
        const ok = this.bkBodies().filter(b => !validateBody(b)).length;
        document.getElementById('exBkSummary').textContent = n ? `${n} שורות · תקינות: ${ok} · קודים ${codes[0]}${n > 1 ? ` עד ${codes[n - 1]}` : ''}` : '';
        document.getElementById('exBkSave').disabled = n === 0;
    }

    async saveBulk() {
        const bodies = this.bkBodies();
        let firstBad = -1;
        this.bk.rows.forEach((r, i) => { r._bad = !!validateBody(bodies[i]); if (r._bad && firstBad < 0) firstBad = i; });
        const mas = document.getElementById('exBkMas').value.trim();
        if (!mas) { document.getElementById('exBkErr').textContent = 'חובה להזין שם מסכת'; return; }
        if (firstBad >= 0) {
            document.getElementById('exBkErr').textContent = `שורה ${firstBad + 1}: ${validateBody(bodies[firstBad])}`;
            this.renderBkRows();
            return;
        }
        document.getElementById('exBkErr').textContent = '';
        const btn = document.getElementById('exBkSave');
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> מוסיף...';
        const res = await this.api('POST', '/exams/series', { exams: bodies });
        btn.innerHTML = '<i class="fas fa-save"></i> הוסף את כל המבחנים';
        btn.disabled = false;
        if (!res.ok) return this.failed(res, 'ההוספה נכשלה.');

        this._lastType = this.bk.type; this._lastMas = mas; this._lastGrade = document.getElementById('exBkGr').value;
        (res.data.created || []).forEach(x => this.upsert(x));
        const codes = (res.data.created || []).map(x => x.exam_code);
        this.closeBulk();
        this.f.trash = false;
        this.renderShell();
        this.renderBody();
        this.scheduleSync();
        this.toast(`נוספו ${codes.length} מבחנים (${codes[0]}${codes.length > 1 ? ` עד ${codes[codes.length - 1]}` : ''})`);
    }
}
