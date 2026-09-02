export class ExamManager {
    constructor(container) {
        this.container = container;
        this.exams = [];
    }

    render(exams) {
        this.exams = exams;
        
        const html = `
            <div class="card compact-card" style="display: flex; flex-direction: column; height: 100%;">
                <div class="compact-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                    <h3 style="margin: 0;"><i class="fas fa-file-alt"></i> מאגר המבחנים</h3>
                    <div class="search-box" style="width: 250px;">
                        <i class="fas fa-search search-icon"></i>
                        <input type="text" id="filterExams" placeholder="חיפוש קוד או פרטים..." autocomplete="off" style="padding: 6px 10px 6px 30px;">
                    </div>
                </div>
                
                <div class="table-container" style="flex: 1; overflow-y: auto;">
                    <table class="modern-table sticky-header">
                        <thead>
                            <tr>
                                <th>קוד</th>
                                <th>סוג</th>
                                <th>כיתת יעד</th>
                                <th>פרטים מלאים</th>
                                <th>שווי (₪)</th>
                            </tr>
                        </thead>
                        <tbody id="examsTableBody">
                            ${this.generateTableRows(this.exams)}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
        
        this.container.innerHTML = html;
        this.attachEvents();
    }

    generateTableRows(data) {
        if(data.length === 0) return '<tr><td colspan="5" class="text-center">לא נמצאו מבחנים</td></tr>';
        
        return data.map(ex => {
            let detailsText = 'ללא פרטים';
            if (ex.details) {
                if (ex.exam_type === 'mishnayot') {
                    const title = ex.details.chapter_title ? ` - ${ex.details.chapter_title}` : '';
                    detailsText = `${ex.details.masechet || ''} - פרק ${ex.details.chapter_name || ''}${title} (${ex.details.total_mishnayot} משניות)`;
                } else if (ex.exam_type === 'gemara') {
                    detailsText = `${ex.details.masechet || ''} | ${ex.details.from_page || ''} עד ${ex.details.to_page || ''} (${ex.details.gemara_pages || 0} דפים)`;
                } else {
                    detailsText = Object.values(ex.details).join(', ');
                }
            }
            
            const typeLabel = ex.exam_type === 'mishnayot' ? 'משניות' : (ex.exam_type === 'gemara' ? 'גמרא' : 'כללי');
            const typeClass = ex.exam_type === 'mishnayot' ? 'type-mishnayot' : 'type-gemara';

            return `
                <tr>
                    <td><strong>${ex.exam_code}</strong></td>
                    <td><span class="type-badge ${typeClass}">${typeLabel}</span></td>
                    <td><span class="badge badge-info">${ex.target_grade || 'כללי'}</span></td>
                    <td class="exam-details-cell" title="${detailsText}">${detailsText}</td>
                    <td><span class="reward-badge">₪${ex.reward_price ? ex.reward_price.toFixed(1) : '0.0'}</span></td>
                </tr>
            `;
        }).join('');
    }

    attachEvents() {
        const input = document.getElementById('filterExams');
        const tbody = document.getElementById('examsTableBody');

        input.addEventListener('input', (e) => {
            const term = e.target.value.trim().toLowerCase();
            const filtered = this.exams.filter(ex => {
                const codeMatch = ex.exam_code.toLowerCase().includes(term);
                const detailsMatch = ex.details ? Object.values(ex.details).some(val => String(val).toLowerCase().includes(term)) : false;
                return codeMatch || detailsMatch;
            });
            tbody.innerHTML = this.generateTableRows(filtered);
        });
    }
}
