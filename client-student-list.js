// ============================================================
//  client-student-list.js — ייצוא רשימת תלמידים לדף מעוצב (הדפסה / PDF)
//  מסודר לפי א״ב משפחות / שם פרטי / כיתות / קוד, לכל הכיתות או לכיתה אחת.
//  new StudentListExporter().open(students, statsFn, preset)
// ============================================================
import { formatHebrewDate } from './client-reports.js';

const H2C_URL   = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
const JSPDF_URL = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
const LOGO_URL  = 'https://smti.uk/img/peer.jpg';
const STORE_KEY = 'peer_stulist_v1';

const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const cmp = (a, b) => String(a ?? '').localeCompare(String(b ?? ''), 'he', { numeric: true, sensitivity: 'base' });
const money = v => '₪' + (Number(v) || 0).toFixed(1);
const $ = id => document.getElementById(id);

// סדר הדף
const MODES = {
    family: { label: 'לפי א״ב משפחות', icon: 'fa-people-roof', hint: 'אחים מאותה משפחה מקובצים יחד' },
    first:  { label: 'לפי א״ב שם פרטי', icon: 'fa-arrow-down-a-z', hint: 'רשימה רציפה לפי השם הפרטי' },
    class:  { label: 'לפי כיתות', icon: 'fa-layer-group', hint: 'כל כיתה בנפרד, עם כותרת משלה' },
    code:   { label: 'לפי קוד תלמיד', icon: 'fa-hashtag', hint: 'מהקוד הנמוך לגבוה' }
};
// סידור פנימי בתוך כל כיתה
const INNER = { last: 'שם משפחה', first: 'שם פרטי', code: 'קוד' };
// עמודות אפשריות
const COLS = {
    num:     { label: 'מספור', head: '#', w: '7mm' },
    code:    { label: 'קוד תלמיד', head: 'קוד', w: '13mm' },
    class:   { label: 'כיתה', head: 'כיתה', w: '13mm' },
    phone:   { label: 'טלפון', head: 'טלפון', w: '25mm' },
    tested:  { label: 'נבחן (מתוך)', head: 'נבחן', w: '15mm' },
    passed:  { label: 'עברו', head: 'עברו', w: '11mm' },
    reward:  { label: 'מלגה', head: 'מלגה', w: '16mm' },
    check:   { label: 'משבצת סימון', head: '✓', w: '9mm' },
    notes:   { label: 'עמודת הערות ריקה', head: 'הערות', w: '' }
};
const THEMES = {
    navy:   { label: 'כחול', a: '#1e3a8a', t: '#eef2ff', z: '#f8faff' },
    slate:  { label: 'שחור', a: '#0f172a', t: '#f1f5f9', z: '#f8fafc' },
    green:  { label: 'ירוק', a: '#065f46', t: '#ecfdf5', z: '#f6fdf9' },
    wine:   { label: 'בורדו', a: '#7f1d1d', t: '#fef2f2', z: '#fffafa' },
    gold:   { label: 'זהב', a: '#854d0e', t: '#fefce8', z: '#fffdf2' }
};
const SIZES = { s: { label: 'קטן', fs: 2.9, pad: .9 }, m: { label: 'רגיל', fs: 3.35, pad: 1.25 }, l: { label: 'גדול', fs: 3.9, pad: 1.6 } };

const DEFAULTS = {
    mode: 'family', inner: 'last', scope: '', status: '', cols: ['num', 'code', 'class', 'phone'],
    columns: 1, size: 'm', theme: 'navy', title: 'רשימת תלמידים', note: '',
    letters: true, pageBreak: false, showLogo: true, showDate: true, showSummary: true, zebra: true
};

export class StudentListExporter {
    constructor() {
        this.o = this.load();
        this._scripts = {};
        this._logo = null;
        this.css();
        this.mount();
        this.bind();
    }

    // ---------- הגדרות (נשמרות בדפדפן בלבד, לנוחות) ----------
    load() {
        try {
            const raw = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
            if (raw && typeof raw === 'object') {
                const o = { ...DEFAULTS, ...raw, scope: '', status: '' };
                if (!MODES[o.mode]) o.mode = DEFAULTS.mode;
                if (!INNER[o.inner]) o.inner = DEFAULTS.inner;
                if (!THEMES[o.theme]) o.theme = DEFAULTS.theme;
                if (!SIZES[o.size]) o.size = DEFAULTS.size;
                o.columns = o.columns === 2 ? 2 : 1;
                o.cols = Array.isArray(o.cols) ? o.cols.filter(c => COLS[c]) : DEFAULTS.cols.slice();
                return o;
            }
        } catch (e) { /* ignore */ }
        return { ...DEFAULTS, cols: DEFAULTS.cols.slice() };
    }
    save() {
        try { const { scope, status, ...rest } = this.o; localStorage.setItem(STORE_KEY, JSON.stringify(rest)); } catch (e) { /* ignore */ }
    }

    // ============================================================
    //  פתיחה
    // ============================================================
    async open(students, statsFn, preset = {}) {
        this.students = students || [];
        this.statsFn = statsFn || (() => ({ attempted: 0, available: null, passed: 0, reward: 0 }));
        this.classes = [...new Set(this.students.map(s => s.class_grade).filter(Boolean))].sort(cmp);
        if (preset.scope !== undefined) this.o.scope = this.classes.includes(preset.scope) ? preset.scope : '';
        if (preset.status !== undefined) this.o.status = preset.status || '';
        $('slModal').classList.remove('hidden');
        this.paintControls();
        this.getLogo().then(() => this.refresh());
        this.refresh();
    }
    close() { $('slModal').classList.add('hidden'); }

