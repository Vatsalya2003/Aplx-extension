// Resume parsing logic for aplx
// PDF: pdf.js (pdfjs-dist-legacy) via script tag; fallback to raw extraction. DOCX: mammoth.js in libs/.

if (typeof window !== 'undefined' && window.pdfjsLib && typeof chrome !== 'undefined' && chrome.runtime?.getURL) {
  try {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('libs/pdf.worker.min.js');
  } catch (e) {
    console.warn('aplx: could not set PDF.js workerSrc', e);
  }
}

/**
 * Entry point: parse a resume File into a partial Profile object.
 * Uses AI parsing if enabled and API key set; otherwise local parsing. Returns profile and which method was used.
 *
 * @param {File} file
 * @returns {Promise<{ profile: Profile, usedAI: boolean }>}
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

  let parsed;
  let usedAI = false;

  try {
    const { getSettings } = await import('./settings.js');
    const { parseResumeWithAI } = await import('./aiParser.js');
    const settings = await getSettings();
    const aiEnabled = !!settings.aiParsingEnabled && !!String(settings.aiApiKey || '').trim();

    if (aiEnabled) {
      try {
        const aiResult = await parseResumeWithAI(
          rawText,
          settings.aiProvider || 'openai',
          settings.aiApiKey || '',
          settings.aiModel || ''
        );
        parsed = aiResult;
        usedAI = true;
      } catch (aiErr) {
        if (settings.localParsingFallback !== false) {
          console.warn('aplx: AI parsing failed, using local fallback', aiErr);
          parsed = parseResumeText(rawText);
        } else {
          throw aiErr;
        }
      }
    } else {
      parsed = parseResumeText(rawText);
    }
  } catch (e) {
    if (e && typeof e.message === 'string' && (e.message.includes('Invalid API key') || e.message.includes('AI returned'))) {
      throw e;
    }
    parsed = parseResumeText(rawText);
  }

  const ensureIds = (arr) => (Array.isArray(arr) ? arr.map((item) => ({ ...item, id: item.id || crypto.randomUUID() })) : []);
  const profile = {
    id: crypto.randomUUID(),
    name: deriveProfileName(parsed),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    isDefault: false,
    personal: parsed.personal || {},
    education: ensureIds(parsed.education),
    experience: ensureIds(parsed.experience),
    skills: parsed.skills || { technical: [], languages: [], tools: [] },
    projects: ensureIds(parsed.projects),
    certifications: ensureIds(parsed.certifications),
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

  return { profile, usedAI };
}

/**
 * PDF text extraction via pdf.js (pdfjs-dist-legacy). Preserves line structure using Y position.
 * Falls back to raw extraction if pdf.js is unavailable or fails.
 */
async function extractTextFromPdf(arrayBuffer) {
  try {
    const pdfjsLib = window.pdfjsLib;
    if (!pdfjsLib) {
      return extractTextFromPdfRaw(arrayBuffer);
    }
    if (typeof chrome !== 'undefined' && chrome.runtime?.getURL) {
      pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('libs/pdf.worker.min.js');
    }

    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const numPages = pdf.numPages;
    const pageTexts = [];

    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const content = await page.getTextContent();
      const items = content.items || [];
      if (items.length === 0) continue;

      let lineText = '';
      let lastY = null;
      const LINE_DELTA = 2;

      for (const item of items) {
        const str = item.str;
        if (str == null || str === '') continue;
        const transform = item.transform;
        const y = transform && transform[5] != null ? transform[5] : null;

        if (lastY !== null && y !== null && Math.abs(y - lastY) > LINE_DELTA) {
          pageTexts.push(lineText.trim());
          lineText = str;
        } else {
          if (lineText.length > 0) lineText += ' ';
          lineText += str;
        }
        lastY = y;
      }
      if (lineText.trim()) pageTexts.push(lineText.trim());

      try {
        const annotations = await page.getAnnotations();
        for (const annot of annotations) {
          if (annot.subtype === 'Link' && annot.url) {
            pageTexts.push(annot.url);
          }
        }
      } catch (_) { /* annotation extraction is best-effort */ }

      if (pageTexts.length > 0 && pageNum < numPages) pageTexts.push('');
    }

    const text = pageTexts.join('\n');
    return text ? normalizeWhitespace(text) : extractTextFromPdfRaw(arrayBuffer);
  } catch (e) {
    console.warn('aplx: pdf.js extraction failed, using raw fallback', e);
    return extractTextFromPdfRaw(arrayBuffer);
  }
}

