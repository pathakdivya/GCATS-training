/* The light / dark switch, shared by every page. The first theme is applied by a
   small script in each page's <head> (so there is no flash of the wrong
   colours); this wires up the button: its icon, its label and the saved choice. */

export function initThemeToggle() {
    const button = document.getElementById("theme-toggle");

    // Shows the icon for the mode you would switch to, and keeps the
    // screen-reader label in step with it.
    function update() {
        const isDark = document.documentElement.dataset.theme !== "light";
        button.textContent = isDark ? "☀" : "⏾";
        button.setAttribute("aria-label", isDark ? "Switch to light mode" : "Switch to dark mode");
    }

    button.addEventListener("click", () => {
        const next = document.documentElement.dataset.theme === "light" ? "dark" : "light";
        document.documentElement.dataset.theme = next;
        localStorage.setItem("gcats-theme", next);
        update();
    });
    update();
}