    // ============================================================
    //  נתונים
    // ============================================================
    filtered() {
        const { scope, status } = this.o;
        return this.students.filter(s => (!scope || s.class_grade === scope)
            && (!status || (status === 'none' ? this.statsFn(s).attempted === 0 : this.statsFn(s).attempted > 0)));
    }
    sorter(key) {
        const byLast = (a, b) => cmp(a.last_name, b.last_name) || cmp(a.first_name, b.first_name) || cmp(a.student_code, b.student_code);
        const byFirst = (a, b) => cmp(a.first_name, b.first_name) || cmp(a.last_name, b.last_name) || cmp(a.student_code, b.student_code);
        const byCode = (a, b) => { const x = Number(a.student_code), y = Number(b.student_code); return (!isNaN(x) && !isNaN(y) ? x - y : cmp(a.student_code, b.student_code)); };
        return { last: byLast, first: byFirst, code: byCode }[key] || byLast;
    }
    // האות הראשונה (לכותרות א, ב, ג...)
    letter(str) {
        const ch = String(str || '').trim().charAt(0);
        const fin = { 'ך': 'כ', 'ם': 'מ', 'ן': 'נ', 'ף': 'פ', 'ץ': 'צ' };
        if (/[א-ת]/.test(ch)) return fin[ch] || ch;
        if (/[a-z]/i.test(ch)) return ch.toUpperCase();
        return '#';
    }
    // משפחה = אותו שם משפחה + אותו טלפון ראשי (אם יש). כך שתי משפחות "כהן" שונות לא מתערבבות.
    families(list) {
        const map = new Map();
        list.forEach(s => {
            const ln = String(s.last_name || '').trim(), ph = String((s.phones || [])[0] || '').replace(/\D/g, '');
            const k = `${ln}|${ph}`;
            if (!map.has(k)) map.set(k, { name: ln || '—', phone: (s.phones || [])[0] || '', kids: [] });
            map.get(k).kids.push(s);
        });
        const fams = [...map.values()];
        fams.forEach(f => f.kids.sort((a, b) => cmp(a.class_grade, b.class_grade) || cmp(a.first_name, b.first_name)));
        return fams.sort((a, b) => cmp(a.name, b.name) || cmp(a.phone, b.phone));
    }

    // העמודות בפועל (כיתה מיותרת כשמסדרים לפי כיתות או כשמוצגת כיתה אחת)
    activeCols() {
        const o = this.o, hideClass = o.mode === 'class' || !!o.scope;
        const order = Object.keys(COLS);
        return order.filter(c => o.cols.includes(c) && !(c === 'class' && hideClass));
    }

    // ============================================================
    //  בניית "בלוקים" — כל בלוק הוא <tbody>; העימוד מחלק אותם לעמודים
    // ============================================================
    blocks() {
        const o = this.o, list = this.filtered(), cols = this.activeCols();
        const span = cols.length + (o.mode === 'family' ? 2 : 1);
        const out = [];
        let n = 0;
        const letterRow = (L, count) => ({ head: true, html: `<tbody class="sl-letter"><tr><td colspan="${span}"><div><span class="sl-lt">${esc(L)}</span><i></i>${count ? `<em>${count} ${count === 1 ? 'משפחה' : 'משפחות'}</em>` : ''}</div></td></tr></tbody>` });
        const cell = (c, s) => {
            const st = this.statsFn(s);
            switch (c) {
                case 'num': return `<td class="c-num">${++n}</td>`;
                case 'code': return `<td class="c-code">${esc(s.student_code)}</td>`;
                case 'class': return `<td class="c-cls">${esc(s.class_grade || '')}</td>`;
                case 'phone': return `<td class="c-ph">${esc((s.phones || []).slice(0, 2).join(' · '))}</td>`;
                case 'tested': return `<td class="c-st">${st.attempted}${st.available != null ? `<small>/${st.available}</small>` : ''}</td>`;
                case 'passed': return `<td class="c-ok">${st.passed}</td>`;
                case 'reward': return `<td class="c-rw">${money(st.reward)}</td>`;
                case 'check': return '<td class="c-chk"><span></span></td>';
                case 'notes': return '<td class="c-nt"></td>';
            }
            return '<td></td>';
        };
        const plainRow = (s, nameHtml) => `<tr>${cols.includes('num') ? cell('num', s) : ''}<td class="c-name">${nameHtml}</td>${cols.filter(c => c !== 'num').map(c => cell(c, s)).join('')}</tr>`;

        if (o.mode === 'family') {
            const fams = this.families(list);
            let curL = null;
            const counts = new Map();
            fams.forEach(f => { const L = this.letter(f.name); counts.set(L, (counts.get(L) || 0) + 1); });
            fams.forEach(f => {
                const L = this.letter(f.name);
                if (o.letters && L !== curL) { out.push(letterRow(L, counts.get(L))); curL = L; }
                const rows = f.kids.map((s, i) => {
                    const fam = i === 0 ? `<td class="c-fam" rowspan="${f.kids.length}"><b>${esc(f.name)}</b>${f.kids.length > 1 ? `<small>${f.kids.length} ילדים</small>` : ''}</td>` : '';
                    return `<tr class="${i === 0 ? 'first' : ''}">${cols.includes('num') ? cell('num', s) : ''}${fam}<td class="c-name">${esc(s.first_name)}</td>${cols.filter(c => c !== 'num').map(c => cell(c, s)).join('')}</tr>`;
                }).join('');
                out.push({ html: `<tbody class="sl-fam ${f.kids.length > 1 ? 'multi' : ''}">${rows}</tbody>` });
            });
        } else if (o.mode === 'first' || o.mode === 'code') {
            const sorted = list.slice().sort(this.sorter(o.mode === 'first' ? 'first' : 'code'));
            let curL = null;
            sorted.forEach(s => {
                if (o.mode === 'first' && o.letters) {
                    const L = this.letter(s.first_name);
                    if (L !== curL) { out.push(letterRow(L)); curL = L; }
                }
                const name = o.mode === 'first' ? `<b>${esc(s.first_name)}</b> ${esc(s.last_name)}` : `<b>${esc(s.last_name)}</b> ${esc(s.first_name)}`;
                out.push({ html: `<tbody class="sl-one">${plainRow(s, name)}</tbody>` });
            });
        } else {
            const byClass = new Map();
            list.slice().sort(this.sorter(o.inner)).forEach(s => { const k = s.class_grade || 'ללא כיתה'; if (!byClass.has(k)) byClass.set(k, []); byClass.get(k).push(s); });
            [...byClass.keys()].sort(cmp).forEach((k, idx) => {
                const kids = byClass.get(k);
                if (o.pageBreak && idx > 0) out.push({ brk: true });
                n = 0;    // מספור מחדש בכל כיתה
                out.push({ head: true, html: `<tbody class="sl-sec"><tr><td colspan="${span}"><b>כיתה ${esc(k)}</b><em>${kids.length} תלמידים</em></td></tr></tbody>` });
                kids.forEach(s => {
                    const name = o.inner === 'first' ? `<b>${esc(s.first_name)}</b> ${esc(s.last_name)}` : `<b>${esc(s.last_name)}</b> ${esc(s.first_name)}`;
                    out.push({ html: `<tbody class="sl-one">${plainRow(s, name)}</tbody>` });
                });
            });
        }
        return { out, cols, count: list.length };
    }

