# GCATS-Training

# Gamepad Training Protocol

A lightweight researcher friendly web app for familiarising behavioural research participants with a gamepad controller before they begin a main experiment. Built for use alongside [GCATS](https://github.com/pathakdivya/GCATS) (Gamepad-based Continuous Affective Tracing System), it can also be independently used for training.

Participants plug in a controller, walk through a guided orientation, complete an adaptive motion-discrimination task to confirm they can use the thumbstick accurately, and fill out a short comfort questionnaire — all in the browser, with results exportable as CSV.

## Why this exists

Continuous affective tracking tasks ask participants to make fine, sustained thumbstick movements — a skill many people don't have going in, especially if they don't game regularly. When attempting to collect continuous data, dropping someone straight into a real trial risks confounding "couldn't operate the controller" with the construct actually being measured. This protocol is a standardised warm-up that helps you train naive participants to handle gamepads or Joysticks.

## Tech stack

- Vanilla HTML/CSS/JS
- Browser [`Gamepad API`](https://developer.mozilla.org/en-US/docs/Web/API/Gamepad_API) for controller input, polled directly via `navigator.getGamepads()` each animation frame rather than relying on the (unreliable) `gamepadconnected` event
- `localStorage` for in-session persistence; a manual CSV export for handing data off to the experimenter.

<img width="300" height="100" alt="01-welcome-waiting" src="https://github.com/user-attachments/assets/04f02c12-182e-4667-9211-45185f703ae4" />
<img width="300" height="100" alt="04-practice-dpad-pressed" src="https://github.com/user-attachments/assets/2dc20032-e6e1-465b-9df4-e4fb17cb7cec" />


## Getting started

1. Clone the repository:
   ```bash
   git clone https://github.com/pathakdivya/GCATS-training.git
   cd GCATS-training
   ```
2. Serve the folder with any static file server (opening `index.html` directly via `file://` will not work, since the pages load ES modules). For example:
   ```bash
   python3 -m http.server 8000
   ```
3. Open `http://localhost:8000` in a Chromium-based browser (Chrome or Edge — the Gamepad API's behaviour varies across browsers, and this project has been tested primarily on Edge).
4. Connect a gamepad and press any button to activate it, then click **Welcome → Start Here** to begin.


## Project structure

```
├── index.html / about.html / stage1.html / stage2.html / stage3.html   # main pages
├── data.html / diagrams.html                                           # CSV export, controller diagrams
├── index.js / about.js / stage1.js / stage2.js / stage3.js / data.js   # one script per page
├── controller.js                                                       # layouts, button names, gamepad helpers
├── datalog.js                                                          # sessions, event logging, CSV export
├── storage.js                                                          # thumbstick choice, Stage 2 attempts, comfort score
├── diagram.js / theme.js                                               # shared UI helpers
├── styles.css                                                          # all styling
└── images/                                                             # controller diagrams, logo
```

`datalog.js` keeps every session in localStorage as sessions, stages and rows, and builds the CSV. `storage.js` holds the thumbstick choice, the attempt summaries and the questionnaire score.

## Data & privacy

All data is stored locally in the participant's browser (`localStorage`) and is only written to a file when the participant completes the final questionnaire and the session is exported as CSV. No data is transmitted anywhere by this app — export and handling of the resulting CSV is the experimenter's responsibility under their own IRB/ethics protocol.

## License

This project is licensed under the [GNU General Public License v3.0](LICENSE).

## Acknowledgements

Built as part of ongoing research work by Divya Pathak. The controller diagram and connection-detection approach draw on lessons learned adapting [controllercheck.org](https://controllercheck.org). We have not reused their code files.

