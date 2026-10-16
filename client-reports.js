// ============================================================
//  client-reports.js  —  הפקת דוחות הישגים ומלגות
//  מסך הפקה + מודל התאמה אישית (נשמר בשרת) + הדפסה / PDF / אקסל
// ============================================================

const H2C_URL   = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
const JSPDF_URL = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';

// ---------- מידות העמוד (מ"מ) ----------
const PAGE = {
    width: 210,
    height: 296,     // מעט פחות מ-297 כדי למנוע עמוד ריק בהדפסה
    padding: 9,
    headH: 26,
    footH: 8,
    minRow: 4.2,     // גובה שורה מינימלי
    prefRow: 4.4,    // מתחת לגובה הזה (באוטומטי) עוברים לעמוד שני
    maxRow: 6.8      // גובה שורה מקסימלי כשיש מעט מבחנים
};

// ---------- סוגי מבחנים ----------
const TYPE_INFO = {
    mishnayot: { label: 'משניות', cls: 't-m', rank: 0 },
    gemara:    { label: 'גמרא',   cls: 't-g', rank: 1 },
    other:     { label: '',       cls: 't-o', rank: 2 }
};
const typeOf = t => TYPE_INFO[t] || TYPE_INFO.other;

// ============================================================
//  עיצוב הדוח — ברירת מחדל (זה בדיוק המראה הנוכחי) + ניקוי קלט
// ============================================================

const HEADER_IDS = ['logo', 'title', 'student'];
const STAT_IDS = ['attempted', 'passed', 'failed', 'money'];
const HEADER_LABELS = { logo: 'לוגו', title: 'כותרת הדוח ותאריך', student: 'פרטי התלמיד' };
const STAT_LABELS = { attempted: 'נבחן ב-X מתוך Y', passed: 'עברו', failed: 'לא עברו', money: 'סך מלגה' };

export const DEFAULT_DESIGN = {
    // טקסטים
    title: 'דוח הישגים ומלגות',
    subtitle: '',
    note: '',
    footerText: 'הופק ממערכת ניהול פאר המשנה',
    bsd: false,
    // סדר (הראשון מופיע מימין)
    headerOrder: ['logo', 'title', 'student'],
    statsOrder: ['attempted', 'passed', 'failed', 'money'],
    statsVisible: { attempted: true, passed: true, failed: true, money: true },
    // הצגה
    showLogo: true,
    showStats: true,
    showReward: true,
    showSummary: true,
    showStudentCode: true,
    showTypeLabels: true,
    showLegend: true,
    showHebrewDate: true,
    showChapterLetter: true,   // אות הפרק ליד קוד המבחן (במשניות)
    gemaraByChapter: true,     // בגמרא: כותרת לפי שם הפרק במקום שם המסכת
    rowStripes: true,
    // פריסה
    cols: 'auto',          // auto | 2 | 3 | 4 | 5
    fontScale: '1',        // 0.9 | 1 | 1.1
    // טקסטים קבועים בדוח (ריק = ברירת מחדל)
    texts: {
        colCode: 'קוד', colMark: 'הישג', colReward: 'מלגה',
        statAttempted: 'נבחן ב-$ בחינות', statOf: 'מתוך', statPassed: 'עברו $ בחינות', statFailed: 'לא עברו $ בחינות', statMoney: 'סך מלגה $',
        grade: 'כיתה', code: 'קוד', typeM: 'משניות', typeG: 'גמרא',
        legPass: 'עבר', legFail: 'לא עבר', legNone: 'שורה ללא סימון – טרם נבחן',
        page: 'עמוד', pageOf: 'מתוך', bsd: 'בס״ד', empty: 'לא נמצאו בחינות להצגה',
        legChapter: 'האות ליד הקוד = מספר הפרק'
    },
    // צבעים
    colors: {
        line: '#0f172a',
        masechet: '#1e293b',
        masechetText: '#ffffff',
        pass: '#ecfdf5',
        fail: '#fef2f2',
        stripe: '#f1f5f9',
        passMark: '#059669',
        failMark: '#dc2626'
    }
};

export const TEXT_LABELS = [
    ['colCode', 'כותרת עמודה: קוד'], ['colMark', 'כותרת עמודה: הישג'], ['colReward', 'כותרת עמודה: מלגה'],
    ['statAttempted', 'כרטיס: נבחן ($ = המספר)'], ['statOf', 'כרטיס: מתוך (אחרי המספר)'], ['statPassed', 'כרטיס: עברו ($ = המספר)'],
    ['statFailed', 'כרטיס: לא עברו ($ = המספר)'], ['statMoney', 'כרטיס: סך מלגה ($ = הסכום)'],
    ['grade', 'המילה "כיתה"'], ['code', 'המילה "קוד" (ליד התלמיד)'], ['typeM', 'תווית משניות'], ['typeG', 'תווית גמרא'],
    ['legPass', 'מקרא: עבר'], ['legFail', 'מקרא: לא עבר'], ['legNone', 'מקרא: טרם נבחן'],
    ['page', 'המילה "עמוד"'], ['pageOf', 'המילה "מתוך" (עמודים)'], ['bsd', 'בס״ד'], ['empty', 'הודעה כשאין בחינות'],
    ['legChapter', 'מקרא: האות ליד הקוד']
];

// ברירות המחדל הישנות — אם הן שמורות בשרת, מתעדכנות לחדשות (טקסט שהותאם אישית לא נוגעים בו)
const LEGACY_TEXTS = { statAttempted: 'נבחן ב-', statPassed: 'עברו', statFailed: 'לא עברו', statMoney: 'סך מלגה', empty: 'לא נמצאו מבחנים להצגה' };

export const COLOR_LABELS = [
    ['line', 'קו וכותרת עליונה'],
    ['masechet', 'רקע כותרת מסכת'],
    ['masechetText', 'כתב בכותרת מסכת'],
    ['pass', 'שורה שעבר'],
    ['fail', 'שורה שלא עבר'],
    ['stripe', 'פס לסירוגין'],
    ['passMark', 'סימן ✓'],
    ['failMark', 'סימן ✕']
];

export const PRESETS = {
    default: { name: 'ברירת מחדל', colors: { ...DEFAULT_DESIGN.colors } },
    blue:    { name: 'כחול',  colors: { ...DEFAULT_DESIGN.colors, line: '#1e3a8a', masechet: '#1d4ed8', pass: '#ecfdf5', stripe: '#eff6ff' } },
    green:   { name: 'ירוק',  colors: { ...DEFAULT_DESIGN.colors, line: '#14532d', masechet: '#166534', stripe: '#f0fdf4' } },
    plum:    { name: 'סגול',  colors: { ...DEFAULT_DESIGN.colors, line: '#4c1d95', masechet: '#6d28d9', stripe: '#f5f3ff' } },
    ink:     { name: 'חסכוני בדיו', colors: { line: '#334155', masechet: '#e2e8f0', masechetText: '#0f172a', pass: '#f8fafc', fail: '#f8fafc', stripe: '#ffffff', passMark: '#047857', failMark: '#b91c1c' } }
};

const HEX = /^#[0-9a-fA-F]{6}$/;
const clone = o => JSON.parse(JSON.stringify(o));

function cleanOrder(arr, ids) {
    const out = [];
    (Array.isArray(arr) ? arr : []).forEach(x => { if (ids.includes(x) && !out.includes(x)) out.push(x); });
    ids.forEach(x => { if (!out.includes(x)) out.push(x); });
    return out;
}

// מקבל כל קלט (מהשרת / מהזיכרון) ומחזיר עיצוב תקין ובטוח (הצבעים נכנסים ל-CSS, לכן מאומתים)
export function sanitizeDesign(raw) {
    const d = clone(DEFAULT_DESIGN);
    if (!raw || typeof raw !== 'object') return d;

    [['title', 50], ['subtitle', 50], ['note', 90], ['footerText', 60]].forEach(([k, max]) => {
        if (typeof raw[k] === 'string') d[k] = raw[k].slice(0, max);
    });
    Object.keys(DEFAULT_DESIGN).forEach(k => {
        if (typeof DEFAULT_DESIGN[k] === 'boolean' && typeof raw[k] === 'boolean') d[k] = raw[k];
    });
    d.headerOrder = cleanOrder(raw.headerOrder, HEADER_IDS);
    d.statsOrder = cleanOrder(raw.statsOrder, STAT_IDS);
    STAT_IDS.forEach(id => {
        if (raw.statsVisible && typeof raw.statsVisible[id] === 'boolean') d.statsVisible[id] = raw.statsVisible[id];
    });
    if (['auto', '2', '3', '4', '5'].includes(String(raw.cols))) d.cols = String(raw.cols);
    if (['0.9', '1', '1.1'].includes(String(raw.fontScale))) d.fontScale = String(raw.fontScale);
    if (raw.texts && typeof raw.texts === 'object') {
        Object.keys(DEFAULT_DESIGN.texts).forEach(k => {
            if (typeof raw.texts[k] === 'string') {
                const v = raw.texts[k].trim().slice(0, 40);
                d.texts[k] = (!v || v === LEGACY_TEXTS[k]) ? DEFAULT_DESIGN.texts[k] : v;
            }
        });
    }
    if (raw.colors && typeof raw.colors === 'object') {
        Object.keys(DEFAULT_DESIGN.colors).forEach(k => {
            if (HEX.test(raw.colors[k] || '')) d.colors[k] = raw.colors[k].toLowerCase();
        });
    }
    return d;
}

export const isDefaultDesign = d => JSON.stringify(sanitizeDesign(d)) === JSON.stringify(DEFAULT_DESIGN);

// ---------- אפשרויות הדפסה (מקומיות, לא נשמרות בשרת) ----------
const DEFAULT_PRINT = { hideUnattempted: false, duplex: false, pagesMode: 'auto' };
const DESIGN_CACHE_KEY = 'peer_report_design_v1';
const PRINT_KEY = 'peer_report_print_v1';

// ============================================================
//  עזרים
// ============================================================

