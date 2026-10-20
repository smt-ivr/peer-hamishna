// ============================================================
//  client-dashboard.js — לוח בקרה: סקירה וסטטיסטיקות (מסך הפתיחה)
//  new DashboardManager(container, apiBase, onOpenStudent(code))
//  הנתונים מגיעים בקריאה אחת: GET /dashboard
// ============================================================

const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = v => '₪' + (Number(v) || 0).toLocaleString('he-IL', { minimumFractionDigits: 0, maximumFractionDigits: 1 });
const num = v => (Number(v) || 0).toLocaleString('he-IL');
const DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
const ddmm = d => { const [, m, day] = String(d).split('-'); return `${day}/${m}`; };
const when = s => { const [d, t] = String(s || '').split(' '); return d ? `${ddmm(d)} ${String(t || '').slice(0, 5)}` : ''; };
const SRC = { phone: ['טלפון', 'fa-phone'], web: ['אתר', 'fa-desktop'], 'web-bulk': ['אתר (מרובה)', 'fa-desktop'], other: ['לא ידוע', 'fa-question-circle'] };
const srcLabel = s => (SRC[s] || SRC.other)[0];
const srcIcon = s => (SRC[s] || (String(s).startsWith('web') ? SRC.web : SRC.other))[1];

export class DashboardManager {
    constructor(container, apiBase, onOpenStudent) {
        Object.assign(this, { container, apiBase, onOpenStudent });
        this.data = null;
        this.css();
        this.bind();
    }

    async load() {
        if (!this.data) this.container.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i> טוען לוח בקרה...</div>';
        try {
            const res = await fetch(`${this.apiBase}/dashboard`, { silent: true });
            const data = await res.json().catch(() => null);
            if (!res.ok || !data || !data.totals) throw new Error((data && (data.message || data.error)) || 'שגיאה בטעינת לוח הבקרה.');
            this.data = data;
            this.render();
        } catch (e) {
            if (this.data) return window.notify(e.message, 'error');
            this.container.innerHTML = `<div class="db-fail"><i class="fas fa-exclamation-circle"></i> ${esc(e.message)}<br><button class="btn btn-outline btn-sm" data-db-reload>נסה שוב</button></div>`;
        }
    }

    bind() {
        this.container.addEventListener('click', (e) => {
            if (e.target.closest('[data-db-reload]')) return this.load();
            const st = e.target.closest('[data-db-student]');
            if (st && this.onOpenStudent) this.onOpenStudent(st.getAttribute('data-db-student'));
        });
        // טולטיפ לגרפים
        this.container.addEventListener('mouseover', (e) => {
            const m = e.target.closest('[data-tip]');
            const tip = this.container.querySelector('.db-tip');
            if (!tip) return;
            if (!m) { tip.classList.remove('show'); return; }
            tip.innerHTML = m.getAttribute('data-tip');
            tip.classList.add('show');
        });
        this.container.addEventListener('mousemove', (e) => {
            const tip = this.container.querySelector('.db-tip.show');
            if (!tip) return;
            const box = this.container.getBoundingClientRect();
            const x = Math.min(e.clientX - box.left + 14, box.width - tip.offsetWidth - 6);
            tip.style.left = Math.max(6, x) + 'px';
            tip.style.top = (e.clientY - box.top + this.container.scrollTop - tip.offsetHeight - 12) + 'px';
        });
        this.container.addEventListener('mouseleave', () => {
            const tip = this.container.querySelector('.db-tip');
            if (tip) tip.classList.remove('show');
        });
    }

