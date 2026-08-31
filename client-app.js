const API_BASE = '/peer/api';

let studentsList = [];
let examsList = [];
let pendingWorkspaceExams = [];
let selectedStudentCode = null;

let modalStudentSelectControl = null;
let modalExamSelectControl = null;

document.addEventListener('DOMContentLoaded', () => {
    initApp();
    injectModalsHTML();
    
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
        document.getElementById('app-content').innerHTML = `<p style="color:var(--danger);">שגיאה בטעינת נתונים: ${error.message}</p>`;
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
// מודלים (חלונות קופצים) לבחירה
// ==========================================
function injectModalsHTML() {
    const html = `
        <!-- חלון בחירת תלמיד -->
        <div id="student-modal" class="modal-overlay">
            <div class="modal-content modal-sm">
                <div class="modal-header">
                    <h3><i class="fas fa-search"></i> בחירת תלמיד</h3>
                    <button class="btn-icon" onclick="closeModal('student-modal')"><i class="fas fa-times"></i></button>
                </div>
                <div class="modal-body">
                    <select id="modal-select-student-input"></select>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-outline" onclick="closeModal('student-modal')">ביטול</button>
                    <button class="btn btn-primary" onclick="confirmStudentSelection()">בחר תלמיד</button>
                </div>
            </div>
        </div>

        <!-- חלון בחירת מבחנים מרובה -->
        <div id="exam-modal" class="modal-overlay">
            <div class="modal-content modal-md">
                <div class="modal-header">
                    <h3><i class="fas fa-plus-circle"></i> הוספת מבחנים</h3>
                    <button class="btn-icon" onclick="closeModal('exam-modal')"><i class="fas fa-times"></i></button>
                </div>
                <div class="modal-body">
                    <label style="display:block; margin-bottom:8px; font-size:14px;">ניתן לחפש ולבחור מספר מבחנים יחד:</label>
                    <select id="modal-select-exam-input" multiple></select>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-outline" onclick="closeModal('exam-modal')">ביטול</button>
                    <button class="btn btn-primary" onclick="confirmExamSelection()">הוסף נבחרים לרשימה</button>
                </div>
            </div>
        </div>
    `;
    document.getElementById('modals-container').innerHTML = html;
}

function openModal(id) { document.getElementById(id).classList.add('active'); }
function closeModal(id) { document.getElementById(id).classList.remove('active'); }

function openStudentModal() {
    if (modalStudentSelectControl) modalStudentSelectControl.destroy();
    
    modalStudentSelectControl = new TomSelect('#modal-select-student-input', {
        options: studentsList.map(s => ({ value: s.student_code, text: `${s.first_name} ${s.last_name} (כיתה ${s.class_grade}) - ${s.student_code}` })),
        create: false,
        placeholder: "הקלד לחיפוש תלמיד...",
        render: { no_results: () => '<div class="ts-no-results">לא נמצאו תלמידים</div>' }
    });
    
    openModal('student-modal');
}

function confirmStudentSelection() {
    const code = modalStudentSelectControl.getValue();
    if (!code) return;
    
    selectedStudentCode = code;
    pendingWorkspaceExams = [];
    closeModal('student-modal');
    renderUpdateApp(document.getElementById('app-content')); // רענון המסך הראשי
}

function openExamModal() {
    if (modalExamSelectControl) modalExamSelectControl.destroy();
    
    modalExamSelectControl = new TomSelect('#modal-select-exam-input', {
        options: examsList.map(e => ({ value: e.exam_code, text: `${e.masechet} | ${e.chapter_name || ''} [קוד: ${e.exam_code}]` })),
        plugins: ['remove_button'],
        create: false,
        placeholder: "בחר מבחנים...",
        render: { no_results: () => '<div class="ts-no-results">לא נמצאו מבחנים</div>' }
    });
    
    openModal('exam-modal');
}

function confirmExamSelection() {
    const selectedCodes = modalExamSelectControl.getValue(); // מחזיר מערך של בחירות
    if (!selectedCodes || selectedCodes.length === 0) {
        closeModal('exam-modal');
        return;
    }
    
    selectedCodes.forEach(code => {
        if (!pendingWorkspaceExams.some(e => e.exam_code === code)) {
            const exam = examsList.find(e => e.exam_code === code);
            pendingWorkspaceExams.push({ ...exam, passed: true });
        }
    });
    
    closeModal('exam-modal');
    renderWorkspaceList();
}

// ==========================================
// המסך הראשי המהודק (עדכון ציונים)
// ==========================================
function renderUpdateApp(container) {
    if (!selectedStudentCode) {
        container.innerHTML = `
            <div class="card" style="text-align:center; padding: 60px 20px;">
                <i class="fas fa-user-graduate" style="font-size:48px; color:#cbd5e1; margin-bottom:20px;"></i>
                <h2 style="margin:0 0 10px 0; color:var(--primary-bg);">לא נבחר תלמיד לעדכון</h2>
                <p style="color:var(--text-muted); margin-bottom:25px;">אנא בחר תלמיד כדי להתחיל להזין נתוני מבחנים.</p>
                <button class="btn btn-primary" style="padding:12px 25px; font-size:16px;" onclick="openStudentModal()">
                    <i class="fas fa-search"></i> חפש ובחר תלמיד
                </button>
            </div>
        `;
        return;
    }

    const student = studentsList.find(s => s.student_code === selectedStudentCode);
    
    container.innerHTML = `
        <div class="student-banner">
            <div class="student-banner-info">
                <i class="fas fa-user-circle" style="font-size:24px;"></i>
                <span>תלמיד: <strong>${student.first_name} ${student.last_name}</strong> (כיתה ${student.class_grade}) | קוד: ${student.student_code}</span>
            </div>
            <button class="btn btn-outline" style="background:#fff; border-color:#bae6fd; color:#0369a1;" onclick="openStudentModal()">
                <i class="fas fa-exchange-alt"></i> החלף תלמיד
            </button>
        </div>

        <div class="card" style="padding: 15px 20px;">
            <div class="card-header" style="margin-bottom:10px;">
                <h2 style="font-size:16px;"><i class="fas fa-list-check" style="color:var(--accent);"></i> רשימת מבחנים לעדכון</h2>
                <button class="btn btn-primary" onclick="openExamModal()">
                    <i class="fas fa-plus"></i> הוסף מבחנים
                </button>
            </div>
            
            <div id="workspace-exams-list" style="margin-top: 15px; min-height: 100px;"></div>
            
            <div style="border-top:1px solid var(--border-color); padding-top:15px; margin-top:10px; display:flex; justify-content:flex-end;">
                <button class="btn btn-success" id="btn-save-updates" onclick="saveUpdates()" disabled>
                    <i class="fas fa-save"></i> שמור עדכונים
                </button>
            </div>
        </div>
    `;
    
    renderWorkspaceList();
}

function removeExam(code) {
    pendingWorkspaceExams = pendingWorkspaceExams.filter(e => e.exam_code !== code);
    renderWorkspaceList();
}

function updateStatus(code, isChecked) {
    const exam = pendingWorkspaceExams.find(e => e.exam_code === code);
    if (exam) exam.passed = isChecked;
}

function renderWorkspaceList() {
    const list = document.getElementById('workspace-exams-list');
    const saveBtn = document.getElementById('btn-save-updates');
    
    if (pendingWorkspaceExams.length === 0) {
        list.innerHTML = '<div style="text-align:center; padding:30px; color:var(--text-muted); font-size:14px; background:#f8fafc; border-radius:8px;">לא נבחרו מבחנים. לחץ על "הוסף מבחנים" כדי להתחיל.</div>';
        if(saveBtn) saveBtn.disabled = true;
        return;
    }
    
    if(saveBtn) saveBtn.disabled = false;
    let html = '';
    
    pendingWorkspaceExams.forEach(exam => {
        html += `
            <div class="compact-exam-item">
                <div class="exam-details-compact">
                    <div>
                        <strong style="color:var(--primary-bg); font-size:15px;">${exam.masechet || ''} ${exam.chapter_name ? '| פרק '+exam.chapter_name : ''}</strong>
                        <span class="badge badge-blue" style="margin-right:10px;">קוד: ${exam.exam_code}</span>
                    </div>
                    <div class="exam-meta">
                        ${(exam.from_page && exam.to_page) ? `<span><i class="fas fa-file-alt"></i> דפים: ${exam.from_page}-${exam.to_page}</span>` : ''}
                        ${exam.gemara_pages ? `<span><i class="fas fa-scroll"></i> דפי גמרא: ${exam.gemara_pages}</span>` : ''}
                        ${exam.total_mishnayot ? `<span><i class="fas fa-book"></i> משניות: ${exam.total_mishnayot}</span>` : ''}
                        ${exam.target_grade ? `<span><i class="fas fa-bullseye"></i> יעד: ${exam.target_grade}</span>` : ''}
                    </div>
                </div>
                <div style="display:flex; align-items:center; gap:20px;">
                    <div style="display:flex; align-items:center; gap:8px;">
                        <span style="font-size:13px; font-weight:500; color:var(--text-muted);">עבר?</span>
                        <label class="switch">
                            <input type="checkbox" ${exam.passed ? 'checked' : ''} onchange="updateStatus('${exam.exam_code}', this.checked)">
                            <span class="slider"></span>
                        </label>
                    </div>
                    <button class="btn-icon text-danger" onclick="removeExam('${exam.exam_code}')" title="הסר מהרשימה"><i class="fas fa-trash-alt"></i></button>
                </div>
            </div>
        `;
    });
    list.innerHTML = html;
}

async function saveUpdates() {
    if (!selectedStudentCode || pendingWorkspaceExams.length === 0) return;
    const saveBtn = document.getElementById('btn-save-updates');
    
    saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> שומר...';
    saveBtn.disabled = true;
    
    try {
        const promises = pendingWorkspaceExams.map(exam => {
            return fetch(`${API_BASE}/student-exams`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ student_code: selectedStudentCode, exam_code: exam.exam_code, passed: exam.passed })
            });
        });
        
        await Promise.all(promises);
        alert('הציונים עודכנו בהצלחה!');
        
        pendingWorkspaceExams = [];
        renderWorkspaceList();
        
    } catch (error) {
        alert('אירעה שגיאה בשמירת הנתונים.');
    } finally {
        saveBtn.innerHTML = '<i class="fas fa-save"></i> שמור עדכונים';
        saveBtn.disabled = pendingWorkspaceExams.length === 0;
    }
}

