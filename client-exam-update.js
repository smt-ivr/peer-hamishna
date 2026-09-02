export class ExamUpdateManager {
    constructor(apiBase, containerElement, onSwitchCallback) {
        this.apiBase = apiBase;
        this.container = containerElement;
        this.onSwitchCallback = onSwitchCallback;
        this.currentStudent = null;
        this.allExams = [];
        this.setupModalEvents();
        this.setupGlobalEvents();
    }

    setExams(exams) {
        this.allExams = exams;
    }

    setupGlobalEvents() {
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.exam-search-container')) {
                document.querySelectorAll('.exam-search-results').forEach(el => el.classList.add('hidden'));
            }
        });
    }

    async loadStudentData(studentCode, silent = false) {
        if (!silent) {
            this.container.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i> טוען נתוני תלמיד...</div>';
            this.container.classList.remove('hidden');
        }

        try {
            const response = await fetch(`${this.apiBase}/students?student_code=${studentCode}`);
            if (response.ok) {
                this.currentStudent = await response.json();
                if (!silent) {
                    this.renderPortal();
                } else {
                    this.updateHistoryButtonCount();
                }
            } else if (!silent) {
                this.showError('אירעה שגיאה בטעינת נתוני התלמיד.');
            }
        } catch (error) {
            if (!silent) {
                this.showError('שגיאת תקשורת מול השרת.');
            }
        }
    }

    updateHistoryButtonCount() {
        const btn = document.getElementById('openHistoryModalBtn');
        if (btn && this.currentStudent && this.currentStudent.exams_details) {
            btn.innerHTML = `<i class="fas fa-history"></i> היסטוריית מבחנים (${this.currentStudent.exams_details.length})`;
        }
    }

    renderPortal() {
        const s = this.currentStudent;
        const examsCount = s.exams_details ? s.exams_details.length : 0;
        
        const html = `
            <div class="card student-top-card">
                <div class="student-info-left">
                    <div class="avatar"><i class="fas fa-user-graduate"></i></div>
                    <div>
                        <h2>${s.first_name} ${s.last_name}</h2>
                        <div class="profile-badges">
                            <span class="badge">כיתה: ${s.class_grade}</span>
                            <span class="badge">קוד תלמיד: ${s.student_code}</span>
                        </div>
                    </div>
                </div>
                <div class="student-top-actions">
                    <button class="btn btn-secondary" id="openHistoryModalBtn">
                        <i class="fas fa-history"></i> היסטוריית מבחנים (${examsCount})
                    </button>
                    <button class="btn btn-outline" id="switchStudentBtn">
                        <i class="fas fa-exchange-alt"></i> החלף תלמיד
                    </button>
                </div>
            </div>

            <div class="card exam-form-card">
                <h3><i class="fas fa-file-signature"></i> דיווח והזנת מבחנים</h3>
                <p class="text-muted">ניתן לחפש מבחן לפי קוד או נושא, ולהוסיף שורות לעדכון מקביל.</p>
                
                <form id="multiExamForm" class="modern-form">
                    <div id="examRowsContainer">
                        <div class="exam-row-item">
                            <div class="form-group exam-code-group exam-search-container">
                                <label>קוד / חיפוש מבחן:</label>
                                <input type="text" class="exam-code-input" required placeholder="הקלד קוד או נושא לחיפוש..." autocomplete="off">
                                <div class="exam-search-results hidden"></div>
                            </div>
                            
                            <div class="form-group exam-status-group">
                                <label>תוצאה:</label>
                                <div class="toggle-group">
                                    <button type="button" class="toggle-btn pass-btn active" data-value="true">
                                        <i class="fas fa-check"></i> עבר
                                    </button>
                                    <button type="button" class="toggle-btn fail-btn" data-value="false">
                                        <i class="fas fa-times"></i> לא עבר
                                    </button>
                                </div>
                            </div>
                            
                            <div class="form-group action-group">
                                <label>&nbsp;</label>
                                <button type="button" class="btn-icon-danger remove-row-btn" disabled title="הסר שורה">
                                    <i class="fas fa-trash"></i>
                                </button>
                            </div>
                        </div>
                    </div>

                    <div>
                        <div id="serverFeedback" class="server-feedback hidden"></div>
                    </div>

                    <div class="form-actions-inline">
                        <button type="button" class="btn btn-dashed" id="addRowBtn">
                            <i class="fas fa-plus"></i> הוסף מבחן נוסף לרשימה
                        </button>
                        <button type="submit" class="btn btn-primary" id="submitExamsBtn">
                            <i class="fas fa-save"></i> שמור עדכונים בשרת
                        </button>
                    </div>
                </form>
            </div>
        `;

        this.container.innerHTML = html;
        this.attachPortalEvents();
    }

    attachPortalEvents() {
        document.getElementById('switchStudentBtn').addEventListener('click', () => {
            if (this.onSwitchCallback) this.onSwitchCallback();
        });

        document.getElementById('openHistoryModalBtn').addEventListener('click', () => {
            this.openHistoryModal();
        });

        document.getElementById('addRowBtn').addEventListener('click', () => {
            this.addExamRow();
        });

        const container = document.getElementById('examRowsContainer');

        container.addEventListener('input', (e) => {
            if (e.target.classList.contains('exam-code-input')) {
                const input = e.target;
                const code = input.value.trim();
                const row = input.closest('.exam-row-item');
                const resultsContainer = row.querySelector('.exam-search-results');

                if (code.length === 0) {
                    resultsContainer.innerHTML = '';
                    resultsContainer.classList.add('hidden');
                } else {
                    const filtered = this.allExams.filter(ex => {
                        const codeMatch = ex.exam_code.includes(code);
                        const details = ex.details || {};
                        const textMatch = Object.values(details).some(val => 
                            String(val).includes(code)
                        );
                        return codeMatch || textMatch;
                    }).slice(0, 10);

                    if (filtered.length > 0) {
                        resultsContainer.innerHTML = filtered.map(ex => {
                            let desc = '';
                            if (ex.details) {
                                desc = Object.values(ex.details)
                                    .filter(val => val !== null && val !== '')
                                    .join(' | ');
                            }
                            return `
                                <div class="exam-result-item" data-code="${ex.exam_code}">
                                    <div class="exam-result-desc">${desc}</div>
                                    <div class="exam-result-code">${ex.exam_code}</div>
                                </div>
                            `;
                        }).join('');
                    } else {
                        resultsContainer.innerHTML = '<div class="no-results" style="padding:10px;text-align:center;color:#a3aed1;">לא נמצאו מבחנים</div>';
                    }
                    resultsContainer.classList.remove('hidden');
                }

                let warningEl = row.querySelector('.inline-exam-warning');
                const existingExams = this.currentStudent.exams_details || [];
                const found = existingExams.find(ex => ex.exam_code === code);

                if (code && found) {
                    if (!warningEl) {
                        warningEl = document.createElement('div');
                        warningEl.className = 'inline-exam-warning';
                        input.closest('.exam-code-group').appendChild(warningEl);
                    }
                    const statusText = found.passed ? 'עבר' : 'לא עבר';
                    warningEl.innerHTML = `<i class="fas fa-exclamation-triangle"></i> מבחן זה כבר קיים בהיסטוריה (${statusText})`;
                } else {
                    if (warningEl) warningEl.remove();
                }
            }
        });

        container.addEventListener('click', (e) => {
            const resultItem = e.target.closest('.exam-result-item');
            if (resultItem) {
                const code = resultItem.dataset.code;
                const searchContainer = resultItem.closest('.exam-search-container');
                const input = searchContainer.querySelector('.exam-code-input');
                
                input.value = code;
                searchContainer.querySelector('.exam-search-results').classList.add('hidden');
                
                input.dispatchEvent(new Event('input', { bubbles: true }));
                return;
            }

            const toggleBtn = e.target.closest('.toggle-btn');
            if (toggleBtn) {
                const group = toggleBtn.closest('.toggle-group');
                group.querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('active'));
                toggleBtn.classList.add('active');
            }

            const removeBtn = e.target.closest('.remove-row-btn');
            if (removeBtn) {
                const row = removeBtn.closest('.exam-row-item');
                row.remove();
                this.updateRemoveButtonsState();
            }
        });

        document.getElementById('multiExamForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            await this.submitExams();
        });
    }

    addExamRow() {
        const container = document.getElementById('examRowsContainer');
        const newRow = document.createElement('div');
        newRow.className = 'exam-row-item';
        newRow.innerHTML = `
            <div class="form-group exam-code-group exam-search-container">
                <input type="text" class="exam-code-input" required placeholder="הקלד קוד או נושא לחיפוש..." autocomplete="off">
                <div class="exam-search-results hidden"></div>
            </div>
            <div class="form-group exam-status-group">
                <div class="toggle-group">
                    <button type="button" class="toggle-btn pass-btn active" data-value="true">
                        <i class="fas fa-check"></i> עבר
                    </button>
                    <button type="button" class="toggle-btn fail-btn" data-value="false">
                        <i class="fas fa-times"></i> לא עבר
                    </button>
                </div>
            </div>
            <div class="form-group action-group">
                <button type="button" class="btn-icon-danger remove-row-btn" title="הסר שורה">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        `;
        container.appendChild(newRow);
        this.updateRemoveButtonsState();
    }

    updateRemoveButtonsState() {
        const rows = document.querySelectorAll('.exam-row-item');
        rows.forEach((row) => {
            const btn = row.querySelector('.remove-row-btn');
            if (btn) btn.disabled = rows.length === 1;
        });
    }

    async submitExams() {
        const submitBtn = document.getElementById('submitExamsBtn');
        const feedbackBox = document.getElementById('serverFeedback');
        
        const rows = document.querySelectorAll('.exam-row-item');
        const examsPayload = [];

        rows.forEach(row => {
            const code = row.querySelector('.exam-code-input').value.trim();
            const activeToggle = row.querySelector('.toggle-btn.active');
            const passed = activeToggle.dataset.value === 'true';
            if (code) {
                examsPayload.push({ exam_code: code, passed: passed });
            }
        });

        if (examsPayload.length === 0) return;

        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin">...</i> מעדכן בשרת...';
        feedbackBox.className = 'server-feedback hidden';

        try {
            const response = await fetch(`${this.apiBase}/student-exams`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    student_code: this.currentStudent.student_code,
                    exams: examsPayload
                })
            });

            if (response.ok) {
                const result = await response.json();
                this.renderServerFeedback(result);
                
                await this.loadStudentData(this.currentStudent.student_code, true);
                
                document.getElementById('examRowsContainer').innerHTML = `
                    <div class="exam-row-item">
                        <div class="form-group exam-code-group exam-search-container">
                            <input type="text" class="exam-code-input" required placeholder="הקלד קוד או נושא לחיפוש..." autocomplete="off">
                            <div class="exam-search-results hidden"></div>
                        </div>
                        <div class="form-group exam-status-group">
                            <div class="toggle-group">
                                <button type="button" class="toggle-btn pass-btn active" data-value="true">
                                    <i class="fas fa-check"></i> עבר
                                </button>
                                <button type="button" class="toggle-btn fail-btn" data-value="false">
                                    <i class="fas fa-times"></i> לא עבר
                                </button>
                            </div>
                        </div>
                        <div class="form-group action-group">
                            <button type="button" class="btn-icon-danger remove-row-btn" disabled title="הסר שורה">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    </div>
                `;
            } else {
                throw new Error('שגיאת שרת');
            }
        } catch (error) {
            feedbackBox.className = 'server-feedback error-box';
            feedbackBox.innerHTML = '<i class="fas fa-exclamation-triangle"></i> שגיאת תקשורת מול השרת בשמירת הנתונים.';
            feedbackBox.classList.remove('hidden');
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<i class="fas fa-save"></i> שמור עדכונים בשרת';
        }
    }

    renderServerFeedback(res) {
        const box = document.getElementById('serverFeedback');
        let html = '<h4>תוצאות פעולת העדכון מול השרת:</h4><div class="feedback-lists">';

        if (res.updated && res.updated.length > 0) {
            html += `<div class="feedback-group success-group">
                <strong><i class="fas fa-check-circle"></i> עודכנו בהצלחה (${res.updated.length}):</strong>
                <ul>${res.updated.map(item => `<li>מבחן ${item.exam_code} - ${item.status}</li>`).join('')}</ul>
            </div>`;
        }

        if (res.skipped && res.skipped.length > 0) {
            html += `<div class="feedback-group warning-group">
                <strong><i class="fas fa-info-circle"></i> דולגו (${res.skipped.length}):</strong>
                <ul>${res.skipped.map(item => `<li>מבחן ${item.exam_code}: ${item.reason}</li>`).join('')}</ul>
            </div>`;
        }

        if (res.errors && res.errors.length > 0) {
            html += `<div class="feedback-group error-group">
                <strong><i class="fas fa-times-circle"></i> שגיאות (${res.errors.length}):</strong>
                <ul>${res.errors.map(item => `<li>מבחן ${item.exam_code}: ${item.reason}</li>`).join('')}</ul>
            </div>`;
        }

        html += '</div>';
        box.innerHTML = html;
        box.className = 'server-feedback active';
    }

    setupModalEvents() {
        const modal = document.getElementById('historyModal');
        const closeBtn = document.getElementById('closeModalBtn');

        closeBtn.addEventListener('click', () => {
            modal.classList.add('hidden');
        });

        window.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.classList.add('hidden');
            }
        });
    }

    openHistoryModal() {
        const modal = document.getElementById('historyModal');
        const body = document.getElementById('modalHistoryBody');
        const exams = this.currentStudent.exams_details || [];
        const totalReward = this.currentStudent.total_reward || 0;

        if (exams.length === 0) {
            body.innerHTML = '<div style="padding:20px;text-align:center;"><p class="text-muted">אין עדיין היסטוריית מבחנים רשומה לתלמיד זה.</p></div>';
        } else {
            // הוספת סטטיסטיקה למעלה וטבלה חכמה עם פירוט
            body.innerHTML = `
                <div class="history-summary">
                    <div class="summary-card">
                        <span class="summary-label">סך הכל מבחנים:</span>
                        <span class="summary-value">${exams.length}</span>
                    </div>
                    <div class="summary-card">
                        <span class="summary-label">סך הכל ניקוד:</span>
                        <span class="summary-value">${totalReward.toFixed(1)}</span>
                    </div>
                </div>
                <div class="table-container">
                    <table class="modern-table sticky-header">
                        <thead>
                            <tr>
                                <th>קוד</th>
                                <th>סוג</th>
                                <th>פרטים</th>
                                <th>ניקוד</th>
                                <th>סטטוס</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${exams.map(ex => {
                                let detailsText = 'ללא פרטים';
                                if (ex.details) {
                                    if (ex.exam_type === 'mishnayot') {
                                        detailsText = `${ex.details.masechet || ''} - פרק ${ex.details.chapter_name || ''} (${ex.details.total_mishnayot} יח')`;
                                    } else if (ex.exam_type === 'gemara') {
                                        detailsText = `${ex.details.masechet || ''} (${ex.details.gemara_pages || 0} דפים)`;
                                    } else {
                                        detailsText = Object.values(ex.details).join(', ');
                                    }
                                }
                                
                                const typeLabel = ex.exam_type === 'mishnayot' ? 'משניות' : (ex.exam_type === 'gemara' ? 'גמרא' : 'כללי');
                                const typeClass = ex.exam_type === 'mishnayot' ? 'type-mishnayot' : 'type-gemara';

                                return `
                                <tr>
                                    <td><strong>${ex.exam_code}</strong></td>
                                    <td><span class="type-badge ${typeClass}">${typeLabel}</span></td>
                                    <td class="exam-details-cell" title="${detailsText}">${detailsText}</td>
                                    <td><span class="reward-badge">${ex.reward ? ex.reward.toFixed(1) : '-'}</span></td>
                                    <td>
                                        <span class="status-pill ${ex.passed ? 'success' : 'danger'}">
                                            <i class="fas ${ex.passed ? 'fa-check' : 'fa-times'}"></i>
                                        </span>
                                    </td>
                                </tr>
                                `;
                            }).join('')}
                        </tbody>
                    </table>
                </div>
            `;
        }

        modal.classList.remove('hidden');
    }

    showError(msg) {
        this.container.innerHTML = `<div class="card error-card"><i class="fas fa-exclamation-circle fa-2x"></i><p>${msg}</p></div>`;
    }
}
