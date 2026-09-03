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
                        <h3><i class="fas fa-print"></i> תצוגה מקדימה להדפסה / ייצוא</h3>
                        <div style="display:flex; gap:10px; align-items:center;">
                            <button class="btn btn-outline btn-sm" id="exportReportCsvBtn"><i class="fas fa-file-excel"></i> ייצא נתונים לאקסל</button>
                            <button class="btn btn-primary btn-sm" onclick="window.print()"><i class="fas fa-file-pdf"></i> הדפס / שמור כ-PDF</button>
                            <button class="close-modal-btn" onclick="document.getElementById('printReportModal').classList.add('hidden')">&times;</button>
                        </div>
                    </div>
                    <div class="modal-body" id="printReportBody" style="padding: 20px; overflow-y: auto; background: #e2e8f0;">
                        <!-- הדוחות ייכנסו לכאן -->
                    </div>
                </div>
            </div>`;
            document.body.insertAdjacentHTML('beforeend', modalHtml);
            
            document.getElementById('exportReportCsvBtn').addEventListener('click', () => {
                if(this.lastRenderedStudents) {
                    this.exportToExcel(this.lastRenderedStudents);
                }
            });
        }
    }

    getHebrewDate() {
        try {
            return new Intl.DateTimeFormat('he-IL-u-ca-hebrew', {
                year: 'numeric', month: 'long', day: 'numeric'
            }).format(new Date());
        } catch (e) {
            return new Date().toLocaleDateString('he-IL');
        }
    }

    renderView() {
        const html = `
            <div class="card error-card no-print" style="margin-bottom: 15px; background-color: #fffbeb; border-color: #fde68a; color: #b45309;">
                <i class="fas fa-tools"></i> <strong>הודעת מערכת:</strong> מודול הפקת הדוחות נמצא בפיתוח ועדיין לא הושלם במלואו. ייתכנו שינויים בעיצוב.
            </div>

            <div class="card compact-card no-print" style="margin-bottom: 20px;">
                <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border-color); padding-bottom: 10px; margin-bottom: 15px;">
                    <h3 style="margin: 0;"><i class="fas fa-file-invoice"></i> הפקת דוחות תלמידים (מותאם להדפסה)</h3>
                </div>
                
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px;">
                    <!-- הגדרות דוח -->
                    <div style="background: var(--bg-color); padding: 15px; border-radius: 6px; border: 1px solid var(--border-color);">
                        <h4 style="margin-bottom: 10px; font-size: 0.95rem;"><i class="fas fa-cog"></i> הגדרות תצוגת דוח</h4>
                        <div style="display: flex; flex-direction: column; gap: 10px;">
                            <label style="font-size: 0.85rem; cursor: pointer;">
                                <input type="checkbox" id="repConfCode" checked> הצג קוד תלמיד בדוח
                            </label>
                            <label style="font-size: 0.85rem; cursor: pointer;">
                                <input type="checkbox" id="repConfExamCode" checked> הצג עמודת קוד מבחן בטבלה
                            </label>
                            <label style="font-size: 0.85rem; cursor: pointer;">
                                גודל דף בהדפסה: 
                                <select id="repConfSize" style="padding: 4px; border-radius: 4px; border: 1px solid #ccc;">
                                    <option value="A5">A5 (מומלץ - קומפקטי)</option>
                                    <option value="A4">A4 (רגיל)</option>
                                </select>
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

    async generateAndShowReport(studentCodesArray) {
        const btn = document.getElementById('generateClassReportBtn');
        const originalText = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> מושך נתונים...';
        btn.disabled = true;

        try {
            const response = await fetch(`${this.apiBase}/students?full_details=true`);
            if (response.ok) {
                const freshStudents = await response.json();
                this.allStudents = freshStudents; 
                
                const selectedStudents = freshStudents.filter(s => studentCodesArray.includes(s.student_code));
                this.lastRenderedStudents = selectedStudents; 
                this.buildReportHtml(selectedStudents);
            } else {
                alert('שגיאה במשיכת נתונים מהשרת.');
            }
        } catch (error) {
            alert('שגיאת תקשורת.');
        } finally {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    }

    buildReportHtml(students) {
        const confStudentCode = document.getElementById('repConfCode').checked;
        const confExamCode = document.getElementById('repConfExamCode').checked;
        const confSize = document.getElementById('repConfSize').value; 
        
        const hebrewDate = this.getHebrewDate();

        let completeHtml = '';

        students.forEach((student, index) => {
            let exams = student.exams_details || [];
            const totalReward = student.total_reward || 0;
            const passed = exams.filter(e => e.passed).length;
            const pageBreakClass = index < students.length - 1 ? 'page-break' : '';

            let tableHtml = '<p style="text-align:center; color:#555; padding: 20px;">לא נרשמו מבחנים לתלמיד זה.</p>';
            if (exams.length > 0) {
                tableHtml = `
                    <table style="width: 100%; text-align: right; border-collapse: collapse; font-size: 0.85rem; margin-top: 15px;">
                        <thead>
                            <tr style="border-bottom: 2px solid #000;">
                                ${confExamCode ? '<th style="padding: 6px; font-weight: bold; color: #000;">קוד</th>' : ''}
                                <th style="padding: 6px; font-weight: bold; color: #000;">מבחן</th>
                                <th style="padding: 6px; font-weight: bold; color: #000;">הישג</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${exams.map(ex => {
                                let desc = ex.details ? Object.values(ex.details).filter(v => v !== null && v !== '').join(' - ') : ex.exam_code;
                                const statusText = ex.passed ? '<strong>עבר</strong>' : '<span style="color:#555; text-decoration:underline;">לא עבר</span>';
                                return `
                                <tr style="border-bottom: 1px dashed #ccc;">
                                    ${confExamCode ? `<td style="padding: 6px; color: #000;">${ex.exam_code}</td>` : ''}
                                    <td style="padding: 6px; color: #000;">${desc}</td>
                                    <td style="padding: 6px; color: #000;">${statusText}</td>
                                </tr>`;
                            }).join('')}
                        </tbody>
                    </table>
                `;
            }

            // הקצאת רוחב מדויק בהתאם להגדרה (בהדפסה ייכנס לעמוד)
            const styleSize = confSize === 'A5' ? 'max-width: 148mm;' : 'max-width: 210mm;';

            completeHtml += `
                <div class="print-container ${pageBreakClass}" data-size="${confSize}" style="background: white; padding: 20px 30px; margin: 0 auto 20px auto; font-family: Arial, sans-serif; color: #000; border: 1px solid #ddd; ${styleSize}">
                    
                    <div style="text-align: center; border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 20px;">
                        <h2 style="margin: 0 0 5px 0; font-size: 1.6rem; font-weight: 800;">${student.first_name} ${student.last_name}</h2>
                        <h3 style="margin: 0; font-size: 1.1rem; font-weight: normal;">דוח סיכום מבחנים</h3>
                        <div style="display: flex; justify-content: space-between; font-size: 0.8rem; margin-top: 15px;">
                            <span>${confStudentCode ? `קוד: <strong>${student.student_code}</strong>` : ''} | כיתה: <strong>${student.class_grade || '-'}</strong></span>
                            <span>תאריך הפקה: <strong>${hebrewDate}</strong></span>
                        </div>
                    </div>
                    
                    <div style="display: flex; justify-content: space-around; margin-bottom: 20px; border: 1px solid #000; padding: 10px; border-radius: 4px;">
                        <div style="text-align: center;">
                            <span style="font-size: 0.8rem;">מבחנים רשומים</span><br>
                            <span style="font-size: 1.3rem; font-weight: bold;">${exams.length}</span>
                        </div>
                        <div style="border-right: 1px solid #ccc;"></div>
                        <div style="text-align: center;">
                            <span style="font-size: 0.8rem;">הצלחות</span><br>
                            <span style="font-size: 1.3rem; font-weight: bold;">${passed}</span>
                        </div>
                        <div style="border-right: 1px solid #ccc;"></div>
                        <div style="text-align: center;">
                            <span style="font-size: 0.8rem;">סך מלגה</span><br>
                            <span style="font-size: 1.3rem; font-weight: bold;">₪${totalReward.toFixed(1)}</span>
                        </div>
                    </div>

                    <div>${tableHtml}</div>
                    
                    <div style="margin-top: 30px; text-align: center; font-size: 0.75rem; color: #555; border-top: 1px solid #000; padding-top: 10px;">
                        הופק באמצעות מערכת ניהול דוחות
                    </div>
                </div>
            `;
        });

        document.getElementById('printReportBody').innerHTML = completeHtml;
        document.getElementById('printReportModal').classList.remove('hidden');
    }

    exportToExcel(students) {
        let csvContent = '\uFEFF'; 
        csvContent += 'קוד תלמיד,שם פרטי,שם משפחה,כיתה,קוד מבחן,פירוט,סטטוס,שווי\n';

        students.forEach(student => {
            const exams = student.exams_details || [];
            if (exams.length === 0) {
                csvContent += `"${student.student_code}","${student.first_name}","${student.last_name}","${student.class_grade || ''}","ללא מבחנים","","",""\n`;
            } else {
                exams.forEach(ex => {
                    let desc = ex.details ? Object.values(ex.details).filter(v => v !== null && v !== '').join(' - ') : ex.exam_code;
                    let status = ex.passed ? 'עבר' : 'לא עבר';
                    let reward = ex.reward || 0;
                    csvContent += `"${student.student_code}","${student.first_name}","${student.last_name}","${student.class_grade || ''}","${ex.exam_code}","${desc}","${status}","${reward}"\n`;
                });
            }
        });

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", `דוחות_תלמידים_${new Date().toISOString().slice(0,10)}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
}
