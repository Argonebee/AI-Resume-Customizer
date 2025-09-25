// Helper: Read PDF text using PDF.js module (pdf.mjs/pdf.worker.mjs)
async function extractTextFromPDF(file) {
  const pdfjsLib = window.pdfjsLib;
  if (!pdfjsLib) throw new Error("PDF.js library is not loaded.");

  const typedarray = new Uint8Array(await file.arrayBuffer());
  const pdfDoc = await pdfjsLib.getDocument(typedarray).promise;
  let text = '';
  for (let i = 1; i <= pdfDoc.numPages; i++) {
    const page = await pdfDoc.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map(item => item.str).join(' ') + '\n';
  }
  return text.trim();
}

// Helper: Generate customized resume (via backend so API key stays server-side)
async function getCustomizedResume(resumeText, jobDetails) {
  const resp = await fetch('/api/customize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ resumeText, jobDetails }),
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to get customized resume');
  }
  const data = await resp.json();
  return data.customizedResume;
}

// --- Helper: Keyword Extraction ---
async function extractKeywords(resumeText, jobDetails) {
  const resp = await fetch('/api/keywords', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ resumeText, jobDetails }),
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err.error || 'Keyword extraction failed');
  }
  return resp.json();
}

// --- Helper: ATS Scoring ---
function calculateATSScore(matchedKeywords, jobKeywords) {
  if (!jobKeywords.length) return 0;
  return Math.round((matchedKeywords.length / jobKeywords.length) * 100);
}

// --- Helper: Enhancement Suggestions ---
async function getResumeSuggestions(resumeText, jobDetails) {
  const resp = await fetch('/api/suggestions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ resumeText, jobDetails }),
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err.error || 'Suggestion generation failed');
  }
  const j = await resp.json();
  return j.suggestions || '';
}