// ==========================================
// טאבים נוכחיים (היסטוריה, תלמידים, מבחנים) - עברו התאמה לעיצוב המהודק
// ==========================================
function renderHistoryApp(container) {
    container.innerHTML = `
        <div class="card" style="padding:15px 20px;">
            <div class="card-header">
                <h2><i class="fas fa-history" style="color:var(--accent);"></i> היסטוריית עדכונים אחרונים</h2>
            </div>
            <div id="history-table-container"><div style="padding:30px; text-align:center;"><i class="fas fa-spinner fa-spin"></i> טוען...</div></div>
        </div>
    `;
    loadHistory();
}

async function loadHistory() {
    try {
        const res = await fetch(`${API_BASE}/student-exams`);
        const grades = await res.json();
        
        let html = `<table>
            <thead><tr><th>תלמיד</th><th>מבחן</th><th>סטטוס</th><th>תאריך</th><th></th></tr></thead><tbody>`;
            
        grades.slice(0, 100).forEach(g => { 
            const sDetails = studentsList.find(s => s.student_code === g.student_code);
            const eDetails = examsList.find(e => e.exam_code === g.exam_code);
            
            html += `
                <tr>
                    <td style="font-weight:500;">${sDetails ? sDetails.first_name + ' ' + sDetails.last_name : g.student_code}</td>
                    <td>${eDetails ? eDetails.masechet : ''} <span class="badge badge-blue">${g.exam_code}</span></td>
                    <td>${g.passed ? '<span class="badge badge-success">עבר</span>' : '<span class="badge badge-danger">לא עבר</span>'}</td>
                    <td dir="ltr" style="font-size:13px; color:#64748b;">${g.updated_at}</td>
                    <td><button class="btn-icon text-danger" onclick="deleteGrade('${g.student_code}', '${g.exam_code}')"><i class="fas fa-trash"></i></button></td>
                </tr>
            `;
        });
        html += `</tbody></table>`;
        document.getElementById('history-table-container').innerHTML = html;
    } catch (e) {
        document.getElementById('history-table-container').innerHTML = '<p>שגיאה בטעינת היסטוריה.</p>';
    }
}

