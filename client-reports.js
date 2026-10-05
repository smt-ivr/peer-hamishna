export class ReportManager {
    constructor(container, apiBase) {
        this.container = container;
        this.apiBase = apiBase;
        this.allStudents = [];
        this.allExams = [];
        this.classes = new Set();
        this.injectModal();
        this.logoUrl = 'https://smti.uk/img/peer.jpg';
    }

    setStudents(students) {
        this.allStudents = students;
        this.classes = new Set(this.allStudents.map(s => s.class_grade).filter(Boolean).sort());
        this.fetchExams();
    }

    async fetchExams() {
        try {
            const response = await fetch(`${this.apiBase}/exams`);
            if (response.ok) {
                this.allExams = await response.json();
                this.renderView();
            }
        } catch (error) {
            console.error('שגיאה במשיכת מבחנים לדוחות', error);
            this.renderView();
        }
    }

    injectModal() {
        if (!document.getElementById('printReportModal')) {
            const modalHtml = `
            <div id="printReportModal" class="modal hidden no-print" style="z-index: 9999;">
                <div class="modal-content" style="max-width: 900px; height: 95vh; background: #e2e8f0;">
                    <div class="modal-header no-print" style="background: white;">
                        <h3><i class="fas fa-print"></i> תצוגה מקדימה להדפסה / ייצוא</h3>
                        <div style="display:flex; gap:10px; align-items:center;">
                            <button class="btn btn-outline btn-sm" id="exportReportCsvBtn" title="ייצא טבלה לאקסל"><i class="fas fa-file-excel"></i> ייצוא אקסל</button>
                            <button class="btn btn-secondary btn-sm" id="directDownloadPdfBtn" title="הורד קובץ ישירות"><i class="fas fa-file-pdf"></i> הורד קובץ PDF</button>
                            <button class="btn btn-primary btn-sm" onclick="window.print()" title="הדפסה במדפסת"><i class="fas fa-print"></i> הדפסה</button>
                            <button class="close-modal-btn" onclick="document.getElementById('printReportModal').classList.add('hidden')">&times;</button>
                        </div>
                    </div>
                    <div class="modal-body" id="printReportBodyWrapper" style="padding: 20px; overflow-y: auto; background: #e2e8f0;">
                        <div id="printReportBody"></div>
                    </div>
                </div>
            </div>`;
            document.body.insertAdjacentHTML('beforeend', modalHtml);
            
            document.getElementById('exportReportCsvBtn').addEventListener('click', () => {
                if(this.lastRenderedStudents) this.exportToExcel(this.lastRenderedStudents);
            });

            document.getElementById('directDownloadPdfBtn').addEventListener('click', async () => {
                await this.downloadDirectPdf();
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
            <div class="card compact-card no-print" style="margin-bottom: 20px;">
                <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border-color); padding-bottom: 10px; margin-bottom: 15px;">
                    <h3 style="margin: 0;"><i class="fas fa-file-invoice"></i> הפקת דוחות תלמידים מקצועיים</h3>
                </div>
                
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px;">
                    <div style="background: var(--bg-color); padding: 15px; border-radius: 6px; border: 1px solid var(--border-color);">
                        <h4 style="margin-bottom: 10px; font-size: 0.95rem;"><i class="fas fa-cog"></i> הגדרות תצוגת דוח</h4>
                        <div style="display: flex; flex-direction: column; gap: 10px;">
                             <label style="font-size: 0.85rem; cursor: pointer;">
                                גודל דף: 
                                <select id="repConfSize" style="padding: 4px; border-radius: 4px; border: 1px solid #ccc; background: white;">
                                    <option value="A4">A4 (מומלץ למסמך רשמי)</option>
                                    <option value="A5">A5 (קומפקטי)</option>
                                </select>
                            </label>
                            <p style="font-size: 0.8rem; color: var(--text-muted); margin-top: 5px; line-height: 1.4;">
                                <i class="fas fa-info-circle"></i> העיצוב יופק אוטומטית בהתאמה אישית, תוך הצגת נתוני התלמיד, סינון מבחנים לפי כיתה והצגת הישגים עדכניים.
                            </p>
                        </div>
                    </div>

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

        document.getElementById('generateClassReportBtn').addEventListener('click', async () => {
            const cls = document.getElementById('reportClassSelect').value;
            if (!cls) return await window.customAlert('נא לבחור כיתה', true);
            const studentCodes = this.allStudents.filter(s => s.class_grade === cls).map(s => s.student_code);
            if (studentCodes.length === 0) return await window.customAlert('לא נמצאו תלמידים בכיתה זו', true);
            this.generateAndShowReport(studentCodes);
        });
    }

    async generateAndShowReport(studentCodesArray) {
        const btn = document.getElementById('generateClassReportBtn');
        const originalText = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> מכין דוחות...';
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
                await window.customAlert('שגיאה במשיכת נתונים מהשרת.', true);
            }
        } catch (error) {
            await window.customAlert('שגיאת תקשורת.', true);
        } finally {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    }

    createTableRowHtml(exam, index, studentPerformance) {
        if (!exam) {
            return `
                <tr>
                    <td style="padding: 6px; border: 1px solid #cbd5e1; height: 28px;"></td>
                    <td style="padding: 6px; border: 1px solid #cbd5e1; height: 28px;"></td>
                    <td style="padding: 6px; border: 1px solid #cbd5e1; height: 28px;"></td>
                    <td style="padding: 6px; border: 1px solid #cbd5e1; height: 28px;"></td>
                </tr>
            `;
        }

        let masechet = exam.exam_code;
        let perek = '';
        
        if (exam.details) {
            if (exam.exam_type === 'mishnayot') {
                masechet = exam.details.masechet || '';
                perek = exam.details.chapter_name || '';
            } else if (exam.exam_type === 'gemara') {
                masechet = exam.details.masechet || '';
                perek = `${exam.details.from_page || ''}-${exam.details.to_page || ''}`;
            } else {
                const vals = Object.values(exam.details);
                if (vals.length > 0) masechet = vals[0];
                if (vals.length > 1) perek = vals[1];
            }
        }

        const perf = studentPerformance[exam.exam_code];
        let markHtml = '';
        if (perf) {
            markHtml = perf.passed 
                ? '<span style="color:#059669; font-weight:900; font-size:1.1rem;">✓</span>' 
                : '<span style="color:#dc2626; font-weight:900; font-size:1.1rem;">✗</span>';
        }

        const bg = (index % 2 === 0) ? 'background-color: #f8fafc;' : 'background-color: #ffffff;';

        return `
            <tr style="${bg}">
                <td style="padding: 6px 4px; border: 1px solid #cbd5e1; font-size: 0.8rem; color: #64748b; text-align: center; width: 10%;">${index + 1}</td>
                <td style="padding: 6px 8px; border: 1px solid #cbd5e1; font-size: 0.85rem; font-weight: 600; color: #1e293b; width: 40%;">${masechet}</td>
                <td style="padding: 6px 8px; border: 1px solid #cbd5e1; font-size: 0.85rem; color: #334155; width: 35%;">${perek}</td>
                <td style="padding: 6px 4px; border: 1px solid #cbd5e1; text-align: center; width: 15%;">${markHtml}</td>
            </tr>
        `;
    }

    buildReportHtml(students) {
        const confSize = document.getElementById('repConfSize').value; 
        const styleSize = confSize === 'A5' ? 'width: 148mm; min-height: 210mm;' : 'width: 210mm; min-height: 297mm;';
        let completeHtml = '';

        students.forEach((student, studentIndex) => {
            const pageBreakClass = studentIndex < students.length - 1 ? 'page-break' : '';
            const studentClass = student.class_grade || 'כללי';
            
            let relevantExams = this.allExams.filter(e => e.target_grade === studentClass || !e.target_grade || e.target_grade === 'כללי');
            if (relevantExams.length === 0) relevantExams = this.allExams;

            const studentPerformance = {};
            let passedCount = 0;
            if (student.exams_details) {
                student.exams_details.forEach(ex => {
                    studentPerformance[ex.exam_code] = ex;
                    if (ex.passed) passedCount++;
                });
            }

            const halfLength = Math.ceil(relevantExams.length / 2);
            let rightColumnRows = '';
            let leftColumnRows = '';

            for (let i = 0; i < halfLength; i++) {
                rightColumnRows += this.createTableRowHtml(relevantExams[i], i, studentPerformance);
                leftColumnRows += this.createTableRowHtml(relevantExams[halfLength + i], halfLength + i, studentPerformance);
            }

            const tableHeaderHtml = `
                <thead>
                    <tr style="background-color: #f1f5f9; color: #0f172a;">
                        <th style="padding: 8px 4px; border: 1px solid #cbd5e1; font-size: 0.85rem;">מס'</th>
                        <th style="padding: 8px 4px; border: 1px solid #cbd5e1; font-size: 0.85rem; text-align: right;">מסכת / נושא</th>
                        <th style="padding: 8px 4px; border: 1px solid #cbd5e1; font-size: 0.85rem; text-align: right;">פרק / דפים</th>
                        <th style="padding: 8px 4px; border: 1px solid #cbd5e1; font-size: 0.85rem; text-align: center;">הישג</th>
                    </tr>
                </thead>
            `;

            completeHtml += `
                <div class="print-container ${pageBreakClass}" data-size="${confSize}" style="background: white; margin: 0 auto 20px auto; font-family: system-ui, -apple-system, sans-serif; color: #0f172a; box-sizing: border-box; position: relative; ${styleSize}">
                    <div style="padding: 30px; box-sizing: border-box; height: 100%; display: flex; flex-direction: column;">
                        
                        <!-- Header / Logo -->
                        <div style="text-align: center; margin-bottom: 25px;">
                            <img src="${this.logoUrl}" alt="פאר המשנה" style="max-height: 160px; width: auto; object-fit: contain;">
                        </div>
                        
                        <!-- Professional Student Banner -->
                        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 15px 25px; margin-bottom: 30px; display: flex; justify-content: space-between; align-items: center; box-shadow: 0 1px 2px rgba(0,0,0,0.05);" dir="rtl">
                            <div style="font-size: 1.2rem; color: #1e293b;">
                                שם התלמיד: <strong style="color: #0f172a; font-size: 1.3rem;">${student.first_name} ${student.last_name}</strong>
                            </div>
                            <div style="font-size: 1.1rem; color: #1e293b; border-right: 2px solid #cbd5e1; padding-right: 25px;">
                                כיתה: <strong style="color: #0f172a;">${studentClass}</strong>
                            </div>
                            <div style="font-size: 1rem; color: #475569; border-right: 2px solid #cbd5e1; padding-right: 25px;">
                                סך הצלחות: <strong style="color: #059669;">${passedCount}</strong> מתוך ${relevantExams.length}
                            </div>
                        </div>

                        <!-- Split Tables Container -->
                        <div style="display: flex; gap: 25px; flex: 1; align-items: flex-start;" dir="rtl">
                            
                            <!-- Right Table (Items 1 to Half) -->
                            <div style="flex: 1;">
                                <table style="width: 100%; border-collapse: collapse; border: 1px solid #cbd5e1; background: white;">
                                    ${tableHeaderHtml}
                                    <tbody>
                                        ${rightColumnRows}
                                    </tbody>
                                </table>
                            </div>

                            <!-- Left Table (Items Half to End) -->
                            <div style="flex: 1;">
                                <table style="width: 100%; border-collapse: collapse; border: 1px solid #cbd5e1; background: white;">
                                    ${tableHeaderHtml}
                                    <tbody>
                                        ${leftColumnRows}
                                    </tbody>
                                </table>
                            </div>
                            
                        </div>
                        
                        <!-- Footer -->
                        <div style="margin-top: 25px; padding-top: 15px; border-top: 1px solid #e2e8f0; text-align: center; font-size: 0.8rem; color: #94a3b8;">
                            הופק אוטומטית ממערכת פאר המשנה בתאריך ${this.getHebrewDate()}
                        </div>

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

    async downloadDirectPdf() {
        const btn = document.getElementById('directDownloadPdfBtn');
        const origText = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> מכין קובץ...';
        btn.disabled = true;

        if (typeof window.html2pdf === 'undefined') {
            try {
                await new Promise((resolve, reject) => {
                    const script = document.createElement('script');
                    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js';
                    script.onload = resolve;
                    script.onerror = reject;
                    document.head.appendChild(script);
                });
            } catch (err) {
                await window.customAlert("שגיאה בטעינת כלי ה-PDF. ייתכן שיש חסימת רשת. אנא השתמש בכפתור ה'הדפסה' ושמור כ-PDF.", true);
                btn.innerHTML = origText;
                btn.disabled = false;
                return;
            }
        }

        const element = document.getElementById('printReportBody');
        const confSize = document.getElementById('repConfSize').value.toLowerCase();

        const opt = {
            margin:       0,
            filename:     `דוחות_תלמידים_${new Date().toISOString().slice(0,10)}.pdf`,
            image:        { type: 'jpeg', quality: 0.98 },
            html2canvas:  { scale: 2, useCORS: true, logging: false },
            jsPDF:        { unit: 'mm', format: confSize, orientation: 'portrait' },
            pagebreak:    { mode: 'css', before: '.page-break' }
        };

        html2pdf().set(opt).from(element).save().then(() => {
            btn.innerHTML = origText;
            btn.disabled = false;
        });
    }
}
