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

// Helper: Generate customized resume using Gemini API
async function getCustomizedResume(resumeText, jobDetails, apiKey) {
  const endpoint = "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=" + encodeURIComponent(apiKey);

  const prompt = `
You are an expert resume editor. Given the user's resume and job details, extract only relevant skills, experiences, and qualifications from the resume that match the job description and requirements. Enhance and reword ONLY existing content to highlight alignment with the job, but do NOT add any new skills or experiences not present in the original resume. Output a professional, well-formatted resume in Markdown.

User Resume:
${resumeText}

Job Title: ${jobDetails.title}
Job Description: ${jobDetails.description}
Key Skills/Requirements: ${jobDetails.skills}

Provide ONLY the customized resume, do NOT include explanations or additional text.
`;

  const requestBody = {
    contents: [{
      parts: [{
        text: prompt
      }]
    }]
  };

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    throw new Error(`Gemini API Error: ${response.statusText}`);
  }

  const data = await response.json();
  // Attempt to extract the customized resume text robustly
  if (
    data.candidates &&
    data.candidates[0]?.content?.parts &&
    data.candidates[0].content.parts[0]?.text
  ) {
    let text = data.candidates[0].content.parts[0].text.trim();
    // Remove any "Customized Resume:" header if present
    if (text.toLowerCase().startsWith('customized resume:')) {
      text = text.replace(/customized resume:/i, '').trim();
    }
    return text;
  } else if (typeof data.candidates[0]?.content?.parts[0] === "string") {
    return data.candidates[0].content.parts[0];
  } else {
    throw new Error("Unexpected Gemini API response format.");
  }
}

// --- Helper: Keyword Extraction ---
async function extractKeywords(resumeText, jobDetails, apiKey) {
  const prompt = `
Extract keywords (skills, tools, certifications, technologies) from both the resume and the job description. 
Return ONLY a valid JSON object, with no explanation or markdown. Example format:
{
  "resumeKeywords": ["Java", "Spring Boot"],
  "jobKeywords": ["Java", "Spring Boot", "Microservices"],
  "matchedKeywords": ["Java", "Spring Boot"],
  "missingKeywords": ["Microservices"]
}
Resume:
${resumeText}
Job Description:
${jobDetails.description}
Key Skills/Requirements: ${jobDetails.skills}
`;

  const endpoint = "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=" + encodeURIComponent(apiKey);
  const requestBody = {
    contents: [{ parts: [{ text: prompt }] }]
  };
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody)
  });
  const data = await response.json();
  const jsonText = data.candidates[0].content.parts[0].text.trim();
  try {
    return JSON.parse(jsonText);
  } catch {
    const match = jsonText.match(/{[\s\S]*}/);
    if (match) {
      return JSON.parse(match[0]);
    }
    throw new Error("Failed to extract keywords.");
  }
}

// --- Helper: ATS Scoring ---
function calculateATSScore(matchedKeywords, jobKeywords) {
  if (!jobKeywords.length) return 0;
  return Math.round((matchedKeywords.length / jobKeywords.length) * 100);
}

// --- Helper: Enhancement Suggestions ---
async function getResumeSuggestions(resumeText, jobDetails, apiKey) {
  const prompt = `
Review the resume for ATS optimization and provide actionable enhancement suggestions to improve keyword match, formatting, and content. Output as a bullet-point list, only the list, no explanations.
Resume:
${resumeText}
Job Title: ${jobDetails.title}
Job Description: ${jobDetails.description}
Key Skills/Requirements: ${jobDetails.skills}
`;
  const endpoint = "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=" + encodeURIComponent(apiKey);
  const requestBody = {
    contents: [{ parts: [{ text: prompt }] }]
  };
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody)
  });
  const data = await response.json();
  return data.candidates[0].content.parts[0].text;
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
    const apiKey = document.getElementById('apiKey').value.trim();

    if (!file || !apiKey) throw new Error("Please upload a resume and enter your API key.");

    const resumeText = await extractTextFromPDF(file);

    const jobDetails = {
      title: jobTitle,
      description: jobDescription,
      skills: jobSkills
    };

    // 1. Generate customized resume
    const markdownResume = await getCustomizedResume(resumeText, jobDetails, apiKey);

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

    // 2. Keyword extraction
    const keywordData = await extractKeywords(resumeText, jobDetails, apiKey);

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
    let suggestions = await getResumeSuggestions(resumeText, jobDetails, apiKey);

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