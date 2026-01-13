(function() {
  // Parse markdown tables from raw markdown (before HTML escaping)
  function parseTable(lines: string[], startIndex: number): { html: string; endIndex: number } {
    const tableLines: string[] = [];
    let i = startIndex;
    
    // Collect all table lines
    while (i < lines.length && lines[i].includes('|')) {
      tableLines.push(lines[i]);
      i++;
    }
    
    if (tableLines.length < 2) {
      return { html: '', endIndex: startIndex };
    }
    
    // Parse header - split by | but handle leading/trailing pipes
    const headerParts = tableLines[0].split('|');
    // Remove empty first/last elements from leading/trailing pipes
    const headerCells = headerParts.slice(
      headerParts[0].trim() === '' ? 1 : 0,
      headerParts[headerParts.length - 1].trim() === '' ? -1 : undefined
    ).map(c => c.trim());
    
    // Skip separator line (index 1)
    const bodyRows = tableLines.slice(2);
    
    let html = '<table><thead><tr>';
    for (const cell of headerCells) {
      // Escape HTML in cell content and apply inline formatting
      const escaped = cell.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const formatted = escaped.replace(/`([^`]+)`/g, '<code>$1</code>');
      html += '<th>' + formatted + '</th>';
    }
    html += '</tr></thead><tbody>';
    
    for (const row of bodyRows) {
      const rowParts = row.split('|');
      // Remove empty first/last elements from leading/trailing pipes, preserve middle empties
      const cells = rowParts.slice(
        rowParts[0].trim() === '' ? 1 : 0,
        rowParts[rowParts.length - 1].trim() === '' ? -1 : undefined
      ).map(c => c.trim());
      html += '<tr>';
      for (const cell of cells) {
        // Escape HTML in cell content and apply inline formatting
        const escaped = cell.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const formatted = escaped.replace(/`([^`]+)`/g, '<code>$1</code>');
        html += '<td>' + formatted + '</td>';
      }
      html += '</tr>';
    }
    html += '</tbody></table>';
    
    return { html, endIndex: i - 1 };
  }

  // Simple markdown parser
  function parseMarkdown(md: string): string {
    // First, extract and preserve code blocks (handle with or without language)
    const codeBlocks: string[] = [];
    let content = md.replace(/```([^\n\r]*)([\r\n])([\s\S]*?)```/g, (_, lang, _newline, code) => {
      const index = codeBlocks.length;
      const escapedCode = code.trim()
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
      const langTrimmed = lang.trim();
      const langClass = langTrimmed ? ' class="language-' + langTrimmed + '"' : '';
      codeBlocks.push('<pre><code' + langClass + '>' + escapedCode + '</code></pre>');
      return '\n%%CODEBLOCK' + index + '%%\n';
    });
    
    // Extract and process tables BEFORE HTML escaping
    const tables: string[] = [];
    const rawLines = content.split('\n');
    const tableProcessedLines: string[] = [];
    
    for (let i = 0; i < rawLines.length; i++) {
      const line = rawLines[i];
      // Check for table start (line with | followed by separator line with dashes)
      if (line.includes('|') && i + 1 < rawLines.length && /^[\s|:-]+$/.test(rawLines[i + 1]) && rawLines[i + 1].includes('-')) {
        const { html: tableHtml, endIndex } = parseTable(rawLines, i);
        if (tableHtml) {
          const tableIndex = tables.length;
          tables.push(tableHtml);
          tableProcessedLines.push('%%TABLE' + tableIndex + '%%');
          i = endIndex;
          continue;
        }
      }
      tableProcessedLines.push(line);
    }
    content = tableProcessedLines.join('\n');
    
    // Escape HTML in remaining content
    let html = content.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    
    // Inline code
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
    
    // Headers
    html = html.replace(/^#### (.+)$/gm, '<h4>$1</h4>');
    html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
    html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
    html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');
    
    // Bold and italic
    html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
    
    // Blockquotes
    html = html.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>');
    
    // Horizontal rules
    html = html.replace(/^---$/gm, '<hr>');
    
    // Links
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
    
    // Process lines for lists
    const htmlLines = html.split('\n');
    let inList = false;
    const finalLines: string[] = [];
    
    for (let i = 0; i < htmlLines.length; i++) {
      const line = htmlLines[i];
      
      // Check for list items
      const listMatch = line.match(/^[-*] (.+)$/);
      
      if (listMatch) {
        if (!inList) {
          finalLines.push('<ul>');
          inList = true;
        }
        finalLines.push('<li>' + listMatch[1] + '</li>');
      } else {
        if (inList) {
          finalLines.push('</ul>');
          inList = false;
        }
        finalLines.push(line);
      }
    }
    if (inList) finalLines.push('</ul>');
    html = finalLines.join('\n');
    
    // Paragraphs - wrap remaining text blocks
    html = html.replace(/^(?!<[hupblo]|<\/|<li|<hr|<pre|<code|<table|<t[hdr]|%%CODEBLOCK|%%TABLE)(.+)$/gm, '<p>$1</p>');
    
    // Clean up empty paragraphs
    html = html.replace(/<p>\s*<\/p>/g, '');
    
    // Restore tables
    for (let i = 0; i < tables.length; i++) {
      html = html.replace('%%TABLE' + i + '%%', tables[i]);
    }
    
    // Restore code blocks (also remove any wrapping <p> tags)
    for (let i = 0; i < codeBlocks.length; i++) {
      html = html.replace('<p>%%CODEBLOCK' + i + '%%</p>', codeBlocks[i]);
      html = html.replace('%%CODEBLOCK' + i + '%%', codeBlocks[i]);
    }
    
    // Clean up any remaining empty paragraphs after restoration
    html = html.replace(/<p>\s*<\/p>/g, '');
    
    return html;
  }

  async function loadDocument(filename: string): Promise<void> {
    const loading = document.getElementById('loading');
    const content = document.getElementById('markdown-content');
    
    if (loading) loading.style.display = 'block';
    if (content) content.innerHTML = '';
    
    try {
      const response = await fetch('/docs/' + filename);
      if (!response.ok) {
        throw new Error('Document not found');
      }
      
      const markdown = await response.text();
      const html = parseMarkdown(markdown);
      
      if (loading) loading.style.display = 'none';
      if (content) content.innerHTML = html;
      
      // Update active link
      document.querySelectorAll('.doc-link').forEach(link => {
        const href = link.getAttribute('href') || '';
        link.classList.toggle('active', href.includes(filename));
      });
      
      // Update page title
      const h1 = content?.querySelector('h1');
      if (h1) {
        document.title = h1.textContent + ' - Kingdoms of Avarice';
      }
    } catch (error) {
      if (loading) loading.style.display = 'none';
      if (content) {
        content.innerHTML = '<h1>Document Not Found</h1><p>The requested documentation file could not be loaded.</p>';
      }
    }
  }

  function init(): void {
    // Get file from URL params
    const params = new URLSearchParams(window.location.search);
    const file = params.get('file') || 'README.md';
    
    loadDocument(file);
    
    // Handle link clicks for SPA-style navigation
    document.querySelectorAll('.doc-link').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const href = link.getAttribute('href') || '';
        const url = new URL(href, window.location.origin);
        const filename = url.searchParams.get('file') || 'README.md';
        
        window.history.pushState({}, '', href);
        loadDocument(filename);
      });
    });
    
    // Handle browser back/forward
    window.addEventListener('popstate', () => {
      const params = new URLSearchParams(window.location.search);
      const file = params.get('file') || 'README.md';
      loadDocument(file);
    });
  }

  document.addEventListener('DOMContentLoaded', init);
})();
