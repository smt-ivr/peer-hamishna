// ... (כל החלק העליון והקוד נשארים אותו דבר)
// עדכון החלק הספציפי בפונקציה submitExams:

    async submitExams() {
        const submitBtn = document.getElementById('submitExamsBtn');
        const feedbackBox = document.getElementById('serverFeedback');
        
        const rows = document.querySelectorAll('.exam-row-item');
        const examsPayload = [];

        rows.forEach(row => {
            const code = row.querySelector('.exam-code-input').value.trim();
            const activeToggle = row.querySelector('.toggle-btn.active');
            if (code && activeToggle) {
                const passed = activeToggle.dataset.value === 'true';
                examsPayload.push({ exam_code: code, passed: passed });
            }
        });

        if (examsPayload.length === 0) return;

        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> מעדכן...';
        feedbackBox.className = 'server-feedback hidden';

        try {
            const response = await fetch(`${this.apiBase}/student-exams`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    student_code: this.currentStudent.student_code,
                    exams: examsPayload
                })
            });

            if (response.ok) {
                const result = await response.json();
                this.renderServerFeedback(result);
                await this.loadStudentData(this.currentStudent.student_code, true);
                document.getElementById('examRowsContainer').innerHTML = this.generateEmptyRowHtml();
            } else {
                // משיכת הודעת השגיאה המפורשת מהשרת (message)
                const errData = await response.json().catch(() => ({}));
                throw new Error(errData.message || 'שגיאת מערכת, הנתונים לא נשמרו.');
            }
        } catch (error) {
            feedbackBox.className = 'server-feedback error-box';
            feedbackBox.innerHTML = `<i class="fas fa-exclamation-triangle"></i> ${error.message}`;
            feedbackBox.classList.remove('hidden');
        } finally {
            this.updateRemoveButtonsState();
            this.updateSaveButtonCount();
        }
    }

// ... (שאר הקובץ ללא שינוי, העתק את כל הפונקציות האחרות מ-client-exam-update.js המקורי שלך)
