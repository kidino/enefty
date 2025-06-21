let layers = [];
const defaultCanvasSize = { width: 512, height: 512 };
let canvas = document.getElementById('main-preview');
let ctx = canvas.getContext('2d');
canvas.width = defaultCanvasSize.width;
canvas.height = defaultCanvasSize.height;

let dragLayerIdx = null;

function renderLayersPanel() {
  const list = document.getElementById('layers-list');
  list.innerHTML = '';
  for (let uiIdx = layers.length - 1; uiIdx >= 0; uiIdx--) {
    const layer = layers[uiIdx];
    const idx = uiIdx;
    const div = document.createElement('div');
    div.className = 'layer';
    div.setAttribute('data-idx', idx);

    // Drag handle
    const dragHandle = document.createElement('span');
    dragHandle.className = 'layer-drag-handle';
    dragHandle.textContent = '☰';

    // Layer header
    const header = document.createElement('div');
    header.className = 'layer-header';
    header.appendChild(dragHandle);

    // Layer name (editable)
    const nameSpan = document.createElement('span');
    nameSpan.className = 'layer-name';
    nameSpan.textContent = layer.name || `Layer ${idx + 1}`;
    nameSpan.title = "Double click to rename";
    nameSpan.style.cursor = "text";
    nameSpan.ondblclick = () => {
      const input = document.createElement('input');
      input.type = 'text';
      input.value = layer.name || `Layer ${idx + 1}`;
      input.className = 'layer-name-edit';
      input.style.width = Math.max(80, nameSpan.offsetWidth) + 'px';
      input.onkeydown = (e) => {
        if (e.key === 'Enter') {
          layer.name = input.value.trim() || `Layer ${idx + 1}`;
          renderLayersPanel();
        } else if (e.key === 'Escape') {
          renderLayersPanel();
        }
      };
      input.onblur = () => {
        layer.name = input.value.trim() || `Layer ${idx + 1}`;
        renderLayersPanel();
      };
      header.replaceChild(input, nameSpan);
      input.focus();
      input.select();
    };
    header.appendChild(nameSpan);

    // Remove up/down arrows, keep only remove button, and position to the right
    const controls = document.createElement('span');
    controls.style.marginLeft = "auto";
    controls.innerHTML = `
      <button class="remove-layer">✕</button>
    `;
    controls.querySelector('.remove-layer').onclick = () => removeLayer(idx);
    header.appendChild(controls);

    // Images row
    const imagesRow = document.createElement('div');
    imagesRow.className = 'layer-images';
    const addBtn = document.createElement('div');
    addBtn.className = 'layer-add-image';
    addBtn.textContent = '+';
    addBtn.onclick = () => addImagesToLayer(idx);
    imagesRow.appendChild(addBtn);

    layer.images.forEach((img, imgIdx) => {
      const thumbWrapper = document.createElement('div');
      thumbWrapper.style.position = 'relative';
      thumbWrapper.style.display = 'inline-block';

      const thumb = document.createElement('img');
      thumb.className = 'layer-image-thumb' + (layer.selected === imgIdx ? ' selected' : '');
      thumb.src = img.thumb;
      thumb.title = img.name;
      thumb.onclick = () => selectLayerImage(idx, imgIdx);

      // X button
      const xBtn = document.createElement('span');
      xBtn.textContent = '×';
      xBtn.className = 'thumb-remove-btn';
      xBtn.onclick = (e) => {
        e.stopPropagation();
        removeImageFromLayer(idx, imgIdx);
      };

      thumbWrapper.appendChild(thumb);
      thumbWrapper.appendChild(xBtn);
      imagesRow.appendChild(thumbWrapper);
    });

    div.appendChild(header);
    div.appendChild(imagesRow);
    list.appendChild(div);
  }

  // Initialize SortableJS
  if (window.layerSortable) {
    window.layerSortable.destroy();
  }
  window.layerSortable = Sortable.create(list, {
    handle: '.layer-drag-handle',
    animation: 150,
    direction: 'vertical',
    onEnd: function (evt) {
      const oldVisualIndex = evt.oldDraggableIndex;
      const newVisualIndex = evt.newDraggableIndex;

      // If the item was actually moved to a new position
      if (oldVisualIndex !== newVisualIndex) {
        // Convert visual indices (top-to-bottom, 0-indexed)
        // to 'layers' array indices (bottom-to-top, 0-indexed)
        // layers[0] is bottom-most, visual top (index 0) is layers[layers.length-1]
        const oldArrayIndex = layers.length - 1 - oldVisualIndex;
        const newArrayIndex = layers.length - 1 - newVisualIndex;

        // Move the element in the 'layers' data array
        const [movedLayer] = layers.splice(oldArrayIndex, 1);
        layers.splice(newArrayIndex, 0, movedLayer);
      }

      // SortableJS has already re-ordered the DOM elements visually.
      // We have updated our `layers` data array to match this new visual order.
      // Now, we need to update the `data-idx` attributes on the DOM elements
      // to correctly reflect their new indices in the `layers` array.
      // We also update default names if they are order-dependent.
      // This avoids a full `renderLayersPanel()` which would kill the animation.
      const listElement = evt.from; // The list element
      const updatedNodes = Array.from(listElement.children);
      updatedNodes.forEach((node, currentVisualIndex) => {
        // Calculate the corresponding index in the `layers` array
        const newArrayIndexInLayers = layers.length - 1 - currentVisualIndex;
        node.setAttribute('data-idx', newArrayIndexInLayers);

        // Update default layer name if necessary
        // renderLayersPanel uses `layer.name || Layer ${layers.length - uiIdx}`
        // where uiIdx is the array index. So, `layers.length - newArrayIndexInLayers` is the visual number.
        const layerData = layers[newArrayIndexInLayers];
        const nameSpan = node.querySelector('.layer-name');
        if (nameSpan && layerData && !layerData.name) { // Only update if it's a default name and layerData exists
            nameSpan.textContent = `Layer ${layers.length - newArrayIndexInLayers}`;
        }
      });

      renderPreview(); // Update the canvas preview
    }
  });
}

