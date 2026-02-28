// Resume parsing logic for ProfileFill
// Expects pdf.js and mammoth.js to be loaded on the page (popup): pdf.min.js, mammoth.browser.min.js
// PDF.js worker is loaded by PDF.js itself via GlobalWorkerOptions.workerSrc

if (typeof pdfjsLib !== 'undefined' && typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL) {
  try {
    pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('libs/pdf.worker.min.js');
  } catch (e) {
    console.warn('ProfileFill: could not set PDF.js workerSrc', e);
  }
}

/**
 * Entry point: parse a resume File into a partial Profile object.
 * The UI will let the user review and complete missing fields.
 *
 * @param {File} file
 * @returns {Promise<Profile>}
 */
export async function parseResumeFile(file) {
  const arrayBuffer = await file.arrayBuffer();
  const base64 = await fileToBase64(file);

  const ext = (file.name.split('.').pop() || '').toLowerCase();
  let rawText = '';

  if (ext === 'pdf') {
    rawText = await extractTextFromPdf(arrayBuffer);
  } else if (ext === 'docx') {
    rawText = await extractTextFromDocx(arrayBuffer);
  } else {
    throw new Error('Unsupported file type. Please upload a PDF or DOCX resume.');
  }

  const parsed = parseResumeText(rawText);

  return {
    id: crypto.randomUUID(),
    name: deriveProfileName(parsed),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    isDefault: false,
    personal: parsed.personal,
    education: parsed.education,
    experience: parsed.experience,
    skills: parsed.skills,
    projects: parsed.projects,
    certifications: parsed.certifications,
    applicationDefaults: {
      visaSponsorship: '',
      workAuthorization: '',
      expectedSalary: '',
      availableStartDate: '',
      yearsOfExperience: '',
      willingToRelocate: '',
      gender: '',
      ethnicity: '',
      veteranStatus: '',
      disabilityStatus: '',
      pronouns: '',
    },
    customFields: [],
    coverLetters: [],
    resumeFileName: file.name,
    resumeBase64: base64,
  };
}

async function extractTextFromPdf(arrayBuffer) {
  if (!window.pdfjsLib) {
    throw new Error('PDF.js is not loaded');
  }

  const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  let text = '';

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items.map((item) => item.str).join(' ');
    text += pageText + '\n';
  }

  return normalizeWhitespace(text);
}

async function extractTextFromDocx(arrayBuffer) {
  if (!window.mammoth) {
    throw new Error('Mammoth.js is not loaded');
  }

  const { value } = await window.mammoth.extractRawText({ arrayBuffer });
  return normalizeWhitespace(value || '');
}

function normalizeWhitespace(text) {
  return text.replace(/\r/g, '\n').replace(/[ \t]+/g, ' ').replace(/\n{2,}/g, '\n\n').trim();
}

/**
 * @param {string} text
 */
function parseResumeText(text) {
  const sections = splitIntoSections(text);

  const personal = extractPersonalInfo(text);
  const education = extractEducation(sections.education);
  const experience = extractExperience(sections.experience);
  const skills = extractSkills(sections.skills);
  const projects = extractProjects(sections.projects);
  const certifications = extractCertifications(sections.certifications);

  return {
    personal,
    education,
    experience,
    skills,
    projects,
    certifications,
  };
}

function splitIntoSections(text) {
  const upper = text.toUpperCase();
  const markers = [
    'EDUCATION',
    'EXPERIENCE',
    'WORK EXPERIENCE',
    'PROFESSIONAL EXPERIENCE',
    'SKILLS',
    'TECHNICAL SKILLS',
    'PROJECTS',
    'PERSONAL PROJECTS',
    'CERTIFICATIONS',
    'CERTIFICATION',
  ];

  const indices = [];
  for (const marker of markers) {
    let idx = upper.indexOf('\n' + marker);
    if (idx === -1 && upper.startsWith(marker)) {
      idx = 0;
    }
    if (idx !== -1) {
      indices.push({ marker, index: idx });
    }
  }

  indices.sort((a, b) => a.index - b.index);

  const getSection = (names) => {
    const start = indices.find((s) => names.includes(s.marker));
    if (!start) return '';
    const startIdx = start.index;
    const startPos = text.indexOf('\n', startIdx);
    const startFrom = startPos === -1 ? startIdx : startPos + 1;

    const currentIndex = indices.indexOf(start);
    const next = indices[currentIndex + 1];
    const endIdx = next ? next.index : text.length;
    return text.slice(startFrom, endIdx).trim();
  };

  return {
    education: getSection(['EDUCATION']),
    experience: getSection(['EXPERIENCE', 'WORK EXPERIENCE', 'PROFESSIONAL EXPERIENCE']),
    skills: getSection(['SKILLS', 'TECHNICAL SKILLS']),
    projects: getSection(['PROJECTS', 'PERSONAL PROJECTS']),
    certifications: getSection(['CERTIFICATIONS', 'CERTIFICATION']),
  };
}

