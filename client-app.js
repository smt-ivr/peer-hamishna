const API_BASE = '/peer/api';

let studentsList = [];
let examsList = [];

// אובייקטים לשמירת החיפוש החכם כדי שנוכל לאפס אותם אחרי שמירה
let studentSelectControl = null;
let examSelectControl = null;

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
        
        renderTab('grades');
    } catch (error) {
        document.getElementById('app-content').innerHTML = `<div class="card"><p style="color:red;">שגיאה בטעינת המערכת: ${error.message}</p></div>`;
    }
}

function renderTab(tabName) {
    const container = document.getElementById('app-content');
    
    if (tabName === 'grades') {
        renderGradesApp(container);
    } else if (tabName === 'students') {
        renderStudentsApp(container);
    } else if (tabName === 'exams') {
        renderExamsApp(container);
    }
}

// ==========================================
// לשונית ציונים 
// ==========================================
async function renderGradesApp(container) {
    // הרכבת האפשרויות ל-Select - הערך הוא הקוד נטו, הטקסט הוא מה שהמשתמש רואה ומחפש
    const studentsOptions = `<option value="">-- חפש ובחר תלמיד --</option>` + 
        studentsList.map(s => `<option value="${s.student_code}">${s.first_name} ${s.last_name} (כיתה ${s.class_grade}) - [${s.student_code}]</option>`).join('');
    
    const examsOptions = `<option value="">-- חפש ובחר מבחן --</option>` + 
        examsList.map(e => `<option value="${e.exam_code}">${e.exam_code} - ${e.masechet} | פרק ${e.chapter_name || ''}</option>`).join('');

    container.innerHTML = `
        <div class="card">
            <h2><i class="fas fa-edit" style="color:var(--accent); margin-left:8px;"></i>הזנת תוצאה לתלמיד</h2>
            <div class="form-group" style="align-items: flex-start;">
                
                <div class="input-field" style="flex: 2; min-width: 250px;">
                    <label>תלמיד</label>
                    <select id="grade-student">${studentsOptions}</select>
                </div>
                
                <div class="input-field" style="flex: 2; min-width: 250px;">
                    <label>מבחן</label>
                    <select id="grade-exam">${examsOptions}</select>
                </div>

                <div class="input-field" style="flex: 1; min-width: 150px;">
                    <label>תוצאה</label>
                    <select id="grade-passed" class="standard-select">
                        <option value="1">עבר / השלים</option>
                        <option value="0">לא עבר / חסר</option>
                    </select>
                </div>
                
                <button class="btn btn-success" onclick="submitGrade()" style="margin-top: 26px; height: 42px;">
                    <i class="fas fa-check"></i> שמור תוצאה
                </button>
            </div>
            <div id="grade-msg" class="status-msg"></div>
        </div>

        <div class="card">
            <h2><i class="fas fa-history" style="color:var(--accent); margin-left:8px;"></i>היסטוריית עדכונים (אחרונים)</h2>
            <div id="grades-table-container"><div class="loader"><i class="fas fa-spinner fa-spin"></i> טוען...</div></div>
        </div>
    `;
    
    // הפעלת ספריית החיפוש החכם (חוסם אפשרות לטקסט חופשי, מאפשר רק מהרשימה)
    studentSelectControl = new TomSelect('#grade-student', {
        create: false,
        sortField: { field: "text", direction: "asc" },
        render: { no_results: function(data, escape) { return '<div class="no-results">לא נמצאו תוצאות</div>'; } }
    });
    
    examSelectControl = new TomSelect('#grade-exam', {
        create: false,
        maxOptions: null,
        render: { no_results: function(data, escape) { return '<div class="no-results">לא נמצאו תוצאות</div>'; } }
    });

    loadRecentGrades();
}