async function renderPreview() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Gather all selected images in order (bottom to top)
  const imagesToDraw = [];
  for (let i = 0; i < layers.length; i++) {
    const layer = layers[i];
    if (layer.selected == null) continue;
    const imgObj = layer.images[layer.selected];
    if (!imgObj) continue;
    imagesToDraw.push(imgObj.path.startsWith('data:') ? imgObj.path : `file://${imgObj.path}`);
  }

  // Load all images first
  const loadedImages = await Promise.all(
    imagesToDraw.map(
      src =>
        new Promise(resolve => {
          const img = new window.Image();
          img.src = src;
          img.onload = () => resolve(img);
          img.onerror = () => resolve(null);
        })
    )
  );

  // Draw in order (bottom to top)
  loadedImages.forEach(img => {
    if (img) ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  });
}

function addLayer() {
  layers.push({ images: [], selected: null, name: "Layer " + (layers.length + 1) });
  renderLayersPanel();
  renderPreview();
}

function removeLayer(idx) {
  layers.splice(idx, 1);
  renderLayersPanel();
  renderPreview();
}

function moveLayer(idx, dir) {
  const newIdx = idx + dir;
  if (newIdx < 0 || newIdx >= layers.length) return;
  [layers[idx], layers[newIdx]] = [layers[newIdx], layers[idx]];
  renderLayersPanel();
  renderPreview();
}

async function addImagesToLayer(layerIdx) {
  const filePaths = await window.eneftyAPI.openImageDialog();
  if (!filePaths.length) return;
  for (const file of filePaths) {
    const img = await loadImage(file);
    const thumb = await createThumbnail(img, THUMBNAIL_WIDTH, THUMBNAIL_HEIGHT);
    layers[layerIdx].images.push({
      path: file,
      name: file.split(/[\\/]/).pop(),
      thumb,
    });
    if (layers[layerIdx].selected === null) layers[layerIdx].selected = 0;
  }
  renderLayersPanel();
  renderPreview();
}

function selectLayerImage(layerIdx, imgIdx) {
  layers[layerIdx].selected = imgIdx;
  renderLayersPanel();
  renderPreview();
}

function loadImage(path) {
  return new Promise((resolve) => {
    const img = new window.Image();
    img.src = `file://${path}`;
    img.onload = () => resolve(img);
  });
}

function createThumbnail(img, w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const cctx = c.getContext('2d');
  cctx.clearRect(0, 0, w, h);
  cctx.drawImage(img, 0, 0, w, h);
  return c.toDataURL('image/png');
}