async function deleteGrade(student, exam) {
    if (!confirm('למחוק רישום זה?')) return;
    await fetch(`${API_BASE}/student-exams/${encodeURIComponent(student)}/${encodeURIComponent(exam)}`, { method: 'DELETE' });
    loadHistory();
}

function renderStudentsApp(container) {
    let html = `<div class="card" style="padding:15px 20px;"><div class="card-header"><h2>רשימת תלמידים</h2></div><table>
        <thead><tr><th>קוד</th><th>שם מלא</th><th>כיתה</th><th>טלפונים</th></tr></thead><tbody>`;
    studentsList.forEach(s => {
        html += `<tr><td><span class="badge badge-blue">${s.student_code}</span></td>
        <td style="font-weight:500;">${s.first_name} ${s.last_name}</td><td>${s.class_grade}</td><td dir="ltr">${(s.phones||[]).join(', ')}</td></tr>`;
    });
    html += `</tbody></table></div>`;
    container.innerHTML = html;
}

function renderExamsApp(container) {
    let html = `<div class="card" style="padding:15px 20px;"><div class="card-header"><h2>רשימת מבחנים מפורטת</h2></div><table>
        <thead><tr><th>קוד</th><th>מסכת ופרק</th><th>דפים</th><th>דפי גמרא</th><th>משניות</th><th>יעד</th></tr></thead><tbody>`;
    examsList.forEach(e => {
        html += `<tr><td><span class="badge badge-blue">${e.exam_code}</span></td>
        <td><strong>${e.masechet||'-'}</strong> ${e.chapter_name ? 'פרק '+e.chapter_name : ''}</td>
        <td>${e.from_page||'-'} עד ${e.to_page||'-'}</td><td>${e.gemara_pages||'-'}</td>
        <td>${e.total_mishnayot||'-'}</td><td>${e.target_grade||'-'}</td></tr>`;
    });
    html += `</tbody></table></div>`;
    container.innerHTML = html;
}
