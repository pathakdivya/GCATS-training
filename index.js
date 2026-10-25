/* =====================================================================
   GCATS gamepad training - page logic

   The file is ordered the way a participant moves through the page:

     1. Setup            page elements, settings, and the app's memory
     2. Welcome          wait for a full-screen window and a controller
     3. Detection        work out whether it is an Xbox or PlayStation pad
     4. Hold screen      show how to hold the controller
     5. Navigation       three short practice steps (D-pad, D-pad, shoulder)
     6. Overview         the "What happens next?" screen
     7. Input            read the buttons on every frame
     8. Theme            light / dark switch
     9. Start-up         attach listeners and begin
   ===================================================================== */


import { controllerFamily, imagePath, isFullScreenReady, LAYOUT_KEY } from "./controller.js";

/* ---------------------------------------------------------------------
   1. SETUP
   --------------------------------------------------------------------- */

/* ---- Page elements (all defined in index.html) ---- */

// The big "Welcome!" overlay shown until a controller is ready.
const welcomePrompt = document.getElementById("welcome-prompt");

// The wrapper around everything that appears after the welcome overlay.
const trainingContent = document.getElementById("training-content");

// The card in the middle of the page. It holds the status badge, the
// three controller panels below, and the navigation practice overlay.
const gamepadWelcome = document.getElementById("gamepad-welcome");
const statusBadge = document.getElementById("status-badge");
const statusText = document.getElementById("status-text");
const gamepadName = document.getElementById("gamepad-name");

// The three mutually exclusive panels inside the card:
//   unknown, 1      -> "Which layout matches?" (we could not tell the brand)
//   connected, 2    -> "Xbox / PlayStation connected" with the hold image
const unknownPanel = document.getElementById("gamepad-unknown");
const connectedPanel = document.getElementById("gamepad-connected");

// Pieces of the "connected" panel.
const connectedHeading = document.getElementById("connected-heading");
const holdImage = document.getElementById("gamepad-hold-image");

// Manual layout buttons shown on the "unknown" panel.
const xboxChoice = document.getElementById("choose-xbox");
const psChoice = document.getElementById("choose-playstation");

// The navigation practice overlay and the pieces that change per step.
const navigationPrompt = document.getElementById("navigation-prompt");
const navigationActionImage = document.getElementById("navigation-action-image");
const navigationActionCopy = document.getElementById("navigation-action-copy");
const navigationActionStep = document.getElementById("navigation-action-step");
const navigationPracticeStatus = document.getElementById("navigation-practice-status");

// The final overview shown once practice is complete.
const trainingIntro = document.getElementById("training-intro");
const trainingStages = document.getElementById("training-stages");
const trainingNext = document.getElementById("training-next");

// The light / dark switch in the top bar.
const themeToggle = document.getElementById("theme-toggle");
const skipStepButton = document.getElementById("skip-step");


/* ---- Image folders ----
   Controller pictures live in one folder per brand (see controller.js). The
   code below only says which file it wants, for example "connected.png", and
   imagePath() picks the right folder for the connected controller. */


/* ---- The navigation practice steps ----
   One button per step, shown in this order. "button" is the standard gamepad
   button number the participant must press, "done" is the message shown once
   they press it, and "image" is only a file name (imagePath() adds the brand
   folder). "label", "copy" and "done" can be plain text or, where the two
   brands name the button differently, { xbox: "...", playstation: "..." }. */
const DPAD_ALT = "Neon highlight of a gamepad D-pad";
const SHOULDER_ALT = "Neon highlight of the controller shoulder buttons";
const PARTS_ALT = "Labelled diagram of the controller";

// Helper for the face buttons: the same wording with each brand's button name.
function faceButton(button, xboxName, psName) {
    const names = { xbox: xboxName, playstation: psName };
    const both = (make) => ({ xbox: make(xboxName), playstation: make(psName) });
    return {
        button, image: "labelled.png", alt: PARTS_ALT,
        label: names,
        copy: both((n) => `Now press the ${n} button.`),
        done: both((n) => `${n} was pressed`)
    };
}

