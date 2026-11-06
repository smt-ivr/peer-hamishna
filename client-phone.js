// ============================================================
//  client-phone.js — מספרים מורשים לקו עדכון הציונים (מנהל-על + הרשאה מלאה)
//  new PhoneManager(container, apiBase, menuItem)
//  לשוניות: מספרים מורשים | יומן שיחות | היסטוריית שינויים. ההגנה האמיתית בשרת (phone_access.js).
// ============================================================

const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = (root, sel) => root.querySelector(sel);
const DAYS = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'];   // 0 = ראשון

const fmtPhone = p => { p = String(p || ''); return p.length === 10 ? `${p.slice(0, 3)}-${p.slice(3)}` : p.length === 9 ? `${p.slice(0, 2)}-${p.slice(2)}` : p; };
const fmtTime = ts => { const m = /^\d{2}(\d{2})-(\d{2})-(\d{2}) (\d{2}:\d{2})/.exec(ts || ''); return m ? `${m[3]}/${m[2]}/${m[1]} ${m[4]}` : ''; };
const untilOf = v => { const x = String(v || '').trim(); return !x ? '' : x.length === 10 ? x + ' 23:59' : x.slice(0, 16); };
const pad = n => String(n).padStart(2, '0');
const localStr = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
// בחירה מהירה של תוקף (מחושב לפי השעון של המחשב)
const QUICK = [['', 'ללא הגבלה'], ['1d', 'יום'], ['7d', 'שבוע'], ['1m', 'חודש'], ['3m', '3 חודשים'], ['1y', 'שנה']];
function quickUntil(k) {
    if (!k) return '';
    const d = new Date();
    if (k.endsWith('d')) d.setDate(d.getDate() + parseInt(k, 10));
    if (k.endsWith('m')) d.setMonth(d.getMonth() + parseInt(k, 10));
    if (k.endsWith('y')) d.setFullYear(d.getFullYear() + 1);
    return localStr(d);
}
const ACTIONS = { add: 'נוסף', edit: 'נערך', delete: 'נמחק', enable: 'הופעל', disable: 'הושבת', extend: 'הוארך', settings: 'הגדרות' };
const parseDays = s => String(s ?? '').split(',').filter(x => x !== '').map(Number);
const actionText = a => !a ? '' : a === 'continue' ? '—' : a === 'hangup' ? 'נותק' : a.startsWith('goto:') ? `הועבר לשלוחה ⁦${a.slice(5)}⁩` : a;
function daysText(days) {
    const d = [...new Set(days)].sort((a, b) => a - b);
    if (d.length === 7) return 'כל יום';
    const out = [];
    for (let i = 0; i < d.length; i++) {
        let j = i;
        while (j + 1 < d.length && d[j + 1] === d[j] + 1) j++;
        out.push(j - i >= 2 ? `${DAYS[d[i]]}–${DAYS[d[j]]}` : d.slice(i, j + 1).map(x => DAYS[x]).join(', '));
        i = j;
    }
    return out.join(', ');
}

export class PhoneManager {
    constructor(container, apiBase, menuItem) {
        Object.assign(this, { container, apiBase, menuItem });
        this.tab = 'numbers';
        this.data = null;
        this.editing = null;
        this.log = { rows: [], hasMore: false, result: '', q: '', open: {}, loaded: false };
        this.aud = { rows: [], hasMore: false, q: '', loaded: false };
        this.css();
        this.bind();
        if (menuItem) menuItem.addEventListener('click', () => this.load());
    }

    show(allowed) { if (this.menuItem) this.menuItem.classList.toggle('hidden', !allowed); }

    async call(method, path, body) {
        const opt = { method, silent: true };
        if (body !== undefined) { opt.headers = { 'Content-Type': 'application/json' }; opt.body = JSON.stringify(body); }
        try {
            const res = await fetch(`${this.apiBase}/phone${path}`, opt);
            return { ok: res.ok, status: res.status, data: await res.json().catch(() => null) };
        } catch (e) { return { ok: false, status: 0, data: { message: 'שגיאת תקשורת מול השרת.' } }; }
    }
    err(r, fb) { return (r.data && (r.data.message || r.data.error)) || fb; }

    async load() {
        if (!this.data) this.container.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i> טוען...</div>';
        const r = await this.call('GET', '');
        if (!r.ok || !r.data || !r.data.settings) {
            this.container.innerHTML = `<div class="ph-fail"><i class="fas fa-lock"></i><div>${esc(this.err(r, 'שגיאה בטעינה.'))}</div><button class="btn btn-outline btn-sm" data-ph="reload">נסה שוב</button></div>`;
            return;
        }
        this.data = r.data;
        this.data.numbers.sort((a, b) => String(a.name).localeCompare(String(b.name), 'he', { numeric: true }));
        this.blocked = { ...r.data.settings.blocked };
        this.editMinutes = r.data.settings.edit_minutes ?? 5;
        this.student = { enabled: true, require_phone: true, closed_message: '', ...(r.data.settings.student || {}) };
        this.render();
        if (this.tab === 'log') this.loadLog();
        if (this.tab === 'audit') this.loadAudit();
    }

    render() {
        if (!this.data) return;
        const t = this.data.today;
        const tab = (id, label) => `<button class="ph-tab ${this.tab === id ? 'on' : ''}" data-ph="tab" data-v="${id}">${label}</button>`;
        this.container.innerHTML = `
        <div class="ph-wrap">
            <div class="ph-head"><h2><i class="fas fa-phone-alt"></i> הרשאות טלפון</h2>
                <span class="ph-mut">קו עדכון הציונים · היום: ${t.calls} שיחות, ${t.blocked} נחסמו, ${t.updates} ציונים עודכנו</span></div>
            <div class="ph-tabs">${tab('numbers', `מספרים מורשים (${this.data.numbers.length})`)}${tab('log', 'יומן שיחות')}${tab('audit', 'היסטוריית שינויים')}</div>
            ${this.tab === 'numbers' ? this.numbersHtml() : this.tab === 'log' ? this.logHtml() : this.auditHtml()}
        </div>`;
    }

