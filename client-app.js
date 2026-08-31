const API_BASE = '/peer/api';

let studentsList = [];
let examsList = [];
let pendingNewGrades = []; // שומר את המבחנים החדשים שמתווספים במודל

// בקרים של Tom Select
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
    
    injectModalHTML();
});

async function initApp() {
    try {
        const [studentsRes, examsRes] = await Promise.all([
            fetch(`${API_BASE}/students`),
            fetch(`${API_BASE}/exams`)
        ]);
        
        studentsList = await studentsRes.json();
        examsList = await examsRes.json();
        
        renderTab('grades');
    } catch (error) {
        document.getElementById('app-content').innerHTML = `<div class="card"><p style="color:red;">שגיאה בטעינת המערכת: ${error.message}</p></div>`;
    }
}

function renderTab(tabName) {
    const container = document.getElementById('app-content');
    if (tabName === 'grades') renderGradesApp(container);
    else if (tabName === 'students') renderStudentsApp(container);
    else if (tabName === 'exams') renderExamsApp(container);
}

// ==========================================
// לשונית ציונים מתקדמת
// ==========================================
function renderGradesApp(container) {
    container.innerHTML = `
        <div class="card-header" style="background: transparent; border: none; padding: 0 0 20px 0;">
            <div>
                <h2 style="font-size: 24px; margin:0; color: var(--primary-bg);">מערכת מעקב ציונים</h2>
                <p style="color: var(--text-muted); margin: 5px 0 0 0;">ניהול ומעקב אחר התקדמות התלמידים</p>
            </div>
            <button class="btn btn-primary" onclick="openGradesModal()" style="font-size: 16px; padding: 12px 30px;">
                <i class="fas fa-plus-circle"></i> עדכון מבחנים לתלמיד
            </button>
        </div>

        <div class="card">
            <div class="card-header">
                <h2><i class="fas fa-history" style="color:var(--accent); margin-left:8px;"></i> פעילות אחרונה</h2>
            </div>
            <div id="grades-table-container"><div class="loader"><i class="fas fa-spinner fa-spin"></i> טוען...</div></div>
        </div>
    `;
    loadRecentGrades();
}

