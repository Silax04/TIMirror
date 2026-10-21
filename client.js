const id = (eid) => document.getElementById(eid);
const startButton = id("startmirror");
startButton.addEventListener("click", startMirror);
const canvas = id("screen-preview");
const previewContainer = id("preview-container");
let api = null;
let usbModulePromise = null;
let apiInitialized = false;
let connectionAttemptInProgress = false;
let mirrorRunning = false;
let mirrorGeneration = 0;
let activeScreenRead = null;
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
const updatePreviewSize = (fitToWindow = false) => {
    if (!sizeSlider) return;
    const minWidth = Number(sizeSlider.min) || 160;
    const step = Number(sizeSlider.step) || 1;
    const fitWidth = Math.max(0, (window.innerHeight - 448) * 4 / 3);
    if (fitToWindow && fitWidth >= minWidth) {
        sizeSlider.value = String(Math.min(Number(sizeSlider.value), minWidth + Math.floor((fitWidth - minWidth) / step) * step));
    }
    const width = Number(sizeSlider.value);
    previewContainer.style.setProperty("--preview-width", `${width}px`);
    id("preview-size-value").innerText = width;
    document.body.classList.toggle("preview-zoomed", width > fitWidth);
};
if (sizeSlider) {
    // Do not pass the input Event as fitToWindow: that mode intentionally clamps
    // the startup size to the window's available height.
    sizeSlider.addEventListener("input", () => updatePreviewSize());
    window.addEventListener("resize", updatePreviewSize);
    updatePreviewSize(true);
}

const loadUsbModule = () => {
    if (!usbModulePromise) {
        usbModulePromise = new Promise((resolve, reject) => {
            const script = document.createElement("script");
            script.src = "tiusb-1.js";
            script.onload = resolve;
            script.onerror = () => {
                usbModulePromise = null;
                reject(new Error("Could not load tiusb-1.js."));
            };
            document.body.appendChild(script);
        });
    }
    return usbModulePromise;
};

const releaseCurrentCalculator = async () => {
    if (!apiInitialized) return;

    const connectionApi = TICalculatorCCode.getInstance();
    const deviceManager = TI_DeviceManager.getInstance();
    const activeDevice = deviceManager.getDevice();

    // Stop scheduling frames first, then let the in-flight USB transfer finish.
    // Releasing the interface during transferIn/transferOut makes WebUSB fail and
    // can leave the native connection reporting a delayed disconnect.
    if (activeScreenRead) {
        let readTimeout;
        const readFinished = await Promise.race([
            activeScreenRead.then(() => true, () => true),
            new Promise((resolve) => { readTimeout = setTimeout(() => resolve(false), 3000); })
        ]);
        clearTimeout(readTimeout);
        if (!readFinished) throw new Error("The current screen transfer did not stop. Unplug and reconnect the calculator, then try again.");
    }

    // Ignore disconnect events caused by our own cleanup; the next selection will
    // install fresh callbacks for the new connection attempt.
    connectionApi.connectCallback = () => {};
    connectionApi.disconnectCallback = () => {};
    connectionApi.connectingCallback = () => {};
    connectionApi.noDeviceSelectionCallback = () => {};
    connectionApi.connectionFailedCallback = () => {};

    const usbDevice = activeDevice && activeDevice.webUSBDevice;
    if (usbDevice) {
        try { await usbDevice.releaseInterface(0); } catch (_) { /* The interface may already be released. */ }
        try { await usbDevice.close(); } catch (_) { /* The device may already be closed or disconnected. */ }
    }
    const stillRegistered = activeDevice && deviceManager.getDevice() === activeDevice;
    if (stillRegistered) deviceManager.tiDevice = null;
    // Match the library's normal physical-unplug path so its internal connection
    // state is reset without calling webapi_shutdown(), which can block the UI.
    if (stillRegistered && typeof connectionApi.deviceRemoved === "function") {
        try { connectionApi.deviceRemoved(0); }
        catch (error) { console.warn("TIMirror: Could not reset the previous calculator state.", error); }
    }
};

