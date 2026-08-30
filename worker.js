// ייבוא הקבצים כמודולים של טקסט (בזכות ההגדרות ב-wrangler.toml)
import indexHtml from './index.html';
import stylesCss from './styles.css';
import clientAppJs from './client-app.js';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    // 1. הגשת דף הבית (HTML)
    // מגיב גם לנתיב הראשי וגם ל-/index.html
    if (path === '/' || path === '/index.html') {
      return new Response(indexHtml, { 
        status: 200,
        headers: { 'Content-Type': 'text/html; charset=utf-8' } 
      });
    }

    // 2. הגשת קובץ העיצוב (CSS)
    if (path === '/styles.css') {
      return new Response(stylesCss, { 
        status: 200,
        headers: { 'Content-Type': 'text/css; charset=utf-8' } 
      });
    }

    // 3. הגשת קובץ הלוגיקה של צד הלקוח (JS)
    if (path === '/client-app.js') {
      return new Response(clientAppJs, { 
        status: 200,
        headers: { 'Content-Type': 'application/javascript; charset=utf-8' } 
      });
    }

    // 4. טיפול בשגיאות - נתיב שלא קיים
    return new Response('404 - Not Found', { 
      status: 404,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    });
  }
};
