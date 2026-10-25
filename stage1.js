/* =====================================================================
   GCATS stage 1 - thumbstick practice (Familiarisation)

   The participant works through guided steps with the thumbstick they
   chose on the About page:

     1. Move fully left, right, up, down, then diagonally
     2. Static targets: put the dot inside the target and lock it with a
        shoulder button (STATIC_TRIALS times)
     3. Follow the target: keep the dot inside a moving target; when it stops,
        confirm the dot's final position with a shoulder button
     4. Return the thumbstick to rest
     5. Final page: Y practises again, B goes to the next stage

   The file is ordered: settings, page elements, steps, the frame loop,
   the step logic, then start-up.
   ===================================================================== */

import { BUTTON_NAMES, CONTINUE_BUTTON, firstConnectedGamepad, keyboardInput, REPEAT_BUTTON } from "./controller.js";
import { autoDetect, drawDiagramStick, getLayout, loadDiagrams, SHOULDER_BUTTONS, showSavedDiagram } from "./diagram.js";
import { countRows, ensureSession, logRow } from "./datalog.js";
import { initThemeToggle } from "./theme.js";
import { getStickPreference } from "./storage.js";


/* ---------------------------------------------------------------------
   1. SETTINGS
   --------------------------------------------------------------------- */

// Thumbstick positions run from -1 to 1 on each axis.
const AXIS_EDGE = 0.85;       // "fully" left / right / up / down
const DIAG_EDGE = 0.6;        // both axes this far for a diagonal
const CENTER_ZONE = 0.15;     // "at rest"
const DEAD_ZONE = 0.08;       // ignore tiny drift around the centre

const STATIC_TRIALS = 15;     // how many static targets
const FOLLOW_TRIALS = 10;     // how many follow-the-target trials
const FOLLOW_MS = 10000;      // how long each target moves before it stops
const FOLLOW_RAMP_START = 0.25;   // the target starts at this fraction of its full speed, then speeds up
const FOLLOW_SPEED_FIRST = 0.6;   // speed of the first follow-the-target trial (1 = the base speed below)
const FOLLOW_SPEED_LAST = 1.5;    // speed of the last one; the target speeds up a little each trial
const TARGET_HIT = 0.15;      // how close the dot must be to count as "on the target"
const TRIAL_GAP_MS = 500;     // the cursor must rest in the centre this long before the next trial starts
const GUIDED_TRIALS = 2;      // the first trials of each target step come with instructions
const TARGET_REACH = 0.8;     // targets stay inside this fraction of the circle

const FEEDBACK_MS = 900;      // how long a "detected" message shows before the next step
const NEXT_URL = "stage2.html";

// The practice circle is drawn in a -100..100 box, so 1 stick unit = 96 px.
const PAD_RADIUS = 96;


/* ---------------------------------------------------------------------
   2. PAGE ELEMENTS
   --------------------------------------------------------------------- */

const checklistList = document.getElementById("checklist-list");
const stepText = document.getElementById("current-step-text");
const stepStatus = document.getElementById("current-step-status");
const stickNote = document.getElementById("stick-note");
const finalPrompt = document.getElementById("final-prompt");
const checklistPanel = document.querySelector(".checklist-panel");
const padDot = document.getElementById("pad-dot");
const padTarget = document.getElementById("pad-target");

/* ---------------------------------------------------------------------
   3. THE STEPS
   --------------------------------------------------------------------- */

