export function openReferenceView(sourceName: string, pageNumber: number, excerpt: string) {
  const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Reference: ${sourceName} - Page ${pageNumber}</title>
      <style>
        :root {
          --bg: #faf9f6; /* Warm off-white */
          --fg: #1a202c;
          --accent: #f59e0b; /* Amber */
          --surface: #ffffff;
        }
        @media (prefers-color-scheme: dark) {
          :root {
            --bg: #0f172a;
            --fg: #f8fafc;
            --surface: #1e293b;
          }
        }
        body {
          font-family: system-ui, -apple-system, sans-serif;
          background-color: var(--bg);
          color: var(--fg);
          line-height: 1.6;
          margin: 0;
          padding: 2rem;
          display: flex;
          justify-content: center;
        }
        .container {
          max-width: 800px;
          width: 100%;
          background: var(--surface);
          padding: 3rem;
          border-radius: 1rem;
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
        }
        .header {
          border-bottom: 2px solid var(--accent);
          padding-bottom: 1rem;
          margin-bottom: 2rem;
        }
        .title { margin: 0 0 0.5rem 0; font-size: 1.5rem; }
        .page { color: var(--accent); font-weight: 600; }
        .excerpt {
          font-size: 1.125rem;
          white-space: pre-wrap;
          font-family: ui-serif, Georgia, serif;
        }
        .highlight {
          background-color: rgba(245, 158, 11, 0.2);
          padding: 2px 4px;
          border-radius: 4px;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1 class="title">${sourceName}</h1>
          <div class="page">Page ${pageNumber}</div>
        </div>
        <div class="excerpt">
          ${excerpt.replace(/\\n/g, '<br/>')}
        </div>
      </div>
    </body>
    </html>
  `;
  
  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank');
}
