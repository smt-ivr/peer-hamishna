// ============================================================
//  client-history.js — היסטוריית בחינות: יומן עדכונים של כל המערכת
//  new HistoryManager(container, apiBase, onOpenStudent(code), onChanged())
//  תצוגות: ציר זמן (מחולק לפי ימים) | לפי תלמיד.  סינון: חיפוש, כיתה, סטטוס, מקור, תקופה.
// ============================================================
import { formatHebrewDate } from './client-reports.js';

const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const csv = v => { let s = String(v ?? ''); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return `"${s.replace(/"/g, '""')}"`; };
const money = v => '₪' + (Number(v) || 0).toFixed(1);
const $ = id => document.getElementById(id);
const DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
const PAGE = 150;
const hebShort = d => formatHebrewDate(d).split(' ').slice(0, -1).join(' ');
const dayStart = d => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
const hhmm = d => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
// מקור העדכון: טלפון (ימות) / אתר (ממשק הניהול) / לא ידוע
const srcOf = u => (u === 'phone' ? 'phone' : (!u || u === 'unknown' ? 'other' : 'web'));
const SRC = { phone: ['טלפון', 'fa-phone'], web: ['אתר', 'fa-desktop'], other: ['לא ידוע', 'fa-question-circle'] };
const PERIODS = [['all', 'הכל'], ['today', 'היום'], ['yest', 'אתמול'], ['week', '7 ימים'], ['month', '30 יום']];

export class HistoryManager {
    constructor(container, apiBase, onOpenStudent, onChanged) {
        Object.assign(this, { container, apiBase, onOpenStudent, onChanged });
        this.rows = []; this.students = []; this.exams = [];
        this.sMap = new Map(); this.eMap = new Map();
        this.f = { text: '', cls: '', status: '', src: '', period: 'all', view: 'time', limit: PAGE };
        this.css();
        this.bind();
    }

    async call(method, path, body) {
        const opt = { method, silent: true };      // השגיאות מוצגות כאן (טוסט אחד), לא ע"י המעטפת הגלובלית
        if (body !== undefined) { opt.headers = { 'Content-Type': 'application/json' }; opt.body = JSON.stringify(body); }
        try {
            const res = await fetch(`${this.apiBase}${path}`, opt);
            return { ok: res.ok, status: res.status, data: await res.json().catch(() => null) };
        } catch (e) { return { ok: false, status: 0, data: { message: 'שגיאת תקשורת מול השרת.' } }; }
    }

    // ============================================================
    //  טעינה
    // ============================================================
    async loadAndRender(students, exams) {
        if (students) { this.students = students; this.sMap = new Map(students.map(s => [s.student_code, s])); }
        if (exams) { this.exams = exams; this.eMap = new Map(exams.map(e => [e.exam_code, e])); }
        if (!this.rows.length) this.container.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i> טוען היסטוריית בחינות...</div>';
        const r = await this.call('GET', '/student-exams');
        if (!r.ok || !Array.isArray(r.data)) {
            this.container.innerHTML = `<div class="hs-fail"><i class="fas fa-exclamation-circle"></i> ${esc((r.data && (r.data.message || r.data.error)) || 'שגיאה בטעינת היסטוריית הבחינות.')}<br><button class="btn btn-outline btn-sm" data-reload>נסה שוב</button></div>`;
            return;
        }
        this.rows = r.data.map(x => { const d = new Date(String(x.updated_at || '').replace(' ', 'T')); return { ...x, date: d, ts: isNaN(d) ? 0 : d.getTime() }; })
            .sort((a, b) => b.ts - a.ts);
        this.loadedAt = new Date();
        this.render();
    }

    reload() { return this.loadAndRender(); }
    stu(code) { return this.sMap.get(code); }
    name(code) { const s = this.stu(code); return s ? `${s.first_name || ''} ${s.last_name || ''}`.trim() : `תלמיד שנמחק (${code})`; }
    desc(code) {
        const e = this.eMap.get(code), d = (e && e.details) || {};
        if (!e) return 'בחינה שנמחקה';
        return e.exam_type === 'gemara' ? `${d.masechet || ''} · ${d.from_page || ''} – ${d.to_page || ''}` : `${d.masechet || ''} · פרק ${d.chapter_name || d.chapter_num || ''}`;
    }

