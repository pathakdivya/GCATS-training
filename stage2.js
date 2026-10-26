/* =====================================================================
   GCATS stage 2 - random dot motion task

   Part 1: a field of dots moves; most drift one way (up, down, left or
           right). The participant tilts the thumbstick that way. The share
           of dots moving together (coherence) goes down after a correct
           answer and up after a wrong one (a staircase), for 2 blocks of
           40 trials. Accuracy of at least 75% is needed to continue.
   Part 2: follow the target. A target starts in the centre and drifts around
           the circle while the participant keeps the cursor inside it; when it
           stops they lock their position with a shoulder button.

   The file is ordered: settings, page elements, the state, the dot field,
   Part 1, Part 2, results, input, the frame loop, then start-up.
   ===================================================================== */

import { BUTTON_NAMES, CONTINUE_BUTTON, firstConnectedGamepad, keyboardInput, REPEAT_BUTTON } from "./controller.js";
import { autoDetect, drawDiagramStick, getLayout, loadDiagrams, SHOULDER_BUTTONS, showSavedDiagram } from "./diagram.js";
import { ensureSession, logRow } from "./datalog.js";
import { initThemeToggle } from "./theme.js";
import { addStage2Attempt, getStage2Attempts, getStickPreference, hasPassedStage2, STAGE2_PASS_THRESHOLD } from "./storage.js";


/* ---------------------------------------------------------------------
   1. SETTINGS
   --------------------------------------------------------------------- */

// Part 1: the dots
const DOT_COUNT = 140;
const DOT_SPEED = 0.0032;          // fraction of the canvas per frame
const DOT_RADIUS = 2.2;
const DOT_MAX_LIFE = 24;           // frames before a dot is replaced

const TRIALS_PER_BLOCK = 40;
const TOTAL_BLOCKS = 2;
const COHERENCE_START = 0.5;
const COHERENCE_STEP = 0.05;
const COHERENCE_MIN = 0.03;
const COHERENCE_MAX = 0.95;

const RESPONSE_THRESHOLD = 0.5;    // how far the stick must tilt to count as an answer
const RECENTER_THRESHOLD = 0.2;    // how close to the centre it must come back
const TRIAL_GAP_MS = 500;          // the stick must rest in the centre this long before the next trial
const FEEDBACK_MS = 650;           // how long "Correct" / "Try again" shows

// Part 2: follow the target (same behaviour as the practice on stage 1)
const FOLLOW_TRIALS = 5;
const FOLLOW_MS = 10000;           // how long each target moves before it stops
const FOLLOW_SPEED_FIRST = 0.6;    // speed of the first target (1 = base speed); each target is a little faster
const FOLLOW_SPEED_LAST = 1.5;
const FOLLOW_RAMP_START = 0.25;    // each target starts at this fraction of its speed, then speeds up
const TARGET_REACH = 0.8;          // targets stay inside this fraction of the circle
const TARGET_HIT = 0.15;           // how close the cursor must be to count as inside the target

const NEXT_URL = "stage3.html";


/* ---------------------------------------------------------------------
   2. PAGE ELEMENTS
   --------------------------------------------------------------------- */

const $ = (id) => document.getElementById(id);

const canvas = $("rdm-canvas");
const ctx = canvas.getContext("2d");
const startButton = $("rdm-start-btn");
const statusText = $("rdm-status-text");
const blockValue = $("rdm-block-value");
const trialValue = $("rdm-trial-value");
const coherenceValue = $("rdm-coherence-value");
const progressFill = $("rdm-progress-fill");
const feedbackBadge = $("rdm-feedback-badge");
const partLabel = $("part-label");
const partText = $("part-text");
const partStatus = $("part-status");
const stickNote = $("stick-note");
const attemptNote = $("rdm-attempt-note");
const instructions = $("rdm-instructions");
const noStickNotice = $("no-stick-notice");
const taskBody = $("task-body");
const canvasBox = document.querySelector(".rdm-canvas-box");
const completeScreen = $("rdm-complete-screen");
const resultHeading = $("rdm-result-heading");
const resultMessage = $("rdm-result-message");
const resultPrompt = $("rdm-result-prompt");
const finalAccuracy = $("rdm-final-accuracy");
const finalCoherence = $("rdm-final-coherence");
const finalFollow = $("rdm-final-follow");
const redoButton = $("rdm-redo-btn");
const continueButton = $("rdm-continue-btn");
const arrows = { up: $("rdm-arrow-up"), down: $("rdm-arrow-down"), left: $("rdm-arrow-left"), right: $("rdm-arrow-right") };


