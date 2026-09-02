export class ExamUpdateManager {
    constructor(apiBase, containerElement) {
        this.apiBase = apiBase;
        this.container = containerElement;
        this.currentStudent = null;
    }

    async loadStudentData(studentCode) {
        this.container.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i> מושך נתוני תלמיד מהשרת...</div>';
        this.container.classList.remove('hidden');

        try {
            const response = await fetch(`${this.apiBase}/students?student_code=${studentCode}`);
            if (response.ok) {
                this.currentStudent = await response.json();
                this.renderPortal();
            } else {
                this.showError('אירעה שגיאה בטעינת נתוני התלמיד מהשרת.');
            }
        } catch (error) {
            this.showError('שגיאת תקשורת. לא ניתן להתחבר לשרת.');
        }
    }

    renderPortal() {
        const s = this.currentStudent;
        
        let html = `
            <div class="card profile-header">
                <div class="avatar"><i class="fas fa-user-graduate"></i></div>
                <div class="profile-info">
                    <h2>${s.first_name} ${s.last_name}</h2>
                    <div class="profile-badges">
                        <span class="badge">כיתה: ${s.class_grade}</span>
                        <span class="badge">קוד תלמיד: ${s.student_code}</span>
                    </div>
                </div>
            </div>

            <div class="card exam-form-card">
                <h3><i class="fas fa-file-signature"></i> דיווח תוצאת מבחן</h3>
                <form id="examUpdateForm" class="modern-form">
                    <div class="form-row">
                        <div class="form-group">
                            <label>קוד מבחן:</label>
                            <input type="text" id="examCode" required placeholder="לדוגמא: 1א">
                        </div>
                        
                        <div class="form-group">
                            <label>סטטוס מעבר:</label>
                            <select id="examPassed" class="modern-select">
                                <option value="true">עבר בהצלחה</option>
                                <option value="false">לא עבר</option>
                            </select>
                        </div>
                    </div>
                    
                    <div class="form-actions">
                        <button type="submit" class="btn btn-primary" id="submitBtn">
                            <i class="fas fa-save"></i> עדכן במערכת
                        </button>
                    </div>
                </form>
                <div id="systemMessage" class="message hidden"></div>
            </div>
        `;

        // הצגת היסטוריית מבחנים אם קיימת
        if (s.exams_details && s.exams_details.length > 0) {
            html += `
                <div class="card history-card">
                    <h3><i class="fas fa-history"></i> היסטוריית מבחנים</h3>
                    <div class="table-responsive">
                        <table class="modern-table">
                            <thead>
                                <tr>
                                    <th>קוד מבחן</th>
                                    <th>סטטוס</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${s.exams_details.map(ex => `
                                    <tr>
                                        <td><strong>${ex.exam_code}</strong></td>
                                        <td>
                                            <span class="status-pill ${ex.passed ? 'success' : 'danger'}">
                                                ${ex.passed ? 'עבר' : 'נכשל'}
                                            </span>
                                        </td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            `;
        }

        this.container.innerHTML = html;
        this.attachFormEvents();
    }

    attachFormEvents() {
        const form = document.getElementById('examUpdateForm');
        
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const btn = document.getElementById('submitBtn');
            const msgBox = document.getElementById('systemMessage');
            const examCode = document.getElementById('examCode').value.trim();
            const isPassed = document.getElementById('examPassed').value === 'true';

            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> מעדכן...';
            msgBox.className = 'message hidden';

            const payload = {
                student_code: this.currentStudent.student_code,
                exams: [{ exam_code: examCode, passed: isPassed }]
            };

            try {
                const response = await fetch(`${this.apiBase}/student-exams`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                if (response.ok) {
                    msgBox.className = 'message success';
                    msgBox.innerHTML = '<i class="fas fa-check-circle"></i> העדכון נשמר בהצלחה בשרת!';
                    form.reset();
                    
                    // רענון נתוני התלמיד כדי להציג את המבחן החדש בהיסטוריה
                    setTimeout(() => {
                        this.loadStudentData(this.currentStudent.student_code);
                    }, 1200);
                } else {
                    throw new Error('שגיאת שרת');
                }
            } catch (error) {
                msgBox.className = 'message error';
                msgBox.innerHTML = '<i class="fas fa-exclamation-triangle"></i> אירעה שגיאה בשמירת הנתונים. נסה שוב.';
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-save"></i> עדכן במערכת';
            }
        });
    }

    showError(msg) {
        this.container.innerHTML = `
            <div class="card error-card">
                <i class="fas fa-exclamation-circle fa-2x"></i>
                <p>${msg}</p>
            </div>`;
    }
}
