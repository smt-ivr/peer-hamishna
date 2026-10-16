// ============================================================
//  client-exam-update.js — הזנת ציונים לתלמיד
//  new ExamUpdateManager(apiBase, container, onSwitchStudent, onChanged)
//
//  הלוגיקה כמו תמיד: שורות של [חיפוש קוד בחינה + עבר / לא עבר]. אפשר להוסיף שורה בלי לסמן סטטוס,
//  ולשמור רק כשכל שורה שהתחילו למלא שלמה. בחינה שכבר רשומה מסומנת באזהרה, ודורסים אותה רק בכפתור "דרוס".
// ============================================================
import { formatHebrewDate } from './client-reports.js';

const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = v => '₪' + (Number(v) || 0).toFixed(1);
const heb = ts => { const d = new Date(String(ts || '').replace(' ', 'T')); return isNaN(d) ? '' : formatHebrewDate(d).split(' ').slice(0, -1).join(' '); };
const $ = id => document.getElementById(id);
const TYPE = { mishnayot: 'משניות', gemara: 'גמרא' };

export class ExamUpdateManager {
    constructor(apiBase, container, onSwitch, onChanged) {
        Object.assign(this, { apiBase, container, onSwitch, onChanged });
        this.allExams = []; this.exMap = new Map();
        this.student = null; this.rows = []; this.nextId = 1; this.report = null; this.hSeg = 'all'; this.hQ = '';
        this.css();
        this.bind();
    }

    setExams(exams) { this.allExams = exams || []; this.exMap = new Map(this.allExams.map(e => [e.exam_code, e])); }

    async call(method, path, body) {
        const opt = { method, silent: true };     // silent: השגיאות מוצגות כאן, לא כטוסט גלובלי
        if (body !== undefined) { opt.headers = { 'Content-Type': 'application/json' }; opt.body = JSON.stringify(body); }
        try {
            const res = await fetch(`${this.apiBase}${path}`, opt);
            return { ok: res.ok, status: res.status, data: await res.json().catch(() => null) };
        } catch (e) { return { ok: false, status: 0, data: { message: 'שגיאת תקשורת מול השרת. בדוק את החיבור ונסה שוב.' } }; }
    }
    errText(r, fb) { return (r.data && (r.data.message || r.data.error)) || fb; }

    // ============================================================
    //  טעינת תלמיד
    // ============================================================
    async loadStudentData(code, silent = false) {
        if (!silent) {
            this.container.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i> טוען נתוני תלמיד...</div>';
            this.container.classList.remove('hidden');
        }
        const r = await this.call('GET', `/student-summary?student_code=${encodeURIComponent(code)}`);
        const me = r.ok && Array.isArray(r.data) ? r.data[0] : null;
        if (!me) {
            if (!silent) this.container.innerHTML = `<div class="ge-fail">${esc(r.ok ? 'לא נמצא תלמיד עם הקוד הזה.' : this.errText(r, 'שגיאה בטעינת נתוני התלמיד.'))}<br><button class="btn btn-outline btn-sm" id="geBack">חזרה לחיפוש</button></div>`;
            return;
        }
        this.student = me;
        if (silent) { this.paintTop(); this.paintHist(); this.refreshRows(); return; }
        this.rows = [this.newRow()]; this.report = null;
        this.render();
    }

    newRow() { return { id: this.nextId++, code: '', status: null, force: false, note: '' }; }
    mine(code) { return this.student && this.student.exams.find(e => e.exam_code === code); }
    desc(ex) {
        const d = ex.details || {};
        return ex.exam_type === 'gemara' ? `${d.masechet || ''} · ${d.from_page || ''} – ${d.to_page || ''}${d.chapter_title ? ` · ${d.chapter_title}` : ''}`
            : `${d.masechet || ''} · פרק ${d.chapter_name || d.chapter_num || ''}${d.chapter_title ? ` · ${d.chapter_title}` : ''}`;
    }