    // ============================================================
    //  רינדור
    // ============================================================
    render() {
        const d = this.data, t = d.totals, p = d.periods;
        const diff = p.today.total - p.yesterday.total;
        const trend = diff === 0 ? 'כמו אתמול' : `${diff > 0 ? '▲' : '▼'} ${num(Math.abs(diff))} מאתמול`;

        this.container.innerHTML = `
        <div class="db-wrap">
            <div class="db-head">
                <div>
                    <h2><i class="fas fa-chart-pie"></i> לוח בקרה</h2>
                    <span class="text-muted">עודכן ב-${esc(when(d.generated_at))}</span>
                </div>
                <button class="btn btn-outline btn-sm" data-db-reload><i class="fas fa-sync-alt"></i> רענון</button>
            </div>

            <div class="db-kpis">
                ${this.kpi('fa-users', 'תלמידים פעילים', `${num(t.active_students)}<small> / ${num(t.students)}</small>`, `${num(t.students_no_results)} טרם נבחנו`)}
                ${this.kpi('fa-file-signature', 'בחינות שהוזנו', num(t.results), `${num(t.exams_attempted)} מתוך ${num(t.exams)} מבחנים`)}
                ${this.kpi('fa-check-circle', 'אחוז הצלחה', `${t.pass_rate}%`, `${num(t.passed)} עברו · ${num(t.failed)} לא עברו`)}
                ${this.kpi('fa-coins', 'סה״כ תגמולים', money(t.reward_total), `ממוצע ${money(t.avg_reward_per_active)} לתלמיד פעיל`)}
                ${this.kpi('fa-calendar-day', 'היום', num(p.today.total), trend)}
                ${this.kpi('fa-calendar-week', '7 ימים אחרונים', num(p.week.total), `${num(p.month.total)} ב-30 יום`)}
            </div>

            <div class="card db-card">
                <div class="db-card-h"><h3>פעילות ב-30 הימים האחרונים</h3>${this.legend()}</div>
                ${this.dailyChart(d.daily)}
            </div>

            <div class="db-grid db-grid-3">
                <div class="card db-card"><div class="db-card-h"><h3>עברו / לא עברו</h3></div>${this.split(t)}</div>
                <div class="card db-card"><div class="db-card-h"><h3>מקור העדכון</h3></div>${this.sources(d.sources)}</div>
                <div class="card db-card"><div class="db-card-h"><h3>פעילות לפי יום בשבוע</h3></div>${this.weekday(d.weekday)}</div>
            </div>

            <div class="card db-card">
                <div class="db-card-h"><h3>לפי כיתה</h3></div>
                ${this.classes(d.classes)}
            </div>

            <div class="db-grid db-grid-2">
                <div class="card db-card">
                    <div class="db-card-h"><h3><i class="fas fa-trophy" style="color:var(--warning)"></i> המובילים בתגמולים</h3></div>
                    ${this.list(d.top_students, s => this.studentRow(s, `${num(s.passed)} מבחנים`, money(s.reward)), 'עדיין אין תלמידים שעברו מבחנים')}
                </div>
                <div class="card db-card">
                    <div class="db-card-h"><h3><i class="fas fa-user-clock" style="color:var(--text-muted)"></i> לא נבחנו מעל שבועיים</h3><span class="db-pill">${num(d.inactive_count)}</span></div>
                    ${this.list(d.inactive_students, s => this.studentRow(s, `כיתה ${esc(s.class_grade)}`, `אחרון: ${esc(when(s.last_update).split(' ')[0])}`), 'כל התלמידים הפעילים נבחנו לאחרונה')}
                </div>
            </div>

            <div class="db-grid db-grid-2">
                <div class="card db-card">
                    <div class="db-card-h"><h3>המבחנים הנפוצים</h3></div>
                    ${this.list(d.popular_exams, e => this.examRow(e, `${num(e.attempts)} נבחנים`), 'אין נתונים')}
                </div>
                <div class="card db-card">
                    <div class="db-card-h"><h3>המבחנים הקשים</h3><span class="text-muted">אחוז הצלחה נמוך (3 נבחנים ומעלה)</span></div>
                    ${this.list(d.hardest_exams, e => this.examRow(e, `${e.pass_rate}% הצלחה`), 'אין מספיק נתונים')}
                </div>
            </div>

            <div class="card db-card">
                <div class="db-card-h"><h3>עדכונים אחרונים</h3></div>
                ${this.list(d.recent, r => `
                    <div class="db-row db-click" data-db-student="${esc(r.student_code)}">
                        <span class="db-dot ${r.passed ? 'ok' : 'no'}" title="${r.passed ? 'עבר' : 'לא עבר'}"><i class="fas ${r.passed ? 'fa-check' : 'fa-times'}"></i></span>
                        <span class="db-main"><b>${esc(r.name)}</b> <span class="text-muted">כיתה ${esc(r.class_grade)}</span></span>
                        <span class="db-sub">מבחן ${esc(r.exam_code)}${r.label ? ' · ' + esc(r.label) : ''}</span>
                        <span class="db-meta"><i class="fas ${srcIcon(r.source)}" title="${esc(srcLabel(r.source))}"></i> ${esc(when(r.updated_at))}</span>
                    </div>`, 'אין עדכונים עדיין')}
            </div>
            <div class="db-tip" role="tooltip"></div>
        </div>`;
    }