    // ============================================================
    //  שלד + סיכומים
    // ============================================================
    render() {
        const classes = [...new Set(this.students.map(s => s.class_grade).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'he'));
        const seg = (id, arr, cur) => `<div class="hs-seg" id="${id}">${arr.map(([v, t]) => `<button type="button" data-v="${v}" class="${cur === v ? 'on' : ''}">${t}</button>`).join('')}</div>`;
        this.container.innerHTML = `
        <div class="hs-root">
            <div class="hs-card hs-head">
                <div><h3><i class="fas fa-history"></i> היסטוריית בחינות</h3><div class="hs-sub" id="hsSub"></div></div>
                <div class="hs-btns"><button class="btn btn-outline btn-sm" data-reload title="טען מחדש מהשרת"><i class="fas fa-sync-alt"></i> רענן</button>
                    <button class="btn btn-outline btn-sm" id="hsExport"><i class="fas fa-file-excel"></i> ייצוא</button></div>
            </div>
            <div class="hs-kpis" id="hsKpis"></div>
            <div class="hs-card hs-tools">
                <div class="hs-search"><i class="fas fa-search"></i><input id="hsText" placeholder="חיפוש: תלמיד, קוד, מסכת, פרק או מספר טלפון..." value="${esc(this.f.text)}" autocomplete="off"></div>
                <select id="hsCls" class="hs-sel"><option value="">כל הכיתות</option>${classes.map(c => `<option value="${esc(c)}" ${this.f.cls === c ? 'selected' : ''}>כיתה ${esc(c)}</option>`).join('')}</select>
                ${seg('hsStatus', [['', 'כל התוצאות'], ['pass', '✓ עבר'], ['fail', '✕ לא עבר']], this.f.status)}
                ${seg('hsSrc', [['', 'כל המקורות'], ['web', 'אתר'], ['phone', 'טלפון']], this.f.src)}
                ${seg('hsPeriod', PERIODS, this.f.period)}
                ${seg('hsView', [['time', 'ציר זמן'], ['stu', 'לפי תלמיד']], this.f.view)}
            </div>
            <div class="hs-card hs-body" id="hsBody"></div>
        </div>`;
        this.paint();
    }

    kpis() {
        const now = Date.now(), t0 = dayStart(new Date()), all = this.rows;
        const today = all.filter(r => r.ts >= t0).length, week = all.filter(r => r.ts >= now - 7 * 864e5).length;
        const pass = all.filter(r => r.passed).length, phone = all.filter(r => srcOf(r.update_source) === 'phone').length;
        const k = (icon, v, l, c = '') => `<div class="hs-k ${c}"><i class="fas ${icon}"></i><div><b>${v}</b><span>${l}</span></div></div>`;
        return k('fa-bolt', today, 'עדכונים היום', 'b') + k('fa-calendar-week', week, 'ב-7 הימים האחרונים') + k('fa-database', all.length, 'סה"כ רישומים') +
            k('fa-check-double', all.length ? Math.round(pass / all.length * 100) + '%' : '—', 'אחוז הצלחה', 'g') + k('fa-phone', all.length ? Math.round(phone / all.length * 100) + '%' : '—', 'עודכנו בטלפון');
    }

