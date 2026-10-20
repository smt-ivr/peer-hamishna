// ============================================================
//  client-admin.js — ניהול הרשאות גישה (סיסמאות וכתובות IP) — למנהל-על בלבד
//  new AdminManager(container, apiBase, menuItem)
//  הטאב מוסתר כברירת מחדל ומוצג רק אם auth-check מחזיר access_level = super_admin.
//  ההגנה האמיתית היא בשרת (admin.js) — כאן רק ממשק.
// ============================================================

const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const SUPER = 'super_admin';
const LEVELS = {
    super_admin: ['מנהל-על', 'fa-crown', 'lv-super'],
    admin: ['הרשאה מלאה', 'fa-shield-alt', 'lv-admin'],
    read_only: ['צפייה בלבד', 'fa-eye', 'lv-ro']
};
const TYPES = { password: ['סיסמה', 'fa-key'], ip: ['כתובת IP', 'fa-network-wired'] };

function randomPassword(len = 10) {
    const abc = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const buf = new Uint32Array(len);
    crypto.getRandomValues(buf);
    return [...buf].map(n => abc[n % abc.length]).join('');
}

export class AdminManager {
    constructor(container, apiBase, menuItem) {
        Object.assign(this, { container, apiBase, menuItem });
        this.rules = []; this.clientIp = ''; this.editing = null; this.shown = new Set(); this.filter = '';
        this.css();
        this.bind();
        if (menuItem) menuItem.addEventListener('click', () => this.load());
    }

    // בודק אם המשתמש הנוכחי הוא מנהל-על ומציג את הטאב בהתאם
    async init() {
        try {
            const res = await fetch(`${this.apiBase}/auth-check`);
            const data = await res.json();
            this.isSuper = data && data.access_level === SUPER;
        } catch (e) { this.isSuper = false; }
        if (this.menuItem) this.menuItem.classList.toggle('hidden', !this.isSuper);
        return this.isSuper;
    }

    async call(method, query, body) {
        const opt = { method, silent: true };
        if (body !== undefined) { opt.headers = { 'Content-Type': 'application/json' }; opt.body = JSON.stringify(body); }
        try {
            const res = await fetch(`${this.apiBase}/admin/auth-rules${query || ''}`, opt);
            return { ok: res.ok, status: res.status, data: await res.json().catch(() => null) };
        } catch (e) { return { ok: false, status: 0, data: { message: 'שגיאת תקשורת מול השרת.' } }; }
    }

    errText(r, fallback) { return (r.data && (r.data.message || r.data.error)) || fallback; }

    async load() {
        if (!this.rules.length) this.container.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i> טוען הרשאות...</div>';
        const r = await this.call('GET');
        if (!r.ok || !r.data || !Array.isArray(r.data.rules)) {
            this.container.innerHTML = `<div class="ad-fail"><i class="fas fa-lock"></i> ${esc(this.errText(r, 'שגיאה בטעינת ההרשאות.'))}<br><button class="btn btn-outline btn-sm" data-ad="reload">נסה שוב</button></div>`;
            return;
        }
        this.rules = r.data.rules;
        this.clientIp = r.data.client_ip;
        this.render();
    }

