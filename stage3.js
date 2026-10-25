/* =====================================================================
   GCATS stage 3 - hardware comfort and familiarity questionnaire

   One question is shown at a time, so the page never needs to scroll:

     1. Participant ID (optional)
     2. Ten hardware comfort statements, rated 1 to 5
     3. Task load: the six NASA-TLX scales (0 to 100)
     4. Prior familiarity questions
     5. How much the tutorial was liked (1 to 10)
     6. Review, then Submit and Save. Every answer is logged stage by stage
        (datalog.js) and exported from data.html.

   Controls: the D-pad left / right moves between the answers, a shoulder
   button confirms, D-pad up goes back and D-pad down goes forward. On the
   review page Y edits and B submits. Mouse and keyboard work too.
   ===================================================================== */

import { BUTTON_NAMES, CONTINUE_BUTTON, firstConnectedGamepad, keyboardInput, REPEAT_BUTTON } from "./controller.js";
import { autoDetect, getLayout, loadDiagrams, SHOULDER_BUTTONS, showSavedDiagram } from "./diagram.js";
import {
    computeHardwareComfortScore, getStage2Attempts, getStickPreference, hasPassedStage2
} from "./storage.js";
import { closeCurrentSession, ensureSession, logRow, setParticipantId } from "./datalog.js";
import { initThemeToggle } from "./theme.js";


/* ---------------------------------------------------------------------
   1. THE QUESTIONS
   --------------------------------------------------------------------- */

const COMFORT_ITEMS = [
    "I found the controller easy to hold.",
    "The size and shape of the controller felt comfortable in my hands.",
    "I could reach the required buttons and thumbstick comfortably.",
    "Moving the thumbstick felt natural.",
    "I was able to control the thumbstick accurately.",
    "The controller responded as I expected.",
    "I felt confident using the controller during the task.",
    "I needed considerable practice before I felt comfortable using the controller.",
    "My hands or fingers became tired while using the controller.",
    "I would feel comfortable using this controller in a longer experiment."
];

const LIKERT_LABELS = ["Strongly Disagree", "Disagree", "Neutral", "Agree", "Strongly Agree"];
const YES_NO = [["yes", "Yes"], ["no", "No"]];

// NASA Task Load Index (raw TLX): six scales from 0 to 100 in steps of 5.
// The overall score is the average of the six (higher = more workload).
const TLX_ITEMS = [
    { id: "mental", text: "Mental demand: How mentally demanding was the task?", low: "Very Low", high: "Very High" },
    { id: "physical", text: "Physical demand: How physically demanding was the task?", low: "Very Low", high: "Very High" },
    { id: "temporal", text: "Temporal demand: How hurried or rushed was the pace of the task?", low: "Very Low", high: "Very High" },
    { id: "performance", text: "Performance: How successful were you in accomplishing what you were asked to do?", low: "Perfect", high: "Failure" },
    { id: "effort", text: "Effort: How hard did you have to work to accomplish your level of performance?", low: "Very Low", high: "Very High" },
    { id: "frustration", text: "Frustration: How insecure, discouraged, irritated, stressed, and annoyed were you?", low: "Very Low", high: "Very High" }
];
const SCALE_STEP = 5;

// type: "line" (one-line text), "rating" (1-5), "scale" (slider 0-100), "single" (pick one), "multi" (pick any), "text" (long text)
// required questions must be answered before moving on; "when" hides a question unless it returns true.
const QUESTIONS = [
    { id: "participantId", section: "id", type: "line", text: "Participant ID (optional)" },
    ...COMFORT_ITEMS.map((statement, i) => ({ id: `comfort${i}`, section: "comfort", type: "rating", index: i, required: true, text: `${i + 1}. ${statement}` })),
    ...TLX_ITEMS.map((item, i) => ({ id: `tlx_${item.id}`, section: "tlx", type: "scale", index: i, required: true, text: item.text, low: item.low, high: item.high })),
    { id: "hasUsed", section: "familiarity", type: "single", required: true, text: "Have you used a game controller before?", options: YES_NO },
    { id: "frequency", section: "familiarity", type: "single", required: true, text: "How often do you use a game controller?", options: ["Never", "Rarely", "Sometimes", "Often", "Daily"].map((v) => [v, v]) },
    { id: "types", section: "familiarity", type: "multi", text: "What types of controllers have you previously used? (select all that apply)", options: ["Xbox", "PlayStation", "Nintendo", "PC / Generic"].map((v) => [v, v]) },
    { id: "discomfort", section: "familiarity", type: "single", required: true, text: "Did you experience any pain, strain, fatigue, or discomfort?", options: YES_NO },
    { id: "discomfortDetails", section: "familiarity", type: "text", text: "Please describe the discomfort briefly.", when: () => answers.discomfort === "yes" },
    { id: "difficult", section: "familiarity", type: "text", text: "Was any particular button, trigger, or thumbstick difficult to use? (optional)" },
    { id: "improvement", section: "familiarity", type: "text", text: "Is there anything that would have made the controller easier or more comfortable to use? (optional)" },
    { id: "tutorial", section: "tutorial", type: "single", required: true, text: "How much did you like the tutorial (the practice before the task)?", options: Array.from({ length: 10 }, (_, i) => [i + 1, String(i + 1)]), anchors: "1 = Not at all · 10 = Very much" }
];

