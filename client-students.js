export class StudentManager {
    constructor(container, onUpdateCallback) {
        this.container = container;
        this.onUpdateCallback = onUpdateCallback;
        this.students = [];
    }

    render(students) {
        this.students = students;
        
        const html = `
            <div class="card compact-card" style="display: flex; flex-direction: column; height: 100%;">
                <div class="compact-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                    <h3 style="margin: 0;"><i class="fas fa-users"></i> רשימת תלמידים</h3>
                    <div class="search-box" style="width: 250px;">
                        <i class="fas fa-search search-icon"></i>
                        <input type="text" id="filterStudents" placeholder="חיפוש מהיר בטבלה..." autocomplete="off" style="padding: 6px 30px 6px 10px;">
                    </div>
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
                                <th>פעולות</th>
                            </tr>
                        </thead>
                        <tbody id="studentsTableBody">
                            ${this.generateTableRows(this.students)}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
        
        this.container.innerHTML = html;
        this.attachEvents();
    }

    generateTableRows(data) {
        if(data.length === 0) return '<tr><td colspan="6" class="text-center">לא נמצאו תלמידים</td></tr>';
        
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
                    <td>
                        <button class="btn btn-secondary btn-sm action-update-btn" data-code="${s.student_code}">
                            <i class="fas fa-edit"></i> עדכן ציונים
                        </button>
                    </td>
                </tr>
            `;
        }).join('');
    }

    attachEvents() {
        const input = document.getElementById('filterStudents');
        const tbody = document.getElementById('studentsTableBody');

        input.addEventListener('input', (e) => {
            const term = e.target.value.trim().toLowerCase();
            const filtered = this.students.filter(s => 
                s.student_code.includes(term) || 
                s.first_name.includes(term) || 
                s.last_name.includes(term) ||
                (s.class_grade && s.class_grade.includes(term))
            );
            tbody.innerHTML = this.generateTableRows(filtered);
        });

        tbody.addEventListener('click', (e) => {
            const btn = e.target.closest('.action-update-btn');
            if (btn) {
                const code = btn.dataset.code;
                if (this.onUpdateCallback) this.onUpdateCallback(code);
            }
        });
    }
}
