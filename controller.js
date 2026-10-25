/* Shared by index.js and about.js: which brand is the connected controller,
   and the storage key that carries that answer from one page to the next. */

export const LAYOUT_KEY = "gcats-controller-layout";

// Reads the controller's id string (for example "Xbox 360 Controller
// (STANDARD GAMEPAD Vendor: 045e Product: 028e)") and returns "xbox",
// "playstation" or "unknown". 054c is Sony's vendor code and 045e is
// Microsoft's, so the match still works when the name is generic.
export function controllerFamily(gamepad) {
    const id = gamepad.id.toLowerCase();
    if (/dualsense|dualshock|playstation|sony|054c/.test(id))
        return "playstation";
    if (/xbox|xinput|microsoft|045e/.test(id))
        return "xbox";
    return "unknown";
}

// Controller pictures live in one folder per brand.
const IMAGE_FOLDERS = {
    xbox: "images/Xbox",
    playstation: "images/Playstation"
};

// Builds a safe URL such as "images/Xbox/grip.png". encodeURI turns any
// spaces in file names into %20 so the browser can load them.
export function imagePath(layout, file) {
    return encodeURI(`${IMAGE_FOLDERS[layout]}/${file}`);
}

// True when the window is full screen. F11 does not fire the usual
// fullscreen event, so we also accept a window as tall as the screen.
export function isFullScreenReady() {
    if (document.fullscreenElement)
        return true;
    const heightMatchesScreen = window.innerHeight >= screen.height - 2;
    const heightMatchesAvailableScreen = window.innerHeight >= screen.availHeight - 2;
    return heightMatchesScreen || heightMatchesAvailableScreen;
}