    // ============================================================
    //  מספרים מורשים
    // ============================================================
    numbersHtml() {
        const d = this.data, b = this.blocked;
        const now = (d.now || '').slice(0, 16);
        const row = n => {
            const until = untilOf(n.valid_until), expired = until && now > until;
            const perms = [n.has_pin ? '<span class="ph-ov pin"><i class="fas fa-lock"></i> סיסמה</span>' : '', n.can_override ? '<span class="ph-ov">שינוי כל ציון</span>' : '', n.can_manage ? '<span class="ph-ov mg">ניהול בטלפון</span>' : ''].join('');
            return `<tr class="${n.active && !expired ? '' : 'off'}">
            <td><b>${esc(n.name)}</b></td><td dir="ltr" class="ph-ph">${esc(fmtPhone(n.phone))}</td>
            <td>${n.sched_enabled ? `${daysText(parseDays(n.days))} <span dir="ltr">${esc(n.time_from)}–${esc(n.time_to)}</span>` : 'תמיד'}</td>
            <td class="${expired ? 'bad' : ''}">${until ? `${expired ? 'פג ב-' : 'עד '}${esc(fmtTime(until))}` : '<span class="ph-mut">ללא הגבלה</span>'}</td>
            <td>${perms || '<span class="ph-mut">—</span>'}</td>
            <td>${expired && n.active ? '<span class="ph-st">פג תוקף</span>' : `<button class="ph-st ${n.active ? 'on' : ''}" data-ph="toggle" data-v="${n.id}" title="לחיצה: ${n.active ? 'השבתה' : 'הפעלה'}">${n.active ? 'פעיל' : 'מושבת'}</button>`}</td>
            <td><button class="ph-link" data-ph="act" data-v="${n.id}" title="כל מה שהמספר עשה">${n.updates ? `${n.updates} עדכונים` : 'פעילות'}${n.last_call ? ` · ${esc(fmtTime(n.last_call))}` : ''}</button></td>
            <td class="ph-acts"><button class="ph-ico" data-ph="act" data-v="${n.id}" title="פעילות"><i class="fas fa-list-ul"></i></button><button class="ph-ico" data-ph="edit" data-v="${n.id}" title="עריכה"><i class="fas fa-pen"></i></button>
                <button class="ph-ico danger" data-ph="del" data-v="${n.id}" title="מחיקה"><i class="fas fa-trash-alt"></i></button></td></tr>`;
        };
        const sugg = d.suggestions && d.suggestions.length ? `<div class="ph-sugg"><span class="ph-mut">עדכנו ציונים בטלפון בעבר:</span>
            ${d.suggestions.map(s => `<button class="ph-chip" data-ph="add-sugg" data-v="${esc(s.phone)}" title="${s.updates} עדכונים">${esc(fmtPhone(s.phone))} <i class="fas fa-plus"></i></button>`).join('')}</div>` : '';
        return `
            ${d.numbers.length ? '' : '<div class="ph-note warn"><i class="fas fa-exclamation-triangle"></i> הרשימה ריקה, ולכן כרגע אף אחד לא יכול לעדכן ציונים בטלפון. רק מספרים שיתווספו לכאן יוכלו לעדכן.</div>'}
            <div class="card ph-card">
                <div class="ph-bar"><b>מספרים שמורשים לעדכן ציונים</b><button class="btn btn-primary btn-sm" data-ph="new"><i class="fas fa-plus"></i> הוספת מספר</button></div>
                <table class="ph-t"><thead><tr><th>שם</th><th>טלפון</th><th>מתי מורשה</th><th>תוקף</th><th>הרשאות נוספות</th><th>מצב</th><th>פעילות</th><th></th></tr></thead>
                <tbody>${d.numbers.length ? d.numbers.map(row).join('') : '<tr><td colspan="8" class="ph-empty">עדיין לא נוספו מספרים</td></tr>'}</tbody></table>
                ${sugg}
            </div>
            <div class="card ph-card ph-set">
                <div class="ph-blk"><b>שינוי ציון שכבר עודכן:</b> כל מספר מורשה יכול לשנות ציון שהזין בעצמו מהטלפון שלו, עד
                    <input class="ph-in ph-min" type="number" min="0" max="1440" data-min value="${esc(this.editMinutes)}"> דקות אחרי העדכון
                    <span class="ph-mut">(0 = לא ניתן. מספרים עם הרשאת "כל ציון" יכולים לשנות תמיד)</span></div>
                <div class="ph-blk"><b>מספר לא מורשה שמתקשר:</b>
                <span class="ph-seg"><button class="${b.action === 'hangup' ? 'on' : ''}" data-ph="bact" data-v="hangup">ניתוק</button><button class="${b.action === 'goto' ? 'on' : ''}" data-ph="bact" data-v="goto">העברה לשלוחה</button></span>
                ${b.action === 'goto' ? `<input class="ph-in ph-folder" dir="ltr" data-b="folder" value="${esc(b.folder)}" placeholder="/5">` : ''}
                <input class="ph-in ph-grow" data-b="message" value="${esc(b.message)}" placeholder="הודעה שתושמע (ריק = בלי הודעה)">
                </div>
                <div class="ph-blk ph-stu"><b><i class="fas fa-user-graduate"></i> קו התלמידים (אזור אישי):</b>
                    <span class="ph-seg"><button class="${this.student.enabled ? 'on' : ''}" data-ph="stu-open" data-v="1">פתוח</button><button class="${!this.student.enabled ? 'on bad-on' : ''}" data-ph="stu-open" data-v="0">סגור</button></span>
                    <label class="ph-chk"><input type="checkbox" data-stu="require_phone" ${this.student.require_phone ? 'checked' : ''}> כניסה רק מטלפון שרשום אצל התלמיד</label>
                    ${this.student.enabled ? '' : `<input class="ph-in ph-grow" data-stu="closed_message" value="${esc(this.student.closed_message)}" placeholder="הודעה כשהקו סגור">`}</div>
                ${(() => { const sp = d.student_phones || {}; const missing = (sp.total || 0) - (sp.with_phone || 0);
                    return this.student.enabled && this.student.require_phone && missing > 0
                        ? `<div class="ph-note warn"><i class="fas fa-exclamation-triangle"></i> רק ל-${sp.with_phone || 0} מתוך ${sp.total} תלמידים רשום טלפון. ${missing} התלמידים האחרים לא יוכלו להיכנס לאזור האישי עד שיוזן להם טלפון בניהול תלמידים (או עד שתבטלו את הסימון "כניסה רק מטלפון שרשום אצל התלמיד").</div>` : ''; })()}
                <div class="ph-sfoot"><button class="btn btn-primary btn-sm" data-ph="save-blk" ${this.blkDirty ? '' : 'disabled'}><i class="fas fa-save"></i> שמירת הגדרות</button></div>
            </div>`;
    }