function removeImageFromLayer(layerIdx, imgIdx) {
  layers[layerIdx].images.splice(imgIdx, 1);
  // Adjust selected index if needed
  if (layers[layerIdx].selected === imgIdx) {
    layers[layerIdx].selected = layers[layerIdx].images.length ? 0 : null;
  } else if (layers[layerIdx].selected > imgIdx) {
    layers[layerIdx].selected--;
  }
  renderLayersPanel();
  renderPreview();
}

// Default export dimensions
const EXPORT_WIDTH = 1000;
const EXPORT_HEIGHT = 1000;
// Thumbnail dimensions
const THUMBNAIL_WIDTH = 40;
const THUMBNAIL_HEIGHT = 40;

/**
 * Generates a blob of the current canvas content at specified dimensions.
 * @param {number} targetWidth The width of the exported image.
 * @param {number} targetHeight The height of the exported image.
 * @returns {Promise<Blob|null>} A promise that resolves with the image blob or null if an error occurs.
 */
async function generateExportBlob(targetWidth, targetHeight) {
  // Ensure preview is up-to-date
  await renderPreview();

  const exportCanvas = document.createElement('canvas');
  exportCanvas.width = targetWidth;
  exportCanvas.height = targetHeight;
  const exportCtx = exportCanvas.getContext('2d');
  exportCtx.clearRect(0, 0, targetWidth, targetHeight);
  // Draw the main canvas content, scaling if necessary
  exportCtx.drawImage(canvas, 0, 0, targetWidth, targetHeight);

  return new Promise((resolve) => {
    exportCanvas.toBlob((blob) => {
      resolve(blob);
    }, 'image/png');
  });
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('add-layer').onclick = addLayer;
  document.getElementById('export-png').onclick = async () => {
    const blob = await generateExportBlob(EXPORT_WIDTH, EXPORT_HEIGHT);
    if (blob) {
      const arrayBuffer = await blob.arrayBuffer();
      await window.eneftyAPI.savePNG(new Uint8Array(arrayBuffer));
    } else {
      console.error('Failed to generate blob for export.');
      alert('Error exporting PNG. Could not generate image blob.');
    }
  };
  document.getElementById('save-project').onclick = async () => {
    await window.eneftyAPI.saveEnefty(layers);
  };
  document.getElementById('open-project').onclick = async () => {
    const loaded = await window.eneftyAPI.openEnefty();
    if (loaded) {
      layers = loaded;
      renderLayersPanel();
      renderPreview();
    }
  };

  if (window.require) {
    const { ipcRenderer } = require('electron');
    ipcRenderer.on('menu-open-project', async () => {
      document.getElementById('open-project').click();
    });
    ipcRenderer.on('menu-save-project', async () => {
      document.getElementById('save-project').click();
    });
  }

  // Initial render
  renderLayersPanel();
  renderPreview();
});

// --- Bulk Generation ---
const bulkGenState = {
  running: false,
  paused: false,
  cancelRequested: false,
  combos: [],
  currentComboIndex: 0,
  folder: '',
  prefix: 'variation', // Default prefix
  numDigits: 0,
  // To correctly map combinations to layers if not all layers are used or active:
  layersForGeneration: [],
};

// Resets the logical state of bulk generation. UI input values are preserved.
function resetBulkGenLogicState() {
  bulkGenState.running = false;
  bulkGenState.paused = false;
  bulkGenState.cancelRequested = false;
  bulkGenState.combos = [];
  bulkGenState.currentComboIndex = 0;
  bulkGenState.numDigits = 0;
  bulkGenState.layersForGeneration = [];
  // Note: bulkGenState.folder and bulkGenState.prefix are intentionally NOT reset here
  // to preserve user input across modal openings if desired. They are updated from UI on "Start".
}

// Updates the buttons in the bulk generation modal based on the current state.
function updateBulkButtonUI() {
  const startPauseResumeBtn = document.getElementById('bulk-generate-start');
  const cancelBtn = document.getElementById('bulk-cancel');

  if (bulkGenState.running) {
    startPauseResumeBtn.textContent = bulkGenState.paused ? 'Resume' : 'Pause';
    startPauseResumeBtn.classList.toggle('running', !bulkGenState.paused);
    startPauseResumeBtn.classList.remove('stop');
    cancelBtn.disabled = false;
  } else { // Not running (initial, completed, or cancelled)
    startPauseResumeBtn.textContent = 'Start';
    startPauseResumeBtn.classList.remove('running', 'stop');
    cancelBtn.disabled = false;
  }
}

