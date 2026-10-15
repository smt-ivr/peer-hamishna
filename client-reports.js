// ============================================================
//  client-reports.js  —  הפקת דוחות הישגים ומלגות (הדפסה / PDF / אקסל)
// ============================================================

const H2C_URL   = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
const JSPDF_URL = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';

// מידות העמוד (במ"מ). A4 = 210x297, גובה העמוד מעט קטן כדי למנוע עמוד ריק בהדפסה.
const PAGE = {
    width: 210,
    height: 296,
    padding: 9,
    bodyH: 224,     // גובה אזור הטבלאות
    minRow: 4.2,    // גובה שורה מינימלי (מתחת לזה עוברים לעמוד נוסף)
    prefRow: 4.4,   // גובה שורה מועדף לבחירת מספר עמודות אוטומטי
    maxRow: 6.5     // גובה שורה מקסימלי (כשיש מעט מבחנים)
};

// ---------- עזרים ----------

export function esc(v) {
    return String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// תא CSV בטוח: מכפיל גרשיים ומנטרל נוסחאות באקסל (=,+,-,@)
export function csvCell(v) {
    let s = String(v ?? '');
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return `"${s.replace(/"/g, '""')}"`;
}

const ONES = ['', 'א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח', 'ט'];
const TENS = ['', 'י', 'כ', 'ל', 'מ', 'נ', 'ס', 'ע', 'פ', 'צ'];
const HUNDS = ['', 'ק', 'ר', 'ש', 'ת'];

// מספר -> אותיות עבריות (ד׳, ט״ו, תשפ״ז)
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

// תאריך עברי מלא: "ד׳ בחשוון התשפ״ז"
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

function formatGregorian(date = new Date()) {
    const p = n => String(n).padStart(2, '0');
    return `${p(date.getDate())}.${p(date.getMonth() + 1)}.${date.getFullYear()}`;
}

// ---------- חישוב פריסה ----------

// קיבוץ מבחנים לפי מסכת (לפי סדר הופעה ראשונה)
export function groupExams(exams) {
    const map = new Map();
    exams.forEach(ex => {
        const name = String((ex.details && ex.details.masechet) || '').trim() || 'כללי';
        const type = ex.exam_type || '';
        const key = `${name}|${type}`;
        if (!map.has(key)) map.set(key, { name, type, exams: [] });
        map.get(key).exams.push(ex);
    });
    const groups = [...map.values()];
    const nameCount = {};
    groups.forEach(g => { nameCount[g.name] = (nameCount[g.name] || 0) + 1; });
    groups.forEach(g => {
        const typeLabel = g.type === 'mishnayot' ? 'משניות' : (g.type === 'gemara' ? 'גמרא' : '');
        g.label = nameCount[g.name] > 1 && typeLabel ? `${g.name} (${typeLabel})` : g.name;
    });
    return groups;
}

function flattenItems(groups) {
    const items = [];
    groups.forEach(g => {
        items.push({ t: 'h', g });
        g.exams.forEach(ex => items.push({ t: 'e', ex, g }));
    });
    return items;
}

// חלוקת השורות לעמודות בקיבולת נתונה. כותרת מסכת לא נשארת לבד בתחתית עמודה,
// ומסכת שנחתכת באמצע מקבלת כותרת "(המשך)" בעמודה הבאה.
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

function fitColumns(items, N) {
    const maxCap = Math.floor(PAGE.bodyH / PAGE.minRow) - 1;
    for (let cap = Math.ceil(items.length / N); cap <= maxCap; cap++) {
        const cols = greedyColumns(items, cap);
        if (cols.length <= N) return { cap, cols, single: true };
    }
    return { cap: maxCap, cols: greedyColumns(items, maxCap), single: false };
}

// מחזיר: { N, rowH, pages: [ [col, col, ...], ... ] }
export function planLayout(groups, requestedCols) {
    const items = flattenItems(groups);
    const rowFor = cap => Math.min(PAGE.maxRow, PAGE.bodyH / (cap + 1));
    let N, fit;

    if (requestedCols && requestedCols !== 'auto') {
        N = parseInt(requestedCols, 10);
        fit = fitColumns(items, N);
    } else {
        let firstFit = null;
        for (const n of [2, 3, 4, 5]) {
            const f = fitColumns(items, n);
            if (!f.single) continue;
            if (!firstFit) firstFit = { N: n, fit: f };
            if (rowFor(f.cap) >= PAGE.prefRow) { N = n; fit = f; break; }
        }
        if (!fit && firstFit) { N = firstFit.N; fit = firstFit.fit; }
        if (!fit) { N = 4; fit = fitColumns(items, 4); }
    }

    const pages = [];
    for (let i = 0; i < fit.cols.length; i += N) pages.push(fit.cols.slice(i, i + N));
    if (pages.length === 0) pages.push([]);
    return { N, rowH: Math.max(PAGE.minRow, rowFor(fit.cap)), pages };
}

// ---------- הקלאס הראשי ----------

export class ReportManager {
    constructor(container, apiBase) {
        this.container = container;
        this.apiBase = apiBase;
        this.allStudentsData = [];
        this.classes = new Set();
        this.logoUrl = 'https://smti.uk/img/peer.jpg';
        this._logoData = null;
        this._scripts = {};
        this.lastRenderedStudents = null;
        this.lastReportName = 'דוח_הישגים';

        this.injectStyles();
        this.injectModal();

        // מאזין יחיד לסגירת רשימת החיפוש (לא מצטבר בכל רינדור)
        document.addEventListener('click', (e) => {
            const input = document.getElementById('reportStudentSearch');
            const dd = document.getElementById('reportSearchResults');
            if (input && dd && !input.contains(e.target) && !dd.contains(e.target)) dd.classList.add('hidden');
        });
    }

    // ---------- נתונים ----------

    async fetchStudentSummaries() {
        try {
            const response = await fetch(`${this.apiBase}/student-summary`);
            if (response.ok) {
                this.allStudentsData = await response.json();
                this.classes = new Set(this.allStudentsData.map(s => s.class_grade).filter(Boolean).sort());
            } else {
                console.error('שגיאה בטעינת נתוני דוחות');
            }
        } catch (error) {
            console.error('שגיאת רשת בטעינת דוחות', error);
        }
        this.renderView();
    }

    setStudents() {
        this.fetchStudentSummaries();
    }

    // ---------- CSS (מסך + הדפסה) ----------

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
        .rp-title h1 { margin: 0; font-size: 6.4mm; font-weight: 800; line-height: 1.15; }
        .rp-date { margin-top: 1.2mm; font-size: 3.4mm; color: #334155; font-weight: 600; }
        .rp-date small { font-weight: 400; color: #64748b; font-size: 3mm; }
        .rp-student { text-align: left; flex: none; max-width: 70mm; }
        .rp-student .rp-name { font-size: 5.4mm; font-weight: 800; line-height: 1.15; }
        .rp-student .rp-meta { margin-top: 1.2mm; font-size: 3.4mm; color: #334155; }
        .rp-chip { display: inline-block; background: #e2e8f0; border-radius: 1mm; padding: .3mm 1.6mm; margin-right: 1.5mm; font-size: 3mm; }

        .rp-stats { height: 11mm; flex: none; display: flex; gap: 3mm; margin: 3mm 0; }
        .rp-stat { flex: 1; border: .3mm solid #cbd5e1; border-radius: 1.5mm; background: #f8fafc; display: flex; align-items: center; justify-content: center; gap: 1.8mm; font-size: 3.2mm; color: #334155; white-space: nowrap; }
        .rp-stat b { font-size: 4.8mm; font-weight: 800; color: #0f172a; }
        .rp-stat.ok b { color: #059669; } .rp-stat.bad b { color: #dc2626; } .rp-stat.money b { color: #0369a1; }

        .rp-body { flex: none; height: ${PAGE.bodyH}mm; display: flex; gap: 3mm; align-items: flex-start; }
        .rp-col { flex: 1; min-width: 0; border: .25mm solid #cbd5e1; border-bottom: none; }
        .rp-colhead, .rp-row { height: var(--rh); font-size: var(--fs); display: grid; grid-template-columns: 1fr 7mm 10mm; align-items: center; padding: 0 1.5mm; }
        .rp-colhead.no-rw, .rp-row.no-rw { grid-template-columns: 1fr 7mm; }
        .rp-colhead { background: #e2e8f0; font-weight: 700; border-bottom: .25mm solid #94a3b8; }
        .rp-colhead span:not(:first-child), .rp-row span:not(:first-child) { text-align: center; }
        .rp-mh { height: var(--rh); font-size: var(--fs); display: flex; align-items: center; justify-content: space-between; padding: 0 1.5mm; background: #1e293b; color: #fff; font-weight: 700; white-space: nowrap; overflow: hidden; }
        .rp-mh small { font-weight: 400; opacity: .8; }
        .rp-mh-stat { font-weight: 600; font-size: .9em; opacity: .95; }
        .rp-row { border-bottom: .2mm solid #e2e8f0; }
        .rp-row .c-code { font-weight: 700; white-space: nowrap; overflow: hidden; }
        .rp-row .c-mark { font-weight: 900; }
        .rp-row .c-rw { font-weight: 600; color: #334155; white-space: nowrap; }
        .rp-row.pass { background: #ecfdf5; } .rp-row.pass .c-mark { color: #059669; }
        .rp-row.fail { background: #fef2f2; } .rp-row.fail .c-mark { color: #dc2626; }
        .rp-row.none .c-code { font-weight: 500; color: #64748b; }
        .rp-empty { width: 100%; text-align: center; padding: 20mm 0; color: #64748b; font-size: 4mm; }

        .rp-foot { margin-top: auto; flex: none; height: 6mm; padding-top: 1.2mm; border-top: .2mm solid #e2e8f0; display: flex; justify-content: space-between; align-items: center; font-size: 2.7mm; color: #64748b; }

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

    // ---------- מודל התצוגה המקדימה ----------

    injectModal() {
        if (document.getElementById('printReportModal')) return;
        const modalHtml = `
        <div id="printReportModal" class="modal hidden no-print" style="z-index: 9999;">
            <div class="modal-content" style="max-width: 1000px; height: 95vh; background: #e2e8f0; border-radius: 12px; overflow: hidden;">
                <div class="modal-header no-print" style="background: white; padding: 15px 20px; box-shadow: 0 2px 10px rgba(0,0,0,0.05);">
                    <h3 style="margin: 0; font-size: 1.2rem; color: #0f172a;"><i class="fas fa-print" style="color: var(--primary-color);"></i> תצוגה מקדימה להדפסה</h3>
                    <div style="display:flex; gap:10px; align-items:center;">
                        <button class="btn btn-outline btn-sm" id="exportReportCsvBtn" title="ייצא טבלה לאקסל"><i class="fas fa-file-excel"></i> ייצוא אקסל</button>
                        <button class="btn btn-secondary btn-sm" id="directDownloadPdfBtn" title="הורד קובץ PDF"><i class="fas fa-file-pdf"></i> הורד PDF</button>
                        <button class="btn btn-primary btn-sm" id="printReportBtn" title="הדפסה, או שמירה כ-PDF איכותי"><i class="fas fa-print"></i> הדפס</button>
                        <button class="close-modal-btn" id="closeReportModalBtn" style="margin-right: 15px; font-size: 1.5rem;">&times;</button>
                    </div>
                </div>
                <div class="modal-body" id="printReportBodyWrapper" style="padding: 20px; overflow: auto; background: #cbd5e1; display: flex; flex-direction: column; align-items: center;">
                    <div id="printReportBody"></div>
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

    // ---------- מסך ההגדרות ----------

    renderView() {
        const html = `
            <div class="card compact-card no-print" style="margin-bottom: 20px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
                <div style="border-bottom: 1px solid var(--border-color); padding-bottom: 15px; margin-bottom: 20px;">
                    <h3 style="margin: 0; font-size: 1.15rem; color: #1e293b;"><i class="fas fa-sliders-h" style="color: var(--primary-color);"></i> הפקת דוחות הישגים</h3>
                </div>

                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 25px;">

                    <div style="background: #f8fafc; padding: 20px; border-radius: 8px; border: 1px solid #e2e8f0;">
                        <h4 style="margin-top: 0; margin-bottom: 15px; font-size: 1rem; color: #0f172a;"><i class="fas fa-cog"></i> הגדרות תצוגה במסמך</h4>
                        <div style="display: flex; flex-direction: column; gap: 12px;">
                            <label style="display: flex; align-items: center; gap: 8px; font-size: 0.9rem; cursor: pointer;">
                                <input type="checkbox" id="confShowReward" checked style="width: 16px; height: 16px;">
                                הצג עמודת מלגה (פירוט כספי)
                            </label>
                            <label style="display: flex; align-items: center; gap: 8px; font-size: 0.9rem; cursor: pointer;">
                                <input type="checkbox" id="confShowSummary" checked style="width: 16px; height: 16px;">
                                הצג סיכום בכותרת כל מסכת (עברו / סה"כ)
                            </label>
                            <label style="display: flex; align-items: center; gap: 8px; font-size: 0.9rem; cursor: pointer;">
                                <input type="checkbox" id="confShowStudentCode" checked style="width: 16px; height: 16px;">
                                הצג קוד תלמיד בפרטי התעודה
                            </label>
                            <label style="display: flex; align-items: center; gap: 8px; font-size: 0.9rem; cursor: pointer;">
                                <input type="checkbox" id="confHideUnattempted" style="width: 16px; height: 16px;">
                                <strong>הסתר מבחנים שלא בוצעו</strong> (דוח תמציתי)
                            </label>
                            <div style="margin-top: 5px;">
                                <label style="font-size: 0.9rem; display: block; margin-bottom: 5px; color: #334155;">מספר עמודות בעמוד:</label>
                                <select id="confColumns" style="width: 100%; padding: 8px; border-radius: 6px; border: 1px solid #cbd5e1; background: white; outline: none;">
                                    <option value="auto" selected>אוטומטי (מתאים את עצמו לכמות המבחנים)</option>
                                    <option value="2">2 עמודות</option>
                                    <option value="3">3 עמודות</option>
                                    <option value="4">4 עמודות</option>
                                </select>
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
                                    ${Array.from(this.classes).map(c => `<option value="${esc(c)}">כיתה ${esc(c)}</option>`).join('')}
                                </select>
                                <button class="btn btn-primary" id="generateClassReportBtn" style="padding: 0 20px;"><i class="fas fa-magic"></i> הפק דוחות</button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        this.container.innerHTML = html;
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
                            `דוח_${student.first_name}_${student.last_name}`.replace(/\s+/g, '_'));
                    });
                    resultsDropdown.appendChild(item);
                });
            }
            resultsDropdown.classList.remove('hidden');
        });

        document.getElementById('generateClassReportBtn').addEventListener('click', async () => {
            const cls = document.getElementById('reportClassSelect').value;
            if (!cls) return await window.customAlert('נא לבחור כיתה', true);
            this.generateAndShowReport(`?class_grade=${encodeURIComponent(cls)}`, `דוחות_כיתה_${cls}`.replace(/\s+/g, '_'));
        });
    }

    async generateAndShowReport(queryParams, reportName) {
        const btn = document.getElementById('generateClassReportBtn');
        const originalText = btn ? btn.innerHTML : '';
        if (btn) { btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> מעבד נתונים...'; btn.disabled = true; }

        try {
            const response = await fetch(`${this.apiBase}/student-summary${queryParams}`);
            if (response.ok) {
                const studentsToRender = await response.json();
                if (!studentsToRender || studentsToRender.length === 0) {
                    await window.customAlert('לא נמצאו נתונים לחיפוש זה.', true);
                } else {
                    this.lastRenderedStudents = studentsToRender;
                    this.lastReportName = reportName || 'דוחות_הישגים';
                    await this.buildReportHtml(studentsToRender);
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

    // ---------- בניית הדוח ----------

    // טוען את הלוגו כ-data URL (כדי שיופיע גם ב-PDF). אם נחסם ע"י CORS - משתמשים בכתובת הרגילה.
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

    readOptions() {
        const val = (id, def) => { const el = document.getElementById(id); return el ? el.checked : def; };
        const colsEl = document.getElementById('confColumns');
        return {
            showReward: val('confShowReward', true),
            showSummary: val('confShowSummary', true),
            showStudentCode: val('confShowStudentCode', true),
            hideUnattempted: val('confHideUnattempted', false),
            cols: colsEl ? colsEl.value : 'auto'
        };
    }

    async buildReportHtml(students) {
        const o = this.readOptions();
        const logo = await this.getLogo();
        const now = new Date();
        const dates = { heb: formatHebrewDate(now), greg: formatGregorian(now) };

        const html = students.map(s => this.renderStudentPages(s, o, logo, dates)).join('');
        document.getElementById('printReportBody').innerHTML = html;
        document.getElementById('printReportBodyWrapper').scrollTop = 0;
        document.getElementById('printReportModal').classList.remove('hidden');
    }

    renderStudentPages(student, o, logo, dates) {
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
        const plan = planLayout(groups, o.cols);
        const fs = Math.min(plan.rowH * 0.6, 3.4).toFixed(2);
        const totalPages = plan.pages.length;

        const studentClass = student.class_grade || 'כללי';
        const codeChip = o.showStudentCode ? `<span class="rp-chip">קוד ${esc(student.student_code)}</span>` : '';

        return plan.pages.map((cols, pageIdx) => {
            const colsHtml = [];
            for (let i = 0; i < plan.N; i++) colsHtml.push(this.renderColumn(cols[i] || [], o));

            const body = exams.length === 0
                ? '<div class="rp-empty">לא נמצאו מבחנים להצגה</div>'
                : colsHtml.join('');

            return `
            <div class="rp-page">
                <div class="rp-head">
                    ${logo ? `<img class="rp-logo" src="${esc(logo)}" alt="">` : ''}
                    <div class="rp-title">
                        <h1>דוח הישגים ומלגות</h1>
                        <div class="rp-date">${esc(dates.heb)} <small>(${esc(dates.greg)})</small></div>
                    </div>
                    <div class="rp-student">
                        <div class="rp-name">${esc(student.first_name)} ${esc(student.last_name)}</div>
                        <div class="rp-meta">כיתה ${esc(studentClass)}${codeChip}</div>
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
                    <span>✓ עבר &nbsp;·&nbsp; ✕ לא עבר &nbsp;·&nbsp; שורה ללא סימון – טרם נבחן</span>
                    <span>הופק ממערכת ניהול פאר המשנה${totalPages > 1 ? ` &nbsp;·&nbsp; עמוד ${pageIdx + 1} מתוך ${totalPages}` : ''}</span>
                </div>
            </div>`;
        }).join('');
    }

    renderColumn(col, o) {
        const rw = o.showReward;
        const head = `<div class="rp-colhead ${rw ? '' : 'no-rw'}"><span>קוד</span><span>הישג</span>${rw ? '<span>מלגה</span>' : ''}</div>`;

        const rows = col.map(it => {
            if (it.t === 'h') {
                const g = it.g;
                const passed = g.exams.filter(e => e.passed === true).length;
                const sum = g.exams.reduce((s, e) => s + (e.passed === true ? (Number(e.reward_earned) || 0) : 0), 0);
                const stat = o.showSummary
                    ? `<span class="rp-mh-stat">${passed}/${g.exams.length}${rw && sum > 0 ? ` · ₪${sum.toFixed(1)}` : ''}</span>`
                    : '';
                return `<div class="rp-mh"><span>${esc(g.label)}${it.cont ? ' <small>(המשך)</small>' : ''}</span>${stat}</div>`;
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
            return `<div class="rp-row ${cls} ${rw ? '' : 'no-rw'}"><span class="c-code">${esc(ex.exam_code)}</span><span class="c-mark">${mark}</span>${rw ? `<span class="c-rw">${rewardText}</span>` : ''}</div>`;
        }).join('');

        return `<div class="rp-col">${head}${rows}</div>`;
    }

    // ---------- הדפסה ----------

    printReport() {
        const oldTitle = document.title;
        document.title = this.lastReportName;   // שם הקובץ המוצע בשמירה כ-PDF
        const restore = () => { document.title = oldTitle; window.removeEventListener('afterprint', restore); };
        window.addEventListener('afterprint', restore);
        window.print();
    }

    // ---------- הורדת PDF (כל עמוד מצולם בנפרד -> בדיוק עמוד A4) ----------

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

                // משכפלים אל מיכל קבוע בפינה כדי שלא תהיה השפעה של גלילה / מודל
                const host = document.createElement('div');
                host.style.cssText = 'position:fixed;left:0;top:0;z-index:-1;pointer-events:none;background:#fff;';
                const clone = pages[i].cloneNode(true);
                clone.style.margin = '0';
                clone.style.boxShadow = 'none';
                host.appendChild(clone);
                document.body.appendChild(host);

                try {
                    const canvas = await window.html2canvas(clone, { scale: 2, useCORS: true, backgroundColor: '#ffffff', logging: false });
                    if (i > 0) pdf.addPage();
                    pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, 210, 297, undefined, 'FAST');
                } finally {
                    host.remove();
                }
            }
            pdf.save(`${this.lastReportName}_${new Date().toISOString().slice(0, 10)}.pdf`);
        } catch (err) {
            console.error(err);
            await window.customAlert("יצירת ה-PDF נכשלה. השתמש בכפתור 'הדפס' ובחר 'שמור כ-PDF'.", true);
        } finally {
            btn.innerHTML = origText;
            btn.disabled = false;
        }
    }

    // ---------- ייצוא CSV ----------

    exportToExcel(students) {
        const header = ['קוד תלמיד', 'שם פרטי', 'שם משפחה', 'כיתה', 'מסכת', 'קוד מבחן', 'פירוט', 'סטטוס', 'מלגה'];
        const lines = [header.map(csvCell).join(',')];

        students.forEach(student => {
            const base = [student.student_code, student.first_name, student.last_name, student.class_grade || ''];
            const exams = student.exams || [];
            if (exams.length === 0) {
                lines.push([...base, '', 'ללא מבחנים', '', '', ''].map(csvCell).join(','));
                return;
            }
            exams.forEach(ex => {
                const details = ex.details || {};
                const desc = Object.values(details).filter(v => v !== null && v !== '').join(' - ') || ex.exam_code;
                const status = ex.passed === true ? 'עבר' : (ex.passed === false ? 'לא עבר' : 'לא בוצע');
                const reward = ex.passed === true ? (Number(ex.reward_earned) || 0) : 0;
                lines.push([...base.map(csvCell), csvCell(details.masechet || ''), csvCell(ex.exam_code), csvCell(desc), csvCell(status), reward].join(','));
            });
        });

        const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.href = url;
        link.download = `${this.lastReportName}_${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
}