function extractPersonalInfo(text) {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const firstLine = lines[0] || '';

  const emailMatch = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  const phoneMatch = text.match(/(\+?\d[\d\s().-]{7,}\d)/);
  const linkedInMatch = text.match(/(https?:\/\/)?(www\.)?linkedin\.com\/[A-Za-z0-9\-_/]+/i);
  const githubMatch = text.match(/(https?:\/\/)?(www\.)?github\.com\/[A-Za-z0-9\-_/]+/i);
  const portfolioMatch = text.match(/(https?:\/\/)[^\s]+/i);

  const locationMatch =
    text.match(/\b([A-Z][a-zA-Z]+,\s*[A-Z]{2})\b/) || text.match(/\b([A-Z][a-zA-Z]+,\s*[A-Za-z]+)\b/);

  let firstName = '';
  let lastName = '';

  if (firstLine && firstLine.split(' ').length <= 5) {
    const nameParts = firstLine.replace(/[|•\-]+.*$/, '').trim().split(/\s+/);
    if (nameParts.length >= 2) {
      firstName = nameParts[0];
      lastName = nameParts.slice(1).join(' ');
    }
  }

  return {
    firstName,
    lastName,
    email: emailMatch ? emailMatch[0] : '',
    countryCode: '',
    phone: phoneMatch ? phoneMatch[0] : '',
    phoneType: '',
    address: '',
    city: '',
    state: '',
    location: locationMatch ? locationMatch[0] : '',
    country: '',
    pincode: '',
    linkedIn: linkedInMatch ? normalizeUrl(linkedInMatch[0]) : '',
    github: githubMatch ? normalizeUrl(githubMatch[0]) : '',
    portfolio: portfolioMatch ? normalizeUrl(portfolioMatch[0]) : '',
    website: '',
  };
}