    theadHtml(cols) {
        const o = this.o, th = c => `<th class="h-${c}" ${COLS[c].w ? `style="width:${COLS[c].w}"` : ''}>${COLS[c].head}</th>`;
        const nameHead = o.mode === 'family' ? '<th class="h-fam">משפחה</th><th class="h-name">שם</th>'
            : `<th class="h-name">${o.mode === 'first' || (o.mode === 'class' && o.inner === 'first') ? 'שם התלמיד' : 'שם משפחה ושם פרטי'}</th>`;
        return `<thead><tr>${cols.includes('num') ? th('num') : ''}${nameHead}${cols.filter(c => c !== 'num').map(th).join('')}</tr></thead>`;
    }

    subtitle() {
        const o = this.o;
        const parts = [o.scope ? `כיתה ${o.scope}` : 'כל הכיתות', MODES[o.mode].label];
        if (o.mode === 'class') parts[1] += ` (בתוך הכיתה: ${INNER[o.inner]})`;
        if (o.status === 'taken') parts.push('נבחנו בלבד');
        if (o.status === 'none') parts.push('לא נבחנו כלל');
        return parts.join(' · ');
    }

    pageShell(cols) {
        const o = this.o, T = THEMES[o.theme], S = SIZES[o.size];
        const colHtml = Array.from({ length: o.columns }, () => `<div class="sl-col"><table class="sl-t ${o.zebra ? 'zebra' : ''}">${this.theadHtml(cols)}</table></div>`).join('');
        const logo = o.showLogo && this._logo ? `<img class="sl-logo" src="${esc(this._logo)}" alt="">` : '';
        const title = (o.title || '').trim() || DEFAULTS.title;
        return `<div class="sl-page" style="--a:${T.a};--t:${T.t};--z:${T.z};--fs:${S.fs}mm;--pd:${S.pad}mm">
            <header class="sl-head">${logo}
                <div class="sl-ttl"><h1>${esc(title)}</h1><div class="sl-sub">${esc(this.subtitle())}</div>${o.showDate ? `<div class="sl-date">${esc(this._heb)}</div>` : ''}</div>
                ${o.showSummary ? `<div class="sl-sum">${this._sumHtml}</div>` : ''}
            </header>
            ${(o.note || '').trim() ? `<div class="sl-note">${esc(o.note.trim())}</div>` : ''}
            <div class="sl-cols ${o.columns === 2 ? 'two' : ''}">${colHtml}</div>
            <footer class="sl-foot"><span>הופק ממערכת ניהול פאר המשנה</span><span class="sl-pg"></span></footer>
        </div>`;
    }

