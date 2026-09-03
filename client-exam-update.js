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
                this.showError('שגיאת תקשורת במערכת.');
            }
        }
    }

    updateHistoryButtonCount() {
        const btn = document.getElementById('openHistoryModalBtn');
        if (btn && this.currentStudent && this.currentStudent.exams_details) {
            btn.innerHTML = `<i class="fas fa-history"></i> היסטוריה (${this.currentStudent.exams_details.length})`;
        }
    }

    formatExamDesc(ex) {
        if (!ex.details) return 'ללא פרטים נוספים';
        return Object.values(ex.details).filter(val => val !== null && val !== '').join(' | ');
    }

    renderPortal() {
        const s = this.currentStudent;
        const exams = s.exams_details || [];
        const examsCount = exams.length;
        const totalReward = s.total_reward || 0;
        
        const passedCount = exams.filter(e => e.passed).length;
        const failedCount = examsCount - passedCount;
        
        const html = `
            <div class="card student-top-card compact-card">
                <div class="student-info-left">
                    <div class="avatar"><i class="fas fa-user-graduate"></i></div>
                    <div>
                        <h2>${s.first_name} ${s.last_name}</h2>
                        <div class="profile-badges">
                            <span class="badge">כיתה: ${s.class_grade || '-'}</span>
                            <span class="badge">קוד: ${s.student_code}</span>
                            <span class="badge badge-info">מבחנים: ${examsCount}</span>
                            <span class="badge badge-success">עברו: ${passedCount}</span>
                            <span class="badge badge-danger">לא עברו: ${failedCount}</span>
                            <span class="badge badge-primary">נצבר: ₪${totalReward.toFixed(1)}</span>
                        </div>
                    </div>
                </div>
                <div class="student-top-actions">
                    <button class="btn btn-secondary btn-sm" id="openHistoryModalBtn">
                        <i class="fas fa-history"></i> היסטוריה (${examsCount})
                    </button>
                    <button class="btn btn-outline btn-sm" id="switchStudentBtn">
                        <i class="fas fa-exchange-alt"></i> החלף תלמיד
                    </button>
                </div>
            </div>

            <div class="card exam-form-card compact-card">
                <div class="form-header-actions compact-header" style="align-items: center;">
                    <div class="header-title-row">
                        <h3><i class="fas fa-file-signature"></i> דיווח והזנת מבחנים</h3>
                        <p class="text-muted" style="margin-bottom: 2px;">בחר קוד וסטטוס (עבר/לא עבר). חובה לבחור את הסטטוס.</p>
                        <p style="color: #b45309; font-size: 0.8rem; font-weight: 500;"><i class="fas fa-info-circle"></i> שים לב: הנתונים לא נשמרים עד לחיצה על לחצן השמירה.</p>
                    </div>
                    <div style="display: flex; gap: 10px; align-items: center;">
                        <button type="button" class="btn btn-dashed btn-sm" id="addRowBtn" style="margin: 0; border-color: var(--primary-color); color: var(--primary-color);">
                            <i class="fas fa-plus"></i> הוסף שורה
                        </button>
                        <button type="submit" form="multiExamForm" class="btn btn-primary" id="submitExamsBtn" disabled>
                            <i class="fas fa-save"></i> שמור עדכונים במערכת
                        </button>
                    </div>
                </div>
                
                <form id="multiExamForm" class="modern-form">
                    <div id="examRowsContainer">
                        ${this.generateEmptyRowHtml()}
                    </div>

                    <div>
                        <div id="serverFeedback" class="server-feedback hidden"></div>
                    </div>
                </form>
            </div>
        `;

        this.container.innerHTML = html;
        this.attachPortalEvents();
        this.updateSaveButtonCount();
    }

    // שים לב: ללא מחלקת active כברירת מחדל בכפתורי עבר/לא עבר
    generateEmptyRowHtml() {
        return `
            <div class="exam-row-item">
                <div class="form-group exam-code-group exam-search-container">
                    <input type="text" class="exam-code-input" required placeholder="חיפוש קוד או נושא..." autocomplete="off">
                    <div class="exam-selected-details" style="font-size:0.85rem; color:var(--text-muted); margin-top:4px; min-height:18px;"></div>
                    <div class="exam-search-results hidden"></div>
                </div>
                
                <div class="warning-container"></div>
                
                <div class="form-group exam-status-group">
                    <div class="toggle-group">
                        <button type="button" class="toggle-btn pass-btn" data-value="true">
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
    }

    updateSaveButtonCount() {
        const rows = Array.from(document.querySelectorAll('.exam-row-item'));
        let validCount = 0;
        let hasPartialInvalid = false; 

        rows.forEach(row => {
            const input = row.querySelector('.exam-code-input');
            const code = input ? input.value.trim() : '';
            const hasStatus = row.querySelector('.toggle-btn.active') !== null;
            
            if (code !== '' && hasStatus) {
                validCount++;
            } else if (code !== '' || hasStatus) {
                hasPartialInvalid = true; 
            }
        });

        const btn = document.getElementById('submitExamsBtn');
        if (btn) {
            if (validCount > 0 && !hasPartialInvalid) {
                btn.innerHTML = `<i class="fas fa-save"></i> שמור ${validCount} ${validCount === 1 ? 'עדכון' : 'עדכונים'} במערכת`;
                btn.disabled = false;
            } else {
                btn.innerHTML = `<i class="fas fa-save"></i> שמור עדכונים במערכת`;
                btn.disabled = true;
            }
        }
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
                const searchContainer = row.querySelector('.exam-search-container');
                const resultsContainer = searchContainer.querySelector('.exam-search-results');
                const warningContainer = row.querySelector('.warning-container');
                const detailsDiv = searchContainer.querySelector('.exam-selected-details');

                const exactExam = this.allExams.find(ex => ex.exam_code === code);
                if (detailsDiv) {
                    detailsDiv.innerText = exactExam ? this.formatExamDesc(exactExam) : '';
                }

                if (code.length === 0) {
                    resultsContainer.innerHTML = '';
                    resultsContainer.classList.add('hidden');
                    row.querySelector('.toggle-btn.pass-btn').classList.remove('active');
                    row.querySelector('.toggle-btn.fail-btn').classList.remove('active');
                } else {
                    const filtered = this.allExams.filter(ex => {
                        const codeMatch = ex.exam_code.includes(code);
                        const details = ex.details || {};
                        const textMatch = Object.values(details).some(val => String(val).includes(code));
                        return codeMatch || textMatch;
                    }).slice(0, 10);

                    if (filtered.length > 0) {
                        resultsContainer.innerHTML = filtered.map(ex => {
                            let desc = this.formatExamDesc(ex);
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

                const existingExams = this.currentStudent.exams_details || [];
                const found = existingExams.find(ex => ex.exam_code === code);

                if (code && found) {
                    row.classList.add('has-warning');
                    const statusText = found.passed ? 'עבר' : 'לא עבר';
                    warningContainer.innerHTML = `<i class="fas fa-exclamation-triangle"></i> כבר עודכן (${statusText})`;
                } else {
                    row.classList.remove('has-warning');
                    warningContainer.innerHTML = '';
                }

                this.updateSaveButtonCount();
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
                this.updateSaveButtonCount();
            }

            const removeBtn = e.target.closest('.remove-row-btn');
            if (removeBtn) {
                const row = removeBtn.closest('.exam-row-item');
                row.remove();
                this.updateRemoveButtonsState();
                this.updateSaveButtonCount();
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
        newRow.innerHTML = this.generateEmptyRowHtml();
        while (newRow.firstChild) {
            container.appendChild(newRow.firstChild);
        }
        this.updateRemoveButtonsState();
        this.updateSaveButtonCount();
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
            if (code && activeToggle) {
                const passed = activeToggle.dataset.value === 'true';
                examsPayload.push({ exam_code: code, passed: passed });
            }
        });

        if (examsPayload.length === 0) return;

        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> מעדכן...';
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
                document.getElementById('examRowsContainer').innerHTML = this.generateEmptyRowHtml();
            } else {
                throw new Error('שגיאת מערכת');
            }
        } catch (error) {
            feedbackBox.className = 'server-feedback error-box';
            feedbackBox.innerHTML = '<i class="fas fa-exclamation-triangle"></i> שגיאת תקשורת במערכת, הנתונים לא נשמרו.';
            feedbackBox.classList.remove('hidden');
        } finally {
            this.updateRemoveButtonsState();
            this.updateSaveButtonCount();
        }
    }

    renderServerFeedback(res) {
        const box = document.getElementById('serverFeedback');
        let html = '<h4 style="margin-bottom:6px;">סיכום עדכון:</h4><div class="feedback-lists">';
        if (res.updated && res.updated.length > 0) {
            html += `<div class="feedback-group success-group">
                <strong><i class="fas fa-check-circle"></i> נקלט בהצלחה (${res.updated.length}):</strong>
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
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                modal.classList.add('hidden');
            });
        }
    }

    openHistoryModal() {
        const modal = document.getElementById('historyModal');
        const body = document.getElementById('modalHistoryBody');
        const exams = this.currentStudent.exams_details || [];
        const totalReward = this.currentStudent.total_reward || 0;

        if (exams.length === 0) {
            body.innerHTML = '<div style="padding:20px;text-align:center;"><p class="text-muted">אין עדיין היסטוריית מבחנים רשומה לתלמיד זה.</p></div>';
        } else {
            body.innerHTML = `
                <div class="history-summary">
                    <div class="summary-card">
                        <span class="summary-label">סך הכל מבחנים:</span>
                        <span class="summary-value">${exams.length}</span>
                    </div>
                    <div class="summary-card">
                        <span class="summary-label">סך הכל כסף:</span>
                        <span class="summary-value text-primary">₪${totalReward.toFixed(1)}</span>
                    </div>
                </div>
                <div class="table-container">
                    <table class="modern-table sticky-header">
                        <thead>
                            <tr>
                                <th>קוד</th>
                                <th>פרטים</th>
                                <th>סטטוס</th>
                                <th>כסף (₪)</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${exams.map(ex => {
                                let detailsText = this.formatExamDesc(ex);
                                return `
                                <tr>
                                    <td><strong>${ex.exam_code}</strong></td>
                                    <td class="exam-details-cell" title="${detailsText}">${detailsText}</td>
                                    <td>
                                        <span class="status-pill ${ex.passed ? 'success' : 'danger'}">
                                            <i class="fas ${ex.passed ? 'fa-check' : 'fa-times'}"></i> ${ex.passed ? 'עבר' : 'לא עבר'}
                                        </span>
                                    </td>
                                    <td><span class="reward-badge">₪${ex.reward ? ex.reward.toFixed(1) : '0.0'}</span></td>
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