export function esc(v) {
    return String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// תא CSV בטוח: מכפיל גרשיים ומנטרל נוסחאות באקסל
export function csvCell(v) {
    let s = String(v ?? '');
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return `"${s.replace(/"/g, '""')}"`;
}

const ONES = ['', 'א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח', 'ט'];
const TENS = ['', 'י', 'כ', 'ל', 'מ', 'נ', 'ס', 'ע', 'פ', 'צ'];
const HUNDS = ['', 'ק', 'ר', 'ש', 'ת'];

export function toHebrewNumeral(n) {
    let s = '';
    while (n >= 400) { s += 'ת'; n -= 400; }
    if (n >= 100) { s += HUNDS[Math.floor(n / 100)]; n %= 100; }
    if (n === 15) s += 'טו';
    else if (n === 16) s += 'טז';
    else { s += TENS[Math.floor(n / 10)] + ONES[n % 10]; }
    if (s.length <= 1) return s + '׳';
    return s.slice(0, -1) + '״' + s.slice(-1);
}

// "ד׳ בחשוון התשפ״ז"
export function formatHebrewDate(date = new Date()) {
    try {
        const parts = new Intl.DateTimeFormat('he-IL-u-ca-hebrew', { day: 'numeric', month: 'long', year: 'numeric' }).formatToParts(date);
        const get = t => (parts.find(p => p.type === t) || {}).value;
        const day = parseInt(get('day'), 10);
        const year = parseInt(get('year') || get('relatedYear'), 10);
        const month = get('month');
        if (!day || !year || !month) throw new Error('missing parts');
        return `${toHebrewNumeral(day)} ${month} ה${toHebrewNumeral(year % 1000 || year)}`;
    } catch (e) {
        return date.toLocaleDateString('he-IL-u-ca-hebrew');
    }
}

const safeName = s => String(s).trim().replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, '_');

// הכהיה קלה של צבע (לפס השני בשורות שעבר / לא עבר)
function darken(hex, f) {
    const n = parseInt(hex.slice(1), 16);
    const ch = v => Math.max(0, Math.round(v * (1 - f))).toString(16).padStart(2, '0');
    return `#${ch((n >> 16) & 255)}${ch((n >> 8) & 255)}${ch(n & 255)}`;
}

// תבנית כרטיס: ה-$ מוחלף במספר (מודגש). בלי $ — הטקסט ואחריו המספר.
function fillTpl(tpl, val) {
    const t = esc(tpl);
    return t.includes('$') ? t.replace('$', () => `<b>${val}</b>`) : `${t} <b>${val}</b>`;
}

function designVars(d) {
    const c = d.colors;
    return `--ln:${c.line};--mb:${c.masechet};--mt:${c.masechetText};--pb:${c.pass};--pb2:${d.rowStripes ? darken(c.pass, .06) : c.pass};` +
           `--fb:${c.fail};--fb2:${d.rowStripes ? darken(c.fail, .06) : c.fail};--sb:${d.rowStripes ? c.stripe : '#ffffff'};--pm:${c.passMark};--fm:${c.failMark};`;
}

// ============================================================
//  חישוב פריסה
// ============================================================

// קיבוץ מבחנים לפי מסכת + סוג. משניות קודם, אחר כך גמרא.
export function groupExams(exams, opts = {}) {
    const byChapter = opts.gemaraByChapter !== false;
    const map = new Map();
    exams.forEach(ex => {
        const d = ex.details || {};
        const name = String(d.masechet || '').trim() || 'כללי';
        const type = ex.exam_type || '';
        const chapter = type === 'gemara' && byChapter ? String(d.chapter_title || '').trim() : '';
        const key = `${name}|${type}|${chapter}`;
        // label = מה שמוצג בכותרת: בגמרא שם הפרק (אם יש), אחרת שם המסכת
        if (!map.has(key)) map.set(key, { name, label: chapter || name, type, typeInfo: typeOf(type), exams: [] });
        map.get(key).exams.push(ex);
    });
    return [...map.values()]
        .map((g, i) => ({ g, i }))
        .sort((a, b) => (a.g.typeInfo.rank - b.g.typeInfo.rank) || (a.i - b.i))
        .map(x => x.g);
}

function flattenItems(groups) {
    const items = [];
    groups.forEach(g => {
        items.push({ t: 'h', g });
        g.exams.forEach((ex, idx) => items.push({ t: 'e', ex, g, idx }));
    });
    return items;
}

// כותרת מסכת לא נשארת לבד בתחתית עמודה; מסכת שנחתכת חוזרת בראש העמודה הבאה (בלי סיכום)
function greedyColumns(items, cap) {
    const cols = [];
    let cur = [];
    const flush = () => { if (cur.length) cols.push(cur); cur = []; };
    items.forEach(it => {
        if (it.t === 'h') {
            const need = Math.min(3, 1 + it.g.exams.length);
            if (cur.length && cur.length + need > cap) flush();
            cur.push(it);
        } else {
            if (cur.length >= cap) {
                flush();
                cur.push({ t: 'h', g: it.g, cont: true });
            }
            cur.push(it);
        }
    });
    flush();
    return cols;
}

function layoutFor(items, P, N, bodyH) {
    const C = P * N;
    const maxCap = Math.floor(bodyH / PAGE.minRow) - 1;
    for (let cap = Math.max(4, Math.ceil(items.length / C)); cap <= maxCap; cap++) {
        const cols = greedyColumns(items, cap);
        if (cols.length <= C) return { cap, cols };
    }
    return null;
}

const rowFor = (cap, bodyH) => Math.min(PAGE.maxRow, (bodyH - 0.5) / (cap + 1));

// opts: { pagesMode: 'auto'|'1'|'2', cols: 'auto'|'2'..'5', bodyH }
// מחזיר: { N, rowH, pages: [ [col, col, ...], ... ] } — השורות מתחלקות שווה בין העמודים
export function planLayout(groups, opts = {}) {
    const bodyH = opts.bodyH || 224;
    const pagesMode = opts.pagesMode || 'auto';
    const colsOpt = opts.cols || 'auto';
    const items = flattenItems(groups);

    const pick = (Ps, nFor) => {
        let best = null;
        for (const P of Ps) {
            for (const N of nFor(P)) {
                const r = layoutFor(items, P, N, bodyH);
                if (!r) continue;
                const cand = { P, N, cols: r.cols, rowH: rowFor(r.cap, bodyH) };
                if (cand.rowH >= PAGE.prefRow) return cand;
                if (!best || cand.rowH > best.rowH) best = cand;
            }
        }
        return best;
    };

    const fixedN = colsOpt !== 'auto' ? [parseInt(colsOpt, 10)] : null;
    const nFor = P => fixedN || (P === 1 ? [2, 3, 4, 5] : [2, 3, 4]);
    const autoPages = Array.from({ length: 20 }, (_, i) => i + 1);
    let chosen = null;

    if (pagesMode === '1') chosen = pick([1], nFor);
    else if (pagesMode === '2') chosen = pick([2], nFor);
    if (!chosen) chosen = pick(autoPages, nFor);
    if (!chosen) chosen = { P: 1, N: 4, cols: [], rowH: PAGE.maxRow };

    const pages = [];
    for (let i = 0; i < chosen.cols.length; i += chosen.N) pages.push(chosen.cols.slice(i, i + chosen.N));
    if (pages.length === 0) pages.push([]);
    return { N: chosen.N, rowH: Math.max(PAGE.minRow, chosen.rowH), pages };
}

export function computeBodyH(hasStats, hasNote) {
    const inner = PAGE.height - 2 * PAGE.padding;
    return inner - PAGE.headH - (hasStats ? 17 : 4) - (hasNote ? 9 : 0) - PAGE.footH - 3;
}

// ---------- נתוני דוגמה לתצוגה החיה ----------
function buildSample(kind) {
    const mk = (masechet, type, n, pre, rw, chapters) => Array.from({ length: n }, (_, i) => {
        const passed = i % 3 === 0 ? true : (i % 7 === 0 ? false : null);
        const details = { masechet };
        if (type === 'mishnayot') details.chapter_num = i + 1;
        else if (chapters) details.chapter_title = chapters[Math.min(chapters.length - 1, Math.floor(i / Math.ceil(n / chapters.length)))];
        return { exam_code: `${pre + 1 + Math.floor(i / 2)}${i % 2 ? 'ב' : 'א'}`, exam_type: type, details, passed, reward_earned: passed === true ? rw : 0 };
    });
    const BK = ['ארבעה אבות', 'כיצד הרגל', 'הכונס', 'שור שנגח'];
    const BM = ['אלו מציאות', 'המפקיד', 'הזהב', 'איזהו נשך', 'השוכר את הפועלים', 'השואל'];
    const KD = ['האשה נקנית', 'האומר', 'מי שאחז'];
    let exams = [];
    if (kind === 'small') {
        exams = [...mk('ברכות', 'mishnayot', 8, 0, 1.4), ...mk('שבת', 'mishnayot', 10, 0, 1.6), ...mk('בבא קמא', 'gemara', 12, 53, 3.0, BK)];
    } else {
        [['ברכות', 9], ['שבת', 24], ['ערובין', 10], ['פסחים', 10], ['שקלים', 8], ['יומא', 7], ['סוכה', 5], ['מגילה', 4], ['ראש השנה', 4], ['ביצה', 5], ['תענית', 4], ['חגיגה', 3]]
            .forEach(([m, n]) => exams.push(...mk(m, 'mishnayot', n, 0, 1.4)));
        exams.push(...mk('בבא מציעא', 'gemara', 60, 49, 3.0, BM), ...mk('בבא קמא', 'gemara', 60, 53, 3.0, BK), ...mk('קדושין', 'gemara', 18, 120, 3.0, KD));
    }
    const passed = exams.filter(e => e.passed === true).length;
    const attempted = exams.filter(e => e.passed !== null).length;
    const reward = exams.reduce((s, e) => s + e.reward_earned, 0);
    return {
        student_code: '1000', first_name: 'ישראל', last_name: 'ישראלי', class_grade: 'ז',
        exams, stats: { total_available_exams: exams.length, total_attempted: attempted, total_passed: passed, total_reward: Math.round(reward * 10) / 10 }
    };
}