    filtered() {
        const { text, cls, status, src, period } = this.f, t = text.trim().toLowerCase(), now = new Date(), t0 = dayStart(now);
        const from = { today: t0, yest: t0 - 864e5, week: Date.now() - 7 * 864e5, month: Date.now() - 30 * 864e5 }[period] ?? 0;
        const to = period === 'yest' ? t0 : Infinity;
        return this.rows.filter(r => {
            const s = this.stu(r.student_code);
            if (cls && (!s || s.class_grade !== cls)) return false;
            if (status && (status === 'pass') !== r.passed) return false;
            if (src && srcOf(r.update_source) !== src) return false;
            if (period !== 'all' && (r.ts < from || r.ts >= to)) return false;
            return !t || `${this.name(r.student_code)} ${r.student_code} ${r.exam_code} ${this.desc(r.exam_code)} ${r.source_identifier || ''}`.toLowerCase().includes(t);
        });
    }

    // ============================================================
    //  ציור
    // ============================================================
    paint() {
        const rows = this.filtered();
        $('hsKpis').innerHTML = this.kpis();
        $('hsSub').textContent = `מוצגים ${rows.length} מתוך ${this.rows.length} רישומים · נטען ${hhmm(this.loadedAt)}`;
        $('hsBody').innerHTML = !rows.length ? `<div class="hs-empty"><i class="fas fa-inbox"></i><b>${this.rows.length ? 'לא נמצאו רישומים תואמים' : 'עדיין אין עדכוני בחינות במערכת'}</b>${this.rows.length ? '<span>נסה לשנות את הסינון</span>' : ''}</div>`
            : (this.f.view === 'time' ? this.timeline(rows) : this.byStudent(rows));
    }

    dayLabel(d) {
        const diff = Math.round((dayStart(new Date()) - dayStart(d)) / 864e5);
        return `${diff === 0 ? 'היום' : diff === 1 ? 'אתמול' : `יום ${DAYS[d.getDay()]}`} · ${hebShort(d)}`;
    }

    timeline(rows) {
        const shown = rows.slice(0, this.f.limit), days = new Map();
        shown.forEach(r => { const k = r.ts ? dayStart(r.date) : 0; (days.get(k) || days.set(k, []).get(k)).push(r); });
        const body = [...days.values()].map(list => {
            const d = list[0].date, p = list.filter(r => r.passed).length;
            return `<div class="hs-day"><b>${list[0].ts ? this.dayLabel(d) : 'ללא תאריך'}</b><span>${list.length} עדכונים</span><em class="ok">✓ ${p}</em><em class="bad">✕ ${list.length - p}</em></div>` + list.map(r => this.rowHtml(r)).join('');
        }).join('');
        const more = rows.length > shown.length ? `<div class="hs-more"><button class="btn btn-outline btn-sm" data-more>הצג עוד ${Math.min(PAGE, rows.length - shown.length)} (נותרו ${rows.length - shown.length})</button></div>` : '';
        return body + more;
    }

    rowHtml(r) {
        const s = this.stu(r.student_code), e = this.eMap.get(r.exam_code), [sn, si] = SRC[srcOf(r.update_source)];
        const ty = e ? `<i class="hs-ty ${e.exam_type === 'gemara' ? 'g' : 'm'}">${e.exam_type === 'gemara' ? 'גמרא' : 'משניות'}</i>` : '';
        return `<div class="hs-r" data-s="${esc(r.student_code)}" data-e="${esc(r.exam_code)}">
            <span class="tm">${r.ts ? hhmm(r.date) : ''}</span>
            <span class="who"><b>${esc(this.name(r.student_code))}</b>${s && s.class_grade ? `<i class="cls">${esc(s.class_grade)}</i>` : ''}<em>${esc(r.student_code)}</em></span>
            <span class="ex">${ty}<b>${esc(r.exam_code)}</b><span class="d">${esc(this.desc(r.exam_code))}</span></span>
            <span class="pl ${r.passed ? 'ok' : 'bad'}">${r.passed ? '✓ עבר' : '✕ לא עבר'}</span>
            <span class="src" title="${esc(sn)}${r.source_identifier ? ' · ' + esc(r.source_identifier) : ''}"><i class="fas ${si}"></i> ${esc(r.source_identifier || sn)}</span>
            <span class="act"><button data-open title="כרטיס התלמיד"><i class="fas fa-user"></i></button><button data-del class="d" title="מחק רישום"><i class="fas fa-trash"></i></button></span></div>`;
    }

