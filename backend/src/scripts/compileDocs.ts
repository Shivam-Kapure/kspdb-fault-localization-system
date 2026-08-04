import * as fs from 'fs';
import * as path from 'path';
import { marked } from 'marked';
import { execSync } from 'child_process';

const workspaceRoot = path.join(__dirname, '..', '..', '..');

// Helper to read markdown file and convert to HTML
function getHtmlFromMd(filename: string): string {
  const filePath = path.join(workspaceRoot, filename);
  if (!fs.existsSync(filePath)) {
    console.warn(`Warning: ${filename} not found.`);
    return '';
  }
  const content = fs.readFileSync(filePath, 'utf8');
  // Clean up any local file:/// links so they look clean in print
  const cleanedContent = content.replace(/file:\/\/\/[^\)\s]*/g, (match) => {
    const parts = match.split('/');
    return parts[parts.length - 1];
  });
  return marked.parse(cleanedContent) as string;
}

function generateDocsPdf() {
  console.log('Compiling project markdown files...');

  const submissionHtml = getHtmlFromMd('SUBMISSION.md');
  const readmeHtml = getHtmlFromMd('README.md');
  const architectureHtml = getHtmlFromMd('ARCHITECTURE.md');
  const deploymentHtml = getHtmlFromMd('DEPLOYMENT.md');
  const decisionsHtml = getHtmlFromMd('DECISIONS.md');
  const aiWorkflowHtml = getHtmlFromMd('AI-WORKFLOW.md');

  const css = `
    @import url('https://fonts.googleapis.com/css2?family=Chivo:wght@400;600;800&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;700&display=swap');
    
    @page {
      size: A4;
      margin: 20mm;
      @bottom-right {
        content: counter(page);
      }
    }
    
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
      font-size: 11pt;
      line-height: 1.6;
      color: #1a1a1a;
      background: #ffffff;
      margin: 0;
      padding: 0;
    }
    
    h1, h2, h3, h4 {
      font-family: 'Chivo', sans-serif;
      color: #0f172a;
      font-weight: 700;
      page-break-after: avoid;
    }
    
    h1 {
      font-size: 24pt;
      border-bottom: 2px solid #f97316;
      padding-bottom: 6px;
      margin-top: 0;
      margin-bottom: 18pt;
    }
    
    h2 {
      font-size: 16pt;
      border-bottom: 1px solid #e2e8f0;
      padding-bottom: 4px;
      margin-top: 24pt;
      margin-bottom: 12pt;
    }
    
    h3 {
      font-size: 13pt;
      margin-top: 18pt;
      margin-bottom: 6pt;
    }

    p {
      margin-top: 0;
      margin-bottom: 12pt;
    }
    
    /* Cover Page styling */
    .cover-page {
      height: 100vh;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      page-break-after: always;
      padding: 40mm 0 20mm 0;
      box-sizing: border-box;
    }
    
    .cover-header {
      border-left: 6px solid #f97316;
      padding-left: 20px;
    }
    
    .cover-title {
      font-size: 34pt;
      line-height: 1.1;
      color: #0f172a;
      margin: 0 0 10pt 0;
      font-family: 'Chivo', sans-serif;
      font-weight: 800;
    }
    
    .cover-subtitle {
      font-size: 16pt;
      color: #475569;
      margin: 0;
      font-weight: 400;
    }
    
    .cover-meta {
      font-size: 11pt;
      color: #64748b;
      margin-top: 40px;
      line-height: 1.8;
    }
    
    .cover-meta strong {
      color: #0f172a;
    }
    
    .cover-footer {
      font-size: 9pt;
      color: #94a3b8;
      border-top: 1px solid #e2e8f0;
      padding-top: 20px;
    }
    
    /* Table of contents styling */
    .toc-page {
      page-break-after: always;
      padding-top: 10mm;
    }
    
    .toc-list {
      list-style: none;
      padding: 0;
      margin: 30px 0 0 0;
    }
    
    .toc-item {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      margin-bottom: 14pt;
      font-size: 12pt;
    }
    
    .toc-name {
      font-weight: 600;
      color: #0f172a;
    }
    
    .toc-dots {
      flex-grow: 1;
      border-bottom: 1px dotted #cbd5e1;
      margin: 0 10px;
    }
    
    .toc-page-num {
      font-weight: 600;
      color: #64748b;
    }
    
    /* Content sections styling */
    .chapter {
      page-break-before: always;
      padding-top: 10mm;
    }
    
    code {
      font-family: 'JetBrains Mono', monospace;
      font-size: 9pt;
      background: #f1f5f9;
      padding: 2px 4px;
      border-radius: 4px;
      color: #0f172a;
    }
    
    pre {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      padding: 12pt;
      border-radius: 8px;
      overflow-x: auto;
      margin-bottom: 16pt;
      page-break-inside: avoid;
    }
    
    pre code {
      background: transparent;
      padding: 0;
      color: #334155;
    }
    
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 16pt;
      page-break-inside: avoid;
    }
    
    th, td {
      border: 1px solid #e2e8f0;
      padding: 8pt 10pt;
      text-align: left;
      font-size: 10pt;
    }
    
    th {
      background: #f1f5f9;
      color: #0f172a;
      font-weight: 600;
    }
    
    tr:nth-child(even) {
      background: #f8fafc;
    }
    
    ul, ol {
      margin-top: 0;
      margin-bottom: 12pt;
      padding-left: 20px;
    }
    
    li {
      margin-bottom: 4pt;
    }
    
    .badge {
      display: inline-block;
      padding: 2px 6px;
      font-size: 8.5pt;
      font-weight: bold;
      border-radius: 4px;
      background: #fee2e2;
      color: #ef4444;
    }

    /* Print page numbering layout */
    .footer-nav {
      position: fixed;
      bottom: 0;
      right: 0;
      font-size: 9pt;
      color: #94a3b8;
    }
  `;

  const htmlContent = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <title>GridGuard Technical Documentation Manual</title>
      <style>${css}</style>
    </head>
    <body>
      
      <!-- 1. COVER PAGE -->
      <div class="cover-page">
        <div class="cover-header">
          <h1 class="cover-title">GRIDGUARD</h1>
          <p class="cover-subtitle">High-Throughput Fault Localization & Operator Console Platform</p>
        </div>
        <div class="cover-meta">
          <p><strong>Client:</strong> Karnataka State Power Distribution Board (KSPDB)</p>
          <p><strong>Subject:</strong> Technical Submission & Operations Manual</p>
          <p><strong>Candidate:</strong> Shivam Kapure</p>
          <p><strong>Date:</strong> August 2026</p>
        </div>
        <div class="cover-footer">
          <p>© 2026 Shivam Kapure. Built for Propel.ai AI Product Engineer Evaluation. All Rights Reserved.</p>
        </div>
      </div>

      <!-- 2. TABLE OF CONTENTS -->
      <div class="toc-page">
        <h1>Table of Contents</h1>
        <ul class="toc-list">
          <li class="toc-item">
            <span class="toc-name">Chapter 1. Executive Summary & Submission package</span>
            <span class="toc-dots"></span>
            <span class="toc-page-num">3</span>
          </li>
          <li class="toc-item">
            <span class="toc-name">Chapter 2. Quick Start & Operations Guide</span>
            <span class="toc-dots"></span>
            <span class="toc-page-num">4</span>
          </li>
          <li class="toc-item">
            <span class="toc-name">Chapter 3. System Architecture & Algorithms</span>
            <span class="toc-dots"></span>
            <span class="toc-page-num">6</span>
          </li>
          <li class="toc-item">
            <span class="toc-name">Chapter 4. Production Deployment & Operations</span>
            <span class="toc-dots"></span>
            <span class="toc-page-num">9</span>
          </li>
          <li class="toc-item">
            <span class="toc-name">Chapter 5. Architectural Decisions Log</span>
            <span class="toc-dots"></span>
            <span class="toc-page-num">11</span>
          </li>
          <li class="toc-item">
            <span class="toc-name">Chapter 6. AI Collaboration & Engineering Metrics</span>
            <span class="toc-dots"></span>
            <span class="toc-page-num">13</span>
          </li>
        </ul>
      </div>

      <!-- CHAPTERS -->
      <div class="chapter" id="chapter-1">
        <h1>Chapter 1: Executive Summary & Submission Details</h1>
        ${submissionHtml}
      </div>

      <div class="chapter" id="chapter-2">
        <h1>Chapter 2: Quick Start & System Guide</h1>
        ${readmeHtml}
      </div>

      <div class="chapter" id="chapter-3">
        <h1>Chapter 3: System Architecture & Design</h1>
        ${architectureHtml}
      </div>

      <div class="chapter" id="chapter-4">
        <h1>Chapter 4: Deployment & Operations Manual</h1>
        ${deploymentHtml}
      </div>

      <div class="chapter" id="chapter-5">
        <h1>Chapter 5: Architectural Decisions Log</h1>
        ${decisionsHtml}
      </div>

      <div class="chapter" id="chapter-6">
        <h1>Chapter 6: AI Collaboration & Workflow</h1>
        ${aiWorkflowHtml}
      </div>

    </body>
    </html>
  `;

  const tempHtmlPath = path.join(workspaceRoot, 'docs_temp.html');
  const pdfOutputPath = path.join(workspaceRoot, 'GridGuard_Technical_Documentation.pdf');

  fs.writeFileSync(tempHtmlPath, htmlContent, 'utf8');
  console.log('HTML documentation compiled. Rendering to PDF via Microsoft Edge...');

  try {
    const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
    const command = `"${edgePath}" --headless --disable-gpu --print-to-pdf="${pdfOutputPath}" "${tempHtmlPath}"`;
    execSync(command);
    console.log(`Success! PDF successfully compiled to: ${pdfOutputPath}`);
  } catch (err: any) {
    console.error('Error during PDF conversion:', err.message);
  } finally {
    if (fs.existsSync(tempHtmlPath)) {
      fs.unlinkSync(tempHtmlPath);
    }
  }
}

generateDocsPdf();
