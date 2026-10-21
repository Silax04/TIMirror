const id = (eid) => document.getElementById(eid);
const startButton = id("startmirror");
startButton.addEventListener("click", startMirror);
const canvas = id("screen-preview");
const status = (message, isError = false) => {
    const statusElement = id("screenshot-status");
    if (!statusElement) {
        console[isError ? "error" : "log"](message);
        return;
    }
    statusElement.innerText = message;
    statusElement.className = `small mt-2 ${isError ? "text-danger" : "text-success"}`;
};
let frameReady = false;
let pipWindow = null;
let pipCanvas = null;
let pipStatus = null;

const sizeSlider = id("preview-size");
if (sizeSlider) sizeSlider.oninput = (event) => {
    canvas.style.setProperty("--preview-width", `${event.target.value}px`);
    id("preview-container").style.setProperty("--preview-width", `${event.target.value}px`);
    id("preview-size-value").innerText = event.target.value;
};

const copyScreenshot = async (showStatus = status, clipboardWindow = window) => {
    if (!frameReady) {
        showStatus("No calculator screen is available yet. Connect and wait for the first frame.", true);
        return;
    }
    const clipboard = clipboardWindow.navigator.clipboard;
    const ClipboardImage = clipboardWindow.ClipboardItem || (typeof ClipboardItem !== "undefined" ? ClipboardItem : null);
    if (!clipboard || typeof ClipboardImage === "undefined" || !clipboard.write) {
        showStatus("Image clipboard access is not supported here. Open this page on localhost in a current Chromium browser and allow clipboard access.", true);
        return;
    }
    try {
        const blob = await new Promise((resolve, reject) => canvas.toBlob((image) => image ? resolve(image) : reject(new Error("Could not encode the screenshot.")), "image/png"));
        await clipboard.write([new ClipboardImage({ "image/png": blob })]);
        showStatus("Calculator screenshot copied to the clipboard.");
    } catch (error) {
        const detail = error.message === "Document is not focused"
            ? "Focus the TIMirror window before copying, or use the Copy Screenshot button in the focused PiP window."
            : error.message || "clipboard permission was denied";
        showStatus(`Could not copy screenshot: ${detail}`, true);
    }
};
const copyButton = id("copy-screenshot");
if (copyButton) copyButton.onclick = () => copyScreenshot();

const pipButton = id("pip-preview");
if (pipButton) pipButton.onclick = async () => {
    if (typeof documentPictureInPicture === "undefined") {
        status("Picture-in-Picture is not supported by this browser. Try a current Chromium-based browser.", true);
        return;
    }
    try {
        pipWindow = await documentPictureInPicture.requestWindow({ width: 480, height: 400 });
        pipWindow.document.title = "TIMirror";
        pipWindow.document.body.style.cssText = "margin:0;padding:16px;background:#f4f6fb;font:14px Arial,sans-serif;text-align:center;color:#182230";
        pipWindow.document.body.innerHTML = `<canvas width="320" height="240" aria-label="Live TI-Nspire screen"></canvas><div style="margin-top:10px"><button type="button" style="padding:8px 14px;cursor:pointer">Copy Screenshot</button><div role="status" aria-live="polite" style="margin-top:8px"></div></div>`;
        pipCanvas = pipWindow.document.querySelector("canvas");
        pipCanvas.style.cssText = "display:block;width:100%;height:auto;image-rendering:pixelated;background:#000;border:1px solid #e2e6ed;border-radius:10px";
        pipStatus = pipWindow.document.querySelector("[role=status]");
        const setPipStatus = (message, isError = false) => {
            if (!pipStatus) return;
            pipStatus.textContent = message;
            pipStatus.style.color = isError ? "#8b0000" : "#064b19";
        };
        pipWindow.document.querySelector("button").onclick = () => copyScreenshot(setPipStatus, pipWindow);
        pipWindow.addEventListener("pagehide", () => {
            pipWindow = null;
            pipCanvas = null;
            pipStatus = null;
        }, { once: true });
        if (frameReady) pipCanvas.getContext("2d").drawImage(canvas, 0, 0);
    } catch (error) {
        status(`Could not open Picture-in-Picture: ${error.message || "request was denied"}`, true);
    }
};

const fullscreenButton = id("fullscreen-preview");
if (fullscreenButton) fullscreenButton.onclick = async () => {
    try {
        if (!document.fullscreenElement) await canvas.requestFullscreen();
        else await document.exitFullscreen();
    } catch (error) {
        status(`Could not enter fullscreen: ${error.message}`, true);
    }
};

async function startMirror() {
    console.info("TIMirror: Connect button clicked.");
    try {
        console.info("TIMirror: Updating connection status.");
        startButton.disabled = true;
        startButton.innerText = "Connecting...";
        status("Connecting to calculator...");
        console.info("TIMirror: Creating calculator API.");
        let api = new TIWebConnApi();
        let scr = document.createElement("script");
        scr.src = "tiusb-1.js";
        status("Loading calculator USB module...");
        await new Promise((resolve, reject) => {
            scr.onload = async () => {
                console.info("TIMirror: USB module loaded; initializing API.");
                status("Initializing calculator connection...");
                try {
                    await api.init(
                        () => {
                            console.info("TIMirror: Calculator connected.");
                            resolve();
                        },
                        () => console.info("TIMirror: Calculator disconnected."),
                        () => status("Opening calculator connection..."),
                        () => reject(new Error("No calculator was selected. Reload the page to try connecting again.")),
                        () => reject(new Error("The calculator connection failed. Reload the page to retry."))
                    );
                    console.info("TIMirror: Calculator API initialized.");
                    status("Select your TI-Nspire in the USB device picker...");
                    await api.getDevices();
                    console.info("TIMirror: USB device request started.");
                } catch (error) {
                    reject(error);
                }
            };
            scr.onerror = () => reject(new Error("Could not load tiusb-1.js."));
            document.body.appendChild(scr);
        });
        console.log(await api.getDeviceInfo());
        window.tiapi = api;
        startButton.innerText = "Connected";
        status("Connected. Waiting for the first screen frame...");

        const setCtxToScreen = async (ctx) => {
            let screendata = await api.getScreen();
            let imagedata = new ImageData(320, 240);
            imagedata.data.set(screendata, 0);
            ctx.putImageData(imagedata, 0, 0);
        };
        let mirror = async () => {
            try {
                await setCtxToScreen(canvas.getContext("2d"));
                frameReady = true;
                const placeholder = id("preview-placeholder");
                if (placeholder) placeholder.hidden = true;
                if (pipCanvas) pipCanvas.getContext("2d").drawImage(canvas, 0, 0);
                window.requestAnimationFrame(mirror);
            } catch (error) {
                status(`Screen update failed: ${error.message || "calculator disconnected"}`, true);
            }
        };
        mirror();
    } catch (error) {
        startButton.disabled = false;
        startButton.innerText = "Connect & Start Mirroring";
        status(`Could not connect: ${error.message || "check the calculator connection and try again"}`, true);
    }
}