/**
 * Raw PDF text extraction fallback (string literals, hex strings, ASCII runs).
 * Used when pdf.js is not loaded or getDocument fails.
 */
function extractTextFromPdfRaw(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  const len = bytes.length;
  let raw = '';
  for (let i = 0; i < len; i++) {
    raw += String.fromCharCode(bytes[i]);
  }

  const chunks = [];

  let i = 0;
  while (i < raw.length) {
    if (raw[i] === '(') {
      let depth = 1;
      let j = i + 1;
      let s = '';
      while (j < raw.length && depth > 0) {
        const c = raw[j];
        if (c === '\\') {
          const next = raw[j + 1];
          if (next === 'n') { s += '\n'; j += 2; continue; }
          if (next === 'r') { s += '\r'; j += 2; continue; }
          if (next === 't') { s += '\t'; j += 2; continue; }
          if (next === 'b') { s += '\b'; j += 2; continue; }
          if (next === 'f') { s += '\f'; j += 2; continue; }
          if (next === '(' || next === ')' || next === '\\') { s += next; j += 2; continue; }
          if (next >= '0' && next <= '7') {
            let oct = next;
            j++;
            if (raw[j] >= '0' && raw[j] <= '7') { oct += raw[j++]; if (raw[j] >= '0' && raw[j] <= '7') oct += raw[j++]; }
            s += String.fromCharCode(parseInt(oct, 8));
            continue;
          }
          s += next ?? '\\';
          j += 2;
          continue;
        }
        if (c === '(') { depth++; s += c; j++; continue; }
        if (c === ')') { depth--; if (depth > 0) s += c; j++; continue; }
        s += c;
        j++;
      }
      if (s.trim().length > 0) chunks.push(s.trim());
      i = j;
      continue;
    }
    if (raw[i] === '<' && /[0-9A-Fa-f]/.test(raw[i + 1])) {
      let j = i + 1;
      while (j < raw.length && raw[j] !== '>') j++;
      const hex = raw.slice(i + 1, j).replace(/\s/g, '');
      if (hex.length % 2 === 0 && /^[0-9A-Fa-f]*$/.test(hex)) {
        let decoded = '';
        for (let k = 0; k < hex.length; k += 2) {
          const byte = parseInt(hex.slice(k, k + 2), 16);
          if (byte >= 32 && byte < 127) decoded += String.fromCharCode(byte);
          else if (byte === 10 || byte === 13) decoded += '\n';
        }
        if (decoded.trim().length > 0) chunks.push(decoded.trim());
      }
      i = j + 1;
      continue;
    }
    i++;
  }

  const asciiRuns = raw.match(/[\x20-\x7E\n\r]{20,}/g);
  if (asciiRuns) {
    for (const run of asciiRuns) {
      const t = run.replace(/\s+/g, ' ').trim();
      if (t.length > 3) chunks.push(t);
    }
  }

  return normalizeWhitespace(chunks.join('\n'));
}

async function extractTextFromDocx(arrayBuffer) {
  if (!window.mammoth) {
    throw new Error('Mammoth.js is not loaded');
  }

  const { value: html } = await window.mammoth.convertToHtml({ arrayBuffer });
  const plainText = (html || '').replace(/<[^>]+>/g, ' ');
  const hrefMatches = [...(html || '').matchAll(/href="([^"]+)"/gi)].map((m) => m[1]);
  const combined = hrefMatches.length
    ? plainText + '\n' + hrefMatches.join('\n')
    : plainText;
  return normalizeWhitespace(combined);
}

function normalizeWhitespace(text) {
  return text.replace(/\r/g, '\n').replace(/[ \t]+/g, ' ').replace(/\n{2,}/g, '\n\n').trim();
}