// "check" steps are done when the stick is held in position for "dwellMs".
// "static" and "follow" steps are target practice and run their own logic.
const steps = [
    { id: "left", short: "Move fully left", label: "Move the thumbstick fully to the left", done: "Left detected", dwellMs: 200, check: (s) => s.x < -AXIS_EDGE },
    { id: "right", short: "Move fully right", label: "Move the thumbstick fully to the right", done: "Right detected", dwellMs: 200, check: (s) => s.x > AXIS_EDGE },
    { id: "up", short: "Move fully up", label: "Move the thumbstick fully upward", done: "Up detected", dwellMs: 200, check: (s) => s.y < -AXIS_EDGE },
    { id: "down", short: "Move fully down", label: "Move the thumbstick fully downward", done: "Down detected", dwellMs: 200, check: (s) => s.y > AXIS_EDGE },
    { id: "diagonal", short: "Move diagonally", label: "Move the thumbstick diagonally (up and to the right)", done: "Diagonal detected", dwellMs: 200, check: (s) => s.x > DIAG_EDGE && s.y < -DIAG_EDGE },
    { id: "static", short: "Static targets", type: "static", trials: STATIC_TRIALS, label: "Move your cursor onto the yellow target", done: "All static targets complete" },
    { id: "follow", short: "Follow the target", type: "follow", trials: FOLLOW_TRIALS, label: "Keep your cursor inside the yellow target", done: "Follow the target complete" },
    { id: "center", short: "Return to rest", label: "Return the thumbstick to its resting position", done: "Resting position detected", dwellMs: 200, check: (s) => Math.hypot(s.x, s.y) < CENTER_ZONE }
];


/* ---------------------------------------------------------------------
   4. WHAT THE PAGE REMEMBERS
   --------------------------------------------------------------------- */

let stepIndex = 0;                // current step; steps.length means the final page
let stepStartedAt = 0;            // when the current step appeared (for the data log)
let heldSince = null;             // when the stick first reached the position (for dwellMs)
let locked = false;               // true while a "detected" message is showing
let feedbackTimer = 0;

let trial = 0;                    // finished targets in the current target step
let target = { x: 0, y: 0 };      // where the target is, in stick units
let phase = "centre";             // target steps: "centre" (waiting for the cursor to return) or "active"
let centreSince = null;           // when the cursor reached the centre (for TRIAL_GAP_MS)
let lastLockWasGuided = false;    // was the trial just locked a guided one?
let following = null;             // moving-target state: { start, speedScale, pathX, pathY, errorSum, frames, stopped }

let trialStartedAt = 0;           // when the current target trial began (for the time taken)

let lastButtons = [];             // which buttons were down on the previous frame
let inputReady = false;           // first frame only records buttons, so a held button is ignored
const keys = keyboardInput();   // keyboard backup for testing: arrows move, Space / Enter confirm, Y and B


/* ---------------------------------------------------------------------
   4b. DATA LOG
   Every finished step and locked trial is written to the data log (datalog.js)
   with its attempt number. Each "practise again" starts a new attempt; the
   distances of the current attempt are kept here for the recap on the last page.
   --------------------------------------------------------------------- */

let attemptNumber = 1;
let staticDistances = [];
let followDistances = [];

const round4 = (n) => Math.round(n * 10000) / 10000;

// Starts attempt number (attempts so far + 1), also after a page reload.
function startAttempt() {
    attemptNumber = countRows("stage1", "attempt_start") + 1;
    staticDistances = [];
    followDistances = [];
    logRow("stage1", { event: "attempt_start", attempt: attemptNumber });
}


/* ---------------------------------------------------------------------
   5. CHECKLIST (left panel)
   --------------------------------------------------------------------- */

// Builds the list once; renderChecklist() then updates it as steps finish.
function buildChecklist() {
    checklistList.innerHTML = steps.map((step) => `
        <li class="checklist-item" id="checklist-${step.id}">
            <span class="checklist-icon"></span>
            <span class="checklist-label"></span>
        </li>`).join("");
}

// Ticks finished steps, highlights the current one, and shows progress
// such as "Static targets (4 / 15)" for the target steps.
function renderChecklist() {
    steps.forEach((step, i) => {
        const item = document.getElementById(`checklist-${step.id}`);
        const done = i < stepIndex;
        item.classList.toggle("is-done", done);
        item.classList.toggle("is-current", i === stepIndex);
        item.querySelector(".checklist-icon").textContent = done ? "✓" : String(i + 1);
        const progress = step.trials ? ` (${done ? step.trials : i === stepIndex ? trial : 0} / ${step.trials})` : "";
        item.querySelector(".checklist-label").textContent = step.short + progress;
    });
}


