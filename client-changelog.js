// ============================================================
//  client-changelog.js — "היסטוריית שינויים": מי שינה מבחן / תלמיד, מתי ומה
//  openChangeLog(apiBase, 'exam' | 'student', code?)
// ============================================================
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const TITLE = { exam: 'היסטוריית שינויים במבחנים', student: 'היסטוריית שינויים בתלמידים' };
const fmt = s => { const m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}:\d{2})/.exec(s || ''); return m ? `${m[3]}/${m[2]}/${m[1].slice(2)} ${m[4]}` : esc(s); };

export async function openChangeLog(apiBase, entity, code = '') {
    let m = document.getElementById('chlModal');
    if (!m) {
        document.body.insertAdjacentHTML('beforeend', `<div id="chlModal" class="modal hidden" style="z-index:9990"><div class="modal-content" style="max-width:820px;height:80vh">
            <div class="modal-header"><h3 id="chlTitle"></h3><button class="close-modal-btn" id="chlClose" aria-label="סגור">&times;</button></div>
            <div style="padding:10px 16px;border-bottom:1px solid var(--border-color)"><input id="chlSearch" type="text" placeholder="חיפוש לפי קוד, מי שינה או מה השתנה..." autocomplete="off" style="width:100%;padding:8px 10px;border:1px solid var(--border-color);border-radius:6px"></div>
            <div id="chlBody" style="overflow:auto;flex:1;padding:0 16px 12px"></div></div></div>
            <style>.chl-t{width:100%;border-collapse:collapse;font-size:.88rem}.chl-t th{position:sticky;top:0;background:#f8fafc;text-align:right;padding:8px 6px;border-bottom:1px solid var(--border-color);font-weight:600}
            .chl-t td{padding:7px 6px;border-bottom:1px solid #f1f5f9;vertical-align:top}.chl-t td.d{white-space:nowrap;color:#64748b;direction:ltr;text-align:right}.chl-e{color:#64748b;text-align:center;padding:30px}</style>`);
        m = document.getElementById('chlModal');
        document.getElementById('chlClose').onclick = () => m.classList.add('hidden');
        document.getElementById('chlSearch').oninput = () => render();
    }
    let rows = [];
    const body = document.getElementById('chlBody'), search = document.getElementById('chlSearch');
    const render = () => {
        const q = search.value.trim();
        const list = q ? rows.filter(r => [r.code, r.actor, r.action, r.details].some(v => String(v || '').includes(q))) : rows;
        body.innerHTML = !list.length ? `<div class="chl-e">${rows.length ? 'לא נמצאו שינויים' : 'עדיין לא נרשמו שינויים. הרישום התחיל עכשיו, ומכאן כל שינוי יופיע כאן.'}</div>`
            : `<table class="chl-t"><thead><tr><th>מתי</th><th>מי</th><th>${entity === 'exam' ? 'מבחן' : 'תלמיד'}</th><th>פעולה</th><th>מה השתנה</th></tr></thead><tbody>${list.map(r =>
                `<tr><td class="d">${fmt(r.created_at)}</td><td>${esc(r.actor || '—')}</td><td>${esc(r.code || '—')}</td><td>${esc(r.action)}</td><td>${esc(r.details || '')}</td></tr>`).join('')}</tbody></table>`;
    };
    document.getElementById('chlTitle').textContent = TITLE[entity] + (code ? ` · ${code}` : '');
    search.value = '';
    body.innerHTML = '<div class="chl-e">טוען...</div>';
    m.classList.remove('hidden');
    try {
        const res = await fetch(`${apiBase}/change-log?entity=${entity}${code ? '&code=' + encodeURIComponent(code) : ''}`);
        rows = res.ok ? await res.json() : [];
        if (!res.ok) { body.innerHTML = '<div class="chl-e">שגיאה בטעינה</div>'; return; }
    } catch (e) { body.innerHTML = '<div class="chl-e">שגיאת תקשורת</div>'; return; }
    render();
}