    // ============================================================
    //  רינדור
    // ============================================================
    render() {
        const f = this.filter.trim().toLowerCase();
        const list = this.rules.filter(r => !f || [r.rule_value, r.description, LEVELS[r.access_level]?.[0]].some(x => String(x || '').toLowerCase().includes(f)));
        const myIpListed = this.rules.some(r => r.rule_type === 'ip' && r.rule_value === this.clientIp);
        const count = t => this.rules.filter(r => r.rule_type === t).length;

        this.container.innerHTML = `
        <div class="ad-wrap">
            <div class="ad-head">
                <div>
                    <h2><i class="fas fa-user-shield"></i> ניהול הרשאות</h2>
                    <span class="text-muted">${count('password')} סיסמאות · ${count('ip')} כתובות IP · אזור זה גלוי למנהל-על בלבד</span>
                </div>
                <div class="ad-actions">
                    <button class="btn btn-outline btn-sm" data-ad="reload"><i class="fas fa-sync-alt"></i></button>
                    <button class="btn btn-primary btn-sm" data-ad="new"><i class="fas fa-plus"></i> הוספת הרשאה</button>
                </div>
            </div>

            <div class="card ad-ip">
                <i class="fas fa-globe"></i>
                <span>כתובת ה-IP הנוכחית שלכם: <b dir="ltr">${esc(this.clientIp)}</b>
                ${myIpListed ? '<span class="ad-tag">כבר ברשימה</span>' : ''}</span>
                ${myIpListed ? '' : `<button class="btn btn-secondary btn-sm" data-ad="add-my-ip"><i class="fas fa-plus"></i> הוסף כתובת זו</button>`}
            </div>

            ${this.editing ? this.form() : ''}

            <div class="card ad-card">
                <div class="ad-search"><i class="fas fa-search"></i><input type="text" data-ad-filter placeholder="חיפוש לפי ערך, תיאור או הרשאה..." value="${esc(this.filter)}"></div>
                <div class="ad-table-wrap"><table class="ad-table">
                    <thead><tr><th>סוג</th><th>ערך</th><th>רמת הרשאה</th><th>תיאור</th><th>נוצר</th><th></th></tr></thead>
                    <tbody>${list.length ? list.map(r => this.row(r)).join('') : '<tr><td colspan="6" class="ad-empty">לא נמצאו הרשאות</td></tr>'}</tbody>
                </table></div>
            </div>
        </div>`;
    }

    row(r) {
        const lv = LEVELS[r.access_level] || [r.access_level || '-', 'fa-question', ''];
        const ty = TYPES[r.rule_type] || [r.rule_type, 'fa-question'];
        const isPass = r.rule_type === 'password';
        const visible = !isPass || this.shown.has(r.rule_value);
        const v = esc(r.rule_value);
        return `<tr class="${r.is_current ? 'ad-current' : ''}">
            <td><span class="ad-type"><i class="fas ${ty[1]}"></i> ${ty[0]}</span></td>
            <td><span class="ad-val" dir="ltr">${visible ? v : '••••••••'}</span>
                ${isPass ? `<button class="ad-ico" data-ad="toggle" data-v="${v}" title="${visible ? 'הסתר' : 'הצג'}"><i class="fas ${visible ? 'fa-eye-slash' : 'fa-eye'}"></i></button>` : ''}
                <button class="ad-ico" data-ad="copy" data-v="${v}" title="העתק"><i class="far fa-copy"></i></button>
                ${r.is_current ? '<span class="ad-tag">החיבור הנוכחי</span>' : ''}</td>
            <td><span class="ad-lv ${lv[2]}"><i class="fas ${lv[1]}"></i> ${lv[0]}</span></td>
            <td class="ad-desc">${esc(r.description || '')}</td>
            <td class="ad-date">${esc(String(r.created_at || '').slice(0, 10))}</td>
            <td class="ad-row-actions">
                <button class="ad-ico" data-ad="edit" data-v="${v}" title="עריכה"><i class="fas fa-pen"></i></button>
                <button class="ad-ico danger" data-ad="delete" data-v="${v}" title="מחיקה" ${r.is_current ? 'disabled' : ''}><i class="fas fa-trash-alt"></i></button>
            </td>
        </tr>`;
    }

