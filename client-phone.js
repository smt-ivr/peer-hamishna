// ============================================================
//  client-phone.js — הרשאות הטלפון (ימות המשיח) — למנהל-על בלבד
//  new PhoneManager(container, apiBase, menuItem)
//  לשוניות: מספרים מורשים | הגדרות קווים | יומן שיחות | בדיקת מספר
//  ההגנה האמיתית בשרת (phone_access.js / phone_admin.js) — כאן רק ממשק.
// ============================================================

const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = (root, sel) => root.querySelector(sel);
const DAYS = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'];   // 0 = ראשון
const LINES = { manager: 'קו עדכון ציונים', student: 'קו תלמידים' };
const MODES = { open: ['פתוח לכולם', 'כל מספר יכול להתקשר'], whitelist: ['רשימה לבנה', 'רק מספרים מורשים'], off: ['כבוי', 'הקו סגור לכולם'] };

const fmtPhone = p => { p = String(p || ''); return p.length === 10 ? `${p.slice(0, 3)}-${p.slice(3)}` : p.length === 9 ? `${p.slice(0, 2)}-${p.slice(2)}` : p; };
const fmtDate = d => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d || ''); return m ? `${m[3]}/${m[2]}/${m[1].slice(2)}` : ''; };
const fmtTime = ts => { const s = String(ts || ''); return s ? `${fmtDate(s)} ${s.slice(11, 16)}` : ''; };

// "א–ה, ש" מתוך [0,1,2,3,4,6]
function daysText(days) {
    const d = [...new Set(days)].sort((a, b) => a - b);
    if (d.length === 7) return 'כל הימים';
    const out = [];
    for (let i = 0; i < d.length; i++) {
        let j = i;
        while (j + 1 < d.length && d[j + 1] === d[j] + 1) j++;
        out.push(j - i >= 2 ? `${DAYS[d[i]]}–${DAYS[d[j]]}` : d.slice(i, j + 1).map(x => DAYS[x]).join(', '));
        i = j;
    }
    return out.join(', ');
}
const parseDays = s => String(s || '').split(',').filter(x => x !== '').map(Number);
const actionText = a => !a ? '' : a === 'continue' ? 'המשיך' : a === 'hangup' ? 'נותק' : a.startsWith('goto:') ? `הועבר לשלוחה \u2066${a.slice(5)}\u2069` : a;

export class PhoneManager {
    constructor(container, apiBase, menuItem) {
        Object.assign(this, { container, apiBase, menuItem });
        this.tab = 'numbers';
        this.data = null;           // { settings, numbers, today, reasons, now }
        this.draft = null;          // עותק עריכה של הגדרות הקווים
        this.editing = null;        // מספר בעריכה
        this.filter = '';
        this.log = { rows: [], hasMore: false, result: '', line: '', q: '', open: {}, loaded: false };
        this.testRes = null;
        this.css();
        this.bind();
        if (menuItem) menuItem.addEventListener('click', () => this.load());
    }