/* ---------------------------------------------------------------------
   3. WHAT THE PAGE REMEMBERS
   --------------------------------------------------------------------- */

// "idle"      waiting for Begin
// "stimulus"  Part 1: dots are moving, waiting for an answer
// "feedback"  Part 1: showing Correct / Try again
// "centre"    waiting for the stick to rest in the centre (both parts)
// "follow"    Part 2: the target is moving or waiting to be locked
// "complete"  results on screen
let phase = "idle";
let part = 1;

let dots = [];
let coherence = COHERENCE_START;
let currentDirection = "up";
let block = 1;
let trial = 0;                     // Part 1: trial within the block. Part 2: finished targets
let results = [];                  // Part 1 answers
let followResults = [];            // Part 2 trials
let attemptStart = 0;
let attemptNumber = 1;             // for the data log: which run of Stage 2 this is
let stimulusOnset = 0;             // when the dots started moving (to measure the response time)

let centreSince = null;            // when the stick reached the centre (for TRIAL_GAP_MS)
let nextAfterCentre = null;        // what to start once the gap has passed: "dots" or "target"
let feedbackTimer = 0;

let target = { x: 0, y: 0 };       // Part 2 target, in stick units (-1..1)
let following = null;              // Part 2 moving-target state
let trialStartedAt = 0;
let cursor = { x: 0, y: 0 };       // where the stick is, drawn in Part 2

let lastButtons = [];
let inputReady = false;            // first frame only records buttons, so a held button is ignored
const keys = keyboardInput();   // keyboard backup for testing: arrows move, Space / Enter confirm, Y and B

let stick = getStickPreference();  // "left", "right" or null


/* ---------------------------------------------------------------------
   4. THE DOT FIELD (Part 1)
   --------------------------------------------------------------------- */

function spawnDot() {
    return {
        x: Math.random(),
        y: Math.random(),
        coherent: Math.random() < coherence,
        life: Math.floor(Math.random() * DOT_MAX_LIFE)
    };
}

function seedDotField() {
    dots = Array.from({ length: DOT_COUNT }, spawnDot);
}

const DIRECTION_ANGLES = { up: -Math.PI / 2, down: Math.PI / 2, left: Math.PI, right: 0 };

// Moves every dot one frame: coherent dots go the correct way, the rest wander.
function stepDotField() {
    const moving = phase === "stimulus";
    for (let i = 0; i < dots.length; i++) {
        const dot = dots[i];
        if (moving) {
            const angle = dot.coherent ? DIRECTION_ANGLES[currentDirection] : Math.random() * Math.PI * 2;
            dot.x += Math.cos(angle) * DOT_SPEED;
            dot.y += Math.sin(angle) * DOT_SPEED;
            dot.life--;
        }
        if (dot.life <= 0 || dot.x < 0 || dot.x > 1 || dot.y < 0 || dot.y > 1) dots[i] = spawnDot();
    }
}

function drawDotField() {
    const { width, height } = canvas;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#e8e8e8";
    for (const dot of dots) {
        ctx.beginPath();
        ctx.arc(dot.x * width, dot.y * height, DOT_RADIUS, 0, Math.PI * 2);
        ctx.fill();
    }
    drawCrosshair();
}

function drawCrosshair() {
    const { width, height } = canvas;
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(width / 2, 0);
    ctx.lineTo(width / 2, height);
    ctx.moveTo(0, height / 2);
    ctx.lineTo(width, height / 2);
    ctx.stroke();
}


/* ---------------------------------------------------------------------
   5. PART 1 - WHICH WAY ARE THE DOTS MOVING?
   --------------------------------------------------------------------- */

