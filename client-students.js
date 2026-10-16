// ============================================================
//  client-students.js — ניהול תלמידים: טבלה, כרטיס תלמיד (מה נבחן), הוספה / עריכה
//  new StudentManager(container, apiBase, onGrades(code), onRefresh())
// ============================================================
import { formatHebrewDate } from './client-reports.js';

const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const csv = v => { let s = String(v ?? ''); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return `"${s.replace(/"/g, '""')}"`; };
const money = v => '₪' + (Number(v) || 0).toFixed(1);
const heb = ts => { const d = new Date(String(ts || '').replace(' ', 'T')); return isNaN(d) ? '' : formatHebrewDate(d).split(' ').slice(0, -1).join(' '); };
const $ = id => document.getElementById(id);

const TYPE = { mishnayot: 'משניות', gemara: 'גמרא' };
const STATUS = { true: ['✓ עבר', 'ok'], false: ['✕ לא עבר', 'bad'], null: ['טרם נבחן', 'none'] };

export class StudentManager {
    constructor(container, apiBase, onGrades, onRefresh) {
        Object.assign(this, { container, apiBase, onGrades, onRefresh });
        this.students = [];
        this.sum = new Map();      // code → stats מהשרת (נבחן / מתוך / עברו / מלגה)
        this.cards = new Map();    // code → רשימת הבחינות של התלמיד
        this.f = { text: '', cls: '', status: '', key: 'name', dir: 1 };
        this.seg = 'taken';
        this.css();
        this.mount();
        this.bind();
    }

    // ---------- שרת ----------
    async call(method, path, body) {
        const opt = { method };
        if (body !== undefined) { opt.headers = { 'Content-Type': 'application/json' }; opt.body = JSON.stringify(body); }
        try {
            const res = await fetch(`${this.apiBase}${path}`, opt);
            return { ok: res.ok, status: res.status, data: await res.json().catch(() => null) };
        } catch (e) {
            await window.customAlert('שגיאת תקשורת מול השרת.', true);
            return { ok: false, status: 0, data: null };
        }
    }
    errText(r, fallback) { return (r.data && (r.data.message || r.data.error)) || fallback; }

    // ---------- נתונים ----------
    stats(s) {
        const m = this.sum.get(s.student_code), ex = s.exams_details || [];
        return {
            attempted: m ? m.total_attempted : ex.length,
            available: m ? m.total_available_exams : null,
            passed: m ? m.total_passed : ex.filter(e => e.passed).length,
            reward: m ? m.total_reward : (s.total_reward || 0)
        };
    }
    find(code) { return this.students.find(s => s.student_code === code); }
    fullName(s) { return `${s.first_name || ''} ${s.last_name || ''}`.trim(); }

