export class HistoryManager {
    constructor(container, apiBase) {
        this.container = container;
        this.apiBase = apiBase;
        this.historyData = [];
        this.studentsMap = {};
        this.examsMap = {};
    }

    async loadAndRender(students, exams) {
        students.forEach(s => this.studentsMap[s.student_code] = `${s.first_name} ${s.last_name}`);
        exams.forEach(e => {
            let desc = e.exam_code;
            if (e.details) {
                desc = Object.values(e.details).join(', ');
            }
            this.examsMap[e.exam_code] = desc;
        });

        this.container.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i> טוען היסטוריית מבחנים...</div>';

        try {
            const response = await fetch(`${this.apiBase}/student-exams`);
            if (response.ok) {
                this.historyData = await response.json();
                this.render();
            } else {
                this.container.innerHTML = '<div class="card error-card">שגיאה בטעינת היסטוריית מבחנים.</div>';
            }
        } catch (error) {
            this.container.innerHTML = '<div class="card error-card">שגיאת תקשורת במשיכת ההיסטוריה.</div>';
        }
    }

    render() {
        this.historyData.sort((a, b) => new Date(b.updated_at.replace(' ', 'T')) - new Date(a.updated_at.replace(' ', 'T')));

        const html = `
            <div class="card compact-card" style="display: flex; flex-direction: column; height: 100%;">
                <div class="compact-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; flex-wrap: wrap; gap: 10px;">
                    <h3 style="margin: 0;"><i class="fas fa-history"></i> היסטוריית עדכונים כללית</h3>
                    <div style="display: flex; gap: 10px; align-items: center;">
                        <button class="btn btn-outline btn-sm" id="exportHistoryBtn"><i class="fas fa-file-excel"></i> ייצוא לאקסל</button>
                        <div class="search-box" style="width: 250px;">
                            <i class="fas fa-search search-icon"></i>
                            <input type="text" id="filterHistory" placeholder="חיפוש תלמיד או מבחן..." autocomplete="off" style="padding: 6px 30px 6px 10px;">
                        </div>
                    </div>
                </div>
                <div class="table-container" style="flex: 1; overflow-y: auto;">
                    <table class="modern-table sticky-header">
                        <thead>
                            <tr>
                                <th>תאריך עדכון</th>
                                <th>תלמיד</th>
                                <th>מבחן</th>
                                <th>סטטוס</th>
                                <th>פעולות</th>
                            </tr>
                        </thead>
                        <tbody id="historyTableBody">
                            ${this.generateRows(this.historyData)}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
        this.container.innerHTML = html;
        this.attachEvents();
    }

    generateRows(data) {
        if (data.length === 0) return '<tr><td colspan="5" class="text-center text-muted" style="padding:20px;">לא נמצאו רשומות</td></tr>';

        return data.map(row => {
            const studentName = this.studentsMap[row.student_code] || 'לא ידוע';
            const examDesc = this.examsMap[row.exam_code] || row.exam_code;
            const dateObj = new Date(row.updated_at.replace(' ', 'T'));
            const formattedDate = !isNaN(dateObj) ? dateObj.toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' }) : row.updated_at;
            
            return `
                <tr>
                    <td dir="ltr" style="text-align: right; color: var(--text-muted); font-size: 0.8rem;">${formattedDate}</td>
                    <td><strong>${row.student_code}</strong> - ${studentName}</td>
                    <td title="${examDesc}"><strong>${row.exam_code}</strong> <span class="text-muted" style="font-size:0.75rem;">(${examDesc})</span></td>
                    <td>
                        <span class="status-pill ${row.passed ? 'success' : 'danger'}">
                            <i class="fas ${row.passed ? 'fa-check' : 'fa-times'}"></i> ${row.passed ? 'עבר' : 'לא עבר'}
                        </span>
                    </td>
                    <td>
                        <button class="btn btn-icon-danger btn-sm delete-history-btn" data-student="${row.student_code}" data-exam="${row.exam_code}" title="מחק רישום מבחן זה">
                            <i class="fas fa-trash"></i>
                        </button>
                    </td>
                </tr>
            `;
        }).join('');
    }

    attachEvents() {
        const input = document.getElementById('filterHistory');
        const tbody = document.getElementById('historyTableBody');

        input.addEventListener('input', (e) => {
            const term = e.target.value.trim().toLowerCase();
            const filtered = this.historyData.filter(row => {
                const studentStr = `${row.student_code} ${this.studentsMap[row.student_code] || ''}`.toLowerCase();
                const examStr = `${row.exam_code} ${this.examsMap[row.exam_code] || ''}`.toLowerCase();
                return studentStr.includes(term) || examStr.includes(term);
            });
            tbody.innerHTML = this.generateRows(filtered);
        });

        tbody.addEventListener('click', async (e) => {
            const deleteBtn = e.target.closest('.delete-history-btn');
            if (deleteBtn) {
                const studentCode = deleteBtn.dataset.student;
                const examCode = deleteBtn.dataset.exam;
                if (confirm(`האם אתה בטוח שברצונך למחוק את רישום המבחן (${examCode}) לתלמיד ${studentCode}?`)) {
                    await this.deleteRecord(studentCode, examCode, deleteBtn);
                }
            }
        });

        document.getElementById('exportHistoryBtn').addEventListener('click', () => {
            this.exportToExcel();
        });
    }

    exportToExcel() {
        let csvContent = '\uFEFF';
        csvContent += 'תאריך עדכון,קוד תלמיד,שם תלמיד,קוד מבחן,תיאור מבחן,סטטוס\n';
        
        this.historyData.forEach(row => {
            const studentName = this.studentsMap[row.student_code] || '';
            const examDesc = this.examsMap[row.exam_code] || '';
            const status = row.passed ? 'עבר' : 'לא עבר';
            csvContent += `"${row.updated_at}","${row.student_code}","${studentName}","${row.exam_code}","${examDesc}","${status}"\n`;
        });

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = `היסטוריית_עדכונים_${new Date().toISOString().slice(0,10)}.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    async deleteRecord(studentCode, examCode, btnElement) {
        btnElement.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        btnElement.disabled = true;

        try {
            const response = await fetch(`${this.apiBase}/student-exams/${studentCode}/${examCode}`, {
                method: 'DELETE'
            });
            if (response.ok) {
                this.historyData = this.historyData.filter(r => !(r.student_code === studentCode && r.exam_code === examCode));
                document.getElementById('filterHistory').dispatchEvent(new Event('input'));
            } else {
                alert('שגיאה במחיקת הרשומה.');
                btnElement.innerHTML = '<i class="fas fa-trash"></i>';
                btnElement.disabled = false;
            }
        } catch (error) {
            alert('שגיאת תקשורת במערכת.');
            btnElement.innerHTML = '<i class="fas fa-trash"></i>';
            btnElement.disabled = false;
        }
    }
}