/** Remove PDF artifacts, page numbers, decorator lines, collapse spaces. */
function cleanResumeText(text) {
  if (!text || typeof text !== 'string') return '';
  let t = text
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .replace(/\r/g, '\n');
  const lines = t.split('\n');
  const seen = new Set();
  const result = [];
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].replace(/[ \t]+/g, ' ').trim();
    if (/^\d+$/.test(line)) continue;
    if (/^[\s\-_=*.#]+$/.test(line) || /^[–—\-_=*.#]+$/.test(line)) continue;
    const key = line.toLowerCase().slice(0, 50);
    if (seen.has(key) && result.length > 3) continue;
    seen.add(key);
    result.push(line);
  }
  return result.join('\n').replace(/\n{2,}/g, '\n\n').trim();
}

/** Parse date range: "Jan 2023 - Present", "01/2023 – 12/2024", "2023 to 2024". Returns { startDate, endDate } or null. */
function parseDateRange(str) {
  if (!str || typeof str !== 'string') return null;
  const s = str.trim();
  const datePart = '(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\\s+\\d{4}|\\d{1,2}/\\d{4}|(?:19|20)\\d{2}';
  const endMarkers = /^(present|current|now|ongoing)$/i;
  const rangeRe = new RegExp('(' + datePart + ')\\s*(?:-|–|—|to)\\s*(' + datePart + '|present|current|now|ongoing)', 'i');
  const match = s.match(rangeRe);
  if (match) {
    const startDate = match[1].trim();
    let endDate = match[2].trim();
    if (endMarkers.test(endDate)) endDate = 'Present';
    return { startDate, endDate };
  }
  const singleRe = new RegExp(datePart, 'i');
  const single = s.match(singleRe);
  if (single) return { startDate: single[0], endDate: '' };
  return null;
}