    rowsData() {
        const { text, cls, status, key, dir } = this.f, t = text.trim().toLowerCase();
        const val = s => {
            const st = this.stats(s);
            return { code: Number(s.student_code) || s.student_code, class: s.class_grade || '', passed: st.passed, reward: st.reward,
                     progress: st.available ? st.attempted / st.available : st.attempted, name: `${s.last_name} ${s.first_name}` }[key];
        };
        return this.students
            .filter(s => (!cls || s.class_grade === cls) && (!t || `${s.student_code} ${this.fullName(s)}`.toLowerCase().includes(t))
                && (!status || (status === 'none' ? this.stats(s).attempted === 0 : this.stats(s).attempted > 0)))
            .sort((a, b) => { const x = val(a), y = val(b); return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'he', { numeric: true })) * dir; });
    }

    // ============================================================
    //  המסך הראשי
    // ============================================================
    render(students) {
        this.students = students || [];
        this.cards.clear();
        const classes = [...new Set(this.students.map(s => s.class_grade).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'he'));
        this.container.innerHTML = `
        <div class="stu-root">
            <div class="stu-card stu-head">
                <div><h3><i class="fas fa-users"></i> ניהול תלמידים</h3><div class="stu-kpis" id="stuKpis"></div></div>
                <div class="stu-btns">
                    <button class="btn btn-outline btn-sm" id="stuExport"><i class="fas fa-file-excel"></i> ייצוא</button>
                    <button class="btn btn-primary btn-sm" id="stuAdd"><i class="fas fa-user-plus"></i> תלמיד חדש</button>
                </div>
            </div>
            <div class="stu-card stu-tools">
                <div class="stu-search"><i class="fas fa-search"></i><input id="stuText" placeholder="חיפוש לפי שם או קוד..." value="${esc(this.f.text)}" autocomplete="off"></div>
                <select id="stuCls" class="stu-sel"><option value="">כל הכיתות</option>${classes.map(c => `<option value="${esc(c)}" ${this.f.cls === c ? 'selected' : ''}>כיתה ${esc(c)}</option>`).join('')}</select>
                <div class="stu-segc" id="stuStatus">${[['', 'הכל'], ['taken', 'נבחנו'], ['none', 'לא נבחנו כלל']].map(([v, t]) => `<button data-v="${v}" class="${this.f.status === v ? 'on' : ''}">${t}</button>`).join('')}</div>
            </div>
            <div class="stu-card stu-wrap"><table class="stu-table">
                <thead><tr>${[['code', 'קוד'], ['name', 'שם התלמיד'], ['class', 'כיתה'], [null, 'טלפון'], ['progress', 'נבחן'], ['passed', 'עברו'], ['reward', 'מלגה']].map(([k, t]) => `<th ${k ? `data-k="${k}"` : ''}>${t}</th>`).join('')}<th></th></tr></thead>
                <tbody id="stuBody"></tbody></table></div>
        </div>`;
        this.paint();
        this.loadSummary();
        if (this.cardCode) { if (this.find(this.cardCode)) this.openCard(this.cardCode); else this.closeCard(); }
    }

    paint() {
        const rows = this.rowsData(), all = this.students;
        const none = all.filter(s => this.stats(s).attempted === 0).length;
        $('stuKpis').innerHTML = `<span class="stu-kpi">תלמידים <b>${all.length}</b></span>
            <span class="stu-kpi ${none ? 'click' : ''}" id="stuNoneKpi" title="הצג רק תלמידים שלא נבחנו כלל">לא נבחנו כלל <b>${none}</b></span>
            <span class="stu-kpi">סך מלגות <b>${money(all.reduce((a, s) => a + this.stats(s).reward, 0))}</b></span>
            <span class="stu-kpi">מוצגים <b>${rows.length}</b></span>`;
        $('stuBody').innerHTML = rows.length ? rows.map(s => this.rowHtml(s)).join('') : '<tr><td colspan="8" class="stu-empty">לא נמצאו תלמידים</td></tr>';
        document.querySelectorAll('.stu-table th[data-k]').forEach(th => {
            th.classList.toggle('sorted', th.dataset.k === this.f.key);
            th.dataset.dir = th.dataset.k === this.f.key ? (this.f.dir > 0 ? '▲' : '▼') : '';
        });
    }

    rowHtml(s) {
        const st = this.stats(s), pct = st.available ? Math.min(100, Math.round(st.attempted / st.available * 100)) : 0;
        return `<tr data-code="${esc(s.student_code)}">
            <td class="stu-code">${esc(s.student_code)}</td><td><b>${esc(this.fullName(s))}</b></td>
            <td><span class="stu-cls">${esc(s.class_grade || '-')}</span></td>
            <td class="stu-mut">${esc((s.phones || [])[0] || '')}</td>
            <td><div class="stu-bar"><div><i style="width:${pct}%"></i></div><span>${st.attempted}${st.available != null ? ` מתוך ${st.available}` : ''}</span></div></td>
            <td class="stu-ok">${st.passed}</td><td class="stu-money">${money(st.reward)}</td>
            <td><button class="btn btn-outline btn-sm" data-grades title="הזנת בחינות לתלמיד"><i class="fas fa-edit"></i> ציונים</button></td></tr>`;
    }

    // סטטיסטיקה לכל התלמידים מהשרת (פעם אחת) — נבחן / מתוך כמה / עברו / מלגה
    async loadSummary() {
        const r = await this.call('GET', '/student-summary');
        if (r.ok && Array.isArray(r.data)) { this.sum = new Map(r.data.map(x => [x.student_code, x.stats])); this.paint(); }
    }

    // ============================================================
    //  כרטיס תלמיד: מה הוא נבחן
    // ============================================================
    async openCard(code) {
        const s = this.find(code);
        if (!s) return;
        this.cardCode = code;
        this.seg = 'taken';
        this.paintCard();
        $('stuOv').classList.add('open'); $('stuDr').classList.add('open');
        if (!this.cards.has(code)) {
            const r = await this.call('GET', `/student-summary?student_code=${encodeURIComponent(code)}`);
            const me = r.ok && Array.isArray(r.data) ? r.data[0] : null;
            this.cards.set(code, me ? me.exams : []);
            if (me) this.sum.set(code, me.stats);
        }
        if (this.cardCode === code) this.paintCard();
    }

    closeCard() { this.cardCode = null; $('stuOv').classList.remove('open'); $('stuDr').classList.remove('open'); }

    paintCard() {
        const s = this.find(this.cardCode), exams = this.cards.get(this.cardCode);
        if (!s) return;
        const st = this.stats(s), phones = (s.phones || []).join(' · ');
        const tile = (v, l, c = '') => `<div class="stu-tile ${c}"><b>${v}</b><span>${l}</span></div>`;
        $('stuDr').innerHTML = `
            <div class="stu-dh">
                <div class="stu-av">${esc((s.first_name || '?').charAt(0))}</div>
                <div class="stu-id"><h2>${esc(this.fullName(s))}</h2>
                    <div class="stu-tags"><span>קוד ${esc(s.student_code)}</span><span>כיתה ${esc(s.class_grade || '-')}</span>${phones ? `<span>${esc(phones)}</span>` : ''}</div></div>
                <button class="stu-x" data-close>&times;</button>
            </div>
            <div class="stu-tiles">${tile(st.available != null ? `${st.attempted} מתוך ${st.available}` : st.attempted, 'נבחן')}${tile(st.passed, 'עברו', 'ok')}${tile(Math.max(0, st.attempted - st.passed), 'לא עברו', 'bad')}${tile(money(st.reward), 'מלגה', 'money')}</div>
            <div class="stu-btns" style="padding:0 18px 12px"><button class="btn btn-secondary btn-sm" data-edit><i class="fas fa-pen"></i> עריכת פרטים</button>
                <button class="btn btn-primary btn-sm" data-grades><i class="fas fa-edit"></i> הזנת בחינות</button></div>
            <div class="stu-lh"><b>מה נבחן</b><div class="stu-segc" id="stuSeg">${this.segHtml(exams)}</div></div>
            <div class="stu-list">${exams ? this.listHtml(exams) : '<div class="stu-empty">טוען...</div>'}</div>`;
    }

    segHtml(exams) {
        const n = (f) => (exams || []).filter(f).length;
        return [['taken', 'נבחן', n(e => e.passed !== null)], ['pending', 'טרם נבחן', n(e => e.passed === null)], ['all', 'הכל', (exams || []).length]]
            .map(([v, t, c]) => `<button data-seg="${v}" class="${this.seg === v ? 'on' : ''}">${t} ${exams ? `(${c})` : ''}</button>`).join('');
    }

    listHtml(exams) {
        const shown = exams.filter(e => this.seg === 'all' || (this.seg === 'taken') === (e.passed !== null));
        if (!shown.length) return `<div class="stu-empty">${this.seg === 'taken' ? 'התלמיד עדיין לא נבחן באף בחינה' : 'אין בחינות להצגה'}</div>`;
        const groups = new Map();
        shown.forEach(e => { const d = e.details || {}, k = `${e.exam_type}|${d.masechet}`; if (!groups.has(k)) groups.set(k, { d, t: e.exam_type, rows: [] }); groups.get(k).rows.push(e); });
        return [...groups.values()].map(g => `<div class="stu-gh"><b>${esc(g.d.masechet || 'כללי')}</b><span>${TYPE[g.t] || ''}</span><em>${g.rows.filter(e => e.passed).length}/${g.rows.length}</em></div>` +
            g.rows.map(e => {
                const d = e.details || {}, [txt, cls] = STATUS[e.passed];
                const what = e.exam_type === 'gemara' ? `${d.from_page || ''} – ${d.to_page || ''}` : `פרק ${d.chapter_name || d.chapter_num || ''}`;
                return `<div class="stu-r"><b>${esc(e.exam_code)}</b><span class="w">${esc(what)}${d.chapter_title ? ` <i>${esc(d.chapter_title)}</i>` : ''}</span>
                    <span class="stu-pill ${cls}">${txt}</span><span class="m">${e.passed ? money(e.reward_earned) : ''}</span><span class="dt">${heb(e.updated_at)}</span></div>`;
            }).join('')).join('');
    }

    // ============================================================
    //  הוספה / עריכה
    // ============================================================
    openForm(code = null) {
        const s = code ? this.find(code) : null;
        $('stuForm').reset();
        $('fOrig').value = s ? s.student_code : '';
        $('stuFormTitle').innerHTML = s ? '<i class="fas fa-pen"></i> עריכת פרטי תלמיד' : '<i class="fas fa-user-plus"></i> תלמיד חדש';
        $('fAddCode').style.display = s ? 'none' : '';
        $('fEditCode').style.display = s ? 'flex' : 'none';
        $('fCode').disabled = false;
        if (s) {
            $('fFirst').value = s.first_name || ''; $('fLast').value = s.last_name || ''; $('fClass').value = s.class_grade || '';
            $('fPhone').value = (s.phones || []).join(', '); $('fCurCode').textContent = s.student_code;
        }
        $('stuFormModal').classList.remove('hidden');
        setTimeout(() => $('fFirst').focus(), 50);
    }

    async save() {
        const orig = $('fOrig').value, btn = $('fSave'), label = btn.innerHTML;
        const body = { first_name: $('fFirst').value.trim(), last_name: $('fLast').value.trim(), class_grade: $('fClass').value.trim(),
                       phones: $('fPhone').value.split(/[,\s;]+/).filter(Boolean) };
        if (!orig && !$('fAuto').checked) {
            const c = $('fCode').value.trim();
            if (!c) return window.customAlert('יש להזין קוד תלמיד, או לסמן "הקצה קוד אוטומטית".', true);
            body.student_code = c;
        }
        btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> שומר...';
        const r = orig ? await this.call('PUT', `/students/${encodeURIComponent(orig)}`, body) : await this.call('POST', '/students', body);
        btn.disabled = false; btn.innerHTML = label;
        if (!r.ok) {
            const exists = r.status === 400 && /exists/i.test(this.errText(r, ''));
            return window.customAlert(exists ? 'קוד התלמיד כבר קיים במערכת. בחר קוד אחר.' : 'השמירה נכשלה: ' + this.errText(r, 'שגיאה לא ידועה'), true);
        }
        $('stuFormModal').classList.add('hidden');
        window.customAlert(orig ? 'פרטי התלמיד עודכנו.' : `התלמיד נוסף. קוד התלמיד: ${r.data.student_code}`);
        this.cards.clear();
        if (this.onRefresh) this.onRefresh();
    }

    async changeCode() {
        const old = $('fOrig').value;
        const next = await window.customPrompt(`הזן את הקוד החדש שיחליף את ${old}:`);
        if (next === null || !next.trim()) return;
        if (next.trim() === old) return window.customAlert('הקוד החדש זהה לקוד הקיים.', true);
        const r = await this.call('PUT', `/students/${encodeURIComponent(old)}/change-code`, { new_student_code: next.trim() });
        if (!r.ok) return window.customAlert(r.status === 409 ? 'הקוד החדש כבר תפוס על ידי תלמיד אחר.' : 'שינוי הקוד נכשל: ' + this.errText(r, 'נסה שוב'), true);
        $('stuFormModal').classList.add('hidden');
        window.customAlert(`הקוד שונה ל-${next.trim()} בכל רישומי המערכת.`);
        this.cards.clear(); this.closeCard();
        if (this.onRefresh) this.onRefresh();
    }

    exportCsv() {
        const lines = [['קוד', 'שם פרטי', 'שם משפחה', 'כיתה', 'טלפון', 'נבחן', 'מתוך', 'עברו', 'לא עברו', 'מלגה'].map(csv).join(',')];
        this.rowsData().forEach(s => {
            const st = this.stats(s);
            lines.push([s.student_code, s.first_name, s.last_name, s.class_grade, (s.phones || []).join(' / '), st.attempted, st.available ?? '', st.passed, Math.max(0, st.attempted - st.passed), st.reward].map(csv).join(','));
        });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' }));
        a.download = 'רשימת_תלמידים.csv';
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }

    // ============================================================
    //  חיבור אירועים (פעם אחת)
    // ============================================================
    bind() {
        const c = this.container;
        c.addEventListener('input', e => { if (e.target.id === 'stuText') { this.f.text = e.target.value; this.paint(); } });
        c.addEventListener('change', e => { if (e.target.id === 'stuCls') { this.f.cls = e.target.value; this.paint(); } });
        c.addEventListener('click', e => {
            const t = e.target;
            if (t.closest('#stuAdd')) return this.openForm();
            if (t.closest('#stuExport')) return this.exportCsv();
            if (t.closest('#stuNoneKpi')) { this.f.status = 'none'; this.render(this.students); return; }
            const seg = t.closest('#stuStatus button');
            if (seg) { this.f.status = seg.dataset.v; this.render(this.students); return; }
            const th = t.closest('th[data-k]');
            if (th) { this.f.dir = this.f.key === th.dataset.k ? -this.f.dir : 1; this.f.key = th.dataset.k; return this.paint(); }
            const tr = t.closest('#stuBody tr[data-code]');
            if (!tr) return;
            if (t.closest('[data-grades]')) { if (this.onGrades) this.onGrades(tr.dataset.code); return; }
            this.openCard(tr.dataset.code);
        });

        $('stuOv').addEventListener('click', () => this.closeCard());
        $('stuDr').addEventListener('click', e => {
            const t = e.target;
            if (t.closest('[data-close]')) return this.closeCard();
            if (t.closest('[data-edit]')) return this.openForm(this.cardCode);
            if (t.closest('[data-grades]')) { const code = this.cardCode; this.closeCard(); if (this.onGrades) this.onGrades(code); return; }
            const seg = t.closest('[data-seg]');
            if (seg) { this.seg = seg.dataset.seg; this.paintCard(); }
        });

        $('stuForm').addEventListener('submit', e => { e.preventDefault(); this.save(); });
        $('fAuto').addEventListener('change', e => { $('fCode').disabled = e.target.checked; if (e.target.checked) $('fCode').value = ''; });
        $('fChange').addEventListener('click', () => this.changeCode());
        $('stuFormClose').addEventListener('click', () => $('stuFormModal').classList.add('hidden'));
        $('fCancel').addEventListener('click', () => $('stuFormModal').classList.add('hidden'));
        document.addEventListener('keydown', e => {
            if (e.key !== 'Escape') return;
            if (!$('stuFormModal').classList.contains('hidden')) $('stuFormModal').classList.add('hidden');
            else if (this.cardCode) this.closeCard();
        });
    }

    // ---------- רכיבים קבועים (נטענים פעם אחת) ----------
    mount() {
        if ($('stuDr')) return;
        const f = (id, label, extra = '') => `<div class="stu-f"><label>${label}</label><input id="${id}" ${extra}></div>`;
        document.body.insertAdjacentHTML('beforeend', `
        <div id="stuOv" class="stu-ov"></div><aside id="stuDr" class="stu-dr" aria-label="כרטיס תלמיד"></aside>
        <div id="stuFormModal" class="modal hidden" style="z-index:9990"><div class="modal-content" style="max-width:520px;height:auto">
            <div class="modal-header"><h3 id="stuFormTitle"></h3><button class="close-modal-btn" id="stuFormClose">&times;</button></div>
            <form id="stuForm" class="modal-body stu-form" autocomplete="off">
                <input type="hidden" id="fOrig">
                <div class="stu-2">${f('fFirst', 'שם פרטי', 'required')}${f('fLast', 'שם משפחה', 'required')}</div>
                <div class="stu-2">${f('fClass', 'כיתה')}${f('fPhone', 'טלפון (אפשר כמה, מופרדים בפסיק)', 'placeholder="0501234567"')}</div>
                <div class="stu-box" id="fAddCode">${f('fCode', 'קוד תלמיד (ייחודי)', 'placeholder="הקש קוד רצוי"')}
                    <label class="stu-chk"><input type="checkbox" id="fAuto"> הקצה קוד עוקב אוטומטית</label></div>
                <div class="stu-box" id="fEditCode" style="display:none;justify-content:space-between;align-items:center">
                    <div><span class="stu-mut">קוד נוכחי</span><br><b id="fCurCode" style="font-size:1.2rem;color:var(--primary-color)"></b></div>
                    <button type="button" class="btn btn-secondary btn-sm" id="fChange"><i class="fas fa-exchange-alt"></i> החלף קוד</button></div>
                <div class="stu-btns" style="justify-content:flex-end"><button type="button" class="btn btn-outline" id="fCancel">ביטול</button>
                    <button type="submit" class="btn btn-primary" id="fSave"><i class="fas fa-save"></i> שמור</button></div>
            </form></div></div>`);
    }

    css() {
        if ($('stuStyles')) return;
        const st = document.createElement('style');
        st.id = 'stuStyles';
        st.textContent = `
        .stu-root{display:flex;flex-direction:column;height:100%;min-height:0;gap:10px}
        .stu-card{background:#fff;border:1px solid var(--border-color);border-radius:10px;box-shadow:0 1px 3px rgba(0,0,0,.04)}
        .stu-head{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;padding:12px 16px}
        .stu-head h3{margin:0 0 6px;font-size:1.1rem;display:flex;gap:8px;align-items:center}.stu-head h3 i{color:var(--primary-color)}
        .stu-btns{display:flex;gap:8px;flex-wrap:wrap}.stu-kpis{display:flex;gap:6px;flex-wrap:wrap}
        .stu-kpi{background:#f1f5f9;border:1px solid var(--border-color);border-radius:999px;padding:2px 11px;font-size:.76rem;color:#475569;font-weight:600}
        .stu-kpi b{color:#0f172a}.stu-kpi.click{cursor:pointer;background:#fffbeb;border-color:#fde68a}.stu-kpi.click:hover{background:#fef3c7}
        .stu-tools{display:flex;gap:10px;flex-wrap:wrap;align-items:center;padding:10px 16px}
        .stu-search{position:relative;flex:1;min-width:200px}.stu-search i{position:absolute;right:11px;top:50%;transform:translateY(-50%);color:#94a3b8;font-size:.85rem}
        .stu-search input{width:100%;padding:7px 32px 7px 10px;border:1px solid var(--border-color);border-radius:8px;background:#f8fafc;outline:none}
        .stu-search input:focus{border-color:var(--primary-color);background:#fff}
        .stu-sel{padding:6px 9px;border:1px solid var(--border-color);border-radius:8px;background:#fff;outline:none}
        .stu-segc{display:inline-flex;border:1px solid var(--border-color);border-radius:8px;overflow:hidden;background:#fff}
        .stu-segc button{border:none;background:none;padding:6px 12px;font-size:.82rem;font-weight:600;color:#475569;cursor:pointer}
        .stu-segc button+button{border-right:1px solid var(--border-color)}.stu-segc button.on{background:var(--primary-color);color:#fff}
        .stu-wrap{flex:1;min-height:0;overflow:auto}
        .stu-table{width:100%;border-collapse:separate;border-spacing:0;font-size:.87rem}
        .stu-table th{position:sticky;top:0;z-index:2;background:#f1f5f9;color:#475569;font-size:.76rem;text-align:right;padding:9px 10px;border-bottom:1px solid var(--border-color);white-space:nowrap}
        .stu-table th[data-k]{cursor:pointer}.stu-table th.sorted::after{content:' ' attr(data-dir);color:var(--primary-color)}
        .stu-table td{padding:8px 10px;border-bottom:1px solid #eef2f7;vertical-align:middle}
        .stu-table tbody tr[data-code]{cursor:pointer}.stu-table tbody tr:hover{background:#f8fafc}
        .stu-code{font-weight:800}.stu-mut{color:#64748b;font-size:.82rem}.stu-ok{color:#047857;font-weight:700}.stu-money{color:#0369a1;font-weight:700;white-space:nowrap}
        .stu-cls{background:#f8fafc;border:1px solid var(--border-color);border-radius:6px;padding:1px 9px;font-size:.78rem;font-weight:600}
        .stu-bar{display:flex;align-items:center;gap:8px;min-width:150px}.stu-bar>div{flex:1;height:6px;background:#e2e8f0;border-radius:9px;overflow:hidden;min-width:50px}
        .stu-bar i{display:block;height:100%;background:linear-gradient(90deg,#3b82f6,#6366f1)}.stu-bar span{font-size:.76rem;color:#64748b;white-space:nowrap}
        .stu-empty{text-align:center;padding:30px 10px;color:var(--text-muted)}
        .stu-ov{position:fixed;inset:0;background:rgba(15,23,42,.35);z-index:9979;opacity:0;pointer-events:none;transition:opacity .2s}.stu-ov.open{opacity:1;pointer-events:auto}
        .stu-dr{position:fixed;top:0;bottom:0;left:0;width:min(560px,96vw);background:#fff;z-index:9980;transform:translateX(-102%);transition:transform .25s;display:flex;flex-direction:column;box-shadow:8px 0 30px rgba(15,23,42,.2)}
        .stu-dr.open{transform:none}
        .stu-dh{display:flex;gap:14px;align-items:center;padding:16px 18px;border-bottom:1px solid var(--border-color)}
        .stu-av{width:52px;height:52px;border-radius:50%;background:var(--primary-color);color:#fff;font-size:1.5rem;font-weight:800;display:flex;align-items:center;justify-content:center;flex:none}
        .stu-id{flex:1;min-width:0}.stu-id h2{margin:0 0 5px;font-size:1.25rem}.stu-tags{display:flex;gap:6px;flex-wrap:wrap}
        .stu-tags span{background:#f1f5f9;border-radius:6px;padding:1px 8px;font-size:.78rem;color:#475569}
        .stu-x{border:none;background:none;font-size:1.6rem;color:#94a3b8;cursor:pointer}.stu-x:hover{color:#0f172a}
        .stu-tiles{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;padding:14px 18px}
        .stu-tile{background:#f8fafc;border:1px solid var(--border-color);border-radius:10px;padding:9px 6px;text-align:center}
        .stu-tile b{display:block;font-size:1.05rem;color:#0f172a}.stu-tile span{font-size:.72rem;color:#64748b}
        .stu-tile.ok{background:#ecfdf5;border-color:#a7f3d0}.stu-tile.ok b{color:#047857}.stu-tile.bad{background:#fef2f2;border-color:#fecaca}.stu-tile.bad b{color:#dc2626}.stu-tile.money b{color:#0369a1}
        .stu-lh{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:8px 18px;border-top:1px solid var(--border-color);background:#f8fafc}
        .stu-list{flex:1;overflow:auto;padding:0 0 16px}
        .stu-gh{display:flex;align-items:center;gap:8px;padding:8px 18px;background:#1e293b;color:#fff;font-size:.85rem;position:sticky;top:0}
        .stu-gh span{border:1px solid #fff;border-radius:99px;padding:0 8px;font-size:.7rem}.stu-gh em{margin-right:auto;font-style:normal;opacity:.85}
        .stu-r{display:grid;grid-template-columns:48px 1fr auto 54px 70px;gap:8px;align-items:center;padding:7px 18px;border-bottom:1px solid #eef2f7;font-size:.84rem}
        .stu-r:nth-child(even){background:#f8fafc}.stu-r .w i{color:#64748b;font-style:normal}.stu-r .m{color:#0369a1;font-weight:700;text-align:left}.stu-r .dt{color:#64748b;font-size:.75rem;text-align:left}
        .stu-pill{border-radius:99px;padding:1px 9px;font-size:.74rem;font-weight:700;white-space:nowrap}
        .stu-pill.ok{background:#d1fae5;color:#047857}.stu-pill.bad{background:#fee2e2;color:#b91c1c}.stu-pill.none{background:#f1f5f9;color:#64748b}
        .stu-form{padding:18px;display:flex;flex-direction:column;gap:14px}.stu-2{display:grid;grid-template-columns:1fr 1fr;gap:12px}
        .stu-f label{display:block;margin-bottom:4px;font-size:.8rem;font-weight:600;color:#475569}
        .stu-f input{width:100%;padding:8px;border:1px solid var(--border-color);border-radius:6px;outline:none}.stu-f input:focus{border-color:var(--primary-color)}
        .stu-box{background:#f8fafc;border:1px solid var(--border-color);border-radius:8px;padding:12px;display:flex;flex-direction:column;gap:8px}
        .stu-chk{display:flex;gap:8px;align-items:center;font-size:.85rem;cursor:pointer}
        @media(max-width:700px){.stu-2{grid-template-columns:1fr}.stu-tiles{grid-template-columns:1fr 1fr}.stu-r{grid-template-columns:44px 1fr auto}.stu-r .m,.stu-r .dt{display:none}}`;
        document.head.appendChild(st);
    }
}
