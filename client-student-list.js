// ============================================================
//  client-student-list.js — רשימת תלמידים להדפסה / PDF (שם + קוד, צפופה)
//  ההגדרות נשמרות בשרת (report-settings?profile=student_list), משותפות לכל המשתמשים.
//  new StudentListExporter(apiBase).open(students, preset)
// ============================================================
import { formatHebrewDate } from './client-reports.js';

const H2C_URL   = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
const JSPDF_URL = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
const LOGO_URL  = 'https://smti.uk/img/peer.jpg';
const CACHE_KEY = 'peer_stulist_v2';

const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const cmp = (a, b) => String(a ?? '').localeCompare(String(b ?? ''), 'he', { numeric: true, sensitivity: 'base' });
const $ = id => document.getElementById(id);

const SORTS = { last: 'שם משפחה', first: 'שם פרטי', class: 'כיתות', code: 'קוד', amount: 'סכום (מהגבוה)' };
const KINDS = { codes: 'שמות וקודים', amounts: 'סכומים להטענה' };
const TITLES = { codes: 'רשימת תלמידים וקודים', amounts: 'סכומים להטענה' };
const money = v => '₪' + (Number(v) || 0).toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const INNER = { last: 'שם משפחה', first: 'שם פרטי', code: 'קוד' };
const SIZES = { s: { label: 'קטן', fs: 2.8, pad: .55 }, m: { label: 'רגיל', fs: 3.2, pad: .75 }, l: { label: 'גדול', fs: 3.7, pad: 1 } };

const DEFAULTS = { kind: 'codes', sort: 'last', inner: 'last', columns: 3, size: 'm', num: false, cls: true, pageBreak: false, title: 'רשימת תלמידים וקודים',
    code: true, mish: true, gem: true, amt: true };   // code/mish/gem/amt: עמודות בסוג 'סכומים להטענה'

function clean(raw) {
    const o = { ...DEFAULTS, ...(raw && typeof raw === 'object' ? raw : {}) };
    if (!KINDS[o.kind]) o.kind = DEFAULTS.kind;
    if (!SORTS[o.sort] || (o.sort === 'amount' && o.kind !== 'amounts')) o.sort = DEFAULTS.sort;
    if (!INNER[o.inner]) o.inner = DEFAULTS.inner;
    if (!SIZES[o.size]) o.size = DEFAULTS.size;
    o.columns = [1, 2, 3].includes(Number(o.columns)) ? Number(o.columns) : DEFAULTS.columns;
    ['num', 'cls', 'pageBreak', 'code', 'mish', 'gem', 'amt'].forEach(k => { o[k] = !!o[k]; });
    o.title = String(o.title ?? '').slice(0, 60);
    return o;
}

export class StudentListExporter {
    constructor(apiBase) {
        this.apiBase = apiBase;
        this.o = clean(this.cache());
        this.scope = '';
        this._scripts = {};
        this._logo = null;
        this.css();
        this.mount();
        this.bind();
    }