function startTask() {
    part = 1;
    block = 1;
    trial = 0;
    coherence = COHERENCE_START;
    results = [];
    followResults = [];
    attemptStart = performance.now();
    attemptNumber = getStage2Attempts().length + 1;
    logRow("stage2", { event: "attempt_start", attempt: attemptNumber });
    completeScreen.hidden = true;
    canvasBox.classList.remove("is-follow");
    startButton.hidden = false;
    startButton.disabled = true;
    startButton.textContent = "Task in progress…";
    startNextDotTrial();
}

function startNextDotTrial() {
    if (trial >= TRIALS_PER_BLOCK) {
        if (block < TOTAL_BLOCKS) {
            block += 1;
            trial = 0;
        } else {
            startFollowPart();
            return;
        }
    }
    trial += 1;
    currentDirection = ["up", "down", "left", "right"][Math.floor(Math.random() * 4)];
    seedDotField();
    phase = "stimulus";
    stimulusOnset = performance.now();
    Object.values(arrows).forEach((el) => el.classList.remove("active"));
    partLabel.textContent = "Part 1 of 2";
    partText.textContent = "Which way are most of the dots moving?";
    partStatus.textContent = "";
    statusText.textContent = "Which way are most of the dots moving?";
    updateStats();
}

function registerResponse(response) {
    const correct = response === currentDirection;
    results.push({ block, trial, direction: currentDirection, coherence, correct });
    logRow("stage2", {
        event: "rdm_trial",
        attempt: attemptNumber,
        block,
        trial_n: trial,
        direction: currentDirection,
        coherence: Math.round(coherence * 10000) / 10000,
        response,
        correct: correct ? 1 : 0,
        rt_ms: Math.round(performance.now() - stimulusOnset)
    });
    coherence = correct
        ? Math.max(COHERENCE_MIN, coherence - COHERENCE_STEP)
        : Math.min(COHERENCE_MAX, coherence + COHERENCE_STEP);

    arrows[response].classList.add("active");
    feedbackBadge.textContent = correct ? "Correct" : "Try again";
    feedbackBadge.className = `rdm-feedback-badge show ${correct ? "correct" : "incorrect"}`;
    phase = "feedback";

    clearTimeout(feedbackTimer);
    feedbackTimer = setTimeout(() => {
        feedbackBadge.classList.remove("show");
        waitForCentre("dots");
        statusText.innerHTML = "Re-center the stick to <b>neutral</b> to continue.";
        partStatus.textContent = "Return the stick to the centre.";
    }, FEEDBACK_MS);
}

function directionFromStick(s) {
    return Math.abs(s.x) > Math.abs(s.y) ? (s.x < 0 ? "left" : "right") : (s.y < 0 ? "up" : "down");
}

// The stick has to come back to the centre and rest there before anything new starts.
function waitForCentre(next) {
    phase = "centre";
    nextAfterCentre = next;
    centreSince = null;
}


/* ---------------------------------------------------------------------
   6. PART 2 - FOLLOW THE TARGET
   --------------------------------------------------------------------- */

function startFollowPart() {
    part = 2;
    canvasBox.classList.add("is-follow");   // hides the direction arrows
    trial = 0;
    partLabel.textContent = "Part 2 of 2";
    partText.textContent = "Follow the target: keep your cursor inside the yellow target";
    partStatus.textContent = "Return the stick to the centre to begin.";
    statusText.textContent = "Part 2: keep your cursor inside the yellow target. When it stops, press a shoulder button to lock your position.";
    waitForCentre("target");
    updateStats();
}

