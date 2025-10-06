// vibed shit but in my defense its like 3.30am rn

(function () {
  'use strict';

  // --- Utility Class (Isolated from Global Scope) ---

  const HALF_CIRCUMFERENCE = 2 * Math.PI * 6378137 / 2; // R * PI

  class WebMercatorUtils {
    constructor(tileSize = 256) {
      this.tileSize = tileSize;
      this.initialResolution = 2 * HALF_CIRCUMFERENCE / this.tileSize;
    }

    latLonToMeters(lat, lon) {
      const x = lon / 180 * HALF_CIRCUMFERENCE;
      const y_merc = Math.log(Math.tan((90 + lat) * Math.PI / 360)) / (Math.PI / 180);
      const y = y_merc * HALF_CIRCUMFERENCE / 180;
      return [x, y];
    }

    metersToLatLon(x, y) {
      const lon = x / HALF_CIRCUMFERENCE * 180;
      let lat_rad = y / HALF_CIRCUMFERENCE * 180 * Math.PI / 180;
      let lat = 180 / Math.PI * (2 * Math.atan(Math.exp(lat_rad)) - Math.PI / 2);
      return [lat, lon];
    }

    resolution(zoom) {
      return this.initialResolution / Math.pow(2, zoom);
    }

    pixelsToMeters(pixelX, pixelY, zoom) {
      const res = this.resolution(zoom);
      const x = pixelX * res - HALF_CIRCUMFERENCE;
      const y = HALF_CIRCUMFERENCE - pixelY * res;
      return [x, y];
    }

    tilePixelToMeters(tileX, tileY, pixelX, pixelY, zoom) {
      const globalPixelX = tileX * this.tileSize + pixelX;
      const globalPixelY = tileY * this.tileSize + pixelY;
      return this.pixelsToMeters(globalPixelX, globalPixelY, zoom);
    }

    /**
     * Converts tile, pixel, and zoom to Lat/Lng.
     * @returns {{lat: number, lng: number}}
     */
    tilePixelToLatLon(tileX, tileY, pixelX, pixelY, zoom) {
      const [xMeters, yMeters] = this.tilePixelToMeters(tileX, tileY, pixelX, pixelY, zoom);
      const [lat, lng] = this.metersToLatLon(xMeters, yMeters);
      return { lat, lng };
    }
  }

  // Use a unique prefix for all IDs to prevent clashes
  const ID_PREFIX = 'coord-setter-';
  const DIALOG_ID = ID_PREFIX + 'dialog';
  const SET_BUTTON_ID = ID_PREFIX + 'set-button';
  const CLOSE_BUTTON_ID = ID_PREFIX + 'close-button';
  const RESULT_TEXT_ID = ID_PREFIX + 'result-text';
  const ZOOM_LEVEL = 18; // Fixed zoom level

  /**
   * Waits for Material Web components to be defined.
   * @param {function} callback - Function to run once components are ready.
   */
  function waitForComponents(callback) {
    if (customElements.get('md-dialog') && customElements.get('md-filled-text-field')) {
      callback();
      return;
    }

    const script = document.createElement('script');
    script.type = 'module';
    // Load all Material Web components from CDN
    script.src = 'https://cdn.jsdelivr.net/npm/@material/web@1.0.0/all.js';
    document.head.appendChild(script);

    // Poll to check if components are ready
    const checkComponents = setInterval(() => {
      if (customElements.get('md-dialog') && customElements.get('md-filled-text-field')) {
        clearInterval(checkComponents);
        callback();
      }
    }, 100);
  }

  /**
   * Initializes and displays the dialog once components are ready.
   */
  function initCoordinateSetter() {
    const utils = new WebMercatorUtils();

    // The unique IDs are crucial here for safety
    const dialogHtml = `
      <md-dialog id="${DIALOG_ID}" open>
        <div slot="headline">Set Map Location (Tile/Pixel)</div>
        <div slot="content">
          <p>Enter the coordinates for the new center location. We use a fixed zoom level of <strong>${ZOOM_LEVEL}</strong>.</p>
          <div style="display: grid; gap: 16px; grid-template-columns: 1fr 1fr;">
            <md-filled-text-field id="${ID_PREFIX}tileX" label="Tile X" type="number" value="139556" required></md-filled-text-field>
            <md-filled-text-field id="${ID_PREFIX}tileY" label="Tile Y" type="number" value="84672" required></md-filled-text-field>
            <md-filled-text-field id="${ID_PREFIX}pixelX" label="Pixel X" type="number" min="0" max="255" value="128" required></md-filled-text-field>
            <md-filled-text-field id="${ID_PREFIX}pixelY" label="Pixel Y" type="number" min="0" max="255" value="128" required></md-filled-text-field>
          </div>
          <p id="${RESULT_TEXT_ID}" style="margin-top: 20px; color: var(--md-sys-color-primary);"></p>
        </div>
        <div slot="actions">
          <md-text-button id="${SET_BUTTON_ID}">Set Location & Reload</md-text-button>
          <md-text-button id="${CLOSE_BUTTON_ID}">Close</md-text-button>
        </div>
      </md-dialog>
      <style>
          /* Basic styling to make the dialog visible and on top of any site content */
          #${DIALOG_ID} {
              z-index: 10000; /* Ensure it's on top of almost everything */
          }
          /* You might want to define some MD3 colors here if the host site is plain */
      </style>
    `;

    // Append dialog to body
    document.body.insertAdjacentHTML('beforeend', dialogHtml);

    const dialog = document.getElementById(DIALOG_ID);
    const setButton = document.getElementById(SET_BUTTON_ID);
    const closeButton = document.getElementById(CLOSE_BUTTON_ID);
    const resultText = document.getElementById(RESULT_TEXT_ID);

    // Input elements (retrieved via unique IDs)
    const tileXInput = document.getElementById(ID_PREFIX + 'tileX');
    const tileYInput = document.getElementById(ID_PREFIX + 'tileY');
    const pixelXInput = document.getElementById(ID_PREFIX + 'pixelX');
    const pixelYInput = document.getElementById(ID_PREFIX + 'pixelY');


    function updateConversionPreview() {
      const tileX = parseInt(tileXInput.value, 10);
      const tileY = parseInt(tileYInput.value, 10);
      const pixelX = parseInt(pixelXInput.value, 10);
      const pixelY = parseInt(pixelYInput.value, 10);

      const isValid = !isNaN(tileX) && !isNaN(tileY) && !isNaN(pixelX) && !isNaN(pixelY) && pixelX >= 0 && pixelX <= 255 && pixelY >= 0 && pixelY <= 255;

      if (!isValid) {
        resultText.textContent = "Enter valid Tile and Pixel coordinates (Pixel must be 0-255).";
        setButton.disabled = true;
        return;
      }

      try {
        const { lat, lng } = utils.tilePixelToLatLon(tileX, tileY, pixelX, pixelY, ZOOM_LEVEL);
        resultText.textContent = `Lat/Lng: ${lat.toFixed(6)}, ${lng.toFixed(6)}`;
        // Use data attributes to safely store the calculated coordinates
        resultText.dataset.lat = lat;
        resultText.dataset.lng = lng;
        setButton.disabled = false;
      } catch (e) {
        resultText.textContent = "Error in conversion. Check values.";
        setButton.disabled = true;
      }
    }

    // Attach listeners for continuous preview update
    [tileXInput, tileYInput, pixelXInput, pixelYInput].forEach(input => {
      input.addEventListener('input', updateConversionPreview);
    });

    // Initial update
    updateConversionPreview();

    // Save and Reload logic
    setButton.addEventListener('click', () => {
      const lat = parseFloat(resultText.dataset.lat);
      const lng = parseFloat(resultText.dataset.lng);

      if (isNaN(lat) || isNaN(lng)) {
        // Should not happen if validation works, but as a safeguard
        return;
      }

      const locationData = JSON.stringify({ lat: lat, lng: lng });

      // 1. Save to localStorage
      localStorage.setItem('location', locationData);

      // 2. Close dialog
      dialog.open = false;

      // 3. Reload the page
      window.location.reload();
    });

    // Close logic
    closeButton.addEventListener('click', () => {
      dialog.open = false;
      // Optional: Remove the dialog element from the DOM when closed
      dialog.remove();
    });
  }

  // Start the process by waiting for Material Web components
  waitForComponents(initCoordinateSetter);

})();
