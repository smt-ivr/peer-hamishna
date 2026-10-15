// ============================================================
//  client-reports.js  —  מרכז הפקת דוחות (CRM) + דוח הישגים להדפסה / PDF / אקסל
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
    prefRow: 5.0,    // גובה שורה מועדף (קריאות לתלמידים)
    maxRow: 6.8      // גובה שורה מקסימלי כשיש מעט מבחנים
};

// ---------- ערכות צבעים ----------
export const THEMES = {
    graphite: { name: 'גרפיט',  accent: '#0f172a', soft: '#e2e8f0' },
    navy:     { name: 'כחול',   accent: '#1d4ed8', soft: '#dbeafe' },
    emerald:  { name: 'ירוק',   accent: '#047857', soft: '#d1fae5' },
    plum:     { name: 'סגול',   accent: '#6d28d9', soft: '#ede9fe' }
};

// ---------- סוגי מבחנים ----------
const TYPE_INFO = {
    mishnayot: { label: 'משניות', cls: 't-m', rank: 0 },
    gemara:    { label: 'גמרא',   cls: 't-g', rank: 1 },
    other:     { label: '',       cls: 't-o', rank: 2 }
};
const typeOf = t => TYPE_INFO[t] || TYPE_INFO.other;

// ---------- הגדרות ברירת מחדל (בעתיד: טעינה/שמירה מול השרת) ----------
export const DEFAULT_SETTINGS = {
    title: 'דוח הישגים ומלגות',
    subtitle: '',
    note: '',
    footerText: 'הופק ממערכת ניהול פאר המשנה',
    bsd: false,
    theme: 'graphite',
    showStats: true,
    showReward: true,
    showSummary: true,
    showStudentCode: true,
    hideUnattempted: false,
    pagesMode: 'auto',   // auto | 1 | 2
    cols: 'auto',        // auto | 2 | 3 | 4
    duplex: false
};
const SETTINGS_KEY = 'peer_report_settings_v2';

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
        return `${toHebrewNumeral(day)} ב${month} ה${toHebrewNumeral(year % 1000 || year)}`;
    } catch (e) {
        return date.toLocaleDateString('he-IL-u-ca-hebrew');
    }
}

const safeName = s => String(s).trim().replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, '_');

// ============================================================
//  חישוב פריסה
// ============================================================

