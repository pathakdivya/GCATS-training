/* Shared by stage1.js and stage2.js: the small controller picture (the same
   SVGs as the About page). It shows the diagram for the detected brand and
   moves the picture's thumbstick and shoulder buttons with the real ones. */

import { controllerFamily, LAYOUT_KEY } from "./controller.js";
import { getStickPreference } from "./storage.js";

// Standard gamepad buttons: 4 / 5 are the left / right shoulder buttons.
export const SHOULDER_BUTTONS = [4, 5];

// "left" and "right" say which SVG parts move for each thumbstick (same ids
// as the About page); "reach" is how far the dot travels in the SVG.
const DIAGRAMS = {
    xbox: {
        boxId: "about-diagram-xbox",
        reach: 28,
        left: { dot: "about-xbox-ls-dot", base: { x: 182, y: 190 } },
        right: { dot: "about-xbox-rs-dot", base: { x: 396, y: 295 } },
        shoulders: ["about-xbox-lb", "about-xbox-rb"]
    },
    playstation: {
        boxId: "about-diagram-playstation",
        reach: 3,
        left: { dot: "visual-stick-left", base: { x: 35, y: 50 } },
        right: { dot: "visual-stick-right", base: { x: 65, y: 49 } },
        shoulders: ["l1", "r1"]
    }
};

// Fills every element marked data-diagrams with the pictures from diagrams.html.
// Call (and await) this before anything looks for the picture elements.
export async function loadDiagrams() {
    const slots = document.querySelectorAll("[data-diagrams]");
    if (!slots.length) return;
    const markup = await (await fetch("diagrams.html")).text();
    slots.forEach((slot) => { slot.innerHTML = markup; });
}

let layout = null;           // "xbox", "playstation" or null
let autoDetectedId = "";     // controller id we already looked at

// The detected brand, so pages can name the buttons correctly.
export function getLayout() {
    return layout;
}

// Shows the picture for one brand and hides the other.
function showDiagram(brand) {
    layout = brand;
    for (const [name, diagram] of Object.entries(DIAGRAMS))
        document.getElementById(diagram.boxId)?.classList.toggle("is-hidden", name !== brand);
}

// Uses the brand saved by the welcome page, if there is one.
export function showSavedDiagram() {
    const saved = localStorage.getItem(LAYOUT_KEY);
    if (saved === "xbox" || saved === "playstation") showDiagram(saved);
}

// Picks the picture from the controller's id, once per controller.
export function autoDetect(pad) {
    if (!pad || pad.id === autoDetectedId) return;
    autoDetectedId = pad.id;
    const family = controllerFamily(pad);
    if (family !== "unknown") showDiagram(family);
}

// Moves the thumbstick dot (the one chosen on the About page) and lights up
// the shoulder buttons while they are held.
export function drawDiagramStick(stick, pad) {
    const diagram = DIAGRAMS[layout];
    if (!diagram) return;
    const part = diagram[getStickPreference() === "right" ? "right" : "left"];
    const dot = document.getElementById(part.dot);
    dot?.setAttribute("cx", String(part.base.x + stick.x * diagram.reach));
    dot?.setAttribute("cy", String(part.base.y + stick.y * diagram.reach));
    dot?.classList.toggle("active", Math.hypot(stick.x, stick.y) > 0.15);
    diagram.shoulders.forEach((id, i) =>
        document.getElementById(id)?.classList.toggle("active", Boolean(pad?.buttons[SHOULDER_BUTTONS[i]]?.pressed)));
}
