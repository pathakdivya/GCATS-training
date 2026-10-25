import { getStickPreference, setStickPreference } from "./storage.js"
import { controllerFamily, imagePath, isFullScreenReady, LAYOUT_KEY } from "./controller.js"

class ControllerPreview {
  constructor() {
    this.controllerType = null;
    this.keyboardAxis = { x: 0, y: 0 };
    this.xboxDiagram = document.getElementById("about-diagram-xbox");
    this.playstationDiagram = document.getElementById("about-diagram-playstation");
    this.emptyState = document.getElementById("controller-empty-state");
    this.gripImage = document.getElementById("grip-image");
    this.scrollTarget = document.querySelector(".about-copy");
    this.continueLink = document.querySelector(".neo-button");
    this.aboutPages = [...document.querySelectorAll("[data-about-page]")];
    this.aboutPageIndex = 0;
    this.aboutPageIndicator = document.getElementById("about-page-indicator");
    this.aboutProgress = document.querySelector(".progress .current");
    this.stickChoiceIndex = 0;
    this.lastGamepadButtons = [];
    this.gamepadInputInitialized = false;
    window.addEventListener("keydown", (e) => this.handleKey(e, true));
    window.addEventListener("keyup", (e) => this.handleKey(e, false));
    const saved = localStorage.getItem(LAYOUT_KEY);
    if (saved === "xbox" || saved === "playstation") this.setControllerType(saved);
    this.renderLoop();
  }
  setControllerType(type) {
    this.clearCurrentVisualState();
    this.controllerType = type;
    localStorage.setItem(LAYOUT_KEY, type);
    this.emptyState?.classList.add("is-hidden");
    // The same face button, named the way this brand names it.
    if (this.continueLink) this.continueLink.textContent = `Press ${type === "playstation" ? "Circle" : "B"} to move to the next stage →`;
    if (this.gripImage) {
      const brand = type === "playstation" ? "PlayStation" : "Xbox";
      this.gripImage.src = imagePath(type, "grip.png");
      this.gripImage.alt = `Two ways to hold a ${brand} controller, showing left and right thumbstick positions`;
      this.gripImage.hidden = false;
    }
    this.xboxDiagram?.classList.toggle("is-hidden", type !== "xbox");
    this.playstationDiagram?.classList.toggle("is-hidden", type !== "playstation");
    this.bindCurrentControllerElements();
  }
  clearCurrentVisualState() {
    document.querySelectorAll(".active").forEach((el) => el.classList.remove("active"));
    for (const id of ["about-xbox-lt", "about-xbox-rt"]) { const el=document.getElementById(id); if(el){el.setAttribute("height","0");el.setAttribute("y","62");} }
    for (const id of ["l2", "r2"]) { const el=document.getElementById(id); if(el) el.style.opacity="0"; }
  }
  bindCurrentControllerElements() {
    if (this.controllerType === "xbox") {
      this.stickLeftDot=document.getElementById("about-xbox-ls-dot"); this.stickLeftCircle=document.getElementById("about-xbox-ls-group");
      this.stickRightDot=document.getElementById("about-xbox-rs-dot"); this.stickRightCircle=document.getElementById("about-xbox-rs-group");
      this.buttonEls={0:document.getElementById("about-xbox-a"),1:document.getElementById("about-xbox-b"),2:document.getElementById("about-xbox-x"),3:document.getElementById("about-xbox-y"),4:document.getElementById("about-xbox-lb"),5:document.getElementById("about-xbox-rb"),6:document.getElementById("about-xbox-lt"),7:document.getElementById("about-xbox-rt"),8:document.getElementById("about-xbox-back"),9:document.getElementById("about-xbox-start"),12:document.getElementById("about-xbox-dpad-up"),13:document.getElementById("about-xbox-dpad-down"),14:document.getElementById("about-xbox-dpad-left"),15:document.getElementById("about-xbox-dpad-right"),16:document.getElementById("about-xbox-center")};
    } else if (this.controllerType === "playstation") {
      this.stickLeftDot=document.getElementById("visual-stick-left"); this.stickLeftCircle=document.getElementById("visual-stick-left-circle");
      this.stickRightDot=document.getElementById("visual-stick-right"); this.stickRightCircle=document.getElementById("visual-stick-right-circle");
      this.buttonEls={0:document.getElementById("cross"),1:document.getElementById("circle"),2:document.getElementById("square"),3:document.getElementById("triangle"),4:document.getElementById("l1"),5:document.getElementById("r1"),6:document.getElementById("l2"),7:document.getElementById("r2"),8:document.getElementById("share"),9:document.getElementById("options"),12:document.getElementById("dpad-up"),13:document.getElementById("dpad-down"),14:document.getElementById("dpad-left"),15:document.getElementById("dpad-right")};
    } else { this.stickLeftDot=this.stickLeftCircle=this.stickRightDot=this.stickRightCircle=null; this.buttonEls=null; }
  }
  // Opens the diagram that matches the connected controller's brand.
  autoDetect(gp) {
    if (!gp || gp.id === this.autoDetectedId) return;
    this.autoDetectedId = gp.id;
    const family = controllerFamily(gp);
    if (family !== "unknown") this.setControllerType(family);
  }
  firstConnectedGamepad() { return Array.from(navigator.getGamepads?.() ?? []).find((pad)=>pad!==null&&pad.connected) ?? null; }
  handleKey(e,isDown) { const v=isDown?1:0; switch(e.key){case "ArrowLeft":this.keyboardAxis.x=-v;break;case "ArrowRight":this.keyboardAxis.x=v;break;case "ArrowUp":this.keyboardAxis.y=-v;break;case "ArrowDown":this.keyboardAxis.y=v;break;} }
  updateStickVisual(dot,circle,x,y,base) { if(!dot||!circle||!base)return; const maxOffset=this.controllerType==="xbox"?28:3; dot.setAttribute("cx",String(base.x+x*maxOffset)); dot.setAttribute("cy",String(base.y+y*maxOffset)); const active=Math.hypot(x,y)>0.15; dot.classList.toggle("active",active); circle.classList.toggle("active",active); }
  resetWhenDisconnected() { if(this.buttonEls)Object.values(this.buttonEls).forEach((el)=>el?.classList.remove("active")); if(this.controllerType==="xbox"){for(const id of ["about-xbox-lt","about-xbox-rt"]){const el=document.getElementById(id);if(el){el.setAttribute("height","0");el.setAttribute("y","62");}}}else if(this.controllerType==="playstation"){for(const id of ["l2","r2"]){const el=document.getElementById(id);if(el)el.style.opacity="0";}} }
  updateButtons(gp) {
    if(!this.buttonEls)return;
    const currentButtons = gp.buttons.map((button) => !!(button.pressed || button.value > 0.5));
    const canHandleInput = this.gamepadInputInitialized;
    Object.entries(this.buttonEls).forEach(([indexStr,el])=>{if(!el)return;const index=Number(indexStr);const button=gp.buttons[index];if(!button)return;
      const wasPressed = this.lastGamepadButtons[index] || false;
      const pressed = !!(button.pressed || button.value > 0.5);
      if (canHandleInput && pressed && !wasPressed) {
        if (index === 14 || index === 15) this.moveStickChoice(index === 15 ? 1 : -1);
        if (index === 1) this.continueToNextStage();
      }
      if (canHandleInput && (index === 12 || index === 13) && pressed && !wasPressed) {
        this.setAboutPage(index === 13 ? this.aboutPageIndex + 1 : this.aboutPageIndex - 1);
      }
      if(this.controllerType==="xbox"&&(index===6||index===7)){const value=Number(button.value||0);const height=value*26;el.setAttribute("height",String(height));el.setAttribute("y",String(62-height));el.classList.toggle("active",value>0.05);return;}
      if(this.controllerType==="playstation"&&(index===6||index===7)){const value=Number(button.value||0);el.style.opacity=String(value*0.9);el.classList.toggle("active",value>0.05);return;}
      el.classList.toggle("active",!!(button.pressed||button.value>0.5));
    });
    this.lastGamepadButtons = currentButtons;
    this.gamepadInputInitialized = true;
  }
  moveStickChoice(delta) {
    if (!this.stickChoiceButtons?.length) return
    const current = this.stickChoiceButtons.findIndex((button) => button.dataset.stick === getStickPreference())
    // Nothing chosen yet: left picks the left thumbstick, right picks the right one.
    this.stickChoiceIndex = current < 0
      ? (delta < 0 ? 0 : this.stickChoiceButtons.length - 1)
      : (current + delta + this.stickChoiceButtons.length) % this.stickChoiceButtons.length
    const stick = this.stickChoiceButtons[this.stickChoiceIndex].dataset.stick
    setStickPreference(stick)
    this.updateStickChoice(stick)
  }
  // B on page 2: go to the next stage once a thumbstick has been chosen.
  continueToNextStage() {
    if (this.aboutPageIndex !== 1) return
    if (!getStickPreference()) {
      if (this.stickSetupHint) this.stickSetupHint.textContent = "Choose a thumbstick first: use the D-pad left and right."
      return
    }
    this.continueLink?.click()
  }
    setAboutPage(index) {
      if (!this.aboutPages.length) return
      this.aboutPageIndex = Math.max(0, Math.min(this.aboutPages.length - 1, index))
      this.aboutPages.forEach((page, pageIndex) => page.classList.toggle("is-hidden", pageIndex !== this.aboutPageIndex))
      const isSecondPage = this.aboutPageIndex === 1
      this.aboutProgress?.classList.toggle("about-progress-half", !isSecondPage)
      if (this.aboutPageIndicator) {
        this.aboutPageIndicator.hidden = isSecondPage
        this.aboutPageIndicator.textContent = isSecondPage
        ? "Page 2 of 2"
        : "Page 1 of 2 · D-pad down for the next page"
    }
  }
  renderLoop() { const loop=()=>{const gp=this.firstConnectedGamepad();this.autoDetect(gp);let leftX=this.keyboardAxis.x,leftY=this.keyboardAxis.y,rightX=0,rightY=0;if(gp&&this.buttonEls){leftX=gp.axes[0]||0;leftY=gp.axes[1]||0;rightX=gp.axes[2]||0;rightY=gp.axes[3]||0;this.updateButtons(gp);}else{this.gamepadInputInitialized=false;this.lastGamepadButtons=[];this.resetWhenDisconnected();}if(this.controllerType==="xbox"){this.updateStickVisual(this.stickLeftDot,this.stickLeftCircle,leftX,leftY,{x:182,y:190});this.updateStickVisual(this.stickRightDot,this.stickRightCircle,rightX,rightY,{x:396,y:295});}else if(this.controllerType==="playstation"){this.updateStickVisual(this.stickLeftDot,this.stickLeftCircle,leftX,leftY,{x:35,y:50});this.updateStickVisual(this.stickRightDot,this.stickRightCircle,rightX,rightY,{x:65,y:49});}requestAnimationFrame(loop);};loop(); }
}