const navigationActions = [
    { button: 12, image: "d_pad.png", alt: DPAD_ALT, label: "D-pad up",
      copy: "Press D-pad up button.", done: "D-pad up was pressed" },
    { button: 13, image: "d_pad.png", alt: DPAD_ALT, label: "D-pad down",
      copy: "Now press D-pad down button.", done: "D-pad down was pressed" },
    { button: 14, image: "d_pad.png", alt: DPAD_ALT, label: "D-pad left",
      copy: "Now press D-pad left button.", done: "D-pad left was pressed" },
    { button: 15, image: "d_pad.png", alt: DPAD_ALT, label: "D-pad right",
      copy: "Now press D-pad right button.", done: "D-pad right was pressed" },
    { button: 4, image: "shoulder.png", alt: SHOULDER_ALT, label: "Left shoulder button",
      copy: "Now, press the left shoulder button.", done: "Left shoulder button was pressed" },
    { button: 5, image: "shoulder.png", alt: SHOULDER_ALT, label: "Right shoulder button",
      copy: "Now press the right shoulder button.", done: "Right shoulder button was pressed" },
    faceButton(3, "Y ", "Triangle "),
    faceButton(1, "B ", "Circle "),
    faceButton(0, "A ", "Cross "),
    faceButton(2, "X ", "Square "),
    { button: 6, image: "labelled.png", alt: PARTS_ALT,
      label: { xbox: "Left trigger", playstation: "L2 trigger" },
      copy: { xbox: "Now press the left trigger, you will find a soft press button below the left shoulder button.", playstation: "Now press the L2 trigger." },
      done: { xbox: "Left trigger was pressed", playstation: "L2 trigger was pressed" } },
    { button: 7, image: "labelled.png", alt: PARTS_ALT,
      label: { xbox: "Right trigger", playstation: "R2 trigger" },
      copy: { xbox: "Finally, press the right trigger,this is also a soft press button below the right shoulder button.", playstation: "Finally, press the R2 trigger." },
      done: { xbox: "Right trigger was pressed", playstation: "R2 trigger was pressed" } }
];

// Picks the wording for the connected brand from plain text or { xbox, playstation }.
function pick(text, layout) {
    return typeof text === "string" ? text : text[layout];
}

// Stage 1 of the training ("About the device"), opened with B on the overview.
const ABOUT_URL = "about.html";

// The Y and B buttons (standard gamepad buttons 3 and 1), and what each brand calls them.
const REPEAT_BUTTON = 3;
const CONTINUE_BUTTON = 1;
const BUTTON_NAMES = {
    xbox: { repeat: "Y", next: "B" },
    playstation: { repeat: "Triangle", next: "Circle" }
};

// How long the "... was pressed" message stays before the next step (ms).
const NAVIGATION_FEEDBACK_MS = 1200;


/* ---- What the app remembers while it runs ---- */

// The id string of the controller we last looked at. When it changes
// (a different pad is plugged in) we forget the earlier layout choice.
let lastGamepadId = "";

// "xbox", "playstation", or null while we do not know yet.
let preferredLayout = null;

// Which manual layout button is highlighted on the "unknown" panel:
// 0 = Xbox, 1 = PlayStation.
let layoutChoiceIndex = 0;

// Which buttons were down on the previous frame. Comparing this with the
// current frame is how we notice a fresh press instead of a held button.
let lastGamepadButtons = [];

// The first frame after connecting only records the button state, so a
// button that is already held down does not count as a press.
let gamepadInputInitialized = false;
let navigationInputInitialized = false;

// True once the participant has started the navigation practice.
let navigationStarted = false;

// Which practice step is showing: 0, 1 or 2.
let navigationStep = 0;

// True while the "... was pressed" message is showing, so extra presses
// are ignored until the next step appears. navigationTimer is its timeout.
let navigationLocked = false;
let navigationTimer = 0;


/* ---------------------------------------------------------------------
   2. WELCOME - wait for full screen and a controller
   --------------------------------------------------------------------- */

// Returns the first controller the browser reports as connected, or null.
// The browser only reveals a controller after the user presses a button
// on it, so this stays null until then.
function firstConnectedGamepad() {
    return Array.from(navigator.getGamepads?.() ?? []).find((gamepad) => gamepad !== null && gamepad.connected) ?? null;
}

// Updates the green / red badge at the top of the card.
function setConnectionStatus(connected) {
    statusBadge?.classList.toggle("connected", connected);
    if (statusText)
        statusText.textContent = connected ? "Gamepad connected" : "Not connected";
}

// Decides which screen to show. It runs on every frame, so the page is only
// redrawn when the screen actually changes (tracked in currentScreen).
// Screens: "welcome" (no controller or not full screen), "choose" (brand
// unknown), "xbox" / "playstation" (the connected screen).
let currentScreen = "";

