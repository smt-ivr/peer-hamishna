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
        this.fetchExams(); // חשוב: צריך למשוך את כל המבחנים
    }

    async fetchExams() {
        try {
            const response = await fetch(`${this.apiBase}/exams`);
            if (response.ok) {
                this.allExams = await response.json();
                this.renderView(); // מרנדר את המסך רק אחרי שיש לנו את המבחנים
            }
        } catch (error) {
            console.error('שגיאה במשיכת מבחנים לדוחות', error);
            this.renderView(); // נרנדר בכל זאת, למקרה שנרצה להציג שגיאה אח"כ
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
                    <h3 style="margin: 0;"><i class="fas fa-file-invoice"></i> הפקת דוחות תלמידים (תואם טופס מקורי)</h3>
                </div>
                
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px;">
                    <div style="background: var(--bg-color); padding: 15px; border-radius: 6px; border: 1px solid var(--border-color);">
                        <h4 style="margin-bottom: 10px; font-size: 0.95rem;"><i class="fas fa-cog"></i> הגדרות תצוגת דוח</h4>
                        <div style="display: flex; flex-direction: column; gap: 10px;">
                             <label style="font-size: 0.85rem; cursor: pointer;">
                                גודל דף: 
                                <select id="repConfSize" style="padding: 4px; border-radius: 4px; border: 1px solid #ccc;">
                                    <option value="A4">A4 (גדול ומרווח - מומלץ לטופס מלא)</option>
                                    <option value="A5">A5 (קומפקטי)</option>
                                </select>
                            </label>
                            <p style="font-size: 0.8rem; color: var(--text-muted); margin-top: 5px;">
                                <i class="fas fa-info-circle"></i> הדוח מציג את כל המבחנים הרלוונטיים לכיתת התלמיד.
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
            // נוודא שיש לנו את המידע הכי עדכני מהשרת
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

    // פונקציית עזר לעיצוב שם המבחן (מסכת + פרק / דפים)
    formatExamNameForTable(exam) {
        if (!exam || !exam.details) return exam.exam_code;
        
        if (exam.exam_type === 'mishnayot') {
            // החזרת מסכת ופרק בלבד ללא "פרק" או מספר משניות (כדי לחסוך מקום)
             return `${exam.details.masechet || ''} - ${exam.details.chapter_name || ''}`;
        } else if (exam.exam_type === 'gemara') {
             return `${exam.details.masechet || ''} ${exam.details.from_page || ''}-${exam.details.to_page || ''}`;
        }
        return exam.exam_code;
    }

    buildReportHtml(students) {
        const confSize = document.getElementById('repConfSize').value; 
        let completeHtml = '';

        students.forEach((student, index) => {
            const pageBreakClass = index < students.length - 1 ? 'page-break' : '';
            const studentClass = student.class_grade || 'כללי';
            
            // סינון מבחנים רלוונטיים לכיתה זו
            let relevantExams = this.allExams.filter(e => e.target_grade === studentClass || !e.target_grade || e.target_grade === 'כללי');
            
            // אם אין מבחנים רלוונטיים, אולי נרצה להציג את כל המבחנים? נציג הכל כגיבוי.
            if (relevantExams.length === 0) {
                 relevantExams = this.allExams;
            }

            // יצירת מפה של ביצועי התלמיד
            const studentPerformance = {};
            if (student.exams_details) {
                student.exams_details.forEach(ex => {
                    studentPerformance[ex.exam_code] = ex;
                });
            }

            // חלוקת המבחנים ל-2 טורים
            const halfLength = Math.ceil(relevantExams.length / 2);
            const leftColExams = relevantExams.slice(0, halfLength);
            const rightColExams = relevantExams.slice(halfLength);

            let tableRows = '';
            for (let i = 0; i < halfLength; i++) {
                const leftExam = leftColExams[i];
                const rightExam = rightColExams[i];

                // --- עמודה שמאלית (מבחנים 1 עד אמצע) ---
                let leftHtml = '<td colspan="4" style="border: 1px solid #000; padding: 4px;"></td>'; // ריק אם אין מבחן
                if (leftExam) {
                    const perf = studentPerformance[leftExam.exam_code];
                    const mark = perf ? (perf.passed ? '✓' : 'X') : '';
                    const examName = this.formatExamNameForTable(leftExam);
                    
                    leftHtml = `
                        <td style="border: 1px solid #000; text-align: center; font-weight: bold; font-size: 1.1rem; width: 10%; padding: 2px;">${mark}</td>
                        <td style="border: 1px solid #000; text-align: center; width: 15%; padding: 2px;"></td>
                        <td style="border: 1px solid #000; padding: 2px 5px; width: 65%; font-size: 0.9rem;">${examName}</td>
                        <td style="border: 1px solid #000; text-align: center; width: 10%; padding: 2px;">${i + 1}</td>
                    `;
                }

                // --- עמודה ימנית (מבחנים אמצע עד סוף) ---
                let rightHtml = '<td colspan="4" style="border: 1px solid #000; padding: 4px;"></td>';
                if (rightExam) {
                    const perf = studentPerformance[rightExam.exam_code];
                    const mark = perf ? (perf.passed ? '✓' : 'X') : '';
                    const examName = this.formatExamNameForTable(rightExam);
                    
                    rightHtml = `
                        <td style="border: 1px solid #000; text-align: center; font-weight: bold; font-size: 1.1rem; width: 10%; padding: 2px;">${mark}</td>
                        <td style="border: 1px solid #000; text-align: center; width: 15%; padding: 2px;"></td>
                        <td style="border: 1px solid #000; padding: 2px 5px; width: 65%; font-size: 0.9rem;">${examName}</td>
                        <td style="border: 1px solid #000; text-align: center; width: 10%; padding: 2px;">${halfLength + i + 1}</td>
                    `;
                }

                tableRows += `<tr>${rightHtml}${leftHtml}</tr>`; // ימין קודם ב-RTL (למרות שהטבלה בנויה משמאל לימין בקוד, RTL יהפוך אותה. כדי למנוע בלבול, נגדיר כיוונים ברורים)
            }

            const styleSize = confSize === 'A5' ? 'width: 148mm; min-height: 210mm;' : 'width: 210mm; min-height: 297mm;';

            // בניית ה-HTML המלא של תעודה בודדת
            completeHtml += `
                <div class="print-container ${pageBreakClass}" data-size="${confSize}" style="background: white; margin: 0 auto 20px auto; font-family: Arial, sans-serif; color: #000; box-sizing: border-box; position: relative; ${styleSize}">
                    <div style="padding: 15px; box-sizing: border-box; height: 100%;">
                        
                        <!-- Header / Logo -->
                        <div style="text-align: center; margin-bottom: 15px;">
                            <img src="${this.logoUrl}" alt="פאר המשנה" style="max-width: 100%; height: auto; max-height: 250px;">
                        </div>
                        
                        <!-- Student Info -->
                        <div style="display: flex; justify-content: space-between; font-size: 1.1rem; font-weight: bold; margin-bottom: 15px; padding: 0 10px;">
                            <div>רשימת מבחני משניות וגמרא</div>
                            <div>נאמען: <span style="border-bottom: 1px solid #000; padding: 0 40px;">${student.first_name} ${student.last_name}</span></div>
                            <div>כיתה: <span style="border-bottom: 1px solid #000; padding: 0 20px;">${student.class_grade || ''}</span> נ"י</div>
                        </div>

                        <!-- Table -->
                        <table style="width: 100%; border-collapse: collapse; text-align: right; font-size: 0.9rem;" dir="rtl">
                            <thead>
                                <tr style="background-color: #f0f0f0;">
                                    <th style="border: 1px solid #000; padding: 4px; text-align: center;">ציון</th>
                                    <th style="border: 1px solid #000; padding: 4px; text-align: center;">ציון ב'</th>
                                    <th style="border: 1px solid #000; padding: 4px; text-align: center;">מסכת / פרק</th>
                                    <th style="border: 1px solid #000; padding: 4px; text-align: center;">מס'</th>
                                    
                                    <th style="border: 1px solid #000; padding: 4px; text-align: center;">ציון</th>
                                    <th style="border: 1px solid #000; padding: 4px; text-align: center;">ציון ב'</th>
                                    <th style="border: 1px solid #000; padding: 4px; text-align: center;">מסכת / פרק</th>
                                    <th style="border: 1px solid #000; padding: 4px; text-align: center;">מס'</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${tableRows}
                            </tbody>
                        </table>
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
        const confSize = document.getElementById('repConfSize').value.toLowerCase(); // a4 או a5

        const opt = {
            margin:       5,
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