/* ---------------------------------------------------------------------
   6. STEP LOGIC
   --------------------------------------------------------------------- */

function setStatus(text, tone = "") {
    const className = `current-step-status ${tone}`.trim();
    if (stepStatus.textContent === text && stepStatus.className === className) return;   // runs every frame, so skip no-op writes
    stepStatus.textContent = text;
    stepStatus.className = className;
}

// Shows step i and prepares anything it needs.
function showStep(i) {
    stepIndex = i;
    stepStartedAt = performance.now();
    locked = false;
    heldSince = null;
    trial = 0;
    hideTarget();
    following = null;
    finalPrompt.hidden = true;
    checklistPanel.classList.remove("is-compact");

    if (i >= steps.length) {
        showFinalPage();
        return;
    }
    const step = steps[i];
    stepText.textContent = `Step ${i + 1} of ${steps.length}: ${step.label}`;
    setStatus("");
    // Target practice starts by waiting for the cursor to be in the centre.
    if (step.trials) waitForCentre(step, false);
    renderChecklist();
}

// Shows the "... detected" message, then moves on after a short pause.
function completeStep(message) {
    locked = true;
    logRow("stage1", {
        event: "step_complete",
        attempt: attemptNumber,
        step: stepIndex + 1,
        step_id: steps[stepIndex].id,
        label: steps[stepIndex].short,
        duration_ms: Math.round(performance.now() - stepStartedAt)
    });
    setStatus(`✓ ${message}`, "is-good");
    clearTimeout(feedbackTimer);
    feedbackTimer = setTimeout(() => showStep(stepIndex + 1), FEEDBACK_MS);
}

// A random spot inside the circle, not too close to the centre.
function randomSpot() {
    const angle = Math.random() * Math.PI * 2;
    const radius = 0.3 + Math.random() * (TARGET_REACH - 0.3);
    return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
}

// The target ring: yellow normally, green (static) or blue (follow the target)
// while the cursor is inside it.
function showTarget() {
    padTarget.toggleAttribute("hidden", false);
    padTarget.setAttribute("cx", String(target.x * PAD_RADIUS));
    padTarget.setAttribute("cy", String(target.y * PAD_RADIUS));
}

function hideTarget() {
    padTarget.toggleAttribute("hidden", true);   // SVG elements have no .hidden property
    padTarget.classList.remove("is-green", "is-blue");
}

function paintTarget(step, inside) {
    padTarget.classList.toggle("is-green", inside && step.type === "static");
    padTarget.classList.toggle("is-blue", inside && step.type === "follow");
}

// The first GUIDED_TRIALS trials of each target step show instructions; the rest show none.
function isGuided() {
    return trial < GUIDED_TRIALS;
}

// Between trials the target is hidden until the cursor is back in the centre.
function waitForCentre(step, justLocked) {
    phase = "centre";
    centreSince = null;
    following = null;
    hideTarget();
    if (justLocked && lastLockWasGuided) setStatus("✓ Position locked. Now return your cursor to the centre.", "is-good");
    else setStatus(isGuided() ? "Return your cursor to the centre." : "");
}

function beginTrial(step) {
    phase = "active";
    trialStartedAt = performance.now();
    if (!isGuided()) setStatus("");   // no instructions after the guided trials
    if (step.type === "static") {
        target = randomSpot();
        showTarget();
    } else {
        startFollowing();
    }
}

// Follow the target: it always starts in the centre, moves slowly at first,
// then speeds up smoothly for FOLLOW_MS, and stops so the participant can
// lock their position. Each trial is also a little faster than the one
// before (first -> last speed).
function startFollowing() {
    const progress = trial / Math.max(FOLLOW_TRIALS - 1, 1);
    following = {
        start: performance.now(),
        speedScale: FOLLOW_SPEED_FIRST + progress * (FOLLOW_SPEED_LAST - FOLLOW_SPEED_FIRST),
        // How fast each axis winds around, and which way it first heads (random per trial).
        pathX: { rate: 0.9 + Math.random() * 0.4, sign: Math.random() < 0.5 ? -1 : 1 },
        pathY: { rate: 0.7 + Math.random() * 0.4, sign: Math.random() < 0.5 ? -1 : 1 },
        errorSum: 0,
        frames: 0,
        stopped: false
    };
    target = { x: 0, y: 0 };
    updateFollowingTarget(performance.now());
}