    // ---------- מודל הוספה / עריכה ----------
    openModal(e) {
        this.editing = e;
        const days = new Set(e.days);
        let m = document.getElementById('phModal');
        if (!m) {
            document.body.insertAdjacentHTML('beforeend', '<div id="phModal" class="modal hidden" style="z-index:9990"><div class="modal-content ph-mc"></div></div>');
            m = document.getElementById('phModal');
            this.bindModal(m);
        }
        m.firstElementChild.innerHTML = `
            <div class="modal-header"><h3>${e.id ? '<i class="fas fa-pen"></i> עריכת מספר' : '<i class="fas fa-plus-circle"></i> מספר מורשה חדש'}</h3>
                <button type="button" class="close-modal-btn" data-phm="close" aria-label="סגור">&times;</button></div>
            <form class="ph-mform" id="phForm" data-ph-form autocomplete="off">
                <label>שם<input name="name" class="ph-in" value="${esc(e.name)}" required></label>
                <label>מספר טלפון<input name="phone" class="ph-in" dir="ltr" value="${esc(e.phone)}" placeholder="0501234567" inputmode="tel" required></label>
                <label>סיסמה לטלפון (רשות, 4 עד 8 ספרות)<input name="pin" class="ph-in" dir="ltr" type="password" inputmode="numeric" autocomplete="new-password" maxlength="8"
                    placeholder="${e.has_pin ? 'מוגדרת סיסמה · השאירו ריק כדי לא לשנות' : 'בלי סיסמה'}"></label>
                ${e.has_pin ? '<label class="ph-chk"><input type="checkbox" name="pin_clear"> הסרת הסיסמה</label>' : ''}
                <div class="ph-exp"><span class="ph-lbl">תוקף ההרשאה</span>
                    <span class="ph-quick">${QUICK.map(([k, l]) => `<button type="button" data-quick="${k}">${l}</button>`).join('')}</span>
                    <span class="ph-hm">עד <input type="datetime-local" name="valid_until" class="ph-in" value="${esc(untilOf(e.valid_until).replace(' ', 'T'))}"> <span class="ph-mut" data-exp-note>${e.valid_until ? '' : 'ללא הגבלה'}</span></span></div>
                <label class="ph-chk"><input type="checkbox" name="can_override" ${e.can_override ? 'checked' : ''}> מורשה לשנות כל ציון שכבר עודכן (גם ציון שהוזן ממקום אחר)</label>
                <label class="ph-chk"><input type="checkbox" name="can_manage" ${e.can_manage ? 'checked' : ''}> מורשה לנהל הרשאות טלפון דרך הטלפון (0 וסולמית במקום קוד תלמיד)</label>
                <label class="ph-chk"><input type="checkbox" name="sched" ${e.sched_enabled ? 'checked' : ''}> רק בימים ובשעות מסוימים</label>
                <div class="ph-sched ${e.sched_enabled ? '' : 'hidden'}">
                    <span class="ph-days">${DAYS.map((l, i) => `<label class="${days.has(i) ? 'on' : ''}"><input type="checkbox" name="day" value="${i}" ${days.has(i) ? 'checked' : ''}>${l}</label>`).join('')}</span>
                    <span class="ph-hm">משעה <input type="time" name="time_from" class="ph-in" value="${esc(e.time_from)}"> עד <input type="time" name="time_to" class="ph-in" value="${esc(e.time_to)}"></span>
                </div>
                <div class="ph-ferr" data-ph-ferr></div>
            </form>
            <div class="ph-mfoot"><button type="button" class="btn btn-outline" data-phm="close">ביטול</button>
                <button type="submit" form="phForm" class="btn btn-primary" data-phm="save"><i class="fas fa-save"></i> ${e.id ? 'שמירה' : 'הוספה'}</button></div>`;
        m.classList.remove('hidden');
        setTimeout(() => { const i = m.querySelector(e.name ? '[name="phone"]' : '[name="name"]'); if (i) i.focus(); }, 30);
    }
    closeModal() { const m = document.getElementById('phModal'); if (m) m.classList.add('hidden'); this.editing = null; }
    bindModal(m) {
        m.addEventListener('click', ev => {
            const b = ev.target.closest('[data-phm]');
            if (!b || b.disabled) return;
            if (b.dataset.phm === 'close') return this.closeModal();
        });
        m.addEventListener('click', ev => {
            const q = ev.target.closest('[data-quick]');
            if (!q) return;
            const inp = m.querySelector('[name="valid_until"]'), v = quickUntil(q.dataset.quick);
            inp.value = v.replace(' ', 'T');
            m.querySelector('[data-exp-note]').textContent = v ? '' : 'ללא הגבלה';
            m.querySelectorAll('[data-quick]').forEach(b => b.classList.toggle('on', b === q));
        });
        m.addEventListener('change', ev => {
            const t = ev.target;
            if (t.name === 'valid_until') { m.querySelector('[data-exp-note]').textContent = t.value ? '' : 'ללא הגבלה'; m.querySelectorAll('[data-quick]').forEach(b => b.classList.remove('on')); }
            if (t.name === 'day') t.parentElement.classList.toggle('on', t.checked);
            if (t.name === 'sched') m.querySelector('.ph-sched').classList.toggle('hidden', !t.checked);
        });
        m.addEventListener('submit', ev => { ev.preventDefault(); this.saveNumber(ev.target, m.querySelector('[data-phm="save"]')); });
        m.addEventListener('input', () => { const el = m.querySelector('[data-ph-ferr]'); if (el) el.textContent = ''; });
        document.addEventListener('keydown', ev => { if (ev.key === 'Escape' && !m.classList.contains('hidden')) this.closeModal(); });
    }