document.getElementById('bulk-generate').onclick = () => {
  // Initialize state for modal display
  // Preserve folder and prefix if they were already set by the user from previous run
  bulkGenState.folder = document.getElementById('bulk-dest-folder').value || bulkGenState.folder;
  bulkGenState.prefix = document.getElementById('bulk-prefix').value || bulkGenState.prefix || 'variation';

  resetBulkGenLogicState(); // Reset core logic state variables, keeps folder/prefix in state

  document.getElementById('bulk-dest-folder').value = bulkGenState.folder; // Ensure UI reflects state
  document.getElementById('bulk-prefix').value = bulkGenState.prefix;     // Ensure UI reflects state

  document.getElementById('bulk-modal').style.display = 'flex';
  document.getElementById('bulk-progress').style.display = 'none';
  document.getElementById('bulk-current-count').textContent = '0';
  const progressBar = document.getElementById('bulk-progress-bar');
  if (progressBar) progressBar.value = 0;

  updateBulkButtonUI();
};

document.getElementById('bulk-browse').onclick = async () => {
  const folderPath = await window.eneftyAPI.selectFolder();
  if (folderPath) {
    document.getElementById('bulk-dest-folder').value = folderPath;
    bulkGenState.folder = folderPath; // Update state immediately
  }
};

document.getElementById('bulk-cancel').onclick = () => {
  bulkGenState.cancelRequested = true;
  if (!bulkGenState.running || bulkGenState.paused) {
    // If not running or already paused, can hide modal and reset state immediately
    document.getElementById('bulk-modal').style.display = 'none';
    resetBulkGenLogicState(); // Full reset of logic state
    updateBulkButtonUI();     // Update buttons to initial state ("Start")
  }
  // If running and not paused, the loop in bulkGenerateProcess will detect cancelRequested.
  // It will then handle hiding the modal, resetting state, and updating UI.
};

document.getElementById('bulk-generate-start').onclick = async () => {
  // Always ensure current UI values for folder/prefix are in the state before starting/resuming.
  bulkGenState.folder = document.getElementById('bulk-dest-folder').value;
  bulkGenState.prefix = document.getElementById('bulk-prefix').value.trim() || 'variation';

  if (bulkGenState.running) {
    // Action is Pause or Resume
    bulkGenState.paused = !bulkGenState.paused; // Toggle pause state
    updateBulkButtonUI(); // Update button text to "Resume" or "Pause"

    if (!bulkGenState.paused) {
      // If resuming, continue the process.
      // The bulkGenerateProcess function will pick up from bulkGenState.currentComboIndex.
      bulkGenerateProcess();
    }
  } else {
    // Action is Start new generation
    if (!bulkGenState.folder) {
      alert('Please select a destination folder.');
      return;
    }

    // Use only layers that have images for generating combinations
    bulkGenState.layersForGeneration = layers.filter(l => l.images && l.images.length > 0);
    if (bulkGenState.layersForGeneration.length === 0) {
      alert('No layers with images to generate from. Please add images to your layers.');
      return;
    }

    const indices = bulkGenState.layersForGeneration.map(layer => layer.images.map((_, i) => i));
    bulkGenState.combos = cartesianProduct(indices);

    // Check if cartesianProduct resulted in genuinely empty or trivial combinations
    if (bulkGenState.combos.length === 0 || (bulkGenState.combos.length === 1 && bulkGenState.combos[0].length === 0) ) {
      alert('No image combinations found. This can happen if layers are empty or no images are selected for layers that are part of the generation.');
      resetBulkGenLogicState(); // Reset if no valid combinations
      return;
    }

    bulkGenState.numDigits = Math.max(5, bulkGenState.combos.length.toString().length);
    bulkGenState.currentComboIndex = 0;
    bulkGenState.running = true;
    bulkGenState.paused = false;
    bulkGenState.cancelRequested = false;

    document.getElementById('bulk-progress').style.display = 'block';
    document.getElementById('bulk-total').textContent = bulkGenState.combos.length;
    document.getElementById('bulk-total-count').textContent = bulkGenState.combos.length;
    document.getElementById('bulk-current-count').textContent = '0';
    const progressBar = document.getElementById('bulk-progress-bar');
    if (progressBar) progressBar.max = bulkGenState.combos.length;
    if (progressBar) progressBar.value = 0;

    updateBulkButtonUI(); // Set button to "Pause"
    bulkGenerateProcess(); // Start the generation process
  }
};

