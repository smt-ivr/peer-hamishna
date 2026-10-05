export class ReportManager {
    constructor(container, apiBase) {
        this.container = container;
        this.apiBase = apiBase;
        this.allStudentsData = [];
        this.classes = new Set();
        this.injectModal();
        this.logoUrl = 'https://smti.uk/img/peer.jpg';
    }

    async fetchStudentSummaries() {
        try {
            const response = await fetch(`${this.apiBase}/student-summary`);
            if (response.ok) {
                this.allStudentsData = await response.json();
                this.classes = new Set(this.allStudentsData.map(s => s.class_grade).filter(Boolean).sort());
                this.renderView();
            } else {
                console.error('שגיאה בטעינת נתוני דוחות');
                this.renderView();
            }
        } catch (error) {
            console.error('שגיאת רשת בטעינת דוחות', error);
            this.renderView();
        }
    }

    setStudents(students) {
        this.fetchStudentSummaries();
    }

    injectModal() {
        if (!document.getElementById('printReportModal')) {
            const modalHtml = `
            <div id="printReportModal" class="modal hidden no-print" style="z-index: 9999;">
                <div class="modal-content" style="max-width: 1000px; height: 95vh; background: #e2e8f0; border-radius: 12px; overflow: hidden;">
                    <div class="modal-header no-print" style="background: white; padding: 15px 20px; box-shadow: 0 2px 10px rgba(0,0,0,0.05);">
                        <h3 style="margin: 0; font-size: 1.2rem; color: #0f172a;"><i class="fas fa-print" style="color: var(--primary-color);"></i> מרכז הפקת דוחות מתקדם</h3>
                        <div style="display:flex; gap:10px; align-items:center;">
                            <button class="btn btn-outline btn-sm" id="exportReportCsvBtn" title="ייצא טבלה לאקסל"><i class="fas fa-file-excel"></i> ייצוא אקסל</button>
                            <button class="btn btn-secondary btn-sm" id="directDownloadPdfBtn" title="הורד קובץ ישירות"><i class="fas fa-file-pdf"></i> הורד PDF</button>
                            <button class="btn btn-primary btn-sm" onclick="window.print()" title="הדפסה במדפסת"><i class="fas fa-print"></i> הדפס מסמך</button>
                            <button class="close-modal-btn" onclick="document.getElementById('printReportModal').classList.add('hidden')" style="margin-right: 15px; font-size: 1.5rem;">&times;</button>
                        </div>
                    </div>
                    <div class="modal-body" id="printReportBodyWrapper" style="padding: 20px; overflow-y: auto; background: #cbd5e1; display: flex; flex-direction: column; align-items: center;">
                        <div id="printReportBody" style="width: 100%; max-width: 210mm;"></div>
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
            <div style="background: #fffbeb; color: #b45309; border: 1px solid #fde68a; padding: 12px 20px; border-radius: 8px; margin-bottom: 20px; display: flex; align-items: center; gap: 10px; font-weight: 500;">
                <i class="fas fa-tools" style="font-size: 1.2rem;"></i>
                <div>
                    <strong>הודעת מערכת:</strong> מודול הפקת הדוחות נמצא בבנייה ושדרוג. ניתן להשתמש בהגדרות מטה כדי להתאים אישית את תצוגת המסמך המופק.
                </div>
            </div>

            <div class="card compact-card no-print" style="margin-bottom: 20px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
                <div style="border-bottom: 1px solid var(--border-color); padding-bottom: 15px; margin-bottom: 20px;">
                    <h3 style="margin: 0; font-size: 1.15rem; color: #1e293b;"><i class="fas fa-sliders-h" style="color: var(--primary-color);"></i> פאנל ניהול והגדרות דוחות</h3>
                </div>
                
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 25px;">
                    
                    <!-- Settings Panel -->
                    <div style="background: #f8fafc; padding: 20px; border-radius: 8px; border: 1px solid #e2e8f0;">
                        <h4 style="margin-top: 0; margin-bottom: 15px; font-size: 1rem; color: #0f172a;"><i class="fas fa-cog"></i> הגדרות תצוגה במסמך</h4>
                        <div style="display: flex; flex-direction: column; gap: 12px;">
                            
                            <label style="display: flex; align-items: center; gap: 8px; font-size: 0.9rem; cursor: pointer;">
                                <input type="checkbox" id="confShowReward" checked style="width: 16px; height: 16px;"> 
                                הצג עמודת מלגה (פירוט כספי)
                            </label>
                            
                            <label style="display: flex; align-items: center; gap: 8px; font-size: 0.9rem; cursor: pointer;">
                                <input type="checkbox" id="confShowExamCode" checked style="width: 16px; height: 16px;"> 
                                הצג עמודת קוד מבחן בטבלה
                            </label>

                            <label style="display: flex; align-items: center; gap: 8px; font-size: 0.9rem; cursor: pointer;">
                                <input type="checkbox" id="confShowStudentCode" checked style="width: 16px; height: 16px;"> 
                                הצג קוד תלמיד בפרטי התעודה
                            </label>

                            <label style="display: flex; align-items: center; gap: 8px; font-size: 0.9rem; cursor: pointer;">
                                <input type="checkbox" id="confHideUnattempted" style="width: 16px; height: 16px;"> 
                                <strong>הסתר מבחנים שלא בוצעו</strong> (מומלץ לדוח תמציתי)
                            </label>
                            
                            <div style="margin-top: 5px;">
                                <label style="font-size: 0.9rem; display: block; margin-bottom: 5px; color: #334155;">פריסת עמודות (לדחיסה לדף אחד):</label>
                                <select id="confColumns" style="width: 100%; padding: 8px; border-radius: 6px; border: 1px solid #cbd5e1; background: white; outline: none;">
                                    <option value="2">2 עמודות במקביל</option>
                                    <option value="3" selected>3 עמודות במקביל (מומלץ לריבוי מבחנים)</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    <!-- Generation Panel -->
                    <div style="display: flex; flex-direction: column; gap: 20px;">
                        
                        <div style="background: white; padding: 20px; border-radius: 8px; border: 1px solid #e2e8f0; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
                            <h4 style="margin-top: 0; margin-bottom: 15px; font-size: 1rem;"><i class="fas fa-user"></i> הפקה לתלמיד בודד</h4>
                            <div class="search-box">
                                <i class="fas fa-search search-icon"></i>
                                <input type="text" id="reportStudentSearch" placeholder="הקלד קוד או שם תלמיד..." autocomplete="off" style="width: 100%; padding: 10px 35px 10px 15px; border-radius: 6px;">
                                <div id="reportSearchResults" class="search-results-dropdown hidden" style="top: 100%; margin-top: 5px;"></div>
                            </div>
                        </div>

                        <div style="background: white; padding: 20px; border-radius: 8px; border: 1px solid #e2e8f0; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
                            <h4 style="margin-top: 0; margin-bottom: 15px; font-size: 1rem;"><i class="fas fa-users"></i> הפקה מרוכזת לכיתה</h4>
                            <div style="display: flex; gap: 10px;">
                                <select id="reportClassSelect" style="flex:1; padding: 10px; border: 1px solid #cbd5e1; border-radius: 6px; background: white; outline: none;">
                                    <option value="">-- בחר כיתה להפקה --</option>
                                    ${Array.from(this.classes).map(c => `<option value="${c}">כיתה ${c}</option>`).join('')}
                                </select>
                                <button class="btn btn-primary" id="generateClassReportBtn" style="padding: 0 20px;"><i class="fas fa-magic"></i> הפק דוחות</button>
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

            const filtered = this.allStudentsData.filter(s => 
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
                        this.generateAndShowReport(`?student_code=${student.student_code}`);
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
            this.generateAndShowReport(`?class_grade=${encodeURIComponent(cls)}`);
        });
    }

    async generateAndShowReport(queryParams) {
        const btn = document.getElementById('generateClassReportBtn');
        const originalText = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> מעבד נתונים...';
        btn.disabled = true;

        try {
            const response = await fetch(`${this.apiBase}/student-summary${queryParams}`);
            if (response.ok) {
                const studentsToRender = await response.json();
                if (studentsToRender.length === 0) {
                    await window.customAlert('לא נמצאו נתונים לחיפוש זה.', true);
                } else {
                    this.lastRenderedStudents = studentsToRender; 
                    this.buildReportHtml(studentsToRender);
                }
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

    createTableRowHtml(exam, index, showExamCode, showReward) {
        if (!exam) {
            return `<tr><td colspan="${1 + (showExamCode ? 1 : 0) + (showReward ? 1 : 0) + 1}" style="border: 1px solid #cbd5e1; height: 18px;"></td></tr>`;
        }

        let desc = exam.exam_code;
        if (exam.details) {
            if (exam.exam_type === 'mishnayot') {
                desc = `${exam.details.masechet || ''} | ${exam.details.chapter_name || ''}`;
            } else if (exam.exam_type === 'gemara') {
                desc = `${exam.details.masechet || ''} | ${exam.details.from_page || ''}-${exam.details.to_page || ''}`;
            } else {
                desc = Object.values(exam.details).join(' | ');
            }
        }

        let markHtml = '';
        let rewardText = '';

        if (exam.passed === true) {
            markHtml = '<span style="color:#059669; font-weight:900;">V</span>';
            rewardText = (exam.reward_earned || 0) > 0 ? `${exam.reward_earned.toFixed(1)}` : '';
        } else if (exam.passed === false) {
            markHtml = '<span style="color:#dc2626; font-weight:900;">X</span>';
            rewardText = '';
        }

        const bg = (index % 2 === 0) ? 'background-color: #f8fafc;' : 'background-color: #ffffff;';
        
        let rowHtml = `<tr style="${bg}">`;
        
        if (showExamCode) {
            rowHtml += `<td style="padding: 2px 4px; border: 1px solid #cbd5e1; font-size: 10px; font-weight: 600; text-align: center; color: #1e293b;">${exam.exam_code}</td>`;
        }
        
        rowHtml += `<td style="padding: 2px 5px; border: 1px solid #cbd5e1; font-size: 10px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 130px; color: #334155;">${desc}</td>`;
        rowHtml += `<td style="padding: 2px; border: 1px solid #cbd5e1; font-size: 11px; text-align: center;">${markHtml}</td>`;
        
        if (showReward) {
            rowHtml += `<td style="padding: 2px; border: 1px solid #cbd5e1; font-size: 10px; text-align: center; font-weight: 600; color: #475569;">${rewardText}</td>`;
        }
        
        rowHtml += `</tr>`;
        return rowHtml;
    }

    buildReportHtml(students) {
        const showReward = document.getElementById('confShowReward').checked;
        const showExamCode = document.getElementById('confShowExamCode').checked;
        const showStudentCode = document.getElementById('confShowStudentCode').checked;
        const hideUnattempted = document.getElementById('confHideUnattempted').checked;
        const numCols = parseInt(document.getElementById('confColumns').value) || 3;

        const styleSize = 'width: 210mm; min-height: 297mm;'; // מקובע ל-A4
        let completeHtml = '';

        students.forEach((student, studentIndex) => {
            const pageBreakClass = studentIndex < students.length - 1 ? 'page-break' : '';
            const studentClass = student.class_grade || 'כללי';
            
            let examsList = student.exams || [];
            
            if (hideUnattempted) {
                examsList = examsList.filter(ex => ex.passed === true || ex.passed === false);
            }

            const stats = student.stats || { total_passed: 0, total_attempted: 0, total_available_exams: student.exams?.length || 0, total_reward: 0 };

            const chunkSize = Math.ceil(examsList.length / numCols);
            let tablesContainerHtml = '';

            for (let c = 0; c < numCols; c++) {
                const chunkExams = examsList.slice(c * chunkSize, (c + 1) * chunkSize);
                let rowsHtml = '';
                
                for (let i = 0; i < chunkSize; i++) {
                    const actualIndex = (c * chunkSize) + i;
                    rowsHtml += this.createTableRowHtml(chunkExams[i], actualIndex, showExamCode, showReward);
                }

                tablesContainerHtml += `
                    <div style="flex: 1; min-width: 0;">
                        <table style="width: 100%; border-collapse: collapse; border: 1px solid #cbd5e1; background: white; table-layout: fixed;">
                            <thead>
                                <tr style="background-color: #e2e8f0; color: #0f172a;">
                                    ${showExamCode ? `<th style="padding: 4px; border: 1px solid #94a3b8; font-size: 10px; text-align: center; width: ${showReward ? '18%' : '22%'};">קוד</th>` : ''}
                                    <th style="padding: 4px; border: 1px solid #94a3b8; font-size: 10px; text-align: right; width: ${showExamCode ? (showReward ? '52%' : '63%') : (showReward ? '70%' : '85%')};">פירוט מבחן</th>
                                    <th style="padding: 4px; border: 1px solid #94a3b8; font-size: 10px; text-align: center; width: 15%;">הישג</th>
                                    ${showReward ? `<th style="padding: 4px; border: 1px solid #94a3b8; font-size: 10px; text-align: center; width: 15%;">מלגה</th>` : ''}
                                </tr>
                            </thead>
                            <tbody>
                                ${rowsHtml}
                            </tbody>
                        </table>
                    </div>
                `;
            }

            const codeBadgeHtml = showStudentCode ? `<span style="background: #e2e8f0; padding: 2px 8px; border-radius: 4px; font-size: 11px; margin-right: 10px;">קוד: ${student.student_code}</span>` : '';
            const totalRewardHtml = showReward ? `<div style="margin-top: 4px;">סך הכל מלגה: <strong style="color: #059669; font-size: 14px;">₪${(stats.total_reward || 0).toFixed(1)}</strong></div>` : '';

            completeHtml += `
                <div class="print-container ${pageBreakClass}" style="background: white; margin: 0 auto 10px auto; font-family: system-ui, -apple-system, sans-serif; color: #0f172a; box-sizing: border-box; position: relative; ${styleSize}">
                    <div style="padding: 15px 20px; box-sizing: border-box; height: 100%; display: flex; flex-direction: column;">
                        
                        <!-- Premium Compact Header -->
                        <div style="display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2px solid #0f172a; padding-bottom: 10px; margin-bottom: 15px;" dir="rtl">
                            <div style="flex: 1;">
                                <h2 style="margin: 0 0 4px 0; font-size: 18px; color: #0f172a; font-weight: 800;">דוח הישגים ומלגות</h2>
                                <div style="font-size: 11px; color: #475569;">תאריך הפקה: ${this.getHebrewDate()}</div>
                            </div>
                            
                            <!-- לוגו מוקטן לחיסכון במקום -->
                            <img src="${this.logoUrl}" style="max-height: 50px; width: auto; object-fit: contain; margin: 0 15px;">
                            
                            <div style="flex: 1; text-align: left; font-size: 12px; line-height: 1.6;">
                                <div>שם התלמיד: <strong style="font-size: 14px; color: #000;">${student.first_name} ${student.last_name}</strong> ${codeBadgeHtml}</div>
                                <div>כיתה: <strong>${studentClass}</strong> | עבר <strong style="color: #0284c7;">${stats.total_passed}</strong> מתוך <strong style="color: #0f172a;">${stats.total_attempted}</strong> שביצע</div>
                                ${totalRewardHtml}
                            </div>
                        </div>

                        <!-- Dynamic Columns Container -->
                        <div style="display: flex; gap: 12px; flex: 1; align-items: flex-start;" dir="rtl">
                            ${tablesContainerHtml}
                        </div>
                        
                        <!-- Footer -->
                        <div style="margin-top: auto; padding-top: 10px; text-align: center; font-size: 9px; color: #94a3b8;">
                            הופק אוטומטית ממערכת הניהול 
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
            const exams = student.exams || [];
            if (exams.length === 0) {
                csvContent += `"${student.student_code}","${student.first_name}","${student.last_name}","${student.class_grade || ''}","ללא מבחנים","","",""\n`;
            } else {
                exams.forEach(ex => {
                    let desc = ex.details ? Object.values(ex.details).filter(v => v !== null && v !== '').join(' - ') : ex.exam_code;
                    let status = ex.passed === true ? 'עבר' : (ex.passed === false ? 'לא עבר' : 'לא בוצע');
                    let reward = ex.reward_earned || 0;
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
        const opt = {
            margin:       0,
            filename:     `דוחות_תלמידים_${new Date().toISOString().slice(0,10)}.pdf`,
            image:        { type: 'jpeg', quality: 0.98 },
            html2canvas:  { scale: 2, useCORS: true, logging: false },
            jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' },
            pagebreak:    { mode: 'css', before: '.page-break' }
        };

        html2pdf().set(opt).from(element).save().then(() => {
            btn.innerHTML = origText;
            btn.disabled = false;
        });
    }
}