    // ============================================================
    //  עימוד: ממלאים עמודות ועמודים לפי מדידה אמיתית בגודל A4
    // ============================================================
    paginate() {
        const { out, cols, count } = this.blocks();
        const list = this.filtered();
        const fams = this.o.mode === 'family' ? this.families(list).length : 0;
        const classesN = new Set(list.map(s => s.class_grade || '')).size;
        this._heb = formatHebrewDate(new Date());
        this._sumHtml = `<div><b>${count}</b><span>תלמידים</span></div>${this.o.mode === 'family' ? `<div><b>${fams}</b><span>משפחות</span></div>` : ''}${!this.o.scope ? `<div><b>${classesN}</b><span>כיתות</span></div>` : ''}`;

        const stage = $('slStage');
        stage.innerHTML = '';
        const pages = [];
        let page, colEls, ci;
        const newPage = () => {
            stage.insertAdjacentHTML('beforeend', this.pageShell(cols));
            page = stage.lastElementChild; pages.push(page);
            colEls = [...page.querySelectorAll('.sl-col')]; ci = 0;
        };
        const tbl = () => colEls[ci].querySelector('table');
        const fits = () => tbl().offsetHeight <= colEls[ci].clientHeight + 0.5;
        const empty = () => tbl().tBodies.length === 0;
        const nextCol = () => { if (ci < colEls.length - 1) ci++; else newPage(); };

        // יחידות: כותרת (אות / כיתה) נצמדת לבלוק שאחריה, כדי שלא תישאר יתומה בתחתית
        const units = [];
        for (let i = 0; i < out.length; i++) {
            const b = out[i];
            if (b.brk) { units.push({ brk: true }); continue; }
            if (b.head && out[i + 1] && !out[i + 1].head && !out[i + 1].brk) { units.push({ html: b.html + out[i + 1].html }); i++; }
            else units.push({ html: b.html });
        }

        newPage();
        if (!units.length) {
            tbl().insertAdjacentHTML('beforeend', `<tbody class="sl-none"><tr><td colspan="20">לא נמצאו תלמידים להצגה</td></tr></tbody>`);
        }
        for (const u of units) {
            if (u.brk) { if (!(ci === 0 && empty())) newPage(); continue; }
            for (let tries = 0; tries < 3; tries++) {
                const before = tbl().tBodies.length;
                tbl().insertAdjacentHTML('beforeend', u.html);
                if (fits() || before === 0) break;      // בעמודה ריקה הבלוק נשאר גם אם הוא גבוה מדי (מונע לולאה)
                while (tbl().tBodies.length > before) tbl().tBodies[before].remove();
                nextCol();
            }
        }
        // מספרי עמודים
        pages.forEach((p, i) => { p.querySelector('.sl-pg').textContent = pages.length > 1 ? `עמוד ${i + 1} מתוך ${pages.length}` : ''; });
        // עמודה שנייה ריקה בעמוד האחרון — מסתירים את הכותרת שלה
        pages.forEach(p => p.querySelectorAll('.sl-col').forEach(c => { if (!c.querySelector('tbody')) c.classList.add('empty'); }));
        return pages.length;
    }

    refresh() {
        clearTimeout(this._rt);
        this._rt = setTimeout(() => {
            if ($('slModal').classList.contains('hidden')) return;
            $('slStage').style.zoom = '';           // מדידה בגודל אמיתי
            const n = this.paginate();
            const cnt = this.filtered().length;
            $('slInfo').textContent = `${cnt} תלמידים · ${n} ${n === 1 ? 'עמוד' : 'עמודים'}`;
            this.fit();
        }, 30);
    }

    // התאמת התצוגה המקדימה לרוחב החלון (זום בלבד, לא משנה את הדף עצמו)
    fit() {
        const wrap = $('slPrev'), stage = $('slStage');
        if (!wrap || !stage) return;
        stage.style.zoom = '';
        const pageW = stage.firstElementChild ? stage.firstElementChild.offsetWidth : 794;
        const avail = wrap.clientWidth - 32;
        const z = Math.min(1, avail / pageW);
        stage.style.zoom = z < 1 ? z.toFixed(3) : '';
    }

