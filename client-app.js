const API_BASE = '/peer/api';

// משתנים לשמירת הנתונים בזיכרון כדי למנוע קריאות מיותרות לשרת בעת חיפוש
let studentsList = [];
let examsList = [];

document.addEventListener('DOMContentLoaded', () => {
    initApp();
    
    // מאזין ללחיצות על התפריט
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            renderTab(e.target.dataset.tab);
        });
    });
});

async function initApp() {
    try {
        // טעינת הנתונים הראשוניים הדרושים לחיפושים
        const [studentsRes, examsRes] = await Promise.all([
            fetch(`${API_BASE}/students`),
            fetch(`${API_BASE}/exams`)
        ]);
        
        studentsList = await studentsRes.json();
        examsList = await examsRes.json();
        
        // טעינת לשונית ברירת המחדל
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
// לשונית ציונים (עם חיפוש חכם)
// ==========================================
async function renderGradesApp(container) {
    // יצירת רשימות ה-datalist לחיפוש חכם
    const studentsOptions = studentsList.map(s => 
        `<option value="${s.student_code} - ${s.first_name} ${s.last_name} (כיתה ${s.class_grade})">`
    ).join('');
    
    const examsOptions = examsList.map(e => 
        `<option value="${e.exam_code} - ${e.masechet} | פרק ${e.chapter_name || ''}">`
    ).join('');

    container.innerHTML = `
        <div class="card">
            <h2>הזנת תוצאה לתלמיד</h2>
            <div class="form-group">
                <div class="input-field">
                    <label>חיפוש תלמיד (שם או קוד)</label>
                    <input list="students-datalist" id="grade-student" placeholder="התחל להקליד...">
                    <datalist id="students-datalist">${studentsOptions}</datalist>
                </div>
                
                <div class="input-field">
                    <label>חיפוש מבחן (מסכת, פרק או קוד)</label>
                    <input list="exams-datalist" id="grade-exam" placeholder="התחל להקליד...">
                    <datalist id="exams-datalist">${examsOptions}</datalist>
                </div>

                <div class="input-field">
                    <label>תוצאה</label>
                    <select id="grade-passed">
                        <option value="1">עבר / השלים</option>
                        <option value="0">לא עבר / חסר</option>
                    </select>
                </div>
                
                <button class="btn btn-success" onclick="submitGrade()" style="margin-bottom: 2px;">עדכן במערכת</button>
            </div>
            <div id="grade-msg" class="status-msg"></div>
        </div>

        <div class="card">
            <h2>היסטוריית ציונים אחרונים</h2>
            <div id="grades-table-container">טוען היסטוריה...</div>
        </div>
    `;
    
    loadRecentGrades();
}

async function submitGrade() {
    const studentInput = document.getElementById('grade-student').value;
    const examInput = document.getElementById('grade-exam').value;
    const passed = document.getElementById('grade-passed').value === '1';
    const msg = document.getElementById('grade-msg');

    // חילוץ הקודים מתוך המחרוזת (לוקח את מה שלפני המקף הראשון)
    const studentCode = studentInput.split(' - ')[0];
    const examCode = examInput.split(' - ')[0];

    if (!studentCode || !examCode) {
        msg.style.color = 'red';
        msg.innerText = 'נא לוודא שבחרת תלמיד ומבחן תקינים מתוך הרשימה.';
        return;
    }

    try {
        msg.style.color = 'black';
        msg.innerText = 'שומר נתונים...';
        
        const res = await fetch(`${API_BASE}/student-exams`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ student_code: studentCode, exam_code: examCode, passed: passed })
        });

        if (res.ok) {
            msg.style.color = 'green';
            msg.innerText = 'התוצאה עודכנה בהצלחה!';
            document.getElementById('grade-student').value = ''; // ניקוי שדה
            loadRecentGrades();
        } else {
            msg.style.color = 'red';
            msg.innerText = 'שגיאה בעדכון.';
        }
    } catch (e) {
        msg.style.color = 'red';
        msg.innerText = 'שגיאת רשת.';
    }
}

async function loadRecentGrades() {
    try {
        const res = await fetch(`${API_BASE}/student-exams`);
        const grades = await res.json();
        
        let html = `<table>
            <thead><tr><th>קוד תלמיד</th><th>קוד מבחן</th><th>סטטוס</th><th>תאריך שעה</th><th>פעולות</th></tr></thead>
            <tbody>`;
            
        grades.forEach(g => {
            const status = g.passed ? '<span style="color:var(--success-color)">עבר</span>' : '<span style="color:var(--danger-color)">לא עבר</span>';
            html += `
                <tr>
                    <td>${g.student_code}</td>
                    <td>${g.exam_code}</td>
                    <td>${status}</td>
                    <td dir="ltr" style="text-align:right">${g.updated_at}</td>
                    <td><button class="btn btn-danger" onclick="deleteGrade('${g.student_code}', '${g.exam_code}')">מחק</button></td>
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
    if (!confirm(`למחוק תוצאה של מבחן ${examCode} לתלמיד ${studentCode}?`)) return;
    await fetch(`${API_BASE}/student-exams/${encodeURIComponent(studentCode)}/${encodeURIComponent(examCode)}`, { method: 'DELETE' });
    loadRecentGrades();
}

// ==========================================
// פונקציות תלמידים ומבחנים (תצוגת טבלאות)
// ==========================================
function renderStudentsApp(container) {
    let html = `<div class="card"><h2>רשימת תלמידים</h2><table>
        <thead><tr><th>קוד</th><th>שם מלא</th><th>כיתה</th><th>טלפונים</th></tr></thead><tbody>`;
        
    studentsList.forEach(s => {
        const phones = (s.phones || []).join(', ');
        html += `<tr><td>${s.student_code}</td><td>${s.first_name} ${s.last_name}</td><td>${s.class_grade}</td><td>${phones}</td></tr>`;
    });
    
    html += `</tbody></table></div>`;
    container.innerHTML = html;
}

function renderExamsApp(container) {
    let html = `<div class="card"><h2>רשימת מבחנים</h2><table>
        <thead><tr><th>קוד</th><th>פרטים</th><th>כיתה</th><th>משניות</th></tr></thead><tbody>`;
        
    examsList.forEach(e => {
        html += `<tr><td>${e.exam_code}</td><td>${e.masechet} | פרק ${e.chapter_name || ''} - ${e.chapter_title || ''}</td><td>${e.target_grade || ''}</td><td>${e.total_mishnayot || ''}</td></tr>`;
    });
    
    html += `</tbody></table></div>`;
    container.innerHTML = html;
}
