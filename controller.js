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

// The Y and B buttons (standard gamepad buttons 3 and 1), and what each brand
// calls them. Y repeats a practice, B moves on to the next stage.
export const REPEAT_BUTTON = 3;
export const CONTINUE_BUTTON = 1;
export const BUTTON_NAMES = {
    xbox: { repeat: "Y", next: "B" },
    playstation: { repeat: "Triangle", next: "Circle" }
};

// The first controller the browser reports as connected, or null. The browser
// only reveals a controller after a button has been pressed on it.
export function firstConnectedGamepad() {
    return Array.from(navigator.getGamepads?.() ?? []).find((pad) => pad !== null && pad.connected) ?? null;
}

// Keyboard backup for testing without a controller: the arrow keys move
// (x and y run from -1 to 1), Space or Enter confirm, Y and B act as on the
// last page of a stage. "confirm", "repeat" and "next" are one-shot flags:
// the page reads them every frame and sets them back to false.
// "enabled" lets a page switch the keys off (for example while typing).
export function keyboardInput({ enabled = () => true } = {}) {
    const keys = { x: 0, y: 0, confirm: false, repeat: false, next: false };
    const arrows = { ArrowLeft: ["x", -1], ArrowRight: ["x", 1], ArrowUp: ["y", -1], ArrowDown: ["y", 1] };
    window.addEventListener("keydown", (e) => {
        if (!enabled()) return;
        if (arrows[e.key]) { keys[arrows[e.key][0]] = arrows[e.key][1]; e.preventDefault(); }
        if (e.key === " " || e.key === "Enter") keys.confirm = true;
        if (e.key.toLowerCase() === "y") keys.repeat = true;
        if (e.key.toLowerCase() === "b") keys.next = true;
    });
    window.addEventListener("keyup", (e) => {
        if (arrows[e.key]) keys[arrows[e.key][0]] = 0;
    });
    return keys;
}