    // ============================================================
    //  פאנל האפשרויות
    // ============================================================
    paintControls() {
        const o = this.o;
        const radio = (name, map, cur, cls = '') => Object.entries(map).map(([k, v]) => `<button type="button" class="${cls} ${cur === k ? 'on' : ''}" data-set="${name}" data-v="${k}">${typeof v === 'string' ? v : v.label}</button>`).join('');
        const sw = (key, label) => `<label class="sl-sw"><input type="checkbox" data-chk="${key}" ${o[key] ? 'checked' : ''}><i></i><span>${label}</span></label>`;
        $('slCtl').innerHTML = `
            <section><h4><i class="fas fa-filter"></i> מי ברשימה</h4>
                <label class="sl-lbl">כיתה</label>
                <select id="slScope" class="sl-in"><option value="">כל הכיתות (${this.students.length})</option>
                    ${this.classes.map(c => `<option value="${esc(c)}" ${o.scope === c ? 'selected' : ''}>כיתה ${esc(c)} (${this.students.filter(s => s.class_grade === c).length})</option>`).join('')}</select>
                <label class="sl-lbl">מצב מבחנים</label>
                <div class="sl-seg">${radio('status', { '': 'כולם', taken: 'נבחנו', none: 'לא נבחנו כלל' }, o.status)}</div>
            </section>
            <section><h4><i class="fas fa-sort-alpha-down"></i> סדר הרשימה</h4>
                <div class="sl-modes">${Object.entries(MODES).map(([k, m]) => `<button type="button" class="sl-mode ${o.mode === k ? 'on' : ''}" data-set="mode" data-v="${k}"><i class="fas ${m.icon}"></i><b>${m.label}</b><small>${m.hint}</small></button>`).join('')}</div>
                <div class="${o.mode === 'class' ? '' : 'hidden'}"><label class="sl-lbl">סידור בתוך כל כיתה</label><div class="sl-seg">${radio('inner', INNER, o.inner)}</div>
                    ${sw('pageBreak', 'כל כיתה מתחילה בעמוד חדש')}</div>
                <div class="${o.mode === 'family' || o.mode === 'first' ? '' : 'hidden'}">${sw('letters', 'כותרות אותיות (א, ב, ג...)')}</div>
            </section>
            <section><h4><i class="fas fa-table-columns"></i> עמודות</h4>
                <div class="sl-chips">${Object.entries(COLS).map(([k, c]) => `<label class="sl-chip ${o.cols.includes(k) ? 'on' : ''}"><input type="checkbox" data-col="${k}" ${o.cols.includes(k) ? 'checked' : ''}>${c.label}</label>`).join('')}</div>
                ${o.mode === 'class' || o.scope ? '<div class="sl-hint">עמודת הכיתה מוסתרת אוטומטית כשהרשימה מחולקת לפי כיתות או מציגה כיתה אחת.</div>' : ''}
            </section>
            <section><h4><i class="fas fa-palette"></i> עיצוב</h4>
                <label class="sl-lbl">כותרת</label><input id="slTitle" class="sl-in" value="${esc(o.title)}" maxlength="60">
                <label class="sl-lbl">הערה בראש הדף (רשות)</label><input id="slNote" class="sl-in" value="${esc(o.note)}" maxlength="140" placeholder="לדוגמה: נא לעדכן את המזכירות בכל שינוי">
                <div class="sl-2"><div><label class="sl-lbl">טורים בדף</label><div class="sl-seg">${radio('columns', { 1: 'טור אחד', 2: 'שני טורים' }, String(o.columns))}</div></div>
                    <div><label class="sl-lbl">גודל כתב</label><div class="sl-seg">${radio('size', SIZES, o.size)}</div></div></div>
                <label class="sl-lbl">צבע</label>
                <div class="sl-themes">${Object.entries(THEMES).map(([k, t]) => `<button type="button" class="${o.theme === k ? 'on' : ''}" data-set="theme" data-v="${k}" title="${t.label}"><i style="background:${t.a}"></i>${t.label}</button>`).join('')}</div>
                ${sw('zebra', 'שורות בגוון מתחלף')}${sw('showLogo', 'לוגו')}${sw('showDate', 'תאריך עברי')}${sw('showSummary', 'סיכום בראש הדף')}
                <button type="button" class="sl-reset" id="slReset"><i class="fas fa-rotate-left"></i> חזרה לברירת המחדל</button>
            </section>`;
    }

    // ============================================================
    //  הדפסה / PDF
    // ============================================================
    fileName() {
        const o = this.o;
        const parts = [(o.title || DEFAULTS.title).trim(), o.scope ? `כיתה ${o.scope}` : '', MODES[o.mode].label.replace('לפי ', '')];
        return parts.filter(Boolean).join('_').replace(/[\\/:*?"<>|׳״']/g, '').replace(/\s+/g, '_');
    }

    print() {
        const old = document.title;
        document.title = this.fileName();
        document.body.classList.add('sl-printing');
        $('slStage').style.zoom = '';
        const restore = () => { document.title = old; document.body.classList.remove('sl-printing'); this.fit(); window.removeEventListener('afterprint', restore); };
        window.addEventListener('afterprint', restore);
        window.print();
    }

    loadScript(url, ready) {
        if (ready()) return Promise.resolve();
        if (this._scripts[url]) return this._scripts[url];
        this._scripts[url] = new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = url; s.onload = resolve;
            s.onerror = () => { delete this._scripts[url]; reject(new Error('load failed: ' + url)); };
            document.head.appendChild(s);
        });
        return this._scripts[url];
    }