function updateFollowingTarget(now, stick) {
    const total = FOLLOW_MS / 1000;
    const t = Math.min(now - following.start, FOLLOW_MS) / 1000;
    // Distance travelled along the path: speed rises from FOLLOW_RAMP_START to full speed over the trial.
    const travelled = following.speedScale * (FOLLOW_RAMP_START * t + (1 - FOLLOW_RAMP_START) * t * t / (2 * total));
    target = {
        x: following.pathX.sign * TARGET_REACH * Math.sin(following.pathX.rate * travelled),
        y: following.pathY.sign * TARGET_REACH * Math.sin(following.pathY.rate * travelled)
    };
    showTarget();
    if (stick && !following.stopped) {
        following.errorSum += Math.hypot(stick.x - target.x, stick.y - target.y);
        following.frames += 1;
    }
    if (now - following.start >= FOLLOW_MS) following.stopped = true;
}

// The participant locked the position inside the target: record it, then
// either finish the step or wait for the cursor to return to the centre.
function lockTrial(step, distance) {
    const timeMs = Math.round(performance.now() - trialStartedAt);
    const averageDistance = step.type === "follow" ? round4(following.errorSum / Math.max(following.frames, 1)) : "";
    (step.type === "static" ? staticDistances : followDistances).push(step.type === "static" ? distance : averageDistance);
    logRow("stage1", {
        event: step.type === "static" ? "static_trial" : "follow_trial",
        attempt: attemptNumber,
        trial_n: trial + 1,
        guided: isGuided(),
        target_x: step.type === "static" ? round4(target.x) : "",
        target_y: step.type === "static" ? round4(target.y) : "",
        speed_scale: step.type === "follow" ? round4(following.speedScale) : "",
        final_distance: round4(distance),
        average_distance: averageDistance,
        time_ms: timeMs
    });
    lastLockWasGuided = isGuided();
    trial += 1;
    renderChecklist();
    if (trial >= step.trials) {
        hideTarget();
        completeStep(step.done);
        return;
    }
    waitForCentre(step, true);
}

// Runs once per frame for target steps (static targets and follow the target).
function runTargetStep(step, stick, now, confirmed) {
    // 1. Wait for the cursor to return to the centre and rest there for
    //    TRIAL_GAP_MS, then start the next trial.
    if (phase === "centre") {
        if (Math.hypot(stick.x, stick.y) >= CENTER_ZONE) {
            centreSince = null;
        } else {
            centreSince = centreSince ?? now;
            if (now - centreSince >= TRIAL_GAP_MS) beginTrial(step);
        }
        return;
    }

    // 2. The trial is running.
    if (step.type === "follow") updateFollowingTarget(now, stick);
    const distance = Math.hypot(stick.x - target.x, stick.y - target.y);
    const inside = distance <= TARGET_HIT;
    paintTarget(step, inside);
    const canLock = step.type === "static" || following.stopped;

    if (isGuided()) {
        if (inside && canLock) setStatus("Press a shoulder button to lock the position.");
        else if (step.type === "follow" && following.stopped) setStatus("The target has stopped. Move your cursor inside it.");
        else if (step.type === "follow") setStatus("Keep your cursor inside the yellow target as it moves.");
        else setStatus("Take your cursor inside the yellow target.");
    }

    if (confirmed && canLock) {
        if (inside) lockTrial(step, distance);
        else if (isGuided()) setStatus("Not inside the target yet. Move your cursor inside it first.", "is-bad");
    }
}