function renderGamepadState() {
    const gamepad = firstConnectedGamepad();

    // No controller, or not full screen yet: show the welcome overlay.
    if (!gamepad || !isFullScreenReady()) {
        lastGamepadButtons = [];
        gamepadInputInitialized = false;
        if (!gamepad) {
            // Unplugged: forget everything and start again.
            navigationStarted = false;
            navigationStep = 0;
            navigationInputInitialized = false;
            navigationLocked = false;
            clearTimeout(navigationTimer);
            lastGamepadId = "";
            preferredLayout = null;
            navigationPrompt.hidden = true;
            skipStepButton.hidden = true;
        }
        if (currentScreen !== "welcome") {
            currentScreen = "welcome";
            skipStepButton.hidden = true;
            welcomePrompt.hidden = false;
            trainingContent.hidden = true;
            connectedPanel.hidden = true;
            unknownPanel.hidden = true;
            gamepadName.textContent = "";
            setConnectionStatus(false);
        }
        return;
    }

    welcomePrompt.hidden = true;
    // Practice is running (or finished): leave the screen alone.
    if (navigationStarted) {
        trainingContent.hidden = false;
        return;
    }

    // A different pad was plugged in: forget the old manual choice.
    if (gamepad.id !== lastGamepadId) {
        lastGamepadId = gamepad.id;
        preferredLayout = null;
    }

    // Xbox -> Xbox screen, PlayStation -> PlayStation screen, unknown ->
    // the manual choice (or the layout the participant already chose).
    const detected = controllerFamily(gamepad);
    const layout = detected !== "unknown" ? detected : preferredLayout;
    preferredLayout = layout;
    const screenName = layout ?? "choose";
    if (screenName === currentScreen)
        return;
    currentScreen = screenName;

    trainingContent.hidden = false;
    trainingIntro.hidden = true;
    trainingStages.hidden = true;
    gamepadWelcome.hidden = false;
    navigationPrompt.hidden = true;
    setConnectionStatus(true);
    gamepadName.textContent = gamepad.id;
    connectedPanel.hidden = !layout;
    unknownPanel.hidden = !!layout;
    if (layout)
        localStorage.setItem(LAYOUT_KEY, layout); // the About page opens the matching diagram
    skipStepButton.hidden = false;

    if (layout) {
        // Connected screen: heading and picture from the brand's own folder.
        const brand = layout === "playstation" ? "PlayStation" : "Xbox";
        connectedHeading.textContent = `${brand} connected.`;
        holdImage.src = imagePath(layout, "connected.png");
        holdImage.alt = `Hands demonstrating the correct way to hold a ${brand} controller`;
    }
    else {
        updateLayoutChoiceFocus();
    }
}


/* ---------------------------------------------------------------------
   3. DETECTION - Xbox or PlayStation?
   --------------------------------------------------------------------- */

// Highlights the Xbox or PlayStation button on the "choose" screen.
function updateLayoutChoiceFocus() {
    xboxChoice.classList.toggle("gamepad-focus", layoutChoiceIndex === 0);
    psChoice.classList.toggle("gamepad-focus", layoutChoiceIndex === 1);
}

// The participant picked a layout by hand (mouse, keyboard or gamepad).
// A gamepad "click" comes from handleGamepadNavigation() further down.
function chooseLayout(layout, index) {
    preferredLayout = layout;
    layoutChoiceIndex = index;
    renderGamepadState();
}
xboxChoice.addEventListener("click", () => chooseLayout("xbox", 0));
psChoice.addEventListener("click", () => chooseLayout("playstation", 1));


/* ---------------------------------------------------------------------
   5. NAVIGATION PRACTICE - guided steps, one button each
   --------------------------------------------------------------------- */

// Closes the hold / choose screen and opens the practice at step 1.
function beginNavigation() {
    preferredLayout = preferredLayout ?? "xbox";
    connectedPanel.hidden = true;
    unknownPanel.hidden = true;
    navigationStarted = true;
    navigationStep = 0;
    navigationPrompt.hidden = false;
    showNavigationStep(navigationStep);
}

// Shows one practice step: the brand's picture, the instruction, the "Step n of 13:"
// tag, and the "Try: ..." line.
function showNavigationStep(step) {
    const action = navigationActions[step];
    // Falls back to the Xbox folder if no layout is known (should not happen).
    const layout = preferredLayout ?? "xbox";
    const label = pick(action.label, layout);
    navigationActionImage.hidden = false;
    skipStepButton.hidden = false;
    navigationActionStep.parentElement.hidden = false;
    navigationPracticeStatus.classList.remove("roomy");
    navigationActionImage.src = imagePath(layout, action.image);
    navigationActionImage.alt = action.alt;
    navigationActionCopy.textContent = pick(action.copy, layout);
    navigationActionStep.innerHTML = `<span class="navigation-key">Step ${step + 1} of ${navigationActions.length + 1}:</span> ${label}`;
    navigationPracticeStatus.textContent = `Try: ${label}.`;
    navigationPracticeStatus.classList.remove("pressed");
}