    // ============================================================
    //  שלד המסך
    // ============================================================
    render() {
        Object.assign(this.container.style, { display: 'flex', flexDirection: 'column', flex: '1', minHeight: '0' });
        this.container.innerHTML = `
        <div class="ge-root">
            <div class="ge-card ge-top" id="geTop"></div>
            <div class="ge-main">
                <section class="ge-card ge-entry">
                    <div class="ge-eh">
                        <div><h3><i class="fas fa-file-signature"></i> דיווח והזנת בחינות</h3>
                            <p>בחר קוד וסטטוס (עבר / לא עבר). חובה לבחור את הסטטוס.</p>
                            <p class="ge-caution"><i class="fas fa-info-circle"></i> שים לב: הנתונים לא נשמרים עד לחיצה על לחצן השמירה.</p></div>
                        <button type="button" class="btn btn-outline btn-sm ge-add" id="geAddRow"><i class="fas fa-plus"></i> הוסף שורה</button>
                    </div>
                    <form id="geForm" class="ge-form" autocomplete="off">
                        <div class="ge-rows" id="geRows"></div>
                        <div id="geReport"></div>
                        <div class="ge-foot"><span class="ge-fh" id="geFootHint"></span>
                            <button type="submit" class="btn btn-primary ge-save" id="geSave" disabled><i class="fas fa-save"></i> שמור עדכונים במערכת</button></div>
                    </form>
                </section>
                <aside class="ge-card ge-hist">
                    <div class="ge-eh"><h3><i class="fas fa-history"></i> מה כבר נבחן <em id="geHCount"></em></h3></div>
                    <div class="ge-htools"><input id="geHQ" placeholder="חיפוש..." autocomplete="off"><div class="ge-seg" id="geHSeg"></div></div>
                    <div class="ge-hlist" id="geHList"></div>
                </aside>
            </div>
        </div>`;
        this.paintTop(); this.paintHist(); this.paintRows(); this.paintReport();
    }

    paintTop() {
        const s = this.student, st = s.stats || {}, name = `${s.first_name || ''} ${s.last_name || ''}`.trim();
        const tile = (v, l, c = '') => `<div class="ge-tile ${c}"><b>${v}</b><span>${l}</span></div>`;
        $('geTop').innerHTML = `
            <div class="ge-av">${esc((s.first_name || '?').charAt(0))}</div>
            <div class="ge-id"><h2>${esc(name)}</h2><div class="ge-tags"><span>כיתה ${esc(s.class_grade || '-')}</span><span>קוד ${esc(s.student_code)}</span></div></div>
            <div class="ge-tiles">${tile(`${st.total_attempted ?? 0} מתוך ${st.total_available_exams ?? 0}`, 'נבחן')}${tile(st.total_passed ?? 0, 'עברו', 'ok')}${tile(Math.max(0, (st.total_attempted ?? 0) - (st.total_passed ?? 0)), 'לא עברו', 'bad')}${tile(money(st.total_reward), 'מלגה', 'money')}</div>
            <button type="button" class="btn btn-outline btn-sm" id="geSwitch"><i class="fas fa-exchange-alt"></i> החלף תלמיד</button>`;
    }

    // ============================================================
    //  שורות ההזנה
    // ============================================================
    paintRows() {
        $('geRows').innerHTML = this.rows.map(r => this.rowHtml(r)).join('');
        this.refreshRows();
    }

    rowHtml(r) {
        return `<div class="ge-row" data-id="${r.id}">
            <div class="ge-n"></div>
            <div class="ge-rb">
                <div class="ge-det"></div>
                <div class="ge-codewrap"><input type="text" class="ge-code" value="${esc(r.code)}" placeholder="חיפוש קוד או נושא..." autocomplete="off"><div class="ge-sug hidden"></div></div>
                <div class="ge-warn"></div>
            </div>
            <div class="ge-tog"><button type="button" data-st="true"><i class="fas fa-check"></i> עבר</button><button type="button" data-st="false"><i class="fas fa-times"></i> לא עבר</button></div>
            <button type="button" class="ge-x" data-rm title="הסר שורה"><i class="fas fa-trash"></i></button></div>`;
    }

    // מצב כל שורה: איזו בחינה, האם כבר רשומה, האם מיועדת לכיתה גבוהה
    info(r) {
        const ex = this.exMap.get(r.code), mine = ex ? this.mine(r.code) : null;
        return { ex, existing: mine && mine.passed !== null ? mine : null, restricted: ex && !mine ? ex.target_grade : '' };
    }