    form() {
        const e = this.editing;
        const isNew = e.original === null;
        const opt = (obj, cur) => Object.entries(obj).map(([k, [label]]) => `<option value="${k}" ${k === cur ? 'selected' : ''}>${label}</option>`).join('');
        return `<form class="card ad-form" data-ad-form>
            <h3>${isNew ? '<i class="fas fa-plus-circle"></i> הוספת הרשאה' : '<i class="fas fa-pen"></i> עריכת הרשאה'}</h3>
            <div class="ad-fields">
                <label>סוג<select name="rule_type" ${e.is_current ? 'disabled' : ''}>${opt(TYPES, e.rule_type)}</select></label>
                <label class="ad-grow">${e.rule_type === 'ip' ? 'כתובת IP' : 'סיסמה'}
                    <span class="ad-inline">
                        <input name="rule_value" dir="ltr" autocomplete="off" value="${esc(e.rule_value)}" required>
                        ${e.rule_type === 'password' ? '<button type="button" class="btn btn-outline btn-sm" data-ad="gen"><i class="fas fa-dice"></i> צור סיסמה</button>' : ''}
                    </span>
                </label>
                <label>רמת הרשאה<select name="access_level" ${e.is_current ? 'disabled' : ''}>${opt(LEVELS, e.access_level)}</select></label>
                <label class="ad-grow">תיאור<input name="description" value="${esc(e.description || '')}" placeholder="למשל: מזכירות, מחשב משרד..."></label>
            </div>
            ${e.access_level === SUPER ? '<div class="ad-warn"><i class="fas fa-exclamation-triangle"></i> מנהל-על יכול לראות ולשנות את כל הסיסמאות וההרשאות במערכת.</div>' : ''}
            ${e.is_current ? '<div class="text-muted">זו ההרשאה שאיתה אתם מחוברים — לא ניתן לשנות את סוגה או להוריד את רמתה.</div>' : ''}
            <div class="ad-form-actions">
                <button type="button" class="btn btn-outline btn-sm" data-ad="cancel">ביטול</button>
                <button type="submit" class="btn btn-primary btn-sm"><i class="fas fa-save"></i> ${isNew ? 'הוספה' : 'שמירה'}</button>
            </div>
        </form>`;
    }

    // ============================================================
    //  אירועים
    // ============================================================
    bind() {
        this.container.addEventListener('click', (ev) => {
            const b = ev.target.closest('[data-ad]');
            if (!b || b.disabled) return;
            const act = b.getAttribute('data-ad');
            const v = b.getAttribute('data-v');
            const rule = this.rules.find(r => r.rule_value === v);
            if (act === 'reload') return this.load();
            if (act === 'new') return this.openForm({ original: null, rule_type: 'password', rule_value: randomPassword(), access_level: 'admin', description: '' });
            if (act === 'add-my-ip') return this.openForm({ original: null, rule_type: 'ip', rule_value: this.clientIp, access_level: 'admin', description: '' });
            if (act === 'edit' && rule) return this.openForm({ ...rule, original: rule.rule_value });
            if (act === 'cancel') { this.editing = null; return this.render(); }
            if (act === 'gen') { const inp = this.container.querySelector('[data-ad-form] [name="rule_value"]'); if (inp) inp.value = randomPassword(); return; }
            if (act === 'toggle') { this.shown.has(v) ? this.shown.delete(v) : this.shown.add(v); return this.render(); }
            if (act === 'copy') return this.copy(v);
            if (act === 'delete' && rule) return this.remove(rule);
        });
        this.container.addEventListener('change', (ev) => {
            const form = ev.target.closest('[data-ad-form]');
            if (!form || !['rule_type', 'access_level'].includes(ev.target.name)) return;
            Object.assign(this.editing, this.readForm(form));       // מרנדר מחדש כדי לעדכן כפתורים/אזהרות
            if (ev.target.name === 'rule_type') this.editing.rule_value = this.editing.rule_type === 'ip' ? this.clientIp : randomPassword();
            this.render();
        });
        this.container.addEventListener('submit', (ev) => {
            const form = ev.target.closest('[data-ad-form]');
            if (!form) return;
            ev.preventDefault();
            this.save(form);
        });
        this.container.addEventListener('input', (ev) => {
            if (!ev.target.matches('[data-ad-filter]')) return;
            this.filter = ev.target.value;
            const form = this.container.querySelector('[data-ad-form]');
            if (form) Object.assign(this.editing, this.readForm(form));
            const pos = ev.target.selectionStart;
            this.render();
            const inp = this.container.querySelector('[data-ad-filter]');
            inp.focus(); inp.setSelectionRange(pos, pos);
        });
    }

