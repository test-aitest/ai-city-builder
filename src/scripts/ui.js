import { Game } from './game';
import { SimObject } from './sim/simObject';
import playIconUrl from '/icons/play-color.png';
import pauseIconUrl from '/icons/pause-color.png';

export class GameUI {
  /**
   * Currently selected tool
   * @type {string}
   */
  activeToolId = 'select';
  /**
   * @type {HTMLElement | null }
   */
  selectedControl = document.getElementById('button-select');
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
   * 
   * @param {*} event 
   */
  onToolSelected(event) {
    // Deselect previously selected button and selected this one
    if (this.selectedControl) {
      this.selectedControl.classList.remove('selected');
    }
    this.selectedControl = event.target;
    this.selectedControl.classList.add('selected');

    this.activeToolId = this.selectedControl.getAttribute('data-type');
  }

  /**
   * Toggles the pause state of the game
   */
  togglePause() {
    this.isPaused = !this.isPaused;
    if (this.isPaused) {
      document.getElementById('pause-button-icon').src = playIconUrl;
      document.getElementById('paused-text').style.visibility = 'visible';
    } else {
      document.getElementById('pause-button-icon').src = pauseIconUrl;
      document.getElementById('paused-text').style.visibility = 'hidden';
    }
  }

  /**
   * Updates the values in the title bar
   * @param {Game} game 
   */
  updateTitleBar(game) {
    const cityNameEl = document.getElementById('city-name');
    if (cityNameEl) cityNameEl.innerHTML = 'AI City Builder';
    const popEl = document.getElementById('population-counter');
    if (popEl) popEl.innerHTML = game.city.population;
    const simTimeEl = document.getElementById('sim-time');
    if (simTimeEl) {
      const date = new Date('1/1/2023');
      date.setDate(date.getDate() + game.city.simTime);
      simTimeEl.innerHTML = date.toLocaleDateString();
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