// The right button was pressed: say so, wait a moment, then move on
// (or finish after the last step).
function onNavigationPress(step) {
    navigationLocked = true;
    navigationPracticeStatus.textContent = pick(navigationActions[step].done, preferredLayout ?? "xbox");
    navigationPracticeStatus.classList.add("pressed");
    navigationTimer = setTimeout(() => {
        navigationLocked = false;
        if (step + 1 < navigationActions.length) {
            navigationStep = step + 1;
            showNavigationStep(navigationStep);
        }
        else {
            showRepeatStep();
        }
    }, NAVIGATION_FEEDBACK_MS);
}


/* ---------------------------------------------------------------------
   6. OVERVIEW - shown after the last practice step
   --------------------------------------------------------------------- */

// Last step: a recap of every button and its name, then the choice to
// practise again (Y) or carry on (B). The picture is hidden here to leave
// room for the text; showNavigationStep() brings it back.
function showRepeatStep() {
    const layout = preferredLayout ?? "xbox";
    const names = BUTTON_NAMES[layout];
    const recap = layout === "playstation"
        ? "D-pad up, down, left, right &middot; left and right shoulder buttons &middot; Triangle, Circle, Cross, Square &middot; L2 and R2 triggers"
        : "D-pad up, down, left, right &middot; left and right shoulder buttons &middot; Y, B, A, X &middot; left and right triggers";
    navigationStep = navigationActions.length;
    navigationActionImage.hidden = true;
    navigationActionStep.parentElement.hidden = true; // no step label or bullet on this page
    navigationActionCopy.innerHTML =
        `The next tasks use these buttons, so remember what each one is called:<br><strong>${recap}</strong>`;
    navigationPracticeStatus.innerHTML =
        `Not sure yet? Press <span class="navigation-key">${names.repeat}</span> to practise again.<br>` +
        `Confident? Press <span class="navigation-key">${names.next}</span> to go on to the next task.`;
    navigationPracticeStatus.classList.remove("pressed");
    navigationPracticeStatus.classList.add("roomy");
}

// Y on the last step: run the practice again from the first button.
function restartNavigation() {
    navigationStep = 0;
    navigationLocked = false;
    showNavigationStep(navigationStep);
}

// B at the last step: close the practice and show the "Learn to use your gamepad"
// overview, where B opens Stage 1.
function completeNavigation() {
    skipStepButton.hidden = true;
    const names = BUTTON_NAMES[preferredLayout ?? "xbox"];
    navigationPrompt.hidden = true;
    gamepadWelcome.hidden = true;
    trainingIntro.hidden = false;
    trainingStages.hidden = false;
    trainingNext.innerHTML =
        `Press <span class="navigation-key">${names.next}</span> to start Stage 1: About the device`;
}


/* ---------------------------------------------------------------------
   7. INPUT - reading the controller buttons
   --------------------------------------------------------------------- */