// Helper: Convert Markdown resume to HTML for preview
function markdownToHtml(md) {
  // Minimal Markdown to HTML (for preview)
  return md
    .replace(/^# (.*?)$/gm, '<h1>$1</h1>')
    .replace(/^## (.*?)$/gm, '<h2>$1</h2>')
    .replace(/^### (.*?)$/gm, '<h3>$1</h3>')
    .replace(/^\* (.*?)$/gm, '<li>$1</li>')
    .replace(/\*\*(.*?)\*\*/gm, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/gm, '<em>$1</em>')
    .replace(/\n/g, '<br>');
}

// Helper: Download content as text file
function downloadAsTextFile(content, filename = "customized_resume.txt") {
  const blob = new Blob([content], { type: "text/plain" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();

  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);
}

// --- Helper: Export to PDF using browser print dialog ---
function exportToPDF(markdownResume) {
  // Create a temporary printable div
  const tempDiv = document.createElement('div');
  tempDiv.style.position = 'fixed';
  tempDiv.style.left = '-9999px';
  tempDiv.style.background = '#fff';
  tempDiv.style.width = '800px';
  tempDiv.style.padding = '32px';
  tempDiv.innerHTML = markdownToHtml(markdownResume);
  document.body.appendChild(tempDiv);

  // Prepare a print window for just the resume content
  const printWindow = window.open('', '', 'width=900,height=1000');
  printWindow.document.write(`
    <html>
      <head>
        <title>Resume PDF Export</title>
        <style>
          body { font-family: 'Segoe UI', Arial, sans-serif; background: #fff; margin: 0; padding: 30px; }
          h1, h2, h3 { color: #234E70; }
          li { margin-bottom: 8px; }
        </style>
      </head>
      <body>${tempDiv.innerHTML}</body>
    </html>
  `);
  printWindow.document.close();
  
  // Give window time to render before printing
  printWindow.focus();
  setTimeout(() => {
    printWindow.print();
    printWindow.close();
    document.body.removeChild(tempDiv);
  }, 500);
}

// --- Helper: Export to Word using browser blob download ---
function exportToWord(markdownResume) {
  // Convert Markdown to plain text with simple formatting
  let plainText = markdownResume
    .replace(/^# (.*?)$/gm, '$1\n====================\n')
    .replace(/^## (.*?)$/gm, '$1\n--------------------\n')
    .replace(/^### (.*?)$/gm, '$1\n')
    .replace(/^\* (.*?)$/gm, '• $1')
    .replace(/\*\*(.*?)\*\*/gm, '$1')
    .replace(/\*(.*?)\*/gm, '$1');

  // MIME type for Word (.doc) is "application/msword"
  const blob = new Blob([plainText], { type: "application/msword" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "customized_resume.doc";
  document.body.appendChild(a);
  a.click();

  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
  }, 100);
}

// Main form logic
document.getElementById('resumeForm').addEventListener('submit', async function(e) {
  e.preventDefault();

  const loading = document.getElementById('loading');
  const errorMsg = document.getElementById('errorMsg');
  const reviewSection = document.getElementById('reviewSection');
  const dashboard = document.getElementById('dashboard');
  const atsScoreBar = document.getElementById('atsScoreBar');
  const keywordMatch = document.getElementById('keywordMatch');
  const skillGaps = document.getElementById('skillGaps');
  const suggestionsDiv = document.getElementById('suggestions');
  const resumePreview = document.getElementById('resumePreview');
  const downloadBtn = document.getElementById('downloadBtn');
  const exportPdfBtn = document.getElementById('exportPdfBtn');
  const exportWordBtn = document.getElementById('exportWordBtn');
  const customizedResumeDiv = document.getElementById('customizedResumeDiv');

  loading.classList.remove('hidden');
  errorMsg.classList.add('hidden');
  reviewSection.classList.add('hidden');
  dashboard.classList.add('hidden');
  if (customizedResumeDiv) customizedResumeDiv.classList.add('hidden');

  try {
    const file = document.getElementById('resumeUpload').files[0];
    const jobTitle = document.getElementById('jobTitle').value;
    const jobDescription = document.getElementById('jobDescription').value;
    const jobSkills = document.getElementById('jobSkills').value;
    if (!file) throw new Error("Please upload a resume.");

    const resumeText = await extractTextFromPDF(file);

    const jobDetails = {
      title: jobTitle,
      description: jobDescription,
      skills: jobSkills
    };

// 1. Send to backend server
    const response = await fetch("http://localhost:3000/api/customize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resumeText, jobDetails }),
    });
    const data = await response.json();

    if (!response.ok) throw new Error(data.error || "Backend error");

    const markdownResume = data.customizedResume;

    // Show the customized resume section (plain markdown and HTML preview)
    if (customizedResumeDiv) {
      customizedResumeDiv.innerHTML = `
        <h2 style="margin-top:30px;">Customized Resume (Markdown)</h2>
        <pre style="background:#f9fafc;border-radius:8px;padding:14px 18px;font-size:1em;white-space:pre-wrap;word-break:break-word;color:#234E70;max-height:350px;overflow:auto;">${markdownResume.replace(/</g,"&lt;").replace(/>/g,"&gt;")}</pre>
        <h3 style="margin-top:24px;">Resume Preview</h3>
        <div style="background:#f7f7fd;border-radius:8px;padding:14px 18px;max-height:350px;overflow:auto;">
          ${markdownToHtml(markdownResume)}
        </div>
      `;
      customizedResumeDiv.classList.remove('hidden');
    }

    // 2. Keyword extraction (call server-side endpoint so API key is not exposed)
    const keywordResp = await fetch("http://localhost:3000/api/keywords", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resumeText, jobDetails }),
    });
    if (!keywordResp.ok) {
      const err = await keywordResp.json().catch(() => ({}));
      throw new Error(err.error || 'Keyword extraction failed');
    }
    const keywordData = await keywordResp.json();

    // 3. ATS scoring
    const atsScore = calculateATSScore(keywordData.matchedKeywords, keywordData.jobKeywords);

    // Meter color and emoji
    const scoreColor =
      atsScore >= 80 ? "#50C878"
      : atsScore >= 50 ? "#FFD700"
      : atsScore > 0 ? "#E57373"
      : "#CED9E7";

    const scoreEmoji =
      atsScore >= 80 ? " "
      : atsScore >= 50 ? " "
      : atsScore > 0 ? " "
      : "";

    atsScoreBar.innerHTML = `
      <div style="margin:16px 0; text-align: center;">
        <strong style="font-size:1.15em; color:#234E70;letter-spacing:0.5px;">ATS Score</strong>
        <div style="margin:18px auto 6px auto; position:relative; width:140px; height:140px;">
          <svg width="140" height="140">
            <circle cx="70" cy="70" r="60" stroke="#eee" stroke-width="14" fill="none"/>
            <circle
              cx="70" cy="70" r="60"
              stroke="${scoreColor}"
              stroke-width="14"
              fill="none"
              stroke-linecap="round"
              stroke-dasharray="${Math.PI * 2 * 60}"
              stroke-dashoffset="${Math.PI * 2 * 60 * (1 - atsScore / 100)}"
              style="transition: stroke-dashoffset 1s;"
              transform="rotate(-90 70 70)"
            />
            <text x="70" y="88" text-anchor="middle" font-size="2em" fill="#234E70" font-weight="bold">${atsScore}%</text>
          </svg>
          <div style="position:absolute;left:0;top:0;width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:2.2em;">
            ${scoreEmoji}
          </div>
        </div>
        <div style="margin-top:8px;font-size:1em;">
          ${atsScore >= 80
            ? '<span style="color:#50C878;font-weight:bold;">Excellent match!</span>'
            : atsScore >= 50
              ? '<span style="color:#FFD700;font-weight:bold;">Good, but can improve!</span>'
              : atsScore > 0
                ? '<span style="color:#E57373;font-weight:bold;">Low match. Add more relevant keywords.</span>'
                : '<span style="color:#CED9E7;font-weight:bold;">No match detected.</span>'
          }
        </div>
      </div>
    `;

    keywordMatch.innerHTML = keywordData.matchedKeywords.length
      ? `<span style="color:green">${keywordData.matchedKeywords.join(', ')}</span>`
      : '<span style="color:gray">No matches found.</span>';
    skillGaps.innerHTML = keywordData.missingKeywords.length
      ? `<span style="color:red">${keywordData.missingKeywords.join(', ')}</span>`
      : '<span style="color:green">No skill gaps!</span>';

    // Enhancement suggestions
    // 4. Enhancement suggestions (call server-side endpoint)
    const suggestResp = await fetch("http://localhost:3000/api/suggestions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resumeText, jobDetails }),
    });
    if (!suggestResp.ok) {
      const err = await suggestResp.json().catch(() => ({}));
      throw new Error(err.error || 'Suggestion generation failed');
    }
    const suggestJson = await suggestResp.json();
    let suggestions = suggestJson.suggestions || '';

    // --- FIX: Ensure suggestions is a string ---
    if (Array.isArray(suggestions)) {
      suggestions = suggestions.join('\n');
    } else if (typeof suggestions !== "string") {
      suggestions = String(suggestions);
    }

    // ENHANCED SUGGESTIONS SECTION
    suggestionsDiv.innerHTML = `
      <ul style="list-style: none; padding: 0; margin: 0;">
        ${suggestions
          .split('\n')
          .filter(s => s.trim())
          .map((s, idx) => `
            <li style="
              background: linear-gradient(90deg, #E7F0FD 70%, #B8E0D2 100%);
              color: #234E70;
              font-size: 1.08em;
              margin-bottom: 10px;
              border-radius: 8px;
              padding: 10px 18px;
              box-shadow: 0 2px 8px #234E7015;
              display: flex;
              align-items: flex-start;
              gap: 10px;
            ">
              <span style="
                background: #234E70;
                color: #fff;
                font-weight: bold;
                border-radius: 50%;
                width: 26px;
                height: 26px;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                font-size: 1.11em;
                margin-top:2px;
                flex-shrink:0;
              ">${idx + 1}</span>
              <span>${s.replace(/^- /, '').trim()}</span>
            </li>
          `).join('')}
      </ul>
    `;

    // Download as text file
    downloadBtn.onclick = () => downloadAsTextFile(markdownResume);

    // Export as PDF (browser print dialog)
    exportPdfBtn.onclick = () => exportToPDF(markdownResume);

    // Export as Word
    exportWordBtn.onclick = () => exportToWord(markdownResume);

    reviewSection.classList.remove('hidden');
    dashboard.classList.remove('hidden');

  } catch (err) {
    errorMsg.textContent = err.message || "An error occurred. Please try again.";
    errorMsg.classList.remove('hidden');
  } finally {
    loading.classList.add('hidden');
  }
});