    readForm(form) {
        const v = n => form.querySelector(`[name="${n}"]`).value;
        return { ...this.editing, name: v('name').trim(), phone: v('phone').trim(), can_override: form.querySelector('[name="can_override"]').checked, can_manage: form.querySelector('[name="can_manage"]').checked,
            pin: v('pin').trim(), pin_clear: !!(form.querySelector('[name="pin_clear"]') || {}).checked,
            valid_until: v('valid_until'), sched_enabled: form.querySelector('[name="sched"]').checked,
            days: [...form.querySelectorAll('[name="day"]:checked')].map(x => Number(x.value)), time_from: v('time_from') || '00:00', time_to: v('time_to') || '23:59' };
    }

    async saveNumber(form, btn) {
        const e = this.readForm(form), errEl = $(form, '[data-ph-ferr]');
        if (!e.name || !e.phone) { errEl.textContent = 'יש להזין שם ומספר טלפון.'; return; }
        if (e.pin && !/^\d{4,8}$/.test(e.pin)) { errEl.textContent = 'הסיסמה חייבת להיות 4 עד 8 ספרות.'; return; }
        if (btn) btn.disabled = true;
        const r = e.id ? await this.call('PUT', `/numbers?id=${e.id}`, e) : await this.call('POST', '/numbers', e);
        if (btn) btn.disabled = false;
        if (!r.ok) { errEl.textContent = this.err(r, 'השמירה נכשלה.'); return; }
        this.closeModal();
        window.notify(e.id ? 'המספר עודכן' : 'המספר נוסף', 'success', { duration: 2000 });
        this.load();
    }
    async toggleNumber(n) {
        const r = await this.call('PUT', `/numbers?id=${n.id}`, { ...n, days: parseDays(n.days), active: !n.active });
        if (!r.ok) return window.notify(this.err(r, 'העדכון נכשל.'), 'error');
        this.load();
    }
    async deleteNumber(n) {
        if (!(await window.customConfirm(`למחוק את ${n.name} (${fmtPhone(n.phone)})?`))) return;
        const r = await this.call('DELETE', `/numbers?id=${n.id}`);
        if (!r.ok) return window.notify(this.err(r, 'המחיקה נכשלה.'), 'error');
        this.load();
    }
    async saveBlocked() {
        const r = await this.call('PUT', '/settings', { settings: { edit_minutes: parseInt(this.editMinutes, 10) || 0, blocked: this.blocked, student: this.student } });
        if (!r.ok) return window.notify(this.err(r, 'השמירה נכשלה.'), 'error');
        this.blkDirty = false;
        window.notify('נשמר', 'success', { duration: 2000 });
        this.load();
    }

    // ============================================================
    //  יומן שיחות
    // ============================================================
    async loadLog(more = false) {
        const L = this.log, qs = new URLSearchParams({ limit: '100' });
        if (L.result) qs.set('result', L.result);
        if (L.q.trim()) qs.set('q', L.q.trim());
        if (L.line === 'student') qs.set('line', 'student');
        if (more && L.rows.length) qs.set('before_id', String(L.rows[L.rows.length - 1].id));
        const seq = (this.logSeq = (this.logSeq || 0) + 1);
        const r = await this.call('GET', `/log?${qs}`);
        if (seq !== this.logSeq || this.tab !== 'log') return;
        if (!r.ok || !r.data) return window.notify(this.err(r, 'שגיאה בטעינת היומן.'), 'error');
        L.rows = more ? L.rows.concat(r.data.rows) : r.data.rows;
        L.hasMore = r.data.has_more; L.loaded = true;
        this.paintLog();
    }

    logHtml() {
        const L = this.log, seg = (v, t) => `<button class="${L.result === v ? 'on' : ''}" data-ph="log-result" data-v="${v}">${t}</button>`;
        return `<div class="card ph-card">
            <div class="ph-bar"><span class="ph-seg"><button class="${L.line !== 'student' ? 'on' : ''}" data-ph="log-line" data-v="manager">קו עדכון ציונים</button><button class="${L.line === 'student' ? 'on' : ''}" data-ph="log-line" data-v="student">קו תלמידים</button></span>
                <span class="ph-seg">${seg('', 'הכל')}${seg('allowed', L.line === 'student' ? 'מורשים' : 'אושרו')}${seg('blocked', 'נחסמו')}</span>
                <input class="ph-in ph-grow" data-ph-logq placeholder="${L.line === 'student' ? 'חיפוש לפי תלמיד, קוד או מספר...' : 'חיפוש לפי שם או מספר...'}" value="${esc(L.q)}"></div>
            <div data-ph-log>${L.loaded ? '' : '<div class="ph-empty"><i class="fas fa-spinner fa-spin"></i></div>'}</div></div>`;
    }

