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
const pad = n => String(n).padStart(2, '0');
const nowStr = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`; };
const ic = p => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
const ICONS = { error: ic('<circle cx="12" cy="12" r="9"/><path d="M15 9l-6 6M9 9l6 6"/>'), warning: ic('<path d="M12 3.5l9.5 16.5h-19z"/><path d="M12 10v4.5M12 17.4v.01"/>'),
                info: ic('<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.6v.01"/>'), success: ic('<circle cx="12" cy="12" r="9"/><path d="M8 12.5l3 3 5-6"/>') };
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
        const opt = { method, silent: true };   // silent: המעטפת הגלובלית לא מקפיצה טוסט; השגיאה מוצגת כאן
        if (body !== undefined) { opt.headers = { 'Content-Type': 'application/json' }; opt.body = JSON.stringify(body); }
        try {
            const res = await fetch(`${this.apiBase}${path}`, opt);
            return { ok: res.ok, status: res.status, data: await res.json().catch(() => null) };
        } catch (e) {
            return { ok: false, status: 0, data: { message: 'שגיאת תקשורת מול השרת. בדוק את החיבור ונסה שוב.' } };
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
    // אחרי עריכת תוצאה: מחשבים מחדש נבחן / עברו / מלגה מרשימת הבחינות
    recalc(code) {
        const rows = this.cards.get(code) || [], old = this.sum.get(code) || {};
        this.sum.set(code, { ...old, total_available_exams: rows.length, total_attempted: rows.filter(e => e.passed !== null).length,
            total_passed: rows.filter(e => e.passed === true).length, total_reward: rows.reduce((a, e) => a + (e.passed === true ? (e.reward_earned || 0) : 0), 0) });
    }
    // רענון שאר המסכים: פעם אחת, אחרי סדרת שינויים
    markDirty() { this._pending = true; clearTimeout(this._t); this._t = setTimeout(() => this.flushSync(), 1500); }
    flushSync() { clearTimeout(this._t); if (this._pending) { this._pending = false; if (this.onRefresh) this.onRefresh(); } }
    async loadCard(code) {
        const r = await this.call('GET', `/student-summary?student_code=${encodeURIComponent(code)}`);
        const me = r.ok && Array.isArray(r.data) ? r.data[0] : null;
        if (!me) return false;
        this.cards.set(code, me.exams); this.sum.set(code, me.stats);
        return true;
    }
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
        if (!this.ed && !this.cardCode) this.cards.clear();
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
        if (!this.find(code)) return;
        this.cardCode = code;
        this.seg = 'taken';
        this.paintCard();
        $('stuOv').classList.add('open'); $('stuDr').classList.add('open');
        if (!this.cards.has(code) && !(await this.loadCard(code))) this.cards.set(code, null);
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
                <button class="btn btn-secondary btn-sm" data-edit-exams><i class="fas fa-list-check"></i> עריכת בחינות</button>
                <button class="btn btn-primary btn-sm" data-grades><i class="fas fa-edit"></i> הזנת בחינות</button></div>
            <div class="stu-lh"><b>מה נבחן</b><div class="stu-segc" id="stuSeg">${this.segHtml(exams)}</div></div>
            <div class="stu-list">${exams === null ? '<div class="stu-empty">לא ניתן לטעון את הבחינות. סגור ופתח שוב.</div>' : (exams ? this.listHtml(exams) : '<div class="stu-empty">טוען...</div>')}</div>`;
    }

    segHtml(exams) {
        const n = (f) => (exams || []).filter(f).length;
        return [['taken', 'נבחן', n(e => e.passed !== null)], ['pending', 'טרם נבחן', n(e => e.passed === null)], ['all', 'הכל', (exams || []).length]]
            .map(([v, t, c]) => `<button data-seg="${v}" class="${this.seg === v ? 'on' : ''}">${t} ${exams ? `(${c})` : ''}</button>`).join('');
    }

    listHtml(exams) {
        const shown = exams.filter(e => this.seg === 'all' || (this.seg === 'taken') === (e.passed !== null));
        return shown.length ? this.groupsHtml(shown, false) : `<div class="stu-empty">${this.seg === 'taken' ? 'התלמיד עדיין לא נבחן באף בחינה' : 'אין בחינות להצגה'}</div>`;
    }

    // editable=false: רשימת צפייה. editable=true: כפתורי עבר / לא עבר / הסר לכל בחינה + "הכל עבר" לכל מסכת
    groupsHtml(rows, editable) {
        const groups = new Map();
        rows.forEach(e => { const d = e.details || {}, k = `${e.exam_type}|${d.masechet}`; if (!groups.has(k)) groups.set(k, { d, t: e.exam_type, rows: [] }); groups.get(k).rows.push(e); });
        this.groupCodes = [];
        return [...groups.values()].map(g => {
            const i = this.groupCodes.push(g.rows.map(e => e.exam_code)) - 1;
            const head = `<div class="stu-gh"><b>${esc(g.d.masechet || 'כללי')}</b><span>${TYPE[g.t] || ''}</span>
                ${editable ? `<button type="button" class="stu-gb" data-gset="${i}" title="סמן את כל הבחינות במסכת כעבר">הכל עבר</button>` : ''}<em>${g.rows.filter(e => e.passed).length}/${g.rows.length}</em></div>`;
            return head + g.rows.map(e => {
                const d = e.details || {}, pend = editable && this.ed && this.ed.pending.has(e.exam_code), eff = pend ? this.ed.pending.get(e.exam_code) : e.passed, [txt, cls] = STATUS[eff];
                const what = e.exam_type === 'gemara' ? `${d.from_page || ''} – ${d.to_page || ''}` : `פרק ${d.chapter_name || d.chapter_num || ''}`;
                const label = `<span class="w">${esc(what)}${d.chapter_title ? ` <i>${esc(d.chapter_title)}</i>` : ''}</span>`;
                if (!editable) return `<div class="stu-r"><b>${esc(e.exam_code)}</b>${label}<span class="stu-pill ${cls}">${txt}</span><span class="m">${e.passed ? money(e.reward_earned) : ''}</span><span class="dt">${heb(e.updated_at)}</span></div>`;
                const on = v => eff === v ? ` on ${v ? 'ok' : 'bad'}` : '';
                const lab = v => (v === true ? 'עבר' : v === false ? 'לא עבר' : 'טרם נבחן');
                return `<div class="stu-r stu-xr ${e.busy ? 'busy' : ''} ${pend ? 'pend' : ''} ${cls}" data-code="${esc(e.exam_code)}"><b>${esc(e.exam_code)}</b>${label}
                    <div class="stu-set"><button type="button" data-set="true" class="${on(true)}" title="עבר">✓</button><button type="button" data-set="false" class="${on(false)}" title="לא עבר">✕</button>
                    <button type="button" data-set="none" title="הסר את התוצאה (טרם נבחן)" ${eff === null ? 'disabled' : ''}>⌫</button></div>
                    <span class="fb ${e.err ? 'bad' : ''}">${pend ? `${e.err ? `<b class="stu-er">${esc(e.err)}</b><br>` : ''}<b class="stu-pt">ממתין: ${lab(e.passed)} ← ${lab(eff)}</b> <button type="button" class="stu-un" data-undo>בטל</button>` : e.err ? esc(e.err) : (e.saved ? 'נשמר ✓' : (e.passed !== null ? heb(e.updated_at) : ''))}</span></div>`;
            }).join('');
        }).join('');
    }

    // ============================================================
    //  מודל הוספה / עריכה — לשוניות: פרטים | בחינות. הודעות בתוך המודל (טוסט רק בסיום פעולה)
    // ============================================================
    say(type, text) {
        const el = $('stuAlert');
        if (!text) { el.className = 'stu-alert hidden'; el.innerHTML = ''; return; }
        el.className = `stu-alert ${type}`;
        el.innerHTML = `<span class="ic">${ICONS[type]}</span><div>${esc(text)}</div><button type="button" class="stu-ax" data-ax aria-label="סגור">&times;</button>`;
    }
    fieldErr(id, msg) {
        const f = $(id) && $(id).closest('.stu-f');
        if (!f) return;                      // תיבות סימון / שדות נסתרים אינם שדות טקסט
        f.classList.toggle('err', !!msg); f.querySelector('.stu-ferr').textContent = msg || '';
    }

    openForm(code = null, tab = 'details') {
        const s = code ? this.find(code) : null;
        this.ed = { code: s ? s.student_code : null, q: '', seg: 'taken', pending: new Map(), review: false, items: [] };   // pending: שינויים שסומנו ועדיין לא נשמרו
        $('stuForm').reset();
        ['fFirst', 'fLast', 'fClass', 'fCode'].forEach(id => this.fieldErr(id, ''));
        this.say(null);
        $('fOrig').value = s ? s.student_code : '';
        $('stuFormTitle').innerHTML = s ? `<i class="fas fa-pen"></i> ${esc(this.fullName(s))}` : '<i class="fas fa-user-plus"></i> תלמיד חדש';
        $('fAddCode').style.display = s ? 'none' : '';
        $('fEditCode').style.display = s ? 'flex' : 'none';
        $('fCode').disabled = false;
        $('stuTabs').style.display = s ? '' : 'none';
        const classes = [...new Set(this.students.map(x => x.class_grade).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'he'));
        $('fClassChips').innerHTML = classes.map(c => `<button type="button" data-cls="${esc(c)}">${esc(c)}</button>`).join('');
        const nums = this.students.map(x => parseInt(x.student_code, 10)).filter(n => !isNaN(n));
        $('fAutoHint').textContent = `הקוד הבא בערך: ${nums.length ? Math.max(...nums) + 1 : 1000}`;
        if (s) {
            $('fFirst').value = s.first_name || ''; $('fLast').value = s.last_name || ''; $('fClass').value = s.class_grade || '';
            $('fPhone').value = (s.phones || []).join(', '); $('fCurCode').textContent = s.student_code;
        }
        $('stuFormModal').classList.remove('hidden');
        this.tab(s && tab === 'exams' ? 'exams' : 'details');
        if (!s || tab !== 'exams') setTimeout(() => $('fFirst').focus(), 50);
    }

    async closeForm(force = false) {
        if (!force && this.ed && this.ed.pending.size) {
            const ok = await window.customConfirm(`יש ${this.ed.pending.size} שינויים בבחינות שעדיין לא נשמרו.\nלסגור ולבטל אותם?`);
            if (!ok) return;
        }
        $('stuFormModal').classList.add('hidden');
        this.ed = null;
        this.flushSync();
    }

    tab(name) {
        this.ed.tab = name;
        document.querySelectorAll('#stuTabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === name));
        $('stuForm').classList.toggle('hidden', name !== 'details');
        $('stuExamsPane').classList.toggle('hidden', name !== 'exams');
        $('stuFootDetails').classList.toggle('hidden', name !== 'details');
        $('stuFootExams').classList.toggle('hidden', name !== 'exams');
        $('stuReview').classList.add('hidden'); $('stuFootReview').classList.add('hidden'); this.ed.review = false;
        this.say(null);
        if (name === 'exams') this.openExams();
    }

    validate() {
        const orig = $('fOrig').value, e = {};
        const v = { first: $('fFirst').value.trim(), last: $('fLast').value.trim(), cls: $('fClass').value.trim(), code: $('fCode').value.trim() };
        if (!v.first) e.fFirst = 'חובה להזין שם פרטי';
        if (!v.last) e.fLast = 'חובה להזין שם משפחה';
        if (!v.cls) e.fClass = 'חובה להזין כיתה. לא ניתן לרשום תלמיד ללא כיתה';
        if (!orig && !$('fAuto').checked) {
            if (!v.code) e.fCode = 'הזן קוד, או סמן הקצאה אוטומטית';
            else if (!/^[0-9A-Za-z\u0590-\u05FF_-]{1,20}$/.test(v.code)) e.fCode = 'קוד לא תקין (עד 20 תווים: אותיות, ספרות או מקף)';
            else if (this.find(v.code)) e.fCode = 'הקוד כבר קיים במערכת';
        }
        ['fFirst', 'fLast', 'fClass', 'fCode'].forEach(id => this.fieldErr(id, e[id]));
        const first = Object.keys(e)[0];
        if (first) { this.say('error', 'יש להשלים את השדות המסומנים באדום.'); $(first).focus(); }
        return !first;
    }

    // שגיאת שרת: מסומנת על השדה הרלוונטי + הודעה בתוך המודל
    serverError(r, fallback) {
        const msg = this.errText(r, fallback);
        if (/כיתה/.test(msg)) this.fieldErr('fClass', msg);
        else if (/שם פרטי/.test(msg)) this.fieldErr('fFirst', msg);
        else if (/שם משפחה/.test(msg)) this.fieldErr('fLast', msg);
        else if (r.status === 409 || /קוד/.test(msg)) this.fieldErr('fCode', msg);
        this.say('error', msg);
    }

    async save() {
        this.say(null);
        if (!this.validate()) return;
        const orig = $('fOrig').value, btn = $('fSave'), label = btn.innerHTML;
        const body = { first_name: $('fFirst').value.trim(), last_name: $('fLast').value.trim(), class_grade: $('fClass').value.trim(),
                       phones: $('fPhone').value.split(/[,\s;]+/).filter(Boolean) };
        if (!orig && !$('fAuto').checked) body.student_code = $('fCode').value.trim();
        btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> שומר...';
        const r = orig ? await this.call('PUT', `/students/${encodeURIComponent(orig)}`, body) : await this.call('POST', '/students', body);
        btn.disabled = false; btn.innerHTML = label;
        if (!r.ok) return this.serverError(r, 'השמירה נכשלה. נסה שוב.');
        const keep = orig && this.ed.pending.size;          // יש שינויים בבחינות שממתינים לאישור — המודל נשאר פתוח
        if (!keep) { this.cards.clear(); this.sum.delete(orig); }
        this._pending = true;
        if (keep) { this.say('success', 'פרטי התלמיד נשמרו. שים לב: יש שינויים בבחינות שעדיין ממתינים לאישור (לשונית "בחינות").'); return this.flushSync(); }
        await this.closeForm(true);
        window.customAlert(orig ? 'פרטי התלמיד עודכנו.' : `התלמיד נוסף. קוד התלמיד: ${r.data.student_code}`);   // טוסט: המודל נסגר
        this.flushSync();
    }

    async changeCode() {
        const old = $('fOrig').value;
        const next = await window.customPrompt(`הזן את הקוד החדש שיחליף את ${old}:`);
        if (next === null || !next.trim()) return;
        if (next.trim() === old) return this.say('warning', 'הקוד החדש זהה לקוד הקיים. לא בוצע שינוי.');
        if (this.ed.pending.size) return this.say('warning', 'יש שינויים בבחינות שעדיין לא נשמרו. אשר או בטל אותם לפני החלפת הקוד.');
        const r = await this.call('PUT', `/students/${encodeURIComponent(old)}/change-code`, { new_student_code: next.trim() });
        if (!r.ok) return this.serverError(r, 'שינוי הקוד נכשל. נסה שוב.');
        this.cards.clear(); this.closeCard(); await this.closeForm(true);
        window.customAlert(`הקוד שונה ל-${next.trim()} בכל רישומי המערכת.`);
        this._pending = true; this.flushSync();
    }

    // ---------- לשונית "בחינות": עריכת מה שהתלמיד ביצע ----------
    async openExams() {
        const code = this.ed.code;
        this.ed.q = ''; this.ed.seg = 'taken'; $('stuExQ').value = '';
        $('stuExList').innerHTML = '<div class="stu-empty">טוען בחינות...</div>';
        if (!this.cards.get(code) && !(await this.loadCard(code))) {
            $('stuExList').innerHTML = '<div class="stu-empty">לא ניתן לטעון את הבחינות.</div>';
            return this.say('error', 'לא ניתן לטעון את הבחינות של התלמיד. סגור ופתח שוב.');
        }
        this.paintExams();
    }

    paintExams() {
        if (!this.ed || !this.ed.code) return;
        const code = this.ed.code, rows = this.cards.get(code) || [], term = this.ed.q.trim().toLowerCase(), st = this.stats(this.find(code) || {});
        const taken = rows.filter(e => e.passed !== null).length;
        const shown = rows.filter(e => (this.ed.seg === 'all' || (this.ed.seg === 'taken') === (e.passed !== null))
            && (!term || `${e.exam_code} ${Object.values(e.details || {}).join(' ')}`.toLowerCase().includes(term)));
        const n = this.ed.pending.size;
        $('stuTabCount').textContent = `(${taken})${n ? ' •' : ''}`;
        $('stuPendInfo').className = n ? 'stu-pi warn' : 'stu-pi';
        $('stuPendInfo').innerHTML = n ? `<b>${n}</b> שינויים ממתינים לאישור. עדיין לא נשמר כלום.` : 'סימון ✓ ✕ ⌫ רק מכין שינוי. שום דבר לא נשמר לפני שתאשר בסקירה.';
        $('fReview').disabled = !n; $('fReview').innerHTML = n ? `סקירה ואישור (${n})` : 'סקירה ואישור'; $('fUndoAll').disabled = !n;
        $('stuExSeg').innerHTML = [['taken', 'נבחן', taken], ['pending', 'טרם נבחן', rows.length - taken], ['all', 'הכל', rows.length]]
            .map(([v, t, n]) => `<button type="button" data-seg="${v}" class="${this.ed.seg === v ? 'on' : ''}">${t} (${n})</button>`).join('');
        $('stuExSum').innerHTML = `נבחן <b>${st.attempted}</b> מתוך ${st.available ?? rows.length} · עברו <b class="stu-ok">${st.passed}</b> · <b class="stu-money">${money(st.reward)}</b>`;
        const box = $('stuExList'), top = box.scrollTop;
        box.innerHTML = shown.length ? this.groupsHtml(shown, true) : `<div class="stu-empty">${term ? 'לא נמצאו בחינות תואמות' : (this.ed.seg === 'taken' ? 'התלמיד עדיין לא נבחן באף בחינה. עבור ל"טרם נבחן" כדי לסמן.' : 'אין בחינות להצגה')}</div>`;
        box.scrollTop = top;
    }

    // סימון בלבד — לא נשמר כלום עד שמאשרים בסקירה
    stage(code, val) {
        const row = (this.cards.get(this.ed.code) || []).find(e => e.exam_code === code);
        if (!row || row.busy) return;
        row.err = '';
        if (val === row.passed) this.ed.pending.delete(code); else this.ed.pending.set(code, val);
        this.paintExams();
    }

    // "הכל עבר" למסכת — גם זה רק מסמן
    stageGroupPassed(i) {
        const rows = (this.cards.get(this.ed.code) || []).filter(e => (this.groupCodes[i] || []).includes(e.exam_code) && e.passed !== true);
        if (!rows.length) return this.say('info', 'כל הבחינות במסכת כבר מסומנות כעבר.');
        rows.forEach(e => { e.err = ''; this.ed.pending.set(e.exam_code, true); });
        this.paintExams();
    }

    lab(v) { return v === true ? 'עבר' : v === false ? 'לא עבר' : 'טרם נבחן'; }
    what(r) { const d = r.details || {}; return `${r.exam_code} · ${r.exam_type === 'gemara' ? `${d.masechet || ''} ${d.from_page || ''} – ${d.to_page || ''}` : `${d.masechet || ''} פרק ${d.chapter_name || d.chapter_num || ''}`}`; }

    // מסך אישור: מציג בדיוק מה הולך להתעדכן, ורק "אשר ועדכן" שומר
    openReview() {
        const code = this.ed.code, s = this.find(code), rows = this.cards.get(code) || [];
        const items = [...this.ed.pending].map(([c, to]) => { const r = rows.find(e => e.exam_code === c); return r && { r, from: r.passed, to }; }).filter(Boolean);
        if (!items.length) return;
        this.ed.items = items; this.ed.review = true;
        const add = items.filter(i => i.from === null && i.to !== null), upd = items.filter(i => i.from !== null && i.to !== null), del = items.filter(i => i.to === null);
        const reward = v => (v.to === true ? (v.r.potential_reward || 0) : 0) - (v.from === true ? (v.r.reward_earned || 0) : 0);
        const delta = items.reduce((a, v) => a + reward(v), 0);
        const grp = (cls, icon, title, list, line) => list.length ? `<div class="stu-rg ${cls}"><b>${icon} ${title} (${list.length})</b><ul>${list.map(line).join('')}</ul></div>` : '';
        $('stuReview').innerHTML = `
            <div class="stu-rvh"><div class="ic">${ICONS.warning}</div><div><b>אישור עדכון בחינות</b><p>הפעולה תעדכן את הרשומות של <b>${esc(this.fullName(s))}</b> בשרת. עבור על הרשימה ואשר רק אם הכול נכון.</p></div></div>
            ${grp('add', '＋', 'יתווספו', add, i => `<li>${esc(this.what(i.r))} ← <b>${this.lab(i.to)}</b></li>`)}
            ${grp('upd', '✎', 'יעודכנו', upd, i => `<li>${esc(this.what(i.r))}: ${this.lab(i.from)} ← <b>${this.lab(i.to)}</b></li>`)}
            ${grp('del', '✕', 'יימחקו (יחזרו להיות "טרם נבחן")', del, i => `<li>${esc(this.what(i.r))} (היה: ${this.lab(i.from)})</li>`)}
            <div class="stu-rd ${delta < 0 ? 'neg' : ''}">שינוי במלגה של התלמיד: <b>${delta >= 0 ? '+' : '−'}${money(Math.abs(delta))}</b></div>`;
        $('fConfirm').innerHTML = `<i class="fas fa-check"></i> אשר ועדכן ${items.length} ${items.length === 1 ? 'בחינה' : 'בחינות'}`;
        $('stuExamsPane').classList.add('hidden'); $('stuFootExams').classList.add('hidden');
        $('stuReview').classList.remove('hidden'); $('stuFootReview').classList.remove('hidden');
        this.say(null);
    }

    backFromReview() {
        this.ed.review = false;
        $('stuReview').classList.add('hidden'); $('stuFootReview').classList.add('hidden');
        $('stuExamsPane').classList.remove('hidden'); $('stuFootExams').classList.remove('hidden');
        this.paintExams();
    }

    async confirmReview() {
        const sc = this.ed.code, items = this.ed.items, btn = $('fConfirm'), label = btn.innerHTML;
        btn.disabled = true; $('fBack').disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> מעדכן...';
        const sets = items.filter(i => i.to !== null), dels = items.filter(i => i.to === null), results = [];
        if (sets.length) {
            const r = await this.call('POST', '/student-exams', { student_code: sc, exams: sets.map(i => ({ exam_code: i.r.exam_code, passed: i.to, force_update: true })) });
            const bad = new Map(r.ok ? ((r.data && r.data.errors) || []).map(x => [x.exam_code, x.reason]) : []);
            sets.forEach(i => results.push({ i, ok: r.ok && !bad.has(i.r.exam_code), reason: r.ok ? bad.get(i.r.exam_code) : this.errText(r, 'השמירה נכשלה') }));
        }
        for (const i of dels) {
            const r = await this.call('DELETE', `/student-exams/${encodeURIComponent(sc)}/${encodeURIComponent(i.r.exam_code)}`);
            results.push({ i, ok: r.ok, reason: r.ok ? '' : this.errText(r, 'המחיקה נכשלה') });
        }
        btn.disabled = false; $('fBack').disabled = false; btn.innerHTML = label;
        let okN = 0, badN = 0;
        results.forEach(({ i, ok, reason }) => {
            if (ok) { okN++; this.ed.pending.delete(i.r.exam_code); this.applyResult(sc, i.r, i.to); } else { badN++; i.r.err = reason || 'לא עודכן'; }
        });
        if (badN) this.ed.seg = 'all';       // שורה שנדחתה חייבת להיות גלויה (גם אם היא לא בסינון הנוכחי)
        this.backFromReview();
        this.say(badN ? 'warning' : 'success', badN ? `${okN} בחינות עודכנו, ${badN} לא עודכנו. הסיבה מופיעה בשורה, והשינוי נשאר ממתין.` : `עודכנו ${okN} ${okN === 1 ? 'בחינה' : 'בחינות'} בהצלחה.`);
    }

    applyResult(sc, row, val) {
        row.passed = val; row.reward_earned = val ? (row.potential_reward || 0) : 0; row.updated_at = val === null ? null : nowStr(); row.err = ''; row.saved = true;
        this.recalc(sc); this.markDirty();
        if (this.ed && this.ed.code === sc && this.ed.tab === 'exams') this.paintExams();
        this.paint(); if (this.cardCode === sc) this.paintCard();
        setTimeout(() => { row.saved = false; if (this.ed && this.ed.code === sc && this.ed.tab === 'exams' && !this.ed.review) this.paintExams(); }, 2200);
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
            if (t.closest('[data-edit]')) return this.openForm(this.cardCode, 'details');
            if (t.closest('[data-edit-exams]')) return this.openForm(this.cardCode, 'exams');
            if (t.closest('[data-grades]')) { const code = this.cardCode; this.closeCard(); if (this.onGrades) this.onGrades(code); return; }
            const seg = t.closest('[data-seg]');
            if (seg) { this.seg = seg.dataset.seg; this.paintCard(); }
        });

        // ----- מודל הוספה / עריכה -----
        const M = $('stuFormModal');
        $('stuForm').addEventListener('submit', e => { e.preventDefault(); this.save(); });
        $('stuForm').addEventListener('input', e => { if (e.target.id) { this.fieldErr(e.target.id, ''); } this.say(null); });
        $('stuForm').addEventListener('click', e => { const c = e.target.closest('[data-cls]'); if (c) { $('fClass').value = c.dataset.cls; this.fieldErr('fClass', ''); } });
        $('fAuto').addEventListener('change', e => { $('fCode').disabled = e.target.checked; if (e.target.checked) { $('fCode').value = ''; this.fieldErr('fCode', ''); } $('fAutoHint').style.visibility = e.target.checked ? 'visible' : 'hidden'; });
        $('fChange').addEventListener('click', () => this.changeCode());
        ['stuFormClose', 'fCancel', 'fDone'].forEach(id => $(id).addEventListener('click', () => this.closeForm()));
        $('stuTabs').addEventListener('click', e => { const b = e.target.closest('button'); if (b) this.tab(b.dataset.tab); });
        $('stuAlert').addEventListener('click', e => { if (e.target.closest('[data-ax]')) this.say(null); });
        $('stuExQ').addEventListener('input', e => { this.ed.q = e.target.value; this.paintExams(); });
        $('stuExSeg').addEventListener('click', e => { const b = e.target.closest('[data-seg]'); if (b) { this.ed.seg = b.dataset.seg; this.paintExams(); } });
        $('stuExList').addEventListener('click', e => {
            const g = e.target.closest('[data-gset]');
            if (g) return this.stageGroupPassed(+g.dataset.gset);
            const b = e.target.closest('[data-set]'), row = e.target.closest('.stu-xr');
            if (b && row) return this.stage(row.dataset.code, b.dataset.set === 'none' ? null : b.dataset.set === 'true');
            if (e.target.closest('[data-undo]') && row) { this.ed.pending.delete(row.dataset.code); this.paintExams(); }
        });
        $('fReview').addEventListener('click', () => this.openReview());
        $('fUndoAll').addEventListener('click', () => { this.ed.pending.clear(); this.paintExams(); });
        $('fBack').addEventListener('click', () => this.backFromReview());
        $('fConfirm').addEventListener('click', () => this.confirmReview());
        document.addEventListener('keydown', e => {
            if (e.key !== 'Escape') return;
            if (!M.classList.contains('hidden')) { if (this.ed && this.ed.review) this.backFromReview(); else this.closeForm(); }
            else if (this.cardCode) this.closeCard();
        });
    }

    // ---------- רכיבים קבועים (נטענים פעם אחת) ----------
    mount() {
        if ($('stuDr')) return;
        const f = (id, label, extra = '') => `<div class="stu-f"><label for="${id}">${label}</label><input id="${id}" ${extra}><small class="stu-ferr"></small></div>`;
        document.body.insertAdjacentHTML('beforeend', `
        <div id="stuOv" class="stu-ov"></div><aside id="stuDr" class="stu-dr" aria-label="כרטיס תלמיד"></aside>
        <div id="stuFormModal" class="modal hidden" style="z-index:9990"><div class="modal-content stu-mc">
            <div class="modal-header"><h3 id="stuFormTitle"></h3><button class="close-modal-btn" id="stuFormClose" aria-label="סגור">&times;</button></div>
            <div class="stu-tabs" id="stuTabs"><button type="button" data-tab="details" class="on">פרטי תלמיד</button><button type="button" data-tab="exams">בחינות שבוצעו <em id="stuTabCount"></em></button></div>
            <div id="stuAlert" class="stu-alert hidden" role="alert"></div>
            <form id="stuForm" class="stu-pane" autocomplete="off" novalidate>
                <input type="hidden" id="fOrig">
                <div class="stu-2">${f('fFirst', 'שם פרטי', 'required')}${f('fLast', 'שם משפחה', 'required')}</div>
                <div class="stu-2">
                    <div class="stu-f"><label for="fClass">כיתה <i class="stu-req">חובה</i></label><input id="fClass" required><small class="stu-ferr"></small><div class="stu-chips" id="fClassChips"></div></div>
                    ${f('fPhone', 'טלפון (אפשר כמה, מופרדים בפסיק)', 'placeholder="0501234567"')}</div>
                <div class="stu-box" id="fAddCode">${f('fCode', 'קוד תלמיד (ייחודי)', 'placeholder="הקש קוד רצוי"')}
                    <label class="stu-chk"><input type="checkbox" id="fAuto"> הקצה קוד עוקב אוטומטית <span class="stu-mut" id="fAutoHint" style="visibility:hidden"></span></label></div>
                <div class="stu-box" id="fEditCode" style="display:none;flex-direction:row;justify-content:space-between;align-items:center">
                    <div><span class="stu-mut">קוד נוכחי</span><br><b id="fCurCode" style="font-size:1.2rem;color:var(--primary-color)"></b></div>
                    <button type="button" class="btn btn-secondary btn-sm" id="fChange"><i class="fas fa-exchange-alt"></i> החלף קוד</button></div>
            </form>
            <div id="stuExamsPane" class="stu-pane hidden">
                <div class="stu-extools"><div class="stu-search"><i class="fas fa-search"></i><input id="stuExQ" placeholder="חיפוש לפי קוד, מסכת או פרק..." autocomplete="off"></div><div class="stu-segc" id="stuExSeg"></div></div>
                <div class="stu-exsum" id="stuExSum"></div>
                <div class="stu-exlist" id="stuExList"></div>
            </div>
            <div class="stu-mfoot" id="stuFootDetails"><button type="button" class="btn btn-outline" id="fCancel">ביטול</button>
                <button type="submit" form="stuForm" class="btn btn-primary" id="fSave"><i class="fas fa-save"></i> שמור</button></div>
            <div id="stuReview" class="stu-pane hidden"></div>
            <div class="stu-mfoot hidden" id="stuFootExams"><span class="stu-pi" id="stuPendInfo"></span>
                <button type="button" class="btn btn-outline" id="fUndoAll" disabled>בטל שינויים</button>
                <button type="button" class="btn btn-primary" id="fReview" disabled>סקירה ואישור</button>
                <button type="button" class="btn btn-outline" id="fDone">סגירה</button></div>
            <div class="stu-mfoot hidden" id="stuFootReview"><button type="button" class="btn btn-outline" id="fBack">חזרה לעריכה</button>
                <button type="button" class="btn btn-primary" id="fConfirm"><i class="fas fa-check"></i> אשר ועדכן</button></div>
        </div></div>`);
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
        .stu-mc{max-width:680px;width:94%;height:auto;max-height:92vh;display:flex;flex-direction:column;border-radius:14px;overflow:hidden}
        .stu-tabs{display:flex;gap:4px;padding:8px 14px 0;background:#f8fafc;border-bottom:1px solid var(--border-color)}
        .stu-tabs button{border:none;background:none;padding:9px 16px;font-weight:700;font-size:.88rem;color:#64748b;cursor:pointer;border-bottom:3px solid transparent}
        .stu-tabs button.on{color:var(--primary-color);border-bottom-color:var(--primary-color);background:#fff;border-radius:8px 8px 0 0}.stu-tabs em{font-style:normal;color:#94a3b8;font-weight:600}
        .stu-alert{display:flex;gap:10px;align-items:flex-start;margin:12px 18px 0;padding:10px 12px;border-radius:10px;border:1px solid;font-size:.86rem;line-height:1.5;animation:stuIn .2s}
        .stu-alert .ic{flex:none;width:20px;height:20px;margin-top:1px}.stu-alert svg{width:20px;height:20px}.stu-alert div{flex:1}.stu-ax{border:none;background:none;font-size:1.2rem;line-height:1;cursor:pointer;color:inherit;opacity:.6}
        .stu-alert.error{background:#fef2f2;border-color:#fecaca;color:#991b1b}.stu-alert.warning{background:#fffbeb;border-color:#fde68a;color:#92400e}
        .stu-alert.info{background:#eff6ff;border-color:#bfdbfe;color:#1e40af}.stu-alert.success{background:#ecfdf5;border-color:#a7f3d0;color:#065f46}
        @keyframes stuIn{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:none}}
        .stu-pane{padding:16px 18px;display:flex;flex-direction:column;gap:14px;overflow:auto;flex:1;min-height:0}.hidden.stu-pane{display:none}
        .stu-f.err input{border-color:#dc2626;background:#fef2f2}.stu-ferr{display:block;color:#b91c1c;font-size:.76rem;min-height:0;margin-top:3px}
        .stu-req{font-style:normal;font-size:.68rem;color:#b91c1c;background:#fee2e2;border-radius:99px;padding:0 7px;margin-right:4px}
        .stu-chips{display:flex;gap:5px;flex-wrap:wrap;margin-top:6px}.stu-chips button{border:1px solid var(--border-color);background:#fff;border-radius:99px;padding:1px 11px;font-size:.78rem;cursor:pointer}.stu-chips button:hover{background:#eff6ff;border-color:#93c5fd}
        .stu-mfoot{display:flex;justify-content:flex-end;gap:8px;align-items:center;padding:12px 18px;border-top:1px solid var(--border-color);background:#f8fafc}.stu-mfoot.hidden{display:none}
        .stu-extools{display:flex;gap:10px;flex-wrap:wrap;align-items:center}.stu-exsum{font-size:.84rem;color:#475569;background:#f8fafc;border:1px solid var(--border-color);border-radius:8px;padding:6px 12px}
        .stu-exlist{flex:1;min-height:220px;max-height:46vh;overflow:auto;border:1px solid var(--border-color);border-radius:10px}
        .stu-xr{grid-template-columns:46px 1fr auto 86px;padding:6px 14px}.stu-xr.busy{opacity:.5;pointer-events:none}
        .stu-xr.ok{background:#f0fdf4}.stu-xr.bad{background:#fef2f2}
        .stu-set{display:inline-flex;gap:3px}.stu-set button{border:1px solid var(--border-color);background:#fff;width:30px;height:28px;border-radius:7px;cursor:pointer;font-weight:800;color:#64748b}
        .stu-set button:hover:not(:disabled){background:#eff6ff}.stu-set button:disabled{opacity:.3;cursor:default}
        .stu-set button.on.ok{background:#059669;border-color:#059669;color:#fff}.stu-set button.on.bad{background:#dc2626;border-color:#dc2626;color:#fff}
        .stu-xr .fb{font-size:.74rem;color:#64748b;text-align:left}.stu-xr .fb.bad{color:#b91c1c;font-weight:600;white-space:normal}
        .stu-gb{margin-right:auto;margin-left:10px;border:1px solid rgba(255,255,255,.6);background:transparent;color:#fff;border-radius:99px;padding:0 10px;font-size:.72rem;cursor:pointer}.stu-gb:hover{background:rgba(255,255,255,.18)}
        .stu-xr.pend{background:#fffbeb;box-shadow:inset 3px 0 0 #f59e0b}.stu-pt{color:#b45309;font-size:.72rem}.stu-er{color:#b91c1c;font-size:.74rem}.stu-un{border:none;background:none;color:var(--primary-color);cursor:pointer;font-size:.72rem;font-weight:700;text-decoration:underline}
        .stu-xr .fb{white-space:normal}.stu-pi{flex:1;font-size:.8rem;color:#64748b;text-align:right}.stu-pi.warn{color:#b45309;font-weight:600}
        .stu-rvh{display:flex;gap:12px;align-items:flex-start;background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:12px 14px;color:#92400e}.stu-rvh .ic{flex:none;width:26px;height:26px}.stu-rvh .ic svg{width:26px;height:26px}.stu-rvh p{margin:4px 0 0;font-size:.86rem}
        .stu-rg{border:1px solid var(--border-color);border-radius:10px;padding:10px 14px}.stu-rg b{font-size:.9rem}.stu-rg ul{margin:6px 18px 0;padding:0;font-size:.85rem;line-height:1.7}
        .stu-rg.add{background:#ecfdf5;border-color:#a7f3d0;color:#065f46}.stu-rg.upd{background:#eff6ff;border-color:#bfdbfe;color:#1e3a8a}.stu-rg.del{background:#fef2f2;border-color:#fecaca;color:#991b1b}
        .stu-rd{font-size:.88rem;color:#047857;background:#f8fafc;border:1px solid var(--border-color);border-radius:10px;padding:8px 14px}.stu-rd.neg{color:#b91c1c}
        @media(max-width:700px){.stu-2{grid-template-columns:1fr}.stu-tiles{grid-template-columns:1fr 1fr}.stu-r{grid-template-columns:44px 1fr auto}.stu-r .m,.stu-r .dt{display:none}}`;
        document.head.appendChild(st);
    }
}