async function submitGrade() {
    // בגלל שאנחנו עובדים עם Select מסודר, הערך (value) הוא כבר הקוד המדויק!
    const studentCode = document.getElementById('grade-student').value;
    const examCode = document.getElementById('grade-exam').value;
    const passed = document.getElementById('grade-passed').value === '1';
    const msg = document.getElementById('grade-msg');

    if (!studentCode || !examCode) {
        msg.style.color = 'var(--danger)';
        msg.innerHTML = '<i class="fas fa-exclamation-circle"></i> חובה לבחור תלמיד ומבחן מתוך הרשימה.';
        return;
    }

    try {
        msg.style.color = 'var(--text-main)';
        msg.innerHTML = '<i class="fas fa-spinner fa-spin"></i> שומר נתונים...';
        
        const res = await fetch(`${API_BASE}/student-exams`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ student_code: studentCode, exam_code: examCode, passed: passed })
        });

        if (res.ok) {
            msg.style.color = 'var(--success)';
            msg.innerHTML = '<i class="fas fa-check-circle"></i> התוצאה עודכנה בהצלחה!';
            
            // איפוס שדה התלמיד כדי שיהיה נוח להזין את הבא
            studentSelectControl.clear();
            
            loadRecentGrades();
        } else {
            msg.style.color = 'var(--danger)';
            msg.innerHTML = '<i class="fas fa-times-circle"></i> שגיאה בעדכון.';
        }
    } catch (e) {
        msg.style.color = 'var(--danger)';
        msg.innerHTML = '<i class="fas fa-wifi"></i> שגיאת רשת, נסה שוב.';
    }
}

async function loadRecentGrades() {
    try {
        const res = await fetch(`${API_BASE}/student-exams`);
        const grades = await res.json();
        
        let html = `<table>
            <thead><tr>
                <th>קוד תלמיד</th><th>קוד מבחן</th><th>סטטוס</th><th>תאריך עדכון</th><th>פעולות</th>
            </tr></thead>
            <tbody>`;
            
        grades.forEach(g => {
            // מציאת שם התלמיד המלא מתוך הרשימה לתצוגה יפה יותר
            const sDetails = studentsList.find(s => s.student_code === g.student_code);
            const sName = sDetails ? `${sDetails.first_name} ${sDetails.last_name}` : g.student_code;
            
            const status = g.passed ? 
                '<span style="color:var(--success); font-weight:500;"><i class="fas fa-check"></i> עבר</span>' : 
                '<span style="color:var(--danger); font-weight:500;"><i class="fas fa-times"></i> לא עבר</span>';
                
            html += `
                <tr>
                    <td>${sName}</td>
                    <td><span style="background:#e2e8f0; padding:3px 8px; border-radius:4px; font-size:13px;">${g.exam_code}</span></td>
                    <td>${status}</td>
                    <td dir="ltr" style="text-align:right; font-size:14px; color:#64748b;">${g.updated_at}</td>
                    <td><button class="btn btn-danger" onclick="deleteGrade('${g.student_code}', '${g.exam_code}')"><i class="fas fa-trash"></i></button></td>
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
    if (!confirm(`למחוק את התוצאה למבחן ${examCode}?`)) return;
    await fetch(`${API_BASE}/student-exams/${encodeURIComponent(studentCode)}/${encodeURIComponent(examCode)}`, { method: 'DELETE' });
    loadRecentGrades();
}

// ==========================================
// פונקציות תלמידים ומבחנים (תצוגת טבלאות)
// ==========================================
function renderStudentsApp(container) {
    let html = `<div class="card">
        <h2><i class="fas fa-users" style="color:var(--accent); margin-left:8px;"></i>רשימת תלמידים</h2>
        <table>
        <thead><tr><th>קוד</th><th>שם מלא</th><th>כיתה</th><th>טלפונים</th></tr></thead><tbody>`;
        
    studentsList.forEach(s => {
        const phones = (s.phones || []).join(', ');
        html += `<tr>
            <td><span style="background:#e2e8f0; padding:3px 8px; border-radius:4px; font-size:13px;">${s.student_code}</span></td>
            <td>${s.first_name} ${s.last_name}</td>
            <td>${s.class_grade}</td>
            <td dir="ltr" style="text-align:right">${phones}</td>
        </tr>`;
    });
    
    html += `</tbody></table></div>`;
    container.innerHTML = html;
}

function renderExamsApp(container) {
    let html = `<div class="card">
        <h2><i class="fas fa-file-alt" style="color:var(--accent); margin-left:8px;"></i>רשימת מבחנים</h2>
        <table>
        <thead><tr><th>קוד</th><th>פרטים</th><th>כיתה</th><th>משניות</th></tr></thead><tbody>`;
        
    examsList.forEach(e => {
        html += `<tr>
            <td><span style="background:#e2e8f0; padding:3px 8px; border-radius:4px; font-size:13px;">${e.exam_code}</span></td>
            <td><strong>${e.masechet}</strong> | פרק ${e.chapter_name || ''} - ${e.chapter_title || ''}</td>
            <td>${e.target_grade || ''}</td>
            <td>${e.total_mishnayot || ''}</td>
        </tr>`;
    });
    
    html += `</tbody></table></div>`;
    container.innerHTML = html;
}