// The target starts in the centre, moves slowly at first, then speeds up for
// FOLLOW_MS; each target is also a little faster than the one before.
function startFollowingTarget() {
    const progress = trial / Math.max(FOLLOW_TRIALS - 1, 1);
    following = {
        start: performance.now(),
        speedScale: FOLLOW_SPEED_FIRST + progress * (FOLLOW_SPEED_LAST - FOLLOW_SPEED_FIRST),
        pathX: { rate: 0.9 + Math.random() * 0.4, sign: Math.random() < 0.5 ? -1 : 1 },
        pathY: { rate: 0.7 + Math.random() * 0.4, sign: Math.random() < 0.5 ? -1 : 1 },
        errorSum: 0,
        frames: 0,
        stopped: false
    };
    target = { x: 0, y: 0 };
    trialStartedAt = performance.now();
    phase = "follow";
    partStatus.textContent = `Target ${trial + 1} of ${FOLLOW_TRIALS}`;
    updateStats();
}

function updateFollowingTarget(now, s) {
    const total = FOLLOW_MS / 1000;
    const t = Math.min(now - following.start, FOLLOW_MS) / 1000;
    // Distance travelled along the path: speed rises from FOLLOW_RAMP_START to full speed.
    const travelled = following.speedScale * (FOLLOW_RAMP_START * t + (1 - FOLLOW_RAMP_START) * t * t / (2 * total));
    target = {
        x: following.pathX.sign * TARGET_REACH * Math.sin(following.pathX.rate * travelled),
        y: following.pathY.sign * TARGET_REACH * Math.sin(following.pathY.rate * travelled)
    };
    if (!following.stopped) {
        following.errorSum += Math.hypot(s.x - target.x, s.y - target.y);
        following.frames += 1;
    }
    if (now - following.start >= FOLLOW_MS) following.stopped = true;
}

function lockFollowTrial(distance) {
    followResults.push({
        trial: trial + 1,
        speedScale: Math.round(following.speedScale * 10000) / 10000,
        finalDistance: Math.round(distance * 10000) / 10000,
        averageDistance: Math.round(following.errorSum / Math.max(following.frames, 1) * 10000) / 10000,
        timeMs: Math.round(performance.now() - trialStartedAt)
    });
    const last = followResults[followResults.length - 1];
    logRow("stage2", {
        event: "follow_trial",
        attempt: attemptNumber,
        trial_n: last.trial,
        speed_scale: last.speedScale,
        final_distance: last.finalDistance,
        average_distance: last.averageDistance,
        time_ms: last.timeMs
    });
    trial += 1;
    following = null;
    if (trial >= FOLLOW_TRIALS) {
        finishAttempt();
    } else {
        partStatus.textContent = "Locked. Return the stick to the centre.";
        waitForCentre("target");
        updateStats();
    }
}