function extractEducation(sectionText) {
  if (!sectionText) return [];

  const entries = [];
  const lines = sectionText.split('\n').map((l) => l.trim()).filter(Boolean);

  let buffer = [];
  const flush = () => {
    if (!buffer.length) return;
    const block = buffer.join(' ');
    const schoolMatch = block.match(
      /\b(University|College|Institute|School|Academy|Polytechnic)[^,|\n]*/i
    );
    const degreeMatch = block.match(
      /\b(Bachelor|Master|B\.S\.|M\.S\.|BSc|MSc|B\.Tech|M\.Tech|MBA|PhD|Doctor)[^,|\n]*/i
    );
    const gpaMatch = block.match(/GPA[:\s]*([0-4]\.\d{1,2}|\d\.\d{1,2}\/4\.0)/i);
    const dateMatch = block.match(
      /((Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\s+\d{4}|[0-1]?\d\/\d{4}|[1-2]\d{3})\s*[–-]\s*((Present)|(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\s+\d{4}|[0-1]?\d\/\d{4}|[1-2]\d{3})/i
    );

    const locationMatch = block.match(/\b[A-Z][a-zA-Z]+,\s*[A-Z]{2}\b/);

    const startDate = dateMatch ? dateMatch[1] || '' : '';
    const endDate = dateMatch ? dateMatch[4] || dateMatch[3] || '' : '';

    entries.push({
      id: crypto.randomUUID(),
      school: schoolMatch ? schoolMatch[0].trim() : '',
      degree: degreeMatch ? degreeMatch[0].trim() : '',
      field: '',
      gpa: gpaMatch ? gpaMatch[1] : '',
      startDate,
      endDate,
      location: locationMatch ? locationMatch[0] : '',
    });

    buffer = [];
  };

  for (const line of lines) {
    buffer.push(line);
    if (/[.]$/.test(line) || /GPA/i.test(line)) {
      flush();
    }
  }
  flush();

  return entries;
}

function extractExperience(sectionText) {
  if (!sectionText) return [];

  const entries = [];
  const blocks = sectionText.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);

  for (const block of blocks) {
    const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
    if (!lines.length) continue;

    const header = lines[0];
    const rest = lines.slice(1).join(' ');

    const dateMatch =
      block.match(
        /((Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\s+\d{4}|[0-1]?\d\/\d{4}|[1-2]\d{3})\s*[–-]\s*((Present)|(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\s+\d{4}|[0-1]?\d{4}|[1-2]\d{3})/i
      ) ||
      header.match(
        /((Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\s+\d{4}|[0-1]?\d\/\d{4}|[1-2]\d{3})\s*[–-]\s*((Present)|(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\s+\d{4}|[0-1]?\d{4}|[1-2]\d{3})/i
      );

    const startDate = dateMatch ? dateMatch[1] || '' : '';
    const rawEnd = dateMatch ? dateMatch[4] || dateMatch[3] || '' : '';
    const endDate = rawEnd;

    const companyTitleSplit = header.split(/[-–|•@]/);
    let title = companyTitleSplit[0].trim();
    let company = companyTitleSplit[1] ? companyTitleSplit[1].trim() : '';

    const locationMatch =
      header.match(/\b[A-Z][a-zA-Z]+,\s*[A-Z]{2}\b/) || rest.match(/\b[A-Z][a-zA-Z]+,\s*[A-Z]{2}\b/);

    const bullets = lines
      .slice(1)
      .filter((l) => /^[-•]/.test(l))
      .map((l) => l.replace(/^[-•]\s*/, '').trim());

    const description = bullets.length ? bullets.join('\n') : lines.slice(1).join(' ');

    entries.push({
      id: crypto.randomUUID(),
      company,
      title,
      location: locationMatch ? locationMatch[0] : '',
      startDate,
      endDate,
      description: description.trim(),
      isCurrentRole: /present/i.test(endDate),
    });
  }

  return entries;
}

function extractSkills(sectionText) {
  if (!sectionText) {
    return { technical: [], languages: [], tools: [] };
  }

  const text = sectionText.replace(/\n/g, ' ');
  const parts = text.split(/[,;|]/).map((p) => p.trim()).filter(Boolean);

  const technical = [];
  const languages = [];
  const tools = [];

  const languageKeywords = ['english', 'hindi', 'spanish', 'french', 'german', 'mandarin', 'bengali'];

  for (const item of parts) {
    const lower = item.toLowerCase();
    if (languageKeywords.some((k) => lower.includes(k))) {
      languages.push(item);
    } else if (/[a-z]/i.test(item) && /tool|figma|git|jira|slack|excel|photoshop|notion|clickup/i.test(item)) {
      tools.push(item);
    } else {
      technical.push(item);
    }
  }

  return { technical, languages, tools };
}

function extractProjects(sectionText) {
  if (!sectionText) return [];

  const blocks = sectionText.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  const entries = [];

  for (const block of blocks) {
    const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
    if (!lines.length) continue;

    const name = lines[0].replace(/^[-•]\s*/, '').trim();
    const rest = lines.slice(1).join(' ');

    const urlMatch = block.match(/https?:\/\/[^\s)]+/i);
    const techMatch = block.match(/\(([^)]+)\)/);
    const techString = techMatch ? techMatch[1] : '';
    const technologies = techString
      ? techString.split(/[,|]/).map((t) => t.trim()).filter(Boolean)
      : [];

    entries.push({
      id: crypto.randomUUID(),
      name,
      description: rest.trim(),
      technologies,
      url: urlMatch ? urlMatch[0] : '',
      startDate: '',
      endDate: '',
    });
  }

  return entries;
}

function extractCertifications(sectionText) {
  if (!sectionText) return [];

  const lines = sectionText.split('\n').map((l) => l.trim()).filter(Boolean);
  const entries = [];

  for (const line of lines) {
    const name = line.replace(/^[-•]\s*/, '').trim();
    if (!name) continue;
    const dateMatch = line.match(
      /((Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\s+\d{4}|[1-2]\d{3})/
    );
    const urlMatch = line.match(/https?:\/\/[^\s)]+/i);

    entries.push({
      id: crypto.randomUUID(),
      name,
      issuer: '',
      date: dateMatch ? dateMatch[0] : '',
      url: urlMatch ? urlMatch[0] : '',
    });
  }

  return entries;
}

function normalizeUrl(url) {
  let u = url.trim();
  if (!/^https?:\/\//i.test(u)) {
    u = 'https://' + u;
  }
  return u;
}

function deriveProfileName(parsed) {
  const { personal, experience } = parsed;
  const fullName =
    [personal.firstName, personal.lastName].filter(Boolean).join(' ') || 'New Profile';

  const latestRole = experience && experience.length ? experience[0].title : '';
  if (latestRole) {
    return `${fullName} – ${latestRole}`;
  }
  return fullName;
}

/**
 * @param {File} file
 * @returns {Promise<string>} base64 (without data: prefix)
 */
async function fileToBase64(file) {
  const arrayBuffer = await file.arrayBuffer();
  let binary = '';
  const bytes = new Uint8Array(arrayBuffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * @typedef {Object} Profile
 * @property {string} id
 * @property {string} name
 * @property {string} createdAt
 * @property {string} updatedAt
 * @property {boolean} isDefault
 */