    // מעדכן את מה שמוצג בשורה (בלי לבנות אותה מחדש — כדי לא לאבד פוקוס בזמן הקלדה)
    fillRow(r) {
        const el = this.container.querySelector(`.ge-row[data-id="${r.id}"]`);
        if (!el) return;
        const i = this.info(r);
        el.querySelector('.ge-det').innerHTML = i.ex
            ? `<span class="ge-ty ${i.ex.exam_type === 'gemara' ? 'g' : 'm'}">${TYPE[i.ex.exam_type] || ''}</span> ${esc(this.desc(i.ex))}`
            : '<span class="ge-mut">בחר בחינה מהרשימה</span>';
        let warn = '';
        if (i.existing) {
            warn = `<div class="ge-wl"><span class="ge-ex"><i class="fas fa-exclamation-triangle"></i> כבר עודכן (${i.existing.passed ? 'עבר' : 'לא עבר'})</span>
                <button type="button" class="ge-ow ${r.force ? 'on' : ''}" data-ow aria-pressed="${r.force}"><i class="fas fa-eraser"></i> ${r.force ? 'יידרס בשמירה' : 'דרוס את הציון הקיים'}</button></div>`;
        }
        if (i.restricted) warn += `<div class="ge-wl"><span class="ge-bad"><i class="fas fa-ban"></i> הבחינה מיועדת לכיתה ${esc(i.restricted)} ומעלה</span></div>`;
        if (r.note) warn += `<div class="ge-wl"><span class="ge-bad"><i class="fas fa-times-circle"></i> ${esc(r.note)}</span></div>`;
        el.querySelector('.ge-warn').innerHTML = warn;
        el.classList.toggle('has-warn', !!i.existing || !!i.restricted);
        el.classList.toggle('has-ow', !!(i.existing && r.force));
        el.classList.toggle('has-err', !!r.note || !!i.restricted);
        el.classList.toggle('done', !!(r.code && r.status !== null));
        el.querySelectorAll('[data-st]').forEach(b => b.classList.toggle('on', r.status !== null && b.dataset.st === String(r.status)));
    }

    refreshRows() {
        this.rows.forEach((r, n) => {
            this.fillRow(r);
            const el = this.container.querySelector(`.ge-row[data-id="${r.id}"]`);
            if (el) { el.querySelector('.ge-n').textContent = n + 1; el.querySelector('[data-rm]').disabled = this.rows.length === 1; }
        });
        this.updateSave();
    }

    // כמו תמיד: שומרים רק כשיש לפחות שורה שלמה ואין שורה חלקית
    updateSave() {
        const btn = $('geSave');
        if (!btn) return;
        const valid = this.rows.filter(r => r.code && r.status !== null).length;
        const partial = this.rows.some(r => (r.code || r.status !== null) && !(r.code && r.status !== null));
        const ok = valid > 0 && !partial;
        btn.disabled = !ok;
        btn.innerHTML = `<i class="fas fa-save"></i> ${ok ? `שמור ${valid} ${valid === 1 ? 'עדכון' : 'עדכונים'} במערכת` : 'שמור עדכונים במערכת'}`;
        $('geFootHint').textContent = partial ? 'יש שורה שלא הושלמה: חסר קוד או סטטוס' : (ok ? '' : 'הוסף בחינה כדי לשמור');
    }

    // ---------- הצעות בזמן הקלדה ----------
    showSug(r, el) {
        const box = el.querySelector('.ge-sug'), term = r.code.trim();
        if (!term) { box.classList.add('hidden'); box.innerHTML = ''; return; }
        const list = this.allExams.filter(ex => ex.exam_code.includes(term) || Object.values(ex.details || {}).some(v => String(v ?? '').includes(term))).slice(0, 10);
        box.innerHTML = list.length ? list.map(ex => {
            const mine = this.mine(ex.exam_code), tag = !mine ? '<i class="bad">לכיתה גבוהה</i>' : (mine.passed === null ? '' : `<i class="${mine.passed ? 'ok' : 'bad'}">${mine.passed ? '✓ עבר' : '✕ לא עבר'}</i>`);
            return `<div class="ge-sg" data-code="${esc(ex.exam_code)}"><b>${esc(ex.exam_code)}</b><span>${esc(this.desc(ex))}</span>${tag}</div>`;
        }).join('') : '<div class="ge-sg none">לא נמצאו בחינות</div>';
        box.classList.remove('hidden');
    }