// Draws the circle, the target (yellow, blue while the cursor is inside it) and the cursor.
function drawFollowField(inside) {
    const { width, height } = canvas;
    const radius = width * 0.46;
    ctx.clearRect(0, 0, width, height);
    drawCrosshair();
    ctx.strokeStyle = "rgba(255,255,255,0.6)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(width / 2, height / 2, radius, 0, Math.PI * 2);
    ctx.stroke();
    if (phase === "follow" && following) {
        const colour = inside ? "#4f8cff" : "#ffd84d";
        ctx.fillStyle = inside ? "rgba(79,140,255,0.45)" : "rgba(255,216,77,0.35)";
        ctx.strokeStyle = colour;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(width / 2 + target.x * radius, height / 2 + target.y * radius, TARGET_HIT * radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
    }
    ctx.fillStyle = "#e8e8e8";
    ctx.beginPath();
    ctx.arc(width / 2 + cursor.x * radius, height / 2 + cursor.y * radius, 6, 0, Math.PI * 2);
    ctx.fill();
}


/* ---------------------------------------------------------------------
   7. RESULTS
   --------------------------------------------------------------------- */

function finishAttempt() {
    phase = "complete";
    startButton.hidden = true;
    startButton.disabled = false;
    startButton.textContent = "Begin Task";

    const recent = results.slice(-10);
    const avgCoherence = recent.length ? recent.reduce((sum, r) => sum + r.coherence, 0) / recent.length : coherence;
    const accuracy = results.length ? (results.filter((r) => r.correct).length / results.length) * 100 : 0;
    const finalCoherenceValue = avgCoherence * 100;
    const passed = accuracy >= STAGE2_PASS_THRESHOLD;
    const followAverage = followResults.length
        ? followResults.reduce((sum, r) => sum + r.averageDistance, 0) / followResults.length
        : 0;

    logRow("stage2", {
        event: "attempt_complete",
        attempt: attemptNumber,
        accuracy_pct: Math.round(accuracy * 10) / 10,
        final_coherence_pct: Math.round(finalCoherenceValue * 10) / 10,
        passed: passed ? 1 : 0,
        mean_follow_distance: Math.round(followAverage * 10000) / 10000,
        completion_time_ms: Math.round(performance.now() - attemptStart)
    });
    // The summary decides whether the questionnaire unlocks (storage.js); the trials are in the data log.
    addStage2Attempt({
        timestamp: new Date().toISOString(),
        accuracy,
        finalCoherence: finalCoherenceValue,
        passed,
        completionTimeMs: Math.round(performance.now() - attemptStart)
    });

    finalAccuracy.textContent = `${Math.round(accuracy)}%`;
    finalCoherence.textContent = `${Math.round(finalCoherenceValue)}%`;
    finalFollow.textContent = followAverage.toFixed(2);

    const names = BUTTON_NAMES[getLayout() ?? "xbox"];
    if (passed) {
        resultHeading.textContent = "Task Complete";
        resultMessage.textContent = `You met the ${STAGE2_PASS_THRESHOLD}% accuracy criterion. You may continue to the questionnaire, or repeat the task to try to improve your score.`;
        resultPrompt.innerHTML =
            `Press <span class="navigation-key">${names.repeat}</span> to repeat the task<br>` +
            `Press <span class="navigation-key">${names.next}</span> to continue to the questionnaire`;
        statusText.textContent = "You can continue to the questionnaire.";

    } else if (hasPassedStage2()) {
     resultHeading.textContent = "Below your best";
     resultMessage.textContent = `This attempt was under ${STAGE2_PASS_THRESHOLD}%, but you already met the criterion earlier. You can continue to the questionnaire or try again.`;
     resultPrompt.innerHTML =
         `Press <span class="navigation-key">${names.repeat}</span> to repeat the task<br>` +
         `Press <span class="navigation-key">${names.next}</span> to continue to the questionnaire`;
     statusText.textContent = "You can continue to the questionnaire.";
       
    } else {
        resultHeading.textContent = "Almost there";
        resultMessage.textContent = `Your accuracy is below the required ${STAGE2_PASS_THRESHOLD}%. Please repeat Stage 2 before moving on.`;
        resultPrompt.innerHTML = `Press <span class="navigation-key">${names.repeat}</span> to repeat the task`;
        statusText.textContent = `Below ${STAGE2_PASS_THRESHOLD}%: please repeat the task.`;
    }
    continueButton.disabled = !hasPassedStage2();
    updateAttemptNote();
    completeScreen.hidden = false;
    updateStats();
}

function updateAttemptNote() {
    attemptNote.textContent = hasPassedStage2() ? `You have already met the ${STAGE2_PASS_THRESHOLD}% accuracy criterion on an earlier attempt.` : "";
}

function updateStats() {
    const total = TRIALS_PER_BLOCK * TOTAL_BLOCKS + FOLLOW_TRIALS;
    let done;
    if (part === 1) {
        blockValue.textContent = `${Math.min(block, TOTAL_BLOCKS)} / ${TOTAL_BLOCKS}`;
        trialValue.textContent = `${Math.min(trial, TRIALS_PER_BLOCK)} / ${TRIALS_PER_BLOCK}`;
        coherenceValue.textContent = `${Math.round(coherence * 100)}%`;
        done = (block - 1) * TRIALS_PER_BLOCK + trial;
    } else {
        blockValue.textContent = "Part 2";
        trialValue.textContent = `${Math.min(trial, FOLLOW_TRIALS)} / ${FOLLOW_TRIALS}`;
        coherenceValue.textContent = "—";
        done = TRIALS_PER_BLOCK * TOTAL_BLOCKS + trial;
    }
    progressFill.style.width = `${phase === "complete" ? 100 : (done / total) * 100}%`;
}


/* ---------------------------------------------------------------------
   8. INPUT
   --------------------------------------------------------------------- */

// The thumbstick chosen on the About page.
function readStick(pad) {
    let x = keys.x, y = keys.y;
    if (pad) {
        const offset = stick === "right" ? 2 : 0;
        const gx = pad.axes[offset] || 0, gy = pad.axes[offset + 1] || 0;
        if (Math.hypot(gx, gy) > Math.hypot(x, y)) { x = gx; y = gy; }
    }
    const length = Math.hypot(x, y);
    return length > 1 ? { x: x / length, y: y / length } : { x, y };
}


/* ---------------------------------------------------------------------
   9. THE FRAME LOOP (about 60 times a second)
   --------------------------------------------------------------------- */

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

    const s = readStick(pad);
    cursor = s;
    drawDiagramStick(s, pad);
    stickNote.textContent = pad || keys.x || keys.y
        ? `Using the ${stick === "right" ? "right" : "left"} thumbstick (chosen on the About page).`
        : "Connect your controller and press any button. Arrow keys also work.";

    const magnitude = Math.hypot(s.x, s.y);
    let inside = false;

    if (phase === "idle") {
        stepDotField();
        if (confirmed && !startButton.disabled) startTask();
    } else if (phase === "stimulus") {
        stepDotField();
        if (magnitude > RESPONSE_THRESHOLD) registerResponse(directionFromStick(s));
    } else if (phase === "feedback") {
        stepDotField();
    } else if (phase === "centre") {
        // Rest in the centre for TRIAL_GAP_MS, then the next trial begins.
        if (magnitude >= RECENTER_THRESHOLD) {
            centreSince = null;
        } else {
            centreSince = centreSince ?? now;
            if (now - centreSince >= TRIAL_GAP_MS) {
                if (nextAfterCentre === "dots") startNextDotTrial();
                else startFollowingTarget();
            }
        }
    } else if (phase === "follow") {
        updateFollowingTarget(now, s);
        const distance = Math.hypot(s.x - target.x, s.y - target.y);
        inside = distance <= TARGET_HIT;
        if (following.stopped) partStatus.textContent = inside ? "Press a shoulder button to lock your position." : "The target has stopped. Move your cursor inside it.";
        if (confirmed && following.stopped && inside) lockFollowTrial(distance);
    } else if (phase === "complete") {
        if (repeat) startTask();
        else if (next && !continueButton.disabled) {
            logRow("stage2", { event: "continue_to_stage3", attempt: attemptNumber });
            window.location.href = NEXT_URL;
        }
    }

    if (part === 2 && phase !== "idle") drawFollowField(inside);
    else drawDotField();
    requestAnimationFrame(frame);
}