    paintLog() {
        const box = $(this.container, '[data-ph-log]');
        if (!box) return;
        const L = this.log, R = this.data.reasons || {};
        if (L.line === 'student') return this.paintStudentLog(box);
        const rows = L.rows.map(r => {
            const ok = String(r.reason).startsWith('ok_'), open = L.open[r.id];
            const upd = r.updates ? `<button class="ph-upd" data-ph="upd" data-v="${r.id}">${r.updates} <i class="fas fa-chevron-${open ? 'up' : 'down'}"></i></button>` : '';
            const det = open ? `<tr class="ph-det"><td colspan="6">${open === 'loading' ? '<i class="fas fa-spinner fa-spin"></i>' : open.map(u =>
                `<div>${esc(u.created_at.slice(11, 16))} · <b>${esc(u.student_name)}</b> (${esc(u.student_code)}) · מבחן <b>${esc(u.exam_code)}</b> · <span class="${u.passed === 1 ? 'ok' : 'bad'}">${u.reason === 'changed' ? 'שונה ל' : ''}${u.passed === 1 ? 'עבר' : 'לא עבר'}</span></div>`).join('')}</td></tr>` : '';
            return `<tr><td class="ph-mut">${esc(fmtTime(r.created_at))}</td><td dir="ltr" class="ph-ph">${r.phone ? esc(fmtPhone(r.phone)) : 'חסוי'}</td>
                <td>${esc(r.number_name || '')}</td><td class="${ok ? 'ok' : 'bad'}">${esc(R[r.reason] || r.reason)}</td><td>${esc(actionText(r.action))}</td><td>${upd}</td></tr>${det}`;
        }).join('');
        box.innerHTML = `<table class="ph-t"><thead><tr><th>מתי</th><th>טלפון</th><th>שם</th><th>תוצאה</th><th>פעולה</th><th>ציונים</th></tr></thead>
            <tbody>${rows || '<tr><td colspan="6" class="ph-empty">אין שיחות</td></tr>'}</tbody></table>
            ${L.hasMore ? '<div style="text-align:center;padding:10px"><button class="btn btn-outline btn-sm" data-ph="log-more">טען עוד</button></div>' : ''}`;
    }

    // יומן קו התלמידים: כל אירוע — שיחה, כניסה לתלמיד (מורשה / נדחה), שמיעת פירוט, בדיקת מבחן
    paintStudentLog(box) {
        const L = this.log;
        const T = { ok_open: ['שיחה נכנסה', 'ok'], line_closed: ['הקו סגור', 'bad'], no_caller_id: ['מספר חסוי', 'bad'], ok: ['נכנס לאזור האישי', 'ok'],
                    wrong_code: ['קוד תלמיד שגוי', 'bad'], phone_mismatch: ['הטלפון לא רשום אצל התלמיד', 'bad'], too_many: ['יותר מדי ניסיונות, נותק', 'bad'],
                    summary: ['שמע פירוט', ''], exam: ['בדק מבחן', ''] };
        const rows = L.rows.map(r => {
            const [label, cls] = T[r.reason] || [r.reason, ''];
            const exam = r.reason === 'exam' ? ` <b>${esc(r.exam_code)}</b> · <span class="${r.passed === 1 ? 'ok' : r.passed == null ? 'ph-mut' : 'bad'}">${r.passed === 1 ? 'עבר' : r.passed == null ? 'טרם נבחן' : 'לא עבר'}</span>` : '';
            return `<tr><td class="ph-mut">${esc(fmtTime(r.created_at))}</td><td dir="ltr" class="ph-ph">${r.phone ? esc(fmtPhone(r.phone)) : 'חסוי'}</td>
                <td>${r.student_name ? `<b>${esc(r.student_name)}</b> <span class="ph-mut">(${esc(r.student_code)})</span>` : r.student_code ? `<span class="ph-mut">קוד ${esc(r.student_code)}</span>` : ''}</td>
                <td class="${cls}">${label}${exam}</td></tr>`;
        }).join('');
        box.innerHTML = `<table class="ph-t"><thead><tr><th>מתי</th><th>טלפון</th><th>תלמיד</th><th>מה קרה</th></tr></thead>
            <tbody>${rows || '<tr><td colspan="4" class="ph-empty">אין עדיין פעילות בקו התלמידים</td></tr>'}</tbody></table>
            ${L.hasMore ? '<div style="text-align:center;padding:10px"><button class="btn btn-outline btn-sm" data-ph="log-more">טען עוד</button></div>' : ''}`;
    }

    async toggleUpdates(id) {
        const L = this.log, row = L.rows.find(r => String(r.id) === String(id));
        if (!row) return;
        if (L.open[id]) { delete L.open[id]; return this.paintLog(); }
        L.open[id] = 'loading'; this.paintLog();
        const r = await this.call('GET', `/log/updates?call_id=${encodeURIComponent(row.call_id)}`);
        L.open[id] = r.ok && r.data ? r.data.rows : []; this.paintLog();
    }