async function bulkGenerateProcess() {
  // Ensure UI reflects correct state (e.g. "Pause" button) if process starts quickly
  if(bulkGenState.running && !bulkGenState.paused) {
    const startPauseResumeBtn = document.getElementById('bulk-generate-start');
    startPauseResumeBtn.textContent = 'Pause';
    startPauseResumeBtn.classList.add('running');
    // Ensure 'stop' class (if it was part of old styling for pause) is removed
    startPauseResumeBtn.classList.remove('stop');
  }

  for (let i = bulkGenState.currentComboIndex; i < bulkGenState.combos.length; i++) {
    if (bulkGenState.cancelRequested || bulkGenState.paused) {
      bulkGenState.currentComboIndex = i; // Save progress
      break;
    }

    const currentCombination = bulkGenState.combos[i];
    currentCombination.forEach((imgIdx, layerComboIndex) => {
      const targetLayer = bulkGenState.layersForGeneration[layerComboIndex];
      const mainLayerIndex = layers.findIndex(l => l === targetLayer);
      if (mainLayerIndex !== -1) {
        layers[mainLayerIndex].selected = imgIdx;
      } else {
        console.warn("Could not find target layer in main layers array during bulk generation. This might indicate an issue if layers were modified during generation.");
      }
    });

    await renderPreview();
    // Yield to event loop for UI updates / responsiveness, e.g., progress bar.
    // Also helps prevent the UI from freezing during intensive loop operations.
    // Consider replacing with requestAnimationFrame or other strategies if more fine-grained control is needed.
    await new Promise(resolve => setTimeout(resolve, 10));

    const blob = await generateExportBlob(EXPORT_WIDTH, EXPORT_HEIGHT);
    const name = `${bulkGenState.prefix}-${String(i + 1).padStart(bulkGenState.numDigits, '0')}.png`;

    if (blob) {
      const buffer = await blob.arrayBuffer();
      await window.eneftyAPI.bulkSavePNG(bulkGenState.folder, [{ name, buffer: new Uint8Array(buffer) }]);
    } else {
      console.warn(`Failed to generate blob for ${name}. Skipping.`);
    }

    document.getElementById('bulk-current-count').textContent = i + 1;
    const progressBar = document.getElementById('bulk-progress-bar');
    if (progressBar) progressBar.value = i + 1;

    // If this was the last item and loop is finishing naturally
    if (i === bulkGenState.combos.length - 1) {
      bulkGenState.currentComboIndex = i + 1; // Mark as fully complete for alert logic
    }
  } // End of loop

  if (bulkGenState.paused) {
    // State is preserved. UI already updated to "Resume" by the click handler.
  } else {
    // Generation completed naturally or was cancelled
    const itemsSuccessfullyProcessed = bulkGenState.currentComboIndex;
    const totalItemsToProcess = bulkGenState.combos.length;
    const cancelled = bulkGenState.cancelRequested;

    document.getElementById('bulk-modal').style.display = 'none';
    resetBulkGenLogicState();
    updateBulkButtonUI();

    if (cancelled) {
         alert(`Bulk generation cancelled. ${itemsSuccessfullyProcessed} of ${totalItemsToProcess} images were processed.`);
    } else if (itemsSuccessfullyProcessed === totalItemsToProcess && totalItemsToProcess > 0){
         alert(`Bulk generation complete! ${itemsSuccessfullyProcessed} images generated.`);
    } else if (totalItemsToProcess === 0) {
        // No alert, as initial checks in 'start' button should prevent this or have already alerted.
    } else if (itemsSuccessfullyProcessed < totalItemsToProcess && itemsSuccessfullyProcessed > 0) {
        // This case implies the loop finished but not all items were processed,
        // which shouldn't happen if not paused or cancelled. Could be an error state.
        // For now, treat as completed up to itemsSuccessfullyProcessed.
         alert(`Bulk generation finished. ${itemsSuccessfullyProcessed} of ${totalItemsToProcess} images generated.`);
    }
  }
}

// Helper: cartesian product for all combinations
function cartesianProduct(arr) {
  return arr.reduce((a, b) => a.flatMap(d => b.map(e => [].concat(d, e))), [[]]);
}