    byStudent(rows) {
        const m = new Map();
        rows.forEach(r => { const g = m.get(r.student_code) || m.set(r.student_code, { code: r.student_code, n: 0, p: 0, last: r }).get(r.student_code); g.n++; if (r.passed) g.p++; });
        const list = [...m.values()].sort((a, b) => b.last.ts - a.last.ts);
        return `<table class="hs-table"><thead><tr><th>תלמיד</th><th>כיתה</th><th>עדכונים</th><th>עברו</th><th>לא עברו</th><th>עדכון אחרון</th><th>מקור</th></tr></thead><tbody>${list.map(g => {
            const s = this.stu(g.code), [sn, si] = SRC[srcOf(g.last.update_source)];
            return `<tr data-s="${esc(g.code)}" data-open class="clickable"><td><b>${esc(this.name(g.code))}</b> <em>${esc(g.code)}</em></td><td>${s ? `<i class="cls">${esc(s.class_grade || '-')}</i>` : '-'}</td>
                <td>${g.n}</td><td class="ok">${g.p}</td><td class="bad">${g.n - g.p}</td><td>${g.last.ts ? `${this.dayLabel(g.last.date)} · ${hhmm(g.last.date)}` : ''}</td><td><i class="fas ${si}"></i> ${sn}</td></tr>`;
        }).join('')}</tbody></table>`;
    }

    // ============================================================
    //  פעולות
    // ============================================================
    notify(msg, type, action) {
        if (typeof window.notify === 'function') window.notify(msg, type, action ? { duration: 9000, actionLabel: action.label, onAction: action.fn } : {});
        else window.customAlert(msg, type === 'error');
    }

    async remove(sc, ec, btn) {
        const r = this.rows.find(x => x.student_code === sc && x.exam_code === ec);
        if (!r) return;
        const ok = await window.customConfirm(`למחוק את הרישום של ${this.name(sc)} בבחינה ${ec} (${r.passed ? 'עבר' : 'לא עבר'})?\nהבחינה תחזור להיות "טרם נבחן" אצל התלמיד.`);
        if (!ok) return;
        if (btn) btn.disabled = true;
        const res = await this.call('DELETE', `/student-exams/${encodeURIComponent(sc)}/${encodeURIComponent(ec)}`);
        if (!res.ok) { if (btn) btn.disabled = false; return this.notify((res.data && (res.data.message || res.data.error)) || 'המחיקה נכשלה.', 'error'); }
        this.rows = this.rows.filter(x => x !== r);
        this.paint();
        if (this.onChanged) this.onChanged();
        this.notify(`הרישום נמחק (${this.name(sc)} · ${ec})`, 'info', { label: 'בטל', fn: () => this.restore(r) });
    }

    // ביטול מחיקה: רושמים מחדש את אותה תוצאה (התאריך יהיה הזמן הנוכחי)
    async restore(r) {
        const res = await this.call('POST', '/student-exams', { student_code: r.student_code, exams: [{ exam_code: r.exam_code, passed: r.passed, force_update: true }] });
        if (!res.ok || (res.data && res.data.errors && res.data.errors.length)) return this.notify((res.data && ((res.data.errors && res.data.errors[0] && res.data.errors[0].reason) || res.data.message || res.data.error)) || 'השחזור נכשל.', 'error');
        await this.reload();
        if (this.onChanged) this.onChanged();
        this.notify('הרישום שוחזר.', 'success');
    }

    exportCsv() {
        const lines = [['תאריך עברי', 'שעה', 'קוד תלמיד', 'שם התלמיד', 'כיתה', 'קוד בחינה', 'פירוט', 'סטטוס', 'מקור', 'מזהה מקור'].map(csv).join(',')];
        this.filtered().forEach(r => {
            const s = this.stu(r.student_code);
            lines.push([r.ts ? formatHebrewDate(r.date) : '', r.ts ? hhmm(r.date) : '', r.student_code, this.name(r.student_code), s ? s.class_grade : '', r.exam_code, this.desc(r.exam_code), r.passed ? 'עבר' : 'לא עבר', SRC[srcOf(r.update_source)][0], r.source_identifier || ''].map(csv).join(','));
        });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' }));
        a.download = 'היסטוריית_בחינות.csv';
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }

