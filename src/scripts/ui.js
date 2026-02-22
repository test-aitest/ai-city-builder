import { Game } from './game';
import { SimObject } from './sim/simObject';

export class GameUI {
  /**
   * Currently selected tool (always 'select' — all building via AI)
   * @type {string}
   */
  activeToolId = 'select';
  /**
   * True if the game is currently paused
   * @type {boolean}
   */
  isPaused = false;

  /**
   * The currently selected object (Tile)
   * @type {object | null}
   */
  selectedObject = null;

  get gameWindow() {
    return document.getElementById('render-target');
  }

  showLoadingText() {
    document.getElementById('loading').style.visibility = 'visible';
  }

  hideLoadingText() {
    document.getElementById('loading').style.visibility = 'hidden';
  }

  /**
   * Updates the status bar with population, happiness, and request count
   * @param {Game} game
   */
  updateStatusBar(game) {
    const popEl = document.getElementById('population-counter');
    if (popEl) popEl.textContent = game.city.population;

    const happiness = game.city.happiness ?? 50;
    const happinessFill = document.getElementById('happiness-fill');
    const happinessValue = document.getElementById('happiness-value');
    if (happinessFill) {
      happinessFill.style.width = happiness + '%';
    }
    if (happinessValue) {
      happinessValue.textContent = Math.round(happiness) + '%';
    }

    const requestBadge = document.getElementById('request-badge');
    if (requestBadge) {
      const count = window.requestEngine?.getActiveRequests?.()?.length ?? 0;
      requestBadge.textContent = count;
    }

    // Disaster indicator
    const disaster = game.city.activeDisaster;
    let disasterEl = document.getElementById('disaster-indicator');
    if (disaster) {
      if (!disasterEl) {
        disasterEl = document.createElement('span');
        disasterEl.id = 'disaster-indicator';
        disasterEl.style.cssText = 'color: #ff3333; font-weight: bold; margin-left: 12px;';
        const statusBar = document.getElementById('status-bar');
        if (statusBar) statusBar.appendChild(disasterEl);
      }
      disasterEl.textContent = `被災: ${disaster.affectedTiles.length}タイル`;
    } else if (disasterEl) {
      disasterEl.remove();
    }
  }

  /**
   * Updates the info panel with the information in the object
   * @param {SimObject} object
   */
  updateInfoPanel(object) {
    this.selectedObject = object;
    const infoElement = document.getElementById('info-panel')
    if (object) {
      infoElement.style.visibility = 'visible';
      infoElement.innerHTML = object.toHTML();

      // Event delegation for citizen chat clicks
      infoElement.onclick = (e) => {
        const citizenEl = e.target.closest('.citizen-clickable');
        if (!citizenEl) return;
        const citizenId = citizenEl.dataset.citizenId;
        if (!citizenId || !window.citizenChat) return;

        const building = this.selectedObject?.building;
        if (!building?.residents?.list) return;

        const citizen = building.residents.list.find(c => c.id === citizenId);
        if (citizen) {
          window.citizenChat.open(citizen, building);
        }
      };
    } else {
      infoElement.style.visibility = 'hidden';
      infoElement.innerHTML = '';
    }
  }
}

window.ui = new GameUI();

// Resize handle for chat panel
(() => {
  const handle = document.getElementById('resize-handle');
  const chat = document.getElementById('chat-container');
  if (!handle || !chat) return;

  let dragging = false;

  handle.addEventListener('mousedown', (e) => {
    e.preventDefault();
    dragging = true;
    handle.classList.add('dragging');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  });

  window.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    const newWidth = window.innerWidth - e.clientX - handle.offsetWidth / 2;
    const clamped = Math.max(200, Math.min(600, newWidth));
    chat.style.width = clamped + 'px';
    window.game?.onResize();
  });

  window.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false;
    handle.classList.remove('dragging');
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  });
})();
