export class StudentManager {
    constructor(container, apiBase, onUpdateGradesCallback, onRefreshCallback) {
        this.container = container;
        this.apiBase = apiBase;
        this.onUpdateGradesCallback = onUpdateGradesCallback;
        this.onRefreshCallback = onRefreshCallback;
        this.students = [];
        this.classes = new Set();
    }

    render(students) {
        this.students = students;
        this.classes = new Set(this.students.map(s => s.class_grade).filter(Boolean).sort());
        
        const html = `
            <div class="card compact-card" style="display: flex; flex-direction: column; height: 100%;">
                <div class="compact-header" style="flex-wrap: wrap; gap: 10px; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                    <div style="display: flex; align-items: center; gap: 15px;">
                        <h3 style="margin: 0;"><i class="fas fa-users"></i> ניהול תלמידים</h3>
                        <span class="badge badge-primary" style="font-size: 0.85rem; padding: 4px 10px;">סה"כ רשומים: ${this.students.length}</span>
                    </div>
                    <div style="display: flex; gap: 10px;">
                        <button class="btn btn-outline btn-sm" id="exportStudentsBtn"><i class="fas fa-file-excel"></i> ייצוא לאקסל</button>
                        <button class="btn btn-primary btn-sm" id="addNewStudentBtn"><i class="fas fa-user-plus"></i> הוסף תלמיד חדש</button>
                    </div>
                </div>

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
                    <div class="modal-body" id="studentProfileBody" style="padding: 20px;"></div>
                </div>
            </div>

            <!-- מודל טופס הוספה/עריכה מתקדם -->
            <div id="studentFormModal" class="modal hidden">
                <div class="modal-content" style="max-width: 550px; height: auto;">
                    <div class="modal-header">
                        <h3 id="studentFormTitle">הוספת תלמיד</h3>
                        <button class="close-modal-btn" onclick="document.getElementById('studentFormModal').classList.add('hidden')">&times;</button>
                    </div>
                    <div class="modal-body" style="padding: 20px;">
                        <form id="studentForm" class="modern-form">
                            <input type="hidden" id="formOriginalCode">
                            
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
                                    <label style="display:block; margin-bottom:5px; font-size:0.85rem; font-weight:500;">כיתה</label>
                                    <input type="text" id="formClassGrade" style="width:100%; padding:8px; border:1px solid var(--border-color); border-radius:4px; outline:none;">
                                </div>
                                <div>
                                    <label style="display:block; margin-bottom:5px; font-size:0.85rem; font-weight:500;">טלפון (אופציונלי)</label>
                                    <input type="text" id="formPhone" placeholder="0501234567" style="width:100%; padding:8px; border:1px solid var(--border-color); border-radius:4px; outline:none;">
                                </div>
                            </div>
                            
                            <!-- אזור ניהול קוד התלמיד -->
                            <div style="background: #f8fafc; border: 1px solid var(--border-color); padding: 15px; border-radius: 6px; margin-bottom: 25px;">
                                <div id="addCodeSection">
                                    <label style="display:block; margin-bottom:5px; font-size:0.85rem; font-weight:500;">קוד תלמיד (מזהה ייחודי)</label>
                                    <input type="text" id="formStudentCode" placeholder="הקש קוד רצוי..." style="width:100%; padding:8px; border:1px solid var(--border-color); border-radius:4px; outline:none; margin-bottom:10px;">
                                    <label style="display: flex; align-items: center; gap: 8px; font-size: 0.85rem; cursor: pointer; color: var(--text-main);">
                                        <input type="checkbox" id="formAutoCode"> הקצה קוד תלמיד עוקב אוטומטית
                                    </label>
                                </div>
                                
                                <div id="editCodeSection" class="hidden" style="display: flex; justify-content: space-between; align-items: center;">
                                    <div>
                                        <span style="font-size: 0.85rem; color: var(--text-muted); display: block; margin-bottom: 4px;">קוד תלמיד נוכחי:</span>
                                        <strong id="displayCurrentCode" style="font-size: 1.2rem; color: var(--primary-color);"></strong>
                                    </div>
                                    <button type="button" class="btn btn-secondary btn-sm" id="btnChangeCode">
                                        <i class="fas fa-exchange-alt"></i> החלף קוד (פעולה מתקדמת)
                                    </button>
                                </div>
                            </div>
                            
                            <div style="display: flex; justify-content: flex-end; gap: 10px;">
                                <button type="button" class="btn btn-outline" onclick="document.getElementById('studentFormModal').classList.add('hidden')">ביטול</button>
                                <button type="submit" class="btn btn-primary" id="studentFormSubmitBtn"><i class="fas fa-save"></i> שמור פרטים במערכת</button>
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
        if(data.length === 0) return '<tr><td colspan="6" class="text-center text-muted" style="padding: 20px;">לא נמצאו תלמידים</td></tr>';
        
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
                            <button class="btn btn-outline btn-sm action-view-btn" data-code="${s.student_code}" title="כרטיס תלמיד"><i class="fas fa-eye"></i></button>
                            <button class="btn btn-secondary btn-sm action-edit-btn" data-code="${s.student_code}" title="ערוך פרטים"><i class="fas fa-pen"></i></button>
                            <button class="btn btn-primary btn-sm action-update-btn" data-code="${s.student_code}" title="מעבר לעדכון מבחנים"><i class="fas fa-edit"></i> ציונים</button>
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

        const applyFilters = () => {
            const term = textInput.value.trim().toLowerCase();
            const cls = classSelect.value;
            const filtered = this.students.filter(s => {
                const matchText = s.student_code.includes(term) || `${s.first_name} ${s.last_name}`.includes(term);
                const matchClass = cls === "" || s.class_grade === cls;
                return matchText && matchClass;
            });
            tbody.innerHTML = this.generateTableRows(filtered);
        };

        if(textInput) textInput.addEventListener('input', applyFilters);
        if(classSelect) classSelect.addEventListener('change', applyFilters);

        const exportBtn = document.getElementById('exportStudentsBtn');
        if(exportBtn) exportBtn.addEventListener('click', () => this.exportToExcel());

        document.getElementById('addNewStudentBtn').addEventListener('click', () => {
            this.openStudentForm();
        });

        document.getElementById('studentForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveStudent();
        });

        // החלפת מצב יצירת קוד אוטומטי
        document.getElementById('formAutoCode').addEventListener('change', (e) => {
            const codeInput = document.getElementById('formStudentCode');
            codeInput.disabled = e.target.checked;
            if (e.target.checked) codeInput.value = '';
        });

        // כפתור החלפת קוד תלמיד (במצב עריכה)
        document.getElementById('btnChangeCode').addEventListener('click', () => {
            const currentCode = document.getElementById('formOriginalCode').value;
            this.changeStudentCode(currentCode);
        });

        if(tbody) {
            tbody.addEventListener('click', (e) => {
                const viewBtn = e.target.closest('.action-view-btn');
                const editBtn = e.target.closest('.action-edit-btn');
                const updateBtn = e.target.closest('.action-update-btn');

                if (viewBtn) this.openStudentProfile(viewBtn.dataset.code);
                if (editBtn) this.openStudentForm(editBtn.dataset.code);
                if (updateBtn && this.onUpdateGradesCallback) this.onUpdateGradesCallback(updateBtn.dataset.code);
            });
        }
    }

    openStudentForm(studentCode = null) {
        const modal = document.getElementById('studentFormModal');
        const title = document.getElementById('studentFormTitle');
        const form = document.getElementById('studentForm');

        form.reset();
        document.getElementById('formOriginalCode').value = '';
        
        const addSection = document.getElementById('addCodeSection');
        const editSection = document.getElementById('editCodeSection');
        const codeInput = document.getElementById('formStudentCode');

        if (studentCode) {
            // מצב עריכה
            const student = this.students.find(s => s.student_code === studentCode);
            if (student) {
                title.innerHTML = '<i class="fas fa-pen"></i> עריכת פרטי תלמיד';
                document.getElementById('formOriginalCode').value = student.student_code;
                document.getElementById('formFirstName').value = student.first_name;
                document.getElementById('formLastName').value = student.last_name;
                document.getElementById('formClassGrade').value = student.class_grade || '';
                document.getElementById('formPhone').value = (student.phones && student.phones.length > 0) ? student.phones[0] : '';
                
                document.getElementById('displayCurrentCode').innerText = student.student_code;
                
                addSection.classList.add('hidden');
                editSection.classList.remove('hidden');
                codeInput.required = false;
            }
        } else {
            // מצב הוספה
            title.innerHTML = '<i class="fas fa-user-plus"></i> רישום תלמיד חדש';
            addSection.classList.remove('hidden');
            editSection.classList.add('hidden');
            codeInput.required = false; // ייבדק ידנית אם תיבת הסימון לא מסומנת
            codeInput.disabled = false;
        }

        modal.classList.remove('hidden');
    }

    async saveStudent() {
        const originalCode = document.getElementById('formOriginalCode').value;
        const isEdit = !!originalCode;
        
        const fName = document.getElementById('formFirstName').value.trim();
        const lName = document.getElementById('formLastName').value.trim();
        const cGrade = document.getElementById('formClassGrade').value.trim();
        const phone = document.getElementById('formPhone').value.trim();
        
        const payload = {
            first_name: fName,
            last_name: lName,
            class_grade: cGrade,
            phones: phone ? [phone] : []
        };

        const submitBtn = document.getElementById('studentFormSubmitBtn');
        const origText = submitBtn.innerHTML;
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> מעדכן...';

        try {
            if (isEdit) {
                // עדכון תלמיד קיים (ללא שינוי קוד - PUT /students/{student_code})
                const response = await fetch(`${this.apiBase}/students/${originalCode}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                
                if (response.ok) {
                    document.getElementById('studentFormModal').classList.add('hidden');
                    if (this.onRefreshCallback) this.onRefreshCallback();
                } else {
                    const err = await response.json();
                    alert('שגיאה בעדכון: ' + (err.error || 'לא ידועה'));
                }
            } else {
                // יצירת תלמיד חדש (POST /students)
                const autoCode = document.getElementById('formAutoCode').checked;
                if (!autoCode) {
                    const code = document.getElementById('formStudentCode').value.trim();
                    if (!code) {
                        alert('יש להזין קוד תלמיד רצוי או לסמן "הקצה קוד תלמיד עוקב אוטומטית".');
                        submitBtn.disabled = false;
                        submitBtn.innerHTML = origText;
                        return;
                    }
                    payload.student_code = code;
                }
                
                const response = await fetch(`${this.apiBase}/students`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                
                if (response.ok) {
                    const result = await response.json();
                    alert(`התלמיד נוצר בהצלחה! קוד התלמיד במערכת הוא: ${result.student_code}`);
                    document.getElementById('studentFormModal').classList.add('hidden');
                    if (this.onRefreshCallback) this.onRefreshCallback();
                } else {
                    const err = await response.json();
                    if (response.status === 400 && err.error && err.error.includes("exists")) {
                        alert('שגיאה: קוד התלמיד כבר קיים במערכת. בחר קוד אחר.');
                    } else {
                        alert('שגיאה ביצירה: ' + (err.error || 'לא ידועה'));
                    }
                }
            }
        } catch (error) {
            alert('שגיאת תקשורת במערכת בעת השמירה.');
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerHTML = origText;
        }
    }

    async changeStudentCode(oldCode) {
        const newCode = prompt(`הזן את קוד התלמיד החדש שיחליף את הקוד הקודם (${oldCode}):`);
        if (!newCode || newCode.trim() === '') return; // המשתמש לחץ ביטול או השאיר ריק
        
        const finalNewCode = newCode.trim();
        if (finalNewCode === oldCode) {
            return alert('הקוד החדש זהה לקוד הישן. לא בוצע שינוי.');
        }

        try {
            const response = await fetch(`${this.apiBase}/students/${oldCode}/change-code`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ new_student_code: finalNewCode })
            });

            if (response.ok) {
                alert(`מעולה! קוד התלמיד עודכן בהצלחה ל-${finalNewCode} בכל רישומי המערכת.`);
                document.getElementById('studentFormModal').classList.add('hidden');
                // רענון כללי כדי שכל המסכים יכירו את הקוד החדש
                if (this.onRefreshCallback) this.onRefreshCallback();
            } else {
                const err = await response.json();
                if (response.status === 409 || (err.error && err.error.includes('exists'))) {
                    alert('שגיאה: קוד התלמיד החדש שבחרת כבר תפוס על ידי תלמיד אחר במערכת.');
                } else {
                    alert('אירעה שגיאה בשינוי הקוד: ' + (err.error || 'נסה שוב מאוחר יותר.'));
                }
            }
        } catch (error) {
            alert('שגיאת תקשורת במערכת. פעולת שינוי הקוד לא בוצעה.');
        }
    }

    exportToExcel() {
        let csvContent = '\uFEFF';
        csvContent += 'קוד תלמיד,שם פרטי,שם משפחה,כיתה,סך הכל נצבר (₪),מבחנים רשומים,עברו בהצלחה,טלפון\n';
        
        this.students.forEach(s => {
            const exams = s.exams_details || [];
            const passed = exams.filter(e => e.passed).length;
            const totalReward = s.total_reward || 0;
            const phone = (s.phones && s.phones.length > 0) ? s.phones[0] : '';
            csvContent += `"${s.student_code}","${s.first_name}","${s.last_name}","${s.class_grade || ''}","${totalReward}","${exams.length}","${passed}","${phone}"\n`;
        });

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = `רשימת_תלמידים_${new Date().toISOString().slice(0,10)}.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
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

            <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; margin-bottom: 20px;">
                <div style="background: var(--bg-color); border: 1px solid var(--border-color); border-radius: 6px; padding: 15px; text-align: center;">
                    <div style="font-size: 1.6rem; font-weight: bold; color: var(--primary-color);">₪${totalReward.toFixed(1)}</div>
                    <div style="font-size: 0.85rem; color: var(--text-muted);">סך הכל נצבר</div>
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
