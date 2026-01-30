# Gallery Browser 🎬

![Preview](preview.png)

Gallery Browser is a fast and stylish media gallery application that allows you to browse, view, and manage your local media collection (images and videos) with a modern Netflix-style interface.

---

## 🚀 Features

- **Netflix-Style Experience:** Modern, fast, and user-friendly UI.
- **Smart Media Viewer:**
  - Zoom with mouse wheel.
  - **Pan with Right-Click + Drag.**
  - Single-click play/pause.
  - Seamless playback in zoom mode.
- **File Management:** Support for deleting files and adding custom notes/info for each file.
- **Advanced Search:** Quick search across all folders.
- **Multi-Language Support:** Turkish and English support.
- **Full Screen:** Immersive full-screen viewing experience.

---

## 📦 Getting Started

### Quick Start (Windows)
1. Ensure you have the project files.
2. Run `GalleryLauncher.exe`. This will automatically start the server and open the browser for you.
3. Configure your media paths in `config.ini` if necessary.

### Manual Installation (Development)
1. **Prerequisites:** Node.js (v16 or higher) must be installed.
2. **Install Dependencies:**
   ```bash
   npm install
   ```
3. **Start the App:**
   - For development:
     ```bash
     npm run dev
     ```
   - To start the server manually:
     ```bash
     node server.js
     ```

---

## ⚙️ Configuration
You can customize the library path and settings in the `config.ini` file:
```ini
[Settings]
LibraryPath=C:/Your/Media/Path
Language=en
AutoPlay=true
```

---

## 🛠️ Usage Controls

| Action | Control |
| :--- | :--- |
| **Play / Pause** | Left Click |
| **Zoom In / Out** | Mouse Wheel |
| **Panning** | Right-Click + Drag |
| **Reset Zoom** | Right Click (Single) |
| **Next / Prev Media** | PageDown / PageUp or Arrows |
| **Close** | ESC or X button |
