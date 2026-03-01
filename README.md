<div align="center">
  <img src="assets/Applix_logo.png" alt="Applix" width="80" height="80" style="border-radius: 16px;" />
  
  # Applix

  **Auto-fill job applications instantly from your resume.**
  
  A Chrome extension that creates profiles from your resume and fills job application forms with one click. All data stays in your browser — no backend, no uploads, no tracking.

  ![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-4285F4?style=flat&logo=googlechrome&logoColor=white)
  ![Manifest V3](https://img.shields.io/badge/Manifest-V3-34A853?style=flat)
  ![License](https://img.shields.io/badge/License-MIT-000000?style=flat)
</div>

---

## Features

- **Resume Parsing** — Upload a PDF or DOCX resume and Applix extracts your information automatically
- **AI-Powered Parsing** *(optional)* — Connect your own OpenAI, Gemini, or Claude API key for more accurate parsing  
- **One-Click Auto-Fill** — Fill job application forms on Greenhouse, Lever, Workday, Ashby, and more
- **Multiple Profiles** — Create different profiles for different types of roles
- **Smart Field Detection** — Recognizes 40+ field types including name, email, phone, address, work authorization, and EEO fields
- **Dark Mode** — Full dark/light theme support
- **Privacy First** — Everything runs locally in your browser. Zero data leaves your machine.

---

## Quick Start

### Installation

1. Clone or download this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable **Developer mode** (top-right toggle)
4. Click **Load unpacked** and select the project folder
5. Pin Applix from the extensions menu

### Setup Libraries (for resume parsing)
```bash
npm install
npm run setup-libs
```

This installs PDF.js and Mammoth.js for parsing PDF and DOCX resumes. If you skip this step, you can still create profiles manually using "Create from scratch."

---

## Usage

| Action | How |
|---|---|
| Create profile from resume | Click Applix icon → **+ New Profile** → Upload PDF/DOCX |
| Create profile manually | Click Applix icon → **+ New Profile** → **Create from scratch** |
| Edit profiles | Click **Manage Profiles →** or right-click icon → **Options** |
| Auto-fill a form | Visit a job application page → Click the **Fill** button → Select profile → **Auto-Fill Application** |
| Toggle Fill widget | `Cmd+Shift+F` (Mac) / `Ctrl+Shift+F` (Windows) |

---

## Supported Job Boards

| Platform | Status |
|---|---|
| Greenhouse (boards.greenhouse.io) | ✅ Supported |
| Lever (jobs.lever.co) | ✅ Supported |
| Workday (myworkdayjobs.com) | ✅ Supported |
| Ashby (ashbyhq.com) | ✅ Supported |
| LinkedIn Easy Apply | ✅ Supported |
| Indeed | ✅ Supported |
| SmartRecruiters | ✅ Supported |
| Custom career pages | ✅ Partial |

---

## AI Parsing (Optional)

Applix can use AI to parse your resume more accurately. This is optional — local parsing works without any API key.

1. Open Applix options page
2. Click the ⚙ Settings icon
3. Enable "AI Resume Parsing"
4. Choose a provider and enter your API key:
   - **Google Gemini** — Free tier available at [aistudio.google.com](https://aistudio.google.com)
   - **OpenAI** — Get a key at [platform.openai.com](https://platform.openai.com)
   - **Anthropic Claude** — Get a key at [console.anthropic.com](https://console.anthropic.com)

Your API key is stored locally and only sent to the provider you choose.

---

## Project Structure

```
applix/
├── assets/              # Icons and logo
├── background/          # Service worker
├── content/             # Content script (form detection + fill widget)
├── libs/                # PDF.js and Mammoth.js libraries
├── options/             # Full-page profile editor
├── popup/               # Extension popup
├── styles/              # Shared design system
└── utils/               # Core logic
    ├── aiParser.js      # AI-powered resume parsing
    ├── fieldMapper.js   # Form field classification
    ├── formFiller.js    # Form filling engine
    ├── parser.js        # Local resume parser
    ├── settings.js      # Settings management
    ├── storage.js       # Chrome storage utilities
    └── theme.js         # Dark/light theme
```