/** Extract location: "City, ST", "City, State", "Remote". */
function extractLocationFromText(str) {
  if (!str || typeof str !== 'string') return '';
  const s = str;
  if (/\bremote\b/i.test(s)) return 'Remote';
  const m = s.match(/\b([A-Za-z\u00C0-\u024F\u1E00-\u1EFF\s\-']+,\s*[A-Z]{2})\b/) ||
    s.match(/\b([A-Za-z\u00C0-\u024F\u1E00-\u1EFF\s\-']+,\s*[A-Za-z\u00C0-\u024F\u1E00-\u1EFF\s\-']+)\b/);
  return m ? m[1].trim() : '';
}

/** Check if string looks like company name (Inc, LLC, Ltd, Corp, Pvt, etc.). */
function looksLikeCompany(str) {
  return /\b(inc\.?|llc|ltd\.?|corp\.?|corporation|pvt\.?|limited|company|co\.?|l\.?l\.?c\.?)\b/i.test(str);
}

const PROGRAMMING_LANGUAGES = ['javascript', 'typescript', 'python', 'java', 'c++', 'c#', 'c', 'ruby', 'go', 'golang', 'rust', 'swift', 'kotlin', 'php', 'scala', 'r', 'matlab', 'perl', 'dart', 'lua', 'haskell', 'elixir', 'clojure', 'objective-c', 'assembly', 'vba', 'groovy', 'julia', 'fortran', 'cobol', 'sql', 'html', 'css', 'sass', 'less', 'graphql', 'bash', 'shell', 'powershell'];
const FRAMEWORKS_AND_TOOLS = ['react', 'reactjs', 'react.js', 'angular', 'vue', 'vuejs', 'vue.js', 'next.js', 'nextjs', 'nuxt', 'svelte', 'express', 'expressjs', 'node.js', 'nodejs', 'django', 'flask', 'fastapi', 'spring', 'spring boot', '.net', 'asp.net', 'rails', 'ruby on rails', 'laravel', 'symfony', 'gin', 'fiber', 'actix', 'rocket', 'flutter', 'react native', 'swiftui', 'uikit', 'jetpack compose', 'electron', 'tauri', 'qt', 'tensorflow', 'pytorch', 'keras', 'scikit-learn', 'pandas', 'numpy', 'opencv', 'docker', 'kubernetes', 'k8s', 'terraform', 'ansible', 'jenkins', 'github actions', 'gitlab ci', 'circleci', 'travis ci', 'aws', 'azure', 'gcp', 'google cloud', 'heroku', 'vercel', 'netlify', 'firebase', 'supabase', 'mongodb', 'postgresql', 'postgres', 'mysql', 'mariadb', 'redis', 'elasticsearch', 'dynamodb', 'cassandra', 'neo4j', 'sqlite', 'oracle', 'sql server', 'git', 'github', 'gitlab', 'bitbucket', 'jira', 'confluence', 'slack', 'figma', 'sketch', 'adobe xd', 'photoshop', 'illustrator', 'canva', 'premiere pro', 'webpack', 'vite', 'babel', 'eslint', 'prettier', 'jest', 'mocha', 'cypress', 'selenium', 'playwright', 'postman', 'swagger', 'graphql', 'rest', 'grpc', 'kafka', 'rabbitmq', 'sqs', 'nginx', 'apache', 'linux', 'unix', 'vim', 'vs code', 'intellij', 'xcode', 'android studio', 'tailwind', 'tailwindcss', 'bootstrap', 'material ui', 'mui', 'chakra ui', 'styled-components', 'storybook', 'redux', 'mobx', 'zustand', 'apollo', 'prisma', 'sequelize', 'mongoose', 'typeorm', 'drizzle', 'ec2', 's3', 'lambda', 'ecs', 'rds', 'cloudfront', 'route53', 'iam', 'vpc', 'load balancer', 'auto scaling', 'cloudwatch'];
const SPOKEN_LANGUAGES = ['english', 'hindi', 'spanish', 'french', 'german', 'mandarin', 'chinese', 'japanese', 'korean', 'portuguese', 'russian', 'arabic', 'italian', 'dutch', 'swedish', 'turkish', 'bengali', 'tamil', 'telugu', 'gujarati', 'marathi', 'punjabi', 'urdu', 'thai', 'vietnamese', 'indonesian', 'malay', 'polish', 'czech', 'greek', 'hebrew', 'romanian', 'hungarian', 'finnish', 'norwegian', 'danish', 'cantonese', 'tagalog', 'swahili', 'nepali', 'sanskrit'];

function matchSkillCategory(item) {
  const lower = item.toLowerCase().trim();
  if (SPOKEN_LANGUAGES.some((lang) => lower === lang || lower.includes(lang))) return 'languages';
  if (PROGRAMMING_LANGUAGES.some((lang) => lower === lang || lower.includes(lang))) return 'technical';
  if (FRAMEWORKS_AND_TOOLS.some((tool) => lower === tool || lower.includes(tool))) return 'tools';
  return 'technical';
}

/**
 * @param {string} text
 */
function parseResumeText(text) {
  const cleaned = cleanResumeText(text || '');
  const sections = splitIntoSections(cleaned);

  const personal = extractPersonalInfo(cleaned);
  const education = extractEducation(sections.education);
  const experience = extractExperience(sections.experience);
  const skills = extractSkills(sections.skills);
  const projects = extractProjects(sections.projects);
  const certifications = extractCertifications(sections.certifications);

  return {
    personal,
    education: education ?? [],
    experience: experience ?? [],
    skills,
    projects: projects ?? [],
    certifications: certifications ?? [],
  };
}

function splitIntoSections(text) {
  const upper = (text || '').toUpperCase();
  const markers = [
    'EDUCATION',
    'EXPERIENCE',
    'WORK EXPERIENCE',
    'PROFESSIONAL EXPERIENCE',
    'SKILLS',
    'TECHNICAL SKILLS',
    'PROGRAMMING',
    'LANGUAGES',
    'FRAMEWORKS',
    'TOOLS',
    'PROJECTS',
    'PERSONAL PROJECTS',
    'CERTIFICATIONS',
    'CERTIFICATION',
    'AWARDS',
    'HONORS',
  ];

  const indices = [];
  for (const marker of markers) {
    let idx = upper.indexOf('\n' + marker);
    if (idx === -1 && upper.startsWith(marker)) idx = 0;
    if (idx !== -1) indices.push({ marker, index: idx });
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
    skills: getSection(['SKILLS', 'TECHNICAL SKILLS', 'PROGRAMMING', 'LANGUAGES', 'FRAMEWORKS', 'TOOLS']),
    projects: getSection(['PROJECTS', 'PERSONAL PROJECTS']),
    certifications: getSection(['CERTIFICATIONS', 'CERTIFICATION', 'AWARDS', 'HONORS']),
  };
}

function cleanUrlTrailing(url) {
  return url.replace(/[),.|;:!?'"]+$/, '');
}

function extractPersonalInfo(text) {
  if (!text || typeof text !== 'string') {
    return { firstName: '', lastName: '', email: '', countryCode: '', phone: '', phoneType: '', address: '', city: '', state: '', location: '', country: '', pincode: '', linkedIn: '', github: '', portfolio: '', website: '' };
  }
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const firstLine = lines[0] || '';

  const emailMatch = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  const emailDomain = emailMatch ? emailMatch[0].split('@')[1].toLowerCase() : '';
  const phoneMatch = text.match(/(\+?\d[\d\s().-]{7,}\d)/i);
  const linkedInMatch = text.match(/(https?:\/\/)?(www\.)?linkedin\.com\/in\/[A-Za-z0-9\-_/]+/i)
    || text.match(/(https?:\/\/)?(www\.)?linkedin\.com\/[A-Za-z0-9\-_/]+/i);
  const githubMatch = text.match(/(https?:\/\/)?(www\.)?github\.com\/[A-Za-z0-9\-_/]+/i);

  const allUrls = [...text.matchAll(/(https?:\/\/[^\s,|)]+)/gi)].map((m) => cleanUrlTrailing(m[1]));
  const bareDomains = [...text.matchAll(/(?:^|\s)((?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+(?:com|org|net|io|dev|me|co|app|xyz|tech|design|page|site|blog|codes|works|live|sh|cc|info|biz)(?:\/[^\s,|)]*)?)/gi)]
    .map((m) => cleanUrlTrailing(m[1]));

  const knownDomains = new Set();
  const linkedInUrl = linkedInMatch ? cleanUrlTrailing(linkedInMatch[0]) : '';
  const githubUrl = githubMatch ? cleanUrlTrailing(githubMatch[0]) : '';
  if (linkedInUrl) knownDomains.add(linkedInUrl.toLowerCase());
  if (githubUrl) knownDomains.add(githubUrl.toLowerCase());

  const candidateUrls = [...allUrls, ...bareDomains.map((d) => d)].filter((u) => {
    const lower = u.toLowerCase();
    if (knownDomains.has(lower)) return false;
    if (lower.includes('linkedin.com') || lower.includes('github.com')) return false;
    if (emailDomain && lower === emailDomain) return false;
    const domainOnly = lower.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
    if (emailDomain && domainOnly === emailDomain) return false;
    return true;
  });

  let portfolioUrl = '';
  let websiteUrl = '';
  for (const url of candidateUrls) {
    if (!portfolioUrl) {
      portfolioUrl = url;
    } else if (!websiteUrl) {
      websiteUrl = url;
      break;
    }
  }

  const location = extractLocationFromText(text) || '';

  let firstName = '';
  let lastName = '';
  const nameLine = firstLine.replace(/[|•\-]+.*$/, '').trim();
  const nameParts = nameLine ? nameLine.split(/\s+/).filter(Boolean) : [];
  if (nameLine && nameParts.length >= 2 && nameParts.length <= 5 && nameLine !== emailMatch?.[0]) {
    firstName = nameParts[0];
    lastName = nameParts.slice(1).join(' ');
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
    location,
    country: '',
    pincode: '',
    linkedIn: linkedInUrl ? normalizeUrl(linkedInUrl) : '',
    github: githubUrl ? normalizeUrl(githubUrl) : '',
    portfolio: portfolioUrl ? normalizeUrl(portfolioUrl) : '',
    website: websiteUrl ? normalizeUrl(websiteUrl) : '',
  };
}

function extractEducation(sectionText) {
  if (!sectionText || typeof sectionText !== 'string') return [];

  const schoolRe = /\b(University|College|Institute|School|Academy|Polytechnic|IIT|NIT|BITS|[\w\s]+(?:University|College|Institute|School|Academy|Polytechnic))\b/i;
  const degreeRe = /\b(Bachelor|Master|B\.?S\.?|M\.?S\.?|B\.?Tech|M\.?Tech|MBA|PhD|Doctor|Associate|B\.?E\.?|M\.?E\.?|BSc|MSc|B\.?A\.?|M\.?A\.?|BS|MS)(?:\s+(?:of\s+)?[\w\s]+)?/i;
  const fieldRe = /\b(?:in\s+|Major:\s*|Concentration:\s*|Specialization:\s*)([A-Za-z\u00C0-\u024F\s&,]+?)(?:\s*[|,;.]|$)/i;
  const gpaRe = /(?:GPA|CGPA)[:\s]*([0-4]\.\d{1,2}(?:\/4\.?0)?|\d\.\d{1,2}(?:\/10)?)/i;

  const blocks = sectionText.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  const entries = [];

  for (const block of blocks) {
    const blockNorm = block.replace(/\s+/g, ' ');
    const schoolMatch = block.match(schoolRe);
    const school = schoolMatch ? schoolMatch[0].trim() : '';
    const degreeMatch = block.match(degreeRe);
    const degree = degreeMatch ? degreeMatch[0].trim() : '';
    const fieldMatch = block.match(fieldRe);
    const field = fieldMatch ? fieldMatch[1].trim() : '';
    const gpaMatch = block.match(gpaRe);
    const gpa = gpaMatch ? gpaMatch[1].trim() : '';
    const dateRange = parseDateRange(block);
    const startDate = dateRange ? dateRange.startDate : '';
    const endDate = dateRange ? dateRange.endDate : '';
    const location = extractLocationFromText(block) || '';

    entries.push({
      id: crypto.randomUUID(),
      school,
      degree,
      field,
      gpa,
      startDate,
      endDate,
      location,
    });
  }

  return entries;
}

function extractExperience(sectionText) {
  if (!sectionText || typeof sectionText !== 'string') return [];

  const bulletStartRe = /^(\s*)(?:[•\-*>]\s*|\d+\.\s*)/;

  const rawBlocks = sectionText.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  const entries = [];
  const sepRe = /\s*(?:-\s*|–\s*|—\s*|\|\s*|\s+at\s+|\s+@\s+)\s*/i;

  for (const block of rawBlocks) {
    const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
    if (!lines.length) continue;

    const header = lines[0];
    const rest = lines.slice(1);
    const dateRange = parseDateRange(block) || parseDateRange(header);
    const startDate = dateRange ? dateRange.startDate : '';
    const endDate = dateRange ? dateRange.endDate : '';
    const isCurrentRole = /present|current|now|ongoing/i.test(endDate);

    const parts = header.split(sepRe).map((p) => p.trim()).filter(Boolean);
    let title = '';
    let company = '';
    if (parts.length >= 2) {
      const hasCompanyInSecond = looksLikeCompany(parts[1]);
      if (hasCompanyInSecond) {
        title = parts[0];
        company = parts[1];
      } else {
        title = parts[0];
        company = parts.slice(1).join(' ').trim();
      }
    } else if (parts.length === 1) {
      title = parts[0];
    }

    const location = extractLocationFromText(header) || extractLocationFromText(rest.join(' ')) || '';

    const bulletLines = rest.filter((l) => bulletStartRe.test(l));
    const descParts = bulletLines.length
      ? bulletLines.map((l) => l.replace(bulletStartRe, '').trim())
      : rest;
    const description = descParts.join('\n').trim();

    entries.push({
      id: crypto.randomUUID(),
      company,
      title,
      location,
      startDate,
      endDate,
      description,
      isCurrentRole,
      _sortKey: startDate ? (startDate.match(/(?:19|20)\d{2}/) || [])[0] || '0' : '0',
    });
  }

  entries.sort((a, b) => {
    const yA = a._sortKey;
    const yB = b._sortKey;
    if (yA !== yB) return parseInt(yB, 10) - parseInt(yA, 10);
    return 0;
  });
  entries.forEach((e) => delete e._sortKey);

  return entries;
}

function extractSkills(sectionText) {
  const technical = [];
  const languages = [];
  const tools = [];
  const dedupe = (arr) => [...new Set(arr)];

  if (!sectionText || typeof sectionText !== 'string') {
    return { technical: [], languages: [], tools: [] };
  }

  const sections = sectionText.split(/(?=\b(?:Languages?|Frameworks?|Tools?|Databases?|Technical\s+Skills?|Programming):\s*)/i);

  if (sections.length > 1) {
    for (const sec of sections) {
      const lines = sec.split('\n').map((s) => s.trim()).filter(Boolean);
      const header = lines[0] || '';
      const isLang = /^languages?:\s*/i.test(header);
      const afterColon = header.replace(/^[^:]+:\s*/, '');
      const restContent = lines.slice(1).join(' ');
      const itemStr = (afterColon + ' ' + restContent).trim();
      const items = itemStr ? itemStr.split(/[,;|]/).map((s) => s.trim()).filter((s) => s && !/^(?:Languages?|Frameworks?|Tools?|Databases?|Technical|Programming):\s*$/i.test(s)) : [];
      for (const item of items) {
        const trimmed = item.trim();
        if (!trimmed) continue;
        if (isLang) {
          if (SPOKEN_LANGUAGES.some((l) => trimmed.toLowerCase().includes(l))) languages.push(trimmed);
          else technical.push(trimmed);
        } else {
          tools.push(trimmed);
        }
      }
    }
    return {
      technical: dedupe(technical),
      languages: dedupe(languages),
      tools: dedupe(tools),
    };
  }

  const parts = sectionText.split(/[,;|\n]/).map((p) => p.trim()).filter(Boolean);
  for (const item of parts) {
    if (!item) continue;
    const cat = matchSkillCategory(item);
    if (cat === 'languages') languages.push(item);
    else if (cat === 'tools') tools.push(item);
    else technical.push(item);
  }

  return {
    technical: dedupe(technical),
    languages: dedupe(languages),
    tools: dedupe(tools),
  };
}

function extractProjects(sectionText) {
  if (!sectionText || typeof sectionText !== 'string') return [];

  const blocks = sectionText.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  const entries = [];
  const bulletStartRe = /^(\s*)(?:[•\-*>]\s*|\d+\.\s*)/;

  for (const block of blocks) {
    const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
    if (!lines.length) continue;

    let name = lines[0].replace(/^[•\-*>\s]+/, '').trim();
    const urlInName = name.match(/https?:\/\/[^\s)]+/i);
    if (urlInName) name = name.replace(urlInName[0], '').replace(/\s*\|\s*$/, '').trim();

    const urlMatch = block.match(/https?:\/\/[^\s)]+/gi);
    const url = urlMatch ? urlMatch[0] : '';

    let technologies = [];
    const techParen = block.match(/\(([^)]+)\)/);
    if (techParen) technologies = techParen[1].split(/[,|]/).map((t) => t.trim()).filter(Boolean);
    const techLabel = block.match(/(?:Tech|Built with|Technologies?):\s*([^\n|]+)/i);
    if (techLabel) technologies = [...technologies, ...techLabel[1].split(/[,|]/).map((t) => t.trim()).filter(Boolean)];

    const dateRange = parseDateRange(block);
    const startDate = dateRange ? dateRange.startDate : '';
    const endDate = dateRange ? dateRange.endDate : '';

    const rest = lines.slice(1);
    const bulletLines = rest.filter((l) => bulletStartRe.test(l));
    const descParts = bulletLines.length ? bulletLines.map((l) => l.replace(bulletStartRe, '').trim()) : rest;
    const description = descParts.join('\n').trim();

    entries.push({
      id: crypto.randomUUID(),
      name,
      description,
      technologies: [...new Set(technologies)],
      url,
      startDate,
      endDate,
    });
  }

  return entries;
}

function extractCertifications(sectionText) {
  if (!sectionText || typeof sectionText !== 'string') return [];

  const entries = [];
  const blocks = sectionText.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);

  const dateRe = /(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{4}|\d{1,2}\/\d{4}|(?:19|20)\d{2}/i;
  const issuerRe = /(?:by\s+|from\s+|issued\s+by\s+)([A-Za-z0-9\u00C0-\u024F\s&.,\-']+?)(?:\s*[|,]|\s+\d|$)/i;

  for (const block of blocks) {
    const name = block.replace(/^[•\-*>\s]+/, '').split(/\n/)[0].trim();
    if (!name) continue;

    const dateMatch = block.match(dateRe);
    const date = dateMatch ? dateMatch[0].trim() : '';

    const issuerMatch = block.match(issuerRe);
    const issuer = issuerMatch ? issuerMatch[1].trim() : '';

    const urlMatch = block.match(/https?:\/\/[^\s)]+/i);
    const url = urlMatch ? urlMatch[0] : '';

    entries.push({
      id: crypto.randomUUID(),
      name,
      issuer,
      date,
      url,
    });
  }

  return entries;
}

function normalizeUrl(url) {
  let u = url.trim().replace(/[),.|;:!?'"]+$/, '');
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