// ============================================================
//  המחלקה הראשית
// ============================================================

export class ReportManager {
    constructor(container, apiBase) {
        this.container = container;
        this.apiBase = apiBase;
        this.allStudentsData = [];
        this.classes = [];
        this.logoUrl = 'https://smti.uk/img/peer.jpg';
        this._logoData = null;
        this._scripts = {};
        this.lastRenderedStudents = null;
        this.lastReportName = 'דוחות';

        // עיצוב: קודם מהמטמון המקומי (מיידי), ואז מהשרת (מקור האמת)
        this.designSource = 'default';   // default | server | local
        this.design = this.loadCachedDesign();
        this.print = this.loadPrintOptions();
        this.draft = null;

        this.injectStyles();
        this.injectModal();
        this.injectDesignModal();

        document.addEventListener('click', (e) => {
            const input = document.getElementById('reportStudentSearch');
            const dd = document.getElementById('reportSearchResults');
            if (input && dd && !input.contains(e.target) && !dd.contains(e.target)) dd.classList.add('hidden');
        });
        window.addEventListener('resize', () => { if (this.draft) this.renderDesignPreview(); });

        this.renderView();
        this.loadDesignFromServer();
    }

    // ---------- עיצוב: טעינה / שמירה ----------

    loadCachedDesign() {
        try {
            const raw = localStorage.getItem(DESIGN_CACHE_KEY);
            if (raw) { this.designSource = 'local'; return sanitizeDesign(JSON.parse(raw)); }
        } catch (e) { /* ignore */ }
        return clone(DEFAULT_DESIGN);
    }

    cacheDesign() {
        try {
            if (isDefaultDesign(this.design)) localStorage.removeItem(DESIGN_CACHE_KEY);
            else localStorage.setItem(DESIGN_CACHE_KEY, JSON.stringify(this.design));
        } catch (e) { /* ignore */ }
    }

    loadPrintOptions() {
        try {
            const p = JSON.parse(localStorage.getItem(PRINT_KEY) || '{}') || {};
            return {
                hideUnattempted: p.hideUnattempted === true,
                duplex: p.duplex === true,
                pagesMode: ['auto', '1', '2'].includes(p.pagesMode) ? p.pagesMode : 'auto'
            };
        } catch (e) { return { ...DEFAULT_PRINT }; }
    }

    savePrintOptions() {
        try { localStorage.setItem(PRINT_KEY, JSON.stringify(this.print)); } catch (e) { /* ignore */ }
    }

    async loadDesignFromServer() {
        try {
            const res = await fetch(`${this.apiBase}/report-settings`);
            if (!res.ok) throw new Error('bad response');
            const data = await res.json();
            if (data && data.settings) {
                this.design = sanitizeDesign(data.settings);
                this.designSource = 'server';
            } else {
                this.design = clone(DEFAULT_DESIGN);   // בשרת אין עיצוב מותאם
                this.designSource = 'default';
            }
            this.cacheDesign();
        } catch (e) {
            // השרת לא זמין / הטבלה עוד לא נוצרה — ממשיכים עם מה שיש במטמון
            this.designSource = isDefaultDesign(this.design) ? 'default' : 'local';
        }
        this.updateDesignBadge();
    }