// Runs once per frame. Standard gamepad button numbers used here:
//   4 / 5   = left / right shoulder button (bumper)
//   12 / 13 = D-pad up / down
//   14 / 15 = D-pad left / right
// What a press does depends on which screen is showing:
//   hold screen        -> any button starts the navigation practice
//   navigation overlay -> the requested button shows "... was pressed",
//                         then the next step appears
//   "unknown" panel    -> D-pad left / right highlights a layout,
//                         a shoulder button confirms it
function handleGamepadNavigation() {
    const gamepad = firstConnectedGamepad();
    if (!gamepad) {
        lastGamepadButtons = [];
        navigationInputInitialized = false;
        return;
    }

    // Which buttons are down right now. An analogue trigger counts as
    // pressed once it is more than half way in.
    const pressed = gamepad.buttons.map((button) => !!(button.pressed || button.value > 0.5));
    // True only on the frame a button goes from up to down.
    const justPressed = (index) => pressed[index] && !lastGamepadButtons[index];
    const hasShoulderPress = justPressed(4) || justPressed(5);
    const hasAnyButtonPress = pressed.some((isPressed, index) => isPressed && !lastGamepadButtons[index]);

    // First frame: just remember the buttons, do not react to them.
    if (!gamepadInputInitialized) {
        lastGamepadButtons = pressed;
        gamepadInputInitialized = true;
        return;
    }

    // Hold screen -> start the navigation practice with step 1.
    if (preferredLayout && !connectedPanel?.hidden && navigationPrompt?.hidden && hasAnyButtonPress) {
        beginNavigation();
        lastGamepadButtons = pressed;
        return;
    }

    // Overview after the practice: B opens Stage 1.
    if (navigationStarted && !trainingStages.hidden) {
        if (justPressed(CONTINUE_BUTTON))
            window.location.href = ABOUT_URL;
        lastGamepadButtons = pressed;
        return;
    }

    // Navigation practice: each step waits for its own buttons.
    if (navigationPrompt && !navigationPrompt.hidden) {
        if (!navigationInputInitialized) {
            // Skip one frame so the press that opened the overlay is not reused.
            navigationInputInitialized = true;
        }
        else if (navigationStep === navigationActions.length) {
            // Last step: Y practises again, B continues.
            if (justPressed(REPEAT_BUTTON))
                restartNavigation();
            else if (justPressed(CONTINUE_BUTTON))
                completeNavigation();
        }
        else if (!navigationLocked && justPressed(navigationActions[navigationStep].button)) {
            onNavigationPress(navigationStep);
        }
        lastGamepadButtons = pressed;
        return;
    }

    // "Which layout matches?" panel: choose with the gamepad itself.
    if (!preferredLayout && justPressed(14)) {
        layoutChoiceIndex = 0;
        updateLayoutChoiceFocus();
    }
    else if (!preferredLayout && justPressed(15)) {
        layoutChoiceIndex = 1;
        updateLayoutChoiceFocus();
    }
    else if (!preferredLayout && hasShoulderPress && !unknownPanel?.hidden) {
        (layoutChoiceIndex === 0 ? xboxChoice : psChoice)?.click();
    }
    lastGamepadButtons = pressed;
}

// The browser has no "button pressed" event for gamepads, so we check
// the controller on every animation frame (about 60 times a second).
function pollGamepad() {
    renderGamepadState();
    handleGamepadNavigation();
    window.requestAnimationFrame(pollGamepad);
}


// Debug helper: the "Skip this step" button (mouse only). On the connected
// screen it starts the practice; during the practice it jumps to the next step without pressing anything on the gamepad. From the last
// practice step it goes to the "Remember the buttons" page, and from there
// to the overview.
skipStepButton.addEventListener("click", () => {
    if (!navigationStarted) {
        // Connected / choose screen: start the practice.
        beginNavigation();
        return;
    }
    if (navigationPrompt.hidden)
        return;
    clearTimeout(navigationTimer);
    navigationLocked = false;
    if (navigationStep + 1 < navigationActions.length) {
        navigationStep += 1;
        showNavigationStep(navigationStep);
    }
    else if (navigationStep < navigationActions.length) {
        showRepeatStep();
    }
    else {
        completeNavigation();
    }
});


/* ---------------------------------------------------------------------
   8. THEME - light / dark switch
   --------------------------------------------------------------------- */

// Shows the icon for the mode you would switch to, and keeps the
// screen-reader label in step with it.
function updateThemeButton() {
    const isDark = document.documentElement.dataset.theme !== "light";
    if (themeToggle) {
        themeToggle.textContent = isDark ? "☀" : "⏾";
        themeToggle.setAttribute("aria-label", isDark ? "Switch to light mode" : "Switch to dark mode");
    }
}

// Flips the theme and remembers it for the next visit. The first theme is
// applied by a tiny script in the <head> of index.html so the page does
// not flash the wrong colours while loading.
themeToggle?.addEventListener("click", () => {
    const next = document.documentElement.dataset.theme === "light" ? "dark" : "light";
    document.documentElement.dataset.theme = next;
    localStorage.setItem("gcats-theme", next);
    updateThemeButton();
});


/* ---------------------------------------------------------------------
   9. START-UP
   --------------------------------------------------------------------- */

// Re-check the screen whenever the situation changes.
window.addEventListener("gamepadconnected", renderGamepadState);
window.addEventListener("gamepaddisconnected", renderGamepadState);
document.addEventListener("fullscreenchange", renderGamepadState);
window.addEventListener("resize", renderGamepadState);

// Draw the first screen, then start watching the controller.
updateThemeButton();
renderGamepadState();
window.requestAnimationFrame(pollGamepad);