    // ============================================================
    //  פעילות של מספר: כל מה שעשה ועדכן
    // ============================================================
    async openActivity(num) {
        let m = document.getElementById('phAct');
        if (!m) {
            document.body.insertAdjacentHTML('beforeend', '<div id="phAct" class="modal hidden" style="z-index:9991"><div class="modal-content ph-ac"></div></div>');
            m = document.getElementById('phAct');
            m.addEventListener('click', ev => { if (ev.target.closest('[data-pha="close"]')) m.classList.add('hidden'); });
            document.addEventListener('keydown', ev => { if (ev.key === 'Escape' && !m.classList.contains('hidden')) m.classList.add('hidden'); });
        }
        const head = `<div class="modal-header"><h3><i class="fas fa-list-ul"></i> ${esc(num.name)} <span class="ph-mut" dir="ltr">${esc(fmtPhone(num.phone))}</span></h3>
            <button type="button" class="close-modal-btn" data-pha="close" aria-label="סגור">&times;</button></div>`;
        m.firstElementChild.innerHTML = head + '<div class="ph-acb"><div class="ph-empty"><i class="fas fa-spinner fa-spin"></i></div></div>';
        m.classList.remove('hidden');
        const r = await this.call('GET', `/activity?phone=${encodeURIComponent(num.phone)}`);
        const body = m.querySelector('.ph-acb');
        if (!r.ok || !r.data) { body.innerHTML = `<div class="ph-empty">${esc(this.err(r, 'שגיאה בטעינה.'))}</div>`; return; }
        const d = r.data, R = d.reasons || {};
        // ציר זמן אחד: שיחות, עדכונים, פעולות ניהול שביצע בטלפון, ושינויים שנעשו בהרשאה שלו
        const items = [
            ...d.log.map(x => ({ t: x.created_at, k: x.event === 'call' ? 'call' : 'upd', x })),
            ...d.manage.map(x => ({ t: x.created_at, k: 'mng', x })),
            ...d.permission_history.map(x => ({ t: x.created_at, k: 'perm', x }))
        ].sort((a, b) => (a.t < b.t ? 1 : a.t > b.t ? -1 : 0));
        const line = ({ k, x }) => {
            const tm = `<span class="ph-mut ph-tm">${esc(fmtTime(x.created_at))}</span>`;
            if (k === 'call') { const ok = String(x.reason).startsWith('ok_'); return `<div class="ph-ev call">${tm}<i class="fas fa-phone"></i> שיחה · <span class="${ok ? 'ok' : 'bad'}">${esc(R[x.reason] || x.reason)}</span>${ok ? '' : ` · ${esc(actionText(x.action))}`}</div>`; }
            if (k === 'upd') return `<div class="ph-ev upd">${tm}<i class="fas fa-pen"></i> <b>${esc(x.student_name)}</b> (${esc(x.student_code)}) · מבחן <b>${esc(x.exam_code)}</b> · <span class="${x.passed === 1 ? 'ok' : 'bad'}">${x.reason === 'changed' ? 'שונה ל' : ''}${x.passed === 1 ? 'עבר' : 'לא עבר'}</span></div>`;
            if (k === 'mng') return `<div class="ph-ev mng">${tm}<i class="fas fa-user-shield"></i> ${ACTIONS[x.action] || x.action} הרשאה למספר <span dir="ltr">${esc(fmtPhone(x.phone))}</span>${x.details ? ` · <span class="ph-mut">${esc(x.details)}</span>` : ''}</div>`;
            return `<div class="ph-ev perm">${tm}<i class="fas fa-key"></i> ההרשאה שלו ${ACTIONS[x.action] || x.action} ${x.source === 'phone' ? 'בטלפון' : 'באתר'} ע"י ${esc(x.actor || '')}${x.details ? ` · <span class="ph-mut">${esc(x.details)}</span>` : ''}</div>`;
        };
        const st = d.stats;
        body.innerHTML = `<div class="ph-acs"><span><b>${st.calls}</b> שיחות</span><span><b class="bad">${st.blocked}</b> נחסמו</span><span><b class="ok">${st.saved}</b> ציונים הוזנו</span><span><b>${st.changed}</b> ציונים שונו</span><span><b>${d.manage.length}</b> פעולות ניהול</span></div>
            <div class="ph-evs">${items.length ? items.map(line).join('') : '<div class="ph-empty">אין עדיין פעילות</div>'}</div>`;
    }

    // ============================================================
    //  היסטוריית שינויים בהרשאות
    // ============================================================
    async loadAudit(more = false) {
        const A = this.aud, qs = new URLSearchParams();
        if (A.q.trim()) qs.set('q', A.q.trim());
        if (more && A.rows.length) qs.set('before_id', String(A.rows[A.rows.length - 1].id));
        const seq = (this.audSeq = (this.audSeq || 0) + 1);
        const r = await this.call('GET', `/audit?${qs}`);
        if (seq !== this.audSeq || this.tab !== 'audit') return;
        if (!r.ok || !r.data) return window.notify(this.err(r, 'שגיאה בטעינה.'), 'error');
        A.rows = more ? A.rows.concat(r.data.rows) : r.data.rows; A.hasMore = r.data.has_more; A.loaded = true;
        this.paintAudit();
    }
    auditHtml() {
        return `<div class="card ph-card"><div class="ph-bar"><input class="ph-in ph-grow" data-ph-audq placeholder="חיפוש לפי שם, מספר או מי ביצע..." value="${esc(this.aud.q)}"></div>
            <div data-ph-aud>${this.aud.loaded ? '' : '<div class="ph-empty"><i class="fas fa-spinner fa-spin"></i></div>'}</div></div>`;
    }
    paintAudit() {
        const box = $(this.container, '[data-ph-aud]');
        if (!box) return;
        const A = this.aud;
        const rows = A.rows.map(r => `<tr><td class="ph-mut">${esc(fmtTime(r.created_at))}</td>
            <td><span class="ph-act a-${esc(r.action)}">${ACTIONS[r.action] || esc(r.action)}</span></td>
            <td>${r.action === 'settings' ? '<span class="ph-mut">הגדרות הקו</span>' : `<b>${esc(r.name || '')}</b> <span dir="ltr" class="ph-ph">${esc(fmtPhone(r.phone))}</span>`}</td>
            <td class="ph-det2">${esc(r.details || '')}</td>
            <td>${r.source === 'phone' ? '<i class="fas fa-phone"></i> ' : '<i class="fas fa-desktop"></i> '}${esc(r.actor || '')}</td></tr>`).join('');
        box.innerHTML = `<table class="ph-t"><thead><tr><th>מתי</th><th>פעולה</th><th>מספר</th><th>מה השתנה</th><th>מי ביצע</th></tr></thead>
            <tbody>${rows || '<tr><td colspan="5" class="ph-empty">אין עדיין שינויים</td></tr>'}</tbody></table>
            ${A.hasMore ? '<div style="text-align:center;padding:10px"><button class="btn btn-outline btn-sm" data-ph="aud-more">טען עוד</button></div>' : ''}`;
    }