    openForm(data) {
        this.editing = data;
        this.render();
        const inp = this.container.querySelector('[data-ad-form] [name="rule_value"]');
        if (inp) { inp.focus(); inp.select(); }
        this.container.scrollTop = 0;
    }

    readForm(form) {
        const val = n => { const el = form.querySelector(`[name="${n}"]`); return el ? el.value : ''; };
        return {
            rule_type: this.editing.is_current ? this.editing.rule_type : val('rule_type'),
            rule_value: val('rule_value').trim(),
            access_level: this.editing.is_current ? this.editing.access_level : val('access_level'),
            description: val('description').trim()
        };
    }

    async save(form) {
        const e = this.editing;
        const body = this.readForm(form);
        if (body.access_level === SUPER && e.access_level !== SUPER && e.original !== null) {
            if (!await window.customConfirm('להעניק הרשאת מנהל-על? בעל ההרשאה יוכל לראות ולשנות את כל הסיסמאות.')) return;
        }
        const btn = form.querySelector('[type="submit"]');
        btn.disabled = true;
        const r = e.original === null
            ? await this.call('POST', '', body)
            : await this.call('PUT', `?value=${encodeURIComponent(e.original)}`, body);
        btn.disabled = false;
        if (!r.ok) return window.notify(this.errText(r, 'שמירת ההרשאה נכשלה.'), 'error');

        // שינוי הסיסמה שאיתה אני מחובר — מעדכנים גם בדפדפן כדי לא להתנתק
        if (r.data && r.data.was_current && e.rule_type === 'password' && body.rule_value !== e.original) {
            try { localStorage.setItem('peer_api_key', body.rule_value); } catch (err) {}
        }
        window.notify(e.original === null ? 'ההרשאה נוספה בהצלחה' : 'ההרשאה עודכנה בהצלחה', 'success');
        this.editing = null;
        await this.load();
    }

    async remove(rule) {
        const what = rule.rule_type === 'ip' ? `כתובת ה-IP ${rule.rule_value}` : `הסיסמה${rule.description ? ` (${rule.description})` : ''}`;
        if (!await window.customConfirm(`למחוק את ${what}? מי שמשתמש בה יאבד גישה למערכת.`)) return;
        const r = await this.call('DELETE', `?value=${encodeURIComponent(rule.rule_value)}`);
        if (!r.ok) return window.notify(this.errText(r, 'מחיקת ההרשאה נכשלה.'), 'error');
        window.notify('ההרשאה נמחקה', 'success');
        if (this.editing && this.editing.original === rule.rule_value) this.editing = null;
        await this.load();
    }

    async copy(v) {
        try { await navigator.clipboard.writeText(v); window.notify('הועתק ללוח', 'info', { duration: 2000 }); }
        catch (e) { window.notify('ההעתקה נכשלה', 'error'); }
    }