    kpi(icon, label, value, sub) {
        return `<div class="db-kpi"><div class="db-kpi-ico"><i class="fas ${icon}"></i></div>
            <div><div class="db-kpi-l">${label}</div><div class="db-kpi-v">${value}</div><div class="db-kpi-s">${esc(sub)}</div></div></div>`;
    }

    legend() {
        return `<div class="db-legend"><span><i class="ok"></i>עברו</span><span><i class="no"></i>לא עברו</span></div>`;
    }

    dailyChart(days) {
        const max = Math.max(1, ...days.map(x => x.passed + x.failed));
        const bars = days.map((x, i) => {
            const total = x.passed + x.failed;
            const dow = DAYS[new Date(`${x.date}T12:00:00`).getDay()];
            const tip = `<b>יום ${dow}, ${ddmm(x.date)}</b><br>סה״כ ${num(total)} · עברו ${num(x.passed)} · לא עברו ${num(x.failed)}`;
            const label = (i % 5 === 4 || i === days.length - 1) ? ddmm(x.date) : '';
            return `<div class="db-col" data-tip="${esc(tip)}">
                <div class="db-stack" style="height:${(total / max) * 100}%">
                    ${x.failed ? `<span class="no" style="flex:${x.failed}"></span>` : ''}
                    ${x.passed ? `<span class="ok" style="flex:${x.passed}"></span>` : ''}
                </div>
                <div class="db-x">${label}</div>
            </div>`;
        }).join('');
        return `<div class="db-chart"><div class="db-ymax">${num(max)}</div>${bars}</div>`;
    }

    split(t) {
        if (!t.results) return '<div class="db-empty">אין נתונים</div>';
        return `<div class="db-big">${t.pass_rate}%<small> הצלחה</small></div>
            <div class="db-split">
                <span class="ok" style="flex:${t.passed}" data-tip="עברו: ${num(t.passed)}"></span>
                <span class="no" style="flex:${t.failed}" data-tip="לא עברו: ${num(t.failed)}"></span>
            </div>
            <div class="db-split-l"><span><i class="ok"></i>עברו ${num(t.passed)}</span><span><i class="no"></i>לא עברו ${num(t.failed)}</span></div>
            <div class="text-muted" style="margin-top:10px">ממוצע ${t.avg_passed_per_active} מבחנים שעברו לתלמיד פעיל</div>`;
    }

    sources(s) {
        const rows = [['phone', s.phone], ['web', s.web], ['other', s.other]];
        const total = rows.reduce((a, [, v]) => a + v, 0) || 1;
        return rows.map(([k, v]) => this.hbar(`<i class="fas ${SRC[k][1]}"></i> ${SRC[k][0]}`, v, total, `${num(v)} (${Math.round(v / total * 100)}%)`)).join('');
    }

    weekday(w) {
        const max = Math.max(1, ...w);
        return DAYS.map((name, i) => this.hbar(name, w[i], max, num(w[i]))).join('');
    }

    hbar(label, value, max, text) {
        return `<div class="db-hbar" data-tip="${esc(text)}"><span class="db-hbar-l">${label}</span>
            <span class="db-hbar-t"><span style="width:${(value / max) * 100}%"></span></span><span class="db-hbar-v">${text}</span></div>`;
    }

    classes(list) {
        if (!list.length) return '<div class="db-empty">אין תלמידים</div>';
        const maxReward = Math.max(1, ...list.map(c => c.reward));
        return `<div class="db-table-wrap"><table class="db-table">
            <thead><tr><th>כיתה</th><th>תלמידים</th><th>פעילים</th><th>בחינות</th><th>עברו</th><th>אחוז הצלחה</th><th>ממוצע לתלמיד</th><th>תגמולים</th></tr></thead>
            <tbody>${list.map(c => `<tr>
                <td><b>${esc(c.class_grade)}</b></td>
                <td>${num(c.students)}</td>
                <td>${num(c.active_students)}</td>
                <td>${num(c.attempts)}</td>
                <td>${num(c.passed)}</td>
                <td><span class="db-rate"><span class="db-rate-t"><span style="width:${c.pass_rate}%"></span></span>${c.pass_rate}%</span></td>
                <td>${c.avg_passed}</td>
                <td><span class="db-rate"><span class="db-rate-t money"><span style="width:${(c.reward / maxReward) * 100}%"></span></span>${money(c.reward)}</span></td>
            </tr>`).join('')}</tbody></table></div>`;
    }

