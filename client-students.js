export class StudentManager {
    constructor(container, onUpdateGradesCallback) {
        this.container = container;
        this.onUpdateGradesCallback = onUpdateGradesCallback;
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

            <!-- שאר המודלים של עריכה / פרופיל נשארים אותו דבר -->
            <div id="studentProfileModal" class="modal hidden">
                <div class="modal-content" style="max-width: 600px; height: auto;">
                    <div class="modal-header">
                        <h3><i class="fas fa-id-card"></i> כרטיס תלמיד אישי</h3>
                        <button class="close-modal-btn" onclick="document.getElementById('studentProfileModal').classList.add('hidden')">&times;</button>
                    </div>
                    <div class="modal-body" id="studentProfileBody" style="padding: 20px;"></div>
                </div>
            </div>
            <!-- מודל טופס פה (נחתך לשם קיצור) -->
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

        textInput.addEventListener('input', applyFilters);
        classSelect.addEventListener('change', applyFilters);

        document.getElementById('exportStudentsBtn').addEventListener('click', () => {
            this.exportToExcel();
        });

        tbody.addEventListener('click', (e) => {
            const viewBtn = e.target.closest('.action-view-btn');
            const updateBtn = e.target.closest('.action-update-btn');

            if (viewBtn) this.openStudentProfile(viewBtn.dataset.code);
            if (updateBtn && this.onUpdateGradesCallback) this.onUpdateGradesCallback(updateBtn.dataset.code);
        });
    }

    exportToExcel() {
        let csvContent = '\uFEFF';
        csvContent += 'קוד תלמיד,שם פרטי,שם משפחה,כיתה,סך הכל נצבר (₪),מבחנים רשומים,עברו בהצלחה\n';
        
        this.students.forEach(s => {
            const exams = s.exams_details || [];
            const passed = exams.filter(e => e.passed).length;
            const totalReward = s.total_reward || 0;
            csvContent += `"${s.student_code}","${s.first_name}","${s.last_name}","${s.class_grade || ''}","${totalReward}","${exams.length}","${passed}"\n`;
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
        
        body.innerHTML = `
            <div style="display: flex; gap: 20px; align-items: center; margin-bottom: 20px; padding-bottom: 20px; border-bottom: 1px solid var(--border-color);">
                <div style="width: 65px; height: 65px; background: var(--primary-color); color: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 1.8rem; flex-shrink: 0;">
                    <i class="fas fa-user-graduate"></i>
                </div>
                <div style="flex: 1;">
                    <h2 style="margin: 0 0 6px 0; font-size: 1.4rem;">${student.first_name} ${student.last_name}</h2>
                    <לבקשתך, הכנתי עבורך מערכת מלאה, נקייה ומקצועית המבוססת על צבעי שחור-לבן ואפור (Grayscale) כדי שתיראה במיטבה גם בהדפסה רגילה. 

שימה לב: בהתאם להנחיות המחמירות שהגדרת, השמטתי את צמד המילים המבוקש מהכותרת, והשתמשתי בכותרת הכללית "דוח סיכום". 

המערכת כוללת קובץ אחד (HTML, CSS ו-JavaScript משולבים יחד לנוחות מקסימלית) שמכיל את כל מה שביקשת:
1. **הגדרות בצד ימין**: בחירת גודל דף (A4 או A5), בחירה אם להציג קוד תלמיד או לא.
2. **דוח תלמיד מרכזי**: תאריך עברי אוטומטי, שם התלמיד, וטבלת ציונים המציגה אם התלמיד "עבר" או "נכשל".
3. **טאבים**: טאב "הפקת דוח תלמיד" פעיל, וטאב "דוחות מתקדמים" שמציג הודעה כי הנושא בפיתוח.
4. **ייצוא מתקדם**: כפתורי הדפסה (שמתאימים את עצמם להגדרות), הורדת PDF מותאם, וייצוא נתונים לאקסל (לרבות אפשרות לייצא את כל בסיס הנתונים: תלמידים ומבחנים).

כדי להשתמש, יש להעתיק את הקוד הבא, לשמור אותו בקובץ עם סיומת `.html` (לדוגמה `reports.html`) ולפתוח בדפדפן.

```html
<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>מערכת הפקת דוחות</title>
    
    <!-- ספריות חיצוניות עבור ייצוא ל-PDF ולאקסל -->
    <script src="[https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js](https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js)"></script>
    <script src="[https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js](https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js)"></script>

    <style>
        :root {
            --bg-color: #f4f4f4;
            --panel-bg: #ffffff;
            --border-color: #cccccc;
            --text-main: #222222;
            --text-muted: #555555;
            --btn-bg: #e0e0e0;
            --btn-hover: #d0d0d0;
            --accent-black: #000000;
        }

        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background-color: var(--bg-color);
            color: var(--text-main);
            margin: 0;
            padding: 0;
            display: flex;
            flex-direction: column;
            height: 100vh;
        }

        /* עיצוב הטאבים */
        .tabs-header {
            background-color: var(--panel-bg);
            border-bottom: 2px solid var(--accent-black);
            display: flex;
            padding: 0 20px;
        }
        .tab-btn {
            background: none;
            border: none;
            padding: 15px 25px;
            font-size: 16px;
            font-weight: bold;
            cursor: pointer;
            color: var(--text-muted);
            border-bottom: 3px solid transparent;
        }
        .tab-btn.active {
            color: var(--accent-black);
            border-bottom-color: var(--accent-black);
        }
        .tab-content {
            display: none;
            flex: 1;
            padding: 20px;
        }
        .tab-content.active {
            display: flex;
            gap: 20px;
        }

        /* הודעת פיתוח לטאב דוחות */
        .development-notice {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 100%;
            height: 50vh;
            font-size: 24px;
            color: var(--text-muted);
            border: 2px dashed var(--border-color);
            background: var(--panel-bg);
        }

        /* סרגל הגדרות ימני */
        .settings-sidebar {
            width: 300px;
            background-color: var(--panel-bg);
            border: 1px solid var(--border-color);
            padding: 20px;
            border-radius: 4px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.05);
            display: flex;
            flex-direction: column;
            gap: 15px;
        }
        .settings-sidebar h3 {
            margin-top: 0;
            border-bottom: 1px solid var(--border-color);
            padding-bottom: 10px;
        }
        .form-group {
            display: flex;
            flex-direction: column;
            gap: 5px;
        }
        .form-group label {
            font-weight: bold;
            font-size: 14px;
        }
        .form-group select, .form-group input[type="text"] {
            padding: 8px;
            border: 1px solid var(--border-color);
            border-radius: 4px;
            font-family: inherit;
        }
        .checkbox-group {
            display: flex;
            align-items: center;
            gap: 8px;
            font-weight: bold;
            font-size: 14px;
            cursor: pointer;
        }

        /* כפתורים */
        .btn {
            background-color: var(--btn-bg);
            color: var(--accent-black);
            border: 1px solid var(--border-color);
            padding: 10px;
            cursor: pointer;
            font-weight: bold;
            border-radius: 4px;
            text-align: center;
            transition: background 0.2s;
            margin-top: 5px;
        }
        .btn:hover {
            background-color: var(--btn-hover);
        }
        .btn-primary {
            background-color: var(--accent-black);
            color: #fff;
        }
        .btn-primary:hover {
            background-color: #333;
        }

        hr {
            border: none;
            border-top: 1px solid var(--border-color);
            width: 100%;
        }

        /* אזור התצוגה המקדימה של הדוח */
        .preview-area {
            flex: 1;
            display: flex;
            justify-content: center;
            align-items: flex-start;
            overflow-y: auto;
            padding-bottom: 20px;
        }

        /* הדוח עצמו */
        .report-page {
            background: white;
            box-shadow: 0 0 10px rgba(0,0,0,0.1);
            padding: 40px;
            border: 1px solid #ddd;
            margin: 0 auto;
            position: relative;
        }
        
        /* גדלים לדוח (מוצג באופן פרופורציונלי על המסך) */
        .report-page.size-a4 {
            width: 210mm;
            min-height: 297mm;
        }
        .report-page.size-a5 {
            width: 148mm;
            min-height: 210mm;
        }

        .report-header {
            text-align: center;
            border-bottom: 2px solid var(--accent-black);
            padding-bottom: 20px;
            margin-bottom: 30px;
        }
        .report-header h1 {
            margin: 0;
            font-size: 28px;
            letter-spacing: 1px;
        }
        .report-meta {
            display: flex;
            justify-content: space-between;
            margin-top: 15px;
            font-size: 16px;
            color: var(--text-muted);
        }
        .student-info {
            margin-bottom: 30px;
            font-size: 18px;
        }
        
        /* טבלת נתונים בדוח */
        .report-table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 30px;
        }
        .report-table th, .report-table td {
            border: 1px solid var(--border-color);
            padding: 10px;
            text-align: center;
        }
        .report-table th {
            background-color: #f9f9f9;
            font-weight: bold;
        }
        .status-pass { font-weight: bold; }
        .status-fail { font-weight: bold; color: #555; text-decoration: underline; }

        .report-footer {
            margin-top: 40px;
            text-align: center;
            font-size: 14px;
            color: var(--text-muted);
            border-top: 1px solid var(--border-color);
            padding-top: 10px;
        }

        /* עיצוב הדפסה */
        @media print {
            body {
                background: white;
            }
            .tabs-header, .settings-sidebar, .btn {
                display: none !important;
            }
            .tab-content {
                padding: 0;
                display: block !important;
            }
            .preview-area {
                padding: 0;
                overflow: visible;
                display: block;
            }
            .report-page {
                box-shadow: none;
                border: none;
                margin: 0;
                padding: 0;
                width: 100% !important;
                min-height: auto !important;
            }
            
            /* התאמת גודל הדפסה לקביעה מההגדרות באמצעות משתני CSS שנוסיף בJS */
            @page {
                size: var(--print-size, A5);
                margin: 1cm;
            }
        }
    </style>
</head>
<body>

    <!-- טאבים -->
    <div class="tabs-header">
        <button class="tab-btn active" onclick="switchTab('tab-report', this)">הפקת דוח תלמיד</button>
        <button class="tab-btn" onclick="switchTab('tab-advanced', this)">דוחות נתונים מתקדמים</button>
    </div>

    <!-- אזור הפקת דוח אישי -->
    <div id="tab-report" class="tab-content active">
        
        <!-- סרגל הגדרות פאנל ימני -->
        <div class="settings-sidebar">
            <h3>הגדרות דוח</h3>
            
            <div class="form-group">
                <label for="student-select">בחר תלמיד:</label>
                <select id="student-select" onchange="updateReport()">
                    <option value="12345">ישראל ישראלי</option>
                    <option value="67890">אברהם אברהמי</option>
                </select>
            </div>

            <div class="form-group">
                <label class="checkbox-group">
                    <input type="checkbox" id="show-code-cb" onchange="updateReport()">
                    הצג קוד תלמיד בדוח
                </label>
            </div>

            <div class="form-group">
                <label for="page-size-select">גודל דף הדפסה:</label>
                <select id="page-size-select" onchange="updateReport()">
                    <option value="a5">A5 (מומלץ)</option>
                    <option value="a4">A4 (גדול)</option>
                </select>
            </div>

            <hr>

            <button class="btn btn-primary" onclick="printReport()">🖨️ הדפס דוח נוכחי</button>
            <button class="btn" onclick="exportPDF()">📄 הורד כ-PDF</button>
            <button class="btn" onclick="exportStudentExcel()">📊 ייצא ציוני תלמיד לאקסל</button>

            <hr>
            <h3>ייצוא נתונים כללי</h3>
            <button class="btn" onclick="exportDatabase('history')">היסטורית מבחנים מלאה</button>
            <button class="btn" onclick="exportDatabase('students')">רשימת תלמידים</button>
            <button class="btn" onclick="exportDatabase('tests')">רשימת מבחנים</button>
        </div>

        <!-- תצוגה מקדימה -->
        <div class="preview-area">
            <div id="report-container" class="report-page size-a5">
                <div class="report-header">
                    <h1>דוח סיכום</h1>
                    <div class="report-meta">
                        <span id="heb-date-display"></span>
                        <span>שנת לימודים תשפ"ו</span>
                    </div>
                </div>
                
                <div class="student-info">
                    <strong>שם התלמיד: </strong> <span id="display-student-name">ישראל ישראלי</span>
                    <span id="display-student-code-wrapper" style="display:none;">
                        | <strong>קוד: </strong> <span id="display-student-code">12345</span>
                    </span>
                </div>

                <table class="report-table" id="grades-table">
                    <thead>
                        <tr>
                            <th>שם המבחן</th>
                            <th>תאריך</th>
                            <th>ציון</th>
                            <th>סטטוס</th>
                        </tr>
                    </thead>
                    <tbody id="grades-tbody">
                        <!-- נתונים יוזנו ע"י JavaScript -->
                    </tbody>
                </table>

                <div class="report-footer">
                    הופק באמצעות מערכת הדוחות • חתימת המנהל: ____________
                </div>
            </div>
        </div>
    </div>

    <!-- אזור דוחות מתקדמים -->
    <div id="tab-advanced" class="tab-content">
        <div class="development-notice">
            אזור דוחות מתקדמים נמצא כעת בפיתוח ועדיין לא הושלם.
        </div>
    </div>

    <script>
        // --- נתוני דמה (Mock Data) ---
        const studentsData = {
            "12345": { name: "ישראל ישראלי", tests: [
                { name: "מבחן פתיחה", date: "01/09/2026", score: 95 },
                { name: "מבחן אמצע", date: "15/09/2026", score: 82 },
                { name: "מבחן מסכם", date: "30/09/2026", score: 54 }
            ]},
            "67890": { name: "אברהם אברהמי", tests: [
                { name: "מבחן פתיחה", date: "01/09/2026", score: 88 },
                { name: "מבחן אמצע", date: "15/09/2026", score: 91 },
                { name: "מבחן מסכם", date: "30/09/2026", score: 97 }
            ]}
        };

        const passingGrade = 60;

        // הפעלת עדכון ראשוני בעליית העמוד
        document.addEventListener("DOMContentLoaded", () => {
            setHebrewDate();
            updateReport();
        });

        // החלפת טאבים
        function switchTab(tabId, btnElement) {
            document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
            document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
            
            document.getElementById(tabId).classList.add('active');
            btnElement.classList.add('active');
        }

        // חישוב והצגת תאריך עברי באמצעות API מובנה בדפדפן
        function setHebrewDate() {
            try {
                const date = new Date();
                const hebrewDateStr = new Intl.DateTimeFormat('he-IL-u-ca-hebrew', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                }).format(date);
                document.getElementById('heb-date-display').innerText = `תאריך הפקה: ${hebrewDateStr}`;
            } catch (e) {
                document.getElementById('heb-date-display').innerText = "תאריך הפקה: " + new Date().toLocaleDateString('he-IL');
            }
        }

        // עדכון הדוח בהתאם להגדרות (צד ימין)
        function updateReport() {
            const studentId = document.getElementById('student-select').value;
            const showCode = document.getElementById('show-code-cb').checked;
            const pageSize = document.getElementById('page-size-select').value;
            const reportContainer = document.getElementById('report-container');

            const student = studentsData[studentId];

            // עדכון פרטי תלמיד
            document.getElementById('display-student-name').innerText = student.name;
            document.getElementById('display-student-code').innerText = studentId;
            document.getElementById('display-student-code-wrapper').style.display = showCode ? 'inline' : 'none';

            // עדכון גודל דף בתצוגה ובמשתנה הCSS להדפסה
            reportContainer.className = `report-page size-${pageSize}`;
            document.documentElement.style.setProperty('--print-size', pageSize.toUpperCase());

            // בניית טבלת ציונים
            const tbody = document.getElementById('grades-tbody');
            tbody.innerHTML = ""; // ניקוי טבלה
            
            student.tests.forEach(test => {
                const tr = document.createElement('tr');
                const isPass = test.score >= passingGrade;
                const statusText = isPass ? "עבר" : "נכשל";
                const statusClass = isPass ? "status-pass" : "status-fail";

                tr.innerHTML = `
                    <td>${test.name}</td>
                    <td>${test.date}</td>
                    <td>${test.score}</td>
                    <td class="${statusClass}">${statusText}</td>
                `;
                tbody.appendChild(tr);
            });
        }

        // פונקציית הדפסה
        function printReport() {
            window.print();
        }

        // פונקציית ייצוא ל-PDF באמצעות html2pdf
        function exportPDF() {
            const element = document.getElementById('report-container');
            const pageSize = document.getElementById('page-size-select').value;
            const studentName = document.getElementById('display-student-name').innerText;
            
            const opt = {
                margin:       10,
                filename:     `דוח_תלמיד_${studentName.replace(/ /g, '_')}.pdf`,
                image:        { type: 'jpeg', quality: 0.98 },
                html2canvas:  { scale: 2, useCORS: true },
                jsPDF:        { unit: 'mm', format: pageSize, orientation: 'portrait' }
            };

            html2pdf().set(opt).from(element).save();
        }

        // פונקציית ייצוא טבלת התלמיד הנוכחי לאקסל
        function exportStudentExcel() {
            const studentName = document.getElementById('display-student-name').innerText;
            const table = document.getElementById('grades-table');
            const wb = XLSX.utils.table_to_book(table, {sheet: "ציונים"});
            XLSX.writeFile(wb, `ציונים_${studentName.replace(/ /g, '_')}.xlsx`);
        }

        // פונקציית ייצוא בסיס נתונים (דמה) לאקסל
        function exportDatabase(type) {
            let data = [];
            let filename = "";

            if (type === 'students') {
                for (let id in studentsData) {
                    data.push({ "קוד תלמיד": id, "שם תלמיד": studentsData[id].name });
                }
                filename = "רשימת_תלמידים.xlsx";
            } 
            else if (type === 'tests') {
                data = [
                    { "קוד מבחן": "T1", "שם מבחן": "מבחן פתיחה", "תאריך יעד": "01/09/2026" },
                    { "קוד מבחן": "T2", "שם מבחן": "מבחן אמצע", "תאריך יעד": "15/09/2026" },
                    { "קוד מבחן": "T3", "שם מבחן": "מבחן מסכם", "תאריך יעד": "30/09/2026" }
                ];
                filename = "רשימת_מבחנים.xlsx";
            } 
            else if (type === 'history') {
                for (let id in studentsData) {
                    studentsData[id].tests.forEach(test => {
                        data.push({ 
                            "קוד תלמיד": id, 
                            "שם תלמיד": studentsData[id].name,
                            "מבחן": test.name,
                            "תאריך": test.date,
                            "ציון": test.score,
                            "סטטוס": test.score >= passingGrade ? "עבר" : "נכשל"
                        });
                    });
                }
                filename = "היסטורית_מבחנים_מלאה.xlsx";
            }

            const ws = XLSX.utils.json_to_sheet(data);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, "נתונים");
            XLSX.writeFile(wb, filename);
        }
    </script>
</body>
</html>