    css() {
        if (document.getElementById('adStyles')) return;
        const style = document.createElement('style');
        style.id = 'adStyles';
        style.textContent = `
        #view-admin { overflow-y: auto; }
        .ad-wrap { padding-bottom: 20px; }
        .ad-head { display: flex; justify-content: space-between; align-items: center; gap: 10px; margin-bottom: 12px; flex-wrap: wrap; }
        .ad-head h2 { font-size: 1.2rem; color: #0f172a; display: flex; align-items: center; gap: 8px; }
        .ad-head h2 i { color: #7c3aed; }
        .ad-actions { display: flex; gap: 8px; }
        .ad-ip { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
        .ad-ip > i { color: var(--primary-color); }
        .ad-ip > span { flex: 1; }
        .ad-card { padding: 12px 16px; }
        .ad-search { position: relative; margin-bottom: 10px; }
        .ad-search i { position: absolute; right: 10px; top: 50%; transform: translateY(-50%); color: var(--text-muted); }
        .ad-search input { width: 100%; padding: 8px 32px 8px 10px; border: 1px solid var(--border-color); border-radius: 6px; font-size: .85rem; }
        .ad-table-wrap { overflow-x: auto; }
        .ad-table { width: 100%; border-collapse: collapse; font-size: .85rem; }
        .ad-table th { text-align: right; font-weight: 600; color: var(--text-muted); padding: 6px 8px; border-bottom: 1px solid var(--border-color); white-space: nowrap; }
        .ad-table td { padding: 8px; border-bottom: 1px solid #f1f5f9; vertical-align: middle; }
        .ad-table tr.ad-current td { background: #f5f3ff; }
        .ad-type { white-space: nowrap; } .ad-type i { color: var(--text-muted); margin-left: 4px; }
        .ad-val { font-family: ui-monospace, Menlo, Consolas, monospace; background: #f8fafc; border: 1px solid var(--border-color); border-radius: 4px; padding: 2px 6px; }
        .ad-ico { background: none; border: none; color: var(--text-muted); cursor: pointer; padding: 4px 6px; border-radius: 4px; }
        .ad-ico:hover:not(:disabled) { background: #f1f5f9; color: var(--primary-color); }
        .ad-ico.danger:hover:not(:disabled) { background: rgba(239,68,68,.1); color: var(--danger); }
        .ad-ico:disabled { opacity: .3; cursor: not-allowed; }
        .ad-row-actions { white-space: nowrap; text-align: left; }
        .ad-lv { display: inline-flex; align-items: center; gap: 5px; padding: 2px 10px; border-radius: 99px; font-size: .78rem; font-weight: 700; white-space: nowrap; }
        .ad-lv.lv-super { background: #ede9fe; color: #6d28d9; }
        .ad-lv.lv-admin { background: #ecfdf5; color: #047857; }
        .ad-lv.lv-ro { background: #fffbeb; color: #b45309; }
        .ad-tag { display: inline-block; background: #ede9fe; color: #6d28d9; font-size: .7rem; font-weight: 700; padding: 1px 8px; border-radius: 99px; margin-right: 6px; }
        .ad-desc { color: var(--text-main); }
        .ad-date { color: var(--text-muted); white-space: nowrap; }
        .ad-empty { text-align: center; color: var(--text-muted); padding: 20px !important; }
        .ad-fail { text-align: center; padding: 40px; color: var(--danger); }
        .ad-fail .btn { margin-top: 12px; }
        .ad-form { border-color: #c4b5fd; }
        .ad-form h3 { margin-bottom: 12px; }
        .ad-fields { display: flex; gap: 12px; flex-wrap: wrap; }
        .ad-fields label { display: flex; flex-direction: column; gap: 4px; font-size: .8rem; color: var(--text-muted); min-width: 140px; }
        .ad-fields label.ad-grow { flex: 1; min-width: 200px; }
        .ad-fields input, .ad-fields select { padding: 7px 10px; border: 1px solid var(--border-color); border-radius: 6px; font-size: .88rem; color: var(--text-main); background: #fff; height: 34px; }
        .ad-inline { display: flex; gap: 6px; } .ad-inline input { flex: 1; min-width: 0; }
        .ad-warn { margin-top: 10px; background: #fffbeb; color: #92400e; border: 1px solid #fde68a; border-radius: 6px; padding: 8px 10px; font-size: .82rem; }
        .ad-form .text-muted { margin-top: 8px; }
        .ad-form-actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 12px; }`;
        document.head.appendChild(style);
    }
}