    // ============================================================
    //  אירועים (פעם אחת)
    // ============================================================
    bind() {
        const c = this.container, set = (k, v) => { this.f[k] = v; this.f.limit = PAGE; this.paint(); };
        c.addEventListener('input', e => { if (e.target.id === 'hsText') set('text', e.target.value); });
        c.addEventListener('change', e => { if (e.target.id === 'hsCls') set('cls', e.target.value); });
        c.addEventListener('click', e => {
            const t = e.target, b = t.closest('.hs-seg button');
            if (b) {
                const map = { hsStatus: 'status', hsSrc: 'src', hsPeriod: 'period', hsView: 'view' }, id = b.parentElement.id;
                b.parentElement.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
                return set(map[id], b.dataset.v);
            }
            if (t.closest('[data-reload]')) return this.reload();
            if (t.closest('#hsExport')) return this.exportCsv();
            if (t.closest('[data-more]')) { this.f.limit += PAGE; return this.paint(); }
            const row = t.closest('[data-s]');
            if (!row) return;
            if (t.closest('[data-del]')) return this.remove(row.dataset.s, row.dataset.e, t.closest('[data-del]'));
            if (t.closest('[data-open]') && this.onOpenStudent) this.onOpenStudent(row.dataset.s);
        });
    }

    css() {
        if ($('hsStyles')) return;
        const st = document.createElement('style');
        st.id = 'hsStyles';
        st.textContent = `
        .hs-root{display:flex;flex-direction:column;gap:10px;height:100%;min-height:0}
        .hs-card{background:#fff;border:1px solid var(--border-color);border-radius:12px;box-shadow:0 1px 3px rgba(0,0,0,.04)}
        .hs-head{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;padding:12px 16px;flex:none}
        .hs-head h3{margin:0 0 2px;font-size:1.1rem;display:flex;gap:8px;align-items:center}.hs-head h3 i{color:var(--primary-color)}.hs-sub{font-size:.78rem;color:#64748b}.hs-btns{display:flex;gap:8px}
        .hs-kpis{display:grid;grid-template-columns:repeat(5,1fr);gap:10px;flex:none}
        .hs-k{background:#fff;border:1px solid var(--border-color);border-radius:12px;padding:10px 14px;display:flex;align-items:center;gap:12px}
        .hs-k i{width:38px;height:38px;border-radius:10px;background:#eff6ff;color:#2563eb;display:flex;align-items:center;justify-content:center;font-size:1rem}.hs-k.g i{background:#ecfdf5;color:#059669}
        .hs-k b{display:block;font-size:1.25rem;line-height:1.15;color:#0f172a}.hs-k span{font-size:.72rem;color:#64748b}
        .hs-tools{display:flex;gap:10px;flex-wrap:wrap;align-items:center;padding:10px 14px;flex:none}
        .hs-search{position:relative;flex:1;min-width:230px}.hs-search i{position:absolute;right:11px;top:50%;transform:translateY(-50%);color:#94a3b8;font-size:.85rem}
        .hs-search input{width:100%;padding:7px 32px 7px 10px;border:1px solid var(--border-color);border-radius:8px;background:#f8fafc;outline:none}.hs-search input:focus{border-color:var(--primary-color);background:#fff}
        .hs-sel{padding:6px 9px;border:1px solid var(--border-color);border-radius:8px;background:#fff;outline:none}
        .hs-seg{display:inline-flex;border:1px solid var(--border-color);border-radius:8px;overflow:hidden;background:#fff}.hs-seg button{border:none;background:none;padding:6px 11px;font-size:.8rem;font-weight:600;color:#475569;cursor:pointer;white-space:nowrap}
        .hs-seg button+button{border-right:1px solid var(--border-color)}.hs-seg button.on{background:var(--primary-color);color:#fff}
        .hs-body{flex:1;min-height:0;overflow:auto}
        .hs-day{position:sticky;top:0;z-index:2;display:flex;align-items:center;gap:12px;padding:6px 16px;background:#1e293b;color:#fff;font-size:.82rem}.hs-day span{opacity:.8}.hs-day em{font-style:normal;font-weight:700}.hs-day b{margin-left:auto}
        .hs-day .ok{color:#6ee7b7}.hs-day .bad{color:#fca5a5}
        .hs-r{display:grid;grid-template-columns:46px minmax(190px,1.2fr) minmax(220px,1.6fr) 84px minmax(110px,150px) 66px;gap:10px;align-items:center;padding:6px 16px;border-bottom:1px solid #eef2f7;font-size:.84rem}
        .hs-r:nth-child(even){background:#f8fafc}.hs-r:hover{background:#eff6ff}
        .hs-r .tm{color:#64748b;font-weight:600;font-variant-numeric:tabular-nums}.hs-r .who{display:flex;gap:7px;align-items:center;min-width:0}.hs-r .who b{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        em{font-style:normal;color:#94a3b8;font-size:.74rem}.cls{font-style:normal;background:#f1f5f9;border:1px solid var(--border-color);border-radius:6px;padding:0 7px;font-size:.72rem;font-weight:700}
        .hs-r .ex{display:flex;gap:7px;align-items:center;min-width:0}.hs-r .ex .d{color:#64748b;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .hs-ty{font-style:normal;border-radius:99px;padding:0 7px;font-size:.65rem;font-weight:800;border:1px solid;flex:none}.hs-ty.m{background:#eff6ff;color:#1d4ed8;border-color:#bfdbfe}.hs-ty.g{background:#fffbeb;color:#92400e;border-color:#fde68a}
        .hs-r .pl{border-radius:99px;padding:1px 9px;font-size:.74rem;font-weight:700;text-align:center;white-space:nowrap}.pl.ok{background:#d1fae5;color:#047857}.pl.bad{background:#fee2e2;color:#b91c1c}
        .hs-r .src{color:#64748b;font-size:.78rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.hs-r .act{display:flex;gap:4px;justify-content:flex-end;opacity:.35;transition:.15s}.hs-r:hover .act{opacity:1}
        .hs-r .act button{border:1px solid var(--border-color);background:#fff;width:26px;height:26px;border-radius:7px;cursor:pointer;color:#475569;font-size:.75rem}.hs-r .act button:hover{background:#eff6ff;border-color:#93c5fd}.hs-r .act .d:hover{background:#fef2f2;border-color:#fecaca;color:#dc2626}
        .hs-more{padding:14px;text-align:center}.hs-empty{display:flex;flex-direction:column;align-items:center;gap:6px;padding:50px 10px;color:#64748b}.hs-empty i{font-size:2rem;color:#cbd5e1}.hs-fail{padding:30px;text-align:center;color:#991b1b}
        .hs-table{width:100%;border-collapse:separate;border-spacing:0;font-size:.85rem}.hs-table th{position:sticky;top:0;background:#f1f5f9;color:#475569;font-size:.76rem;text-align:right;padding:9px 14px;border-bottom:1px solid var(--border-color)}
        .hs-table td{padding:8px 14px;border-bottom:1px solid #eef2f7}.hs-table tr.clickable{cursor:pointer}.hs-table tr.clickable:hover{background:#eff6ff}.hs-table td.ok{color:#047857;font-weight:700}.hs-table td.bad{color:#b91c1c;font-weight:700}
        @media(max-width:1100px){.hs-kpis{grid-template-columns:repeat(2,1fr)}.hs-r{grid-template-columns:44px 1fr 80px}.hs-r .ex,.hs-r .src{grid-column:2/-1}.hs-r .act{display:none}}`;
        document.head.appendChild(st);
    }
}