const SECTIONS = [
    { id: "id", label: "Participant ID" },
    { id: "comfort", label: "Hardware comfort" },
    { id: "tlx", label: "Task load" },
    { id: "familiarity", label: "Prior familiarity" },
    { id: "tutorial", label: "Tutorial" },
    { id: "review", label: "Review and submit" }
];

const WELCOME_URL = "index.html";


/* ---------------------------------------------------------------------
   2. PAGE ELEMENTS AND STATE
   --------------------------------------------------------------------- */

const $ = (id) => document.getElementById(id);
const labelEl = $("q-label");
const textEl = $("q-text");
const messageEl = $("q-message");
const optionsEl = $("q-options");
const scaleEl = $("q-scale");
const rangeEl = $("q-range");
const scaleValueEl = $("q-scale-value");
const lineInput = $("q-line");
const areaInput = $("q-area");
const hintEl = $("q-hint");
const backButton = $("q-back");
const nextButton = $("q-next");
const progressEl = $("q-progress");
const reviewEl = $("q-review");
const reviewContent = $("review-content");
const reviewPrompt = $("review-prompt");
const savedEl = $("q-saved");
const savedPrompt = $("saved-prompt");

const stick = getStickPreference();
const stickLabel = stick === "right" ? "Right Thumbstick" : "Left Thumbstick";

const answers = {
    participantId: "",
    ratings: new Array(COMFORT_ITEMS.length).fill(null),
    tlx: new Array(TLX_ITEMS.length).fill(null),
    tutorial: "",
    hasUsed: "",
    frequency: "",
    types: [],
    discomfort: "",
    discomfortDetails: "",
    difficult: "",
    improvement: ""
};

let mode = "question";       // "question", "review" or "saved"
let qIndex = 0;              // position in the visible questions
let focusIndex = 0;          // which answer the gamepad has highlighted
let advanceTimer = 0;
let questionShownAt = 0;     // for the data log: how long each question was on screen
let scaleHold = null;        // D-pad held on a slider question: { dir, since, last }
let lastButtons = [];
let inputReady = false;
const keys = keyboardInput({ enabled: () => mode !== "question" });   // Y and B work from the keyboard on the review page

const visibleQuestions = () => QUESTIONS.filter((q) => !q.when || q.when());
const currentQuestion = () => visibleQuestions()[qIndex];


/* ---------------------------------------------------------------------
   3. READING AND WRITING ANSWERS
   --------------------------------------------------------------------- */

function getAnswer(q) {
    if (q.type === "rating") return answers.ratings[q.index];
    if (q.type === "scale") return answers.tlx[q.index];
    if (q.type === "multi") return answers.types;
    return answers[q.id];
}

function setAnswer(q, value) {
    if (q.type === "rating") answers.ratings[q.index] = value;
    else if (q.type === "scale") answers.tlx[q.index] = value;
    else answers[q.id] = value;
}

// The answers a question offers: [value, label] pairs (ratings are 1 to 5).
function optionsFor(q) {
    if (q.type === "rating") return LIKERT_LABELS.map((label, i) => [i + 1, label]);
    return q.options ?? [];
}

function isAnswered(q) {
    const value = getAnswer(q);
    return value !== null && value !== "" && !(Array.isArray(value) && q.required && !value.length);
}

function selectOption(q, value) {
    if (q.type === "multi") {
        const at = answers.types.indexOf(value);
        if (at >= 0) answers.types.splice(at, 1);
        else answers.types.push(value);
    } else {
        setAnswer(q, value);
        // Answering "No" to discomfort must not keep old details.
        if (q.id === "discomfort" && value === "no") answers.discomfortDetails = "";
    }
}


