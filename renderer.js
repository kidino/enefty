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
      // Map UI order (top to bottom) to layers array (bottom to top)
      const nodes = Array.from(list.children);
      const newOrder = nodes.map(node => parseInt(node.getAttribute('data-idx')));
      // Reverse to get bottom-to-top order for layers array
      const newLayers = [];
      for (let i = newOrder.length - 1; i >= 0; i--) {
        newLayers.push(layers[newOrder[i]]);
      }
      layers = newLayers;
      renderLayersPanel();
      renderPreview();
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
    const thumb = await createThumbnail(img, 40, 40);
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

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('add-layer').onclick = addLayer;
  document.getElementById('export-png').onclick = async () => {
    // Ensure the preview is up to date before exporting
    await renderPreview();
    canvas.toBlob(async (blob) => {
      if (!blob) return;
      const arrayBuffer = await blob.arrayBuffer();
      // Use Uint8Array for Electron IPC
      await window.eneftyAPI.savePNG(new Uint8Array(arrayBuffer));
    }, 'image/png');
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

// Bulk Generation UI
let bulkCancelRequested = false;

document.getElementById('bulk-generate').onclick = () => {
  document.getElementById('bulk-modal').style.display = 'flex';
  document.getElementById('bulk-dest-folder').value = '';
  document.getElementById('bulk-prefix').value = 'variation';
  document.getElementById('bulk-progress').style.display = 'none';
  document.getElementById('bulk-modal-actions').style.display = 'flex';
};

document.getElementById('bulk-browse').onclick = async () => {
  const folder = await window.eneftyAPI.selectFolder();
  if (folder) {
    document.getElementById('bulk-dest-folder').value = folder;
  }
};

document.getElementById('bulk-cancel').onclick = () => {
  if (document.getElementById('bulk-progress').style.display === 'block') {
    bulkCancelRequested = true;
  }
  document.getElementById('bulk-modal').style.display = 'none';
};

document.getElementById('bulk-generate-start').onclick = async () => {
  const folder = document.getElementById('bulk-dest-folder').value;
  const prefix = document.getElementById('bulk-prefix').value.trim() || 'variation';
  if (!folder) {
    alert('Please select a destination folder.');
    return;
  }
  // Prepare all combinations
  const indices = layers.map(layer => layer.images.map((_, i) => i));
  if (indices.some(arr => arr.length === 0)) {
    alert('All layers must have at least one image.');
    return;
  }
  const combos = cartesianProduct(indices);
  const numDigits = combos.length.toString().length > 4 ? combos.length.toString().length : 5;
  document.getElementById('bulk-progress').style.display = 'block';
  document.getElementById('bulk-modal-actions').style.display = 'none';
  document.getElementById('bulk-total').textContent = combos.length;
  document.getElementById('bulk-total-count').textContent = combos.length;
  document.getElementById('bulk-current-count').textContent = '0';
  document.getElementById('bulk-progress-bar').max = combos.length;
  document.getElementById('bulk-progress-bar').value = 0;
  bulkCancelRequested = false;

  // Generate images
  const files = [];
  for (let i = 0; i < combos.length; i++) {
    if (bulkCancelRequested) break;
    combos[i].forEach((imgIdx, layerIdx) => {
      layers[layerIdx].selected = imgIdx;
    });
    await renderPreview();
    await new Promise(r => setTimeout(r, 10));
    const name = `${prefix}-${String(i + 1).padStart(numDigits, '0')}.png`;
    const buffer = await new Promise(resolve =>
      canvas.toBlob(blob => {
        if (!blob) return resolve(null);
        blob.arrayBuffer().then(buf => resolve(new Uint8Array(buf)));
      }, 'image/png')
    );
    if (buffer) {
      files.push({ name, buffer });
    }
    // Only update progress if elements exist
    const currentCount = document.getElementById('bulk-current-count');
    const progressBar = document.getElementById('bulk-progress-bar');
    if (currentCount) currentCount.textContent = i + 1;
    if (progressBar) progressBar.value = i + 1;
  }
  if (!bulkCancelRequested && files.length) {
    await window.eneftyAPI.bulkSavePNG(folder, files);
  }
  document.getElementById('bulk-modal').style.display = 'none';
  bulkCancelRequested = false;
}

// Helper: cartesian product
function cartesianProduct(arr) {
  return arr.reduce((a, b) =>
    a.flatMap(d => b.map(e => [].concat(d, e)))
  , [[]]);
}