const enableReconnect = (message, isError = true) => {
    mirrorRunning = false;
    frameReady = false;
    const placeholder = id("preview-placeholder");
    if (placeholder) placeholder.hidden = false;
    startButton.disabled = false;
    startButton.innerText = "Reconnect calculator";
    status(message, isError);
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
        pipWindow = await documentPictureInPicture.requestWindow({ width: 560, height: 500 });
        pipWindow.document.body.style.cssText = "box-sizing:border-box;margin:0;padding:8px;background:#f4f6fb;font:13px Inter,system-ui,-apple-system,'Segoe UI',sans-serif;text-align:center;color:#182230";
        pipWindow.document.body.innerHTML = `<main style="max-width:760px;margin:0 auto"><canvas width="320" height="240" aria-label="Live TI-Nspire screen"></canvas><div style="margin-top:6px"><button type="button" style="padding:6px 12px;border:1px solid #dce3f1;border-radius:8px;background:#fff;color:#344054;font:inherit;font-size:12px;font-weight:600;cursor:pointer">Copy screenshot</button><div role="status" aria-live="polite" style="margin-top:4px;color:#7a8495;font-size:11px"></div></div></main>`;
        pipCanvas = pipWindow.document.querySelector("canvas");
        pipCanvas.style.cssText = "display:block;width:100%;height:auto;aspect-ratio:4/3;image-rendering:pixelated;background:#000;border:1px solid #e2e6ed;border-radius:8px";
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
    if (connectionAttemptInProgress) return;
    const currentGeneration = ++mirrorGeneration;
    connectionAttemptInProgress = true;
    mirrorRunning = false;
    frameReady = false;
    const placeholder = id("preview-placeholder");
    if (placeholder) placeholder.hidden = false;

    console.info("TIMirror: Connect button clicked.");
    try {
        startButton.disabled = true;
        startButton.innerText = api ? "Reconnecting..." : "Connecting...";
        status("Connecting to calculator...");
        api ||= new TIWebConnApi();
        if (!usbModulePromise) status("Loading calculator USB module...");
        await loadUsbModule();
        await releaseCurrentCalculator();

        let resolveConnection;
        let rejectConnection;
        let connectionSettled = false;
        let ignoreDisconnectUntilConnected = apiInitialized;
        let connectionTimeout;
        const connected = new Promise((resolve, reject) => {
            resolveConnection = resolve;
            rejectConnection = reject;
        });
        const failConnection = (error) => {
            if (connectionSettled) return;
            connectionSettled = true;
            clearTimeout(connectionTimeout);
            rejectConnection(error);
        };

        const callbacks = {
            connect: () => {
                console.info("TIMirror: Calculator connected.");
                ignoreDisconnectUntilConnected = false;
                if (!connectionSettled) {
                    connectionSettled = true;
                    clearTimeout(connectionTimeout);
                    resolveConnection();
                }
            },
            disconnect: () => {
                console.info("TIMirror: Calculator disconnected.");
                if (ignoreDisconnectUntilConnected) {
                    console.info("TIMirror: Ignoring a disconnect event from the previous USB session.");
                    return;
                }
                if (!connectionSettled) failConnection(new Error("The calculator disconnected before the connection completed."));
                else enableReconnect("Calculator disconnected. Reconnect it, then choose Reconnect calculator.");
            },
            connecting: () => {
                status("Opening calculator connection...");
                clearTimeout(connectionTimeout);
                connectionTimeout = setTimeout(() => failConnection(new Error("Timed out while opening the calculator connection. Try reconnecting.")), 15000);
            },
            noSelection: () => failConnection(new Error("No calculator was selected. Choose Reconnect calculator to try again.")),
            connectionFailed: () => failConnection(new Error("The calculator connection failed. Choose Reconnect calculator to retry."))
        };

        if (!apiInitialized) {
            console.info("TIMirror: Initializing calculator API.");
            status("Initializing calculator connection...");
            await api.init(callbacks.connect, callbacks.disconnect, callbacks.connecting, callbacks.noSelection, callbacks.connectionFailed);
            apiInitialized = true;
        } else {
            // The WebAssembly module is already initialized; update its event handlers
            // instead of initializing it again (which would wait for a load event that
            // has already happened).
            const connectionApi = TICalculatorCCode.getInstance();
            connectionApi.connectCallback = callbacks.connect;
            connectionApi.disconnectCallback = callbacks.disconnect;
            connectionApi.connectingCallback = callbacks.connecting;
            connectionApi.noDeviceSelectionCallback = callbacks.noSelection;
            connectionApi.connectionFailedCallback = callbacks.connectionFailed;
        }
        status("Select your TI-Nspire in the USB device picker...");
        await api.getDevices();
        await connected;
        console.log(await api.getDeviceInfo());
        window.tiapi = api;
        startButton.innerText = "Reconnect calculator";
        startButton.disabled = false;
        status("Connected. Waiting for the first screen frame...");

        const setCtxToScreen = async (ctx) => {
            const screenRead = api.getScreen();
            activeScreenRead = screenRead;
            let screendata;
            try {
                screendata = await screenRead;
            } finally {
                if (activeScreenRead === screenRead) activeScreenRead = null;
            }
            let imagedata = new ImageData(320, 240);
            imagedata.data.set(screendata, 0);
            ctx.putImageData(imagedata, 0, 0);
        };
        mirrorRunning = true;
        let mirror = async () => {
            if (!mirrorRunning || currentGeneration !== mirrorGeneration) return;
            try {
                await setCtxToScreen(canvas.getContext("2d"));
                if (!mirrorRunning || currentGeneration !== mirrorGeneration) return;
                frameReady = true;
                if (placeholder) placeholder.hidden = true;
                if (pipCanvas) pipCanvas.getContext("2d").drawImage(canvas, 0, 0);
                if (mirrorRunning) window.requestAnimationFrame(mirror);
            } catch (error) {
                if (currentGeneration === mirrorGeneration) {
                    enableReconnect(`Screen update failed: ${error.message || "calculator disconnected"}`);
                }
            }
        };
        mirror();
    } catch (error) {
        enableReconnect(`Could not connect: ${error.message || "check the calculator connection and try again"}`);
    } finally {
        connectionAttemptInProgress = false;
    }
}