    show(isSuper) { if (this.menuItem) this.menuItem.classList.toggle('hidden', !isSuper); }

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
            this.container.innerHTML = `<div class="ph-fail"><i class="fas fa-${r.status === 503 ? 'database' : 'lock'}"></i><div>${esc(this.err(r, 'שגיאה בטעינת הגדרות הטלפון.'))}</div><button class="btn btn-outline btn-sm" data-ph="reload">נסה שוב</button></div>`;
            return;
        }
        this.data = r.data;
        if (!this.draft || !this.dirty) this.draft = JSON.parse(JSON.stringify(r.data.settings));
        this.render();
        if (this.tab === 'log') this.loadLog();
    }

    // ============================================================
    //  שלד
    // ============================================================
    render() {
        if (!this.data) return;
        const d = this.data, t = d.today;
        const tab = (id, icon, label) => `<button class="ph-tab ${this.tab === id ? 'on' : ''}" data-ph="tab" data-v="${id}"><i class="fas ${icon}"></i> ${label}</button>`;
        const modeChip = line => { const m = d.settings.lines[line].mode; return `<span class="ph-mode m-${m}">${LINES[line]}: ${MODES[m][0]}</span>`; };
        const body = { numbers: () => this.numbersHtml(), settings: () => this.settingsHtml(), log: () => this.logHtml(), test: () => this.testHtml() }[this.tab]();
        this.container.innerHTML = `
        <div class="ph-wrap">
            <div class="ph-head">
                <div><h2><i class="fas fa-phone-alt"></i> הרשאות טלפון</h2>
                    <div class="ph-sub">${modeChip('manager')}${modeChip('student')}
                        <span class="ph-kpi">היום: <b>${t.calls}</b> שיחות · <b class="bad">${t.blocked}</b> נחסמו · <b class="ok">${t.updates}</b> עדכוני ציונים</span></div></div>
                <button class="btn btn-outline btn-sm" data-ph="reload" title="רענון"><i class="fas fa-sync-alt"></i></button>
            </div>
            <div class="ph-tabs">${tab('numbers', 'fa-address-book', `מספרים מורשים (${d.numbers.length})`)}${tab('settings', 'fa-sliders-h', 'הגדרות קווים')}${tab('log', 'fa-list', 'יומן שיחות')}${tab('test', 'fa-vial', 'בדיקת מספר')}</div>
            ${body}
        </div>`;
    }

    // ============================================================
    //  מספרים מורשים
    // ============================================================
    numbersHtml() {
        const d = this.data, f = this.filter.trim();
        const fd = f.replace(/\D/g, '');
        const list = d.numbers.filter(n => !f || n.name.includes(f) || (fd && n.phone.includes(fd)) || String(n.notes || '').includes(f));
        const today = d.now.slice(0, 10);
        const wl = Object.keys(LINES).filter(l => d.settings.lines[l].mode === 'whitelist');
        const note = !wl.length
            ? `<div class="ph-note info"><i class="fas fa-info-circle"></i> כרגע אף קו לא מוגדר ל"רשימה לבנה", ולכן הרשימה הזו עדיין לא חוסמת אף אחד. ההפעלה נעשית בלשונית "הגדרות קווים".</div>` : '';
        const row = n => {
            const days = parseDays(n.days);
            const status = !n.active ? ['מושבת', 's-off'] : (n.valid_until && today > n.valid_until) ? ['פג תוקף', 's-off'] : (n.valid_from && today < n.valid_from) ? ['עוד לא התחיל', 's-wait'] : ['פעיל', 's-on'];
            const validity = n.valid_from || n.valid_until ? `${n.valid_from ? 'מ-' + fmtDate(n.valid_from) : ''} ${n.valid_until ? 'עד ' + fmtDate(n.valid_until) : ''}`.trim() : 'ללא הגבלה';
            return `<tr class="${n.active ? '' : 'off'}">
                <td><b>${esc(n.name)}</b>${n.notes ? `<div class="ph-mut">${esc(n.notes)}</div>` : ''}</td>
                <td dir="ltr" class="ph-ph">${esc(fmtPhone(n.phone))}</td>
                <td>${n.lines.split(',').map(l => `<span class="ph-line">${LINES[l] || l}</span>`).join('')}</td>
                <td>${n.sched_enabled ? `${daysText(days)}<div class="ph-mut" dir="ltr">${esc(n.time_from)}–${esc(n.time_to)}</div>` : 'בכל שעה'}</td>
                <td>${esc(validity)}</td>
                <td><button class="ph-st ${status[1]}" data-ph="toggle" data-v="${n.id}" title="לחיצה: ${n.active ? 'השבתה' : 'הפעלה'}">${status[0]}</button></td>
                <td class="ph-mut">${n.last_call ? fmtTime(n.last_call) : '—'}</td>
                <td class="ph-acts"><button class="ph-ico" data-ph="edit" data-v="${n.id}" title="עריכה"><i class="fas fa-pen"></i></button>
                    <button class="ph-ico danger" data-ph="del" data-v="${n.id}" title="מחיקה"><i class="fas fa-trash-alt"></i></button></td></tr>`;
        };
        return `${note}${this.editing ? this.formHtml() : ''}
            <div class="card ph-card">
                <div class="ph-bar"><div class="ph-search"><i class="fas fa-search"></i><input data-ph-filter placeholder="חיפוש לפי שם או מספר..." value="${esc(this.filter)}"></div>
                    <button class="btn btn-primary btn-sm" data-ph="new"><i class="fas fa-plus"></i> הוספת מספר</button></div>
                <div class="ph-tw"><table class="ph-t"><thead><tr><th>שם</th><th>טלפון</th><th>קווים</th><th>ימים ושעות</th><th>תוקף</th><th>מצב</th><th>שיחה אחרונה</th><th></th></tr></thead>
                <tbody>${list.length ? list.map(row).join('') : `<tr><td colspan="8" class="ph-empty">${d.numbers.length ? 'לא נמצאו מספרים' : 'עדיין לא נוספו מספרים מורשים'}</td></tr>`}</tbody></table></div>
            </div>`;
    }

    formHtml() {
        const e = this.editing, days = new Set(e.days);
        return `<form class="card ph-form" data-ph-form>
            <h3>${e.id ? '<i class="fas fa-pen"></i> עריכת מספר' : '<i class="fas fa-plus-circle"></i> מספר מורשה חדש'}</h3>
            <div class="ph-grid">
                <label>שם<input name="name" value="${esc(e.name)}" placeholder="למשל: הרב כהן" required></label>
                <label>מספר טלפון<input name="phone" dir="ltr" value="${esc(e.phone)}" placeholder="0501234567" inputmode="tel" required></label>
                <label class="ph-wide">הערה (רשות)<input name="notes" value="${esc(e.notes || '')}"></label>
            </div>
            <div class="ph-row"><span class="ph-lbl">מורשה לקווים</span>
                ${Object.entries(LINES).map(([k, v]) => `<label class="ph-chk"><input type="checkbox" name="line" value="${k}" ${e.lines.includes(k) ? 'checked' : ''}> ${v}</label>`).join('')}
                <label class="ph-chk"><input type="checkbox" name="active" ${e.active ? 'checked' : ''}> פעיל</label></div>
            <div class="ph-row"><label class="ph-chk"><input type="checkbox" name="sched" ${e.sched_enabled ? 'checked' : ''}> רק בימים ובשעות מסוימים</label>
                <span class="ph-sched ${e.sched_enabled ? '' : 'dis'}">${this.daysPicker('fday', days)}
                    <span class="ph-hm">משעה <input type="time" name="time_from" value="${esc(e.time_from)}"> עד <input type="time" name="time_to" value="${esc(e.time_to)}"></span></span></div>
            <div class="ph-row"><span class="ph-lbl">תוקף (רשות)</span>
                <span class="ph-hm">מתאריך <input type="date" name="valid_from" value="${esc(e.valid_from || '')}"> עד תאריך <input type="date" name="valid_until" value="${esc(e.valid_until || '')}"></span></div>
            <div class="ph-ferr" data-ph-ferr></div>
            <div class="ph-fa"><button type="button" class="btn btn-outline btn-sm" data-ph="cancel">ביטול</button>
                <button type="submit" class="btn btn-primary btn-sm"><i class="fas fa-save"></i> ${e.id ? 'שמירה' : 'הוספה'}</button></div>
        </form>`;
    }
    daysPicker(name, set) {
        return `<span class="ph-days">${DAYS.map((l, i) => `<label class="${set.has(i) ? 'on' : ''}"><input type="checkbox" name="${name}" value="${i}" ${set.has(i) ? 'checked' : ''}>${l}</label>`).join('')}</span>`;
    }

    readForm(form) {
        const v = n => (form.querySelector(`[name="${n}"]`) || {}).value || '';
        const checked = n => [...form.querySelectorAll(`[name="${n}"]:checked`)].map(x => x.value);
        return {
            ...this.editing, name: v('name').trim(), phone: v('phone').trim(), notes: v('notes').trim(),
            lines: checked('line'), active: form.querySelector('[name="active"]').checked,
            sched_enabled: form.querySelector('[name="sched"]').checked, days: checked('fday').map(Number),
            time_from: v('time_from') || '00:00', time_to: v('time_to') || '23:59', valid_from: v('valid_from'), valid_until: v('valid_until')
        };
    }

    async saveNumber(form) {
        const e = this.readForm(form), errEl = $(form, '[data-ph-ferr]');
        errEl.textContent = '';
        if (!e.name || !e.phone) { errEl.textContent = 'יש להזין שם ומספר טלפון.'; return; }
        const btn = $(form, '[type="submit"]'); btn.disabled = true;
        const r = e.id ? await this.call('PUT', `/numbers?id=${e.id}`, e) : await this.call('POST', '/numbers', e);
        btn.disabled = false;
        if (!r.ok) { this.editing = e; errEl.textContent = this.err(r, 'השמירה נכשלה.'); return; }
        this.editing = null;
        window.notify(e.id ? 'המספר עודכן' : 'המספר נוסף לרשימה', 'success', { duration: 2500 });
        this.load();
    }

    async toggleNumber(n) {
        const r = await this.call('PUT', `/numbers?id=${n.id}`, { ...n, lines: n.lines.split(','), days: parseDays(n.days), active: !n.active });
        if (!r.ok) return window.notify(this.err(r, 'העדכון נכשל.'), 'error');
        this.load();
    }

    async deleteNumber(n) {
        if (!(await window.customConfirm(`למחוק את ${n.name} (${fmtPhone(n.phone)}) מרשימת המספרים המורשים?`))) return;
        const r = await this.call('DELETE', `/numbers?id=${n.id}`);
        if (!r.ok) return window.notify(this.err(r, 'המחיקה נכשלה.'), 'error');
        this.load();
    }

    // ============================================================
    //  הגדרות קווים
    // ============================================================
    settingsHtml() {
        const s = this.draft, nums = this.data.numbers;
        const actBlock = (line, key, title, hint) => {
            const a = s.lines[line][key];
            return `<div class="ph-act"><div class="ph-at"><b>${title}</b><span>${hint}</span></div>
                <div class="ph-row"><span class="ph-seg">
                    <button type="button" class="${a.action === 'hangup' ? 'on' : ''}" data-ph="set" data-path="${line}.${key}.action" data-v="hangup"><i class="fas fa-phone-slash"></i> ניתוק השיחה</button>
                    <button type="button" class="${a.action === 'goto' ? 'on' : ''}" data-ph="set" data-path="${line}.${key}.action" data-v="goto"><i class="fas fa-share"></i> העברה לשלוחה</button></span>
                    ${a.action === 'goto' ? `<span class="ph-hm">שלוחה <input class="ph-folder" dir="ltr" data-path="${line}.${key}.folder" value="${esc(a.folder)}" placeholder="/5"></span>` : ''}</div>
                <label class="ph-msg">הודעה שתושמע לפני ${a.action === 'goto' ? 'ההעברה' : 'הניתוק'} (ריק = בלי הודעה)
                    <input data-path="${line}.${key}.message" value="${esc(a.message)}" maxlength="200"></label></div>`;
        };
        const card = line => {
            const L = s.lines[line], h = L.hours;
            const allowedNums = nums.filter(n => n.active && n.lines.split(',').includes(line)).length;
            const warn = L.mode === 'whitelist' && !allowedNums
                ? `<div class="ph-note bad"><i class="fas fa-exclamation-triangle"></i> אין אף מספר פעיל שמורשה לקו הזה. אם תשמרו כך, <b>כל השיחות לקו ייחסמו</b>.</div>` : '';
            return `<div class="card ph-line-card">
                <h3><i class="fas ${line === 'manager' ? 'fa-user-edit' : 'fa-user-graduate'}"></i> ${LINES[line]}
                    <span class="ph-mut">${line === 'manager' ? 'שלוחת עדכון המבחנים (yemot/manager)' : 'האזור האישי לתלמיד (yemot/student)'}</span></h3>
                <div class="ph-modes">${Object.entries(MODES).map(([k, [t, sub]]) => `<button type="button" class="ph-mbtn m-${k} ${L.mode === k ? 'on' : ''}" data-ph="set" data-path="${line}.mode" data-v="${k}"><b>${t}</b><span>${sub}</span></button>`).join('')}</div>
                ${L.mode === 'whitelist' ? `<div class="ph-mut" style="margin-top:6px">${allowedNums} מספרים פעילים מורשים לקו הזה. מספר חסוי (ללא זיהוי) ייחסם.</div>` : ''}
                ${warn}
                <div class="ph-sec"><label class="ph-chk"><input type="checkbox" data-path="${line}.hours.enabled" ${h.enabled ? 'checked' : ''}> <b>שעות פעילות לקו</b> <span class="ph-mut">(חל על כולם, גם על מספרים מורשים)</span></label>
                    <div class="ph-row ${h.enabled ? '' : 'dis'}">${this.daysPicker(`hd-${line}`, new Set(h.days)).replace(/name="hd-/g, `data-days="${line}" name="hd-`)}
                        <span class="ph-hm">משעה <input type="time" data-path="${line}.hours.from" value="${esc(h.from)}"> עד <input type="time" data-path="${line}.hours.to" value="${esc(h.to)}"></span>
                        <span class="ph-mut">שעת סיום מוקדמת משעת ההתחלה = עובר את חצות</span></div></div>
                ${L.mode === 'whitelist' ? actBlock(line, 'blocked', 'מספר לא מורשה', 'מספר שלא ברשימה, מושבת, פג תוקף, או מחוץ לשעות שלו') : ''}
                ${L.mode === 'off' || h.enabled ? actBlock(line, 'closed', L.mode === 'off' ? 'כשהקו כבוי' : 'מחוץ לשעות הפעילות', L.mode === 'off' ? 'כל מי שמתקשר' : 'מי שמתקשר בזמן שהקו סגור') : ''}
            </div>`;
        };
        return `${card('manager')}${card('student')}
            <div class="ph-savebar"><span class="ph-mut" data-ph-serr>${this.dirty ? 'יש שינויים שלא נשמרו' : ''}</span>
                <button class="btn btn-outline btn-sm" data-ph="revert" ${this.dirty ? '' : 'disabled'}>ביטול שינויים</button>
                <button class="btn btn-primary btn-sm" data-ph="save-settings" ${this.dirty ? '' : 'disabled'}><i class="fas fa-save"></i> שמירת הגדרות</button></div>`;
    }

    setPath(path, value) {
        const keys = path.split('.'); let o = this.draft.lines;
        keys.slice(0, -1).forEach(k => { o = o[k]; });
        o[keys[keys.length - 1]] = value;
        this.dirty = true;
    }

    async saveSettings() {
        const s = this.draft;
        for (const line of Object.keys(LINES)) {
            const L = s.lines[line];
            const allowed = this.data.numbers.filter(n => n.active && n.lines.split(',').includes(line)).length;
            if (L.mode === 'whitelist' && !allowed && !(await window.customConfirm(`ב${LINES[line]} אין אף מספר מורשה פעיל.\nכל השיחות לקו הזה ייחסמו. לשמור בכל זאת?`))) return;
            if (L.mode === 'off' && this.data.settings.lines[line].mode !== 'off' && !(await window.customConfirm(`${LINES[line]} ייסגר לכל המתקשרים. להמשיך?`))) return;
        }
        const r = await this.call('PUT', '/settings', { settings: s });
        if (!r.ok) { const el = $(this.container, '[data-ph-serr]'); if (el) { el.textContent = this.err(r, 'השמירה נכשלה.'); el.classList.add('bad'); } return; }
        this.dirty = false; this.draft = null;
        window.notify('הגדרות הטלפון נשמרו ופעילות מיד', 'success', { duration: 2500 });
        this.load();
    }

    // ============================================================
    //  יומן שיחות
    // ============================================================
    async loadLog(more = false) {
        const L = this.log, qs = new URLSearchParams({ limit: '100' });
        if (L.result) qs.set('result', L.result);
        if (L.line) qs.set('line', L.line);
        if (L.q.trim()) qs.set('q', L.q.trim());
        if (more && L.rows.length) qs.set('before_id', String(L.rows[L.rows.length - 1].id));
        const seq = (this.logSeq = (this.logSeq || 0) + 1);
        const r = await this.call('GET', `/log?${qs}`);
        if (seq !== this.logSeq || this.tab !== 'log') return;
        if (!r.ok || !r.data) { window.notify(this.err(r, 'שגיאה בטעינת היומן.'), 'error'); return; }
        L.rows = more ? L.rows.concat(r.data.rows) : r.data.rows;
        L.hasMore = r.data.has_more; L.loaded = true;
        this.paintLog();
    }

    logHtml() {
        const L = this.log;
        const seg = (key, v, t) => `<button type="button" class="${L[key] === v ? 'on' : ''}" data-ph="log-${key}" data-v="${v}">${t}</button>`;
        return `<div class="card ph-card">
            <div class="ph-bar"><span class="ph-seg">${seg('result', '', 'הכל')}${seg('result', 'allowed', 'אושרו')}${seg('result', 'blocked', 'נחסמו')}</span>
                <span class="ph-seg">${seg('line', '', 'כל הקווים')}${seg('line', 'manager', 'עדכון ציונים')}${seg('line', 'student', 'תלמידים')}</span>
                <div class="ph-search"><i class="fas fa-search"></i><input data-ph-logq placeholder="שם או מספר..." value="${esc(L.q)}"></div></div>
            <div class="ph-tw" data-ph-log>${L.loaded ? '' : '<div class="ph-empty"><i class="fas fa-spinner fa-spin"></i> טוען...</div>'}</div></div>`;
    }

    paintLog() {
        const box = $(this.container, '[data-ph-log]');
        if (!box) return;
        const L = this.log, R = this.data.reasons || {};
        const rows = L.rows.map(r => {
            const ok = String(r.reason).startsWith('ok_');
            const open = L.open[r.id];
            const upd = r.updates ? `<button class="ph-upd" data-ph="upd" data-v="${r.id}">${r.updates} עדכונים <i class="fas fa-chevron-${open ? 'up' : 'down'}"></i></button>` : '<span class="ph-mut">—</span>';
            const detail = open ? `<tr class="ph-det"><td colspan="7">${open === 'loading' ? '<i class="fas fa-spinner fa-spin"></i>' : open.map(u =>
                `<div><span class="ph-mut">${esc(u.created_at.slice(11, 16))}</span> <b>${esc(u.student_name)}</b> (${esc(u.student_code)}) · מבחן <b>${esc(u.exam_code)}</b> · <span class="${u.passed === 1 ? 'ok' : 'bad'}">${u.passed === 1 ? 'עבר' : 'לא עבר'}</span></div>`).join('')}</td></tr>` : '';
            return `<tr><td class="ph-mut">${esc(fmtTime(r.created_at))}</td><td dir="ltr" class="ph-ph">${r.phone ? esc(fmtPhone(r.phone)) : '<span class="ph-mut">חסוי</span>'}</td>
                <td>${r.number_name ? esc(r.number_name) : '<span class="ph-mut">לא ברשימה</span>'}</td><td>${LINES[r.line] || r.line}</td>
                <td><span class="ph-res ${ok ? 'ok' : 'bad'}">${esc(R[r.reason] || r.reason)}</span></td><td>${esc(actionText(r.action))}</td><td>${upd}</td></tr>${detail}`;
        }).join('');
        box.innerHTML = `<table class="ph-t"><thead><tr><th>מתי</th><th>טלפון</th><th>שם</th><th>קו</th><th>תוצאה</th><th>פעולה</th><th>בשיחה</th></tr></thead>
            <tbody>${rows || '<tr><td colspan="7" class="ph-empty">אין שיחות להצגה</td></tr>'}</tbody></table>
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
    //  בדיקת מספר
    // ============================================================
    testHtml() {
        const t = this.testIn || { phone: '', line: 'manager', at: '' };
        const r = this.testRes;
        const res = !r ? '' : r.error ? `<div class="ph-note bad">${esc(r.error)}</div>` : `
            <div class="ph-tres ${r.allowed ? 'ok' : 'bad'}">
                <i class="fas ${r.allowed ? 'fa-check-circle' : 'fa-ban'}"></i>
                <div><b>${r.allowed ? 'השיחה תאושר' : 'השיחה תיחסם'}</b> · ${esc(r.reason_text)}
                    ${r.entry ? `<div>מזוהה כ: <b>${esc(r.entry.name)}</b></div>` : ''}
                    ${r.allowed ? '' : `<div>פעולה: <b>${esc(actionText(r.action))}</b></div><div class="ph-mut" dir="ltr" style="text-align:right;unicode-bidi:plaintext">${esc(r.command)}</div>`}
                    <div class="ph-mut">נבדק לפי: ${esc(fmtTime(r.at))}</div></div></div>`;
        return `<form class="card ph-form" data-ph-test>
            <h3><i class="fas fa-vial"></i> מה יקרה אם המספר הזה יתקשר?</h3>
            <div class="ph-mut" style="margin-bottom:10px">הבדיקה משתמשת בהגדרות השמורות (לא בשינויים שעדיין לא נשמרו) ולא נרשמת ביומן.</div>
            <div class="ph-grid">
                <label>מספר טלפון<input name="phone" dir="ltr" value="${esc(t.phone)}" placeholder="ריק = מספר חסוי" inputmode="tel"></label>
                <label>קו<select name="line">${Object.entries(LINES).map(([k, v]) => `<option value="${k}" ${t.line === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
                <label>מועד (ריק = עכשיו)<input type="datetime-local" name="at" value="${esc(t.at)}"></label>
            </div>
            <div class="ph-fa"><button type="submit" class="btn btn-primary btn-sm"><i class="fas fa-play"></i> בדיקה</button></div>
            ${res}</form>`;
    }

    async runTest(form) {
        const v = n => form.querySelector(`[name="${n}"]`).value;
        this.testIn = { phone: v('phone').trim(), line: v('line'), at: v('at') };
        const r = await this.call('POST', '/test', this.testIn);
        this.testRes = r.ok ? r.data : { error: this.err(r, 'הבדיקה נכשלה.') };
        this.render();
    }

    // ============================================================
    //  אירועים
    // ============================================================
    bind() {
        const c = this.container;
        c.addEventListener('click', ev => {
            const b = ev.target.closest('[data-ph]');
            if (!b || b.disabled) return;
            const act = b.dataset.ph, v = b.dataset.v;
            const num = this.data && this.data.numbers.find(n => String(n.id) === String(v));
            if (act === 'reload') return this.load();
            if (act === 'tab') { this.tab = v; this.render(); if (v === 'log') this.loadLog(); return; }
            if (act === 'new') { this.editing = { id: null, name: '', phone: '', notes: '', lines: ['manager'], active: true, sched_enabled: false, days: [0, 1, 2, 3, 4, 5], time_from: '08:00', time_to: '22:00', valid_from: '', valid_until: '' }; this.render(); const i = $(c, '[data-ph-form] [name="name"]'); if (i) i.focus(); return; }
            if (act === 'edit' && num) { this.editing = { ...num, lines: num.lines.split(','), days: parseDays(num.days), active: !!num.active, sched_enabled: !!num.sched_enabled }; this.render(); c.scrollTop = 0; return; }
            if (act === 'cancel') { this.editing = null; return this.render(); }
            if (act === 'toggle' && num) return this.toggleNumber(num);
            if (act === 'del' && num) return this.deleteNumber(num);
            if (act === 'set') { this.setPath(b.dataset.path, v); return this.render(); }
            if (act === 'revert') { this.dirty = false; this.draft = JSON.parse(JSON.stringify(this.data.settings)); return this.render(); }
            if (act === 'save-settings') return this.saveSettings();
            if (act === 'log-result' || act === 'log-line') { this.log[act.slice(4)] = v; this.render(); return this.loadLog(); }
            if (act === 'log-more') return this.loadLog(true);
            if (act === 'upd') return this.toggleUpdates(v);
        });
        c.addEventListener('change', ev => {
            const t = ev.target;
            // טופס מספר: ימים / תזמון — רק עדכון מראה, בלי רינדור מחדש
            if (t.closest('[data-ph-form]')) {
                if (t.name === 'fday') t.parentElement.classList.toggle('on', t.checked);
                if (t.name === 'sched') $(t.closest('.ph-row'), '.ph-sched').classList.toggle('dis', !t.checked);
                return;
            }
            if (t.dataset.days) {
                const line = t.dataset.days;
                const days = [...c.querySelectorAll(`[data-days="${line}"]:checked`)].map(x => Number(x.value));
                this.setPath(`${line}.hours.days`, days); return this.render();
            }
            if (t.dataset.path && t.type === 'checkbox') { this.setPath(t.dataset.path, t.checked); return this.render(); }
            if (t.dataset.path && t.type === 'time') { this.setPath(t.dataset.path, t.value); return this.render(); }
        });
        c.addEventListener('input', ev => {
            const t = ev.target;
            if (t.dataset.path && t.type !== 'checkbox' && t.type !== 'time') {
                this.setPath(t.dataset.path, t.value);
                const bar = $(c, '.ph-savebar'); if (bar) { bar.querySelectorAll('button').forEach(x => { x.disabled = false; }); $(bar, '[data-ph-serr]').textContent = 'יש שינויים שלא נשמרו'; }
                return;
            }
            if (t.matches('[data-ph-filter]')) {
                this.filter = t.value;
                const form = $(c, '[data-ph-form]'); if (form) this.editing = this.readForm(form);
                const pos = t.selectionStart; this.render();
                const i = $(c, '[data-ph-filter]'); i.focus(); i.setSelectionRange(pos, pos);
                return;
            }
            if (t.matches('[data-ph-logq]')) { clearTimeout(this._lq); this.log.q = t.value; this._lq = setTimeout(() => this.loadLog(), 350); }
        });
        c.addEventListener('submit', ev => {
            ev.preventDefault();
            if (ev.target.matches('[data-ph-form]')) return this.saveNumber(ev.target);
            if (ev.target.matches('[data-ph-test]')) return this.runTest(ev.target);
        });
    }

    css() {
        if (document.getElementById('phStyles')) return;
        const st = document.createElement('style');
        st.id = 'phStyles';
        st.textContent = `
        .ph-wrap{padding-bottom:20px;display:flex;flex-direction:column;gap:10px}
        .ph-head{display:flex;justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap}
        .ph-head h2{font-size:1.2rem;color:#0f172a;display:flex;align-items:center;gap:8px;margin:0 0 6px}.ph-head h2 i{color:#7c3aed}
        .ph-sub{display:flex;gap:6px;flex-wrap:wrap;align-items:center}
        .ph-mode{font-size:.74rem;font-weight:700;border-radius:99px;padding:2px 10px;border:1px solid}
        .ph-mode.m-open{background:#f1f5f9;color:#475569;border-color:#e2e8f0}.ph-mode.m-whitelist{background:#ecfdf5;color:#047857;border-color:#a7f3d0}.ph-mode.m-off{background:#fef2f2;color:#b91c1c;border-color:#fecaca}
        .ph-kpi{font-size:.78rem;color:#475569;margin-right:4px}.ph-kpi b{color:#0f172a}
        .ok{color:#047857 !important}.bad{color:#b91c1c !important}
        .ph-tabs{display:flex;gap:4px;border-bottom:1px solid var(--border-color);flex-wrap:wrap}
        .ph-tab{border:none;background:none;padding:8px 14px;font-weight:700;font-size:.86rem;color:#64748b;cursor:pointer;border-bottom:3px solid transparent;font-family:inherit}
        .ph-tab.on{color:var(--primary-color);border-bottom-color:var(--primary-color)}
        .ph-card{padding:12px 14px}
        .ph-bar{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:10px}
        .ph-search{position:relative;flex:1;min-width:180px}.ph-search i{position:absolute;right:10px;top:50%;transform:translateY(-50%);color:#94a3b8}
        .ph-search input{width:100%;padding:7px 32px 7px 10px;border:1px solid var(--border-color);border-radius:6px;font-size:.85rem}
        .ph-tw{overflow-x:auto}
        .ph-t{width:100%;border-collapse:collapse;font-size:.85rem}
        .ph-t th{text-align:right;font-weight:600;color:#64748b;padding:6px 8px;border-bottom:1px solid var(--border-color);white-space:nowrap}
        .ph-t td{padding:8px;border-bottom:1px solid #f1f5f9;vertical-align:middle}
        .ph-t tr.off td{opacity:.55}
        .ph-ph{font-family:ui-monospace,Menlo,Consolas,monospace;white-space:nowrap;text-align:right}
        .ph-mut{color:#64748b;font-size:.78rem}
        .ph-line{display:inline-block;background:#eff6ff;color:#1d4ed8;border-radius:99px;padding:1px 8px;font-size:.72rem;font-weight:700;margin:1px 0 1px 4px;white-space:nowrap}
        .ph-st{border:1px solid;border-radius:99px;padding:1px 10px;font-size:.74rem;font-weight:700;cursor:pointer;background:#fff;font-family:inherit;white-space:nowrap}
        .ph-st.s-on{color:#047857;border-color:#a7f3d0;background:#ecfdf5}.ph-st.s-off{color:#b91c1c;border-color:#fecaca;background:#fef2f2}.ph-st.s-wait{color:#b45309;border-color:#fde68a;background:#fffbeb}
        .ph-acts{white-space:nowrap;text-align:left}
        .ph-ico{background:none;border:none;color:#64748b;cursor:pointer;padding:4px 6px;border-radius:4px}.ph-ico:hover{background:#f1f5f9;color:var(--primary-color)}.ph-ico.danger:hover{background:rgba(239,68,68,.1);color:var(--danger)}
        .ph-empty{text-align:center;color:#64748b;padding:24px}
        .ph-note{display:flex;gap:8px;align-items:flex-start;border:1px solid;border-radius:8px;padding:9px 12px;font-size:.84rem;margin-top:8px}
        .ph-note.info{background:#eff6ff;border-color:#bfdbfe;color:#1e40af}.ph-note.bad{background:#fef2f2;border-color:#fecaca;color:#991b1b}
        .ph-form{padding:14px 16px}.ph-form h3,.ph-line-card h3{font-size:1rem;margin:0 0 10px;display:flex;gap:8px;align-items:center;flex-wrap:wrap}.ph-form h3 i,.ph-line-card h3 i{color:var(--primary-color)}
        .ph-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px}.ph-grid label{display:flex;flex-direction:column;gap:4px;font-size:.78rem;font-weight:600;color:#475569}
        .ph-grid input,.ph-grid select{padding:7px 9px;border:1px solid var(--border-color);border-radius:6px;font-size:.86rem;font-family:inherit}
        .ph-row{display:flex;align-items:center;gap:8px 14px;flex-wrap:wrap;margin-top:10px}.ph-row.dis,.ph-sched.dis{opacity:.4;pointer-events:none}
        .ph-sched{display:inline-flex;gap:10px;flex-wrap:wrap;align-items:center}
        .ph-lbl{font-size:.8rem;font-weight:700;color:#475569}
        .ph-chk{display:inline-flex;align-items:center;gap:5px;font-size:.85rem;cursor:pointer}
        .ph-hm{display:inline-flex;align-items:center;gap:6px;font-size:.82rem;color:#475569;flex-wrap:wrap}
        .ph-hm input{padding:4px 6px;border:1px solid var(--border-color);border-radius:6px;font-family:inherit;font-size:.84rem}
        .ph-days{display:inline-flex;gap:3px}
        .ph-days label{width:28px;height:28px;border:1px solid var(--border-color);border-radius:6px;display:inline-flex;align-items:center;justify-content:center;font-weight:700;font-size:.82rem;cursor:pointer;background:#fff;color:#64748b;user-select:none}
        .ph-days label.on{background:var(--primary-color);border-color:var(--primary-color);color:#fff}.ph-days input{display:none}
        .ph-ferr{color:#b91c1c;font-size:.82rem;min-height:1em;margin-top:8px}
        .ph-fa{display:flex;justify-content:flex-end;gap:8px;margin-top:6px}
        .ph-line-card{padding:14px 16px}
        .ph-modes{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
        .ph-mbtn{border:1px solid var(--border-color);background:#fff;border-radius:9px;padding:9px 10px;text-align:right;cursor:pointer;font-family:inherit;display:flex;flex-direction:column;gap:2px}
        .ph-mbtn b{font-size:.88rem;color:#0f172a}.ph-mbtn span{font-size:.74rem;color:#64748b}
        .ph-mbtn.on.m-open{border-color:#64748b;background:#f8fafc;box-shadow:0 0 0 2px rgba(100,116,139,.15)}
        .ph-mbtn.on.m-whitelist{border-color:#059669;background:#ecfdf5;box-shadow:0 0 0 2px rgba(5,150,105,.15)}.ph-mbtn.on.m-whitelist b{color:#047857}
        .ph-mbtn.on.m-off{border-color:#dc2626;background:#fef2f2;box-shadow:0 0 0 2px rgba(220,38,38,.12)}.ph-mbtn.on.m-off b{color:#b91c1c}
        .ph-sec{margin-top:12px;padding-top:10px;border-top:1px dashed var(--border-color)}
        .ph-act{margin-top:12px;padding:10px 12px;border:1px solid var(--border-color);border-radius:9px;background:#f8fafc}
        .ph-at{display:flex;gap:8px;align-items:baseline;flex-wrap:wrap}.ph-at b{font-size:.88rem}.ph-at span{font-size:.75rem;color:#64748b}
        .ph-act .ph-row{margin-top:8px}
        .ph-seg{display:inline-flex;border:1px solid var(--border-color);border-radius:7px;overflow:hidden;background:#fff}
        .ph-seg button{border:none;background:none;padding:5px 11px;font-size:.8rem;font-weight:600;color:#475569;cursor:pointer;font-family:inherit;white-space:nowrap}
        .ph-seg button+button{border-right:1px solid var(--border-color)}.ph-seg button.on{background:var(--primary-color);color:#fff}
        .ph-folder{width:80px}
        .ph-msg{display:flex;flex-direction:column;gap:4px;font-size:.76rem;color:#64748b;margin-top:8px}
        .ph-msg input{padding:6px 9px;border:1px solid var(--border-color);border-radius:6px;font-size:.86rem;font-family:inherit;background:#fff}
        .ph-savebar{position:sticky;bottom:0;display:flex;justify-content:flex-end;align-items:center;gap:8px;background:#fff;border:1px solid var(--border-color);border-radius:10px;padding:10px 14px;box-shadow:0 -4px 14px rgba(15,23,42,.06)}
        .ph-savebar [data-ph-serr]{flex:1}
        .ph-res{font-size:.76rem;font-weight:700;border-radius:99px;padding:1px 9px;white-space:nowrap}
        .ph-res.ok{background:#ecfdf5}.ph-res.bad{background:#fef2f2}
        .ph-upd{border:1px solid #bfdbfe;background:#eff6ff;color:#1d4ed8;border-radius:99px;padding:1px 9px;font-size:.74rem;font-weight:700;cursor:pointer;font-family:inherit;white-space:nowrap}
        .ph-det td{background:#f8fafc;font-size:.82rem;line-height:1.8;padding:6px 20px}
        .ph-tres{display:flex;gap:12px;align-items:flex-start;margin-top:12px;border:1px solid;border-radius:10px;padding:12px 14px;font-size:.88rem;line-height:1.7}
        .ph-tres>i{font-size:1.5rem;margin-top:3px}.ph-tres.ok{background:#ecfdf5;border-color:#a7f3d0}.ph-tres.ok>i{color:#059669}.ph-tres.bad{background:#fef2f2;border-color:#fecaca}.ph-tres.bad>i{color:#dc2626}
        .ph-fail{text-align:center;padding:40px 20px;color:#475569;display:flex;flex-direction:column;gap:12px;align-items:center}.ph-fail>i{font-size:2rem;color:#94a3b8}
        @media(max-width:768px){.ph-grid,.ph-modes{grid-template-columns:1fr}.ph-t{font-size:.8rem}}`;
        document.head.appendChild(st);
    }
}