    addRow() {
        const r = this.newRow();
        this.rows.push(r);
        $('geRows').insertAdjacentHTML('beforeend', this.rowHtml(r));
        this.refreshRows();
        const inp = this.container.querySelector(`.ge-row[data-id="${r.id}"] .ge-code`);
        if (inp) { inp.focus(); inp.scrollIntoView({ block: 'nearest' }); }
    }

    // ============================================================
    //  שמירה
    // ============================================================
    async save() {
        const send = this.rows.filter(r => r.code && r.status !== null);
        const btn = $('geSave');
        if (!send.length || btn.disabled) return;
        btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> מעדכן...';
        this.report = null; this.paintReport();

        const r = await this.call('POST', '/student-exams', {
            student_code: this.student.student_code,
            exams: send.map(x => (x.force ? { exam_code: x.code, passed: x.status, force_update: true } : { exam_code: x.code, passed: x.status }))
        });
        if (!r.ok) { this.report = { error: this.errText(r, 'שגיאת מערכת, הנתונים לא נשמרו.') }; this.paintReport(); return this.updateSave(); }

        const { updated = [], skipped = [], errors = [] } = r.data || {};
        this.report = { updated, skipped, errors };
        // שורות שנקלטו — יורדות. שורות שדולגו / נכשלו נשארות עם הסיבה, כדי שאפשר יהיה לתקן (למשל לסמן "דרוס")
        const problem = new Map([...skipped, ...errors].map(x => [x.exam_code, x.reason]));
        const keep = this.rows.filter(row => problem.has(row.code));
        keep.forEach(row => { row.note = problem.get(row.code); });
        this.rows = keep.length ? keep : [this.newRow()];
        await this.loadStudentData(this.student.student_code, true);
        this.paintRows(); this.paintReport();
        if (this.onChanged) { clearTimeout(this._t); this._t = setTimeout(() => this.onChanged(), 1500); }
    }

    paintReport() {
        const el = $('geReport'), r = this.report;
        if (!el) return;
        if (!r) { el.innerHTML = ''; return; }
        if (r.error) { el.innerHTML = `<div class="ge-rep bad"><div><b><i class="fas fa-times-circle"></i> לא נשמר</b><div>${esc(r.error)}</div></div><button type="button" data-rx aria-label="סגור">&times;</button></div>`; return; }
        const grp = (cls, icon, title, items, line) => items.length ? `<div class="ge-rg ${cls}"><b><i class="fas ${icon}"></i> ${title} (${items.length})</b><ul>${items.map(line).join('')}</ul></div>` : '';
        el.innerHTML = `<div class="ge-rep"><div class="ge-rgs"><div class="ge-rt">סיכום עדכון</div>
            ${grp('ok', 'fa-check-circle', 'נקלט בהצלחה', r.updated, i => `<li>בחינה ${esc(i.exam_code)} · ${esc(i.status)}</li>`)}
            ${grp('warn', 'fa-info-circle', 'דולגו', r.skipped, i => `<li>בחינה ${esc(i.exam_code)}: ${esc(i.reason)}</li>`)}
            ${grp('bad', 'fa-times-circle', 'שגיאות', r.errors, i => `<li>בחינה ${esc(i.exam_code)}: ${esc(i.reason)}</li>`)}</div>
            <button type="button" data-rx aria-label="סגור">&times;</button></div>`;
    }

    // ============================================================
    //  "מה כבר נבחן" (צד) — צפייה בלבד
    // ============================================================
    paintHist() {
        if (!$('geHList')) return;
        const all = this.student.exams.filter(e => e.passed !== null), q = this.hQ.trim().toLowerCase();
        const rows = all.filter(e => (this.hSeg === 'all' || (this.hSeg === 'pass') === e.passed) && (!q || `${e.exam_code} ${Object.values(e.details || {}).join(' ')}`.toLowerCase().includes(q)));
        $('geHCount').textContent = `(${all.length})`;
        $('geHSeg').innerHTML = [['all', 'הכל'], ['pass', 'עבר'], ['fail', 'לא עבר']].map(([v, t]) => `<button type="button" data-hseg="${v}" class="${this.hSeg === v ? 'on' : ''}">${t}</button>`).join('');
        const groups = new Map();
        rows.forEach(e => { const k = (e.details || {}).masechet || 'כללי'; (groups.get(k) || groups.set(k, []).get(k)).push(e); });
        $('geHList').innerHTML = rows.length ? [...groups].map(([m, list]) => `<div class="ge-gh">${esc(m)}<em>${list.filter(e => e.passed).length}/${list.length}</em></div>` + list.map(e => `
            <div class="ge-hr"><b>${esc(e.exam_code)}</b><span class="w">${esc(this.desc(e).split(' · ').slice(1).join(' · '))}</span>
                <span class="ge-pill ${e.passed ? 'ok' : 'bad'}">${e.passed ? '✓ עבר' : '✕ לא עבר'}</span><span class="dt">${heb(e.updated_at)}</span></div>`).join('')).join('')
            : `<div class="ge-empty">${all.length ? 'לא נמצאו תוצאות' : 'התלמיד עדיין לא נבחן באף בחינה'}</div>`;
    }