async function loadRecentGrades() {
    try {
        const res = await fetch(`${API_BASE}/student-exams`);
        const grades = await res.json();
        
        let html = `<table>
            <thead><tr>
                <th>תלמיד</th><th>מבחן</th><th>סטטוס</th><th>תאריך עדכון</th><th>פעולות</th>
            </tr></thead>
            <tbody>`;
            
        grades.slice(0, 50).forEach(g => { // מציג רק 50 אחרונים כדי למנוע עומס תצוגה
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
                    <td><button class="btn btn-danger" onclick="deleteGrade('${g.student_code}', '${g.exam_code}')" title="מחק רישום"><i class="fas fa-trash"></i></button></td>
                </tr>
            `;
        });
        
        html += `</tbody></table>`;
        document.getElementById('grades-table-container').innerHTML = html;
    } catch (e) {
        document.getElementById('grades-table-container').innerHTML = 'שגיאה בטעינת היסטוריה.';
    }
}

async function deleteGrade(studentCode, examCode) {
    if (!confirm(`האם אתה בטוח שברצונך למחוק את התוצאה למבחן ${examCode}?`)) return;
    await fetch(`${API_BASE}/student-exams/${encodeURIComponent(studentCode)}/${encodeURIComponent(examCode)}`, { method: 'DELETE' });
    loadRecentGrades();
}

// ==========================================
// לוגיקת המודל (Modal) לעדכון ציונים מרובים
// ==========================================
function injectModalHTML() {
    const studentsOptions = `<option value="">-- חפש ובחר תלמיד להזנת נתונים --</option>` + 
        studentsList.map(s => `<option value="${s.student_code}">${s.first_name} ${s.last_name} (כיתה ${s.class_grade})</option>`).join('');
    
    const examsOptions = `<option value="">-- חפש ובחר מבחן להוספה --</option>` + 
        examsList.map(e => `<option value="${e.exam_code}">${e.masechet} | פרק ${e.chapter_name || ''} [${e.exam_code}]</option>`).join('');

    const modalHTML = `
        <div id="grades-modal" class="modal-overlay">
            <div class="modal-content">
                <div class="modal-header">
                    <h2><i class="fas fa-user-edit" style="color:var(--accent); margin-left:10px;"></i> עדכון מבחנים לתלמיד</h2>
                    <button class="close-modal" onclick="closeGradesModal()"><i class="fas fa-times"></i></button>
                </div>
                
                <div class="modal-body">
                    <div class="student-selection">
                        <label>1. בחר תלמיד</label>
                        <select id="modal-student-select">${studentsOptions}</select>
                    </div>

                    <div id="student-details-panel" class="student-details-panel">
                        <div class="student-header-info">
                            <div class="student-icon"><i class="fas fa-user-graduate"></i></div>
                            <div class="student-text">
                                <h3 id="panel-student-name">-</h3>
                                <p id="panel-student-class">-</p>
                            </div>
                        </div>

                        <div style="margin-bottom: 25px;">
                            <label style="display:block; margin-bottom:8px; font-weight:500;">היסטוריית מבחנים שעודכנו:</label>
                            <div id="past-exams-tags" style="display:flex; flex-wrap:wrap; gap:8px;"></div>
                        </div>

                        <hr style="border:0; border-top:1px solid var(--border-color); margin: 25px 0;">

                        <div class="add-exam-section">
                            <label style="display:block; margin-bottom:10px; font-weight:500;">2. הוסף מבחנים לעדכון</label>
                            <div style="display:flex; gap:10px;">
                                <div style="flex:1;">
                                    <select id="modal-exam-select">${examsOptions}</select>
                                </div>
                                <button class="btn btn-primary" onclick="addExamToPendingList()">
                                    <i class="fas fa-plus"></i> הוסף לרשימה
                                </button>
                            </div>
                            
                            <div id="pending-exams-container" class="pending-exams-container">
                                <!-- מבחנים שיתווספו יופיעו כאן -->
                            </div>
                        </div>
                    </div>
                </div>

                <div class="modal-footer">
                    <button class="btn btn-outline" onclick="closeGradesModal()">ביטול</button>
                    <button class="btn btn-success" id="save-all-btn" onclick="saveAllPendingGrades()" disabled>
                        <i class="fas fa-save"></i> שמור את כל העדכונים
                    </button>
                </div>
            </div>
        </div>
    `;
    document.getElementById('modal-root').innerHTML = modalHTML;
}

function openGradesModal() {
    pendingNewGrades = [];
    document.getElementById('pending-exams-container').innerHTML = '';
    document.getElementById('student-details-panel').classList.remove('active');
    document.getElementById('save-all-btn').disabled = true;

    // אתחול Tom Select לתלמיד
    if (mainStudentSelect) mainStudentSelect.destroy();
    mainStudentSelect = new TomSelect('#modal-student-select', {
        create: false, sortField: { field: "text", direction: "asc" },
        onChange: function(value) { onModalStudentSelected(value); }
    });
    mainStudentSelect.clear();

    // אתחול Tom Select למבחן
    if (addExamSelect) addExamSelect.destroy();
    addExamSelect = new TomSelect('#modal-exam-select', {
        create: false, maxOptions: null
    });
    addExamSelect.clear();

    document.getElementById('grades-modal').classList.add('active');
}

function closeGradesModal() {
    document.getElementById('grades-modal').classList.remove('active');
}

async function onModalStudentSelected(studentCode) {
    const panel = document.getElementById('student-details-panel');
    const tagsContainer = document.getElementById('past-exams-tags');
    
    if (!studentCode) {
        panel.classList.remove('active');
        return;
    }

    const student = studentsList.find(s => s.student_code === studentCode);
    document.getElementById('panel-student-name').innerText = `${student.first_name} ${student.last_name}`;
    document.getElementById('panel-student-class').innerText = `כיתה: ${student.class_grade} | קוד: ${student.student_code}`;
    
    // משיכת היסטוריה קיימת
    tagsContainer.innerHTML = '<i class="fas fa-spinner fa-spin" style="color:var(--text-muted);"></i>';
    panel.classList.add('active');
    
    try {
        const res = await fetch(`${API_BASE}/student-exams/${studentCode}`);
        const pastExams = await res.json();
        
        if (pastExams.length === 0) {
            tagsContainer.innerHTML = '<span style="color:var(--text-muted); font-size:14px;">אין מבחנים מעודכנים לתלמיד זה.</span>';
        } else {
            tagsContainer.innerHTML = pastExams.map(g => {
                const eDetails = examsList.find(e => e.exam_code === g.exam_code);
                const eName = eDetails ? eDetails.masechet : g.exam_code;
                const bClass = g.passed ? 'badge-success' : 'badge-danger';
                const icon = g.passed ? 'fa-check' : 'fa-times';
                return `<span class="badge ${bClass}"><i class="fas ${icon}"></i> ${eName} (${g.exam_code})</span>`;
            }).join('');
        }
    } catch (e) {
        tagsContainer.innerHTML = '<span style="color:var(--danger);">שגיאה בטעינת היסטוריה</span>';
    }
}

function addExamToPendingList() {
    const examCode = document.getElementById('modal-exam-select').value;
    if (!examCode) return;
    
    // מניעת כפילויות ברשימת ההמתנה
    if (pendingNewGrades.some(e => e.code === examCode)) {
        alert('המבחן כבר מופיע ברשימת העדכונים למטה.');
        return;
    }

    const exam = examsList.find(e => e.exam_code === examCode);
    pendingNewGrades.push({ code: examCode, name: `${exam.masechet} | ${exam.chapter_name}` });
    
    renderPendingList();
    addExamSelect.clear(); // איפוס השדה להזנה הבאה
}

function removePendingExam(code) {
    pendingNewGrades = pendingNewGrades.filter(e => e.code !== code);
    renderPendingList();
}

function renderPendingList() {
    const container = document.getElementById('pending-exams-container');
    const saveBtn = document.getElementById('save-all-btn');
    
    if (pendingNewGrades.length === 0) {
        container.innerHTML = '';
        saveBtn.disabled = true;
        return;
    }
    
    saveBtn.disabled = false;
    let html = '';
    
    pendingNewGrades.forEach(exam => {
        html += `
            <div class="pending-exam-item">
                <div class="exam-info-title">
                    <span class="badge badge-blue" style="margin-left:10px;">${exam.code}</span>
                    ${exam.name}
                </div>
                <div class="exam-actions">
                    <div class="switch-wrapper">
                        <span class="switch-label">עבר?</span>
                        <label class="switch">
                            <input type="checkbox" id="toggle-${exam.code}" checked>
                            <span class="slider"></span>
                        </label>
                    </div>
                    <button class="btn" style="background:transparent; color:var(--text-muted); padding:5px;" onclick="removePendingExam('${exam.code}')">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            </div>
        `;
    });
    
    container.innerHTML = html;
}

async function saveAllPendingGrades() {
    const studentCode = document.getElementById('modal-student-select').value;
    const saveBtn = document.getElementById('save-all-btn');
    
    if (!studentCode || pendingNewGrades.length === 0) return;
    
    saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> שומר...';
    saveBtn.disabled = true;
    
    try {
        // הרצת כל בקשות השמירה במקביל
        const promises = pendingNewGrades.map(exam => {
            const passed = document.getElementById(`toggle-${exam.code}`).checked;
            return fetch(`${API_BASE}/student-exams`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ student_code: studentCode, exam_code: exam.code, passed: passed })
            });
        });
        
        await Promise.all(promises);
        
        // רענון טבלה ראשית וסגירת מודל
        loadRecentGrades();
        closeGradesModal();
        
        // יצירת חיווי הצלחה זמני (Toast/Alert)
        setTimeout(() => alert('כל הציונים עודכנו בהצלחה!'), 100);
        
    } catch (error) {
        alert('אירעה שגיאה בשמירת חלק מהציונים.');
        saveBtn.innerHTML = '<i class="fas fa-save"></i> שמור את כל העדכונים';
        saveBtn.disabled = false;
    }
}

// ==========================================
// פונקציות תלמידים ומבחנים (תצוגת טבלאות)
// ==========================================
function renderStudentsApp(container) {
    let html = `<div class="card">
        <div class="card-header">
            <h2><i class="fas fa-users" style="color:var(--accent); margin-left:8px;"></i> רשימת תלמידים רשומים</h2>
        </div>
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
    html += `</tbody></table></div>`;
    container.innerHTML = html;
}

function renderExamsApp(container) {
    let html = `<div class="card">
        <div class="card-header">
            <h2><i class="fas fa-file-alt" style="color:var(--accent); margin-left:8px;"></i> רשימת מבחנים במערכת</h2>
        </div>
        <table>
        <thead><tr><th>קוד</th><th>פרטים</th><th>כיתה</th><th>משניות</th></tr></thead><tbody>`;
        
    examsList.forEach(e => {
        html += `<tr>
            <td><span class="badge badge-blue">${e.exam_code}</span></td>
            <td><strong>${e.masechet}</strong> | פרק ${e.chapter_name || ''} - ${e.chapter_title || ''}</td>
            <td>${e.target_grade || ''}</td>
            <td>${e.total_mishnayot || ''}</td>
        </tr>`;
    });
    html += `</tbody></table></div>`;
    container.innerHTML = html;
}
