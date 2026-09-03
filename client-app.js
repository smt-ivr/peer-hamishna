import { ExamUpdateManager } from './client-exam-update.js';
import { StudentManager } from './client-students.js';
import { ExamManager } from './client-exams.js';
import { HistoryManager } from './client-history.js';

const API_BASE = 'https://smti.uk/peer/api';
let allStudents = [];
let allExams = [];
let examManager;
let studentManager;
let examListManager;
let historyManager;

document.addEventListener('DOMContentLoaded', async () => {
    // אתחול המנהלים
    examManager = new ExamUpdateManager(API_BASE, document.getElementById('student-portal'), onSwitchStudent);
    studentManager = new StudentManager(document.getElementById('view-students'), goToStudentUpdate);
    examListManager = new ExamManager(document.getElementById('view-exams'));
    historyManager = new HistoryManager(document.getElementById('view-history'), API_BASE);
    
    setupTabs();
    setupSearchBox();

    // טעינת נתונים
    await Promise.all([fetchStudentsList(), fetchExamsList()]);
    
    examManager.setExams(allExams);
    studentManager.render(allStudents);
    examListManager.render(allExams);
    // טעינה ראשונית של היסטוריה ברקע
    historyManager.loadAndRender(allStudents, allExams);
});

function setupTabs() {
    const menuItems = document.querySelectorAll('.menu-item');
    const views = document.querySelectorAll('.view-section');

    menuItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const targetId = item.getAttribute('data-target');
            
            // עדכון כפתורים פעילים
            menuItems.forEach(mi => mi.classList.remove('active'));
            item.classList.add('active');

            // החלפת תצוגות
            views.forEach(view => {
                if (view.id === targetId) {
                    view.classList.remove('hidden');
                    view.classList.add('active');
                    
                    // רענון טאב היסטוריה ברגע שנכנסים אליו כדי להציג את העדכון החדש ביותר
                    if (targetId === 'view-history') {
                        historyManager.loadAndRender(allStudents, allExams);
                    }
                } else {
                    view.classList.add('hidden');
                    view.classList.remove('active');
                }
            });
        });
    });
}

function goToStudentUpdate(studentCode) {
    document.querySelector('[data-target="view-update"]').click();
    document.getElementById('studentSearch').value = '';
    document.getElementById('search-section').classList.add('hidden');
    examManager.loadStudentData(studentCode);
}

async function fetchStudentsList() {
    try {
        const response = await fetch(`${API_BASE}/students?full_details=true`);
        if(response.ok) {
            allStudents = await response.json();
        }
    } catch(error) {
        console.error('שגיאה בטעינת תלמידים:', error);
    }
}

async function fetchExamsList() {
    try {
        const response = await fetch(`${API_BASE}/exams`);
        if(response.ok) {
            allExams = await response.json();
        }
    } catch(error) {
        console.error('שגיאה בטעינת מבחנים:', error);
    }
}

function setupSearchBox() {
    const searchInput = document.getElementById('studentSearch');
    const resultsDropdown = document.getElementById('searchResults');

    searchInput.addEventListener('input', (e) => {
        const term = e.target.value.trim();
        if(term.length === 0) {
            resultsDropdown.innerHTML = '';
            resultsDropdown.classList.add('hidden');
            return;
        }

        const filtered = allStudents.filter(s => 
            s.student_code.includes(term) || 
            s.first_name.includes(term) || 
            s.last_name.includes(term) ||
            `${s.first_name} ${s.last_name}`.includes(term)
        );

        resultsDropdown.innerHTML = '';
        if(filtered.length === 0) {
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
                    document.getElementById('search-section').classList.add('hidden');
                    examManager.loadStudentData(student.student_code);
                });
                resultsDropdown.appendChild(item);
            });
        }
        resultsDropdown.classList.remove('hidden');
    });

    document.addEventListener('click', (e) => {
        if(!searchInput.contains(e.target) && !resultsDropdown.contains(e.target)) {
            resultsDropdown.classList.add('hidden');
        }
    });
}

function onSwitchStudent() {
    document.getElementById('student-portal').classList.add('hidden');
    document.getElementById('search-section').classList.remove('hidden');
    document.getElementById('studentSearch').value = '';
    document.getElementById('studentSearch').focus();
}