    async pdf() {
        const btn = $('slPdf'), label = btn.innerHTML;
        btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> מכין קובץ...';
        try {
            await this.loadScript(H2C_URL, () => typeof window.html2canvas === 'function');
            await this.loadScript(JSPDF_URL, () => window.jspdf && window.jspdf.jsPDF);
        } catch (e) {
            btn.disabled = false; btn.innerHTML = label;
            return window.customAlert("שגיאה בטעינת כלי ה-PDF (ייתכן שיש חסימת רשת). השתמש בכפתור 'הדפס' ובחר 'שמור כ-PDF'.", true);
        }
        try {
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
            const pages = [...document.querySelectorAll('#slStage .sl-page')];
            for (let i = 0; i < pages.length; i++) {
                btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> עמוד ${i + 1} מתוך ${pages.length}`;
                if (i > 0) doc.addPage();
                const host = document.createElement('div');
                host.style.cssText = 'position:fixed;left:0;top:0;z-index:-1;pointer-events:none;background:#fff;';
                const clone = pages[i].cloneNode(true);
                clone.style.margin = '0'; clone.style.boxShadow = 'none';
                host.appendChild(clone); document.body.appendChild(host);
                try {
                    const canvas = await window.html2canvas(clone, { scale: 2, useCORS: true, backgroundColor: '#ffffff', logging: false });
                    doc.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, 210, 297, undefined, 'FAST');
                } finally { host.remove(); }
            }
            doc.save(`${this.fileName()}.pdf`);
        } catch (e) {
            console.error(e);
            window.customAlert("יצירת ה-PDF נכשלה. השתמש בכפתור 'הדפס' ובחר 'שמור כ-PDF'.", true);
        } finally { btn.disabled = false; btn.innerHTML = label; }
    }

    // הלוגו כ-data URL כדי שיופיע גם ב-PDF
    async getLogo() {
        if (this._logo) return this._logo;
        try {
            const blob = await (await fetch(LOGO_URL)).blob();
            this._logo = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(blob); });
        } catch (e) { this._logo = LOGO_URL; }
        return this._logo;
    }

    // ============================================================
    //  אירועים
    // ============================================================
    bind() {
        const ctl = $('slCtl');
        const change = (repaint) => { this.save(); if (repaint) this.paintControls(); this.refresh(); };
        ctl.addEventListener('click', e => {
            const b = e.target.closest('[data-set]');
            if (b) { const k = b.dataset.set; this.o[k] = k === 'columns' ? Number(b.dataset.v) : b.dataset.v; return change(true); }
            if (e.target.closest('#slReset')) { const { scope, status } = this.o; this.o = { ...DEFAULTS, cols: DEFAULTS.cols.slice(), scope, status }; change(true); }
        });
        ctl.addEventListener('change', e => {
            const t = e.target;
            if (t.id === 'slScope') { this.o.scope = t.value; return change(true); }
            if (t.dataset.chk) { this.o[t.dataset.chk] = t.checked; return change(false); }
            if (t.dataset.col) {
                const set = new Set(this.o.cols);
                t.checked ? set.add(t.dataset.col) : set.delete(t.dataset.col);
                this.o.cols = Object.keys(COLS).filter(c => set.has(c));
                t.closest('.sl-chip').classList.toggle('on', t.checked);
                return change(false);
            }
        });
        ctl.addEventListener('input', e => {
            if (e.target.id === 'slTitle') { this.o.title = e.target.value; change(false); }
            if (e.target.id === 'slNote') { this.o.note = e.target.value; change(false); }
        });
        $('slClose').addEventListener('click', () => this.close());
        $('slPrint').addEventListener('click', () => this.print());
        $('slPdf').addEventListener('click', () => this.pdf());
        $('slToggle').addEventListener('click', () => $('slModal').classList.toggle('sl-ctl-open'));
        document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('slModal').classList.contains('hidden')) this.close(); });
        window.addEventListener('resize', () => { if (!$('slModal').classList.contains('hidden')) this.fit(); });
    }

    mount() {
        if ($('slModal')) return;
        document.body.insertAdjacentHTML('beforeend', `
        <div id="slModal" class="modal hidden" style="z-index:9995">
            <div class="modal-content sl-mc">
                <div class="sl-bar no-print">
                    <div class="sl-bt"><h3><i class="fas fa-address-book"></i> ייצוא רשימת תלמידים</h3><span id="slInfo"></span></div>
                    <div class="sl-acts">
                        <button class="btn btn-outline btn-sm sl-tg" id="slToggle"><i class="fas fa-sliders"></i> אפשרויות</button>
                        <button class="btn btn-secondary btn-sm" id="slPdf"><i class="fas fa-file-pdf"></i> הורד PDF</button>
                        <button class="btn btn-primary btn-sm" id="slPrint"><i class="fas fa-print"></i> הדפס</button>
                        <button class="close-modal-btn" id="slClose" aria-label="סגור">&times;</button>
                    </div>
                </div>
                <div class="sl-body">
                    <aside class="sl-ctl no-print" id="slCtl"></aside>
                    <div class="sl-prev" id="slPrev"><div class="sl-stage" id="slStage"></div></div>
                </div>
            </div>
        </div>`);
    }

    css() {
        if ($('slStyles')) return;
        const st = document.createElement('style');
        st.id = 'slStyles';
        st.textContent = `
        /* ---------- חלון הייצוא ---------- */
        .sl-mc{max-width:1240px;width:96%;height:94vh;border-radius:14px;overflow:hidden;background:#fff}
        .sl-bar{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;padding:12px 18px;border-bottom:1px solid var(--border-color);background:#fff}
        .sl-bt{display:flex;align-items:baseline;gap:12px;flex-wrap:wrap}.sl-bt h3{margin:0;font-size:1.1rem;display:flex;gap:8px;align-items:center}.sl-bt h3 i{color:var(--primary-color)}
        #slInfo{font-size:.8rem;color:var(--text-muted)}
        .sl-acts{display:flex;gap:8px;align-items:center}.sl-acts .close-modal-btn{margin-right:8px;font-size:1.5rem}.sl-tg{display:none}
        .sl-body{flex:1;min-height:0;display:flex}
        .sl-ctl{width:340px;flex:none;overflow:auto;border-left:1px solid var(--border-color);background:#f8fafc;padding:12px;display:flex;flex-direction:column;gap:10px}
        .sl-ctl section{background:#fff;border:1px solid var(--border-color);border-radius:10px;padding:12px;display:flex;flex-direction:column;gap:7px}
        .sl-ctl h4{margin:0 0 2px;font-size:.88rem;color:#0f172a;display:flex;gap:7px;align-items:center}.sl-ctl h4 i{color:var(--primary-color);width:16px;text-align:center}
        .sl-lbl{font-size:.76rem;font-weight:600;color:#475569;margin-top:2px}
        .sl-in{width:100%;padding:7px 9px;border:1px solid var(--border-color);border-radius:8px;background:#f8fafc;outline:none;font-family:inherit;font-size:.86rem}.sl-in:focus{border-color:var(--primary-color);background:#fff}
        .sl-seg{display:flex;border:1px solid var(--border-color);border-radius:8px;overflow:hidden;background:#fff}
        .sl-seg button{flex:1;border:none;background:none;padding:6px 6px;font-size:.78rem;font-weight:600;color:#475569;cursor:pointer;white-space:nowrap}
        .sl-seg button+button{border-right:1px solid var(--border-color)}.sl-seg button.on{background:var(--primary-color);color:#fff}
        .sl-modes{display:grid;grid-template-columns:1fr 1fr;gap:6px}
        .sl-mode{display:grid;grid-template-columns:auto 1fr;grid-template-rows:auto auto;column-gap:7px;align-items:center;text-align:right;border:1px solid var(--border-color);background:#fff;border-radius:9px;padding:7px 9px;cursor:pointer;font-family:inherit}
        .sl-mode i{grid-row:1/3;color:#64748b;font-size:1rem}.sl-mode b{font-size:.8rem;color:#0f172a}.sl-mode small{font-size:.68rem;color:#64748b;line-height:1.25}
        .sl-mode:hover{border-color:#93c5fd;background:#f8fbff}.sl-mode.on{border-color:var(--primary-color);background:#eff6ff;box-shadow:0 0 0 2px rgba(37,99,235,.15)}.sl-mode.on i,.sl-mode.on b{color:var(--primary-color)}
        .sl-chips{display:flex;flex-wrap:wrap;gap:5px}
        .sl-chip{display:inline-flex;align-items:center;border:1px solid var(--border-color);border-radius:99px;padding:3px 11px;font-size:.77rem;cursor:pointer;background:#fff;user-select:none;color:#475569}
        .sl-chip input{display:none}.sl-chip.on{background:var(--primary-color);border-color:var(--primary-color);color:#fff}
        .sl-hint{font-size:.72rem;color:#64748b;line-height:1.4}
        .sl-2{display:grid;grid-template-columns:1fr 1fr;gap:8px}
        .sl-themes{display:flex;flex-wrap:wrap;gap:5px}
        .sl-themes button{display:inline-flex;align-items:center;gap:5px;border:1px solid var(--border-color);background:#fff;border-radius:99px;padding:3px 10px 3px 8px;font-size:.76rem;cursor:pointer;font-family:inherit}
        .sl-themes button i{width:12px;height:12px;border-radius:50%;display:inline-block}.sl-themes button.on{border-color:#0f172a;box-shadow:0 0 0 2px rgba(15,23,42,.12);font-weight:700}
        .sl-sw{display:flex;align-items:center;gap:9px;font-size:.83rem;color:#1e293b;cursor:pointer;margin-top:2px}
        .sl-sw input{position:absolute;opacity:0;pointer-events:none}
        .sl-sw i{position:relative;width:34px;height:19px;border-radius:99px;background:#cbd5e1;flex:none;transition:.2s}
        .sl-sw i::after{content:'';position:absolute;top:2px;right:2px;width:15px;height:15px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.25);transition:.2s}
        .sl-sw input:checked+i{background:var(--primary-color)}.sl-sw input:checked+i::after{right:17px}
        .sl-reset{align-self:flex-start;margin-top:4px;border:none;background:none;color:var(--primary-color);font-size:.76rem;font-weight:600;cursor:pointer;padding:0}.sl-reset:hover{text-decoration:underline}
        .sl-prev{flex:1;min-width:0;overflow:auto;background:#cbd5e1;padding:16px}
        .sl-stage{width:fit-content;margin:0 auto}
        @media(max-width:900px){
            .sl-tg{display:inline-flex}.sl-body{position:relative}
            .sl-ctl{position:absolute;inset:0 0 0 auto;width:min(340px,92%);z-index:3;transform:translateX(105%);transition:transform .2s;box-shadow:-8px 0 24px rgba(15,23,42,.18)}
            #slModal.sl-ctl-open .sl-ctl{transform:none}
            .sl-bar{padding:10px 12px}.sl-prev{padding:10px}
        }

        /* ---------- הדף המודפס ---------- */
        .sl-page{width:210mm;height:296mm;padding:10mm 11mm 8mm;box-sizing:border-box;background:#fff;color:#0f172a;direction:rtl;display:flex;flex-direction:column;overflow:hidden;
            margin:0 auto 12px;box-shadow:0 4px 14px rgba(15,23,42,.2);font-family:'Segoe UI','Noto Sans Hebrew',Arial,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}
        .sl-page *{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
        .sl-head{flex:none;display:flex;align-items:center;gap:5mm;padding-bottom:3mm;border-bottom:.8mm solid var(--a);position:relative}
        .sl-head::after{content:'';position:absolute;left:0;right:0;bottom:-1.8mm;border-bottom:.25mm solid var(--a);opacity:.45}
        .sl-logo{height:19mm;width:auto;max-width:30mm;object-fit:contain;flex:none}
        .sl-ttl{flex:1;min-width:0}.sl-ttl h1{margin:0;font-size:7.2mm;font-weight:800;color:var(--a);line-height:1.15;letter-spacing:-.1mm}
        .sl-sub{margin-top:1.2mm;font-size:3.6mm;font-weight:700;color:#334155}.sl-date{margin-top:1mm;font-size:3.2mm;color:#64748b;font-weight:600}
        .sl-sum{flex:none;display:flex;gap:2mm}
        .sl-sum div{min-width:16mm;border:.3mm solid var(--a);border-radius:2mm;padding:1.4mm 2.4mm;text-align:center;background:var(--t)}
        .sl-sum b{display:block;font-size:5.4mm;font-weight:800;color:var(--a);line-height:1.1}.sl-sum span{font-size:2.6mm;color:#475569;font-weight:600}
        .sl-note{flex:none;margin-top:4mm;padding:1.8mm 3mm;border-right:1.2mm solid var(--a);background:var(--t);border-radius:1.2mm;font-size:3.2mm;font-weight:700;color:#1e293b}
        .sl-cols{flex:1;min-height:0;display:flex;gap:5mm;margin-top:4.5mm;overflow:hidden}
        .sl-col{flex:1;min-width:0;height:100%;overflow:hidden}.sl-col.empty{visibility:hidden}
        .sl-t{width:100%;border-collapse:collapse;font-size:var(--fs);table-layout:auto}
        .sl-t th{background:var(--a);color:#fff;font-weight:700;font-size:.86em;padding:calc(var(--pd) + .4mm) 1.6mm;text-align:right;white-space:nowrap;border-left:.2mm solid rgba(255,255,255,.25)}
        .sl-t th:last-child{border-left:none}.sl-t thead tr th:first-child{border-radius:0 1.4mm 0 0}.sl-t thead tr th:last-child{border-radius:1.4mm 0 0 0}
        .sl-t td{padding:var(--pd) 1.6mm;border-bottom:.2mm solid #e2e8f0;vertical-align:middle;line-height:1.25}
        .sl-t.zebra tbody.sl-one:nth-of-type(even) td{background:var(--z)}
        .sl-t .c-num{color:#94a3b8;font-size:.82em;text-align:center;width:7mm}
        .sl-t .c-name{font-size:1.04em}.sl-t .c-name b{font-weight:800}
        .sl-t .c-code{font-weight:700;color:#334155;white-space:nowrap}.sl-t .c-cls{white-space:nowrap;font-weight:600;color:#334155}
        .sl-t .c-ph{direction:ltr;text-align:right;white-space:nowrap;color:#334155;font-size:.93em}
        .sl-t .c-st{white-space:nowrap}.sl-t .c-st small{color:#94a3b8;font-size:.8em}.sl-t .c-ok{color:#047857;font-weight:700}.sl-t .c-rw{color:#0369a1;font-weight:700;white-space:nowrap}
        .sl-t .c-chk span{display:block;width:3.6mm;height:3.6mm;border:.3mm solid #64748b;border-radius:.6mm;margin:0 auto}
        .sl-t .c-nt{min-width:22mm;border-bottom:.25mm dotted #94a3b8}
        .sl-t th.h-num,.sl-t th.h-check{text-align:center}
        /* משפחות */
        .sl-t tbody.sl-fam td{border-bottom:.2mm solid #eef2f7}
        .sl-t tbody.sl-fam tr:last-child td{border-bottom:.3mm solid #cbd5e1}
        .sl-t .c-fam{background:var(--t);border-left:.6mm solid var(--a);font-size:1.08em;white-space:nowrap;vertical-align:middle;width:1%}
        .sl-t .c-fam b{font-weight:800;color:var(--a)}.sl-t .c-fam small{display:block;font-size:.72em;color:#64748b;font-weight:600;margin-top:.3mm}
        .sl-t.zebra tbody.sl-fam:nth-of-type(even) td:not(.c-fam){background:var(--z)}
        /* כותרת אות */
        .sl-t tbody.sl-letter td{padding:2mm 0 .8mm;border:none;background:#fff !important}
        .sl-letter div{display:flex;align-items:center;gap:2mm}
        .sl-lt{flex:none;display:inline-flex;align-items:center;justify-content:center;width:6.4mm;height:6.4mm;border-radius:50%;background:var(--a);color:#fff;font-weight:800;font-size:4mm;line-height:1;
            font-family:'Frank Ruehl CLM','David CLM','David Libre',David,'Times New Roman',serif}
        .sl-letter i{flex:1;height:.3mm;background:linear-gradient(to left,var(--a),transparent);opacity:.5}
        .sl-letter em{flex:none;font-style:normal;font-size:2.6mm;color:#64748b;font-weight:600}
        /* כותרת כיתה */
        .sl-t tbody.sl-sec td{padding:2.2mm 2.4mm;background:var(--t) !important;border-top:3mm solid #fff;border-bottom:.5mm solid var(--a);font-size:1.08em}
        .sl-t tbody.sl-sec b{color:var(--a);font-weight:800;font-size:1.15em}.sl-t tbody.sl-sec em{font-style:normal;color:#475569;font-size:.85em;margin-right:3mm;font-weight:600}
        .sl-t tbody.sl-none td{text-align:center;padding:20mm 0;color:#64748b;font-size:4mm;border:none}
        .sl-foot{flex:none;margin-top:3mm;padding-top:1.6mm;border-top:.25mm solid #e2e8f0;display:flex;justify-content:space-between;font-size:2.7mm;color:#64748b}

        @media print{
            @page{size:A4 portrait;margin:0}
            body.sl-printing > *:not(#slModal){display:none !important}
            body.sl-printing #printReportModal{display:none !important}
            body.sl-printing #slModal{position:static !important;display:block !important;width:auto !important;height:auto !important;overflow:visible !important;background:#fff !important}
            body.sl-printing #slModal .sl-mc,body.sl-printing #slModal .sl-body,body.sl-printing #slModal .sl-prev,body.sl-printing #slModal .sl-stage{position:static !important;display:block !important;width:auto !important;max-width:none !important;height:auto !important;max-height:none !important;overflow:visible !important;box-shadow:none !important;border:none !important;border-radius:0 !important;background:#fff !important;padding:0 !important;margin:0 !important;zoom:1 !important}
            body.sl-printing .sl-page{margin:0 !important;box-shadow:none !important;break-after:page;page-break-after:always}
            body.sl-printing .sl-page:last-child{break-after:auto;page-break-after:auto}
        }`;
        document.head.appendChild(st);
    }
}