    list(items, rowFn, emptyText) {
        if (!items || !items.length) return `<div class="db-empty">${emptyText}</div>`;
        return `<div class="db-list">${items.map(rowFn).join('')}</div>`;
    }

    studentRow(s, sub, meta) {
        return `<div class="db-row db-click" data-db-student="${esc(s.student_code)}">
            <span class="db-av">${esc((s.name || '?').charAt(0))}</span>
            <span class="db-main"><b>${esc(s.name)}</b> <span class="text-muted">קוד ${esc(s.student_code)}</span></span>
            <span class="db-sub">${sub}</span>
            <span class="db-meta">${meta}</span>
        </div>`;
    }

    examRow(e, meta) {
        return `<div class="db-row">
            <span class="db-code">${esc(e.exam_code)}</span>
            <span class="db-main">${esc(e.label || '-')}</span>
            <span class="db-rate"><span class="db-rate-t"><span style="width:${e.pass_rate}%"></span></span></span>
            <span class="db-meta">${meta}</span>
        </div>`;
    }

    css() {
        if (document.getElementById('dbStyles')) return;
        const style = document.createElement('style');
        style.id = 'dbStyles';
        style.textContent = `
        #view-dashboard { overflow-y: auto; position: relative; }
        .db-wrap { position: relative; padding-bottom: 20px; --ok: #10b981; --no: #ef4444; }
        .db-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
        .db-head h2 { font-size: 1.2rem; color: #0f172a; display: flex; align-items: center; gap: 8px; }
        .db-head h2 i { color: var(--primary-color); }
        .db-kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; margin-bottom: 12px; }
        .db-kpi { background: var(--card-bg); border: 1px solid var(--border-color); border-radius: 10px; padding: 14px; display: flex; gap: 12px; align-items: flex-start; box-shadow: 0 1px 3px rgba(0,0,0,.03); }
        .db-kpi-ico { flex: none; width: 38px; height: 38px; border-radius: 10px; background: #eff6ff; color: var(--primary-color); display: flex; align-items: center; justify-content: center; font-size: 1rem; }
        .db-kpi-l { font-size: .8rem; color: var(--text-muted); }
        .db-kpi-v { font-size: 1.5rem; font-weight: 800; color: #0f172a; line-height: 1.25; }
        .db-kpi-v small { font-size: .85rem; color: var(--text-muted); font-weight: 600; }
        .db-kpi-s { font-size: .75rem; color: var(--text-muted); margin-top: 2px; }
        .db-card { padding: 14px 16px; }
        .db-card-h { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 12px; flex-wrap: wrap; }
        .db-card-h h3 { margin: 0; }
        .db-grid { display: grid; gap: 12px; }
        .db-grid > .card { margin-bottom: 0; }
        .db-grid { margin-bottom: 12px; }
        .db-grid-2 { grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); }
        .db-grid-3 { grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); }
        .db-legend, .db-split-l { display: flex; gap: 14px; font-size: .8rem; color: var(--text-main); }
        .db-legend i, .db-split-l i { display: inline-block; width: 10px; height: 10px; border-radius: 3px; margin-left: 5px; vertical-align: -1px; }
        .db-wrap i.ok, .db-wrap span.ok { background: var(--ok); }
        .db-wrap i.no, .db-wrap span.no { background: var(--no); }
        .db-chart { position: relative; display: flex; align-items: flex-end; gap: 3px; height: 190px; padding: 8px 0 22px; border-bottom: 1px solid var(--border-color); direction: ltr; }
        .db-ymax { position: absolute; top: 0; right: 0; font-size: .7rem; color: var(--text-muted); }
        .db-col { flex: 1; height: 100%; display: flex; flex-direction: column; justify-content: flex-end; position: relative; cursor: default; min-width: 0; }
        .db-col:hover { background: #f1f5f9; border-radius: 4px; }
        .db-stack { display: flex; flex-direction: column-reverse; gap: 2px; min-height: 0; }
        .db-stack span { display: block; min-height: 2px; }
        .db-stack span:last-child { border-radius: 4px 4px 0 0; }
        .db-x { position: absolute; bottom: -20px; left: 50%; transform: translateX(-50%); font-size: .68rem; color: var(--text-muted); white-space: nowrap; }
        .db-big { font-size: 2rem; font-weight: 800; color: #0f172a; margin-bottom: 8px; }
        .db-big small { font-size: .9rem; color: var(--text-muted); font-weight: 600; }
        .db-split { display: flex; gap: 2px; height: 14px; border-radius: 4px; overflow: hidden; margin-bottom: 8px; }
        .db-hbar { display: grid; grid-template-columns: 90px 1fr auto; align-items: center; gap: 8px; margin-bottom: 8px; font-size: .82rem; }
        .db-hbar-l i { color: var(--text-muted); margin-left: 4px; width: 14px; }
        .db-hbar-t, .db-rate-t { height: 8px; background: #f1f5f9; border-radius: 4px; overflow: hidden; display: block; }
        .db-hbar-t span, .db-rate-t span { display: block; height: 100%; background: var(--primary-color); border-radius: 4px; }
        .db-hbar-v { color: var(--text-muted); font-size: .78rem; min-width: 60px; text-align: left; }
        .db-table-wrap { overflow-x: auto; }
        .db-table { width: 100%; border-collapse: collapse; font-size: .85rem; }
        .db-table th { text-align: right; font-weight: 600; color: var(--text-muted); padding: 6px 8px; border-bottom: 1px solid var(--border-color); white-space: nowrap; }
        .db-table td { padding: 8px; border-bottom: 1px solid #f1f5f9; white-space: nowrap; }
        .db-rate { display: inline-flex; align-items: center; gap: 8px; }
        .db-rate .db-rate-t { width: 80px; }
        .db-rate-t.money span { background: var(--warning); }
        .db-list { display: flex; flex-direction: column; }
        .db-row { display: grid; grid-template-columns: auto minmax(0, 1fr) auto auto; align-items: center; gap: 10px; padding: 8px 6px; border-bottom: 1px solid #f1f5f9; font-size: .85rem; }
        .db-row:last-child { border-bottom: none; }
        .db-click { cursor: pointer; border-radius: 6px; }
        .db-click:hover { background: #f8fafc; }
        .db-main { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .db-sub { color: var(--text-main); font-size: .8rem; white-space: nowrap; }
        .db-meta { color: var(--text-muted); font-size: .78rem; white-space: nowrap; }
        .db-av { width: 28px; height: 28px; border-radius: 50%; background: #eff6ff; color: var(--primary-color); display: flex; align-items: center; justify-content: center; font-weight: 700; }
        .db-code { min-width: 40px; text-align: center; background: #f1f5f9; border-radius: 6px; padding: 2px 6px; font-weight: 700; }
        .db-dot { width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: .7rem; }
        .db-wrap .db-dot.ok { background: #d1fae5; color: #047857; }
        .db-wrap .db-dot.no { background: #fee2e2; color: #b91c1c; }
        .db-pill { background: #f1f5f9; border-radius: 99px; padding: 1px 10px; font-size: .78rem; font-weight: 700; }
        .db-empty { color: var(--text-muted); text-align: center; padding: 18px 0; font-size: .85rem; }
        .db-fail { text-align: center; padding: 40px; color: var(--danger); }
        .db-fail .btn { margin-top: 12px; }
        .db-tip { position: absolute; top: 0; left: 0; pointer-events: none; background: #0f172a; color: #fff; font-size: .78rem; line-height: 1.5; padding: 6px 10px; border-radius: 8px; opacity: 0; transition: opacity .1s; z-index: 5; white-space: nowrap; }
        .db-tip.show { opacity: 1; }
        @media (max-width: 768px) {
            .db-row { grid-template-columns: auto minmax(0, 1fr) auto; }
            .db-row .db-sub { display: none; }
            .db-hbar { grid-template-columns: 70px 1fr auto; }
        }`;
        document.head.appendChild(style);
    }
}