/* ---------------------------------------------------------------------
   4. SHOWING A QUESTION
   --------------------------------------------------------------------- */

function setMessage(text) {
    messageEl.textContent = text;
}

function renderProgress() {
    const questions = visibleQuestions();
    const current = mode === "question" ? currentQuestion().section : "review";
    progressEl.innerHTML = SECTIONS.map((section, i) => {
        const inSection = questions.filter((q) => q.section === section.id);
        const answered = inSection.filter((q) => q.required ? isAnswered(q) : false).length;
        const required = inSection.filter((q) => q.required).length;
        const done = SECTIONS.findIndex((s) => s.id === current) > i || mode === "saved";
        const progress = required ? ` (${answered} / ${required})` : "";
        return `<li class="checklist-item${done ? " is-done" : ""}${section.id === current ? " is-current" : ""}">
            <span class="checklist-icon">${done ? "✓" : i + 1}</span><span class="checklist-label">${section.label}${progress}</span></li>`;
    }).join("");
}

function showQuestion() {
    mode = "question";
    reviewEl.hidden = true;
    savedEl.hidden = true;
    clearTimeout(advanceTimer);
    setMessage("");
    questionShownAt = performance.now();

    const questions = visibleQuestions();
    qIndex = Math.min(qIndex, questions.length - 1);
    const q = questions[qIndex];
    labelEl.textContent = `Question ${qIndex + 1} of ${questions.length}`;
    textEl.textContent = q.text;
    backButton.disabled = qIndex === 0;
    nextButton.textContent = qIndex === questions.length - 1 ? "Review →" : "Next →";

    // Answer buttons, or a text box.
    const isText = q.type === "line" || q.type === "text";
    lineInput.hidden = q.type !== "line";
    areaInput.hidden = q.type !== "text";
    const isScale = q.type === "scale";
    optionsEl.hidden = isText || isScale;
    scaleEl.hidden = !isScale;
    if (isScale) showScale(q);
    if (q.type === "line") lineInput.value = answers[q.id];
    if (q.type === "text") areaInput.value = answers[q.id];

    if (!isText && !isScale) {
        const chosen = getAnswer(q);
        const options = optionsFor(q);
        optionsEl.classList.toggle("is-compact", options.length > 6);
        optionsEl.innerHTML = options.map(([value, label]) => {
            const selected = q.type === "multi" ? chosen.includes(value) : chosen === value;
            const face = q.type === "rating" ? `<span class="num">${value}</span><span class="lbl">${label}</span>` : `<span class="num">${label}</span>`;
            return `<button type="button" class="q-option${selected ? " selected" : ""}" data-value="${value}">${face}</button>`;
        }).join("");
        optionsEl.querySelectorAll(".q-option").forEach((button, i) =>
            button.addEventListener("click", () => chooseOption(i)));
        // Start the gamepad highlight on the current answer (Neutral for ratings).
        const at = options.findIndex(([value]) => value === chosen);
        focusIndex = at >= 0 ? at : q.type === "rating" ? 2 : 0;
        updateFocus();
    }

    hintEl.textContent = isText
        ? "Type your answer, or press a shoulder button to continue."
        : isScale
            ? "D-pad left / right: move the slider (hold to move faster) · shoulder button: confirm · D-pad up: back"
            : q.type === "multi"
                ? "D-pad left / right: choose · shoulder button: tick or untick · press D-pad down to go to the next question"
                : `${q.anchors ? q.anchors + " · " : ""}D-pad left / right: choose · shoulder button: confirm · D-pad up: back`;
    renderProgress();
}

// Slider questions (task load): the value only counts once it has been moved.
function showScale(q) {
    const value = getAnswer(q);
    $("q-scale-low").textContent = q.low;
    $("q-scale-high").textContent = q.high;
    rangeEl.value = value ?? 50;
    scaleValueEl.textContent = value === null ? "—" : String(value);
    scaleEl.classList.toggle("is-unset", value === null);
}

// The slider was moved (mouse or D-pad).
function setScale(value) {
    const q = currentQuestion();
    const clamped = Math.max(0, Math.min(100, value));
    setAnswer(q, clamped);
    rangeEl.value = clamped;
    scaleValueEl.textContent = String(clamped);
    scaleEl.classList.remove("is-unset");
    setMessage("");
    renderProgress();
}

// Highlights the answer the gamepad is on.
function updateFocus() {
    optionsEl.querySelectorAll(".q-option").forEach((button, i) => button.classList.toggle("gamepad-focus", i === focusIndex));
}

