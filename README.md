# TIMirror — enhanced fork

Mirror the screen of a Texas Instruments TI‑Nspire calculator in your browser. This fork extends [hieyou1/TIMirror](https://github.com/hieyou1/TIMirror) with a resizable live preview, screenshot copying, Picture-in-Picture, and full-screen viewing.

## Features

- Live TI‑Nspire screen preview
- Adjustable preview width
- Copy the current calculator screen to the clipboard
- Open the preview in Picture-in-Picture
- View the preview full screen

## Project layout

| Path | Purpose |
| --- | --- |
| `index.html` | Browser interface and preview controls |
| `client.js` | Calculator connection, screen updates, and preview actions |
| `tiusb.js`, `tiusb.min.js`, `tiusb-1.js` | USB connection and calculator API runtime files |
| `webconn.wasm`, `webconn.worker.js` | WebAssembly connection runtime and worker |
| `server.py` | Python development server |
| `LICENSE` | MIT license and original copyright notice |

The USB and WebAssembly runtime files are part of the app; keep them alongside the page when deploying or mirroring the project.

## Requirements

- A TI‑Nspire calculator and a USB connection
- A desktop browser that supports WebUSB (use a current Chromium-based browser)
- Python 3.7 or newer to run the included server. The browser's USB API requires a secure context; `localhost` is treated as secure.

Turn on the calculator **before** connecting it. When prompted by the browser, select the calculator and allow access.

## Run locally

### Use the hosted version

To use TIMirror without hosting it yourself, open [timirror.silax04.workers.dev](https://timirror.silax04.workers.dev).

### Python 3.7 or newer

From the repository root, run:

```bash
python server.py
```

Then open [http://localhost:8000](http://localhost:8000). The server always serves the project directory, regardless of the directory from which it was started.

The Python server adds the cross-origin isolation headers required by the WebAssembly worker. When hosting the page elsewhere, configure equivalent headers on that server.

Connect & Start Mirroring launches the USB connection flow. After the first screen frame appears, use the preview controls to resize, copy, pop out, or expand the display. Clipboard image access depends on browser support and permissions.

## Fork and upstream

This repository is a community-maintained fork of [hieyou1/TIMirror](https://github.com/hieyou1/TIMirror). The original project provides the calculator connection and mirroring foundation; this fork adds the preview and screenshot controls described above. Contributions to the original project should be submitted upstream.

## License

This project is distributed under the MIT License. See [LICENSE](LICENSE) for details and retain the original copyright notice.

---

## Français

TIMirror affiche dans le navigateur l’écran d’une calculatrice Texas Instruments TI‑Nspire. Cette version dérivée de [hieyou1/TIMirror](https://github.com/hieyou1/TIMirror) ajoute un aperçu redimensionnable, la copie d’une capture d’écran, le mode Picture-in-Picture et l’affichage plein écran.

### Démarrage rapide

Pour utiliser TIMirror sans l’héberger soi-même, ouvre [timirror.silax04.workers.dev](https://timirror.silax04.workers.dev).

Un navigateur de bureau compatible avec WebUSB est nécessaire (utiliser une version récente d’un navigateur basé sur Chromium), ainsi qu’un serveur HTTP local. Allume la calculatrice **avant** de la brancher, puis autorise son accès dans la fenêtre de sélection du navigateur.

À la racine du projet, lance `python server.py` et ouvre [http://localhost:8000](http://localhost:8000). Le serveur fournit les en-têtes requis par le module WebAssembly.

Après l’apparition de la première image, les commandes permettent de régler la largeur de l’aperçu, copier l’écran, ouvrir une fenêtre Picture-in-Picture ou passer en plein écran. La copie d’image dépend du support et des autorisations du navigateur.

Le projet est distribué sous licence MIT. Consulte [LICENSE](LICENSE) et conserve la notice de copyright originale.