    // ---------- הגדרות: מטמון מקומי לפתיחה מיידית, השרת הוא מקור האמת ----------
    cache(v) {
        try {
            if (v === undefined) return JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
            localStorage.setItem(CACHE_KEY, JSON.stringify(v));
        } catch (e) { /* ignore */ }
        return null;
    }
    async loadServer() {
        try {
            const r = await fetch(`${this.apiBase}/report-settings?profile=student_list`, { silent: true });
            const d = r.ok ? await r.json() : null;
            if (d && d.settings) { this.o = clean(d.settings); this.cache(this.o); return true; }
        } catch (e) { /* נשארים עם המטמון */ }
        return false;
    }
    saveSoon() {
        this.cache(this.o);
        this.status('שומר...');
        clearTimeout(this._st);
        this._st = setTimeout(async () => {
            try {
                const r = await fetch(`${this.apiBase}/report-settings?profile=student_list`, {
                    method: 'PUT', silent: true, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ settings: this.o })
                });
                this.status(r.ok ? 'נשמר ✓' : 'השמירה בשרת נכשלה');
            } catch (e) { this.status('השמירה בשרת נכשלה'); }
        }, 700);
    }
    status(t) { const el = $('slSaved'); if (el) el.textContent = t; }

    // ============================================================
    async open(students, preset = {}, statsFn = null) {
        this.students = students || [];
        this.statsFn = statsFn || (() => ({}));
        this.classes = [...new Set(this.students.map(s => s.class_grade).filter(Boolean))].sort(cmp);
        this.scope = this.classes.includes(preset.scope) ? preset.scope : '';
        $('slModal').classList.remove('hidden');
        this.status('');
        this.paintControls(); this.refresh();
        const [changed] = await Promise.all([this.loadServer(), this.getLogo()]);
        if (changed) this.paintControls();
        this.refresh();
    }
    close() { $('slModal').classList.add('hidden'); }

    // ============================================================
    //  נתונים → שורות
    // ============================================================
    sorter(key) {
        const code = (a, b) => { const x = Number(a.student_code), y = Number(b.student_code); return !isNaN(x) && !isNaN(y) ? x - y : cmp(a.student_code, b.student_code); };
        if (key === 'code') return code;
        if (key === 'amount') return (a, b) => (this.st(b).total_reward || 0) - (this.st(a).total_reward || 0) || cmp(a.last_name, b.last_name) || code(a, b);
        if (key === 'first') return (a, b) => cmp(a.first_name, b.first_name) || cmp(a.last_name, b.last_name) || code(a, b);
        return (a, b) => cmp(a.last_name, b.last_name) || cmp(a.first_name, b.first_name) || code(a, b);
    }
    st(s) { return this.statsFn(s) || {}; }
    amounts() { return this.o.kind === 'amounts'; }
    showCls() { return this.o.cls && this.o.sort !== 'class' && !this.scope; }
    firstFirst() { return this.o.sort === 'first' || (this.o.sort === 'class' && this.o.inner === 'first'); }

    blocks() {
        const o = this.o, list = this.students.filter(s => !this.scope || s.class_grade === this.scope);
        const A = this.amounts(), showCode = !A || o.code;
        const nums = A ? ['mish', 'gem', 'amt'].filter(k => o[k]) : [];
        const span = 2 + (showCode ? 1 : 0) + (o.num ? 1 : 0) + (this.showCls() ? 1 : 0) + nums.length;
        const ff = this.firstFirst();
        let n = 0;
        const val = (s, k) => { const st = this.st(s); return k === 'mish' ? (st.total_mishnayot || 0) : k === 'gem' ? (st.total_gemara_pages || 0) : (st.total_reward || 0); };
        const cell = (k, v) => `<td class="c-v ${k === 'amt' ? 'c-m' : ''}">${k === 'amt' ? money(v) : v}</td>`;
        const row = s => `<tbody class="r"><tr>${o.num ? `<td class="c-n">${++n}</td>` : ''}
            <td class="c-a">${esc(ff ? s.first_name : s.last_name)}</td><td class="c-b">${esc(ff ? s.last_name : s.first_name)}</td>
            ${this.showCls() ? `<td class="c-c">${esc(s.class_grade || '')}</td>` : ''}${showCode ? `<td class="c-k">${esc(s.student_code)}</td>` : ''}${nums.map(k => cell(k, val(s, k))).join('')}</tr></tbody>`;
        const out = [];
        if (o.sort === 'class') {
            const by = new Map();
            list.slice().sort(this.sorter(o.inner)).forEach(s => { const k = s.class_grade || 'ללא כיתה'; if (!by.has(k)) by.set(k, []); by.get(k).push(s); });
            [...by.keys()].sort(cmp).forEach((k, i) => {
                if (o.pageBreak && i > 0) out.push({ brk: true });
                n = 0;
                out.push({ head: true, html: `<tbody class="sec"><tr><td colspan="${span}">כיתה ${esc(k)}</td></tr></tbody>` });
                by.get(k).forEach(s => out.push({ html: row(s) }));
            });
        } else {
            list.slice().sort(this.sorter(o.sort)).forEach(s => out.push({ html: row(s) }));
        }
        // סה״כ בסוף הרשימה (סכומים)
        if (A && nums.length && list.length) {
            const lead = span - nums.length;
            out.push({ html: `<tbody class="tot"><tr><td colspan="${lead}">סה״כ · ${list.length} תלמידים</td>${nums.map(k => cell(k, list.reduce((a, s) => a + val(s, k), 0))).join('')}</tr></tbody>` });
        }
        return { out, count: list.length };
    }

    thead() {
        const o = this.o, ff = this.firstFirst();
        const A = this.amounts(), H = { mish: 'משניות', gem: 'דפי גמרא', amt: 'סכום להטענה' };
        const nums = A ? ['mish', 'gem', 'amt'].filter(k => o[k]) : [];
        return `<thead><tr>${o.num ? '<th class="c-n">#</th>' : ''}<th>${ff ? 'שם פרטי' : 'משפחה'}</th><th>${ff ? 'משפחה' : 'שם פרטי'}</th>${this.showCls() ? '<th class="c-c">כיתה</th>' : ''}${!A || o.code ? '<th class="c-k">קוד</th>' : ''}${nums.map(k => `<th class="c-v ${k === 'amt' ? 'c-m' : ''}">${H[k]}</th>`).join('')}</tr></thead>`;
    }

    pageShell(count) {
        const o = this.o, S = SIZES[o.size];
        const sub = [this.scope ? `כיתה ${this.scope}` : 'כל הכיתות', `לפי ${SORTS[o.sort]}`, `${count} תלמידים`].join(' · ');
        const cols = Array.from({ length: o.columns }, () => `<div class="sl-col"><table class="sl-t">${this.thead()}</table></div>`).join('');
        return `<div class="sl-page" style="--fs:${S.fs}mm;--pd:${S.pad}mm">
            <header class="sl-head">${this._logo ? `<img class="sl-logo" src="${esc(this._logo)}" alt="">` : ''}
                <div class="sl-ttl"><h1>${esc(o.title.trim() || TITLES[o.kind])}</h1><div class="sl-sub">${esc(sub)}</div></div>
                <div class="sl-date">${esc(formatHebrewDate(new Date()))}</div></header>
            <div class="sl-cols">${cols}</div>
            <footer class="sl-foot"><span>הופק ממערכת ניהול פאר המשנה</span><span class="sl-pg"></span></footer></div>`;
    }

    // עימוד לפי מדידה אמיתית: ממלאים טור אחרי טור, עמוד אחרי עמוד
    paginate() {
        const { out, count } = this.blocks();
        const stage = $('slStage');
        stage.innerHTML = '';
        const pages = [];
        let cols, ci;
        const newPage = () => { stage.insertAdjacentHTML('beforeend', this.pageShell(count)); const p = stage.lastElementChild; pages.push(p); cols = [...p.querySelectorAll('.sl-col')]; ci = 0; };
        const tbl = () => cols[ci].firstElementChild;
        const fits = () => tbl().offsetHeight <= cols[ci].clientHeight + 0.5;
        const next = () => { if (ci < cols.length - 1) ci++; else newPage(); };

        // כותרת כיתה נצמדת לשורה שאחריה
        const units = [];
        for (let i = 0; i < out.length; i++) {
            const b = out[i];
            if (b.head && out[i + 1] && out[i + 1].html && !out[i + 1].head) { units.push({ html: b.html + out[++i].html }); }
            else units.push(b);
        }
        newPage();
        if (!units.length) tbl().insertAdjacentHTML('beforeend', '<tbody class="none"><tr><td colspan="6">לא נמצאו תלמידים</td></tr></tbody>');
        for (const u of units) {
            if (u.brk) { if (ci || tbl().tBodies.length) newPage(); continue; }
            for (let t = 0; t < 3; t++) {
                const before = tbl().tBodies.length;
                tbl().insertAdjacentHTML('beforeend', u.html);
                if (fits() || before === 0) break;
                while (tbl().tBodies.length > before) tbl().tBodies[before].remove();
                next();
            }
        }
        pages.forEach((p, i) => {
            p.querySelector('.sl-pg').textContent = pages.length > 1 ? `עמוד ${i + 1} מתוך ${pages.length}` : '';
            p.querySelectorAll('.sl-col').forEach(c => { if (!c.querySelector('tbody')) c.classList.add('empty'); });
        });
        return { pages: pages.length, count };
    }

    refresh() {
        clearTimeout(this._rt);
        this._rt = setTimeout(() => {
            if ($('slModal').classList.contains('hidden')) return;
            $('slStage').style.zoom = '';
            const { pages, count } = this.paginate();
            $('slInfo').textContent = `${count} תלמידים · ${pages} ${pages === 1 ? 'עמוד' : 'עמודים'}`;
            this.fit();
        }, 30);
    }
    fit() {
        const wrap = $('slPrev'), stage = $('slStage'), pg = stage && stage.firstElementChild;
        if (!wrap || !pg) return;
        stage.style.zoom = '';
        const z = Math.min(1, (wrap.clientWidth - 32) / pg.offsetWidth);
        stage.style.zoom = z < 1 ? z.toFixed(3) : '';
    }

    // ============================================================
    //  אפשרויות
    // ============================================================
    paintControls() {
        const o = this.o;
        const seg = (key, map, cur) => `<div class="sl-seg">${Object.entries(map).map(([k, v]) => `<button type="button" class="${String(cur) === k ? 'on' : ''}" data-set="${key}" data-v="${k}">${typeof v === 'string' ? v : v.label}</button>`).join('')}</div>`;
        const chk = (key, label, hide) => hide ? '' : `<label class="sl-chk"><input type="checkbox" data-chk="${key}" ${o[key] ? 'checked' : ''}> ${label}</label>`;
        const sorts = Object.fromEntries(Object.entries(SORTS).filter(([k]) => k !== 'amount' || this.amounts()));
        $('slCtl').innerHTML = `
            <label class="sl-lbl">סוג</label>${seg('kind', KINDS, o.kind)}
            <label class="sl-lbl">כיתה</label>
            <select id="slScope" class="sl-in"><option value="">כל הכיתות (${this.students.length})</option>
                ${this.classes.map(c => `<option value="${esc(c)}" ${this.scope === c ? 'selected' : ''}>כיתה ${esc(c)} (${this.students.filter(s => s.class_grade === c).length})</option>`).join('')}</select>
            <label class="sl-lbl">מיון</label>${seg('sort', sorts, o.sort)}
            ${o.sort === 'class' ? `<label class="sl-lbl">בתוך הכיתה</label>${seg('inner', INNER, o.inner)}` : ''}
            <label class="sl-lbl">טורים בדף</label>${seg('columns', { 1: '1', 2: '2', 3: '3' }, o.columns)}
            <label class="sl-lbl">גודל כתב</label>${seg('size', SIZES, o.size)}
            <label class="sl-lbl">כותרת</label><input id="slTitle" class="sl-in" value="${esc(o.title)}" maxlength="60">
            <div class="sl-chks">${chk('cls', 'כיתה', o.sort === 'class' || this.scope)}${chk('num', 'מספור')}${chk('code', 'קוד', !this.amounts())}${chk('mish', 'משניות', !this.amounts())}${chk('gem', 'דפי גמרא', !this.amounts())}${chk('amt', 'סכום', !this.amounts())}${chk('pageBreak', 'כל כיתה בעמוד חדש', o.sort !== 'class')}</div>
            <div class="sl-saved" id="slSaved"></div>`;
    }

    // ============================================================
    //  הדפסה / PDF
    // ============================================================
    fileName() {
        return [this.o.title.trim() || TITLES[this.o.kind], this.scope ? `כיתה ${this.scope}` : ''].filter(Boolean).join('_').replace(/[\\/:*?"<>|׳״']/g, '').replace(/\s+/g, '_');
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
            $('slStage').style.zoom = '';
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
        } finally { btn.disabled = false; btn.innerHTML = label; this.fit(); }
    }
    async getLogo() {
        if (this._logo) return this._logo;
        try {
            const blob = await (await fetch(LOGO_URL)).blob();
            this._logo = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(blob); });
        } catch (e) { this._logo = LOGO_URL; }
        return this._logo;
    }

    // ============================================================
    bind() {
        const ctl = $('slCtl');
        const changed = repaint => { this.saveSoon(); if (repaint) this.paintControls(); this.status('שומר...'); this.refresh(); };
        ctl.addEventListener('click', e => {
            const b = e.target.closest('[data-set]');
            if (!b) return;
            const k = b.dataset.set;
            const prevKind = this.o.kind;
            this.o[k] = k === 'columns' ? Number(b.dataset.v) : b.dataset.v;
            // החלפת סוג: כותרת וטורים שמתאימים לסוג החדש (אם לא שינו אותם ידנית)
            if (k === 'kind' && prevKind !== this.o.kind) {
                if (!this.o.title.trim() || this.o.title === TITLES[prevKind]) this.o.title = TITLES[this.o.kind];
                this.o.columns = this.o.kind === 'amounts' ? 1 : 3;
                if (this.o.sort === 'amount' && this.o.kind !== 'amounts') this.o.sort = 'last';
            }
            changed(true);
        });
        ctl.addEventListener('change', e => {
            const t = e.target;
            if (t.id === 'slScope') { this.scope = t.value; this.paintControls(); return this.refresh(); }   // הכיתה לא נשמרת — בחירה לכל הדפסה
            if (t.dataset.chk) { this.o[t.dataset.chk] = t.checked; changed(false); }
        });
        ctl.addEventListener('input', e => { if (e.target.id === 'slTitle') { this.o.title = e.target.value; changed(false); } });
        $('slClose').addEventListener('click', () => this.close());
        $('slPrint').addEventListener('click', () => this.print());
        $('slPdf').addEventListener('click', () => this.pdf());
        document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('slModal').classList.contains('hidden')) this.close(); });
        window.addEventListener('resize', () => { if (!$('slModal').classList.contains('hidden')) this.fit(); });
    }

    mount() {
        if ($('slModal')) return;
        document.body.insertAdjacentHTML('beforeend', `
        <div id="slModal" class="modal hidden" style="z-index:9995">
            <div class="modal-content sl-mc">
                <div class="sl-bar no-print">
                    <div class="sl-bt"><h3><i class="fas fa-print"></i> רשימת תלמידים להדפסה</h3><span id="slInfo"></span></div>
                    <div class="sl-acts">
                        <button class="btn btn-secondary btn-sm" id="slPdf"><i class="fas fa-file-pdf"></i> הורד PDF</button>
                        <button class="btn btn-primary btn-sm" id="slPrint"><i class="fas fa-print"></i> הדפס</button>
                        <button class="close-modal-btn" id="slClose" aria-label="סגור">&times;</button>
                    </div>
                </div>
                <div class="sl-ctl no-print" id="slCtl"></div>
                <div class="sl-prev" id="slPrev"><div class="sl-stage" id="slStage"></div></div>
            </div>
        </div>`);
    }

    css() {
        if ($('slStyles')) return;
        const st = document.createElement('style');
        st.id = 'slStyles';
        st.textContent = `
        .sl-mc{max-width:1000px;width:96%;height:95vh;border-radius:12px;overflow:hidden;background:#e2e8f0}
        .sl-bar{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;padding:12px 18px;background:#fff;box-shadow:0 2px 10px rgba(0,0,0,.05)}
        .sl-bt{display:flex;align-items:baseline;gap:12px}.sl-bt h3{margin:0;font-size:1.1rem}.sl-bt h3 i{color:var(--primary-color)}#slInfo{font-size:.8rem;color:var(--text-muted)}
        .sl-acts{display:flex;gap:8px;align-items:center}.sl-acts .close-modal-btn{margin-right:8px;font-size:1.5rem}
        .sl-ctl{display:flex;flex-wrap:wrap;align-items:center;gap:6px 10px;padding:8px 18px;background:#f8fafc;border-bottom:1px solid var(--border-color);font-size:.82rem}
        .sl-lbl{font-weight:700;color:#475569;margin-right:4px}
        .sl-in{padding:4px 8px;border:1px solid var(--border-color);border-radius:6px;background:#fff;font-family:inherit;font-size:.82rem;outline:none}#slTitle{width:170px}
        .sl-seg{display:inline-flex;border:1px solid var(--border-color);border-radius:6px;overflow:hidden;background:#fff}
        .sl-seg button{border:none;background:none;padding:4px 10px;font-size:.8rem;font-weight:600;color:#475569;cursor:pointer;font-family:inherit}
        .sl-seg button+button{border-right:1px solid var(--border-color)}.sl-seg button.on{background:var(--primary-color);color:#fff}
        .sl-chks{display:flex;gap:12px}.sl-chk{display:inline-flex;align-items:center;gap:4px;cursor:pointer;color:#1e293b}
        .sl-saved{margin-right:auto;color:#64748b;font-size:.76rem}
        .sl-prev{flex:1;min-height:0;overflow:auto;background:#cbd5e1;padding:16px}.sl-stage{width:fit-content;margin:0 auto}

        .sl-page{width:210mm;height:296mm;padding:9mm;box-sizing:border-box;background:#fff;color:#0f172a;direction:rtl;display:flex;flex-direction:column;overflow:hidden;
            margin:0 auto 12px;box-shadow:0 4px 14px rgba(15,23,42,.2);font-family:'Segoe UI','Noto Sans Hebrew',Arial,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}
        .sl-page *{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
        .sl-head{flex:none;display:flex;align-items:center;gap:4mm;padding-bottom:2.5mm;border-bottom:.6mm solid #0f172a}
        .sl-logo{height:13mm;width:auto;max-width:24mm;object-fit:contain}
        .sl-ttl{flex:1;min-width:0}.sl-ttl h1{margin:0;font-size:5.6mm;font-weight:800;line-height:1.15}
        .sl-sub{margin-top:.8mm;font-size:3.2mm;color:#334155;font-weight:600}.sl-date{font-size:3.1mm;color:#475569;font-weight:600;white-space:nowrap}
        .sl-cols{flex:1;min-height:0;display:flex;gap:3.5mm;margin-top:3mm;overflow:hidden}
        .sl-col{flex:1;min-width:0;height:100%;overflow:hidden}.sl-col.empty{visibility:hidden}
        .sl-t{width:100%;table-layout:fixed;border-collapse:collapse;font-size:var(--fs);border:.25mm solid #94a3b8}
        .sl-t th{background:#1e293b;color:#fff;font-weight:700;font-size:.9em;padding:calc(var(--pd) + .3mm) 1.4mm;text-align:right;white-space:nowrap}
        .sl-t td{padding:var(--pd) 1.4mm;border-bottom:.2mm solid #cbd5e1;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .sl-t tbody.r:nth-of-type(even) td{background:#f1f5f9}
        .sl-t .c-a{font-weight:700}
        .sl-t .c-n{width:6.5mm;text-align:center;color:#64748b;font-size:.85em}
        .sl-t .c-c{width:9mm;text-align:center}
        .sl-t .c-v{width:16mm;text-align:center}.sl-t .c-m{width:24mm;font-weight:700;white-space:nowrap}
        .sl-t tbody.tot td{background:#e2e8f0 !important;font-weight:800;border-top:.4mm solid #1e293b}
        .sl-t .c-k{width:12.5mm;text-align:center;font-weight:800;border-right:.2mm solid #cbd5e1;letter-spacing:.1mm}
        .sl-t th.c-k,.sl-t th.c-c{text-align:center}
        .sl-t tbody.sec td{background:#e2e8f0 !important;font-weight:800;padding:calc(var(--pd) + .3mm) 1.4mm;border-bottom:.3mm solid #94a3b8}
        .sl-t tbody.none td{text-align:center;padding:15mm 0;color:#64748b;border:none}
        .sl-foot{flex:none;margin-top:2mm;padding-top:1.2mm;border-top:.2mm solid #e2e8f0;display:flex;justify-content:space-between;font-size:2.6mm;color:#64748b}

        @media print{
            @page{size:A4 portrait;margin:0}
            body.sl-printing > *:not(#slModal){display:none !important}
            body.sl-printing #printReportModal{display:none !important}
            body.sl-printing #slModal{position:static !important;display:block !important;width:auto !important;height:auto !important;overflow:visible !important;background:#fff !important}
            body.sl-printing #slModal .sl-mc,body.sl-printing #slModal .sl-prev,body.sl-printing #slModal .sl-stage{position:static !important;display:block !important;width:auto !important;max-width:none !important;height:auto !important;max-height:none !important;overflow:visible !important;box-shadow:none !important;border:none !important;border-radius:0 !important;background:#fff !important;padding:0 !important;margin:0 !important;zoom:1 !important}
            body.sl-printing .sl-page{margin:0 !important;box-shadow:none !important;break-after:page;page-break-after:always}
            body.sl-printing .sl-page:last-child{break-after:auto;page-break-after:auto}
        }`;
        document.head.appendChild(st);
    }
}