// An answer was picked (mouse or gamepad). Single answers move on by themselves.
function chooseOption(index) {
    const q = currentQuestion();
    const value = optionsFor(q)[index][0];
    focusIndex = index;
    selectOption(q, value);
    optionsEl.querySelectorAll(".q-option").forEach((button, i) => {
        const selected = q.type === "multi" ? answers.types.includes(optionsFor(q)[i][0]) : i === index;
        button.classList.toggle("selected", selected);
    });
    updateFocus();
    renderProgress();
    if (q.type !== "multi") {
        clearTimeout(advanceTimer);
        advanceTimer = setTimeout(goNext, 250);
    }
}

// Writes one row to the stage 3 data log when a question is left, with the
// answer and how long the question was on screen.
function logAnswer(q) {
    const value = getAnswer(q);
    if (q.id === "participantId") setParticipantId(answers.participantId);
    logRow("stage3", {
        event: "answer",
        question_id: q.id,
        section: q.section,
        question_text: q.text,
        answer: Array.isArray(value) ? value.join("; ") : value ?? "",
        time_ms: Math.round(performance.now() - questionShownAt)
    });
}

// Saves what was typed before leaving a text question.
function storeText() {
    const q = currentQuestion();
    if (q?.type === "line") answers[q.id] = lineInput.value.trim();
    if (q?.type === "text") answers[q.id] = areaInput.value.trim();
}

function goNext() {
    if (mode !== "question") return;
    storeText();
    const q = currentQuestion();
    if (q.required && !isAnswered(q)) {
        setMessage(q.type === "scale" ? "Move the slider to choose a value." : "Please choose an answer to continue.");
        return;
    }
    logAnswer(q);
    if (qIndex >= visibleQuestions().length - 1) {
        showReview();
        return;
    }
    qIndex += 1;
    showQuestion();
}

function goBack() {
    if (mode !== "question" || qIndex === 0) return;
    storeText();
    logAnswer(currentQuestion());
    qIndex -= 1;
    showQuestion();
}


/* ---------------------------------------------------------------------
   5. REVIEW, SUBMIT AND SAVE
   --------------------------------------------------------------------- */

function questionnaireResponses() {
    return {
        comfortRatings: answers.ratings,
        hasUsedControllerBefore: answers.hasUsed,
        usageFrequency: answers.frequency,
        controllerTypes: answers.types,
        experiencedDiscomfort: answers.discomfort,
        discomfortDetails: answers.discomfortDetails,
        difficultInput: answers.difficult,
        improvementSuggestions: answers.improvement,
        tlxOverall: tlxOverall(),
        tutorialRating: answers.tutorial
    };
}

// Raw TLX: the average of the six scales (0 to 100).
function tlxOverall() {
    return Math.round(answers.tlx.reduce((sum, v) => sum + (v ?? 0), 0) / TLX_ITEMS.length * 10) / 10;
}

// Escapes typed text before it goes into the review page.
const escapeHtml = (text) => text.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

function showReview() {
    mode = "review";
    const q = questionnaireResponses();
    const score = computeHardwareComfortScore(q.comfortRatings);
    const names = BUTTON_NAMES[getLayout() ?? "xbox"];
    const line = (label, value) => `<p><b>${label}:</b> ${escapeHtml(String(value || "(none provided)"))}</p>`;
    reviewContent.innerHTML = [
        line("Participant ID", answers.participantId),
        line("Thumbstick used", stickLabel),
        line("Hardware comfort score", `${Math.round(score)}%`),
        line("Comfort ratings", q.comfortRatings.map((r, i) => `${i + 1}: ${r}`).join("  ")),
        line("Task load (raw TLX, 0-100)", `${q.tlxOverall}`),
        line("Tutorial liking (1-10)", q.tutorialRating),
        line("Used a controller before", `${q.hasUsedControllerBefore}, ${q.usageFrequency}`),
        line("Controller types", q.controllerTypes.join(", ")),
        line("Discomfort", q.experiencedDiscomfort + (q.discomfortDetails ? `: ${q.discomfortDetails}` : "")),
        line("Difficult input", q.difficultInput),
        line("Improvement suggestions", q.improvementSuggestions)
    ].join("");
    reviewPrompt.innerHTML =
        `Press <span class="navigation-key">${names.repeat}</span> to edit your responses<br>` +
        `Press <span class="navigation-key">${names.next}</span> to submit and save`;
    reviewEl.hidden = false;
    labelEl.textContent = "Review";
    renderProgress();
}

function editResponses() {
    qIndex = 0;
    showQuestion();
}