    // ============================================================
    //  אירועים (פעם אחת, על המיכל)
    // ============================================================
    bind() {
        const c = this.container, rowOf = t => { const el = t.closest('.ge-row'); return el ? { el, r: this.rows.find(x => x.id === +el.dataset.id) } : {}; };

        c.addEventListener('input', e => {
            if (e.target.id === 'geHQ') { this.hQ = e.target.value; return this.paintHist(); }
            if (!e.target.classList.contains('ge-code')) return;
            const { el, r } = rowOf(e.target);
            r.code = e.target.value.trim(); r.note = '';
            if (!r.code) { r.status = null; r.force = false; }        // כמו תמיד: מחיקת הקוד מאפסת את הסטטוס
            this.fillRow(r); this.showSug(r, el); this.updateSave();
        });

        c.addEventListener('submit', e => { if (e.target.id === 'geForm') { e.preventDefault(); this.save(); } });

        c.addEventListener('click', e => {
            const t = e.target;
            if (t.closest('#geSwitch') || t.closest('#geBack')) return this.onSwitch && this.onSwitch();
            if (t.closest('#geAddRow')) return this.addRow();
            if (t.closest('[data-rx]')) { this.report = null; return this.paintReport(); }
            const hs = t.closest('[data-hseg]');
            if (hs) { this.hSeg = hs.dataset.hseg; return this.paintHist(); }

            const sg = t.closest('.ge-sg[data-code]');
            if (sg) {
                const { el, r } = rowOf(sg);
                r.code = sg.dataset.code; r.note = '';
                el.querySelector('.ge-code').value = r.code;
                el.querySelector('.ge-sug').classList.add('hidden');
                return this.refreshRows();
            }
            const { el, r } = rowOf(t);
            if (r) {
                const st = t.closest('[data-st]');
                if (st) { r.status = st.dataset.st === 'true'; r.note = ''; return this.refreshRows(); }
                if (t.closest('[data-ow]')) { r.force = !r.force; return this.refreshRows(); }
                if (t.closest('[data-rm]')) {
                    this.rows = this.rows.filter(x => x.id !== r.id); el.remove();
                    if (!this.rows.length) { this.addRow(); return; }
                    return this.refreshRows();
                }
            }
            if (!t.closest('.ge-codewrap')) c.querySelectorAll('.ge-sug').forEach(b => b.classList.add('hidden'));   // לחיצה מחוץ להצעות סוגרת אותן
        });
    }