    // ============================================================
    bind() {
        const c = this.container;
        const blank = (phone = '') => ({ id: null, name: '', phone, can_override: false, can_manage: false, valid_until: '', sched_enabled: false, days: [0, 1, 2, 3, 4, 5], time_from: '08:00', time_to: '22:00' });
        c.addEventListener('click', ev => {
            const b = ev.target.closest('[data-ph]');
            if (!b || b.disabled) return;
            const act = b.dataset.ph, v = b.dataset.v, num = this.data && this.data.numbers.find(n => String(n.id) === String(v));
            if (act === 'reload') return this.load();
            if (act === 'tab') { this.tab = v; this.render(); if (v === 'log') this.loadLog(); if (v === 'audit') this.loadAudit(); return; }
            if (act === 'new' || act === 'add-sugg') return this.openModal(blank(act === 'add-sugg' ? v : ''));
            if (act === 'edit' && num) return this.openModal({ ...num, days: parseDays(num.days), sched_enabled: !!num.sched_enabled, can_override: !!num.can_override, can_manage: !!num.can_manage });
            if (act === 'act' && num) return this.openActivity(num);
            if (act === 'aud-more') return this.loadAudit(true);
            if (act === 'toggle' && num) return this.toggleNumber(num);
            if (act === 'del' && num) return this.deleteNumber(num);
            if (act === 'bact') { this.blocked.action = v; this.blkDirty = true; return this.render(); }
            if (act === 'save-blk') return this.saveBlocked();
            if (act === 'log-result') { this.log.result = v; this.render(); return this.loadLog(); }
            if (act === 'log-line') { this.log.line = v; this.log.rows = []; this.log.open = {}; this.log.loaded = false; this.render(); return this.loadLog(); }
            if (act === 'stu-open') { this.student.enabled = v === '1'; this.blkDirty = true; return this.render(); }
            if (act === 'log-more') return this.loadLog(true);
            if (act === 'upd') return this.toggleUpdates(v);
        });
        c.addEventListener('change', ev => {
            const t = ev.target;
            if (t.dataset.stu === 'require_phone') { this.student.require_phone = t.checked; this.blkDirty = true; const s = $(c, '[data-ph="save-blk"]'); if (s) s.disabled = false; }
        });
        c.addEventListener('input', ev => {
            const t = ev.target;
            if (t.matches('[data-min]')) { this.editMinutes = t.value; this.blkDirty = true; const s = $(c, '[data-ph="save-blk"]'); if (s) s.disabled = false; return; }
            if (t.dataset.stu === 'closed_message') { this.student.closed_message = t.value; this.blkDirty = true; const s = $(c, '[data-ph="save-blk"]'); if (s) s.disabled = false; return; }
            if (t.dataset.b) { this.blocked[t.dataset.b] = t.value; this.blkDirty = true; const s = $(c, '[data-ph="save-blk"]'); if (s) s.disabled = false; return; }
            if (t.matches('[data-ph-audq]')) { clearTimeout(this._aq); this.aud.q = t.value; this._aq = setTimeout(() => this.loadAudit(), 350); return; }
            if (t.matches('[data-ph-logq]')) { clearTimeout(this._lq); this.log.q = t.value; this._lq = setTimeout(() => this.loadLog(), 350); }
        });
    }