function submit() {
    if (!stick || mode !== "review") return;
    const questionnaire = questionnaireResponses();
    logRow("stage3", {
        event: "submitted",
        comfort_score: Math.round(computeHardwareComfortScore(questionnaire.comfortRatings) * 10) / 10,
        tlx_overall: questionnaire.tlxOverall,
        tutorial_rating: questionnaire.tutorialRating
    });
    closeCurrentSession();   // the next visit to the welcome page starts a new session

    mode = "saved";
    reviewEl.hidden = true;
    savedEl.hidden = false;
    const names = BUTTON_NAMES[getLayout() ?? "xbox"];
    savedPrompt.innerHTML = `Press <span class="navigation-key">${names.next}</span> to return to the welcome page`;
    renderProgress();
}


/* ---------------------------------------------------------------------
   6. GAMEPAD INPUT
   --------------------------------------------------------------------- */

// Runs once per frame. Standard buttons: 12 / 13 D-pad up / down, 14 / 15 left / right.
function handleGamepad(pad) {
    const down = pad ? pad.buttons.map((b) => Boolean(b.pressed || b.value > 0.5)) : [];
    const previous = lastButtons;
    const justPressed = (index) => inputReady && down[index] && !previous[index];
    lastButtons = down;
    inputReady = Boolean(pad);
    const repeat = justPressed(REPEAT_BUTTON) || keys.repeat;
    const next = justPressed(CONTINUE_BUTTON) || keys.next;
    keys.repeat = keys.next = false;

    if (mode === "review") {
        if (repeat) editResponses();
        else if (next) submit();
        return;
    }
    if (mode === "saved") {
        if (next) window.location.href = WELCOME_URL;
        return;
    }

    const q = currentQuestion();
    const isText = q.type === "line" || q.type === "text";
    const isScale = q.type === "scale";
    const confirmed = SHOULDER_BUTTONS.some(justPressed);
    const count = optionsFor(q).length;

    // Slider: one step per press, then faster while the D-pad stays held.
    const direction = down[15] ? 1 : down[14] ? -1 : 0;
    if (!isScale || direction === 0) {
        scaleHold = null;
    } else {
        const now = performance.now();
        if (!scaleHold || scaleHold.dir !== direction) {
            scaleHold = { dir: direction, since: now, last: now };
            setScale((getAnswer(q) ?? 50) + direction * SCALE_STEP);
        } else if (now - scaleHold.since > 350 && now - scaleHold.last > 80) {
            scaleHold.last = now;
            setScale((getAnswer(q) ?? 50) + direction * SCALE_STEP);
        }
    }

    if (isScale && (justPressed(14) || justPressed(15))) return;
    if (!isText && !isScale && justPressed(14)) { focusIndex = (focusIndex - 1 + count) % count; updateFocus(); }
    else if (!isText && !isScale && justPressed(15)) { focusIndex = (focusIndex + 1) % count; updateFocus(); }
    else if (justPressed(12)) goBack();
    else if (justPressed(13)) goNext();
    else if (confirmed) {
        if (isText || isScale) goNext();
        else chooseOption(focusIndex);
    }
}

function frame() {
    handleGamepad(firstConnectedGamepad());
    autoDetect(firstConnectedGamepad());
    requestAnimationFrame(frame);
}



/* ---------------------------------------------------------------------
   7. START-UP
   --------------------------------------------------------------------- */

initThemeToggle();
await loadDiagrams();
showSavedDiagram();

if (!hasPassedStage2()) {
    // The questionnaire needs a passing Stage 2 attempt.
    $("no-session-notice").hidden = false;
    $("q-side").hidden = true;
    $("q-panel").hidden = true;
} else {
    const attempts = getStage2Attempts();
    $("summary-stick").textContent = stickLabel;
    $("summary-accuracy").textContent = `${Math.round(attempts.length ? Math.max(...attempts.map((a) => a.accuracy)) : 0)}%`;
    $("summary-attempts").textContent = String(attempts.length);

    ensureSession();
    logRow("stage3", { event: "stage_start" });
    rangeEl.addEventListener("input", () => setScale(Number(rangeEl.value)));
    backButton.addEventListener("click", goBack);
    nextButton.addEventListener("click", goNext);
    $("edit-btn").addEventListener("click", editResponses);
    $("submit-btn").addEventListener("click", submit);
    lineInput.addEventListener("input", storeText);
    areaInput.addEventListener("input", storeText);
    showQuestion();
    requestAnimationFrame(frame);
}
