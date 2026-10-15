// ============================================================
//  client-reports.js  —  הפקת דוחות הישגים ומלגות (הדפסה / PDF / אקסל)
// ============================================================

const H2C_URL   = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
const JSPDF_URL = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';

// ---------- מידות העמוד (מ"מ) ----------
const PAGE = {
    width: 210,
    height: 296,     // מעט פחות מ-297 כדי למנוע עמוד ריק בהדפסה
    padding: 9,
    bodyH: 224,      // גובה אזור הטבלאות
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

// ---------- הגדרות (בעתיד: טעינה/שמירה מול השרת) ----------
export const DEFAULT_SETTINGS = {
    title: 'דוח הישגים ומלגות',
    subtitle: '',
    showReward: true,
    showSummary: true,
    showStudentCode: true,
    hideUnattempted: false,
    pagesMode: 'auto',   // auto | 1 | 2
    cols: 'auto',        // auto | 2 | 3 | 4 | 5
    duplex: false
};
const SETTINGS_KEY = 'peer_report_settings_v3';
const FOOTER_TEXT = 'הופק ממערכת ניהול פאר המשנה';

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

function layoutFor(items, P, N) {
    const C = P * N;
    const maxCap = Math.floor(PAGE.bodyH / PAGE.minRow) - 1;
    for (let cap = Math.max(4, Math.ceil(items.length / C)); cap <= maxCap; cap++) {
        const cols = greedyColumns(items, cap);
        if (cols.length <= C) return { cap, cols };
    }
    return null;
}

const rowFor = cap => Math.min(PAGE.maxRow, (PAGE.bodyH - 0.5) / (cap + 1));

// opts: { pagesMode: 'auto'|'1'|'2', cols: 'auto'|'2'..'5' }
// מחזיר: { N, rowH, pages: [ [col, col, ...], ... ] }  — השורות מתחלקות שווה בין העמודים
export function planLayout(groups, opts = {}) {
    const pagesMode = opts.pagesMode || 'auto';
    const colsOpt = opts.cols || 'auto';
    const items = flattenItems(groups);

    const pick = (Ps, nFor) => {
        let best = null;
        for (const P of Ps) {
            for (const N of nFor(P)) {
                const r = layoutFor(items, P, N);
                if (!r) continue;
                const cand = { P, N, cols: r.cols, rowH: rowFor(r.cap) };
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

// ============================================================
//  המחלקה הראשית
// ============================================================

export class ReportManager {
    constructor(container, apiBase) {
        this.container = container;
        this.apiBase = apiBase;
        this.allStudentsData = [];
        this.classes = [];
        this.settings = this.loadSettings();
        this.logoUrl = 'https://smti.uk/img/peer.jpg';
        this._logoData = null;
        this._scripts = {};
        this.lastRenderedStudents = null;
        this.lastReportName = 'דוחות';

        this.injectStyles();
        this.injectModal();

        // מאזינים יחידים (לא מצטברים בכל רינדור)
        document.addEventListener('click', (e) => {
            const input = document.getElementById('reportStudentSearch');
            const dd = document.getElementById('reportSearchResults');
            if (input && dd && !input.contains(e.target) && !dd.contains(e.target)) dd.classList.add('hidden');
        });
        const onSetting = (e) => {
            const el = e.target.closest('[data-key]');
            if (!el || !this.container.contains(el)) return;
            this.settings[el.dataset.key] = el.type === 'checkbox' ? el.checked : el.value;
            this.saveSettings();
        };
        this.container.addEventListener('input', onSetting);
        this.container.addEventListener('change', onSetting);

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
        this.classes = Array.from(new Set(this.allStudentsData.map(s => s.class_grade).filter(Boolean)))
            .sort((a, b) => String(a).localeCompare(String(b), 'he'));
        this.renderView();
    }

    setStudents() {
        this.fetchStudentSummaries();
    }

    // ============================================================
    //  CSS של הדוח
    // ============================================================

    injectStyles() {
        if (document.getElementById('reportStyles')) return;
        const css = `
        .rp-page { width: ${PAGE.width}mm; height: ${PAGE.height}mm; padding: ${PAGE.padding}mm; box-sizing: border-box;
            background: #fff; color: #0f172a; direction: rtl; position: relative; overflow: hidden;
            display: flex; flex-direction: column; margin: 0 auto 12px auto; box-shadow: 0 4px 14px rgba(15,23,42,.2);
            font-family: 'Segoe UI', 'Noto Sans Hebrew', Arial, sans-serif;
            -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        .rp-page *, .rp-page *::before, .rp-page *::after { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }

        .rp-head { height: 26mm; flex: none; display: flex; align-items: center; gap: 5mm; border-bottom: .7mm solid #0f172a; padding-bottom: 3mm; }
        .rp-logo { height: 20mm; width: auto; max-width: 32mm; object-fit: contain; flex: none; }
        .rp-title { flex: 1; min-width: 0; }
        .rp-title h1 { margin: 0; font-weight: 800; line-height: 1.15; color: #0f172a; }
        .rp-sub { margin-top: 1mm; font-size: 3.8mm; font-weight: 700; color: #334155; line-height: 1.2; }
        .rp-date { margin-top: 1.2mm; font-size: 3.4mm; color: #475569; font-weight: 600; }
        .rp-student { text-align: left; flex: none; max-width: 66mm; }
        .rp-student .rp-name { font-size: 5.4mm; font-weight: 800; line-height: 1.15; }
        .rp-student .rp-meta { margin-top: 1.2mm; font-size: 3.4mm; color: #334155; }
        .rp-chip { display: inline-block; background: #e2e8f0; border-radius: 1mm; padding: .3mm 1.6mm; margin-right: 1.5mm; font-size: 3mm; }

        .rp-stats { height: 11mm; flex: none; display: flex; gap: 3mm; margin: 3mm 0; }
        .rp-stat { flex: 1; border: .3mm solid #cbd5e1; border-radius: 1.5mm; background: #f8fafc; display: flex; align-items: center; justify-content: center; gap: 1.8mm; font-size: 3.2mm; color: #334155; white-space: nowrap; }
        .rp-stat b { font-size: 4.8mm; font-weight: 800; color: #0f172a; }
        .rp-stat.ok b { color: #059669; } .rp-stat.bad b { color: #dc2626; } .rp-stat.money b { color: #0284c7; }

        .rp-body { flex: none; height: ${PAGE.bodyH}mm; display: flex; gap: 3mm; align-items: flex-start; }
        .rp-col { flex: 1; min-width: 0; border-top: .25mm solid #94a3b8; border-left: .25mm solid #cbd5e1; border-right: .25mm solid #cbd5e1; }
        .rp-colhead, .rp-row { height: var(--rh); font-size: var(--fs); display: grid; grid-template-columns: 1fr 8mm 11mm; align-items: stretch; }
        .rp-colhead.no-rw, .rp-row.no-rw { grid-template-columns: 1fr 8mm; }
        .rp-colhead > span, .rp-row > span { display: flex; align-items: center; min-width: 0; }
        .rp-colhead > span:first-child, .rp-row > span:first-child { padding: 0 2mm; }
        .rp-colhead > span:not(:first-child), .rp-row > span:not(:first-child) { justify-content: center; border-right: .2mm solid #cbd5e1; }
        .rp-colhead { background: #e2e8f0; color: #0f172a; font-weight: 700; border-bottom: .25mm solid #94a3b8; }

        /* כותרת מסכת — אותו צבע כהה לשניהם; ההבדל בין משניות לגמרא בתווית */
        .rp-mh { height: var(--rh); font-size: var(--fs); display: flex; align-items: center; gap: 1.8mm; padding: 0 2mm; background: #1e293b; color: #fff; font-weight: 800; white-space: nowrap; overflow: hidden; }
        .rp-pill { flex: none; font-size: .78em; font-weight: 800; padding: .1mm 1.9mm; border-radius: 10mm; }
        .rp-mh.t-m .rp-pill { background: transparent; color: #fff; border: .25mm solid #fff; }
        .rp-mh.t-g .rp-pill { background: #fff; color: #1e293b; border: .25mm solid #fff; }
        .rp-mh-stat { margin-right: auto; font-weight: 600; font-size: .9em; opacity: .95; }

        .rp-row { background: #fff; border-bottom: .25mm solid #cbd5e1; }
        .rp-row.s1 { background: #f1f5f9; }
        .rp-row .c-code { font-weight: 700; color: #1e293b; white-space: nowrap; overflow: hidden; }
        .rp-row .c-mark { font-weight: 900; font-size: 1.1em; }
        .rp-row .c-rw { font-weight: 600; color: #475569; white-space: nowrap; }
        .rp-row.pass { background: #ecfdf5; } .rp-row.pass.s1 { background: #d8f6e5; } .rp-row.pass .c-mark { color: #059669; }
        .rp-row.fail { background: #fef2f2; } .rp-row.fail.s1 { background: #fde3e3; } .rp-row.fail .c-mark { color: #dc2626; }
        .rp-row.none .c-code { font-weight: 500; color: #64748b; }
        .rp-empty { width: 100%; text-align: center; padding: 20mm 0; color: #64748b; font-size: 4mm; }

        .rp-foot { margin-top: auto; flex: none; height: 6mm; padding-top: 1.2mm; border-top: .2mm solid #e2e8f0; display: flex; justify-content: space-between; align-items: center; font-size: 2.7mm; color: #64748b; gap: 4mm; }
        .rp-legend { display: flex; gap: 3mm; align-items: center; white-space: nowrap; }
        .rp-legend .ok { color: #059669; font-weight: 900; } .rp-legend .no { color: #dc2626; font-weight: 900; }
        .rp-blank { background: #fff; }
        @media screen { .rp-blank:not(.rp-export)::after { content: 'גב הדף – ריק בכוונה (הדפסה דו צדדית)'; position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; color: #94a3b8; font-size: 4mm; border: .4mm dashed #cbd5e1; margin: 9mm; } }

        @media print {
            @page { size: A4 portrait; margin: 0; }
            .rp-page { margin: 0 !important; box-shadow: none !important; break-after: page; page-break-after: always; }
            .rp-page:last-child { break-after: auto; page-break-after: auto; }
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
    //  מסך ההגדרות
    // ============================================================

    renderView() {
        const s = this.settings;
        const inputStyle = 'width: 100%; padding: 8px; border-radius: 6px; border: 1px solid #cbd5e1; background: white; outline: none; font-size: 0.9rem;';
        const chk = (key, label) => `
            <label style="display: flex; align-items: center; gap: 8px; font-size: 0.9rem; cursor: pointer;">
                <input type="checkbox" data-key="${key}" ${s[key] ? 'checked' : ''} style="width: 16px; height: 16px;"> ${label}
            </label>`;
        const sel = (key, label, options) => `
            <div>
                <label style="font-size: 0.9rem; display: block; margin-bottom: 5px; color: #334155;">${label}</label>
                <select data-key="${key}" style="${inputStyle}">
                    ${options.map(([v, t]) => `<option value="${v}" ${String(s[key]) === v ? 'selected' : ''}>${t}</option>`).join('')}
                </select>
            </div>`;

        this.container.innerHTML = `
            <div class="card compact-card no-print" style="margin-bottom: 20px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
                <div style="border-bottom: 1px solid var(--border-color); padding-bottom: 15px; margin-bottom: 20px;">
                    <h3 style="margin: 0; font-size: 1.15rem; color: #1e293b;"><i class="fas fa-sliders-h" style="color: var(--primary-color);"></i> הפקת דוחות הישגים</h3>
                </div>

                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 25px;">

                    <div style="background: #f8fafc; padding: 20px; border-radius: 8px; border: 1px solid #e2e8f0;">
                        <h4 style="margin-top: 0; margin-bottom: 15px; font-size: 1rem; color: #0f172a;"><i class="fas fa-cog"></i> הגדרות הדוח</h4>
                        <div style="display: flex; flex-direction: column; gap: 12px;">

                            <div>
                                <label style="font-size: 0.9rem; display: block; margin-bottom: 5px; color: #334155;">כותרת הדוח</label>
                                <input type="text" data-key="title" value="${esc(s.title)}" maxlength="50" placeholder="${esc(DEFAULT_SETTINGS.title)}" autocomplete="off" style="${inputStyle}">
                            </div>
                            <div>
                                <label style="font-size: 0.9rem; display: block; margin-bottom: 5px; color: #334155;">כותרת משנה (לא חובה)</label>
                                <input type="text" data-key="subtitle" value="${esc(s.subtitle)}" maxlength="50" placeholder="לדוגמה: מחזור חורף" autocomplete="off" style="${inputStyle}">
                            </div>

                            ${chk('showReward', 'הצג עמודת מלגה (פירוט כספי)')}
                            ${chk('showSummary', 'הצג סיכום בכותרת כל מסכת')}
                            ${chk('showStudentCode', 'הצג קוד תלמיד בפרטי התעודה')}
                            ${chk('hideUnattempted', '<strong>הסתר מבחנים שלא בוצעו</strong> (דוח תמציתי)')}

                            ${sel('pagesMode', 'אורך הדוח לכל תלמיד', [
                                ['auto', 'אוטומטי (עמוד אחד, ואם צפוף מדי — שני עמודים)'],
                                ['1', 'עמוד אחד בלבד (כתב קטן יותר)'],
                                ['2', 'שני עמודים (כתב גדול וברור)']
                            ])}
                            ${sel('cols', 'מספר עמודות בעמוד', [
                                ['auto', 'אוטומטי'], ['2', '2 עמודות'], ['3', '3 עמודות'], ['4', '4 עמודות'], ['5', '5 עמודות']
                            ])}

                            ${chk('duplex', 'הדפסה דו צדדית (שני עמודים על דף אחד)')}
                            <div style="font-size: 0.78rem; color: var(--text-muted); margin-top: -4px;">
                                תלמיד עם עמוד אחד יקבל גב ריק, כדי שהתלמיד הבא יתחיל בדף חדש. בחלון ההדפסה יש לבחור "הדפסה דו צדדית".
                            </div>
                        </div>
                    </div>

                    <div style="display: flex; flex-direction: column; gap: 20px;">
                        <div style="background: white; padding: 20px; border-radius: 8px; border: 1px solid #e2e8f0; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
                            <h4 style="margin-top: 0; margin-bottom: 15px; font-size: 1rem;"><i class="fas fa-user"></i> הפקה לתלמיד בודד</h4>
                            <div class="search-box">
                                <i class="fas fa-search search-icon"></i>
                                <input type="text" id="reportStudentSearch" placeholder="הקלד קוד או שם תלמיד..." autocomplete="off" style="width: 100%; padding: 10px 35px 10px 15px; border-radius: 6px;">
                                <div id="reportSearchResults" class="search-results-dropdown hidden" style="top: 100%; margin-top: 5px;"></div>
                            </div>
                        </div>

                        <div style="background: white; padding: 20px; border-radius: 8px; border: 1px solid #e2e8f0; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
                            <h4 style="margin-top: 0; margin-bottom: 15px; font-size: 1rem;"><i class="fas fa-users"></i> הפקה מרוכזת לכיתה</h4>
                            <div style="display: flex; gap: 10px;">
                                <select id="reportClassSelect" style="flex:1; padding: 10px; border: 1px solid #cbd5e1; border-radius: 6px; background: white; outline: none;">
                                    <option value="">-- בחר כיתה להפקה --</option>
                                    ${this.classes.map(c => `<option value="${esc(c)}">כיתה ${esc(c)}</option>`).join('')}
                                </select>
                                <button class="btn btn-primary" id="generateClassReportBtn" style="padding: 0 20px;"><i class="fas fa-magic"></i> הפק דוחות</button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        this.attachSearchEvents();
    }

    attachSearchEvents() {
        const searchInput = document.getElementById('reportStudentSearch');
        const resultsDropdown = document.getElementById('reportSearchResults');

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
        const s = this.settings;
        return {
            ...s,
            title: (s.title || '').trim() || DEFAULT_SETTINGS.title,
            subtitle: (s.subtitle || '').trim()
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
        document.getElementById('printReportBodyWrapper').scrollTop = 0;
    }

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

        const groups = groupExams(exams);
        const plan = planLayout(groups, { pagesMode: o.pagesMode, cols: o.cols });
        const fs = Math.min(plan.rowH * 0.6, 3.5).toFixed(2);
        const totalPages = plan.pages.length;

        const titleSize = o.title.length > 34 ? 4.4 : (o.title.length > 22 ? 5.4 : 6.4);
        const codeChip = o.showStudentCode ? `<span class="rp-chip">קוד ${esc(student.student_code)}</span>` : '';

        return plan.pages.map((cols, pageIdx) => {
            const colsHtml = [];
            for (let i = 0; i < plan.N; i++) colsHtml.push(this.renderColumn(cols[i] || [], o, plan.N));
            const body = exams.length === 0 ? '<div class="rp-empty">לא נמצאו מבחנים להצגה</div>' : colsHtml.join('');

            return `
            <div class="rp-page">
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

                <div class="rp-stats">
                    <div class="rp-stat">נבחן ב-<b>${attempted}</b> מתוך ${total}</div>
                    <div class="rp-stat ok">עברו <b>${passed}</b></div>
                    <div class="rp-stat bad">לא עברו <b>${failed}</b></div>
                    ${o.showReward ? `<div class="rp-stat money">סך מלגה <b>₪${reward.toFixed(1)}</b></div>` : ''}
                </div>

                <div class="rp-body" style="--rh:${plan.rowH.toFixed(2)}mm; --fs:${fs}mm;">${body}</div>

                <div class="rp-foot">
                    <div class="rp-legend"><span><b class="ok">✓</b> עבר</span><span><b class="no">✕</b> לא עבר</span><span>שורה ללא סימון – טרם נבחן</span></div>
                    <span>${esc(FOOTER_TEXT)}${totalPages > 1 ? ` &nbsp;·&nbsp; עמוד ${pageIdx + 1} מתוך ${totalPages}` : ''}</span>
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
                if (!it.cont && o.showSummary && (N <= 4 || g.name.length <= 6)) {   // ב-5 עמודות אין מקום לסיכום ליד שם ארוך
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
            return `<div class="rp-row ${cls} s${it.idx % 2} ${rw ? '' : 'no-rw'}"><span class="c-code">${esc(ex.exam_code)}</span><span class="c-mark">${mark}</span>${rw ? `<span class="c-rw">${rewardText}</span>` : ''}</div>`;
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
