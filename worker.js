import indexHtml from './index.html';
import stylesCss from './styles.css';
import clientAppJs from './client-app.js';
import examUpdateJs from './exam-update.js'; // הקובץ החדש שלנו

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    // הגשת דף הבית
    if (path === '/peer' || path === '/peer/' || path === '/peer/index.html') {
      return new Response(indexHtml, { 
        status: 200,
        headers: { 'Content-Type': 'text/html; charset=utf-8' } 
      });
    }

    // הגשת קובץ העיצוב
    if (path === '/peer/styles.css') {
      return new Response(stylesCss, { 
        status: 200,
        headers: { 'Content-Type': 'text/css; charset=utf-8' } 
      });
    }

    // הגשת קובץ הלוגיקה הראשי
    if (path === '/peer/client-app.js') {
      return new Response(clientAppJs, { 
        status: 200,
        headers: { 'Content-Type': 'application/javascript; charset=utf-8' } 
      });
    }

    // הגשת קובץ עדכון המבחנים (החדש)
    if (path === '/peer/exam-update.js') {
      return new Response(examUpdateJs, { 
        status: 200,
        headers: { 'Content-Type': 'application/javascript; charset=utf-8' } 
      });
    }

    // שגיאת 404
    return new Response('404 - Not Found', { 
      status: 404,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    });
  }
};
