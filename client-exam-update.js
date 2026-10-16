// ============================================================
//  client-exam-update.js — הזנת ציונים לתלמיד (מהירה, מבוססת מקלדת)
//  new ExamUpdateManager(apiBase, container, onSwitchStudent, onChanged)
//
//  זרימה: מקלידים קוד ← Enter ← 1 (עבר) / 2 (לא עבר).   אפשר גם: "12א 1" · "12*2" · "5א-9ב" · הדבקת רשימה.
//  שמירה: לחצן "שמור" או Ctrl+Enter. הודעות מוצגות בתוך המסך (בלי טוסטים).
// ============================================================
import { formatHebrewDate } from './client-reports.js';

const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = v => '₪' + (Number(v) || 0).toFixed(1);
const heb = ts => { const d = new Date(String(ts || '').replace(' ', 'T')); return isNaN(d) ? '' : formatHebrewDate(d).split(' ').slice(0, -1).join(' '); };
const $ = id => document.getElementById(id);
const TYPE = { mishnayot: 'משניות', gemara: 'גמרא' };

// ---------- פירוק קלט (מיוצא לבדיקות) ----------
// 12*1 = 12א · 12*2 = 12ב  (כמו בטלפון)
export function normCode(t) {
    t = String(t).trim().replace(/["'׳״]/g, '');
    const m = t.match(/^(\d+)\*([12])$/);
    return m ? m[1] + (m[2] === '1' ? 'א' : 'ב') : t;
}

// מחזיר { items: [{code, status}], unknown: [טקסט שלא זוהה] }.  status: true / false / null (עוד לא נבחר)
export function parseEntry(text, list) {
    const idx = new Map(list.map((e, i) => [e.exam_code, i]));
    const items = [], unknown = [];
    for (const raw of String(text).split(/[\s,;]+/).filter(Boolean)) {
        const last = items[items.length - 1];
        if (/^[12+-]$/.test(raw) && last && last.status === null) { last.status = raw === '1' || raw === '+'; continue; }
        const rng = raw.match(/^(.+?)[-–](.+)$/);                       // טווח: 5א-9ב
        if (rng && idx.has(normCode(rng[1])) && idx.has(normCode(rng[2]))) {
            let a = idx.get(normCode(rng[1])), b = idx.get(normCode(rng[2]));
            if (a > b) [a, b] = [b, a];
            for (let i = a; i <= b; i++) items.push({ code: list[i].exam_code, status: null });
            continue;
        }
        const c = normCode(raw);
        idx.has(c) ? items.push({ code: c, status: null }) : unknown.push(raw);
    }
    return { items, unknown };
}

export class ExamUpdateManager {
    constructor(apiBase, container, onSwitch, onChanged) {
        Object.assign(this, { apiBase, container, onSwitch, onChanged });
        this.allExams = []; this.exMap = new Map();
        this.student = null; this.rows = []; this.pending = null; this.sugIdx = -1; this.hSeg = 'all'; this.hQ = '';
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
            this.rows = []; this.report = null; this.pending = null;
        }
        const r = await this.call('GET', `/student-summary?student_code=${encodeURIComponent(code)}`);
        const me = r.ok && Array.isArray(r.data) ? r.data[0] : null;
        if (!me) {
            if (!silent) this.container.innerHTML = `<div class="ge-fail">${esc(r.ok ? 'לא נמצא תלמיד עם הקוד הזה.' : this.errText(r, 'שגיאה בטעינת התלמיד.'))}<br><button class="btn btn-outline btn-sm" id="geBack">חזרה לחיפוש</button></div>`;
            return;
        }
        this.student = me;
        if (silent) { this.paintTop(); this.paintHist(); this.paintStage(); } else { this.render(); }
    }

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
                    <div class="ge-eh"><h3><i class="fas fa-file-signature"></i> הזנת בחינות</h3>
                        <span class="ge-hint">הקלד קוד ← Enter ← <kbd>1</kbd> עבר · <kbd>2</kbd> לא עבר &nbsp;|&nbsp; "12א 1" · "12*2" · "5א-9ב" · הדבקת רשימה &nbsp;|&nbsp; <kbd>Ctrl</kbd>+<kbd>Enter</kbd> שמירה</span></div>
                    <div class="ge-bar">
                        <div class="ge-codewrap"><input id="geCode" placeholder="קוד בחינה, טווח, או חיפוש לפי מסכת / פרק..." autocomplete="off"><div class="ge-sug hidden" id="geSug"></div></div>
                        <div class="ge-pend hidden" id="gePend" tabindex="0"></div>
                    </div>
                    <div class="ge-msg hidden" id="geMsg" role="status"></div>
                    <div class="ge-stage" id="geStage"></div>
                    <div class="ge-foot" id="geFoot"></div>
                    <div id="geReport"></div>
                </section>
                <aside class="ge-card ge-hist">
                    <div class="ge-eh"><h3><i class="fas fa-history"></i> מה כבר נבחן <em id="geHCount"></em></h3></div>
                    <div class="ge-htools"><input id="geHQ" placeholder="חיפוש..." autocomplete="off"><div class="ge-seg" id="geHSeg"></div></div>
                    <div class="ge-hlist" id="geHList"></div>
                </aside>
            </div>
        </div>`;
        this.paintTop(); this.paintHist(); this.paintStage(); this.paintPending();
        setTimeout(() => { const i = $('geCode'); if (i) i.focus(); }, 60);
    }

    paintTop() {
        const s = this.student, st = s.stats || {}, name = `${s.first_name || ''} ${s.last_name || ''}`.trim();
        const tile = (v, l, c = '') => `<div class="ge-tile ${c}"><b>${v}</b><span>${l}</span></div>`;
        $('geTop').innerHTML = `
            <div class="ge-av">${esc((s.first_name || '?').charAt(0))}</div>
            <div class="ge-id"><h2>${esc(name)}</h2><div class="ge-tags"><span>כיתה ${esc(s.class_grade || '-')}</span><span>קוד ${esc(s.student_code)}</span></div></div>
            <div class="ge-tiles">${tile(`${st.total_attempted ?? 0} מתוך ${st.total_available_exams ?? 0}`, 'נבחן')}${tile(st.total_passed ?? 0, 'עברו', 'ok')}${tile(Math.max(0, (st.total_attempted ?? 0) - (st.total_passed ?? 0)), 'לא עברו', 'bad')}${tile(money(st.total_reward), 'מלגה', 'money')}</div>
            <button class="btn btn-outline btn-sm" id="geSwitch"><i class="fas fa-exchange-alt"></i> החלף תלמיד</button>`;
    }

    // ============================================================
    //  רשימת ההזנה
    // ============================================================
    // מצב כל שורה: חסימה לפי כיתה / ציון קיים / האם אפשר לשלוח
    info(row) {
        const mine = this.mine(row.code), ex = this.exMap.get(row.code);
        const blocked = !mine && ex ? `הבחינה מיועדת לכיתה ${ex.target_grade} ומעלה` : '';
        const existing = mine && mine.passed !== null ? mine : null;
        const same = existing && row.status !== null && existing.passed === row.status;
        const send = row.status !== null && !blocked && !same && (!existing || row.force);
        return { ex, mine, blocked, existing, same, send };
    }

    stage(code, status = null, extra = {}) {
        let row = this.rows.find(r => r.code === code);
        if (!row) { row = { code, status: null, force: false }; this.rows.push(row); }
        if (status !== null) row.status = status;
        Object.assign(row, extra);
        row.err = '';
    }

    paintStage() {
        if (!$('geStage')) return;
        const rows = this.rows;
        $('geStage').innerHTML = rows.length ? rows.map(r => this.rowHtml(r)).join('') :
            `<div class="ge-empty"><i class="fas fa-keyboard"></i><b>הרשימה ריקה</b><span>הקלד קוד בחינה למעלה. למשל <kbd>12א</kbd>, ואז <kbd>1</kbd> לעבר או <kbd>2</kbd> לא עבר.</span></div>`;
        const infos = rows.map(r => this.info(r));
        const send = infos.filter(i => i.send).length, noStatus = rows.filter(r => r.status === null).length;
        const blocked = infos.filter(i => i.blocked).length, held = infos.filter(i => i.existing && !i.same && !i.send && !i.blocked).length;
        const bits = [];
        if (noStatus) bits.push(`<span class="warn">${noStatus} ללא סטטוס</span>`);
        if (held) bits.push(`<span class="warn">${held} כבר רשומות (סמן "עדכן" כדי לדרוס)</span>`);
        if (blocked) bits.push(`<span class="bad">${blocked} חסומות לפי כיתה</span>`);
        $('geFoot').innerHTML = rows.length ? `
            <div class="ge-bulk"><span>לא מסומנות:</span><button type="button" data-fill="true">עבר</button><button type="button" data-fill="false">לא עבר</button><button type="button" data-clear class="ge-link">נקה הכל</button></div>
            <div class="ge-st">${bits.join('')}</div>
            <button class="btn btn-primary" id="geSave" ${send && !noStatus ? '' : 'disabled'}><i class="fas fa-save"></i> שמור ${send || ''} ${send === 1 ? 'עדכון' : 'עדכונים'}</button>` : '';
    }

    rowHtml(r) {
        const i = this.info(r), cls = i.blocked ? 'blocked' : (r.status === null ? 'nostat' : (r.err ? 'err' : ''));
        let note = '';
        if (r.err) note = `<span class="bad">${esc(r.err)}</span>`;
        else if (i.blocked) note = `<span class="bad">${esc(i.blocked)}</span>`;
        else if (i.same) note = `<span class="mut">כבר רשום כך — אין שינוי</span>`;
        else if (i.existing) note = `<span class="warn">כבר רשום: ${i.existing.passed ? 'עבר' : 'לא עבר'}</span><label class="ge-force"><input type="checkbox" data-force ${r.force ? 'checked' : ''}> עדכן</label>`;
        return `<div class="ge-row ${cls}" data-code="${esc(r.code)}">
            <b class="c">${esc(r.code)}</b><div class="w">${esc(i.ex ? this.desc(i.ex) : '')}</div>
            <div class="ge-tog"><button type="button" data-st="true" class="${r.status === true ? 'on ok' : ''}">✓ עבר</button><button type="button" data-st="false" class="${r.status === false ? 'on bad' : ''}">✕ לא עבר</button></div>
            <div class="n">${note}</div><button type="button" class="ge-x" data-rm title="הסר">&times;</button></div>`;
    }

    // ---------- הודעה בתוך המסך ----------
    flash(type, text) {
        const el = $('geMsg');
        if (!text) { el.className = 'ge-msg hidden'; return; }
        el.className = `ge-msg ${type}`;
        el.innerHTML = `<div>${esc(text)}</div><button type="button" data-mx aria-label="סגור">&times;</button>`;
    }

    // ============================================================
    //  שורת ההקלדה
    // ============================================================
    suggestions(term) {
        const q = term.trim().toLowerCase();
        if (!q) return [];
        const score = e => {
            const code = e.exam_code.toLowerCase(), txt = Object.values(e.details || {}).join(' ').toLowerCase();
            return code === q ? 0 : code.startsWith(q) ? 1 : code.includes(q) ? 2 : txt.includes(q) ? 3 : 9;
        };
        return this.allExams.map(e => [score(e), e]).filter(x => x[0] < 9).sort((a, b) => a[0] - b[0]).slice(0, 8).map(x => x[1]);
    }

    paintSug(list) {
        const box = $('geSug');
        this.sugList = list;
        if (!list.length) { box.classList.add('hidden'); box.innerHTML = ''; return; }
        box.innerHTML = list.map((e, i) => {
            const mine = this.mine(e.exam_code), tag = !mine ? '<i class="bad">חסום לכיתה</i>' : (mine.passed === null ? '' : `<i class="${mine.passed ? 'ok' : 'bad'}">${mine.passed ? '✓ עבר' : '✕ לא עבר'}</i>`);
            return `<div class="ge-sg ${i === this.sugIdx ? 'on' : ''}" data-code="${esc(e.exam_code)}"><b>${esc(e.exam_code)}</b><span>${esc(this.desc(e))}</span>${tag}</div>`;
        }).join('');
        box.classList.remove('hidden');
    }

    onCodeInput() {
        const val = $('geCode').value, last = val.split(/[\s,;]+/).pop();
        this.sugIdx = -1;
        this.paintSug(/^[12+-]$/.test(last) ? [] : this.suggestions(last));
    }

    onCodeKey(e) {
        const n = (this.sugList || []).length;
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            if (!n) return;
            e.preventDefault();
            this.sugIdx = (this.sugIdx + (e.key === 'ArrowDown' ? 1 : -1) + n) % n;
            return this.paintSug(this.sugList);
        }
        if (e.key === 'Escape') { this.paintSug([]); this.pending = null; this.paintPending(); return; }
        if (e.key !== 'Enter' || e.ctrlKey) return;
        e.preventDefault();
        let text = $('geCode').value;
        if (this.sugIdx >= 0 && this.sugList[this.sugIdx]) {               // בחירה מההצעות
            const parts = text.split(/([\s,;]+)/); parts[parts.length - 1] = this.sugList[this.sugIdx].exam_code; text = parts.join('');
        } else if (n === 1 && !parseEntry(text, this.allExams).items.length) {  // הצעה יחידה — בוחרים אותה
            const parts = text.split(/([\s,;]+)/); parts[parts.length - 1] = this.sugList[0].exam_code; text = parts.join('');
        }
        this.commit(text);
    }

    commit(text) {
        this.paintSug([]);
        const { items, unknown } = parseEntry(text, this.allExams);
        if (!items.length) {
            if (text.trim()) this.flash('warning', `לא נמצאה בחינה "${unknown[0] || text.trim()}". הקלד קוד מלא (למשל 12א), או בחר מההצעות.`);
            return;
        }
        this.flash(null);
        $('geCode').value = unknown.join(' ');
        if (items.length === 1 && items[0].status === null && !unknown.length) {     // קוד בודד — ממתינים ל-1 / 2
            this.pending = items[0].code; this.paintPending();
            return $('gePend').focus();
        }
        items.forEach(it => this.stage(it.code, it.status));
        this.paintStage();
        const open = items.filter(it => it.status === null).length;
        const extra = [open ? `סמן עבר / לא עבר לכל שורה (או "לא מסומנות").` : '', unknown.length ? `לא זוהו: ${unknown.join(', ')}` : ''].filter(Boolean).join(' ');
        this.flash(unknown.length ? 'warning' : 'info', `נוספו ${items.length} בחינות לרשימה. ${extra}`.trim());
    }

    paintPending() {
        const el = $('gePend');
        if (!el) return;
        const ex = this.pending && this.exMap.get(this.pending);
        if (!ex) { el.classList.add('hidden'); el.innerHTML = ''; return; }
        const mine = this.mine(ex.exam_code), blocked = !mine;
        el.classList.remove('hidden');
        el.innerHTML = `<div class="p-d"><b>${esc(ex.exam_code)}</b> ${esc(this.desc(ex))}${blocked ? ` <i class="bad">מיועדת לכיתה ${esc(ex.target_grade)} ומעלה</i>` : (mine.passed !== null ? ` <i class="warn">כבר רשום: ${mine.passed ? 'עבר' : 'לא עבר'}</i>` : '')}</div>
            <div class="p-b"><button type="button" data-pend="true" class="ok"><kbd>1</kbd> עבר</button><button type="button" data-pend="false" class="bad"><kbd>2</kbd> לא עבר</button><button type="button" data-pend="x" class="ge-link">ביטול (Esc)</button></div>`;
    }

    choosePending(status) {
        const code = this.pending;
        this.pending = null; this.paintPending();
        if (status !== null && code) {
            const mine = this.mine(code);
            this.stage(code, status, mine && mine.passed !== null && mine.passed !== status ? { force: true } : {});   // תיקון מכוון — כבר מסומן "עדכן"
            this.paintStage();
        }
        $('geCode').value = ''; $('geCode').focus();
    }

    // ============================================================
    //  שמירה
    // ============================================================
    async save() {
        const btn = $('geSave');
        const send = this.rows.filter(r => this.info(r).send);
        if (!send.length || (btn && btn.disabled)) return;
        btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> שומר...';
        const r = await this.call('POST', '/student-exams', { student_code: this.student.student_code, exams: send.map(x => ({ exam_code: x.code, passed: x.status, force_update: !!x.force })) });
        if (!r.ok) {
            this.report = { error: this.errText(r, 'השמירה נכשלה. הנתונים לא נשמרו.') };
            this.paintReport(); return this.paintStage();
        }
        const { updated = [], skipped = [], errors = [] } = r.data || {};
        const done = new Map(updated.map(u => [u.exam_code, send.find(x => x.code === u.exam_code)]));
        const bad = new Map([...errors, ...skipped].map(x => [x.exam_code, x.reason]));
        this.rows = this.rows.filter(row => !done.has(row.code));
        this.rows.forEach(row => { if (bad.has(row.code)) row.err = bad.get(row.code); });
        this.report = { done: [...done.values()].map(x => ({ code: x.code, status: x.status })), problems: [...bad].map(([code, reason]) => ({ code, reason })) };
        await this.loadStudentData(this.student.student_code, true);
        this.paintReport(); this.paintStage();
        $('geCode') && $('geCode').focus();
        if (this.onChanged) { clearTimeout(this._t); this._t = setTimeout(() => this.onChanged(), 1500); }
    }

    paintReport() {
        const el = $('geReport'), r = this.report;
        if (!el) return;
        if (!r) { el.innerHTML = ''; return; }
        if (r.error) { el.innerHTML = `<div class="ge-rep bad"><b>לא נשמר</b><div>${esc(r.error)}</div><button type="button" data-rx>&times;</button></div>`; return; }
        const chips = r.done.map(x => `<i class="${x.status ? 'ok' : 'bad'}">${esc(x.code)} ${x.status ? '✓' : '✕'}</i>`).join('');
        el.innerHTML = `<div class="ge-rep ${r.problems.length ? 'warn' : 'ok'}">
            ${r.done.length ? `<div><b>נשמרו ${r.done.length} בחינות</b><div class="ge-chips">${chips}</div></div>` : ''}
            ${r.problems.length ? `<div><b>${r.problems.length} לא נשמרו</b><ul>${r.problems.map(p => `<li>${esc(p.code)}: ${esc(p.reason)}</li>`).join('')}</ul></div>` : ''}
            <button type="button" data-rx aria-label="סגור">&times;</button></div>`;
    }

    // ============================================================
    //  "מה כבר נבחן" (צד) — עם תיקון בלחיצה
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
                <span class="ge-pill ${e.passed ? 'ok' : 'bad'}">${e.passed ? '✓ עבר' : '✕ לא עבר'}</span><span class="dt">${heb(e.updated_at)}</span>
                <button type="button" data-fix="${esc(e.exam_code)}" title="תקן: הוסף לרשימה עם הסטטוס ההפוך">✎</button></div>`).join('')).join('')
            : `<div class="ge-empty small">${all.length ? 'לא נמצאו תוצאות' : 'התלמיד עדיין לא נבחן באף בחינה'}</div>`;
    }

    // ============================================================
    //  אירועים (פעם אחת, על המיכל)
    // ============================================================
    bind() {
        const c = this.container;
        c.addEventListener('input', e => {
            if (e.target.id === 'geCode') this.onCodeInput();
            if (e.target.id === 'geHQ') { this.hQ = e.target.value; this.paintHist(); }
        });
        c.addEventListener('paste', e => {                                  // הדבקת רשימה
            if (e.target.id !== 'geCode') return;
            const text = (e.clipboardData || window.clipboardData).getData('text');
            if (!/[\s,;\n]/.test(text.trim())) return;
            e.preventDefault(); this.commit(text);
        });
        c.addEventListener('keydown', e => {
            if (e.key === 'Enter' && e.ctrlKey) { e.preventDefault(); return this.save(); }     // Ctrl+Enter = שמירה, מכל מקום במסך
            if (e.target.id === 'geCode') return this.onCodeKey(e);
            if (e.target.closest && e.target.closest('#gePend')) {
                if (e.key === '1' || e.key === '+') { e.preventDefault(); this.choosePending(true); }
                else if (e.key === '2' || e.key === '-') { e.preventDefault(); this.choosePending(false); }
                else if (e.key === 'Escape') { e.preventDefault(); this.choosePending(null); }
            }
        });
        c.addEventListener('change', e => {
            if (e.target.matches('[data-force]')) { this.rows.find(r => r.code === e.target.closest('.ge-row').dataset.code).force = e.target.checked; this.paintStage(); }
        });
        c.addEventListener('click', e => {
            const t = e.target, row = t.closest('.ge-row');
            if (t.closest('#geSwitch') || t.closest('#geBack')) return this.onSwitch && this.onSwitch();
            const sg = t.closest('.ge-sg');
            if (sg) { this.commit(sg.dataset.code); return; }
            const pend = t.closest('[data-pend]');
            if (pend) return this.choosePending(pend.dataset.pend === 'x' ? null : pend.dataset.pend === 'true');
            if (t.closest('#geSave')) return this.save();
            const st = t.closest('[data-st]');
            if (st && row) { const r = this.rows.find(x => x.code === row.dataset.code); r.status = st.dataset.st === 'true'; r.err = ''; return this.paintStage(); }
            if (t.closest('[data-rm]') && row) { this.rows = this.rows.filter(r => r.code !== row.dataset.code); return this.paintStage(); }
            const fill = t.closest('[data-fill]');
            if (fill) { this.rows.forEach(r => { if (r.status === null) r.status = fill.dataset.fill === 'true'; }); return this.paintStage(); }
            if (t.closest('[data-clear]')) { this.rows = []; this.flash(null); return this.paintStage(); }
            if (t.closest('[data-mx]')) return this.flash(null);
            if (t.closest('[data-rx]')) { this.report = null; return this.paintReport(); }
            const hs = t.closest('[data-hseg]');
            if (hs) { this.hSeg = hs.dataset.hseg; return this.paintHist(); }
            const fx = t.closest('[data-fix]');
            if (fx) {
                const cur = this.mine(fx.dataset.fix);
                this.stage(fx.dataset.fix, !cur.passed, { force: true });
                this.paintStage(); this.flash('info', `בחינה ${fx.dataset.fix} נוספה לרשימה כתיקון (${!cur.passed ? 'עבר' : 'לא עבר'}). לחץ "שמור" כדי לעדכן.`);
                return;
            }
            if (!t.closest('.ge-codewrap')) this.paintSug([]);
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
        .ge-main{display:grid;grid-template-columns:minmax(0,1fr) 370px;gap:10px;flex:1;min-height:0}
        .ge-entry,.ge-hist{display:flex;flex-direction:column;min-height:0;overflow:hidden}
        .ge-eh{padding:12px 16px 4px;display:flex;flex-direction:column;gap:3px}.ge-eh h3{margin:0;font-size:1.02rem;display:flex;gap:8px;align-items:center}.ge-eh h3 i{color:var(--primary-color)}.ge-eh em{font-style:normal;color:#94a3b8;font-weight:600}
        .ge-hint{font-size:.74rem;color:#64748b}kbd{background:#f1f5f9;border:1px solid #cbd5e1;border-bottom-width:2px;border-radius:5px;padding:0 6px;font-size:.72rem;font-family:inherit;color:#334155}
        .ge-bar{padding:8px 16px;display:flex;gap:10px;flex-wrap:wrap;align-items:flex-start;flex:none}
        .ge-codewrap{position:relative;flex:1;min-width:240px}
        .ge-codewrap input{width:100%;padding:11px 14px;font-size:1.05rem;border:2px solid var(--border-color);border-radius:10px;outline:none;background:#f8fafc}
        .ge-codewrap input:focus{border-color:var(--primary-color);background:#fff;box-shadow:0 0 0 4px rgba(37,99,235,.1)}
        .ge-sug{position:absolute;top:calc(100% + 4px);right:0;left:0;background:#fff;border:1px solid var(--border-color);border-radius:10px;box-shadow:0 12px 30px rgba(15,23,42,.15);z-index:20;overflow:hidden}
        .ge-sg{display:flex;gap:10px;align-items:center;padding:7px 12px;cursor:pointer;font-size:.86rem}.ge-sg b{min-width:42px}.ge-sg span{flex:1;color:#475569;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .ge-sg.on,.ge-sg:hover{background:#eff6ff}.ge-sg i{font-style:normal;font-size:.72rem;font-weight:700}i.ok{color:#047857}i.bad{color:#b91c1c}i.warn{color:#b45309;font-style:normal}
        .ge-pend{display:flex;gap:12px;align-items:center;flex-wrap:wrap;background:#fffbeb;border:2px solid #fcd34d;border-radius:10px;padding:8px 12px;outline:none;flex:1 1 100%}
        .ge-pend:focus{box-shadow:0 0 0 4px rgba(245,158,11,.2)}.ge-pend .p-d{flex:1;min-width:200px;font-size:.9rem}.ge-pend .p-b{display:flex;gap:8px}
        .ge-pend button{border:none;border-radius:8px;padding:7px 16px;font-weight:800;cursor:pointer;font-size:.9rem}.ge-pend .ok{background:#059669;color:#fff}.ge-pend .bad{background:#dc2626;color:#fff}
        .ge-link{background:none!important;border:none;color:var(--primary-color)!important;cursor:pointer;font-size:.8rem;font-weight:600}.ge-link:hover{text-decoration:underline}
        .ge-msg{margin:0 16px 6px;padding:8px 12px;border-radius:9px;border:1px solid;display:flex;gap:10px;align-items:flex-start;font-size:.84rem;flex:none}.ge-msg div{flex:1}.ge-msg button{border:none;background:none;font-size:1.15rem;cursor:pointer;color:inherit;opacity:.6}
        .ge-msg.info{background:#eff6ff;border-color:#bfdbfe;color:#1e40af}.ge-msg.warning{background:#fffbeb;border-color:#fde68a;color:#92400e}.ge-msg.hidden{display:none}
        .ge-stage{flex:1;min-height:140px;overflow:auto;padding:0 16px}
        .ge-row{display:grid;grid-template-columns:50px 1fr auto minmax(120px,190px) 26px;gap:10px;align-items:center;padding:7px 8px;border-bottom:1px solid #eef2f7;font-size:.86rem}
        .ge-row:nth-child(even){background:#f8fafc}.ge-row .c{font-size:.95rem}.ge-row .w{color:#475569;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .ge-row.nostat{background:#fffbeb}.ge-row.blocked,.ge-row.err{background:#fef2f2}
        .ge-tog{display:inline-flex;gap:4px}.ge-tog button{border:1px solid var(--border-color);background:#fff;border-radius:8px;padding:4px 11px;font-weight:700;font-size:.8rem;cursor:pointer;color:#64748b}
        .ge-tog button.on.ok{background:#059669;border-color:#059669;color:#fff}.ge-tog button.on.bad{background:#dc2626;border-color:#dc2626;color:#fff}
        .ge-row .n{font-size:.76rem;display:flex;gap:8px;align-items:center;flex-wrap:wrap}.bad{color:#b91c1c}.warn{color:#b45309}.mut{color:#64748b}
        .ge-force{display:inline-flex;gap:4px;align-items:center;cursor:pointer;font-weight:700}.ge-x{border:none;background:none;font-size:1.2rem;color:#94a3b8;cursor:pointer}.ge-x:hover{color:#dc2626}
        .ge-empty{display:flex;flex-direction:column;align-items:center;gap:6px;padding:34px 10px;color:#64748b;text-align:center}.ge-empty i{font-size:1.8rem;color:#cbd5e1}.ge-empty.small{padding:20px 10px}
        .ge-foot{display:flex;gap:12px;align-items:center;flex-wrap:wrap;padding:10px 16px;border-top:1px solid var(--border-color);background:#f8fafc;flex:none}.ge-foot:empty{display:none}
        .ge-bulk{display:flex;gap:6px;align-items:center;font-size:.8rem;color:#475569}.ge-bulk button:not(.ge-link){border:1px solid var(--border-color);background:#fff;border-radius:7px;padding:2px 10px;cursor:pointer;font-weight:700}
        .ge-st{flex:1;display:flex;gap:10px;flex-wrap:wrap;font-size:.78rem;font-weight:600}
        .ge-rep{margin:0 16px 12px;padding:10px 14px;border-radius:10px;border:1px solid;display:flex;gap:14px;align-items:flex-start;font-size:.85rem;position:relative}.ge-rep>div{flex:1}.ge-rep>button{border:none;background:none;font-size:1.2rem;cursor:pointer;color:inherit;opacity:.6}
        .ge-rep.ok{background:#ecfdf5;border-color:#a7f3d0;color:#065f46}.ge-rep.warn{background:#fffbeb;border-color:#fde68a;color:#92400e}.ge-rep.bad{background:#fef2f2;border-color:#fecaca;color:#991b1b}
        .ge-rep ul{margin:4px 18px 0;padding:0}.ge-chips{display:flex;gap:6px;flex-wrap:wrap;margin-top:5px}.ge-chips i{font-style:normal;background:#fff;border:1px solid currentColor;border-radius:99px;padding:0 9px;font-size:.76rem;font-weight:700}
        .ge-htools{padding:6px 14px;display:flex;flex-direction:column;gap:6px}.ge-htools input{padding:6px 10px;border:1px solid var(--border-color);border-radius:8px;outline:none;background:#f8fafc}
        .ge-seg{display:inline-flex;border:1px solid var(--border-color);border-radius:8px;overflow:hidden;align-self:flex-start}.ge-seg button{border:none;background:#fff;padding:3px 12px;font-size:.78rem;font-weight:600;cursor:pointer;color:#475569}.ge-seg button+button{border-right:1px solid var(--border-color)}.ge-seg button.on{background:var(--primary-color);color:#fff}
        .ge-hlist{flex:1;overflow:auto}.ge-gh{background:#1e293b;color:#fff;padding:5px 14px;font-size:.8rem;display:flex;justify-content:space-between;position:sticky;top:0}.ge-gh em{font-style:normal;opacity:.8}
        .ge-hr{display:grid;grid-template-columns:42px 1fr auto 52px 24px;gap:6px;align-items:center;padding:5px 14px;border-bottom:1px solid #eef2f7;font-size:.8rem}.ge-hr:nth-child(even){background:#f8fafc}
        .ge-hr .w{color:#64748b;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.ge-hr .dt{color:#94a3b8;font-size:.7rem;text-align:left}.ge-hr button{border:none;background:none;cursor:pointer;color:#94a3b8}.ge-hr button:hover{color:var(--primary-color)}
        .ge-pill{border-radius:99px;padding:0 8px;font-size:.7rem;font-weight:700}.ge-pill.ok{background:#d1fae5;color:#047857}.ge-pill.bad{background:#fee2e2;color:#b91c1c}
        .ge-fail{padding:30px;text-align:center;color:#991b1b}
        @media(max-width:1000px){.ge-main{grid-template-columns:1fr}.ge-hist{max-height:320px}.ge-row{grid-template-columns:46px 1fr auto 24px}.ge-row .n{grid-column:1/-1}}`;
        document.head.appendChild(st);
    }
}
