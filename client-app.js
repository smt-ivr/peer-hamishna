import { ExamUpdateManager } from './client-exam-update.js';

const API_BASE = 'https://smti.uk/peer/api';
let allStudents = [];
let examManager;

document.addEventListener('DOMContentLoaded', async () => {
    examManager = new ExamUpdateManager(API_BASE, document.getElementById('student-portal'), onSwitchStudent);
    await fetchStudentsList();
    setupSearchBox();
});

async function fetchStudentsList() {
    try {
        const response = await fetch(`${API_BASE}/students`);
        if(response.ok) {
            allStudents = await response.json();
        }
    } catch(error) {
        console.error('שגיאה בטעינת תלמידים:', error);
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

        renderSearchResults(filtered, resultsDropdown, searchInput);
    });

    document.addEventListener('click', (e) => {
        if(!searchInput.contains(e.target) && !resultsDropdown.contains(e.target)) {
            resultsDropdown.classList.add('hidden');
        }
    });
}

function renderSearchResults(results, container, inputElement) {
    container.innerHTML = '';
    if(results.length === 0) {
        container.innerHTML = '<div class="no-results">לא נמצאו תלמידים תואמים</div>';
    } else {
        results.forEach(student => {
            const item = document.createElement('div');
            item.className = 'search-result-item';
            item.innerHTML = `
                <div class="result-details">
                    <span class="result-name">${student.first_name} ${student.last_name}</span>
                    <span class="result-class">כיתה ${student.class_grade}</span>
                </div>
                <div class="result-code">קוד: ${student.student_code}</div>
            `;
            
            item.addEventListener('click', () => {
                inputElement.value = '';
                container.classList.add('hidden');
                document.getElementById('search-section').classList.add('hidden');
                examManager.loadStudentData(student.student_code);
            });
            container.appendChild(item);
        });
    }
    container.classList.remove('hidden');
}

function onSwitchStudent() {
    document.getElementById('student-portal').classList.add('hidden');
    document.getElementById('search-section').classList.remove('hidden');
    document.getElementById('studentSearch').value = '';
    document.getElementById('studentSearch').focus();
}
