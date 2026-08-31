const API_BASE = '/peer/api';

let studentsList = [];
let examsList = [];
let pendingWorkspaceExams = [];

let mainStudentSelect = null;
let addExamSelect = null;

document.addEventListener('DOMContentLoaded', () => {
    initApp();
    
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
            e.currentTarget.classList.add('active');
            renderTab(e.currentTarget.dataset.tab);
        });
    });
});

async function initApp() {
    try {
        const [studentsRes, examsRes] = await Promise.all([
            fetch(`${API_BASE}/students`),
            fetch(`${API_BASE}/exams`)
        ]);
        
        studentsList = await studentsRes.json();
        examsList = await examsRes.json();
        
        renderTab('update');
    } catch (error) {
        document.getElementById('app-content').innerHTML = `<div class="card"><p style="color:var(--danger);">שגיאה בטעינת המערכת: ${error.message}</p></div>`;
    }
}

function renderTab(tabName) {
    const container = document.getElementById('app-content');
    if (tabName === 'update') renderUpdateApp(container);
    else if (tabName === 'history') renderHistoryApp(container);
    else if (tabName === 'students') renderStudentsApp(container);
    else if (tabName === 'exams') renderExamsApp(container);
}

// ==========================================
// טאב עדכון מבחנים (CRM Workspace)
// ==========================================
function renderUpdateApp(container) {
    container.innerHTML = `
        <div class="card search-card">
            <h2 style="margin-top:0;"><i class="fas fa-search" style="color:var(--accent); margin-left:10px;"></i> 1. חיפוש ובחירת תלמיד</h2>
            <div style="margin-top: 20px;">
                <select id="crm-student-select"></select>
            </div>
        </div>

        <div id="crm-workspace" style="display:none;">
            <div class="card student-info-card">
                <div class="student-header">
                    <div class="avatar-large"><i class="fas fa-user-graduate"></i></div>
                    <div>
                        <h3 id="ws-student-name" style="margin:0 0 5px 0; font-size:24px; color:var(--primary-bg);"></h3>
                        <p id="ws-student-details" style="margin:0;"></p>
                    </div>
                </div>
            </div>

            <div class="card">
                <h2 style="margin-top:0;"><i class="fas fa-plus-circle" style="color:var(--accent); margin-left:10px;"></i> 2. הוספת מבחנים לעדכון</h2>
                <div style="display:flex; gap: 15px; margin-top: 20px; align-items:center;">
                    <div style="flex:1;">
                        <select id="crm-exam-select"></select>
                    </div>
                    <button class="btn btn-primary" onclick="addExamToWorkspace()">
                        <i class="fas fa-plus"></i> הוסף לרשימה
                    </button>
                </div>

                <div id="workspace-exams-list" style="margin-top: 30px;">
                    <!-- מבחנים שנבחרו יופיעו כאן -->
                </div>

                <div style="margin-top: 30px; text-align: left; border-top: 1px solid var(--border-color); padding-top: 20px;">
                    <button class="btn btn-success btn-large" id="btn-save-updates" onclick="saveWorkspaceUpdates()" disabled>
                        <i class="fas fa-save"></i> שמור את כל העדכונים לתלמיד זה
                    </button>
                </div>
            </div>
        </div>
    `;

    // אתחול חיפוש תלמידים
    mainStudentSelect = new TomSelect('#crm-student-select', {
        options: studentsList.map(s => ({ value: s.student_code, text: `${s.first_name} ${s.last_name} (כיתה ${s.class_grade}) - קוד: ${s.student_code}` })),
        create: false,
        placeholder: "הקלד שם תלמיד, כיתה או קוד לחיפוש מהיר...",
        sortField: { field: "text", direction: "asc" },
        render: {
            no_results: function(data, escape) {
                return '<div class="ts-no-results"><i class="fas fa-search" style="margin-left:8px;"></i> לא נמצאו תלמידים התואמים לחיפוש</div>';
            }
        },
        onChange: function(value) { openWorkspace(value); }
    });

    // אתחול חיפוש מבחנים
    addExamSelect = new TomSelect('#crm-exam-select', {
        options: examsList.map(e => ({ value: e.exam_code, text: `${e.masechet} | פרק ${e.chapter_name || ''} [קוד: ${e.exam_code}]` })),
        create: false,
        maxOptions: 50,
        placeholder: "חפש מבחן לפי שם מסכת, פרק או קוד...",
        render: {
            no_results: function(data, escape) {
                return '<div class="ts-no-results"><i class="fas fa-search" style="margin-left:8px;"></i> לא נמצאו מבחנים התואמים לחיפוש</div>';
            }
        }
    });
}

