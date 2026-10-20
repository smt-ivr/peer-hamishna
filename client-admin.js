// ============================================================
//  client-admin.js — ניהול הרשאות גישה (סיסמאות וכתובות IP) — למנהל-על בלבד
//  new AdminManager(container, apiBase, menuItem)
//  שני תתי-טאבים: הרשאות (סיסמאות / IP) | היסטוריית כניסות (מוצלחות ונכשלות)
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

// זיהוי מכשיר ודפדפן מתוך ה-User-Agent (לתצוגה בלבד)
function parseUA(ua) {
    ua = String(ua || '');
    if (!ua) return { icon: 'fa-question-circle', label: 'לא ידוע' };
    const os = /iPhone|iPad/.test(ua) ? 'iPhone' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows' : /Mac OS X/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : '';
    const br = /Edg\//.test(ua) ? 'Edge' : /SamsungBrowser/.test(ua) ? 'Samsung' : /OPR\//.test(ua) ? 'Opera' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : '';
    const mobile = /Mobi|iPhone|Android/.test(ua);
    return { icon: mobile ? 'fa-mobile-alt' : 'fa-desktop', label: [br, os].filter(Boolean).join(' · ') || 'אחר' };
}

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
        this.tab = 'rules';
        this.log = { rows: [], stats: null, top: [], hasMore: false, result: '', q: '', loaded: false };
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
        if (this.tab === 'log') return this.loadLog();
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
    tabs() {
        const t = (id, icon, label) => `<button class="ad-tab ${this.tab === id ? 'active' : ''}" data-ad="tab" data-v="${id}"><i class="fas ${icon}"></i> ${label}</button>`;
        return `<div class="ad-tabs">${t('rules', 'fa-key', 'הרשאות')}${t('log', 'fa-history', 'היסטוריית כניסות')}</div>`;
    }

    render() {
        if (this.tab === 'log') return this.renderLog();
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
            ${this.tabs()}

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
            <td data-l="סוג"><span class="ad-type"><i class="fas ${ty[1]}"></i> ${ty[0]}</span></td>
            <td data-l="ערך"><span class="ad-val" dir="ltr">${visible ? v : '••••••••'}</span>
                ${isPass ? `<button class="ad-ico" data-ad="toggle" data-v="${v}" title="${visible ? 'הסתר' : 'הצג'}"><i class="fas ${visible ? 'fa-eye-slash' : 'fa-eye'}"></i></button>` : ''}
                <button class="ad-ico" data-ad="copy" data-v="${v}" title="העתק"><i class="far fa-copy"></i></button>
                ${r.is_current ? '<span class="ad-tag">החיבור הנוכחי</span>' : ''}</td>
            <td data-l="הרשאה"><span class="ad-lv ${lv[2]}"><i class="fas ${lv[1]}"></i> ${lv[0]}</span></td>
            <td class="ad-desc" data-l="תיאור">${esc(r.description || '')}</td>
            <td class="ad-date" data-l="נוצר">${esc(String(r.created_at || '').slice(0, 10))}</td>
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
            if (act === 'tab') { this.tab = v; this.render(); return this.load(); }
            if (act === 'log-result') { this.log.result = v; return this.loadLog(); }
            if (act === 'log-more') return this.loadLog(true);
            if (act === 'log-ip') { this.log.q = v; return this.loadLog(); }
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
            if (ev.target.matches('[data-ad-logq]')) {
                clearTimeout(this.logTimer);
                this.log.q = ev.target.value;
                this.logTimer = setTimeout(() => this.loadLog(), 350);
                return;
            }
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

    // ============================================================
    //  היסטוריית כניסות
    // ============================================================
    async loadLog(more = false) {
        const L = this.log;
        const qs = new URLSearchParams({ limit: '100' });
        if (L.result) qs.set('result', L.result);
        if (L.q.trim()) qs.set('q', L.q.trim());
        if (more && L.rows.length) qs.set('before_id', String(L.rows[L.rows.length - 1].id));
        if (!L.loaded) this.renderLog(true);
        const seq = (this.logSeq = (this.logSeq || 0) + 1);
        let r;
        try {
            const res = await fetch(`${this.apiBase}/admin/login-log?${qs}`, { silent: true });
            r = { ok: res.ok, data: await res.json().catch(() => null) };
        } catch (e) { r = { ok: false, data: { message: 'שגיאת תקשורת מול השרת.' } }; }
        if (seq !== this.logSeq || this.tab !== 'log') return;      // תשובה ישנה — מתעלמים
        if (!r.ok || !r.data || !Array.isArray(r.data.rows)) {
            window.notify(this.errText(r, 'שגיאה בטעינת היסטוריית הכניסות.'), 'error');
            L.loaded = true; return this.renderLog();
        }
        L.rows = more ? L.rows.concat(r.data.rows) : r.data.rows;
        L.stats = r.data.stats; L.top = r.data.top_fail_ips || []; L.hasMore = r.data.has_more; L.loaded = true;
        L.note = r.data.message || '';
        this.renderLog();
    }

    renderLog(loading = false) {
        const L = this.log, st = L.stats || {};
        const kpi = (cls, icon, label, value) => `<div class="ad-kpi ${cls}"><i class="fas ${icon}"></i><div><div class="ad-kpi-v">${value}</div><div class="ad-kpi-l">${label}</div></div></div>`;
        const seg = (v, label) => `<button class="ad-seg ${L.result === v ? 'active' : ''}" data-ad="log-result" data-v="${v}">${label}</button>`;
        const focused = document.activeElement && document.activeElement.matches && document.activeElement.matches('[data-ad-logq]');
        const pos = focused ? document.activeElement.selectionStart : null;

        this.container.innerHTML = `
        <div class="ad-wrap">
            <div class="ad-head">
                <div>
                    <h2><i class="fas fa-user-shield"></i> ניהול הרשאות</h2>
                    <span class="text-muted">כל ניסיון כניסה למערכת — מוצלח או נכשל · נשמר 180 יום</span>
                </div>
                <div class="ad-actions"><button class="btn btn-outline btn-sm" data-ad="reload" title="רענון"><i class="fas fa-sync-alt"></i></button></div>
            </div>
            ${this.tabs()}
            ${loading ? '<div class="loading"><i class="fas fa-spinner fa-spin"></i> טוען היסטוריית כניסות...</div>' : `
            <div class="ad-kpis">
                ${kpi('ok', 'fa-sign-in-alt', 'כניסות מוצלחות היום', st.today_success || 0)}
                ${kpi('no', 'fa-ban', 'ניסיונות שנכשלו היום', st.today_fail || 0)}
                ${kpi('warn', 'fa-exclamation-triangle', 'נכשלו ב-24 שעות', st.fail_24h || 0)}
                ${kpi('', 'fa-network-wired', 'כתובות IP שונות (7 ימים)', st.unique_ips_7d || 0)}
            </div>
            ${L.top.length ? `<div class="card ad-topfail"><b><i class="fas fa-shield-virus"></i> כתובות עם הכי הרבה כישלונות (7 ימים):</b>
                ${L.top.map(t => `<button class="ad-chip" data-ad="log-ip" data-v="${esc(t.ip)}" title="סינון לפי כתובת זו"><span dir="ltr">${esc(t.ip)}</span>${t.city || t.country ? ` · ${esc(t.city || t.country)}` : ''} <b>${t.count}</b></button>`).join('')}</div>` : ''}
            <div class="card ad-card">
                <div class="ad-log-tools">
                    <div class="ad-segs">${seg('', 'הכל')}${seg('success', '<i class="fas fa-check"></i> הצליחו')}${seg('fail', '<i class="fas fa-times"></i> נכשלו')}</div>
                    <div class="ad-search"><i class="fas fa-search"></i><input type="text" data-ad-logq placeholder="חיפוש לפי IP, תיאור או עיר..." value="${esc(L.q)}"></div>
                </div>
                ${L.note ? `<div class="ad-warn">${esc(L.note)}</div>` : ''}
                <div class="ad-table-wrap"><table class="ad-table ad-log">
                    <thead><tr><th>זמן</th><th>תוצאה</th><th>זוהה כ-</th><th>אופן</th><th>כתובת IP</th><th>מכשיר</th></tr></thead>
                    <tbody>${L.rows.length ? L.rows.map(x => this.logRow(x)).join('') : '<tr><td colspan="6" class="ad-empty">אין רשומות להצגה</td></tr>'}</tbody>
                </table></div>
                ${L.hasMore ? '<div class="ad-more"><button class="btn btn-outline btn-sm" data-ad="log-more">טען עוד</button></div>' : ''}
            </div>`}
        </div>`;

        if (focused) {
            const inp = this.container.querySelector('[data-ad-logq]');
            if (inp) { inp.focus(); inp.setSelectionRange(pos, pos); }
        }
    }

    logRow(x) {
        const ok = x.success === 1;
        const [d, t] = String(x.created_at || '').split(' ');
        const date = d ? d.split('-').reverse().join('/') : '';
        const lv = LEVELS[x.access_level];
        const who = ok
            ? `${lv ? `<span class="ad-lv ${lv[2]}"><i class="fas ${lv[1]}"></i> ${lv[0]}</span>` : ''} ${esc(x.rule_description || '')}`
            : `<span class="text-muted">${x.key_length ? 'סיסמה שגויה' : 'IP לא מורשה'}</span>`;
        const byIp = x.method === 'ip' || (!x.method && !x.key_length);
        const how = byIp ? '<i class="fas fa-network-wired"></i> IP' : '<i class="fas fa-key"></i> סיסמה';
        const mode = x.mode === 'auto' ? 'אוטומטית' : 'ידנית';
        const place = [x.city, x.country].filter(Boolean).join(', ');
        const dev = parseUA(x.user_agent);
        return `<tr class="${ok ? '' : 'ad-failrow'}">
            <td data-l="זמן" class="ad-date"><b>${esc(String(t || '').slice(0, 5))}</b> ${esc(date)}</td>
            <td data-l="תוצאה">${ok ? '<span class="ad-res ok"><i class="fas fa-check-circle"></i> הצליחה</span>' : '<span class="ad-res no"><i class="fas fa-times-circle"></i> נכשלה</span>'}</td>
            <td data-l="זוהה כ-">${who}</td>
            <td data-l="אופן" class="ad-type">${how} <span class="text-muted">· ${mode}</span></td>
            <td data-l="IP"><span class="ad-val" dir="ltr">${esc(x.ip || '')}</span>${place ? `<div class="text-muted">${esc(place)}</div>` : ''}</td>
            <td data-l="מכשיר" class="ad-type" title="${esc(x.user_agent || '')}"><i class="fas ${dev.icon}"></i> ${esc(dev.label)}</td>
        </tr>`;
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
        .ad-form-actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 12px; }
        .ad-tabs { display: flex; gap: 4px; border-bottom: 1px solid var(--border-color); margin-bottom: 12px; }
        .ad-tab { background: none; border: none; border-bottom: 2px solid transparent; margin-bottom: -1px; padding: 9px 14px; font-size: .88rem; font-weight: 600; color: var(--text-muted); cursor: pointer; display: inline-flex; align-items: center; gap: 6px; }
        .ad-tab:hover { color: var(--text-main); }
        .ad-tab.active { color: #6d28d9; border-bottom-color: #7c3aed; }
        .ad-kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 10px; margin-bottom: 12px; }
        .ad-kpi { background: #fff; border: 1px solid var(--border-color); border-radius: 10px; padding: 12px 14px; display: flex; align-items: center; gap: 12px; }
        .ad-kpi > i { width: 36px; height: 36px; border-radius: 10px; display: flex; align-items: center; justify-content: center; background: #eff6ff; color: var(--primary-color); flex: none; }
        .ad-kpi.ok > i { background: #ecfdf5; color: #059669; }
        .ad-kpi.no > i { background: #fef2f2; color: #dc2626; }
        .ad-kpi.warn > i { background: #fffbeb; color: #d97706; }
        .ad-kpi-v { font-size: 1.35rem; font-weight: 800; color: #0f172a; line-height: 1.2; }
        .ad-kpi-l { font-size: .78rem; color: var(--text-muted); }
        .ad-topfail { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font-size: .85rem; }
        .ad-topfail > b i { color: var(--danger); margin-left: 4px; }
        .ad-chip { border: 1px solid #fecaca; background: #fef2f2; color: #991b1b; border-radius: 99px; padding: 3px 10px; font-size: .8rem; cursor: pointer; }
        .ad-chip b { background: #dc2626; color: #fff; border-radius: 99px; padding: 0 6px; margin-right: 4px; font-size: .72rem; }
        .ad-log-tools { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; margin-bottom: 10px; }
        .ad-log-tools .ad-search { flex: 1; min-width: 200px; margin-bottom: 0; }
        .ad-segs { display: inline-flex; background: #f1f5f9; border-radius: 8px; padding: 3px; }
        .ad-seg { border: none; background: none; padding: 5px 12px; border-radius: 6px; font-size: .82rem; font-weight: 600; color: var(--text-muted); cursor: pointer; white-space: nowrap; }
        .ad-seg.active { background: #fff; color: #0f172a; box-shadow: 0 1px 3px rgba(0,0,0,.08); }
        .ad-res { display: inline-flex; align-items: center; gap: 5px; font-weight: 700; font-size: .8rem; white-space: nowrap; }
        .ad-res.ok { color: #047857; } .ad-res.no { color: #dc2626; }
        .ad-table tr.ad-failrow td { background: #fffafa; }
        .ad-log td { white-space: nowrap; }
        .ad-log td .text-muted { font-size: .75rem; }
        .ad-more { text-align: center; padding-top: 12px; }
        @media (max-width: 768px) {
            .ad-head { align-items: flex-start; }
            .ad-tabs { overflow-x: auto; }
            .ad-tab { white-space: nowrap; }
            .ad-kpis { grid-template-columns: 1fr 1fr; }
            .ad-kpi { padding: 10px; gap: 8px; }
            .ad-kpi-v { font-size: 1.15rem; }
            /* טבלאות → כרטיסים */
            .ad-table thead { display: none; }
            .ad-table, .ad-table tbody, .ad-table tr, .ad-table td { display: block; width: 100%; }
            .ad-table tr { border: 1px solid var(--border-color); border-radius: 10px; padding: 8px 12px; margin-bottom: 10px; background: #fff; }
            .ad-table td { border: none !important; padding: 5px 0 !important; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; white-space: normal !important; }
            .ad-table td[data-l]::before { content: attr(data-l); flex: none; width: 64px; font-size: .75rem; color: var(--text-muted); font-weight: 600; }
            .ad-table td.ad-row-actions { justify-content: flex-end; border-top: 1px solid #f1f5f9 !important; margin-top: 4px; padding-top: 8px !important; }
            .ad-table td.ad-empty { display: block; }
            .ad-table td .text-muted { width: 100%; padding-right: 72px; }
            .ad-fields label, .ad-fields label.ad-grow { min-width: 100%; }
            .ad-ico { padding: 8px 10px; }
        }`;
        document.head.appendChild(style);
    }
}
