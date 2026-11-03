// ============================================================
//  client-phone.js — מספרים מורשים לקו עדכון הציונים (למנהל-על בלבד)
//  new PhoneManager(container, apiBase, menuItem)
//  לשוניות: מספרים מורשים | יומן שיחות. ההגנה האמיתית בשרת (phone_access.js).
// ============================================================

const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = (root, sel) => root.querySelector(sel);
const DAYS = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'];   // 0 = ראשון

const fmtPhone = p => { p = String(p || ''); return p.length === 10 ? `${p.slice(0, 3)}-${p.slice(3)}` : p.length === 9 ? `${p.slice(0, 2)}-${p.slice(2)}` : p; };
const fmtTime = ts => { const m = /^\d{2}(\d{2})-(\d{2})-(\d{2}) (\d{2}:\d{2})/.exec(ts || ''); return m ? `${m[3]}/${m[2]}/${m[1]} ${m[4]}` : ''; };
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
            this.container.innerHTML = `<div class="ph-fail"><i class="fas fa-lock"></i><div>${esc(this.err(r, 'שגיאה בטעינה.'))}</div><button class="btn btn-outline btn-sm" data-ph="reload">נסה שוב</button></div>`;
            return;
        }
        this.data = r.data;
        this.data.numbers.sort((a, b) => String(a.name).localeCompare(String(b.name), 'he', { numeric: true }));
        this.blocked = { ...r.data.settings.blocked };
        this.render();
        if (this.tab === 'log') this.loadLog();
    }

    render() {
        if (!this.data) return;
        const t = this.data.today;
        const tab = (id, label) => `<button class="ph-tab ${this.tab === id ? 'on' : ''}" data-ph="tab" data-v="${id}">${label}</button>`;
        this.container.innerHTML = `
        <div class="ph-wrap">
            <div class="ph-head"><h2><i class="fas fa-phone-alt"></i> הרשאות טלפון</h2>
                <span class="ph-mut">קו עדכון הציונים · היום: ${t.calls} שיחות, ${t.blocked} נחסמו, ${t.updates} ציונים עודכנו</span></div>
            <div class="ph-tabs">${tab('numbers', `מספרים מורשים (${this.data.numbers.length})`)}${tab('log', 'יומן שיחות')}</div>
            ${this.tab === 'numbers' ? this.numbersHtml() : this.logHtml()}
        </div>`;
    }

    // ============================================================
    //  מספרים מורשים
    // ============================================================
    numbersHtml() {
        const d = this.data, b = this.blocked;
        const row = n => `<tr class="${n.active ? '' : 'off'}">
            <td><b>${esc(n.name)}</b></td><td dir="ltr" class="ph-ph">${esc(fmtPhone(n.phone))}</td>
            <td>${n.sched_enabled ? `${daysText(parseDays(n.days))} <span dir="ltr">${esc(n.time_from)}–${esc(n.time_to)}</span>` : 'תמיד'}</td>
            <td><button class="ph-st ${n.active ? 'on' : ''}" data-ph="toggle" data-v="${n.id}" title="לחיצה: ${n.active ? 'השבתה' : 'הפעלה'}">${n.active ? 'פעיל' : 'מושבת'}</button></td>
            <td class="ph-mut">${n.last_call ? fmtTime(n.last_call) : ''}</td>
            <td class="ph-acts"><button class="ph-ico" data-ph="edit" data-v="${n.id}" title="עריכה"><i class="fas fa-pen"></i></button>
                <button class="ph-ico danger" data-ph="del" data-v="${n.id}" title="מחיקה"><i class="fas fa-trash-alt"></i></button></td></tr>`;
        const sugg = d.suggestions && d.suggestions.length ? `<div class="ph-sugg"><span class="ph-mut">עדכנו ציונים בטלפון בעבר:</span>
            ${d.suggestions.map(s => `<button class="ph-chip" data-ph="add-sugg" data-v="${esc(s.phone)}" title="${s.updates} עדכונים">${esc(fmtPhone(s.phone))} <i class="fas fa-plus"></i></button>`).join('')}</div>` : '';
        return `
            ${d.numbers.length ? '' : '<div class="ph-note warn"><i class="fas fa-exclamation-triangle"></i> הרשימה ריקה, ולכן כרגע אף אחד לא יכול לעדכן ציונים בטלפון. רק מספרים שיתווספו לכאן יוכלו לעדכן.</div>'}
            <div class="card ph-card">
                <div class="ph-bar"><b>מספרים שמורשים לעדכן ציונים</b><button class="btn btn-primary btn-sm" data-ph="new"><i class="fas fa-plus"></i> הוספת מספר</button></div>
                ${this.editing ? this.formHtml() : ''}
                <table class="ph-t"><thead><tr><th>שם</th><th>טלפון</th><th>מתי מורשה</th><th>מצב</th><th>שיחה אחרונה</th><th></th></tr></thead>
                <tbody>${d.numbers.length ? d.numbers.map(row).join('') : '<tr><td colspan="6" class="ph-empty">עדיין לא נוספו מספרים</td></tr>'}</tbody></table>
                ${sugg}
            </div>
            <div class="card ph-card ph-blk">
                <b>מספר לא מורשה שמתקשר:</b>
                <span class="ph-seg"><button class="${b.action === 'hangup' ? 'on' : ''}" data-ph="bact" data-v="hangup">ניתוק</button><button class="${b.action === 'goto' ? 'on' : ''}" data-ph="bact" data-v="goto">העברה לשלוחה</button></span>
                ${b.action === 'goto' ? `<input class="ph-in ph-folder" dir="ltr" data-b="folder" value="${esc(b.folder)}" placeholder="/5">` : ''}
                <input class="ph-in ph-grow" data-b="message" value="${esc(b.message)}" placeholder="הודעה שתושמע (ריק = בלי הודעה)">
                <button class="btn btn-primary btn-sm" data-ph="save-blk" ${this.blkDirty ? '' : 'disabled'}><i class="fas fa-save"></i> שמירה</button>
            </div>`;
    }

    formHtml() {
        const e = this.editing, days = new Set(e.days);
        return `<form class="ph-form" data-ph-form>
            <input name="name" class="ph-in" value="${esc(e.name)}" placeholder="שם" required>
            <input name="phone" class="ph-in" dir="ltr" value="${esc(e.phone)}" placeholder="0501234567" inputmode="tel" required>
            <label class="ph-chk"><input type="checkbox" name="sched" ${e.sched_enabled ? 'checked' : ''}> רק בשעות מסוימות</label>
            <span class="ph-sched ${e.sched_enabled ? '' : 'hidden'}">
                <span class="ph-days">${DAYS.map((l, i) => `<label class="${days.has(i) ? 'on' : ''}"><input type="checkbox" name="day" value="${i}" ${days.has(i) ? 'checked' : ''}>${l}</label>`).join('')}</span>
                <input type="time" name="time_from" class="ph-in" value="${esc(e.time_from)}"> עד <input type="time" name="time_to" class="ph-in" value="${esc(e.time_to)}"></span>
            <span class="ph-fa"><button type="button" class="btn btn-outline btn-sm" data-ph="cancel">ביטול</button>
                <button type="submit" class="btn btn-primary btn-sm">${e.id ? 'שמירה' : 'הוספה'}</button></span>
            <div class="ph-ferr" data-ph-ferr></div>
        </form>`;
    }

    readForm(form) {
        const v = n => form.querySelector(`[name="${n}"]`).value;
        return { ...this.editing, name: v('name').trim(), phone: v('phone').trim(), sched_enabled: form.querySelector('[name="sched"]').checked,
            days: [...form.querySelectorAll('[name="day"]:checked')].map(x => Number(x.value)), time_from: v('time_from') || '00:00', time_to: v('time_to') || '23:59' };
    }

    async saveNumber(form) {
        const e = this.readForm(form), errEl = $(form, '[data-ph-ferr]');
        const r = e.id ? await this.call('PUT', `/numbers?id=${e.id}`, e) : await this.call('POST', '/numbers', e);
        if (!r.ok) { errEl.textContent = this.err(r, 'השמירה נכשלה.'); return; }
        this.editing = null;
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
        const r = await this.call('PUT', '/settings', { settings: { blocked: this.blocked } });
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
            <div class="ph-bar"><span class="ph-seg">${seg('', 'הכל')}${seg('allowed', 'אושרו')}${seg('blocked', 'נחסמו')}</span>
                <input class="ph-in ph-grow" data-ph-logq placeholder="חיפוש לפי שם או מספר..." value="${esc(L.q)}"></div>
            <div data-ph-log>${L.loaded ? '' : '<div class="ph-empty"><i class="fas fa-spinner fa-spin"></i></div>'}</div></div>`;
    }

    paintLog() {
        const box = $(this.container, '[data-ph-log]');
        if (!box) return;
        const L = this.log, R = this.data.reasons || {};
        const rows = L.rows.map(r => {
            const ok = String(r.reason).startsWith('ok_'), open = L.open[r.id];
            const upd = r.updates ? `<button class="ph-upd" data-ph="upd" data-v="${r.id}">${r.updates} <i class="fas fa-chevron-${open ? 'up' : 'down'}"></i></button>` : '';
            const det = open ? `<tr class="ph-det"><td colspan="6">${open === 'loading' ? '<i class="fas fa-spinner fa-spin"></i>' : open.map(u =>
                `<div>${esc(u.created_at.slice(11, 16))} · <b>${esc(u.student_name)}</b> (${esc(u.student_code)}) · מבחן <b>${esc(u.exam_code)}</b> · <span class="${u.passed === 1 ? 'ok' : 'bad'}">${u.passed === 1 ? 'עבר' : 'לא עבר'}</span></div>`).join('')}</td></tr>` : '';
            return `<tr><td class="ph-mut">${esc(fmtTime(r.created_at))}</td><td dir="ltr" class="ph-ph">${r.phone ? esc(fmtPhone(r.phone)) : 'חסוי'}</td>
                <td>${esc(r.number_name || '')}</td><td class="${ok ? 'ok' : 'bad'}">${esc(R[r.reason] || r.reason)}</td><td>${esc(actionText(r.action))}</td><td>${upd}</td></tr>${det}`;
        }).join('');
        box.innerHTML = `<table class="ph-t"><thead><tr><th>מתי</th><th>טלפון</th><th>שם</th><th>תוצאה</th><th>פעולה</th><th>ציונים</th></tr></thead>
            <tbody>${rows || '<tr><td colspan="6" class="ph-empty">אין שיחות</td></tr>'}</tbody></table>
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
    bind() {
        const c = this.container;
        const blank = (phone = '') => ({ id: null, name: '', phone, sched_enabled: false, days: [0, 1, 2, 3, 4, 5], time_from: '08:00', time_to: '22:00' });
        c.addEventListener('click', ev => {
            const b = ev.target.closest('[data-ph]');
            if (!b || b.disabled) return;
            const act = b.dataset.ph, v = b.dataset.v, num = this.data && this.data.numbers.find(n => String(n.id) === String(v));
            if (act === 'reload') return this.load();
            if (act === 'tab') { this.tab = v; this.render(); if (v === 'log') this.loadLog(); return; }
            if (act === 'new' || act === 'add-sugg') { this.editing = blank(act === 'add-sugg' ? v : ''); this.render(); const i = $(c, '[data-ph-form] [name="name"]'); if (i) i.focus(); return; }
            if (act === 'edit' && num) { this.editing = { ...num, days: parseDays(num.days), sched_enabled: !!num.sched_enabled }; this.render(); return; }
            if (act === 'cancel') { this.editing = null; return this.render(); }
            if (act === 'toggle' && num) return this.toggleNumber(num);
            if (act === 'del' && num) return this.deleteNumber(num);
            if (act === 'bact') { this.blocked.action = v; this.blkDirty = true; return this.render(); }
            if (act === 'save-blk') return this.saveBlocked();
            if (act === 'log-result') { this.log.result = v; this.render(); return this.loadLog(); }
            if (act === 'log-more') return this.loadLog(true);
            if (act === 'upd') return this.toggleUpdates(v);
        });
        c.addEventListener('change', ev => {
            const t = ev.target;
            if (t.name === 'day') t.parentElement.classList.toggle('on', t.checked);
            if (t.name === 'sched') $(t.closest('form'), '.ph-sched').classList.toggle('hidden', !t.checked);
        });
        c.addEventListener('input', ev => {
            const t = ev.target;
            if (t.dataset.b) { this.blocked[t.dataset.b] = t.value; this.blkDirty = true; const s = $(c, '[data-ph="save-blk"]'); if (s) s.disabled = false; return; }
            if (t.matches('[data-ph-logq]')) { clearTimeout(this._lq); this.log.q = t.value; this._lq = setTimeout(() => this.loadLog(), 350); }
        });
        c.addEventListener('submit', ev => { if (ev.target.matches('[data-ph-form]')) { ev.preventDefault(); this.saveNumber(ev.target); } });
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
        .ph-form{display:flex;flex-wrap:wrap;gap:8px;align-items:center;background:#f8fafc;border:1px solid var(--border-color);border-radius:8px;padding:10px;margin-bottom:8px}
        .ph-form [name=name]{width:170px}.ph-form [name=phone]{width:140px}
        .ph-chk{display:inline-flex;align-items:center;gap:5px;font-size:.85rem;cursor:pointer}
        .ph-sched{display:inline-flex;align-items:center;gap:6px;flex-wrap:wrap;font-size:.85rem}.ph-sched.hidden{display:none}
        .ph-days{display:inline-flex;gap:2px}.ph-days input{display:none}
        .ph-days label{width:26px;height:26px;border:1px solid var(--border-color);border-radius:5px;display:inline-flex;align-items:center;justify-content:center;font-weight:700;font-size:.8rem;cursor:pointer;background:#fff;color:#64748b;user-select:none}
        .ph-days label.on{background:var(--primary-color);border-color:var(--primary-color);color:#fff}
        .ph-fa{display:inline-flex;gap:6px;margin-right:auto}.ph-ferr{width:100%;color:#b91c1c;font-size:.82rem}.ph-ferr:empty{display:none}
        .ph-sugg{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-top:10px}
        .ph-chip{border:1px dashed #93c5fd;background:#fff;color:#1d4ed8;border-radius:99px;padding:2px 10px;font-size:.78rem;cursor:pointer;font-family:ui-monospace,Menlo,Consolas,monospace;direction:ltr}
        .ph-blk{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:.88rem}
        .ph-seg{display:inline-flex;border:1px solid var(--border-color);border-radius:6px;overflow:hidden;background:#fff}
        .ph-seg button{border:none;background:none;padding:5px 11px;font-size:.8rem;font-weight:600;color:#475569;cursor:pointer;font-family:inherit}
        .ph-seg button+button{border-right:1px solid var(--border-color)}.ph-seg button.on{background:var(--primary-color);color:#fff}
        .ph-upd{border:1px solid #bfdbfe;background:#eff6ff;color:#1d4ed8;border-radius:99px;padding:0 9px;font-size:.76rem;font-weight:700;cursor:pointer}
        .ph-det td{background:#f8fafc;font-size:.82rem;line-height:1.8;padding:6px 18px}
        .ph-fail{text-align:center;padding:40px 20px;color:#475569;display:flex;flex-direction:column;gap:12px;align-items:center}.ph-fail>i{font-size:2rem;color:#94a3b8}
        @media(max-width:768px){.ph-t{font-size:.8rem}.ph-form [name=name],.ph-form [name=phone]{width:100%}}`;
        document.head.appendChild(st);
    }
}
