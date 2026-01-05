
import { Chapter, Subject, Board, ClassLevel } from '../types';

export const generateSelfContainedHtml = (
    data: { title: string; sections: any[] },
    metadata: { board: string; classLevel: string; subject: string; chapter: string }
): string => {
    
    // EMBEDDED CSS (Minified for performance)
    const css = `
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;700&family=Noto+Sans+Devanagari:wght@400;700&display=swap');
    :root { --primary: #2563eb; --success: #16a34a; --alert: #dc2626; --info: #0284c7; --bg: #f8fafc; --text: #1e293b; }
    * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
    body { margin: 0; padding: 0; font-family: 'Inter', sans-serif; background: var(--bg); color: var(--text); line-height: 1.6; padding-bottom: 80px; }
    .hindi-text { font-family: 'Noto Sans Devanagari', sans-serif; }
    
    /* HEADER */
    .header { background: white; padding: 1rem; position: sticky; top: 0; z-index: 50; border-bottom: 1px solid #e2e8f0; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
    .header h1 { margin: 0; font-size: 1.25rem; font-weight: 900; color: #0f172a; }
    .header p { margin: 0.25rem 0 0; font-size: 0.75rem; color: #64748b; font-weight: 600; text-transform: uppercase; }
    
    /* TABS */
    .tabs { display: flex; gap: 0.5rem; padding: 0.75rem 1rem; background: white; overflow-x: auto; }
    .tab-btn { flex: 1; padding: 0.5rem; border: 1px solid #e2e8f0; border-radius: 0.5rem; background: #f1f5f9; color: #64748b; font-size: 0.75rem; font-weight: 700; cursor: pointer; transition: all 0.2s; white-space: nowrap; }
    .tab-btn.active { background: var(--primary); color: white; border-color: var(--primary); }
    
    /* CONTAINER */
    .container { max-width: 1200px; margin: 0 auto; padding: 1rem; }
    
    /* GRID SYSTEM */
    .content-grid { display: grid; gap: 1rem; }
    .split-view { grid-template-columns: 1fr 1fr; }
    .split-view .col { padding: 1rem; border-radius: 0.5rem; background: white; border: 1px solid #e2e8f0; }
    .single-view { grid-template-columns: 1fr; }
    .single-view .col { background: white; padding: 1.5rem; border-radius: 0.75rem; border: 1px solid #e2e8f0; }
    
    @media (max-width: 768px) {
        .split-view { grid-template-columns: 1fr; } /* Stack on mobile */
        .split-view .col:first-child { border-bottom: 1px dashed #e2e8f0; margin-bottom: 1rem; }
    }

    /* SECTION STYLES */
    .section-card { margin-bottom: 1.5rem; transition: transform 0.2s; }
    .section-title { font-size: 1.1rem; font-weight: 800; margin-bottom: 0.5rem; color: #0f172a; display: flex; align-items: center; gap: 0.5rem; }
    .section-content { font-size: 0.95rem; color: #334155; }
    .section-content ul { padding-left: 1.25rem; }
    .section-content li { margin-bottom: 0.5rem; }
    
    /* HIGHLIGHT TYPES */
    .type-info { border-left: 4px solid var(--info); background: #f0f9ff; padding: 1rem; border-radius: 0 0.5rem 0.5rem 0; }
    .type-alert { border-left: 4px solid var(--alert); background: #fef2f2; padding: 1rem; border-radius: 0 0.5rem 0.5rem 0; }
    .type-success { border-left: 4px solid var(--success); background: #f0fdf4; padding: 1rem; border-radius: 0 0.5rem 0.5rem 0; }
    .type-normal { }

    /* UTILS */
    .hidden { display: none; }
    img { max-width: 100%; height: auto; border-radius: 0.5rem; margin-top: 0.5rem; }
    .badge { display: inline-block; padding: 0.25rem 0.5rem; border-radius: 0.25rem; font-size: 0.65rem; font-weight: 700; text-transform: uppercase; margin-bottom: 0.5rem; }
    .badge-info { background: #e0f2fe; color: #0284c7; }
    .badge-alert { background: #fee2e2; color: #dc2626; }
    .badge-success { background: #dcfce7; color: #16a34a; }
    `;

    const js = `
    function setView(mode) {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.getElementById('btn-'+mode).classList.add('active');
        
        const grid = document.getElementById('main-grid');
        grid.className = 'content-grid'; // reset
        
        const enCols = document.querySelectorAll('.col-en');
        const hiCols = document.querySelectorAll('.col-hi');
        
        if (mode === 'split') {
            grid.classList.add('split-view');
            enCols.forEach(el => el.classList.remove('hidden'));
            hiCols.forEach(el => el.classList.remove('hidden'));
        } else if (mode === 'en') {
            grid.classList.add('single-view');
            enCols.forEach(el => el.classList.remove('hidden'));
            hiCols.forEach(el => el.classList.add('hidden'));
        } else {
            grid.classList.add('single-view');
            enCols.forEach(el => el.classList.add('hidden'));
            hiCols.forEach(el => el.classList.remove('hidden'));
        }
    }
    `;

    let bodyContent = '';

    data.sections.forEach((sec, idx) => {
        const typeClass = `type-${sec.type || 'normal'}`;
        const badge = sec.type && sec.type !== 'normal' 
            ? `<span class="badge badge-${sec.type}">${sec.type}</span>` 
            : '';
        
        // Sanitize content a bit (basic regex for markdown bold/italic)
        const format = (txt: string) => txt
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/\n/g, '<br>');

        bodyContent += `
        <div class="section-card ${typeClass}">
            ${badge}
            <div class="col-en">
                <div class="section-title">${sec.title}</div>
                <div class="section-content">${format(sec.contentEn)}</div>
            </div>
            <div class="col-hi hidden"> <!-- Hidden initially until JS runs, or managed by grid -->
                <div class="section-title hindi-text">${sec.titleHi || sec.title}</div> <!-- Title could be hindi too if provided -->
                <div class="section-content hindi-text">${format(sec.contentHi)}</div>
            </div>
        </div>
        `;
        
        // RE-STRUCTURE FOR GRID: 
        // We need a Row Wrapper for Split View to work per section? 
        // OR we duplicate the logic to match the "Split View" CSS requirements.
        // My CSS uses .split-view .col. 
        // Let's change the JS logic to toggle visibility of containers.
        // Actually, to side-by-side a single section, we need:
        /*
           <div class="row-wrapper">
              <div class="col col-en">...</div>
              <div class="col col-hi">...</div>
           </div>
        */
       // So I will rewrite bodyContent loop:
    });

    // RE-LOOP for correct structure
    let gridContent = '';
    data.sections.forEach((sec) => {
        const typeClass = `type-${sec.type || 'normal'}`;
        const format = (txt: string) => txt ? txt
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\n-/g, '<br>•')
            .replace(/\n/g, '<br>') : '';

        gridContent += `
        <div class="section-wrapper ${typeClass}" style="margin-bottom: 2rem; border-bottom: 1px solid #eee; padding-bottom: 1rem;">
             <!-- English Column -->
             <div class="col col-en">
                 <h3 class="section-title">${sec.title}</h3>
                 <div class="section-content">${format(sec.contentEn)}</div>
             </div>
             
             <!-- Hindi Column -->
             <div class="col col-hi">
                 <h3 class="section-title hindi-text">${sec.titleHi || sec.title}</h3>
                 <div class="section-content hindi-text">${format(sec.contentHi)}</div>
             </div>
        </div>
        `;
    });

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${data.title}</title>
    <style>${css}</style>
</head>
<body>
    <div class="header">
        <h1>${data.title}</h1>
        <p>${metadata.board} • ${metadata.classLevel} • ${metadata.subject}</p>
    </div>
    
    <div class="tabs">
        <button id="btn-split" class="tab-btn active" onclick="setView('split')">Split View (Dual)</button>
        <button id="btn-en" class="tab-btn" onclick="setView('en')">English Only</button>
        <button id="btn-hi" class="tab-btn" onclick="setView('hi')">Hindi Only</button>
    </div>

    <div id="main-grid" class="container content-grid split-view">
        ${gridContent}
    </div>

    <script>${js}</script>
</body>
</html>`;
};