// קיבוץ מבחנים לפי מסכת + סוג. משניות קודם, אחר כך גמרא.
export function groupExams(exams) {
    const map = new Map();
    exams.forEach(ex => {
        const name = String((ex.details && ex.details.masechet) || '').trim() || 'כללי';
        const type = ex.exam_type || '';
        const key = `${name}|${type}`;
        if (!map.has(key)) map.set(key, { name, type, typeInfo: typeOf(type), exams: [] });
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

// חלוקת שורות לעמודות בקיבולת נתונה. כותרת מסכת לא נשארת לבד בתחתית עמודה,
// ומסכת שנחתכת באמצע חוזרת בראש העמודה הבאה (בלי סיכום, כדי לא לספור פעמיים).
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

const rowFor = (cap, bodyH) => Math.min(PAGE.maxRow, (bodyH - 0.5) / (cap + 1));   // 0.5 מ"מ למסגרת העליונה

// opts: { pagesMode: 'auto'|'1'|'2', cols: 'auto'|'2'|'3'|'4', bodyH }
// מחזיר: { N, rowH, pages: [ [col, col, ...], ... ] }  — העמודות מחולקות שווה בין העמודים
export function planLayout(groups, opts = {}) {
    const bodyH = opts.bodyH || 224;
    const pagesMode = opts.pagesMode || 'auto';
    const colsOpt = opts.cols || 'auto';
    const items = flattenItems(groups);

    const pick = (Ps, Ns) => {
        let best = null;
        for (const P of Ps) {
            for (const N of Ns) {
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
    const autoPages = Array.from({ length: 20 }, (_, i) => i + 1);
    let chosen = null;

    if (pagesMode === '1') chosen = pick([1], fixedN || [2, 3, 4, 5]);
    else if (pagesMode === '2') chosen = pick([2], fixedN || [2, 3, 4]);
    if (!chosen) chosen = pick(autoPages, fixedN || [2, 3, 4]);
    if (!chosen) chosen = { P: 1, N: 4, cols: [], rowH: PAGE.maxRow };

    const pages = [];
    for (let i = 0; i < chosen.cols.length; i += chosen.N) pages.push(chosen.cols.slice(i, i + chosen.N));
    if (pages.length === 0) pages.push([]);
    return { N: chosen.N, rowH: Math.max(PAGE.minRow, chosen.rowH), pages };
}

export function computeBodyH(o) {
    const inner = PAGE.height - 2 * PAGE.padding;
    return inner - PAGE.headH - (o.showStats ? 17 : 4) - (o.note ? 9 : 0) - PAGE.footH - 3;
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
        this.loading = true;
        this.selected = new Set();
        this.filter = { text: '', cls: '', sortKey: 'name', sortDir: 1 };
        this.settings = this.loadSettings();
        this.logoUrl = 'https://smti.uk/img/peer.jpg';
        this._logoData = null;
        this._scripts = {};
        this.lastRenderedStudents = null;
        this.lastReportName = 'דוחות';
        this.zoom = 1;

        this.injectStyles();
        this.injectModal();
        this.renderView();
    }

    // ---------- הגדרות ----------

    loadSettings() {
        let stored = {};
        try { stored = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') || {}; } catch (e) { stored = {}; }
        const s = { ...DEFAULT_SETTINGS };
        Object.keys(DEFAULT_SETTINGS).forEach(k => {
            if (typeof stored[k] === typeof DEFAULT_SETTINGS[k]) s[k] = stored[k];
        });
        if (!THEMES[s.theme]) s.theme = 'graphite';
        return s;
    }

    saveSettings() {
        try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings)); } catch (e) { /* ignore */ }
        // TODO: כשיהיה תמיכה בשרת — לשלוח את this.settings גם לשם
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
        this.classes = Array.from(new Set(this.allStudentsData.map(s => s.class_grade).filter(Boolean))).sort((a, b) => String(a).localeCompare(String(b), 'he'));
        const codes = new Set(this.allStudentsData.map(s => s.student_code));
        this.selected.forEach(c => { if (!codes.has(c)) this.selected.delete(c); });
        this.loading = false;
        this.renderView();
    }

    setStudents() {
        this.fetchStudentSummaries();
    }

    getStats(s) {
        const exams = Array.isArray(s.exams) ? s.exams : null;
        const st = s.stats || {};
        const passed = st.total_passed ?? (exams ? exams.filter(e => e.passed === true).length : null);
        const attempted = st.total_attempted ?? (exams ? exams.filter(e => e.passed === true || e.passed === false).length : null);
        const total = st.total_available_exams ?? (exams ? exams.length : null);
        const reward = st.total_reward ?? (exams ? exams.reduce((sum, e) => sum + (e.passed === true ? (Number(e.reward_earned) || 0) : 0), 0) : null);
        return { passed, attempted, total, reward: reward == null ? null : Number(reward) };
    }

    // ============================================================
    //  CSS
    // ============================================================

    injectStyles() {
        if (document.getElementById('reportStyles')) return;
        const css = `
        /* ---------- הדוח המודפס ---------- */
        .rp-page { --tm: #1e3a8a; --tg: #92400e; --to: #475569;
            width: ${PAGE.width}mm; height: ${PAGE.height}mm; padding: ${PAGE.padding}mm; box-sizing: border-box;
            background: #fff; color: #0f172a; direction: rtl; position: relative; overflow: hidden;
            display: flex; flex-direction: column; margin: 0 auto 12px auto; box-shadow: 0 4px 14px rgba(15,23,42,.2);
            font-family: 'Segoe UI', 'Noto Sans Hebrew', Arial, sans-serif;
            -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        .rp-page *, .rp-page *::before, .rp-page *::after { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        .rp-page .t-m { --tc: var(--tm); } .rp-page .t-g { --tc: var(--tg); } .rp-page .t-o { --tc: var(--to); }

        .rp-bsd { position: absolute; top: 3.2mm; left: 0; right: 0; text-align: center; font-size: 3mm; color: #475569; font-weight: 600; }
        .rp-head { height: ${PAGE.headH}mm; flex: none; display: flex; align-items: center; gap: 5mm; border-bottom: .8mm solid var(--ac); padding-bottom: 3mm; }
        .rp-logo { height: 20mm; width: auto; max-width: 32mm; object-fit: contain; flex: none; }
        .rp-title { flex: 1; min-width: 0; }
        .rp-title h1 { margin: 0; font-weight: 800; line-height: 1.15; }
        .rp-sub { margin-top: 1mm; font-size: 3.8mm; font-weight: 700; color: var(--ac); line-height: 1.2; }
        .rp-date { margin-top: 1.1mm; font-size: 3.3mm; color: #475569; font-weight: 600; }
        .rp-student { text-align: left; flex: none; max-width: 66mm; }
        .rp-student .rp-name { font-size: 5.4mm; font-weight: 800; line-height: 1.15; }
        .rp-student .rp-meta { margin-top: 1.2mm; font-size: 3.4mm; color: #334155; }
        .rp-chip { display: inline-block; background: var(--ac-soft); border-radius: 1mm; padding: .3mm 1.6mm; margin-right: 1.5mm; font-size: 3mm; font-weight: 600; }

        .rp-stats { height: 11mm; flex: none; display: flex; gap: 3mm; margin: 3mm 0; }
        .rp-stat { flex: 1; border: .3mm solid #cbd5e1; border-top: .9mm solid var(--ac); border-radius: 1.5mm; background: #f8fafc; display: flex; align-items: center; justify-content: center; gap: 1.8mm; font-size: 3.2mm; color: #334155; white-space: nowrap; }
        .rp-stat b { font-size: 4.8mm; font-weight: 800; color: #0f172a; }
        .rp-stat.ok b { color: #047857; } .rp-stat.bad b { color: #b91c1c; } .rp-stat.money b { color: #0369a1; }
        .rp-gap { height: 4mm; flex: none; }
        .rp-note { flex: none; height: 7mm; margin-bottom: 2mm; border-radius: 1.5mm; background: var(--ac-soft); border-right: 1.3mm solid var(--ac); display: flex; align-items: center; padding: 0 3mm; font-size: 3.3mm; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

        .rp-body { flex: none; display: flex; gap: 3mm; align-items: flex-start; }
        .rp-col { flex: 1; min-width: 0; border-top: .3mm solid var(--ac); border-left: .25mm solid #94a3b8; }
        .rp-colhead, .rp-row { height: var(--rh); font-size: var(--fs); display: grid; grid-template-columns: 1fr 8mm 11mm; align-items: stretch; }
        .rp-colhead.no-rw, .rp-row.no-rw { grid-template-columns: 1fr 8mm; }
        .rp-colhead > span, .rp-row > span { display: flex; align-items: center; min-width: 0; }
        .rp-colhead > span:first-child, .rp-row > span:first-child { padding: 0 2mm; }
        .rp-colhead > span:not(:first-child), .rp-row > span:not(:first-child) { justify-content: center; border-right: .2mm solid #aebacb; }
        .rp-colhead { background: var(--ac-soft); font-weight: 800; border-bottom: .3mm solid var(--ac); border-right: 1.3mm solid var(--ac); }
        .rp-mh { height: var(--rh); font-size: var(--fs); display: flex; align-items: center; gap: 1.6mm; padding: 0 2mm; background: var(--tc); color: #fff; font-weight: 800; white-space: nowrap; overflow: hidden; }
        .rp-pill { flex: none; font-size: .74em; font-weight: 700; padding: .1mm 1.7mm; border-radius: 10mm; background: rgba(255,255,255,.22); border: .2mm solid rgba(255,255,255,.65); }
        .rp-mh-stat { margin-right: auto; font-weight: 600; font-size: .9em; opacity: .95; }
        .rp-row { background: #fff; border-bottom: .25mm solid #aebacb; border-right: 1.3mm solid var(--tc); }
        .rp-row.s1 { background: #e9eef5; }
        .rp-row .c-code { font-weight: 800; white-space: nowrap; overflow: hidden; }
        .rp-row .c-mark { font-weight: 900; font-size: 1.1em; }
        .rp-row .c-rw { font-weight: 700; color: #1e293b; white-space: nowrap; }
        .rp-row.pass { background: #d7f4e0; } .rp-row.pass.s1 { background: #c3eed1; } .rp-row.pass .c-mark { color: #047857; }
        .rp-row.fail { background: #fde0e0; } .rp-row.fail.s1 { background: #fbcdcd; } .rp-row.fail .c-mark { color: #b91c1c; }
        .rp-row.none .c-code { font-weight: 600; color: #475569; }
        .rp-empty { width: 100%; text-align: center; padding: 20mm 0; color: #64748b; font-size: 4mm; }

        .rp-foot { margin-top: auto; flex: none; height: 6mm; padding-top: 1.2mm; border-top: .25mm solid #cbd5e1; display: flex; justify-content: space-between; align-items: center; font-size: 2.7mm; color: #475569; gap: 4mm; }
        .rp-legend { display: flex; gap: 3.2mm; align-items: center; white-space: nowrap; }
        .rp-legend .sw { display: inline-block; width: 2.6mm; height: 2.6mm; border-radius: .5mm; background: var(--tc); margin-left: 1mm; vertical-align: -.4mm; }
        .rp-legend .ok { color: #047857; font-weight: 900; } .rp-legend .no { color: #b91c1c; font-weight: 900; }
        .rp-blank { background: #fff; }
        @media screen { .rp-blank:not(.rp-export)::after { content: 'גב הדף – ריק בכוונה (הדפסה דו צדדית)'; position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; color: #94a3b8; font-size: 4mm; border: .4mm dashed #cbd5e1; margin: 9mm; }
        }

        @media print {
            @page { size: A4 portrait; margin: 0; }
            #printReportBody { zoom: 1 !important; }
            .rp-page { margin: 0 !important; box-shadow: none !important; break-after: page; page-break-after: always; }
            .rp-page:last-child { break-after: auto; page-break-after: auto; }
        }

        /* ---------- ממשק מרכז הדוחות (CRM) ---------- */
        .rc-root { height: 100%; display: flex; flex-direction: column; gap: 12px; min-height: 0; }
        .rc-hero { flex: none; border-radius: 14px; padding: 16px 22px; color: #fff; background: linear-gradient(120deg, #1e3a8a 0%, #2563eb 55%, #4f46e5 100%); display: flex; align-items: center; justify-content: space-between; gap: 18px; flex-wrap: wrap; box-shadow: 0 8px 24px rgba(37,99,235,.25); position: relative; overflow: hidden; }
        .rc-hero::after { content: ''; position: absolute; top: -90px; left: -50px; width: 280px; height: 280px; border-radius: 50%; background: radial-gradient(circle, rgba(255,255,255,.2), transparent 70%); pointer-events: none; }
        .rc-hero h2 { font-size: 1.25rem; display: flex; align-items: center; gap: 10px; font-weight: 800; }
        .rc-hero p { opacity: .92; font-size: .86rem; margin-top: 4px; }
        .rc-kpis { display: flex; gap: 10px; flex-wrap: wrap; position: relative; z-index: 1; }
        .rc-kpi { min-width: 128px; background: rgba(255,255,255,.14); border: 1px solid rgba(255,255,255,.3); backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px); border-radius: 10px; padding: 8px 14px; display: flex; align-items: center; gap: 10px; }
        .rc-kpi i { font-size: 1.15rem; opacity: .9; }
        .rc-kpi b { display: block; font-size: 1.25rem; line-height: 1.1; }
        .rc-kpi span { font-size: .72rem; opacity: .92; }

        .rc-layout { flex: 1; min-height: 0; display: grid; grid-template-columns: minmax(0, 1.6fr) minmax(330px, 1fr); gap: 14px; }
        .rc-panel { background: #fff; border: 1px solid var(--border-color); border-radius: 14px; box-shadow: 0 2px 10px rgba(15,23,42,.05); display: flex; flex-direction: column; min-height: 0; overflow: hidden; }
        .rc-panel-head { padding: 14px 18px 10px; border-bottom: 1px solid var(--border-color); flex: none; }
        .rc-panel-head h3 { font-size: 1rem; display: flex; align-items: center; gap: 8px; color: #0f172a; margin: 0; }
        .rc-panel-head h3 i { color: var(--primary-color); }
        .rc-panel-head p { font-size: .78rem; color: var(--text-muted); margin-top: 3px; }

        .rc-toolbar { flex: none; padding: 12px 18px 8px; display: flex; flex-direction: column; gap: 10px; }
        .rc-search { position: relative; }
        .rc-search i { position: absolute; right: 12px; top: 50%; transform: translateY(-50%); color: #94a3b8; font-size: .85rem; }
        .rc-search input { width: 100%; padding: 9px 34px 9px 12px; border: 1px solid var(--border-color); border-radius: 10px; font-size: .9rem; outline: none; background: #f8fafc; transition: .2s; }
        .rc-search input:focus { border-color: var(--primary-color); background: #fff; box-shadow: 0 0 0 3px rgba(37,99,235,.12); }
        .rc-chips { display: flex; flex-wrap: wrap; gap: 6px; }
        .rc-chip { border: 1px solid var(--border-color); background: #fff; color: var(--text-main); border-radius: 999px; padding: 4px 12px; font-size: .8rem; font-weight: 600; cursor: pointer; transition: .15s; display: inline-flex; gap: 6px; align-items: center; }
        .rc-chip small { color: var(--text-muted); font-weight: 500; }
        .rc-chip:hover { border-color: #93c5fd; background: #eff6ff; }
        .rc-chip.active { background: var(--primary-color); border-color: var(--primary-color); color: #fff; }
        .rc-chip.active small { color: rgba(255,255,255,.85); }

        .rc-table-wrap { flex: 1; min-height: 0; overflow: auto; border-top: 1px solid var(--border-color); }
        .rc-table { width: 100%; border-collapse: separate; border-spacing: 0; font-size: .88rem; }
        .rc-table thead th { position: sticky; top: 0; z-index: 2; background: #f1f5f9; color: #475569; font-size: .76rem; font-weight: 700; text-align: right; padding: 9px 12px; border-bottom: 1px solid var(--border-color); white-space: nowrap; user-select: none; }
        .rc-table thead th[data-sort] { cursor: pointer; }
        .rc-table thead th[data-sort]:hover { color: var(--primary-color); }
        .rc-table thead th .rc-arrow { opacity: .6; margin-right: 4px; font-size: .7rem; }
        .rc-table tbody td { padding: 8px 12px; border-bottom: 1px solid #eef2f7; vertical-align: middle; }
        .rc-table tbody tr { cursor: pointer; transition: background .12s; }
        .rc-table tbody tr:hover { background: #f8fafc; }
        .rc-table tbody tr.is-sel { background: #eff6ff; }
        .rc-table tbody tr.is-sel:hover { background: #e3eeff; }
        .rc-table input[type=checkbox] { width: 16px; height: 16px; accent-color: var(--primary-color); cursor: pointer; }
        .rc-table .c-chk { width: 36px; }
        .rc-table .c-code { font-weight: 700; color: #0f172a; white-space: nowrap; }
        .rc-name { display: flex; align-items: center; gap: 10px; font-weight: 600; color: #0f172a; white-space: nowrap; }
        .rc-avatar { width: 28px; height: 28px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; color: #fff; font-size: .8rem; font-weight: 700; flex: none; }
        .rc-class { background: #f1f5f9; border: 1px solid var(--border-color); border-radius: 6px; padding: 2px 9px; font-size: .78rem; font-weight: 600; }
        .rc-prog { display: flex; align-items: center; gap: 8px; min-width: 110px; }
        .rc-prog-bar { flex: 1; height: 6px; background: #e2e8f0; border-radius: 99px; overflow: hidden; min-width: 50px; }
        .rc-prog-bar i { display: block; height: 100%; background: linear-gradient(90deg, #3b82f6, #6366f1); border-radius: 99px; }
        .rc-prog span { font-size: .76rem; color: var(--text-muted); white-space: nowrap; }
        .rc-pass { color: #047857; font-weight: 700; }
        .rc-rew { font-weight: 700; color: #0369a1; white-space: nowrap; }
        .rc-icon-btn { border: 1px solid var(--border-color); background: #fff; color: var(--primary-color); width: 30px; height: 30px; border-radius: 8px; cursor: pointer; transition: .15s; }
        .rc-icon-btn:hover { background: #eff6ff; border-color: #93c5fd; }
        .rc-icon-btn:disabled { opacity: .5; cursor: wait; }
        .rc-empty-row td { text-align: center; padding: 34px 10px !important; color: var(--text-muted); cursor: default; }
        .rc-table-foot { flex: none; padding: 8px 18px; font-size: .78rem; color: var(--text-muted); border-top: 1px solid var(--border-color); display: flex; justify-content: space-between; align-items: center; background: #fbfcfe; }
        .rc-link { background: none; border: none; color: var(--primary-color); cursor: pointer; font-size: .78rem; font-weight: 600; }
        .rc-link:hover { text-decoration: underline; }

        .rc-settings .rc-scroll { flex: 1; min-height: 0; overflow-y: auto; padding: 12px 14px 6px; display: flex; flex-direction: column; gap: 10px; }
        .rc-settings .rc-scroll > * { flex: none; }
        .rc-mini { border: 1px solid var(--border-color); border-radius: 12px; overflow: hidden; background: #fff; box-shadow: 0 2px 8px rgba(15,23,42,.06); }
        .rc-mini-bar { height: 6px; }
        .rc-mini-body { padding: 10px 14px 12px; }
        .rc-mini-title { font-weight: 800; font-size: 1.05rem; color: #0f172a; line-height: 1.2; }
        .rc-mini-sub { font-weight: 700; font-size: .82rem; margin-top: 3px; }
        .rc-mini-date { font-size: .74rem; color: #64748b; margin-top: 3px; }
        .rc-mini-note { margin-top: 8px; font-size: .78rem; font-weight: 600; padding: 5px 9px; border-radius: 6px; border-right: 3px solid; }
        .rc-mini-tag { font-size: .66rem; color: #94a3b8; padding: 5px 14px 0; font-weight: 600; }
        .rc-sec { border: 1px solid var(--border-color); border-radius: 12px; background: #fff; }
        .rc-sec > summary { list-style: none; cursor: pointer; padding: 10px 14px; font-weight: 700; font-size: .9rem; display: flex; align-items: center; gap: 8px; color: #0f172a; }
        .rc-sec > summary::-webkit-details-marker { display: none; }
        .rc-sec > summary i { color: var(--primary-color); width: 18px; text-align: center; }
        .rc-sec > summary::after { content: '\\f078'; font-family: 'Font Awesome 6 Free'; font-weight: 900; margin-right: auto; font-size: .7rem; color: #94a3b8; transition: .2s; }
        .rc-sec[open] > summary::after { transform: rotate(180deg); }
        .rc-sec-body { padding: 2px 14px 14px; display: flex; flex-direction: column; gap: 11px; }
        .rc-field label { display: block; font-size: .78rem; font-weight: 600; color: #475569; margin-bottom: 4px; }
        .rc-field input[type=text], .rc-field textarea, .rc-field select { width: 100%; padding: 8px 10px; border: 1px solid var(--border-color); border-radius: 8px; font-size: .88rem; outline: none; background: #f8fafc; font-family: inherit; transition: .2s; }
        .rc-field textarea { resize: none; height: 54px; }
        .rc-field input:focus, .rc-field textarea:focus, .rc-field select:focus { border-color: var(--primary-color); background: #fff; box-shadow: 0 0 0 3px rgba(37,99,235,.12); }
        .rc-hint { font-size: .72rem; color: var(--text-muted); margin-top: 4px; line-height: 1.4; }
        .rc-switch { display: flex; align-items: center; gap: 10px; cursor: pointer; font-size: .86rem; color: #1e293b; }
        .rc-switch input { position: absolute; opacity: 0; pointer-events: none; }
        .rc-slider { position: relative; width: 36px; height: 20px; border-radius: 99px; background: #cbd5e1; flex: none; transition: .2s; }
        .rc-slider::after { content: ''; position: absolute; top: 2px; right: 2px; width: 16px; height: 16px; border-radius: 50%; background: #fff; box-shadow: 0 1px 3px rgba(0,0,0,.25); transition: .2s; }
        .rc-switch input:checked + .rc-slider { background: var(--primary-color); }
        .rc-switch input:checked + .rc-slider::after { right: 18px; }
        .rc-switch input:focus-visible + .rc-slider { box-shadow: 0 0 0 3px rgba(37,99,235,.25); }
        .rc-swatches { display: flex; gap: 8px; flex-wrap: wrap; }
        .rc-swatch { display: inline-flex; align-items: center; gap: 7px; padding: 5px 12px 5px 10px; border: 2px solid var(--border-color); border-radius: 999px; background: #fff; cursor: pointer; font-size: .8rem; font-weight: 600; transition: .15s; }
        .rc-swatch i { width: 14px; height: 14px; border-radius: 50%; display: inline-block; }
        .rc-swatch.active { border-color: var(--primary-color); background: #eff6ff; }
        .rc-settings-foot { flex: none; padding: 9px 16px; border-top: 1px solid var(--border-color); display: flex; justify-content: space-between; align-items: center; gap: 10px; font-size: .72rem; color: var(--text-muted); background: #fbfcfe; }

        .rc-actionbar { flex: none; background: #fff; border: 1px solid var(--border-color); border-radius: 14px; padding: 10px 16px; display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; box-shadow: 0 -2px 14px rgba(15,23,42,.06); }
        .rc-sel-info { display: flex; align-items: center; gap: 10px; font-size: .9rem; color: #334155; }
        .rc-sel-info i { color: var(--success); font-size: 1.1rem; }
        .rc-sel-info b { font-size: 1.15rem; color: #0f172a; }
        .rc-actions { display: flex; gap: 10px; }
        .rc-actions .btn { height: 38px; padding: 0 18px; font-size: .9rem; border-radius: 10px; }
        .rc-actions .btn-primary { background: linear-gradient(120deg, #2563eb, #4f46e5); box-shadow: 0 4px 12px rgba(37,99,235,.3); }
        .rc-actions .btn:disabled { opacity: .45; cursor: not-allowed; box-shadow: none; }

        .rc-zoom { display: inline-flex; align-items: center; border: 1px solid var(--border-color); border-radius: 8px; overflow: hidden; background: #fff; }
        .rc-zoom button { border: none; background: #fff; width: 30px; height: 28px; cursor: pointer; font-size: 1rem; color: #334155; }
        .rc-zoom button:hover { background: #f1f5f9; }
        .rc-zoom span { min-width: 46px; text-align: center; font-size: .78rem; color: #475569; }
        .rc-sum { font-size: .8rem; color: var(--text-muted); font-weight: 500; }

        @media (max-width: 900px) {
            .rc-root { height: auto; }
            .rc-layout { grid-template-columns: 1fr; }
            .rc-panel { overflow: visible; }
            .rc-table-wrap { max-height: 420px; }
            .rc-settings .rc-scroll { overflow: visible; }
        }`;
        const style = document.createElement('style');
        style.id = 'reportStyles';
        style.textContent = css;
        document.head.appendChild(style);
    }

    // ============================================================
    //  מודל התצוגה המקדימה
    // ============================================================

    injectModal() {
        if (document.getElementById('printReportModal')) return;
        const modalHtml = `
        <div id="printReportModal" class="modal hidden no-print" style="z-index: 9999;">
            <div class="modal-content" style="max-width: 1040px; height: 95vh; background: #e2e8f0; border-radius: 12px; overflow: hidden;">
                <div class="modal-header no-print" style="background: white; padding: 12px 18px; box-shadow: 0 2px 10px rgba(0,0,0,0.05); flex-wrap: wrap; gap: 10px;">
                    <div style="display:flex; align-items:center; gap:12px;">
                        <h3 style="margin: 0; font-size: 1.1rem; color: #0f172a;"><i class="fas fa-print" style="color: var(--primary-color);"></i> תצוגה מקדימה</h3>
                        <span class="rc-sum" id="rpSummary"></span>
                    </div>
                    <div style="display:flex; gap:8px; align-items:center; flex-wrap: wrap;">
                        <div class="rc-zoom"><button id="rpZoomOut" title="הקטן">−</button><span id="rpZoomLabel">100%</span><button id="rpZoomIn" title="הגדל">+</button><button id="rpZoomFit" title="התאם לרוחב"><i class="fas fa-expand"></i></button></div>
                        <button class="btn btn-outline btn-sm" id="exportReportCsvBtn" title="ייצא טבלה לאקסל"><i class="fas fa-file-excel"></i> אקסל</button>
                        <button class="btn btn-secondary btn-sm" id="directDownloadPdfBtn" title="הורד קובץ PDF"><i class="fas fa-file-pdf"></i> הורד PDF</button>
                        <button class="btn btn-primary btn-sm" id="printReportBtn" title="הדפסה, או שמירה כ-PDF איכותי"><i class="fas fa-print"></i> הדפס</button>
                        <button class="close-modal-btn" id="closeReportModalBtn" style="margin-right: 10px; font-size: 1.5rem;">&times;</button>
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
        document.getElementById('rpZoomIn').addEventListener('click', () => this.setZoom(this.zoom + 0.1));
        document.getElementById('rpZoomOut').addEventListener('click', () => this.setZoom(this.zoom - 0.1));
        document.getElementById('rpZoomFit').addEventListener('click', () => this.fitZoom());
        window.addEventListener('resize', () => {
            const m = document.getElementById('printReportModal');
            if (m && !m.classList.contains('hidden')) this.fitZoom();
        });
    }

    setZoom(z) {
        this.zoom = Math.max(0.3, Math.min(1.5, Math.round(z * 100) / 100));
        const body = document.getElementById('printReportBody');
        if (body) body.style.zoom = this.zoom;
        const label = document.getElementById('rpZoomLabel');
        if (label) label.textContent = Math.round(this.zoom * 100) + '%';
    }

    fitZoom() {
        const wrap = document.getElementById('printReportBodyWrapper');
        if (!wrap) return;
        const avail = wrap.clientWidth - 40;
        this.setZoom(Math.min(1, avail / (PAGE.width * 96 / 25.4)));
    }

    // ============================================================
    //  ממשק ה-CRM
    // ============================================================

    renderView() {
        const total = this.allStudentsData.length;
        const s = this.settings;
        const secTitle = (icon, text) => `<summary><i class="fas ${icon}"></i> ${text}</summary>`;
        const textField = (key, label, ph, max) => `<div class="rc-field"><label>${label}</label><input type="text" data-key="${key}" value="${esc(s[key])}" placeholder="${esc(ph)}" maxlength="${max}" autocomplete="off"></div>`;
        const sw = (key, label) => `<label class="rc-switch"><input type="checkbox" data-key="${key}" ${s[key] ? 'checked' : ''}><span class="rc-slider"></span><span>${label}</span></label>`;

        this.container.innerHTML = `
        <div class="rc-root no-print">
            <div class="rc-hero">
                <div style="position:relative; z-index:1;">
                    <h2><i class="fas fa-file-invoice"></i> מרכז הפקת דוחות</h2>
                    <p>בחרו תלמידים, התאימו את הדוח ללא הגבלה, והדפיסו — ${esc(formatHebrewDate())}</p>
                </div>
                <div class="rc-kpis">
                    <div class="rc-kpi"><i class="fas fa-user-graduate"></i><div><b>${total}</b><span>תלמידים במערכת</span></div></div>
                    <div class="rc-kpi"><i class="fas fa-layer-group"></i><div><b>${this.classes.length}</b><span>כיתות</span></div></div>
                    <div class="rc-kpi"><i class="fas fa-check-double"></i><div><b id="kpiSelected">0</b><span>נבחרו להדפסה</span></div></div>
                    <div class="rc-kpi"><i class="fas fa-coins"></i><div><b id="kpiReward">—</b><span>מלגות לנבחרים</span></div></div>
                </div>
            </div>

            <div class="rc-layout">
                <section class="rc-panel rc-students">
                    <div class="rc-panel-head">
                        <h3><i class="fas fa-address-book"></i> בחירת תלמידים להדפסה</h3>
                        <p>סמנו תלמיד אחד, כיתה שלמה או כל שילוב — ואז הפיקו דוח. לחיצה על העין מציגה דוח לתלמיד בודד.</p>
                    </div>
                    <div class="rc-toolbar">
                        <div class="rc-search"><i class="fas fa-search"></i><input type="text" id="rcSearch" placeholder="חיפוש לפי שם או קוד תלמיד..." value="${esc(this.filter.text)}" autocomplete="off"></div>
                        <div class="rc-chips" id="rcChips"></div>
                    </div>
                    <div class="rc-table-wrap">
                        <table class="rc-table">
                            <thead><tr>
                                <th class="c-chk"><input type="checkbox" id="rcCheckAll" title="בחר את כל המוצגים"></th>
                                <th data-sort="code">קוד<span class="rc-arrow"></span></th>
                                <th data-sort="name">שם התלמיד<span class="rc-arrow"></span></th>
                                <th data-sort="class">כיתה<span class="rc-arrow"></span></th>
                                <th data-sort="progress">התקדמות במבחנים<span class="rc-arrow"></span></th>
                                <th data-sort="passed">עברו<span class="rc-arrow"></span></th>
                                <th data-sort="reward">מלגה<span class="rc-arrow"></span></th>
                                <th></th>
                            </tr></thead>
                            <tbody id="rcTbody"></tbody>
                        </table>
                    </div>
                    <div class="rc-table-foot"><span id="rcFootInfo"></span><button class="rc-link" id="rcSelectFiltered">בחר את כל המוצגים</button></div>
                </section>

                <aside class="rc-panel rc-settings">
                    <div class="rc-panel-head">
                        <h3><i class="fas fa-wand-magic-sparkles"></i> התאמה אישית של הדוח</h3>
                        <p>כל שינוי מתעדכן מיד בתצוגה החיה ונשמר אוטומטית.</p>
                    </div>
                    <div class="rc-scroll">
                        <div class="rc-mini-tag">תצוגה חיה של כותרת הדוח</div>
                        <div class="rc-mini" id="rcMini"></div>

                        <details class="rc-sec" open>
                            ${secTitle('fa-pen-nib', 'מה לכתוב בדוח')}
                            <div class="rc-sec-body">
                                ${textField('title', 'כותרת הדוח', 'דוח הישגים ומלגות', 50)}
                                ${textField('subtitle', 'כותרת משנה (לא חובה)', 'לדוגמה: מחזור חורף', 50)}
                                <div class="rc-field"><label>הודעה לתלמיד (לא חובה)</label><textarea data-key="note" maxlength="90" placeholder="לדוגמה: יישר כוחך! המשך כך">${esc(s.note)}</textarea></div>
                                ${textField('footerText', 'טקסט בתחתית העמוד', 'הופק ממערכת ניהול פאר המשנה', 60)}
                                ${sw('bsd', 'הצג בס״ד בראש העמוד')}
                            </div>
                        </details>

                        <details class="rc-sec" open>
                            ${secTitle('fa-eye', 'מה להציג')}
                            <div class="rc-sec-body">
                                ${sw('showStats', 'כרטיסי סיכום (נבחן / עברו / לא עברו)')}
                                ${sw('showReward', 'עמודת מלגה וסכום כולל')}
                                ${sw('showSummary', 'סיכום בכותרת כל מסכת')}
                                ${sw('showStudentCode', 'קוד תלמיד בפרטי התעודה')}
                                ${sw('hideUnattempted', 'הסתר מבחנים שלא בוצעו (דוח תמציתי)')}
                            </div>
                        </details>

                        <details class="rc-sec" open>
                            ${secTitle('fa-print', 'פריסה והדפסה')}
                            <div class="rc-sec-body">
                                <div class="rc-field"><label>אורך הדוח לכל תלמיד</label>
                                    <select data-key="pagesMode">
                                        <option value="auto" ${s.pagesMode === 'auto' ? 'selected' : ''}>אוטומטי — עמוד אחד, ואם צפוף מדי שני עמודים</option>
                                        <option value="1" ${s.pagesMode === '1' ? 'selected' : ''}>עמוד אחד בלבד (כתב קטן יותר)</option>
                                        <option value="2" ${s.pagesMode === '2' ? 'selected' : ''}>שני עמודים (כתב גדול וברור)</option>
                                    </select>
                                    <div class="rc-hint">כשהדוח ארוך הוא מתחלק שווה בין העמודים, בלי עמוד שני ריק למחצה.</div>
                                </div>
                                <div class="rc-field"><label>מספר עמודות בעמוד</label>
                                    <select data-key="cols">
                                        <option value="auto" ${s.cols === 'auto' ? 'selected' : ''}>אוטומטי</option>
                                        <option value="2" ${s.cols === '2' ? 'selected' : ''}>2 עמודות</option>
                                        <option value="3" ${s.cols === '3' ? 'selected' : ''}>3 עמודות</option>
                                        <option value="4" ${s.cols === '4' ? 'selected' : ''}>4 עמודות</option>
                                    </select>
                                </div>
                                ${sw('duplex', 'הדפסה דו צדדית (שני עמודים על דף אחד)')}
                                <div class="rc-hint">במצב דו צדדי, תלמיד עם עמוד אחד מקבל גב ריק כדי שהתלמיד הבא יתחיל בדף חדש. בחלון ההדפסה יש לבחור "הדפסה דו צדדית".</div>
                            </div>
                        </details>

                        <details class="rc-sec">
                            ${secTitle('fa-palette', 'צבעים')}
                            <div class="rc-sec-body">
                                <div class="rc-swatches" id="rcSwatches">
                                    ${Object.entries(THEMES).map(([k, t]) => `<button type="button" class="rc-swatch ${s.theme === k ? 'active' : ''}" data-theme="${k}"><i style="background:${t.accent}"></i>${t.name}</button>`).join('')}
                                </div>
                                <div class="rc-hint">צבעי "משניות" (כחול) ו"גמרא" (חום) קבועים, כדי שההבדל יהיה ברור תמיד.</div>
                            </div>
                        </details>
                    </div>
                    <div class="rc-settings-foot"><span>נשמר אוטומטית במחשב זה</span><button class="btn btn-outline btn-sm" id="rcReset"><i class="fas fa-rotate-left"></i> איפוס</button></div>
                </aside>
            </div>

            <div class="rc-actionbar">
                <div class="rc-sel-info"><i class="fas fa-circle-check"></i><span><b id="rcSelCount">0</b> תלמידים נבחרו</span><button class="rc-link" id="rcClearSel">נקה בחירה</button></div>
                <div class="rc-actions">
                    <button class="btn btn-outline" id="rcExportBtn"><i class="fas fa-file-excel"></i> ייצוא אקסל</button>
                    <button class="btn btn-primary" id="rcGenerateBtn"><i class="fas fa-print"></i> תצוגה מקדימה והדפסה</button>
                </div>
            </div>
        </div>`;

        this.renderChips();
        this.renderTable();
        this.updateMini();
        this.bindViewEvents();
        this.updateSelectionUI();
    }

    // ----- עזרי טבלה -----

    getFiltered() {
        const term = this.filter.text.trim().toLowerCase();
        const cls = this.filter.cls;
        let list = this.allStudentsData.filter(s => {
            if (cls && String(s.class_grade || '') !== cls) return false;
            if (!term) return true;
            return String(s.student_code).toLowerCase().includes(term) || `${s.first_name} ${s.last_name}`.toLowerCase().includes(term);
        });
        const { sortKey, sortDir } = this.filter;
        const val = s => {
            const st = this.getStats(s);
            switch (sortKey) {
                case 'code': return String(s.student_code);
                case 'class': return String(s.class_grade || '');
                case 'progress': return st.total ? (st.attempted || 0) / st.total : -1;
                case 'passed': return st.passed ?? -1;
                case 'reward': return st.reward ?? -1;
                default: return `${s.last_name || ''} ${s.first_name || ''}`;
            }
        };
        list = list.slice().sort((a, b) => {
            const va = val(a), vb = val(b);
            if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * sortDir;
            return String(va).localeCompare(String(vb), 'he', { numeric: true }) * sortDir;
        });
        return list;
    }

    renderChips() {
        const box = document.getElementById('rcChips');
        if (!box) return;
        const countBy = {};
        this.allStudentsData.forEach(s => { const c = String(s.class_grade || ''); countBy[c] = (countBy[c] || 0) + 1; });
        const chip = (val, label, n) => `<button type="button" class="rc-chip ${this.filter.cls === val ? 'active' : ''}" data-cls="${esc(val)}">${esc(label)} <small>${n}</small></button>`;
        box.innerHTML = chip('', 'כל הכיתות', this.allStudentsData.length) + this.classes.map(c => chip(String(c), `כיתה ${c}`, countBy[String(c)] || 0)).join('');
    }

    avatarColor(name) {
        const palette = ['#2563eb', '#7c3aed', '#0891b2', '#059669', '#d97706', '#db2777', '#4f46e5', '#0d9488'];
        let h = 0;
        for (const ch of String(name)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
        return palette[h % palette.length];
    }

    renderTable() {
        const tbody = document.getElementById('rcTbody');
        if (!tbody) return;
        const list = this.getFiltered();

        if (this.loading) {
            tbody.innerHTML = '<tr class="rc-empty-row"><td colspan="8"><i class="fas fa-spinner fa-spin"></i> טוען תלמידים...</td></tr>';
        } else if (list.length === 0) {
            tbody.innerHTML = '<tr class="rc-empty-row"><td colspan="8">לא נמצאו תלמידים התואמים לחיפוש</td></tr>';
        } else {
            tbody.innerHTML = list.map(s => {
                const st = this.getStats(s);
                const sel = this.selected.has(s.student_code);
                const pct = st.total ? Math.round(((st.attempted || 0) / st.total) * 100) : 0;
                const prog = st.attempted != null && st.total != null
                    ? `<div class="rc-prog"><div class="rc-prog-bar"><i style="width:${pct}%"></i></div><span>${st.attempted}/${st.total}</span></div>`
                    : '<span style="color:#94a3b8">—</span>';
                const full = `${s.first_name || ''} ${s.last_name || ''}`.trim();
                return `<tr data-code="${esc(s.student_code)}" class="${sel ? 'is-sel' : ''}">
                    <td class="c-chk"><input type="checkbox" class="rc-rowchk" ${sel ? 'checked' : ''}></td>
                    <td class="c-code">${esc(s.student_code)}</td>
                    <td><div class="rc-name"><span class="rc-avatar" style="background:${this.avatarColor(full)}">${esc((s.first_name || '?').charAt(0))}</span>${esc(full)}</div></td>
                    <td><span class="rc-class">${esc(s.class_grade || '-')}</span></td>
                    <td>${prog}</td>
                    <td class="rc-pass">${st.passed ?? '—'}</td>
                    <td class="rc-rew">${st.reward != null ? '₪' + st.reward.toFixed(1) : '—'}</td>
                    <td><button type="button" class="rc-icon-btn" data-act="preview" title="הצג דוח לתלמיד זה"><i class="fas fa-eye"></i></button></td>
                </tr>`;
            }).join('');
        }

        document.querySelectorAll('.rc-table thead th[data-sort]').forEach(th => {
            const arrow = th.querySelector('.rc-arrow');
            arrow.textContent = th.dataset.sort === this.filter.sortKey ? (this.filter.sortDir === 1 ? '▲' : '▼') : '';
        });
        const info = document.getElementById('rcFootInfo');
        if (info) info.textContent = `מוצגים ${list.length} מתוך ${this.allStudentsData.length} תלמידים`;
        this.updateSelectionUI();
    }

    updateSelectionUI() {
        const n = this.selected.size;
        const q = id => document.getElementById(id);
        if (q('rcSelCount')) q('rcSelCount').textContent = n;
        if (q('kpiSelected')) q('kpiSelected').textContent = n;

        let reward = 0, hasReward = false;
        this.allStudentsData.forEach(s => {
            if (!this.selected.has(s.student_code)) return;
            const st = this.getStats(s);
            if (st.reward != null) { reward += st.reward; hasReward = true; }
        });
        if (q('kpiReward')) q('kpiReward').textContent = hasReward ? '₪' + reward.toFixed(1) : '—';

        ['rcGenerateBtn', 'rcExportBtn'].forEach(id => { if (q(id)) q(id).disabled = n === 0 || this._busy; });
        if (q('rcClearSel')) q('rcClearSel').style.visibility = n ? 'visible' : 'hidden';

        const all = q('rcCheckAll');
        if (all) {
            const filtered = this.getFiltered();
            const selInFiltered = filtered.filter(s => this.selected.has(s.student_code)).length;
            all.checked = filtered.length > 0 && selInFiltered === filtered.length;
            all.indeterminate = selInFiltered > 0 && selInFiltered < filtered.length;
        }
    }

    toggleRow(code, force) {
        const on = force !== undefined ? force : !this.selected.has(code);
        if (on) this.selected.add(code); else this.selected.delete(code);
        const tr = document.querySelector(`#rcTbody tr[data-code="${CSS.escape(code)}"]`);
        if (tr) {
            tr.classList.toggle('is-sel', on);
            const cb = tr.querySelector('.rc-rowchk');
            if (cb) cb.checked = on;
        }
    }

    bindViewEvents() {
        const q = id => document.getElementById(id);

        q('rcSearch').addEventListener('input', e => { this.filter.text = e.target.value; this.renderTable(); });

        q('rcChips').addEventListener('click', e => {
            const b = e.target.closest('.rc-chip');
            if (!b) return;
            this.filter.cls = b.dataset.cls;
            this.renderChips();
            this.renderTable();
        });

        document.querySelector('.rc-table thead').addEventListener('click', e => {
            const th = e.target.closest('th[data-sort]');
            if (!th) return;
            if (this.filter.sortKey === th.dataset.sort) this.filter.sortDir *= -1;
            else { this.filter.sortKey = th.dataset.sort; this.filter.sortDir = 1; }
            this.renderTable();
        });

        q('rcTbody').addEventListener('click', e => {
            const tr = e.target.closest('tr[data-code]');
            if (!tr) return;
            const code = tr.dataset.code;
            if (e.target.closest('[data-act="preview"]')) {
                this.generateForCodes([code]);
                return;
            }
            if (e.target.classList.contains('rc-rowchk')) { this.toggleRow(code, e.target.checked); }
            else { this.toggleRow(code); }
            this.updateSelectionUI();
        });

        const selectFiltered = (on) => {
            this.getFiltered().forEach(s => this.toggleRow(s.student_code, on));
            this.updateSelectionUI();
        };
        q('rcCheckAll').addEventListener('change', e => selectFiltered(e.target.checked));
        q('rcSelectFiltered').addEventListener('click', () => selectFiltered(true));
        q('rcClearSel').addEventListener('click', () => { this.selected.clear(); this.renderTable(); });

        q('rcGenerateBtn').addEventListener('click', () => this.generateForCodes([...this.selected]));
        q('rcExportBtn').addEventListener('click', () => this.exportSelected());

        // הגדרות
        const aside = document.querySelector('.rc-settings');
        const onSetting = e => {
            const el = e.target.closest('[data-key]');
            if (!el) return;
            this.settings[el.dataset.key] = el.type === 'checkbox' ? el.checked : el.value;
            this.saveSettings();
            this.updateMini();
        };
        aside.addEventListener('input', onSetting);
        aside.addEventListener('change', onSetting);
        q('rcSwatches').addEventListener('click', e => {
            const b = e.target.closest('.rc-swatch');
            if (!b) return;
            this.settings.theme = b.dataset.theme;
            this.saveSettings();
            q('rcSwatches').querySelectorAll('.rc-swatch').forEach(x => x.classList.toggle('active', x === b));
            this.updateMini();
        });
        q('rcReset').addEventListener('click', async () => {
            const ok = await window.customConfirm('לאפס את כל ההגדרות לברירת המחדל?');
            if (!ok) return;
            this.settings = { ...DEFAULT_SETTINGS };
            this.saveSettings();
            this.renderView();
        });
    }

    updateMini() {
        const box = document.getElementById('rcMini');
        if (!box) return;
        const s = this.settings;
        const th = THEMES[s.theme] || THEMES.graphite;
        box.innerHTML = `
            <div class="rc-mini-bar" style="background:${th.accent}"></div>
            <div class="rc-mini-body">
                ${s.bsd ? '<div style="text-align:center;font-size:.7rem;color:#64748b;margin-bottom:4px">בס״ד</div>' : ''}
                <div class="rc-mini-title">${esc(s.title.trim() || DEFAULT_SETTINGS.title)}</div>
                ${s.subtitle.trim() ? `<div class="rc-mini-sub" style="color:${th.accent}">${esc(s.subtitle)}</div>` : ''}
                <div class="rc-mini-date">${esc(formatHebrewDate())}</div>
                ${s.note.trim() ? `<div class="rc-mini-note" style="background:${th.soft};border-color:${th.accent}">${esc(s.note)}</div>` : ''}
            </div>`;
    }

    // ============================================================
    //  איסוף נתונים והפקה
    // ============================================================

    setBusy(on) {
        this._busy = on;
        const g = document.getElementById('rcGenerateBtn');
        if (g) g.innerHTML = on ? '<i class="fas fa-spinner fa-spin"></i> מכין דוחות...' : '<i class="fas fa-print"></i> תצוגה מקדימה והדפסה';
        document.querySelectorAll('[data-act="preview"]').forEach(b => { b.disabled = on; });
        this.updateSelectionUI();
    }

    async fetchSummary(query) {
        const res = await fetch(`${this.apiBase}/student-summary${query}`);
        if (!res.ok) throw new Error('bad response');
        const data = await res.json();
        return Array.isArray(data) ? data : (data ? [data] : []);
    }

    // מביא נתונים טריים: כיתה שלמה בבקשה אחת, השאר לפי תלמיד
    async collectStudents(codes) {
        const wanted = new Set(codes);
        const byClass = {};
        this.allStudentsData.forEach(s => { const c = s.class_grade || ''; (byClass[c] = byClass[c] || []).push(s); });

        const jobs = [];
        Object.entries(byClass).forEach(([cls, list]) => {
            if (cls && list.length > 1 && list.every(s => wanted.has(s.student_code))) {
                jobs.push(() => this.fetchSummary(`?class_grade=${encodeURIComponent(cls)}`));
                list.forEach(s => wanted.delete(s.student_code));
            }
        });
        wanted.forEach(code => jobs.push(() => this.fetchSummary(`?student_code=${encodeURIComponent(code)}`)));

        const results = [];
        let failed = 0, next = 0;
        const worker = async () => {
            while (next < jobs.length) {
                const i = next++;
                try { results[i] = await jobs[i](); } catch (e) { failed++; results[i] = []; }
            }
        };
        await Promise.all(Array.from({ length: Math.min(5, jobs.length) }, worker));

        const order = new Map(this.allStudentsData.map((s, i) => [s.student_code, i]));
        const seen = new Set();
        const students = results.flat().filter(s => {
            if (!s || seen.has(s.student_code) || !codes.includes(s.student_code)) return false;
            seen.add(s.student_code);
            return true;
        }).sort((a, b) => (order.get(a.student_code) ?? 1e9) - (order.get(b.student_code) ?? 1e9));

        if (failed) await window.customAlert(`לא ניתן היה לטעון נתונים עבור ${failed} בקשות. הדוח יכלול את מי שנטען בהצלחה.`, true);
        return students;
    }

    autoName(students) {
        if (students.length === 1) return safeName(`דוח_${students[0].first_name}_${students[0].last_name}`);
        const classes = new Set(students.map(s => s.class_grade || ''));
        if (classes.size === 1 && [...classes][0]) return safeName(`דוחות_כיתה_${[...classes][0]}`);
        return `דוחות_${students.length}_תלמידים`;
    }

    async generateForCodes(codes) {
        if (!codes.length) return await window.customAlert('נא לבחור לפחות תלמיד אחד.', true);
        if (this._busy) return;
        this.setBusy(true);
        try {
            const students = await this.collectStudents(codes);
            if (!students.length) {
                await window.customAlert('לא נמצאו נתונים עבור הבחירה.', true);
            } else {
                this.lastRenderedStudents = students;
                this.lastReportName = this.autoName(students);
                await this.buildReportHtml(students);
            }
        } catch (e) {
            console.error(e);
            await window.customAlert('שגיאת תקשורת.', true);
        } finally {
            this.setBusy(false);
        }
    }

    async exportSelected() {
        const codes = [...this.selected];
        if (!codes.length || this._busy) return;
        this.setBusy(true);
        try {
            const students = await this.collectStudents(codes);
            if (students.length) {
                this.lastReportName = this.autoName(students);
                this.exportToExcel(students);
            }
        } finally {
            this.setBusy(false);
        }
    }

    // ============================================================
    //  בניית הדוח
    // ============================================================

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
        const s = this.settings;
        return {
            ...s,
            title: (s.title || '').trim() || DEFAULT_SETTINGS.title,
            subtitle: (s.subtitle || '').trim(),
            note: (s.note || '').trim(),
            footerText: (s.footerText || '').trim()
        };
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
        this.fitZoom();
        document.getElementById('printReportBodyWrapper').scrollTop = 0;
    }

    renderStudentPages(student, o, logo, hebDate) {
        const allExams = student.exams || [];
        let exams = allExams;
        if (o.hideUnattempted) exams = exams.filter(ex => ex.passed === true || ex.passed === false);

        const calc = this.getStats(student);
        const attempted = calc.attempted ?? 0;
        const passed = calc.passed ?? 0;
        const total = calc.total ?? allExams.length;
        const failed = Math.max(0, attempted - passed);
        const reward = calc.reward ?? 0;

        const th = THEMES[o.theme] || THEMES.graphite;
        const bodyH = computeBodyH(o);
        const groups = groupExams(exams);
        const plan = planLayout(groups, { pagesMode: o.pagesMode, cols: o.cols, bodyH });
        const fs = Math.min(plan.rowH * 0.6, 3.5).toFixed(2);
        const totalPages = plan.pages.length;

        const titleSize = o.title.length > 34 ? 4.4 : (o.title.length > 22 ? 5.4 : 6.4);
        const codeChip = o.showStudentCode ? `<span class="rp-chip">קוד ${esc(student.student_code)}</span>` : '';

        // מקרא — רק הסוגים שמופיעים בדוח
        const typesPresent = [...new Map(groups.map(g => [g.typeInfo.cls, g.typeInfo])).values()].filter(t => t.label);
        const legend = typesPresent.map(t => `<span class="${t.cls}"><i class="sw"></i>${t.label}</span>`).join('')
            + '<span><b class="ok">✓</b> עבר</span><span><b class="no">✕</b> לא עבר</span><span>ללא סימון – טרם נבחן</span>';

        return plan.pages.map((cols, pageIdx) => {
            const colsHtml = [];
            for (let i = 0; i < plan.N; i++) colsHtml.push(this.renderColumn(cols[i] || [], o, plan.N));
            const body = exams.length === 0 ? '<div class="rp-empty">לא נמצאו מבחנים להצגה</div>' : colsHtml.join('');

            return `
            <div class="rp-page" style="--ac:${th.accent};--ac-soft:${th.soft};">
                ${o.bsd ? '<div class="rp-bsd">בס״ד</div>' : ''}
                <div class="rp-head">
                    ${logo ? `<img class="rp-logo" src="${esc(logo)}" alt="">` : ''}
                    <div class="rp-title">
                        <h1 style="font-size:${titleSize}mm">${esc(o.title)}</h1>
                        ${o.subtitle ? `<div class="rp-sub">${esc(o.subtitle)}</div>` : ''}
                        <div class="rp-date">${esc(hebDate)}</div>
                    </div>
                    <div class="rp-student">
                        <div class="rp-name">${esc(student.first_name)} ${esc(student.last_name)}</div>
                        <div class="rp-meta">כיתה ${esc(student.class_grade || 'כללי')}${codeChip}</div>
                    </div>
                </div>

                ${o.showStats ? `
                <div class="rp-stats">
                    <div class="rp-stat">נבחן ב-<b>${attempted}</b> מתוך ${total}</div>
                    <div class="rp-stat ok">עברו <b>${passed}</b></div>
                    <div class="rp-stat bad">לא עברו <b>${failed}</b></div>
                    ${o.showReward ? `<div class="rp-stat money">סך מלגה <b>₪${reward.toFixed(1)}</b></div>` : ''}
                </div>` : '<div class="rp-gap"></div>'}

                ${o.note ? `<div class="rp-note">${esc(o.note)}</div>` : ''}

                <div class="rp-body" style="height:${bodyH}mm; --rh:${plan.rowH.toFixed(2)}mm; --fs:${fs}mm;">${body}</div>

                <div class="rp-foot">
                    <div class="rp-legend">${legend}</div>
                    <span>${esc(o.footerText)}${totalPages > 1 ? `${o.footerText ? ' &nbsp;·&nbsp; ' : ''}עמוד ${pageIdx + 1} מתוך ${totalPages}` : ''}</span>
                </div>
            </div>`;
        });
    }

    renderColumn(col, o, N) {
        const rw = o.showReward;
        const head = `<div class="rp-colhead ${rw ? '' : 'no-rw'}"><span>קוד</span><span>הישג</span>${rw ? '<span>מלגה</span>' : ''}</div>`;

        const rows = col.map(it => {
            const g = it.g;
            const ti = g.typeInfo;
            if (it.t === 'h') {
                const pill = ti.label ? `<span class="rp-pill">${ti.label}</span>` : '';
                let stat = '';
                if (!it.cont && o.showSummary) {
                    const p = g.exams.filter(e => e.passed === true).length;
                    const sum = g.exams.reduce((s, e) => s + (e.passed === true ? (Number(e.reward_earned) || 0) : 0), 0);
                    stat = `<span class="rp-mh-stat">${p}/${g.exams.length}${rw && sum > 0 && N <= 3 ? ` · ₪${sum.toFixed(1)}` : ''}</span>`;
                }
                return `<div class="rp-mh ${ti.cls}"><span>${esc(g.name)}</span>${pill}${stat}</div>`;
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
            return `<div class="rp-row ${ti.cls} ${cls} s${it.idx % 2} ${rw ? '' : 'no-rw'}"><span class="c-code">${esc(ex.exam_code)}</span><span class="c-mark">${mark}</span>${rw ? `<span class="c-rw">${rewardText}</span>` : ''}</div>`;
        }).join('');

        return `<div class="rp-col">${head}${rows}</div>`;
    }

    // ============================================================
    //  הדפסה / PDF / אקסל
    // ============================================================

    printReport() {
        const oldTitle = document.title;
        document.title = this.lastReportName;
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
        const header = ['קוד תלמיד', 'שם פרטי', 'שם משפחה', 'כיתה', 'סוג', 'מסכת', 'קוד מבחן', 'פירוט', 'סטטוס', 'מלגה'];
        const lines = [header.map(csvCell).join(',')];

        students.forEach(student => {
            const base = [student.student_code, student.first_name, student.last_name, student.class_grade || ''];
            const exams = student.exams || [];
            if (exams.length === 0) {
                lines.push([...base, '', '', '', 'ללא מבחנים', '', ''].map(csvCell).join(','));
                return;
            }
            exams.forEach(ex => {
                const details = ex.details || {};
                const desc = Object.values(details).filter(v => v !== null && v !== '').join(' - ') || ex.exam_code;
                const status = ex.passed === true ? 'עבר' : (ex.passed === false ? 'לא עבר' : 'לא בוצע');
                const reward = ex.passed === true ? (Number(ex.reward_earned) || 0) : 0;
                const typeLabel = typeOf(ex.exam_type).label;
                lines.push([...base.map(csvCell), csvCell(typeLabel), csvCell(details.masechet || ''), csvCell(ex.exam_code), csvCell(desc), csvCell(status), reward].join(','));
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
