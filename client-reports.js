export class ReportManager {
    constructor(container, apiBase) {
        this.container = container;
        this.apiBase = apiBase;
        this.allStudents = [];
    }

    setStudents(students) {
        this.allStudents = students;
        this.renderSearch();
    }

    renderSearch() {
        const html = `
            <div class="no-print">
                <div class="card compact-card" style="margin-bottom: 20px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                        <h3 style="margin: 0;"><i class="fas fa-file-invoice"></i> הפקת דוחות תלמידים</h3>
                    </div>
                    <p class="text-muted" style="margin-bottom: 15px;">חפש תלמיד כדי להפיק דוח מפורט הניתן להדפסה או שמירה כ-PDF בצורה מסודרת.</p>
                    <div class="search-box" style="max-width: 400px;">
                        <i class="fas fa-search search-icon"></i>
                        <input type="text" id="reportStudentSearch" placeholder="חיפוש לפי קוד או שם תלמיד..." autocomplete="off">
                        <div id="reportSearchResults" class="search-results-dropdown hidden"></div>
                    </div>
                </div>
            </div>
            <div id="reportContainer"></div>
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
                    item.innerHTML = `
                        <div>
                            <span class="result-name">${student.first_name} ${student.last_name}</span>
                            <span class="result-class">כיתה ${student.class_grade || '-'}</span>
                        </div>
                        <div class="result-code">${student.student_code}</div>
                    `;
                    
                    item.addEventListener('click', () => {
                        searchInput.value = '';
                        resultsDropdown.classList.add('hidden');
                        this.generateReport(student);
                    });
                    resultsDropdown.appendChild(item);
                });
            }
            resultsDropdown.classList.remove('hidden');
        });

        document.addEventListener('click', (e) => {
            if (!searchInput.contains(e.target) && !resultsDropdown.contains(e.target)) {
                resultsDropdown.classList.add('hidden');
            }
        });
    }

    generateReport(student) {
        const reportContainer = document.getElementById('reportContainer');
        const exams = student.exams_details || [];
        const passed = exams.filter(e => e.passed).length;
        const totalReward = student.total_reward || 0;
        const currentDate = new Date().toLocaleDateString('he-IL');

        let examsHtml = '<p class="text-muted" style="text-align:center; padding:20px;">לא נמצאו מבחנים לתלמיד זה.</p>';
        if (exams.length > 0) {
            examsHtml = `
                <table class="modern-table print-table" style="width: 100%; text-align: right; border-collapse: collapse;">
                    <thead>
                        <tr style="background-color: #f1f5f9; border-bottom: 2px solid var(--border-color);">
                            <th style="padding: 10px; font-weight: bold;">קוד מבחן</th>
                            <th style="padding: 10px; font-weight: bold;">פרטים</th>
                            <th style="padding: 10px; font-weight: bold;">סטטוס</th>
                            <th style="padding: 10px; font-weight: bold;">שווי (₪)</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${exams.map(ex => {
                            let desc = ex.exam_code;
                            if (ex.details) {
                                if (ex.exam_type === 'mishnayot') {
                                    desc = `${ex.details.masechet || ''} פרק ${ex.details.chapter_name || ''}`;
                                } else if (ex.exam_type === 'gemara') {
                                    desc = `${ex.details.masechet || ''} דפים ${ex.details.from_page || ''}-${ex.details.to_page || ''}`;
                                } else {
                                    desc = Object.values(ex.details).join(', ');
                                }
                            }
                            return `
                            <tr style="border-bottom: 1px solid var(--border-color);">
                                <td style="padding: 10px;"><strong>${ex.exam_code}</strong></td>
                                <td style="padding: 10px;">${desc}</td>
                                <td style="padding: 10px;">${ex.passed ? 'עבר' : 'לא עבר'}</td>
                                <td style="padding: 10px;">₪${(ex.reward || 0).toFixed(1)}</td>
                            </tr>`;
                        }).join('')}
                    </tbody>
                </table>
            `;
        }

        reportContainer.innerHTML = `
            <div class="card" id="printableReport" style="padding: 30px; border-top: 4px solid var(--primary-color); background: white;">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 30px; border-bottom: 2px solid var(--border-color); padding-bottom: 20px;">
                    <div>
                        <h2 style="color: var(--primary-color); margin-bottom: 5px; font-size: 1.8rem;">דוח תלמיד אישי</h2>
                        <h3 style="font-size: 1.4rem;">${student.first_name} ${student.last_name}</h3>
                        <p style="color: var(--text-muted); margin-top: 5px;">קוד תלמיד: <strong>${student.student_code}</strong> | כיתה: <strong>${student.class_grade || '-'}</strong></p>
                    </div>
                    <div style="text-align: left;">
                        <p style="color: var(--text-muted); margin-bottom: 15px;">תאריך הפקה: ${currentDate}</p>
                        <button class="btn btn-primary no-print" onclick="window.print()">
                            <i class="fas fa-file-pdf"></i> הדפס / שמור כ-PDF
                        </button>
                    </div>
                </div>

                <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px; margin-bottom: 30px;">
                    <div style="background: #f8fafc; padding: 15px; border-radius: 8px; text-align: center; border: 1px solid var(--border-color);">
                        <div style="font-size: 1.8rem; font-weight: bold; color: var(--text-main);">${exams.length}</div>
                        <div style="font-size: 0.9rem; color: var(--text-muted);">סה"כ מבחנים</div>
                    </div>
                    <div style="background: #ecfdf5; padding: 15px; border-radius: 8px; text-align: center; border: 1px solid #a7f3d0;">
                        <div style="font-size: 1.8rem; font-weight: bold; color: #059669;">${passed}</div>
                        <div style="font-size: 0.9rem; color: #059669;">עברו בהצלחה</div>
                    </div>
                    <div style="background: #eff6ff; padding: 15px; border-radius: 8px; text-align: center; border: 1px solid #bfdbfe;">
                        <div style="font-size: 1.8rem; font-weight: bold; color: var(--primary-color);">₪${totalReward.toFixed(1)}</div>
                        <div style="font-size: 0.9rem; color: var(--primary-color);">סך הכל מלגה נצברת</div>
                    </div>
                </div>

                <div style="margin-bottom: 20px;">
                    <h4 style="margin-bottom: 15px; font-size: 1.1rem; font-weight: bold; border-bottom: 1px solid var(--border-color); padding-bottom: 5px;">פירוט מבחנים</h4>
                    ${examsHtml}
                </div>
            </div>
        `;
    }
}
