# ProfileFill

Chrome extension (Manifest V3) that lets you create profiles from your resume and auto-fill job application forms. All data stays in your browser—no backend, no uploads.

---

# Steps to run ProfileFill

Follow these steps in order to run the extension in Chrome.

---

## Step 1: Open the project folder

Open a terminal and go to the extension folder:

```bash
cd /Users/rohitdabhi/Desktop/Project/Extention
```

(Replace with your actual path if different.)

---

## Step 2: Add resume parsing libraries (optional but recommended)

Resume **upload + parse** needs PDF.js and Mammoth.js in the `libs/` folder. Without them you can still create profiles **from scratch** in the popup or Options page.

**Required files:**

| File | Purpose |
|------|--------|
| `libs/pdf.min.js` | PDF.js main library |
| `libs/pdf.worker.min.js` | PDF.js worker |
| `libs/mammoth.browser.min.js` | Mammoth.js for DOCX |

**Option A – Using npm (easiest)**

```bash
# From the Extention folder
npm init -y
npm install pdfjs-dist mammoth

mkdir -p libs
cp node_modules/pdfjs-dist/build/pdf.min.js libs/
cp node_modules/pdfjs-dist/build/pdf.worker.min.mjs libs/pdf.worker.min.js
cp node_modules/mammoth/mammoth.browser.min.js libs/
```

**Option B – Manual download**

1. **PDF.js**: Go to [https://mozilla.github.io/pdf.js/getting_started/](https://mozilla.github.io/pdf.js/getting_started/), download the “legacy build,” and copy `pdf.min.js` and the worker file into `libs/`. Rename the worker to `pdf.worker.min.js`.
2. **Mammoth**: From [mammoth.js releases](https://github.com/mwilliamson/mammoth.js/releases) or the repo, get the browser build and save it as `libs/mammoth.browser.min.js`.

If you skip this step, use **“Create from scratch instead”** in the popup to build profiles without uploading a resume.

---

## Step 3: Add extension icons (optional)

Chrome expects these PNGs in `assets/`:

- `assets/icon-16.png` (16×16 px)
- `assets/icon-48.png` (48×48 px)
- `assets/icon-128.png` (128×128 px)

You can use any three PNGs (e.g. a document icon or “PF” logo). If you skip this, Chrome may show a default icon; the extension will still run.

---

## Step 4: Load the extension in Chrome

1. Open Chrome and go to: **`chrome://extensions/`**
2. Turn **Developer mode** ON (top-right toggle).
3. Click **Load unpacked**.
4. Select the **Extention** folder (the one that contains `manifest.json`).
5. Confirm that **ProfileFill** appears in the list with no errors.

---

## Step 5: Pin the extension (optional)

1. Click the **puzzle piece** (Extensions) in the Chrome toolbar.
2. Find **ProfileFill** and click the **pin** icon so it appears in the toolbar.

---

## Step 6: Verify it’s running

1. **Popup**  
   Click the ProfileFill icon in the toolbar. You should see either “No profiles yet” (with “+ New Profile”) or your profile list.

2. **Options / Manage profiles**  
   Right‑click the ProfileFill icon → **Options**, or click “Manage Profiles →” in the popup. The full profile editor should open in a new tab.

3. **Fill widget on a job page**  
   Open a job application page (e.g. [boards.greenhouse.io](https://boards.greenhouse.io) or any site with “apply” in the URL). A small **Fill** pill should appear at the bottom‑right. Click it, choose a profile, and click **Auto-Fill Application**.

---

## Quick reference

| Action | How |
|--------|-----|
| Create profile from resume | Popup → **+ New Profile** → drop or browse PDF/DOCX |
| Create profile from scratch | Popup → **+ New Profile** → **Create from scratch instead** (or Options → **+ New Profile**) |
| Edit / manage profiles | Popup → **Manage Profiles →** or right‑click icon → **Options** |
| Auto-fill a form | On a job application page → click **Fill** pill → select profile → **Auto-Fill Application** |
| Toggle Fill widget | `Cmd + Shift + F` (Mac) or `Ctrl + Shift + F` (Windows/Linux) |
| Open popup | `Cmd + Shift + P` (Mac) or `Ctrl + Shift + P` (Windows/Linux) |

---

## Troubleshooting

| Issue | What to do |
|-------|------------|
| Extension won’t load | Check that `manifest.json` is in the folder you selected. Fix any errors shown on `chrome://extensions/`. |
| “No profiles yet” but upload does nothing | Add the three files to `libs/` (Step 2), or use **Create from scratch instead**. |
| Fill pill doesn’t appear | Open a page that looks like a job application (e.g. `/apply`, “resume”, “first name” on the page). Or press `Ctrl+Shift+F` / `Cmd+Shift+F` to force the widget to toggle. |
| Icons missing / broken | Add `icon-16.png`, `icon-48.png`, `icon-128.png` to `assets/` (Step 3). |

---

## Testing checklist

**Form fill:**

- [ ] Greenhouse (boards.greenhouse.io)
- [ ] Lever (jobs.lever.co)
- [ ] Workday, Ashby, LinkedIn Easy Apply, custom career pages

**Resume / profiles:**

- [ ] Upload PDF resume → parse → edit in Options → save
- [ ] Upload DOCX resume
- [ ] Create from scratch (no upload)
- [ ] Import / export profile JSON from Options
