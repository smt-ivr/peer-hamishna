export class ReportManager {
    constructor(container, apiBase) {
        this.container = container;
        this.apiBase = apiBase;
        this.allStudents = [];
        this.classes = new Set();
        this.injectModal();
    }

    setStudents(students) {
        this.allStudents = students;
        this.classes = new Set(this.allStudents.map(s => s.class_grade).filter(Boolean).sort());
        this.renderView();
    }

    injectModal() {
        if (!document.getElementById('printReportModal')) {
            const modalHtml = `
            <div id="printReportModal" class="modal hidden no-print" style="z-index: 9999;">
                <div class="modal-content" style="max-width: 800px; height: 90vh; background: #e2e8f0;">
                    <div class="modal-header no-print" style="background: white;">
                        <h3><i class="fas fa-print"></i> תצוגה מקדימה להדפסה</h3>
                        <div style="display:flex; gap:10px; align-items:center;">
                            <button class="btn btn-primary btn-sm" onclick="window.print()"><i class="fas fa-file-pdf"></i> הדפס / PDF</button>
                            <button class="close-modal-btn" onclick="document.getElementById('printReportModal').classList.add('hidden')">&times;</button>
                        </div>
                    </div>
                    <div class="modal-body" id="printReportBody" style="padding: 20px; overflow-y: auto;">
                        <!-- הדוחות ייכנסו לכאן -->
                    </div>
                </div>
            </div>`;
            document.body.insertAdjacentHTML('beforeend', modalHtml);
        }
    }

    renderView() {
        const html = `
            <div class="card compact-card" style="margin-bottom: 20px;">
                <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border-color); padding-bottom: 10px; margin-bottom: 15px;">
                    <h3 style="margin: 0;"><i class="fas fa-file-invoice"></i> הפקת דוחות וציונים</h3>
                </div>
                
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px;">
                    <!-- הגדרות דוח -->
                    <div style="background: var(--bg-color); padding: 15px; border-radius: 6px; border: 1px solid var(--border-color);">
                        <h4 style="margin-bottom: 10px; font-size: 0.95rem;"><i class="fas fa-cog"></i> הגדרות תצוגת דוח (מצומצם)</h4>
                        <div style="display: flex; flex-direction: column; gap: 8px;">
                            <label style="font-size: 0.85rem; cursor: pointer;">
                                <input type="checkbox" id="repConfCode" checked> הצג עמודת קוד מבחן
                            </label>
                            <label style="font-size: 0.85rem; cursor: pointer;">
                                <input type="checkbox" id="repConfReward" checked> הצג עמודת שווי (₪)
                            </label>
                            <label style="font-size: 0.85rem; cursor: pointer;">
                                <input type="checkbox" id="repConfOnlyPassed" checked> סנן מבחנים שלא עברו
                            </label>
                        </div>
                    </div>

                    <!-- הפקה -->
                    <div style="display: flex; flex-direction: column; gap: 15px;">
                        <div style="background: var(--bg-color); padding: 15px; border-radius: 6px; border: 1px solid var(--border-color);">
                            <h4 style="margin-bottom: 10px; font-size: 0.95rem;">דוח לתלמיד בודד</h4>
                            <div class="search-box">
                                <i class="fas fa-search search-icon"></i>
                                <input type="text" id="reportStudentSearch" placeholder="חיפוש קוד או שם..." autocomplete="off" style="width: 100%; padding: 6px 30px 6px 10px;">
                                <div id="reportSearchResults" class="search-results-dropdown hidden"></div>
                            </div>
                        </div>

                        <div style="background: var(--bg-color); padding: 15px; border-radius: 6px; border: 1px solid var(--border-color);">
                            <h4 style="margin-bottom: 10px; font-size: 0.95rem;">דוח מרוכז לכיתה שלמה</h4>
                            <div style="display: flex; gap: 10px;">
                                <select id="reportClassSelect" style="flex:1; padding: 6px; border: 1px solid var(--border-color); border-radius: 4px; background: white;">
                                    <option value="">-- בחר כיתה --</option>
                                    ${Array.from(this.classes).map(c => `<option value="${c}">כיתה ${c}</option>`).join('')}
                                </select>
                                <button class="btn btn-primary" id="generateClassReportBtn">הפק לכיתה</button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        this.container.innerHTML = html;
        this.attachSearchEvents();
    }

    attachSearchEvents() {
        const searchInput = document.getElementById('reportStudentSearch');
        const resultsDropdown = document.getElementById('reportSearchResults');

        searchInput.addEventListener('input', (e) => {
            const term = e.target.value.trim().toLowerCase();
            if (term.length === 0) {
                resultsDropdown.innerHTML = '';
                resultsDropdown.classList.add('hidden');
                return;
            }

            const filtered = this.allStudents.filter(s => 
                s.student_code.toLowerCase().includes(term) || 
                s.first_name.toLowerCase().includes(term) || 
                s.last_name.toLowerCase().includes(term) ||
                `${s.first_name} ${s.last_name}`.toLowerCase().includes(term)
            ).slice(0, 10);

            resultsDropdown.innerHTML = '';
            if (filtered.length === 0) {
                resultsDropdown.innerHTML = '<div style="padding:10px;text-align:center;">לא נמצאו תלמידים</div>';
            } else {
                filtered.forEach(student => {
                    const item = document.createElement('div');
                    item.className = 'search-result-item';
                    item.innerHTML = `<span class="result-name">${student.first_name} ${student.last_name}</span> <span class="result-code">${student.student_code}</span>`;
                    
                    item.addEventListener('click', () => {
                        searchInput.value = '';
                        resultsDropdown.classList.add('hidden');
                        this.generateAndShowReport([student.student_code]);
                    });
                    resultsDropdown.appendChild(item);
                });
            }
            resultsDropdown.classList.remove('hidden');
        });

        document.addEventListener('click', (e) => {
            if (searchInput && !searchInput.contains(e.target) && resultsDropdown && !resultsDropdown.contains(e.target)) {
                resultsDropdown.classList.add('hidden');
            }
        });

        document.getElementById('generateClassReportBtn').addEventListener('click', () => {
            const cls = document.getElementById('reportClassSelect').value;
            if (!cls) return alert('נא לבחור כיתה');
            const studentCodes = this.allStudents.filter(s => s.class_grade === cls).map(s => s.student_code);
            if (studentCodes.length === 0) return alert('לא נמצאו תלמידים בכיתה זו');
            this.generateAndShowReport(studentCodes);
        });
    }

    // מושך נתונים טריים מהשרת כדי לוודא שהדוח עדכני
    async generateAndShowReport(studentCodesArray) {
        const btn = document.getElementById('generateClassReportBtn');
        const originalText = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> מושך נתונים...';
        btn.disabled = true;

        try {
            const response = await fetch(`${this.apiBase}/students?full_details=true`);
            if (response.ok) {
                const freshStudents = await response.json();
                this.allStudents = freshStudents; // עדכון הזיכרון המקומי
                
                const selectedStudents = freshStudents.filter(s => studentCodesArray.includes(s.student_code));
                this.buildReportHtml(selectedStudents);
            } else {
                alert('שגיאה במשיכת נתונים טריים מהשרת.');
            }
        } catch (error) {
            alert('שגיאת תקשורת.');
        } finally {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    }

    buildReportHtml(students) {
        const confCode = document.getElementById('repConfCode').checked;
        const confReward = document.getElementById('repConfReward').checked;
        const confOnlyPassed = document.getElementById('repConfOnlyPassed').checked;
        const currentDate = new Date().toLocaleDateString('he-IL');

        let completeHtml = '';

        students.forEach((student, index) => {
            let exams = student.exams_details || [];
            if (confOnlyPassed) exams = exams.filter(e => e.passed);
            const totalReward = student.total_reward || 0;
            const passed = exams.filter(e => e.passed).length;

            const pageBreakClass = index < students.length - 1 ? 'page-break' : '';

            let tableHtml = '<p style="text-align:center; color:#666; font-size:0.9rem; padding: 20px;">אין נתונים התואמים להגדרות.</p>';
            if (exams.length > 0) {
                tableHtml = `
                    <table style="width: 100%; text-align: right; border-collapse: collapse; font-size: 0.8rem;">
                        <thead>
                            <tr style="background-color: #f1f5f9; border-bottom: 2px solid #ccc;">
                                ${confCode ? '<th style="padding: 6px 4px; font-weight: bold; border: 1px solid #e2e8f0;">קוד</th>' : ''}
                                <th style="padding: 6px 4px; font-weight: bold; border: 1px solid #e2e8f0;">תיאור ומפרט</th>
                                <th style="padding: 6px 4px; font-weight: bold; border: 1px solid #e2e8f0;">סטטוס</th>
                                ${confReward ? '<th style="padding: 6px 4px; font-weight: bold; border: 1px solid #e2e8f0;">שווי (₪)</th>' : ''}
                            </tr>
                        </thead>
                        <tbody>
                            ${exams.map(ex => {
                                let desc = ex.details ? Object.values(ex.details).filter(v => v !== null && v !== '').join(' - ') : ex.exam_code;
                                return `
                                <tr>
                                    ${confCode ? `<td style="padding: 4px; border: 1px solid #e2e8f0;"><strong>${ex.exam_code}</strong></td>` : ''}
                                    <td style="padding: 4px; border: 1px solid #e2e8f0;">${desc}</td>
                                    <td style="padding: 4px; border: 1px solid #e2e8f0;">${ex.passed ? 'עבר' : 'לא עבר'}</td>
                                    ${confReward ? `<td style="padding: 4px; border: 1px solid #e2e8f0;">₪${(ex.reward || 0).toFixed(1)}</td>` : ''}
                                </tr>`;
                            }).join('')}
                        </tbody>
                    </table>
                `;
            }

            completeHtml += `
                <div class="print-container ${pageBreakClass}" style="background: white; padding: 25px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); margin-bottom: 20px; font-family: sans-serif; color: black; max-width: 800px; margin-left: auto; margin-right: auto;">
                    <div style="border-bottom: 2px solid #2563eb; padding-bottom: 10px; margin-bottom: 15px; display: flex; justify-content: space-between; align-items: flex-end;">
                        <div>
                            <h2 style="margin: 0; color: #2563eb; font-size: 1.4rem;">דוח התקדמות - ${student.first_name} ${student.last_name}</h2>
                            <div style="font-size: 0.85rem; color: #555; margin-top: 5px;">קוד: <strong>${student.student_code}</strong> | כיתה: <strong>${student.class_grade || '-'}</strong></div>
                        </div>
                        <div style="text-align: left; font-size: 0.8rem; color: #666;">
                            <div>תאריך הפקה: ${currentDate}</div>
                        </div>
                    </div>
                    
                    <div style="display: flex; gap: 10px; margin-bottom: 15px;">
                        <div style="flex: 1; background: #f8fafc; border: 1px solid #e2e8f0; padding: 10px; border-radius: 4px; text-align: center;">
                            <span style="font-size: 1.2rem; font-weight: bold;">${exams.length}</span><br>
                            <span style="font-size: 0.75rem; color: #666;">מבחנים רשומים</span>
                        </div>
                        ${confReward ? `
                        <div style="flex: 1; background: #eff6ff; border: 1px solid #bfdbfe; padding: 10px; border-radius: 4px; text-align: center;">
                            <span style="font-size: 1.2rem; font-weight: bold; color: #2563eb;">₪${totalReward.toFixed(1)}</span><br>
                            <span style="font-size: 0.75rem; color: #2563eb;">סך הכל מלגה</span>
                        </div>` : ''}
                    </div>

                    <div>${tableHtml}</div>
                </div>
            `;
        });

        document.getElementById('printReportBody').innerHTML = completeHtml;
        document.getElementById('printReportModal').classList.remove('hidden');
    }
}