function openWorkspace(studentCode) {
    const workspace = document.getElementById('crm-workspace');
    if (!studentCode) {
        workspace.style.display = 'none';
        return;
    }

    const student = studentsList.find(s => s.student_code === studentCode);
    document.getElementById('ws-student-name').innerText = `${student.first_name} ${student.last_name}`;
    document.getElementById('ws-student-details').innerHTML = `
        <span class="badge badge-blue">כיתה ${student.class_grade}</span>
        <span style="margin-right:10px; color:var(--text-muted); font-weight:500;"><i class="fas fa-id-card"></i> קוד: ${student.student_code}</span>
    `;
    
    pendingWorkspaceExams = [];
    renderWorkspaceExams();
    
    workspace.style.display = 'block';
    workspace.animate([
        {opacity: 0, transform: 'translateY(15px)'}, 
        {opacity: 1, transform: 'translateY(0)'}
    ], {duration: 300, fill: 'forwards'});
}

function addExamToWorkspace() {
    const examCode = addExamSelect.getValue();
    if (!examCode) return;
    
    if (pendingWorkspaceExams.some(e => e.exam_code === examCode)) {
        alert('מבחן זה כבר נוסף לרשימת העדכונים הנוכחית.');
        return;
    }

    const exam = examsList.find(e => e.exam_code === examCode);
    pendingWorkspaceExams.push({ ...exam, passed: true });
    
    renderWorkspaceExams();
    addExamSelect.clear();
}

function removeExamFromWorkspace(examCode) {
    pendingWorkspaceExams = pendingWorkspaceExams.filter(e => e.exam_code !== examCode);
    renderWorkspaceExams();
}

function updatePendingStatus(examCode, isChecked) {
    const exam = pendingWorkspaceExams.find(e => e.exam_code === examCode);
    if (exam) exam.passed = isChecked;
}

function renderWorkspaceExams() {
    const list = document.getElementById('workspace-exams-list');
    const saveBtn = document.getElementById('btn-save-updates');
    
    if (pendingWorkspaceExams.length === 0) {
        list.innerHTML = '<div style="text-align:center; padding:40px; color:var(--text-muted); background:#f8fafc; border-radius:12px; border:2px dashed #cbd5e1; font-size:16px;">טרם נבחרו מבחנים לעדכון עבור תלמיד זה.</div>';
        saveBtn.disabled = true;
        return;
    }
    
    saveBtn.disabled = false;
    let html = '';
    
    pendingWorkspaceExams.forEach(exam => {
        html += `
            <div class="workspace-exam-item">
                <div>
                    <div style="font-size: 18px; font-weight: 600; color: var(--primary-bg); margin-bottom: 8px;">
                        ${exam.masechet} <span style="color:var(--text-muted); font-weight:400;">| פרק ${exam.chapter_name || ''}</span>
                    </div>
                    <div style="font-size: 14px; color: var(--text-muted); display:flex; gap:20px;">
                        <span><i class="fas fa-hashtag"></i> קוד: <span style="font-weight:600;">${exam.exam_code}</span></span>
                        <span><i class="fas fa-file-alt"></i> דפים: ${exam.from_page || '-'} עד ${exam.to_page || '-'}</span>
                        <span><i class="fas fa-book"></i> משניות: ${exam.total_mishnayot || '-'}</span>
                    </div>
                </div>
                <div style="display: flex; align-items: center; gap: 30px;">
                    <div class="switch-wrapper">
                        <span class="switch-label">האם עבר?</span>
                        <label class="switch">
                            <input type="checkbox" id="toggle-${exam.exam_code}" ${exam.passed ? 'checked' : ''} onchange="updatePendingStatus('${exam.exam_code}', this.checked)">
                            <span class="slider"></span>
                        </label>
                    </div>
                    <button class="btn btn-outline" style="color:var(--danger); border-color:var(--danger); padding:10px 15px;" onclick="removeExamFromWorkspace('${exam.exam_code}')" title="הסר שורה">
                        <i class="fas fa-trash-alt"></i>
                    </button>
                </div>
            </div>
        `;
    });
    
    list.innerHTML = html;
}

async function saveWorkspaceUpdates() {
    const studentCode = mainStudentSelect.getValue();
    const saveBtn = document.getElementById('btn-save-updates');
    
    if (!studentCode || pendingWorkspaceExams.length === 0) return;
    
    saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> שומר נתונים...';
    saveBtn.disabled = true;
    
    try {
        const promises = pendingWorkspaceExams.map(exam => {
            return fetch(`${API_BASE}/student-exams`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ student_code: studentCode, exam_code: exam.exam_code, passed: exam.passed })
            });
        });
        
        await Promise.all(promises);
        alert('כל הציונים עודכנו בהצלחה במערכת!');
        
        pendingWorkspaceExams = [];
        renderWorkspaceExams();
        mainStudentSelect.clear();
        document.getElementById('crm-workspace').style.display = 'none';
        
    } catch (error) {
        alert('אירעה שגיאה בשמירת הנתונים. אנא נסה שוב.');
    } finally {
        saveBtn.innerHTML = '<i class="fas fa-save"></i> שמור את כל העדכונים לתלמיד זה';
        saveBtn.disabled = pendingWorkspaceExams.length === 0;
    }
}