class NeoAboutPage extends ControllerPreview {
  constructor() {
    super()
    this.themeToggle = document.getElementById("theme-toggle")
    this.stickChoiceButtons = [...document.querySelectorAll("[data-stick]")]
    this.stickSetupHint = document.getElementById("stick-setup-hint")
    this.updateThemeButton()
    this.bindStickChoice()
    this.updateStickChoice(getStickPreference())
    this.themeToggle?.addEventListener("click", () => {
      const next = document.documentElement.dataset.theme === "light" ? "dark" : "light"
      document.documentElement.dataset.theme = next
      localStorage.setItem("gcats-theme", next)
      this.updateThemeButton()
    })
  }
  bindStickChoice() {
    this.stickChoiceButtons.forEach((button) => {
      button.addEventListener("click", () => {
        const stick = button.dataset.stick
        if (stick !== "left" && stick !== "right") return
        setStickPreference(stick)
        this.updateStickChoice(stick)
      })
    })
  }
  updateStickChoice(stick) {
    this.stickChoiceButtons.forEach((button) => {
      const selected = button.dataset.stick === stick
      button.classList.toggle("selected", selected)
      button.setAttribute("aria-pressed", String(selected))
    })
    if (this.stickSetupHint) {
      this.stickSetupHint.textContent = stick
        ? `${stick === "left" ? "Left" : "Right"} thumbstick selected.`
        : ""
    }
  }
  updateThemeButton() {
    const isDark = document.documentElement.dataset.theme !== "light"
    if (this.themeToggle) {
      this.themeToggle.textContent = isDark ? "☀" : "⏾"
      this.themeToggle.setAttribute("aria-label", isDark ? "Switch to light mode" : "Switch to dark mode")
    }
  }
}
// Larger text in full screen: styles.css reads the "is-fullscreen" class on <html>.
function updateFullscreenClass() {
  document.documentElement.classList.toggle("is-fullscreen", isFullScreenReady())
}
window.addEventListener("resize", updateFullscreenClass)
document.addEventListener("fullscreenchange", updateFullscreenClass)
updateFullscreenClass()

document.addEventListener("DOMContentLoaded",()=>new NeoAboutPage());