// Runs once per frame for the current step.
function runStep(step, stick, now, confirmed) {
    if (step.trials) {
        runTargetStep(step, stick, now, confirmed);
        return;
    }
    // Held-position steps: left, right, up, down, diagonal, rest.
    if (!step.check(stick)) { heldSince = null; return; }
    heldSince = heldSince ?? now;
    if (now - heldSince >= step.dwellMs) completeStep(step.done);
}

// Last page: a recap, then Y practises again and B goes to the next stage.
function showFinalPage() {
    const names = BUTTON_NAMES[getLayout() ?? "xbox"];
    const mean = (list) => list.reduce((a, b) => a + b, 0) / Math.max(list.length, 1);
    const staticMean = mean(staticDistances);
    const followMean = mean(followDistances);
    logRow("stage1", {
        event: "attempt_complete",
        attempt: attemptNumber,
        mean_static_distance: round4(staticMean),
        mean_follow_distance: round4(followMean)
    });
    stepText.textContent = "Practice complete. Well done!";
    setStatus(`Average distance from the target: ${staticMean.toFixed(2)} (static), ${followMean.toFixed(2)} (follow the target). Your results are saved.`);
    finalPrompt.innerHTML =
        `Press <span class="navigation-key">${names.repeat}</span> to practise again<br>` +
        `Press <span class="navigation-key">${names.next}</span> to move to the next stage`;
    finalPrompt.hidden = false;
    checklistPanel.classList.add("is-compact");   // smaller checklist so everything fits without scrolling
    renderChecklist();
}

function restart() {
    startAttempt();
    showStep(0);
}


/* ---------------------------------------------------------------------
   7. THE FRAME LOOP (runs about 60 times a second)
   --------------------------------------------------------------------- */

// The thumbstick chosen on the About page (left if none was chosen).
function readStick(pad) {
    const stick = getStickPreference() === "right" ? 2 : 0;
    let x = keys.x, y = keys.y;
    if (pad) {
        x = pad.axes[stick] || 0;
        y = pad.axes[stick + 1] || 0;
    }
    const length = Math.hypot(x, y);
    if (length < DEAD_ZONE) return { x: 0, y: 0 };
    return length > 1 ? { x: x / length, y: y / length } : { x, y };
}

// Moves the dot in the practice circle and the stick in the small picture.
function drawStick(stick, pad) {
    padDot.setAttribute("cx", String(stick.x * PAD_RADIUS));
    padDot.setAttribute("cy", String(stick.y * PAD_RADIUS));
    drawDiagramStick(stick, pad);
}

function frame(now) {
    const pad = firstConnectedGamepad();
    autoDetect(pad);

    // Which buttons are newly pressed this frame.
    const down = pad ? pad.buttons.map((b) => Boolean(b.pressed || b.value > 0.5)) : [];
    const justPressed = (index) => inputReady && down[index] && !lastButtons[index];
    const confirmed = SHOULDER_BUTTONS.some(justPressed) || keys.confirm;
    const repeat = justPressed(REPEAT_BUTTON) || keys.repeat;
    const next = justPressed(CONTINUE_BUTTON) || keys.next;
    keys.confirm = keys.repeat = keys.next = false;
    lastButtons = down;
    inputReady = Boolean(pad);

    const stick = readStick(pad);
    drawStick(stick, pad);
    stickNote.textContent = pad || keys.x || keys.y
        ? `Using the ${getStickPreference() === "right" ? "right" : "left"} thumbstick (chosen on the About page).`
        : "Connect your controller and press any button.";

    if (stepIndex >= steps.length) {
        if (repeat) restart();
        else if (next) {
            logRow("stage1", { event: "continue_to_stage2", attempt: attemptNumber });
            window.location.href = NEXT_URL;
        }
    } else if (!locked) {
        runStep(steps[stepIndex], stick, now, confirmed);
    }
    requestAnimationFrame(frame);
}




/* ---------------------------------------------------------------------
   8. START-UP
   --------------------------------------------------------------------- */

await loadDiagrams();
showSavedDiagram();
ensureSession();
startAttempt();

initThemeToggle();
buildChecklist();
showStep(0);
requestAnimationFrame(frame);