// ==========================================
// טאב היסטוריית עדכונים
// ==========================================
function renderHistoryApp(container) {
    container.innerHTML = `
        <div class="card">
            <div class="card-header">
                <h2><i class="fas fa-history" style="color:var(--accent);"></i> היסטוריית עדכונים כללית במערכת</h2>
                <button class="btn btn-outline" onclick="loadHistory()"><i class="fas fa-sync-alt"></i> רענן</button>
            </div>
            <div class="table-responsive" id="history-table-container">
                <div class="loader"><i class="fas fa-spinner fa-spin"></i> טוען היסטוריה...</div>
            </div>
        </div>
    `;
    loadHistory();
}

async function loadHistory() {
    try {
        const res = await fetch(`${API_BASE}/student-exams`);
        const grades = await res.json();
        
        let html = `<table>
            <thead><tr>
                <th>תלמיד</th><th>מבחן</th><th>סטטוס</th><th>תאריך עדכון</th><th>פעולות</th>
            </tr></thead>
            <tbody>`;
            
        grades.slice(0, 100).forEach(g => { 
            const sDetails = studentsList.find(s => s.student_code === g.student_code);
            const sName = sDetails ? `${sDetails.first_name} ${sDetails.last_name}` : g.student_code;
            
            const eDetails = examsList.find(e => e.exam_code === g.exam_code);
            const eName = eDetails ? `${eDetails.masechet} | פרק ${eDetails.chapter_name}` : g.exam_code;
            
            const status = g.passed ? 
                '<span class="badge badge-success"><i class="fas fa-check"></i> עבר</span>' : 
                '<span class="badge badge-danger"><i class="fas fa-times"></i> לא עבר</span>';
                
            html += `
                <tr>
                    <td style="font-weight:500;">${sName}</td>
                    <td>${eName} <span class="badge badge-blue" style="margin-right:8px; font-size:11px;">${g.exam_code}</span></td>
                    <td>${status}</td>
                    <td dir="ltr" style="text-align:right; font-size:14px; color:#64748b;">${g.updated_at}</td>
                    <td><button class="btn btn-outline" style="color:var(--danger); padding:8px 12px; border:none;" onclick="deleteGrade('${g.student_code}', '${g.exam_code}')" title="מחק רישום"><i class="fas fa-trash"></i></button></td>
                </tr>
            `;
        });
        
        html += `</tbody></table>`;
        document.getElementById('history-table-container').innerHTML = html;
    } catch (e) {
        document.getElementById('history-table-container').innerHTML = '<p style="color:red;">שגיאה בטעינת היסטוריה.</p>';
    }
}

async function deleteGrade(studentCode, examCode) {
    if (!confirm(`למחוק לצמיתות את התוצאה למבחן ${examCode}?`)) return;
    await fetch(`${API_BASE}/student-exams/${encodeURIComponent(studentCode)}/${encodeURIComponent(examCode)}`, { method: 'DELETE' });
    loadHistory();
}

// ==========================================
// טאבים: ניהול מבחנים ותלמידים (עם פירוט מלא)
// ==========================================
function renderStudentsApp(container) {
    let html = `<div class="card">
        <div class="card-header">
            <h2><i class="fas fa-users" style="color:var(--accent);"></i> רשימת תלמידים רשומים</h2>
        </div>
        <div class="table-responsive">
        <table>
        <thead><tr><th>קוד</th><th>שם מלא</th><th>כיתה</th><th>טלפונים</th></tr></thead><tbody>`;
        
    studentsList.forEach(s => {
        const phones = (s.phones || []).join(', ');
        html += `<tr>
            <td><span class="badge badge-blue">${s.student_code}</span></td>
            <td style="font-weight:500;">${s.first_name} ${s.last_name}</td>
            <td>${s.class_grade}</td>
            <td dir="ltr" style="text-align:right">${phones}</td>
        </tr>`;
    });
    html += `</tbody></table></div></div>`;
    container.innerHTML = html;
}

function renderExamsApp(container) {
    let html = `<div class="card">
        <div class="card-header">
            <h2><i class="fas fa-file-alt" style="color:var(--accent);"></i> רשימת מבחנים מפורטת</h2>
        </div>
        <div class="table-responsive">
        <table>
        <thead>
            <tr>
                <th>קוד מבחן</th>
                <th>מסכת ופרק</th>
                <th>מעמוד</th>
                <th>עד עמוד</th>
                <th>דפי גמרא</th>
                <th>סה"כ משניות</th>
                <th>ציון יעד</th>
            </tr>
        </thead>
        <tbody>`;
        
    examsList.forEach(e => {
        html += `<tr>
            <td><span class="badge badge-blue">${e.exam_code}</span></td>
            <td><strong>${e.masechet || '-'}</strong> ${e.chapter_name ? '| פרק ' + e.chapter_name : ''}</td>
            <td>${e.from_page || '-'}</td>
            <td>${e.to_page || '-'}</td>
            <td>${e.gemara_pages || '-'}</td>
            <td>${e.total_mishnayot || '-'}</td>
            <td>${e.target_grade || '-'}</td>
        </tr>`;
    });
    html += `</tbody></table></div></div>`;
    container.innerHTML = html;
}
