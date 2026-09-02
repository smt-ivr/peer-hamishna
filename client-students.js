export class StudentManager {
    constructor(container, onUpdateGradesCallback) {
        this.container = container;
        this.onUpdateGradesCallback = onUpdateGradesCallback; // פונקציה שעוברת לטאב עדכון המבחנים
        this.students = [];
        this.classes = new Set();
    }

    render(students) {
        this.students = students;
        
        // יצירת רשימת כיתות דינאמית עבור הפילטר (מסנן כיתות ריקות וממיין)
        this.classes = new Set(this.students.map(s => s.class_grade).filter(Boolean).sort());
        
        const html = `
            <div class="card compact-card" style="display: flex; flex-direction: column; height: 100%;">
                
                <!-- כותרת וסטטיסטיקה -->
                <div class="compact-header" style="flex-wrap: wrap; gap: 10px; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                    <div style="display: flex; align-items: center; gap: 15px;">
                        <h3 style="margin: 0;"><i class="fas fa-users"></i> ניהול תלמידים</h3>
                        <span class="badge badge-primary" style="font-size: 0.85rem; padding: 4px 10px;">סה"כ רשומים: ${this.students.length}</span>
                    </div>
                    <button class="btn btn-primary btn-sm" id="addNewStudentBtn">
                        <i class="fas fa-user-plus"></i> הוסף תלמיד חדש
                    </button>
                </div>

                <!-- שורת סינון מתקדם -->
                <div style="display: flex; gap: 10px; margin-bottom: 15px; background: var(--bg-color); padding: 10px; border-radius: 6px; border: 1px solid var(--border-color); align-items: center; flex-wrap: wrap;">
                    <span style="font-size: 0.85rem; font-weight: 600; color: var(--text-muted);"><i class="fas fa-filter"></i> סינון:</span>
                    
                    <div class="search-box" style="flex: 1; min-width: 200px;">
                        <i class="fas fa-search search-icon"></i>
                        <input type="text" id="filterStudentsText" placeholder="חיפוש חופשי (שם, קוד)..." autocomplete="off" style="padding: 6px 30px 6px 10px; width: 100%;">
                    </div>
                    
                    <select id="filterStudentsClass" style="padding: 6px 10px; border: 1px solid var(--border-color); border-radius: 4px; outline: none; background: white; font-size: 0.9rem; color: var(--text-main); min-width: 120px;">
                        <option value="">כל הכיתות</option>
                        ${Array.from(this.classes).map(c => `<option value="${c}">כיתה ${c}</option>`).join('')}
                    </select>
                </div>
                
                <!-- טבלת נתונים -->
                <div class="table-container" style="flex: 1; overflow-y: auto;">
                    <table class="modern-table sticky-header">
                        <thead>
                            <tr>
                                <th>קוד</th>
                                <th>שם התלמיד</th>
                                <th>כיתה</th>
                                <th>נצבר (₪)</th>
                                <th>מבחנים (הצלחה/סה"כ)</th>
                                <th style="text-align: left;">פעולות</th>
                            </tr>
                        </thead>
                        <tbody id="studentsTableBody">
                            ${this.generateTableRows(this.students)}
                        </tbody>
                    </table>
                </div>
            </div>

            <!-- מודל פרופיל תלמיד -->
            <div id="studentProfileModal" class="modal hidden">
                <div class="modal-content" style="max-width: 600px; height: auto;">
                    <div class="modal-header">
                        <h3><i class="fas fa-id-card"></i> כרטיס תלמיד אישי</h3>
                        <button class="close-modal-btn" onclick="document.getElementById('studentProfileModal').classList.add('hidden')">&times;</button>
                    </div>
                    <div class="modal-body" id="studentProfileBody" style="padding: 20px;">
                        <!-- התוכן מוזרק דינאמית בפונקציה openStudentProfile -->
                    </div>
                </div>
            </div>

            <!-- מודל הוספה / עריכת תלמיד -->
            <div id="studentFormModal" class="modal hidden">
                <div class="modal-content" style="max-width: 500px; height: auto;">
                    <div class="modal-header">
                        <h3 id="studentFormTitle">הוספת תלמיד</h3>
                        <button class="close-modal-btn" onclick="document.getElementById('studentFormModal').classList.add('hidden')">&times;</button>
                    </div>
                    <div class="modal-body" style="padding: 20px;">
                        <form id="studentForm" class="modern-form">
                            <input type="hidden" id="formStudentId">
                            
                            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 15px;">
                                <div>
                                    <label style="display:block; margin-bottom:5px; font-size:0.85rem; font-weight:500;">שם פרטי</label>
                                    <input type="text" id="formFirstName" required style="width:100%; padding:8px; border:1px solid var(--border-color); border-radius:4px; outline:none;">
                                </div>
                                <div>
                                    <label style="display:block; margin-bottom:5px; font-size:0.85rem; font-weight:500;">שם משפחה</label>
                                    <input type="text" id="formLastName" required style="width:100%; padding:8px; border:1px solid var(--border-color); border-radius:4px; outline:none;">
                                </div>
                            </div>
                            
                            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 25px;">
                                <div>
                                    <label style="display:block; margin-bottom:5px; font-size:0.85rem; font-weight:500;">קוד תלמיד</label>
                                    <input type="text" id="formStudentCode" required style="width:100%; padding:8px; border:1px solid var(--border-color); border-radius:4px; outline:none;">
                                </div>
                                <div>
                                    <label style="display:block; margin-bottom:5px; font-size:0.85rem; font-weight:500;">כיתה</label>
                                    <input type="text" id="formClassGrade" style="width:100%; padding:8px; border:1px solid var(--border-color); border-radius:4px; outline:none;">
                                </div>
                            </div>
                            
                            <div style="display: flex; justify-content: flex-end; gap: 10px;">
                                <button type="button" class="btn btn-outline" onclick="document.getElementById('studentFormModal').classList.add('hidden')">ביטול</button>
                                <button type="submit" class="btn btn-primary"><i class="fas fa-save"></i> שמור פרטים במערכת</button>
                            </div>
                        </form>
                    </div>
                </div>
            </div>
        `;
        
        this.container.innerHTML = html;
        this.attachEvents();
    }

    generateTableRows(data) {
        if(data.length === 0) return '<tr><td colspan="6" class="text-center text-muted" style="padding: 20px;">לא נמצאו תלמידים התואמים לחיפוש</td></tr>';
        
        return data.map(s => {
            const exams = s.exams_details || [];
            const passed = exams.filter(e => e.passed).length;
            const totalReward = s.total_reward || 0;
            
            return `
                <tr>
                    <td><strong>${s.student_code}</strong></td>
                    <td>${s.first_name} ${s.last_name}</td>
                    <td><span class="badge badge-info">${s.class_grade || '-'}</span></td>
                    <td><span class="reward-badge" style="background:#eff6ff;">₪${totalReward.toFixed(1)}</span></td>
                    <td><span class="status-pill success">${passed} / ${exams.length}</span></td>
                    <td style="text-align: left;">
                        <div style="display: inline-flex; gap: 6px;">
                            <button class="btn btn-outline btn-sm action-view-btn" data-code="${s.student_code}" title="כרטיס תלמיד">
                                <i class="fas fa-eye"></i>
                            </button>
                            <button class="btn btn-secondary btn-sm action-edit-btn" data-code="${s.student_code}" title="ערוך פרטים">
                                <i class="fas fa-pen"></i>
                            </button>
                            <button class="btn btn-primary btn-sm action-update-btn" data-code="${s.student_code}" title="מעבר לעדכון מבחנים">
                                <i class="fas fa-edit"></i> ציונים
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    }

    attachEvents() {
        const textInput = document.getElementById('filterStudentsText');
        const classSelect = document.getElementById('filterStudentsClass');
        const tbody = document.getElementById('studentsTableBody');

        // פונקציית סינון משולבת (טקסט + בחירת כיתה)
        const applyFilters = () => {
            const term = textInput.value.trim().toLowerCase();
            const cls = classSelect.value;

            const filtered = this.students.filter(s => {
                const matchText = s.student_code.includes(term) || 
                                  s.first_name.includes(term) || 
                                  s.last_name.includes(term) ||
                                  `${s.first_name} ${s.last_name}`.includes(term);
                const matchClass = cls === "" || s.class_grade === cls;
                
                return matchText && matchClass;
            });
            tbody.innerHTML = this.generateTableRows(filtered);
        };

        textInput.addEventListener('input', applyFilters);
        classSelect.addEventListener('change', applyFilters);

        // פתיחת חלון הוספת תלמיד
        document.getElementById('addNewStudentBtn').addEventListener('click', () => {
            this.openStudentForm();
        });

        // שליחת טופס שמירה/עריכה
        document.getElementById('studentForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveStudent();
        });

        // האזנה לקליקים על כפתורי הפעולות בטבלה
        tbody.addEventListener('click', (e) => {
            const viewBtn = e.target.closest('.action-view-btn');
            const editBtn = e.target.closest('.action-edit-btn');
            const updateBtn = e.target.closest('.action-update-btn');

            if (viewBtn) this.openStudentProfile(viewBtn.dataset.code);
            if (editBtn) this.openStudentForm(editBtn.dataset.code);
            if (updateBtn && this.onUpdateGradesCallback) this.onUpdateGradesCallback(updateBtn.dataset.code);
        });
    }

    openStudentForm(studentCode = null) {
        const modal = document.getElementById('studentFormModal');
        const title = document.getElementById('studentFormTitle');
        const form = document.getElementById('studentForm');

        form.reset();
        document.getElementById('formStudentId').value = '';

        // אם הועבר קוד - זה מצב עריכה, נטען את הפרטים
        if (studentCode) {
            const student = this.students.find(s => s.student_code === studentCode);
            if (student) {
                title.innerHTML = '<i class="fas fa-pen"></i> עריכת פרטי תלמיד';
                document.getElementById('formStudentId').value = student.id || '';
                document.getElementById('formStudentCode').value = student.student_code;
                document.getElementById('formFirstName').value = student.first_name;
                document.getElementById('formLastName').value = student.last_name;
                document.getElementById('formClassGrade').value = student.class_grade || '';
            }
        } else {
            title.innerHTML = '<i class="fas fa-user-plus"></i> הוספת תלמיד חדש';
        }

        modal.classList.remove('hidden');
    }

    saveStudent() {
        // כאן אתה בונה את הלוגיקה שתשלח בקשת POST או PUT לשרת (API)
        const id = document.getElementById('formStudentId').value;
        const code = document.getElementById('formStudentCode').value;
        const fName = document.getElementById('formFirstName').value;
        const lName = document.getElementById('formLastName').value;
        const cGrade = document.getElementById('formClassGrade').value;

        // הדמיה בינתיים עד חיבור לשרת:
        alert(`שמירת נתונים במערכת... (לחיבור מול ה-API)\nשם: ${fName} ${lName}\nקוד: ${code}`);
        document.getElementById('studentFormModal').classList.add('hidden');
    }

    openStudentProfile(studentCode) {
        const student = this.students.find(s => s.student_code === studentCode);
        if (!student) return;

        const modal = document.getElementById('studentProfileModal');
        const body = document.getElementById('studentProfileBody');
        
        const exams = student.exams_details || [];
        const passed = exams.filter(e => e.passed).length;
        const failed = exams.length - passed;
        const totalReward = student.total_reward || 0;
        
        // המרת התאריך לתצוגה יפה
        const joinedDate = student.created_at ? new Date(student.created_at).toLocaleDateString('he-IL') : 'לא ידוע';

        body.innerHTML = `
            <div style="display: flex; gap: 20px; align-items: center; margin-bottom: 20px; padding-bottom: 20px; border-bottom: 1px solid var(--border-color);">
                <div style="width: 65px; height: 65px; background: var(--primary-color); color: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 1.8rem; flex-shrink: 0;">
                    <i class="fas fa-user-graduate"></i>
                </div>
                <div style="flex: 1;">
                    <h2 style="margin: 0 0 6px 0; font-size: 1.4rem;">${student.first_name} ${student.last_name}</h2>
                    <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                        <span class="badge badge-info">קוד: ${student.student_code}</span>
                        <span class="badge badge-info">כיתה: ${student.class_grade || '-'}</span>
                        <span class="badge badge-info">הצטרף: ${joinedDate}</span>
                    </div>
                </div>
            </div>

            <!-- סטטיסטיקות כרטיסייה -->
            <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; margin-bottom: 20px;">
                <div style="background: var(--bg-color); border: 1px solid var(--border-color); border-radius: 6px; padding: 15px; text-align: center;">
                    <div style="font-size: 1.6rem; font-weight: bold; color: var(--primary-color);">₪${totalReward.toFixed(1)}</div>
                    <div style="font-size: 0.85rem; color: var(--text-muted);">סך הכל נצבר (₪)</div>
                </div>
                <div style="background: var(--bg-color); border: 1px solid var(--border-color); border-radius: 6px; padding: 15px; text-align: center;">
                    <div style="font-size: 1.6rem; font-weight: bold; color: var(--text-main);">${exams.length}</div>
                    <div style="font-size: 0.85rem; color: var(--text-muted);">סך הכל מבחנים שדווחו</div>
                </div>
                <div style="background: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 6px; padding: 15px; text-align: center;">
                    <div style="font-size: 1.6rem; font-weight: bold; color: #059669;">${passed}</div>
                    <div style="font-size: 0.85rem; color: #059669;">עברו בהצלחה</div>
                </div>
                <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 6px; padding: 15px; text-align: center;">
                    <div style="font-size: 1.6rem; font-weight: bold; color: #dc2626;">${failed}</div>
                    <div style="font-size: 0.85rem; color: #dc2626;">לא עברו</div>
                </div>
            </div>

            <div style="display: flex; justify-content: flex-end; gap: 10px; border-top: 1px solid var(--border-color); padding-top: 15px;">
                <button class="btn btn-secondary" onclick="document.getElementById('studentProfileModal').classList.add('hidden'); document.querySelector('.action-edit-btn[data-code=\\'${student.student_code}\\']').click();">
                    <i class="fas fa-pen"></i> ערוך פרטים
                </button>
                <button class="btn btn-primary" onclick="document.getElementById('studentProfileModal').classList.add('hidden'); document.querySelector('.action-update-btn[data-code=\\'${student.student_code}\\']').click();">
                    <i class="fas fa-edit"></i> עבור להזנת ציונים לתלמיד זה
                </button>
            </div>
        `;

        modal.classList.remove('hidden');
    }
}