/* ---------------------------------------------------------------------
   10. START-UP
   --------------------------------------------------------------------- */

initThemeToggle();
await loadDiagrams();
showSavedDiagram();

if (!stick) {
    // Stage 2 needs the thumbstick chosen on the About page.
    noStickNotice.hidden = false;
    taskBody.hidden = true;
    document.querySelector(".practice-panel").hidden = true;
} else {
    const name = stick === "left" ? "left thumbstick" : "right thumbstick";
    instructions.innerHTML = `<b>How to respond:</b> some dots move together in one direction (up, down, left or right) while the rest drift randomly. As soon as you can tell the direction, tilt the <b>${name}</b> that way, then re-centre it before the next trial. Arrow keys work if no gamepad is connected.`;
    continueButton.disabled = !hasPassedStage2();
    updateAttemptNote();
    startButton.addEventListener("click", startTask);
    redoButton.addEventListener("click", startTask);
    continueButton.addEventListener("click", () => {
        if (continueButton.disabled) return;
        logRow("stage2", { event: "continue_to_stage3", attempt: attemptNumber });
        window.location.href = NEXT_URL;
    });
    ensureSession();
    logRow("stage2", { event: "stage_start" });
    seedDotField();
    statusText.innerHTML = "Connect a gamepad and press <b>Begin</b> (or a shoulder button) to start the task.";
    requestAnimationFrame(frame);
}