    css() {
        if ($('geStyles')) return;
        const st = document.createElement('style');
        st.id = 'geStyles';
        st.textContent = `
        .ge-root{display:flex;flex-direction:column;gap:10px;height:100%;min-height:0}
        .ge-card{background:#fff;border:1px solid var(--border-color);border-radius:12px;box-shadow:0 1px 3px rgba(0,0,0,.04)}
        .ge-top{display:flex;align-items:center;gap:14px;padding:12px 16px;flex-wrap:wrap;flex:none}
        .ge-av{width:48px;height:48px;border-radius:50%;background:var(--primary-color);color:#fff;font-size:1.4rem;font-weight:800;display:flex;align-items:center;justify-content:center;flex:none}
        .ge-id{flex:1;min-width:160px}.ge-id h2{margin:0 0 4px;font-size:1.2rem}.ge-tags{display:flex;gap:6px}.ge-tags span{background:#f1f5f9;border-radius:6px;padding:1px 9px;font-size:.78rem;color:#475569}
        .ge-tiles{display:flex;gap:8px}.ge-tile{background:#f8fafc;border:1px solid var(--border-color);border-radius:10px;padding:6px 14px;text-align:center;min-width:76px}
        .ge-tile b{display:block;font-size:1rem}.ge-tile span{font-size:.7rem;color:#64748b}.ge-tile.ok{background:#ecfdf5;border-color:#a7f3d0}.ge-tile.ok b{color:#047857}
        .ge-tile.bad{background:#fef2f2;border-color:#fecaca}.ge-tile.bad b{color:#dc2626}.ge-tile.money b{color:#0369a1}
        .ge-main{display:grid;grid-template-columns:minmax(0,1fr) 360px;gap:10px;flex:1;min-height:0}
        .ge-entry,.ge-hist{display:flex;flex-direction:column;min-height:0;overflow:hidden}
        .ge-eh{padding:14px 18px 6px;display:flex;justify-content:space-between;align-items:flex-start;gap:10px}.ge-eh h3{margin:0 0 3px;font-size:1.05rem;display:flex;gap:8px;align-items:center}.ge-eh h3 i{color:var(--primary-color)}.ge-eh em{font-style:normal;color:#94a3b8;font-weight:600}
        .ge-eh p{margin:0;font-size:.8rem;color:#64748b}.ge-eh p.ge-caution{color:#b45309;font-weight:600;margin-top:2px}
        .ge-add{border-style:dashed;border-color:var(--primary-color);color:var(--primary-color);flex:none}
        .ge-form{display:flex;flex-direction:column;flex:1;min-height:0}
        .ge-rows{flex:1;overflow:auto;padding:6px 16px 120px;display:flex;flex-direction:column;gap:10px}
        .ge-row{display:grid;grid-template-columns:30px 1fr auto 32px;gap:12px;align-items:center;background:#fff;border:1px solid var(--border-color);border-radius:12px;padding:12px 14px;transition:border-color .15s,box-shadow .15s}
        .ge-row:focus-within{border-color:var(--primary-color);box-shadow:0 0 0 3px rgba(37,99,235,.08)}
        .ge-row.done{border-right:4px solid #10b981}.ge-row.has-warn{background:#fffbeb;border-color:#fcd34d}.ge-row.has-ow{background:#fef2f2;border-color:#f87171}.ge-row.has-err{border-color:#fca5a5}
        .ge-n{width:26px;height:26px;border-radius:50%;background:#e2e8f0;color:#475569;font-size:.78rem;font-weight:800;display:flex;align-items:center;justify-content:center}
        .ge-rb{display:flex;flex-direction:column;gap:6px;min-width:0}
        .ge-det{min-height:20px;font-size:.88rem;font-weight:600;color:var(--primary-color);display:flex;gap:8px;align-items:center;flex-wrap:wrap}.ge-mut{color:#94a3b8;font-weight:500}
        .ge-ty{border-radius:99px;padding:0 9px;font-size:.7rem;font-weight:800;border:1px solid}.ge-ty.m{background:#eff6ff;color:#1d4ed8;border-color:#bfdbfe}.ge-ty.g{background:#fffbeb;color:#92400e;border-color:#fde68a}
        .ge-codewrap{position:relative}.ge-code{width:100%;padding:9px 12px;font-size:.95rem;border:1px solid var(--border-color);border-radius:9px;outline:none;background:#f8fafc}
        .ge-code:focus{border-color:var(--primary-color);background:#fff}
        .ge-sug{position:absolute;top:calc(100% + 4px);right:0;left:0;background:#fff;border:1px solid var(--border-color);border-radius:10px;box-shadow:0 12px 30px rgba(15,23,42,.15);z-index:20;overflow:hidden;max-height:300px;overflow-y:auto}
        .ge-sg{display:flex;gap:10px;align-items:center;padding:8px 12px;cursor:pointer;font-size:.86rem}.ge-sg b{min-width:42px}.ge-sg span{flex:1;color:#475569;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.ge-sg:hover{background:#eff6ff}.ge-sg.none{color:#94a3b8;cursor:default;justify-content:center}.ge-sg.none:hover{background:none}
        .ge-sg i{font-style:normal;font-size:.72rem;font-weight:700}i.ok{color:#047857}i.bad{color:#b91c1c}
        .ge-warn{display:flex;flex-direction:column;gap:6px}.ge-warn:empty{display:none}
        .ge-wl{display:flex;gap:10px;align-items:center;flex-wrap:wrap;font-size:.82rem}.ge-ex{color:#b45309;font-weight:700}.ge-bad{color:#b91c1c;font-weight:700}
        .ge-ow{border:2px solid #dc2626;background:#fff;color:#b91c1c;border-radius:9px;padding:3px 12px;font-weight:800;font-size:.8rem;cursor:pointer;display:inline-flex;gap:6px;align-items:center;transition:.15s}
        .ge-ow:hover{background:#fef2f2}.ge-ow.on{background:#dc2626;color:#fff}
        .ge-tog{display:inline-flex;gap:6px}.ge-tog button{border:2px solid var(--border-color);background:#fff;border-radius:10px;padding:8px 16px;font-weight:800;font-size:.86rem;cursor:pointer;color:#64748b;display:inline-flex;gap:6px;align-items:center;transition:.15s}
        .ge-tog button:hover{background:#f8fafc}.ge-tog button.on[data-st=true]{background:#059669;border-color:#059669;color:#fff}.ge-tog button.on[data-st=false]{background:#dc2626;border-color:#dc2626;color:#fff}
        .ge-x{border:none;background:none;color:#cbd5e1;cursor:pointer;font-size:.95rem}.ge-x:hover:not(:disabled){color:#dc2626}.ge-x:disabled{opacity:.4;cursor:default}
        .ge-foot{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:12px 18px;border-top:1px solid var(--border-color);background:#f8fafc;flex:none}
        .ge-fh{font-size:.8rem;color:#b45309;font-weight:600}.ge-save{padding:9px 22px;font-weight:800}
        #geReport{flex:none;padding:0 16px 10px}.ge-rep{display:flex;gap:12px;align-items:flex-start;border:1px solid var(--border-color);border-radius:12px;padding:10px 14px;background:#fff;font-size:.85rem}
        .ge-rep.bad{background:#fef2f2;border-color:#fecaca;color:#991b1b}.ge-rep>button{border:none;background:none;font-size:1.3rem;cursor:pointer;color:#94a3b8}.ge-rgs{flex:1;display:flex;flex-direction:column;gap:6px}.ge-rt{font-weight:800}
        .ge-rg ul{margin:3px 18px 0;padding:0}.ge-rg.ok{color:#047857}.ge-rg.warn{color:#b45309}.ge-rg.bad{color:#b91c1c}
        .ge-htools{padding:6px 14px;display:flex;flex-direction:column;gap:6px}.ge-htools input{padding:6px 10px;border:1px solid var(--border-color);border-radius:8px;outline:none;background:#f8fafc}
        .ge-seg{display:inline-flex;border:1px solid var(--border-color);border-radius:8px;overflow:hidden;align-self:flex-start}.ge-seg button{border:none;background:#fff;padding:3px 12px;font-size:.78rem;font-weight:600;cursor:pointer;color:#475569}.ge-seg button+button{border-right:1px solid var(--border-color)}.ge-seg button.on{background:var(--primary-color);color:#fff}
        .ge-hlist{flex:1;overflow:auto}.ge-gh{background:#1e293b;color:#fff;padding:5px 14px;font-size:.8rem;display:flex;justify-content:space-between;position:sticky;top:0}.ge-gh em{font-style:normal;opacity:.8}
        .ge-hr{display:grid;grid-template-columns:42px 1fr auto 52px;gap:6px;align-items:center;padding:5px 14px;border-bottom:1px solid #eef2f7;font-size:.8rem}.ge-hr:nth-child(even){background:#f8fafc}
        .ge-hr .w{color:#64748b;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.ge-hr .dt{color:#94a3b8;font-size:.7rem;text-align:left}
        .ge-pill{border-radius:99px;padding:0 8px;font-size:.7rem;font-weight:700}.ge-pill.ok{background:#d1fae5;color:#047857}.ge-pill.bad{background:#fee2e2;color:#b91c1c}
        .ge-empty{padding:26px 10px;text-align:center;color:#94a3b8;font-size:.85rem}.ge-fail{padding:30px;text-align:center;color:#991b1b}
        @media(max-width:1000px){.ge-main{grid-template-columns:1fr}.ge-hist{max-height:320px}.ge-row{grid-template-columns:28px 1fr 30px}.ge-tog{grid-column:2/3}}`;
        document.head.appendChild(st);
    }
}