    css() {
        if (document.getElementById('phStyles')) return;
        const st = document.createElement('style');
        st.id = 'phStyles';
        st.textContent = `
        #view-phone{overflow-y:auto}
        .ph-wrap{display:flex;flex-direction:column;gap:10px;padding-bottom:20px}
        .ph-head{display:flex;align-items:baseline;gap:12px;flex-wrap:wrap}.ph-head h2{font-size:1.2rem;margin:0;display:flex;gap:8px;align-items:center}.ph-head h2 i{color:#7c3aed}
        .ph-mut{color:#64748b;font-size:.8rem}.ok{color:#047857}.bad{color:#b91c1c}
        .ph-tabs{display:flex;gap:4px;border-bottom:1px solid var(--border-color)}
        .ph-tab{border:none;background:none;padding:7px 14px;font-weight:700;font-size:.86rem;color:#64748b;cursor:pointer;border-bottom:3px solid transparent;font-family:inherit}.ph-tab.on{color:var(--primary-color);border-bottom-color:var(--primary-color)}
        .ph-card{padding:12px 14px}
        .ph-bar{display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:8px}
        .ph-in{padding:6px 9px;border:1px solid var(--border-color);border-radius:6px;font-size:.86rem;font-family:inherit}.ph-grow{flex:1;min-width:160px}.ph-folder{width:70px}
        .ph-t{width:100%;border-collapse:collapse;font-size:.86rem}
        .ph-t th{text-align:right;font-weight:600;color:#64748b;padding:6px 8px;border-bottom:1px solid var(--border-color);white-space:nowrap}
        .ph-t td{padding:7px 8px;border-bottom:1px solid #f1f5f9;vertical-align:middle}.ph-t tr.off td{opacity:.5}
        .ph-ph{font-family:ui-monospace,Menlo,Consolas,monospace;white-space:nowrap;text-align:right}
        .ph-st{border:1px solid #fecaca;background:#fef2f2;color:#b91c1c;border-radius:99px;padding:1px 10px;font-size:.75rem;font-weight:700;cursor:pointer;font-family:inherit}.ph-st.on{border-color:#a7f3d0;background:#ecfdf5;color:#047857}
        .ph-acts{white-space:nowrap;text-align:left}.ph-ico{background:none;border:none;color:#64748b;cursor:pointer;padding:4px 6px;border-radius:4px}.ph-ico:hover{background:#f1f5f9;color:var(--primary-color)}.ph-ico.danger:hover{color:var(--danger)}
        .ph-empty{text-align:center;color:#64748b;padding:18px}
        .ph-note.warn{background:#fffbeb;border-color:#fde68a;color:#92400e}
        .ph-note{background:#eff6ff;border:1px solid #bfdbfe;color:#1e40af;border-radius:8px;padding:9px 12px;font-size:.85rem;display:flex;gap:8px;align-items:center}
        .ph-mc{max-width:440px;width:94%;height:auto;border-radius:12px;overflow:hidden}
        .ph-mform{padding:16px 18px;display:flex;flex-direction:column;gap:12px}
        .ph-mform>label:not(.ph-chk){display:flex;flex-direction:column;gap:4px;font-size:.8rem;font-weight:600;color:#475569}
        .ph-mform .ph-in{padding:8px 10px;font-size:.92rem}
        .ph-sched{display:flex;flex-direction:column;align-items:flex-start;gap:10px;background:#f8fafc;border:1px solid var(--border-color);border-radius:8px;padding:10px 12px}
        .ph-hm{display:inline-flex;align-items:center;gap:6px;font-size:.85rem;color:#475569}
        .ph-mfoot{display:flex;justify-content:flex-end;gap:8px;padding:12px 18px;border-top:1px solid var(--border-color);background:#f8fafc}
        .ph-chk{display:inline-flex;align-items:center;gap:5px;font-size:.85rem;cursor:pointer}
        .ph-sched.hidden{display:none}
        .ph-days{display:inline-flex;gap:2px}.ph-days input{display:none}
        .ph-days label{width:26px;height:26px;border:1px solid var(--border-color);border-radius:5px;display:inline-flex;align-items:center;justify-content:center;font-weight:700;font-size:.8rem;cursor:pointer;background:#fff;color:#64748b;user-select:none}
        .ph-days label.on{background:var(--primary-color);border-color:var(--primary-color);color:#fff}
        .ph-ferr{width:100%;color:#b91c1c;font-size:.82rem}.ph-ferr:empty{display:none}
        .ph-sugg{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-top:10px}
        .ph-chip{border:1px dashed #93c5fd;background:#fff;color:#1d4ed8;border-radius:99px;padding:2px 10px;font-size:.78rem;cursor:pointer;font-family:ui-monospace,Menlo,Consolas,monospace;direction:ltr}
        .ph-set{display:flex;flex-direction:column;gap:12px}
        .ph-blk{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:.88rem}.ph-min{width:70px;text-align:center}
        .ph-sfoot{display:flex;justify-content:flex-end;border-top:1px solid #f1f5f9;padding-top:10px}
        .ph-stu{padding-top:10px;border-top:1px solid #f1f5f9}.ph-stu b i{color:var(--primary-color)}.ph-seg button.bad-on{background:#dc2626}
        .ph-ov.mg{background:#fef3c7;color:#92400e}.ph-ov.pin{background:#e0f2fe;color:#0369a1}.ph-ov+.ph-ov{margin-right:4px}
        .ph-link{border:none;background:none;color:var(--primary-color);cursor:pointer;font-size:.8rem;padding:0;font-family:inherit}.ph-link:hover{text-decoration:underline}
        .ph-exp{display:flex;flex-direction:column;gap:6px}.ph-lbl{font-size:.8rem;font-weight:600;color:#475569}
        .ph-quick{display:inline-flex;flex-wrap:wrap;gap:4px}.ph-quick button{border:1px solid var(--border-color);background:#fff;border-radius:99px;padding:2px 11px;font-size:.78rem;cursor:pointer;font-family:inherit}
        .ph-quick button.on,.ph-quick button:hover{background:var(--primary-color);border-color:var(--primary-color);color:#fff}
        .ph-ac{max-width:720px;width:94%;height:auto;max-height:88vh;border-radius:12px;overflow:hidden;display:flex;flex-direction:column}
        .ph-acb{overflow:auto;padding:12px 16px}.ph-acs{display:flex;gap:14px;flex-wrap:wrap;font-size:.85rem;color:#475569;margin-bottom:10px;padding-bottom:10px;border-bottom:1px solid var(--border-color)}.ph-acs b{color:#0f172a}
        .ph-ev{display:flex;gap:8px;align-items:baseline;padding:6px 4px;border-bottom:1px solid #f1f5f9;font-size:.86rem;flex-wrap:wrap}.ph-ev>i{color:#94a3b8;width:14px;text-align:center}
        .ph-ev.upd>i{color:var(--primary-color)}.ph-ev.mng>i,.ph-ev.perm>i{color:#b45309}.ph-tm{min-width:92px}
        .ph-act{border-radius:99px;padding:1px 9px;font-size:.75rem;font-weight:700;background:#f1f5f9;color:#475569;white-space:nowrap}
        .ph-act.a-add,.ph-act.a-enable,.ph-act.a-extend{background:#ecfdf5;color:#047857}.ph-act.a-delete,.ph-act.a-disable{background:#fef2f2;color:#b91c1c}.ph-act.a-edit,.ph-act.a-settings{background:#eff6ff;color:#1d4ed8}
        .ph-det2{font-size:.8rem;color:#334155;max-width:420px}
        .ph-ov{background:#ede9fe;color:#6d28d9;border-radius:99px;padding:1px 9px;font-size:.75rem;font-weight:700;white-space:nowrap}
        .ph-seg{display:inline-flex;border:1px solid var(--border-color);border-radius:6px;overflow:hidden;background:#fff}
        .ph-seg button{border:none;background:none;padding:5px 11px;font-size:.8rem;font-weight:600;color:#475569;cursor:pointer;font-family:inherit}
        .ph-seg button+button{border-right:1px solid var(--border-color)}.ph-seg button.on{background:var(--primary-color);color:#fff}
        .ph-upd{border:1px solid #bfdbfe;background:#eff6ff;color:#1d4ed8;border-radius:99px;padding:0 9px;font-size:.76rem;font-weight:700;cursor:pointer}
        .ph-det td{background:#f8fafc;font-size:.82rem;line-height:1.8;padding:6px 18px}
        .ph-fail{text-align:center;padding:40px 20px;color:#475569;display:flex;flex-direction:column;gap:12px;align-items:center}.ph-fail>i{font-size:2rem;color:#94a3b8}
        @media(max-width:768px){.ph-t{font-size:.8rem}}`;
        document.head.appendChild(st);
    }
}
