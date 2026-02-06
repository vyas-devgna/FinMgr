# WealthVault PWA

A secure, offline-first personal investment tracker.

## How to Deploy

1.  Create a new repository on GitHub.
2.  Upload all files (`index.html`, `style.css`, js files, `manifest.json`, `service-worker.js`) to the `main` branch.
3.  Create an `icons` folder and add `icon-192.png` and `icon-512.png` (You can use any square PNG image).
4.  Go to Repository Settings -> Pages.
5.  Select `main` branch and `/root` folder. Save.
6.  Visit the generated URL (e.g., `https://yourusername.github.io/repo`).

## Usage

1.  **Install:** The app will prompt you to install it to your home screen. This is required for offline functionality.
2.  **Add Assets:** Go to Portfolio -> New Asset.
3.  **Record Transactions:** Use the "+ Transaction" button on the Dashboard.
4.  **Update Prices:** Click on the price cell in the Portfolio table to update the current market price manually.
5.  **Backup:** Go to Settings to export your encrypted JSON backup.

## Privacy

This app has NO backend. All data is stored in your browser's IndexedDB. If you clear browser data, you lose your data unless you have a backup.