    // שמירה בשרת. מחזיר true אם נשמר בשרת.
    async persistDesign(design) {
        this.design = sanitizeDesign(design);
        this.cacheDesign();
        try {
            const res = isDefaultDesign(this.design)
                ? await fetch(`${this.apiBase}/report-settings`, { method: 'DELETE' })
                : await fetch(`${this.apiBase}/report-settings`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ settings: this.design })
                });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                if (!data.message) {
                    const why = String(data.error || '');
                    const hint = /no such table/i.test(why)
                        ? 'הטבלה report_settings לא קיימת ב-D1 — יש להריץ את פקודת יצירת הטבלה.'
                        : (why ? `(${res.status}: ${why})` : `(קוד ${res.status})`);
                    await window.customAlert(`השמירה בשרת נכשלה. ${hint}\nהעיצוב נשמר רק במחשב הזה.`, true);
                }
                this.designSource = isDefaultDesign(this.design) ? 'default' : 'local';
                this.updateDesignBadge();
                return false;
            }
            // אימות: קוראים חזרה מהשרת ובודקים שמה שנשמר זהה למה ששלחנו
            let verified = true;
            try {
                const chk = await fetch(`${this.apiBase}/report-settings`);
                if (chk.ok) {
                    const v = await chk.json();
                    verified = JSON.stringify(sanitizeDesign(v.settings)) === JSON.stringify(this.design);
                }
            } catch (e) { /* אם הקריאה החוזרת נכשלה — לא מכריזים על כשלון */ }
            if (!verified) {
                await window.customAlert('השרת אישר את השמירה, אבל הקריאה החוזרת לא החזירה את אותם נתונים. כדאי לנסות שוב.', 'warning');
                this.designSource = 'local';
                this.updateDesignBadge();
                return false;
            }
            this.designSource = isDefaultDesign(this.design) ? 'default' : 'server';
            this.updateDesignBadge();
            return true;
        } catch (e) {
            await window.customAlert('שגיאת תקשורת. העיצוב נשמר רק במחשב הזה.', true);
            this.designSource = isDefaultDesign(this.design) ? 'default' : 'local';
            this.updateDesignBadge();
            return false;
        }
    }

    updateDesignBadge() {
        const el = document.getElementById('rpDesignBadge');
        if (!el) return;
        const map = {
            default: ['ברירת מחדל', 'badge'],
            server:  ['מותאם אישית · נשמר בשרת', 'badge badge-success'],
            local:   ['מותאם אישית · רק במחשב זה', 'badge badge-info']
        };
        const [text, cls] = map[this.designSource] || map.default;
        el.textContent = text;
        el.className = cls;
    }

    // ---------- נתונים ----------

    async fetchStudentSummaries() {
        try {
            const response = await fetch(`${this.apiBase}/student-summary`);
            if (response.ok) {
                const data = await response.json();
                this.allStudentsData = Array.isArray(data) ? data : [];
            } else {
                console.error('שגיאה בטעינת נתוני דוחות');
            }
        } catch (error) {
            console.error('שגיאת רשת בטעינת דוחות', error);
        }
        this.classes = Array.from(new Set(this.allStudentsData.map(s => s.class_grade).filter(Boolean)))
            .sort((a, b) => String(a).localeCompare(String(b), 'he'));
        this.renderView();
    }

    setStudents() {
        this.fetchStudentSummaries();
    }

    // ============================================================
    //  CSS
    // ============================================================

    injectStyles() {
        if (document.getElementById('reportStyles')) return;
        const css = `
        /* ---------- הדוח המודפס ---------- */
        .rp-page { --ln:#0f172a; --mb:#1e293b; --mt:#ffffff; --pb:#ecfdf5; --pb2:#d8f6e5; --fb:#fef2f2; --fb2:#fde3e3; --sb:#f1f5f9; --pm:#059669; --fm:#dc2626;
            width: ${PAGE.width}mm; height: ${PAGE.height}mm; padding: ${PAGE.padding}mm; box-sizing: border-box;
            background: #fff; color: #0f172a; direction: rtl; position: relative; overflow: hidden;
            display: flex; flex-direction: column; margin: 0 auto 12px auto; box-shadow: 0 4px 14px rgba(15,23,42,.2);
            font-family: 'Segoe UI', 'Noto Sans Hebrew', Arial, sans-serif;
            -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        .rp-page *, .rp-page *::before, .rp-page *::after { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }

        .rp-bsd { position: absolute; top: 3.2mm; left: 0; right: 0; text-align: center; font-size: 3mm; color: #475569; font-weight: 600; }
        .rp-head { height: ${PAGE.headH}mm; flex: none; display: flex; align-items: center; gap: 5mm; border-bottom: .7mm solid var(--ln); padding-bottom: 3mm; }
        .rp-logo { height: 20mm; width: auto; max-width: 32mm; object-fit: contain; flex: none; }
        .rp-title { flex: 1; min-width: 0; }
        .rp-title h1 { margin: 0; font-weight: 800; line-height: 1.15; color: var(--ln); }
        .rp-sub { margin-top: 1mm; font-size: 3.8mm; font-weight: 700; color: #334155; line-height: 1.2; }
        .rp-date { margin-top: 1.2mm; font-size: 3.4mm; color: #475569; font-weight: 600; }
        .rp-student { flex: none; max-width: 66mm; }
        .rp-student .rp-name { font-size: 5.4mm; font-weight: 800; line-height: 1.15; }
        .rp-student .rp-meta { margin-top: 1.2mm; font-size: 3.4mm; color: #334155; }
        .rp-chip { display: inline-block; background: #e2e8f0; border-radius: 1mm; padding: .3mm 1.6mm; margin-right: 1.5mm; font-size: 3mm; }

        .rp-stats { height: 11mm; flex: none; display: flex; gap: 3mm; margin: 3mm 0; }
        .rp-stat { flex: 1; border: .3mm solid #cbd5e1; border-radius: 1.5mm; background: #f8fafc; display: flex; align-items: center; justify-content: center; gap: 1.8mm; font-size: 3.2mm; color: #334155; white-space: nowrap; }
        .rp-stat b { font-size: 4.8mm; font-weight: 800; color: #0f172a; }
        .rp-stat.ok b { color: var(--pm); } .rp-stat.bad b { color: var(--fm); } .rp-stat.money b { color: #0284c7; }
        .rp-gap { height: 4mm; flex: none; }
        .rp-note { flex: none; height: 7mm; margin-bottom: 2mm; border-radius: 1.5mm; background: #f1f5f9; border-right: 1.3mm solid var(--ln); display: flex; align-items: center; padding: 0 3mm; font-size: 3.3mm; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

        .rp-body { flex: none; display: flex; gap: 3mm; align-items: flex-start; }
        .rp-col { flex: 1; min-width: 0; border-top: .25mm solid #94a3b8; border-left: .25mm solid #cbd5e1; border-right: .25mm solid #cbd5e1; }
        .rp-colhead, .rp-row { height: var(--rh); font-size: var(--fs); display: grid; grid-template-columns: 1fr 8mm 11mm; align-items: stretch; }
        .rp-colhead.no-rw, .rp-row.no-rw { grid-template-columns: 1fr 8mm; }
        .rp-colhead > span, .rp-row > span { display: flex; align-items: center; justify-content: center; text-align: center; min-width: 0; }
        .rp-colhead > span:first-child, .rp-row > span:first-child { padding: 0 2mm; }
        .rp-colhead > span:not(:first-child), .rp-row > span:not(:first-child) { border-right: .2mm solid #cbd5e1; }
        .rp-colhead { background: #e2e8f0; color: #0f172a; font-weight: 700; border-bottom: .25mm solid #94a3b8; }

        /* כותרת מסכת — אותו צבע לשניהם; ההבדל בין משניות לגמרא בתווית */
        .rp-mh { height: var(--rh); font-size: var(--fs); display: flex; align-items: center; justify-content: center; gap: 1.8mm; padding: 0 2mm; background: var(--mb); color: var(--mt); font-weight: 800; white-space: nowrap; overflow: hidden; }
        .rp-pill { flex: none; font-size: .78em; font-weight: 800; padding: .1mm 1.9mm; border-radius: 10mm; border: .25mm solid var(--mt); }
        .rp-mh.t-m .rp-pill { background: transparent; color: var(--mt); }
        .rp-mh.t-g .rp-pill { background: var(--mt); color: var(--mb); }
        .rp-mh-stat { margin-right: 0; font-weight: 600; font-size: .9em; opacity: .95; }

        .rp-row { background: #fff; border-bottom: .25mm solid #cbd5e1; }
        .rp-row.s1 { background: var(--sb); }
        .rp-row .c-code { font-weight: 700; color: #1e293b; white-space: nowrap; overflow: hidden; }
        .rp-row .c-ch, .rp-legend .c-ch { font-family: 'Frank Ruehl CLM', 'David CLM', 'David Libre', David, 'Times New Roman', serif; font-weight: 700; font-size: 1.12em; line-height: 1; color: #334155; }
        .rp-row .c-ch { margin-right: 1.2mm; padding-right: 1.2mm; border-right: .2mm solid #94a3b8; }
        .rp-row .c-mark { font-weight: 900; font-size: 1.1em; }
        .rp-row .c-rw { font-weight: 600; color: #475569; white-space: nowrap; }
        .rp-row.pass { background: var(--pb); } .rp-row.pass.s1 { background: var(--pb2); } .rp-row.pass .c-mark { color: var(--pm); }
        .rp-row.fail { background: var(--fb); } .rp-row.fail.s1 { background: var(--fb2); } .rp-row.fail .c-mark { color: var(--fm); }
        .rp-row.none .c-code { font-weight: 500; color: #64748b; }
        .rp-empty { width: 100%; text-align: center; padding: 20mm 0; color: #64748b; font-size: 4mm; }

        .rp-foot { margin-top: auto; flex: none; height: 6mm; padding-top: 1.2mm; border-top: .2mm solid #e2e8f0; display: flex; justify-content: space-between; align-items: center; font-size: 2.7mm; color: #64748b; gap: 4mm; }
        .rp-legend { display: flex; gap: 3mm; align-items: center; white-space: nowrap; }
        .rp-legend .ok { color: var(--pm); font-weight: 900; } .rp-legend .no { color: var(--fm); font-weight: 900; }
        .rp-blank { background: #fff; }
        @media screen { .rp-blank:not(.rp-export)::after { content: 'גב הדף – ריק בכוונה (הדפסה דו צדדית)'; position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; color: #94a3b8; font-size: 4mm; border: .4mm dashed #cbd5e1; margin: 9mm; } }

        @media print {
            @page { size: A4 portrait; margin: 0; }
            .rp-page { margin: 0 !important; box-shadow: none !important; break-after: page; page-break-after: always; }
            .rp-page:last-child { break-after: auto; page-break-after: auto; }
        }

        /* ---------- מודל ההתאמה האישית ---------- */
        .rd-modal { max-width: 1180px; width: 96%; height: 92vh; border-radius: 14px; overflow: hidden; background: #fff; }
        .rd-body { flex: 1; min-height: 0; display: flex; }
        .rd-controls { width: 410px; flex: none; display: flex; flex-direction: column; border-left: 1px solid var(--border-color); min-height: 0; }
        .rd-tabs { display: flex; gap: 4px; padding: 10px 12px 0; border-bottom: 1px solid var(--border-color); background: #f8fafc; }
        .rd-tab { border: none; background: transparent; padding: 8px 14px; font-size: .88rem; font-weight: 600; color: var(--text-muted); cursor: pointer; border-radius: 8px 8px 0 0; border-bottom: 3px solid transparent; }
        .rd-tab:hover { color: var(--primary-color); }
        .rd-tab.active { color: var(--primary-color); border-bottom-color: var(--primary-color); background: #fff; }
        .rd-pane { flex: 1; overflow: auto; padding: 16px; display: flex; flex-direction: column; gap: 14px; }
        .rd-pane > * { flex: none; }
        .rd-group { border: 1px solid var(--border-color); border-radius: 10px; padding: 12px 14px; display: flex; flex-direction: column; gap: 10px; }
        .rd-group h4 { font-size: .88rem; color: #0f172a; display: flex; justify-content: space-between; align-items: center; margin: 0; }
        .rd-savebar { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; position: sticky; top: -16px; background: #fff; padding: 8px 0; z-index: 2; }
        .rd-tgrid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 10px; }
        .rd-hint { font-size: .74rem; color: var(--text-muted); line-height: 1.4; }
        .rd-field label.rd-lbl { display: block; font-size: .78rem; font-weight: 600; color: #475569; margin-bottom: 4px; }
        .rd-field input[type=text], .rd-field select { width: 100%; padding: 8px 10px; border: 1px solid var(--border-color); border-radius: 8px; font-size: .88rem; outline: none; background: #f8fafc; font-family: inherit; }
        .rd-field input:focus, .rd-field select:focus { border-color: var(--primary-color); background: #fff; box-shadow: 0 0 0 3px rgba(37,99,235,.12); }
        .rd-switch { display: flex; align-items: center; gap: 10px; cursor: pointer; font-size: .86rem; color: #1e293b; }
        .rd-switch input { position: absolute; opacity: 0; pointer-events: none; }
        .rd-slider { position: relative; width: 36px; height: 20px; border-radius: 99px; background: #cbd5e1; flex: none; transition: .2s; }
        .rd-slider::after { content: ''; position: absolute; top: 2px; right: 2px; width: 16px; height: 16px; border-radius: 50%; background: #fff; box-shadow: 0 1px 3px rgba(0,0,0,.25); transition: .2s; }
        .rd-switch input:checked + .rd-slider { background: var(--primary-color); }
        .rd-switch input:checked + .rd-slider::after { right: 18px; }
        .rd-orderrow { display: flex; align-items: center; gap: 8px; padding: 6px 8px; border: 1px solid var(--border-color); border-radius: 8px; background: #f8fafc; font-size: .86rem; }
        .rd-orderrow .rd-name { flex: 1; }
        .rd-orderrow.off .rd-name { opacity: .45; text-decoration: line-through; }
        .rd-mv { border: 1px solid var(--border-color); background: #fff; width: 26px; height: 26px; border-radius: 6px; cursor: pointer; font-size: .8rem; color: #334155; }
        .rd-mv:hover:not(:disabled) { background: #eff6ff; border-color: #93c5fd; }
        .rd-mv:disabled { opacity: .3; cursor: default; }
        .rd-colorrow { display: flex; align-items: center; gap: 10px; font-size: .86rem; }
        .rd-colorrow .rd-name { flex: 1; }
        .rd-colorrow input[type=color] { width: 38px; height: 28px; border: 1px solid var(--border-color); border-radius: 6px; padding: 1px; background: #fff; cursor: pointer; }
        .rd-colorrow code { font-size: .72rem; color: var(--text-muted); width: 58px; text-align: left; direction: ltr; }
        .rd-presets { display: flex; flex-wrap: wrap; gap: 6px; }
        .rd-preset { display: inline-flex; align-items: center; gap: 6px; border: 1px solid var(--border-color); background: #fff; border-radius: 999px; padding: 4px 11px 4px 9px; font-size: .78rem; font-weight: 600; cursor: pointer; }
        .rd-preset:hover { border-color: #93c5fd; background: #eff6ff; }
        .rd-preset i { display: inline-block; width: 12px; height: 12px; border-radius: 50%; }
        .rd-link { background: none; border: none; color: var(--primary-color); font-size: .75rem; font-weight: 600; cursor: pointer; }
        .rd-link:hover { text-decoration: underline; }
        .rd-preview { flex: 1; min-width: 0; background: #cbd5e1; display: flex; flex-direction: column; }
        .rd-prev-bar { flex: none; display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 8px 14px; background: #e2e8f0; border-bottom: 1px solid #cbd5e1; font-size: .8rem; color: #334155; flex-wrap: wrap; }
        .rd-prev-bar select { padding: 4px 8px; border: 1px solid #cbd5e1; border-radius: 6px; background: #fff; font-size: .8rem; }
        .rd-stage { flex: 1; min-height: 0; overflow: hidden; display: flex; justify-content: center; align-items: flex-start; padding: 12px; }
        .rd-foot { flex: none; display: flex; align-items: center; gap: 10px; padding: 10px 16px; border-top: 1px solid var(--border-color); background: #f8fafc; }
        .rd-foot .rd-status { flex: 1; font-size: .8rem; color: var(--text-muted); }
        @media (max-width: 900px) {
            .rd-body { flex-direction: column; }
            .rd-controls { width: 100%; height: 55%; border-left: none; border-bottom: 1px solid var(--border-color); }
        }`;
        const style = document.createElement('style');
        style.id = 'reportStyles';
        style.textContent = css;
        document.head.appendChild(style);
    }

    // ============================================================
    //  מודל התצוגה המקדימה להדפסה
    // ============================================================

    injectModal() {
        if (document.getElementById('printReportModal')) return;
        const modalHtml = `
        <div id="printReportModal" class="modal hidden no-print" style="z-index: 9999;">
            <div class="modal-content" style="max-width: 1000px; height: 95vh; background: #e2e8f0; border-radius: 12px; overflow: hidden;">
                <div class="modal-header no-print" style="background: white; padding: 15px 20px; box-shadow: 0 2px 10px rgba(0,0,0,0.05);">
                    <div style="display:flex; align-items:center; gap:12px;">
                        <h3 style="margin: 0; font-size: 1.2rem; color: #0f172a;"><i class="fas fa-print" style="color: var(--primary-color);"></i> תצוגה מקדימה להדפסה</h3>
                        <span id="rpSummary" style="font-size:.8rem; color: var(--text-muted);"></span>
                    </div>
                    <div style="display:flex; gap:10px; align-items:center;">
                        <button class="btn btn-outline btn-sm" id="exportReportCsvBtn" title="ייצא טבלה לאקסל"><i class="fas fa-file-excel"></i> ייצוא אקסל</button>
                        <button class="btn btn-secondary btn-sm" id="directDownloadPdfBtn" title="הורד קובץ PDF"><i class="fas fa-file-pdf"></i> הורד PDF</button>
                        <button class="btn btn-primary btn-sm" id="printReportBtn" title="הדפסה, או שמירה כ-PDF איכותי"><i class="fas fa-print"></i> הדפס</button>
                        <button class="close-modal-btn" id="closeReportModalBtn" style="margin-right: 15px; font-size: 1.5rem;">&times;</button>
                    </div>
                </div>
                <div class="modal-body" id="printReportBodyWrapper" style="padding: 20px; overflow: auto; background: #cbd5e1; display: block;">
                    <div id="printReportBody" style="width: 210mm; margin: 0 auto;"></div>
                </div>
            </div>
        </div>`;
        document.body.insertAdjacentHTML('beforeend', modalHtml);

        document.getElementById('exportReportCsvBtn').addEventListener('click', () => {
            if (this.lastRenderedStudents) this.exportToExcel(this.lastRenderedStudents);
        });
        document.getElementById('directDownloadPdfBtn').addEventListener('click', () => this.downloadDirectPdf());
        document.getElementById('printReportBtn').addEventListener('click', () => this.printReport());
        document.getElementById('closeReportModalBtn').addEventListener('click', () => {
            document.getElementById('printReportModal').classList.add('hidden');
        });
    }

    // ============================================================
    //  המסך הראשי
    // ============================================================

    renderView() {
        const p = this.print;
        const inputStyle = 'padding: 8px; border-radius: 6px; border: 1px solid #cbd5e1; background: white; outline: none; font-size: 0.9rem;';

        this.container.innerHTML = `
            <div class="card compact-card no-print" style="margin-bottom: 20px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
                <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; border-bottom: 1px solid var(--border-color); padding-bottom: 15px; margin-bottom: 20px;">
                    <h3 style="margin: 0; font-size: 1.15rem; color: #1e293b;"><i class="fas fa-file-invoice" style="color: var(--primary-color);"></i> הפקת דוחות הישגים</h3>
                    <div style="display:flex; align-items:center; gap:12px;">
                        <span id="rpDesignBadge" class="badge"></span>
                        <button class="btn btn-secondary" id="openDesignBtn"><i class="fas fa-palette"></i> התאמה אישית של הדוח</button>
                    </div>
                </div>

                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 20px;">
                    <div style="background: white; padding: 20px; border-radius: 8px; border: 1px solid #e2e8f0; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
                        <h4 style="margin-top: 0; margin-bottom: 4px; font-size: 1rem;"><i class="fas fa-user"></i> תלמיד בודד</h4>
                        <p class="text-muted" style="font-size: .8rem; margin-bottom: 12px;">הקלידו שם או קוד, ולחצו על התלמיד — הדוח נפתח מיד.</p>
                        <div class="search-box">
                            <i class="fas fa-search search-icon"></i>
                            <input type="text" id="reportStudentSearch" placeholder="הקלד קוד או שם תלמיד..." autocomplete="off" style="width: 100%; padding: 10px 35px 10px 15px; border-radius: 6px;">
                            <div id="reportSearchResults" class="search-results-dropdown hidden" style="top: 100%; margin-top: 5px;"></div>
                        </div>
                    </div>

                    <div style="background: white; padding: 20px; border-radius: 8px; border: 1px solid #e2e8f0; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
                        <h4 style="margin-top: 0; margin-bottom: 4px; font-size: 1rem;"><i class="fas fa-users"></i> כיתה שלמה</h4>
                        <p class="text-muted" style="font-size: .8rem; margin-bottom: 12px;">בחרו כיתה — כל התלמידים בקובץ אחד, עמוד לתלמיד.</p>
                        <div style="display: flex; gap: 10px;">
                            <select id="reportClassSelect" style="flex:1; padding: 10px; border: 1px solid #cbd5e1; border-radius: 6px; background: white; outline: none;">
                                <option value="">-- בחר כיתה --</option>
                                ${this.classes.map(c => `<option value="${esc(c)}">כיתה ${esc(c)}</option>`).join('')}
                            </select>
                            <button class="btn btn-primary" id="generateClassReportBtn" style="padding: 0 20px;"><i class="fas fa-magic"></i> הפק דוחות</button>
                        </div>
                    </div>
                </div>

                <div style="margin-top: 20px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 18px; display: flex; flex-wrap: wrap; gap: 14px 26px; align-items: center;">
                    <span style="font-weight: 700; color: #0f172a;"><i class="fas fa-print"></i> אפשרויות הדפסה</span>
                    <label style="display: flex; align-items: center; gap: 8px; font-size: 0.9rem; cursor: pointer;">
                        <input type="checkbox" data-p="hideUnattempted" ${p.hideUnattempted ? 'checked' : ''} style="width: 16px; height: 16px;"> הסתר בחינות שלא בוצעו
                    </label>
                    <label style="display: flex; align-items: center; gap: 8px; font-size: 0.9rem;">אורך הדוח:
                        <select data-p="pagesMode" style="${inputStyle}">
                            <option value="auto" ${p.pagesMode === 'auto' ? 'selected' : ''}>אוטומטי</option>
                            <option value="1" ${p.pagesMode === '1' ? 'selected' : ''}>עמוד אחד (כתב קטן)</option>
                            <option value="2" ${p.pagesMode === '2' ? 'selected' : ''}>שני עמודים (כתב גדול)</option>
                        </select>
                    </label>
                    <label style="display: flex; align-items: center; gap: 8px; font-size: 0.9rem; cursor: pointer;" title="תלמיד עם עמוד אחד מקבל גב ריק, כדי שהבא אחריו יתחיל בדף חדש">
                        <input type="checkbox" data-p="duplex" ${p.duplex ? 'checked' : ''} style="width: 16px; height: 16px;"> הדפסה דו צדדית
                    </label>
                </div>
            </div>
        `;
        this.attachMainEvents();
        this.updateDesignBadge();
    }

    attachMainEvents() {
        const searchInput = document.getElementById('reportStudentSearch');
        const resultsDropdown = document.getElementById('reportSearchResults');

        document.getElementById('openDesignBtn').addEventListener('click', () => this.openDesignModal());

        this.container.querySelectorAll('[data-p]').forEach(el => {
            el.addEventListener('change', () => {
                this.print[el.dataset.p] = el.type === 'checkbox' ? el.checked : el.value;
                this.savePrintOptions();
            });
        });

        searchInput.addEventListener('input', (e) => {
            const term = e.target.value.trim().toLowerCase();
            if (term.length === 0) {
                resultsDropdown.innerHTML = '';
                resultsDropdown.classList.add('hidden');
                return;
            }

            const filtered = this.allStudentsData.filter(s =>
                String(s.student_code).toLowerCase().includes(term) ||
                `${s.first_name} ${s.last_name}`.toLowerCase().includes(term)
            ).slice(0, 10);

            resultsDropdown.innerHTML = '';
            if (filtered.length === 0) {
                const empty = document.createElement('div');
                empty.style.cssText = 'padding:10px;text-align:center;';
                empty.textContent = 'לא נמצאו תלמידים';
                resultsDropdown.appendChild(empty);
            } else {
                filtered.forEach(student => {
                    const item = document.createElement('div');
                    item.className = 'search-result-item';
                    const name = document.createElement('span');
                    name.className = 'result-name';
                    name.textContent = `${student.first_name} ${student.last_name}`;
                    const code = document.createElement('span');
                    code.className = 'result-code';
                    code.textContent = student.student_code;
                    item.append(name, document.createTextNode(' '), code);

                    item.addEventListener('click', () => {
                        searchInput.value = '';
                        resultsDropdown.classList.add('hidden');
                        this.generateAndShowReport(`?student_code=${encodeURIComponent(student.student_code)}`,
                            safeName(`דוח_${student.first_name}_${student.last_name}`));
                    });
                    resultsDropdown.appendChild(item);
                });
            }
            resultsDropdown.classList.remove('hidden');
        });

        document.getElementById('generateClassReportBtn').addEventListener('click', async () => {
            const cls = document.getElementById('reportClassSelect').value;
            if (!cls) return await window.customAlert('נא לבחור כיתה', true);
            this.generateAndShowReport(`?class_grade=${encodeURIComponent(cls)}`, safeName(`דוחות_כיתה_${cls}`));
        });
    }

    async generateAndShowReport(queryParams, reportName) {
        const btn = document.getElementById('generateClassReportBtn');
        const originalText = btn ? btn.innerHTML : '';
        if (btn) { btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> מעבד נתונים...'; btn.disabled = true; }

        try {
            const response = await fetch(`${this.apiBase}/student-summary${queryParams}`);
            if (response.ok) {
                const data = await response.json();
                const students = Array.isArray(data) ? data : (data ? [data] : []);
                if (students.length === 0) {
                    await window.customAlert('לא נמצאו נתונים לחיפוש זה.', true);
                } else {
                    this.lastRenderedStudents = students;
                    this.lastReportName = reportName || 'דוחות';
                    await this.buildReportHtml(students);
                }
            } else {
                await window.customAlert('שגיאה במשיכת נתונים מהשרת.', true);
            }
        } catch (error) {
            await window.customAlert('שגיאת תקשורת.', true);
        } finally {
            if (btn) { btn.innerHTML = originalText; btn.disabled = false; }
        }
    }

    // ============================================================
    //  מודל ההתאמה האישית
    // ============================================================

    injectDesignModal() {
        if (document.getElementById('reportDesignModal')) return;
        document.body.insertAdjacentHTML('beforeend', `
        <div id="reportDesignModal" class="modal hidden no-print" style="z-index: 9990;">
            <div class="modal-content rd-modal">
                <div class="modal-header" style="padding: 12px 18px;">
                    <h3 style="font-size: 1.1rem;"><i class="fas fa-palette" style="color: var(--primary-color);"></i> התאמה אישית של הדוח</h3>
                    <button class="close-modal-btn" id="rdCloseBtn">&times;</button>
                </div>
                <div class="rd-body">
                    <div class="rd-controls">
                        <div class="rd-tabs" id="rdTabs">
                            <button class="rd-tab active" data-tab="text">טקסטים</button>
                            <button class="rd-tab" data-tab="layout">סדר ופריסה</button>
                            <button class="rd-tab" data-tab="colors">צבעים</button>
                            <button class="rd-tab" data-tab="show">הצגה</button>
                        </div>
                        <div class="rd-pane" id="rdPane"></div>
                    </div>
                    <div class="rd-preview">
                        <div class="rd-prev-bar">
                            <span>תצוגה חיה — דוגמה:
                                <select id="rdSample">
                                    <option value="small">תלמיד עם מעט בחינות</option>
                                    <option value="large">תלמיד עם הרבה בחינות</option>
                                    <option value="real">תלמיד אמיתי מהמערכת</option>
                                </select>
                            </span>
                            <span id="rdPageInfo"></span>
                        </div>
                        <div class="rd-stage" id="rdStage"></div>
                    </div>
                </div>
                <div class="rd-foot">
                    <button class="btn btn-outline" id="rdResetAllBtn"><i class="fas fa-rotate-left"></i> איפוס לברירת מחדל</button>
                    <span class="rd-status" id="rdStatus"></span>
                    <button class="btn btn-outline" id="rdCancelBtn">ביטול</button>
                    <button class="btn btn-primary" id="rdSaveBtn"><i class="fas fa-cloud-arrow-up"></i> שמור בשרת</button>
                </div>
            </div>
        </div>`);

        const modal = document.getElementById('reportDesignModal');
        document.getElementById('rdCloseBtn').addEventListener('click', () => this.closeDesignModal());
        document.getElementById('rdCancelBtn').addEventListener('click', () => this.closeDesignModal());
        document.getElementById('rdSaveBtn').addEventListener('click', () => this.saveDraft());
        document.getElementById('rdResetAllBtn').addEventListener('click', () => this.resetDraft('all'));
        document.getElementById('rdSample').addEventListener('change', () => this.renderDesignPreview());

        document.getElementById('rdTabs').addEventListener('click', (e) => {
            const b = e.target.closest('.rd-tab');
            if (!b) return;
            this.rdTab = b.dataset.tab;
            modal.querySelectorAll('.rd-tab').forEach(t => t.classList.toggle('active', t === b));
            this.renderDesignPane();
        });

        const pane = document.getElementById('rdPane');
        const onField = (e) => {
            const el = e.target.closest('[data-d]');
            if (!el) return;
            this.setDraft(el.dataset.d, el.type === 'checkbox' ? el.checked : el.value);
            if (el.type === 'color') { const code = el.parentElement.querySelector('code'); if (code) code.textContent = el.value; }
            this.renderDesignPreview();
        };
        pane.addEventListener('input', onField);
        pane.addEventListener('change', onField);
        pane.addEventListener('click', (e) => {
            const mv = e.target.closest('[data-move]');
            if (mv) {
                const [key, id, dir] = mv.dataset.move.split('|');
                const arr = this.draft[key];
                const i = arr.indexOf(id), j = i + parseInt(dir, 10);
                if (i >= 0 && j >= 0 && j < arr.length) { [arr[i], arr[j]] = [arr[j], arr[i]]; }
                this.renderDesignPane();
                this.renderDesignPreview();
                return;
            }
            const preset = e.target.closest('[data-preset]');
            if (preset) {
                this.draft.colors = { ...PRESETS[preset.dataset.preset].colors };
                this.renderDesignPane();
                this.renderDesignPreview();
                return;
            }
            const rs = e.target.closest('[data-reset]');
            if (rs) this.resetDraft(rs.dataset.reset);
        });
    }

    // data-d="title" או "colors.line" או "statsVisible.passed"
    setDraft(path, value) {
        const parts = path.split('.');
        let obj = this.draft;
        for (let i = 0; i < parts.length - 1; i++) obj = obj[parts[i]];
        obj[parts[parts.length - 1]] = value;
    }

    async openDesignModal() {
        this.draft = clone(this.design);
        this.rdTab = 'text';
        document.querySelectorAll('#rdTabs .rd-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === 'text'));
        document.getElementById('rdStatus').textContent = '';
        document.getElementById('reportDesignModal').classList.remove('hidden');
        this.renderDesignPane();
        this.renderDesignPreview();
        this.getLogo().then(() => { if (this.draft) this.renderDesignPreview(); });   // טוען את הלוגו ומרענן
    }

    async closeDesignModal(force = false) {
        if (!force && this.draft && JSON.stringify(sanitizeDesign(this.draft)) !== JSON.stringify(this.design)) {
            const ok = await window.customConfirm('יש שינויים שלא נשמרו. לסגור בלי לשמור?');
            if (!ok) return;
        }
        this.draft = null;
        document.getElementById('reportDesignModal').classList.add('hidden');
    }

    // כפתור "שמור בשרת" היחיד: שומר את כל העיצוב כולל כל הטקסטים הקבועים, ובודק מול השרת שנשמר
    async saveDraft() {
        const btn = document.getElementById('rdSaveBtn');
        const status = document.getElementById('rdStatus');
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> שומר...';
        status.textContent = '';
        const ok = await this.persistDesign(this.draft);
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-cloud-arrow-up"></i> שמור בשרת';
        status.textContent = ok ? 'נשמר בשרת ✓ (העיצוב והטקסטים נבדקו מול השרת)' : 'לא נשמר בשרת — נשמר רק במחשב זה';
        if (ok) {
            window.customAlert('העיצוב וכל הטקסטים נשמרו בשרת ✓');
            setTimeout(() => this.closeDesignModal(true), 700);
        }
    }

    async resetDraft(what) {
        if (what === 'all') {
            const ok = await window.customConfirm('לאפס את כל ההתאמות לברירת המחדל?');
            if (!ok) return;
            this.draft = clone(DEFAULT_DESIGN);
        } else if (what === 'texts') {
            this.draft.texts = clone(DEFAULT_DESIGN.texts);
        } else if (what === 'colors') {
            this.draft.colors = clone(DEFAULT_DESIGN.colors);
        } else if (what === 'order') {
            this.draft.headerOrder = [...DEFAULT_DESIGN.headerOrder];
            this.draft.statsOrder = [...DEFAULT_DESIGN.statsOrder];
            this.draft.statsVisible = { ...DEFAULT_DESIGN.statsVisible };
            this.draft.showLogo = DEFAULT_DESIGN.showLogo;
        }
        this.renderDesignPane();
        this.renderDesignPreview();
    }

    // ---------- לשוניות המודל ----------

    renderDesignPane() {
        const d = this.draft;
        const pane = document.getElementById('rdPane');
        if (!d || !pane) return;

        const text = (key, label, ph, max) => `<div class="rd-field"><label class="rd-lbl">${label}</label><input type="text" data-d="${key}" value="${esc(d[key])}" placeholder="${esc(ph)}" maxlength="${max}" autocomplete="off"></div>`;
        const sw = (key, label) => `<label class="rd-switch"><input type="checkbox" data-d="${key}" ${d[key] ? 'checked' : ''}><span class="rd-slider"></span><span>${label}</span></label>`;
        const orderRow = (key, id, label, visKey) => {
            const arr = d[key], i = arr.indexOf(id);
            const on = visKey ? (visKey.includes('.') ? d[visKey.split('.')[0]][visKey.split('.')[1]] : d[visKey]) : true;
            return `<div class="rd-orderrow ${on ? '' : 'off'}">
                ${visKey ? `<input type="checkbox" data-d="${visKey}" ${on ? 'checked' : ''} style="width:16px;height:16px" title="הצג / הסתר">` : ''}
                <span class="rd-name">${esc(label)}</span>
                <button class="rd-mv" data-move="${key}|${id}|-1" ${i === 0 ? 'disabled' : ''} title="הקדם (ימינה)">▲</button>
                <button class="rd-mv" data-move="${key}|${id}|1" ${i === arr.length - 1 ? 'disabled' : ''} title="אחר (שמאלה)">▼</button>
            </div>`;
        };

        let html = '';
        if (this.rdTab === 'text') {
            html = `
            <div class="rd-group">
                <h4>כותרות</h4>
                ${text('title', 'כותרת הדוח', DEFAULT_DESIGN.title, 50)}
                ${text('subtitle', 'כותרת משנה (לא חובה)', 'לדוגמה: מחזור חורף', 50)}
                ${sw('bsd', 'בס״ד בראש העמוד')}
            </div>
            <div class="rd-group">
                <h4>הודעות</h4>
                ${text('note', 'הודעה לתלמיד (פס מתחת לסיכום, לא חובה)', 'לדוגמה: יישר כוחך! המשך כך', 90)}
                ${text('footerText', 'טקסט בתחתית העמוד', DEFAULT_DESIGN.footerText, 60)}
            </div>
            <div class="rd-group">
                <h4>טקסטים קבועים בדוח <button class="rd-link" data-reset="texts">איפוס טקסטים</button></h4>
                <div class="rd-hint">אפשר לשנות כל מילה שמופיעה בדוח. בכרטיסי הסיכום הסימן $ הוא מקום המספר, למשל: נבחן ב-$ בחינות. שדה ריק חוזר לברירת המחדל.</div>
                <div class="rd-tgrid">${TEXT_LABELS.map(([k, label]) => `<div class="rd-field"><label class="rd-lbl">${label}</label><input type="text" data-d="texts.${k}" value="${esc(d.texts[k])}" placeholder="${esc(DEFAULT_DESIGN.texts[k])}" maxlength="40" autocomplete="off"></div>`).join('')}</div>
            </div>`;
        } else if (this.rdTab === 'layout') {
            html = `
            <div class="rd-group">
                <h4>סדר הכותרת העליונה <button class="rd-link" data-reset="order">איפוס סדר</button></h4>
                <div class="rd-hint">הראשון ברשימה מופיע הכי ימני בעמוד.</div>
                ${d.headerOrder.map(id => orderRow('headerOrder', id, HEADER_LABELS[id], id === 'logo' ? 'showLogo' : null)).join('')}
            </div>
            <div class="rd-group">
                <h4>כרטיסי הסיכום</h4>
                ${sw('showStats', 'הצג שורת כרטיסי סיכום')}
                ${d.statsOrder.map(id => orderRow('statsOrder', id, STAT_LABELS[id], `statsVisible.${id}`)).join('')}
            </div>
            <div class="rd-group">
                <h4>טבלאות</h4>
                <div class="rd-field"><label class="rd-lbl">מספר עמודות בעמוד</label>
                    <select data-d="cols">${[['auto', 'אוטומטי'], ['2', '2'], ['3', '3'], ['4', '4'], ['5', '5']].map(([v, t]) => `<option value="${v}" ${d.cols === v ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
                <div class="rd-field"><label class="rd-lbl">גודל כתב</label>
                    <select data-d="fontScale">${[['0.9', 'קטן'], ['1', 'רגיל'], ['1.1', 'גדול']].map(([v, t]) => `<option value="${v}" ${d.fontScale === v ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
                ${sw('rowStripes', 'פסים לסירוגין בשורות')}
            </div>`;
        } else if (this.rdTab === 'colors') {
            html = `
            <div class="rd-group">
                <h4>ערכות מוכנות</h4>
                <div class="rd-presets">${Object.entries(PRESETS).map(([k, p]) => `<button class="rd-preset" data-preset="${k}"><i style="background:${p.colors.masechet};box-shadow:inset 0 0 0 1px rgba(0,0,0,.15)"></i>${esc(p.name)}</button>`).join('')}</div>
            </div>
            <div class="rd-group">
                <h4>צבעים בודדים <button class="rd-link" data-reset="colors">איפוס צבעים</button></h4>
                ${COLOR_LABELS.map(([k, label]) => `<div class="rd-colorrow"><span class="rd-name">${label}</span><code>${esc(d.colors[k])}</code><input type="color" data-d="colors.${k}" value="${esc(d.colors[k])}"></div>`).join('')}
            </div>`;
        } else {
            html = `
            <div class="rd-group">
                <h4>מה מופיע בדוח</h4>
                ${sw('showReward', 'עמודת מלגה וסכום כולל')}
                ${sw('showSummary', 'סיכום בכותרת כל מסכת (עברו / סה"כ)')}
                ${sw('showTypeLabels', 'תווית "משניות" / "גמרא" בכותרת מסכת')}
                ${sw('showStudentCode', 'קוד תלמיד בפרטי התעודה')}
                ${sw('showChapterLetter', 'אות הפרק ליד קוד הבחינה (במשניות)')}
                ${sw('gemaraByChapter', 'בגמרא: כותרת לפי שם הפרק במקום שם המסכת')}
                ${sw('showHebrewDate', 'תאריך עברי בכותרת')}
                ${sw('showLegend', 'מקרא בתחתית העמוד')}
            </div>`;
        }
        pane.innerHTML = html;
    }

    // ---------- תצוגה חיה ----------

    sampleStudent() {
        const kind = document.getElementById('rdSample').value;
        if (kind === 'real' && this.allStudentsData.length) {
            return this.allStudentsData.slice().sort((a, b) => (b.exams || []).length - (a.exams || []).length)[0];
        }
        return buildSample(kind === 'small' ? 'small' : 'large');
    }

    renderDesignPreview() {
        if (!this.draft) return;
        cancelAnimationFrame(this._rdRaf);
        this._rdRaf = requestAnimationFrame(() => {
            const stage = document.getElementById('rdStage');
            if (!stage || !this.draft) return;
            const o = { ...sanitizeDesign(this.draft), ...this.print };
            const pages = this.renderStudentPages(this.sampleStudent(), o, this._logoData || this.logoUrl, formatHebrewDate());
            document.getElementById('rdPageInfo').textContent = pages.length > 1 ? `עמוד 1 מתוך ${pages.length}` : 'עמוד אחד';

            const pxW = PAGE.width * 96 / 25.4, pxH = PAGE.height * 96 / 25.4;
            const s = Math.min((stage.clientWidth - 24) / pxW, (stage.clientHeight - 24) / pxH, 1.2);
            stage.innerHTML = `<div style="width:${pxW * s}px;height:${pxH * s}px;position:relative;flex:none;box-shadow:0 4px 14px rgba(15,23,42,.25);">
                <div style="position:absolute;top:0;left:0;width:${PAGE.width}mm;height:${PAGE.height}mm;transform:scale(${s});transform-origin:top left;">${pages[0].replace('class="rp-page"', 'class="rp-page" data-prev="1"')}</div></div>`;
            const pg = stage.querySelector('.rp-page');
            if (pg) { pg.style.margin = '0'; pg.style.boxShadow = 'none'; }
        });
    }

    // ============================================================
    //  בניית הדוח
    // ============================================================

    // טוען את הלוגו כ-data URL (כדי שיופיע גם ב-PDF). אם נחסם — משתמשים בכתובת הרגילה.
    async getLogo() {
        if (this._logoData) return this._logoData;
        try {
            const res = await fetch(this.logoUrl);
            const blob = await res.blob();
            this._logoData = await new Promise((resolve, reject) => {
                const r = new FileReader();
                r.onload = () => resolve(r.result);
                r.onerror = reject;
                r.readAsDataURL(blob);
            });
        } catch (e) {
            this._logoData = this.logoUrl;
        }
        return this._logoData;
    }

    reportOptions() {
        return { ...sanitizeDesign(this.design), ...this.print };
    }

    async buildReportHtml(students) {
        const o = this.reportOptions();
        const logo = await this.getLogo();
        const heb = formatHebrewDate(new Date());

        const pages = [];
        let contentPages = 0;
        students.forEach((st, i) => {
            const sp = this.renderStudentPages(st, o, logo, heb);
            pages.push(...sp);
            contentPages += sp.length;
            if (o.duplex && sp.length % 2 === 1 && i < students.length - 1) pages.push('<div class="rp-page rp-blank"></div>');
        });

        document.getElementById('printReportBody').innerHTML = pages.join('');
        let summary = `${students.length} תלמידים · ${contentPages} עמודים`;
        if (o.duplex) summary += ` · ${Math.ceil(pages.length / 2)} דפים (דו צדדי)`;
        document.getElementById('rpSummary').textContent = summary;

        document.getElementById('printReportModal').classList.remove('hidden');
        document.getElementById('printReportBodyWrapper').scrollTop = 0;
    }

    // o = עיצוב + אפשרויות הדפסה (אחרי sanitizeDesign)
    renderStudentPages(student, o, logo, hebDate) {
        const allExams = student.exams || [];
        let exams = allExams;
        if (o.hideUnattempted) exams = exams.filter(ex => ex.passed === true || ex.passed === false);

        const passedCalc = allExams.filter(e => e.passed === true).length;
        const attemptedCalc = allExams.filter(e => e.passed === true || e.passed === false).length;
        const rewardCalc = allExams.reduce((sum, e) => sum + (e.passed === true ? (Number(e.reward_earned) || 0) : 0), 0);
        const st = student.stats || {};
        const passed = st.total_passed ?? passedCalc;
        const attempted = st.total_attempted ?? attemptedCalc;
        const total = st.total_available_exams ?? allExams.length;
        const failed = Math.max(0, attempted - passed);
        const reward = Number(st.total_reward ?? rewardCalc) || 0;

        const T = { ...DEFAULT_DESIGN.texts, ...(o.texts || {}) };
        const title = (o.title || '').trim() || DEFAULT_DESIGN.title;
        const subtitle = (o.subtitle || '').trim();
        const note = (o.note || '').trim();

        // כרטיסי סיכום לפי הסדר וההצגה שנבחרו
        const cards = {
            attempted: `<div class="rp-stat">${fillTpl(T.statAttempted, attempted)} ${esc(T.statOf)} ${total}</div>`,
            passed: `<div class="rp-stat ok">${fillTpl(T.statPassed, passed)}</div>`,
            failed: `<div class="rp-stat bad">${fillTpl(T.statFailed, failed)}</div>`,
            money: o.showReward ? `<div class="rp-stat money">${fillTpl(T.statMoney, '₪' + reward.toFixed(1))}</div>` : ''
        };
        const visibleStats = o.showStats ? o.statsOrder.filter(id => o.statsVisible[id] && cards[id]) : [];
        const bodyH = computeBodyH(visibleStats.length > 0, !!note);

        const groups = groupExams(exams, { gemaraByChapter: o.gemaraByChapter });
        const plan = planLayout(groups, { pagesMode: o.pagesMode, cols: o.cols, bodyH });
        const scale = parseFloat(o.fontScale) || 1;
        const fs = Math.min(plan.rowH * 0.6 * scale, 3.5 * scale, plan.rowH * 0.85).toFixed(2);
        const totalPages = plan.pages.length;
        const vars = designVars(o);

        // כותרת עליונה לפי הסדר שנבחר
        const titleSize = title.length > 34 ? 4.4 : (title.length > 22 ? 5.4 : 6.4);
        const codeChip = o.showStudentCode ? `<span class="rp-chip">${esc(T.code)} ${esc(student.student_code)}</span>` : '';
        const present = o.headerOrder.filter(id => id !== 'logo' || (logo && o.showLogo));
        const last = present.length - 1;
        const headParts = {
            logo: () => `<img class="rp-logo" src="${esc(logo)}" alt="">`,
            title: (i) => `<div class="rp-title" style="text-align:${i === last && last > 0 ? 'left' : 'right'}">
                    <h1 style="font-size:${titleSize}mm">${esc(title)}</h1>
                    ${subtitle ? `<div class="rp-sub">${esc(subtitle)}</div>` : ''}
                    ${o.showHebrewDate ? `<div class="rp-date">${esc(hebDate)}</div>` : ''}
                </div>`,
            student: (i) => `<div class="rp-student" style="text-align:${i === 0 ? 'right' : (i === last ? 'left' : 'center')}">
                    <div class="rp-name">${esc(student.first_name)} ${esc(student.last_name)}</div>
                    <div class="rp-meta">${esc(T.grade)} ${esc(student.class_grade || 'כללי')}${codeChip}</div>
                </div>`
        };
        const headHtml = present.map((id, i) => headParts[id](i)).join('');

        const legend = o.showLegend
            ? `<span><b class="ok">✓</b> ${esc(T.legPass)}</span><span><b class="no">✕</b> ${esc(T.legFail)}</span><span>${esc(T.legNone)}</span>${o.showChapterLetter && exams.some(e => parseInt((e.details || {}).chapter_num, 10) > 0) ? `<span><b class="c-ch" style="border:0;margin:0;padding:0">ג׳</b> ${esc(T.legChapter)}</span>` : ''}`
            : '';

        return plan.pages.map((cols, pageIdx) => {
            const colsHtml = [];
            for (let i = 0; i < plan.N; i++) colsHtml.push(this.renderColumn(cols[i] || [], o, plan.N));
            const body = exams.length === 0 ? `<div class="rp-empty">${esc(T.empty)}</div>` : colsHtml.join('');
            const footText = [o.footerText, totalPages > 1 ? `${T.page} ${pageIdx + 1} ${T.pageOf} ${totalPages}` : ''].filter(Boolean).map(esc).join(' &nbsp;·&nbsp; ');

            return `
            <div class="rp-page" style="${vars}">
                ${o.bsd ? `<div class="rp-bsd">${esc(T.bsd)}</div>` : ''}
                <div class="rp-head">${headHtml}</div>
                ${visibleStats.length ? `<div class="rp-stats">${visibleStats.map(id => cards[id]).join('')}</div>` : '<div class="rp-gap"></div>'}
                ${note ? `<div class="rp-note">${esc(note)}</div>` : ''}
                <div class="rp-body" style="height:${bodyH}mm; --rh:${plan.rowH.toFixed(2)}mm; --fs:${fs}mm;">${body}</div>
                <div class="rp-foot">
                    <div class="rp-legend">${legend}</div>
                    <span>${footText}</span>
                </div>
            </div>`;
        });
    }

    renderColumn(col, o, N) {
        const rw = o.showReward;
        const T = { ...DEFAULT_DESIGN.texts, ...(o.texts || {}) };
        const head = `<div class="rp-colhead ${rw ? '' : 'no-rw'}"><span>${esc(T.colCode)}</span><span>${esc(T.colMark)}</span>${rw ? `<span>${esc(T.colReward)}</span>` : ''}</div>`;

        const rows = col.map(it => {
            const g = it.g;
            const ti = g.typeInfo;
            if (it.t === 'h') {
                const pillText = ti.cls === 't-m' ? T.typeM : (ti.cls === 't-g' ? T.typeG : '');
                const pill = pillText && o.showTypeLabels ? `<span class="rp-pill">${esc(pillText)}</span>` : '';
                let stat = '';
                if (!it.cont && o.showSummary && (N <= 4 || g.label.length <= 6)) {   // ב-5 עמודות אין מקום לסיכום ליד שם ארוך
                    const p = g.exams.filter(e => e.passed === true).length;
                    const sum = g.exams.reduce((s, e) => s + (e.passed === true ? (Number(e.reward_earned) || 0) : 0), 0);
                    stat = `<span class="rp-mh-stat">${p}/${g.exams.length}${rw && sum > 0 && N <= 3 ? ` · ₪${sum.toFixed(1)}` : ''}</span>`;
                }
                return `<div class="rp-mh ${ti.cls}"><span>${esc(g.label)}</span>${pill}${stat}</div>`;
            }
            const ex = it.ex;
            let cls = 'none', mark = '', rewardText = '';
            if (ex.passed === true) {
                cls = 'pass'; mark = '✓';
                const r = Number(ex.reward_earned) || 0;
                rewardText = r > 0 ? r.toFixed(1) : '';
            } else if (ex.passed === false) {
                cls = 'fail'; mark = '✕';
            }
            const chNum = parseInt((ex.details || {}).chapter_num, 10);
            const letter = o.showChapterLetter && chNum > 0 ? `<span class="c-ch">${esc(toHebrewNumeral(chNum))}</span>` : '';
            return `<div class="rp-row ${cls} s${it.idx % 2} ${rw ? '' : 'no-rw'}"><span class="c-code">${esc(ex.exam_code)}${letter}</span><span class="c-mark">${mark}</span>${rw ? `<span class="c-rw">${rewardText}</span>` : ''}</div>`;
        }).join('');

        return `<div class="rp-col">${head}${rows}</div>`;
    }

    // ============================================================
    //  הדפסה / PDF / אקסל
    // ============================================================

    printReport() {
        const oldTitle = document.title;
        document.title = this.lastReportName;   // שם הקובץ המוצע בשמירה כ-PDF
        const restore = () => { document.title = oldTitle; window.removeEventListener('afterprint', restore); };
        window.addEventListener('afterprint', restore);
        window.print();
    }

    fileStamp() {
        return formatHebrewDate().replace(/[׳״"']/g, '').replace(/\s+/g, '_');
    }

    loadScript(url, isReady) {
        if (isReady()) return Promise.resolve();
        if (this._scripts[url]) return this._scripts[url];
        this._scripts[url] = new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = url;
            s.onload = resolve;
            s.onerror = () => { delete this._scripts[url]; reject(new Error('load failed: ' + url)); };
            document.head.appendChild(s);
        });
        return this._scripts[url];
    }

    async downloadDirectPdf() {
        const btn = document.getElementById('directDownloadPdfBtn');
        const origText = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> מכין קובץ...';

        try {
            await this.loadScript(H2C_URL, () => typeof window.html2canvas === 'function');
            await this.loadScript(JSPDF_URL, () => window.jspdf && window.jspdf.jsPDF);
        } catch (err) {
            await window.customAlert("שגיאה בטעינת כלי ה-PDF (ייתכן שיש חסימת רשת). השתמש בכפתור 'הדפס' ובחר 'שמור כ-PDF'.", true);
            btn.innerHTML = origText;
            btn.disabled = false;
            return;
        }

        try {
            const { jsPDF } = window.jspdf;
            const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
            const pages = Array.from(document.querySelectorAll('#printReportBody .rp-page'));

            for (let i = 0; i < pages.length; i++) {
                btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> עמוד ${i + 1} מתוך ${pages.length}`;
                if (i > 0) pdf.addPage();
                if (pages[i].classList.contains('rp-blank')) continue;   // גב ריק — עמוד לבן

                const host = document.createElement('div');
                host.style.cssText = 'position:fixed;left:0;top:0;z-index:-1;pointer-events:none;background:#fff;';
                const clone = pages[i].cloneNode(true);
                clone.style.margin = '0';
                clone.style.boxShadow = 'none';
                host.appendChild(clone);
                document.body.appendChild(host);
                try {
                    const canvas = await window.html2canvas(clone, { scale: 2, useCORS: true, backgroundColor: '#ffffff', logging: false });
                    pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, 210, 297, undefined, 'FAST');
                } finally {
                    host.remove();
                }
            }
            pdf.save(`${this.lastReportName}_${this.fileStamp()}.pdf`);
        } catch (err) {
            console.error(err);
            await window.customAlert("יצירת ה-PDF נכשלה. השתמש בכפתור 'הדפס' ובחר 'שמור כ-PDF'.", true);
        } finally {
            btn.innerHTML = origText;
            btn.disabled = false;
        }
    }

    exportToExcel(students) {
        const header = ['קוד תלמיד', 'שם פרטי', 'שם משפחה', 'כיתה', 'סוג', 'מסכת', 'קוד בחינה', 'פירוט', 'סטטוס', 'מלגה'];
        const lines = [header.map(csvCell).join(',')];

        students.forEach(student => {
            const base = [student.student_code, student.first_name, student.last_name, student.class_grade || ''];
            const exams = student.exams || [];
            if (exams.length === 0) {
                lines.push([...base, '', '', '', 'ללא בחינות', '', ''].map(csvCell).join(','));
                return;
            }
            exams.forEach(ex => {
                const details = ex.details || {};
                const desc = Object.values(details).filter(v => v !== null && v !== '').join(' - ') || ex.exam_code;
                const status = ex.passed === true ? 'עבר' : (ex.passed === false ? 'לא עבר' : 'לא בוצע');
                const reward = ex.passed === true ? (Number(ex.reward_earned) || 0) : 0;
                lines.push([...base.map(csvCell), csvCell(typeOf(ex.exam_type).label), csvCell(details.masechet || ''), csvCell(ex.exam_code), csvCell(desc), csvCell(status), reward].join(','));
            });
        });

        const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.href = url;
        link.download = `${this.lastReportName}_${this.fileStamp()}.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
}
