(() => {
  const STATE_KEY = "ruang-outfit-settings-v1";
  const INITIAL_CATEGORIES = ["Kerudung", "Outer", "Kaus", "Kemeja", "Celana", "Rok", "Sepatu", "Tas"];
  const OUTFIT_ORDER = ["kerudung", "outer", "kaus", "kemeja", "celana", "rok", "tas", "sepatu"];
  const OTHER_CATEGORY_ORDER = OUTFIT_ORDER.indexOf("sepatu") - 0.5;
  const INITIAL_COLORS = ["Hitam", "Putih", "Cokelat", "Abu-abu", "Biru", "Merah", "Hijau", "Krem"];
  const $ = (selector) => document.querySelector(selector);
  const elements = {
    outfitGrid: $("#outfit-grid"),
    clearOutfit: $("#clear-outfit"),
    itemCount: $("#item-count"),
    categoryFilter: $("#category-filter"),
    colorFilter: $("#color-filter"),
    favoriteFilter: $("#favorite-filter"),
    clothingGrid: $("#clothing-grid"),
    status: $("#status-message"),
    itemDialog: $("#item-dialog"),
    itemForm: $("#item-form"),
    photoInput: $("#photo-input"),
    photoPreview: $("#photo-preview"),
    uploadPlaceholder: $("#upload-placeholder"),
    uploadArea: $("#upload-area"),
    itemName: $("#item-name"),
    itemCategory: $("#item-category"),
    itemColor: $("#item-color"),
    newItemCategory: $("#new-item-category"),
    newItemColor: $("#new-item-color"),
    itemFormError: $("#item-form-error"),
    categoryDialog: $("#category-dialog"),
    categoryForm: $("#category-form"),
    newCategory: $("#new-category"),
    categoryList: $("#category-list"),
    categoryFormError: $("#category-form-error")
  };

  const state = readSettings();
  let items = [];
  let database;
  let previewUrl = "";
  const imageUrls = new Map();

  function readSettings() {
    try {
      const saved = JSON.parse(localStorage.getItem(STATE_KEY) || "{}");
      return {
        categories: Array.isArray(saved.categories) ? saved.categories : INITIAL_CATEGORIES.slice(),
        colors: Array.isArray(saved.colors) ? saved.colors : INITIAL_COLORS.slice(),
        outfit: saved.outfit && typeof saved.outfit === "object" ? saved.outfit : {},
        favoritesOnly: false
      };
    } catch (error) {
      console.error("Pengaturan lemari tidak dapat dibaca.", error);
      return { categories: INITIAL_CATEGORIES.slice(), colors: INITIAL_COLORS.slice(), outfit: {}, favoritesOnly: false };
    }
  }

  function saveSettings() {
    try {
      localStorage.setItem(STATE_KEY, JSON.stringify({
        categories: state.categories,
        colors: state.colors,
        outfit: state.outfit
      }));
      return true;
    } catch (error) {
      showStatus("Pengaturan tidak dapat disimpan di perangkat ini.");
      console.error("Pengaturan lemari tidak dapat disimpan.", error);
      return false;
    }
  }

  function openDatabase() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open("ruang-outfit", 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains("clothing")) db.createObjectStore("clothing", { keyPath: "id" });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("Database lokal tidak dapat dibuka."));
    });
  }

  function databaseRequest(mode, operation) {
    return new Promise((resolve, reject) => {
      const transaction = database.transaction("clothing", mode);
      let result;
      try {
        const request = operation(transaction.objectStore("clothing"));
        if (request) {
          request.onsuccess = () => { result = request.result; };
          request.onerror = () => reject(request.error || new Error("Data pakaian tidak dapat diakses."));
        }
      } catch (error) {
        reject(error);
        transaction.abort();
        return;
      }
      transaction.oncomplete = () => resolve(result);
      transaction.onerror = () => reject(transaction.error || new Error("Data pakaian tidak dapat diakses."));
      transaction.onabort = () => reject(transaction.error || new Error("Perubahan data pakaian dibatalkan."));
    });
  }

  function getImageUrl(item) {
    const cached = imageUrls.get(item.id);
    if (cached && cached.image === item.image) return cached.url;
    if (cached) URL.revokeObjectURL(cached.url);
    const url = URL.createObjectURL(item.image);
    imageUrls.set(item.id, { image: item.image, url });
    return url;
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (char) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[char]);
  }

  function showStatus(message) {
    elements.status.textContent = message;
    if (message) window.setTimeout(() => {
      if (elements.status.textContent === message) elements.status.textContent = "";
    }, 5000);
  }

  function uniqueValue(values, candidate) {
    const trimmed = candidate.trim();
    return values.some((value) => value.toLocaleLowerCase("id") === trimmed.toLocaleLowerCase("id"))
      ? values.find((value) => value.toLocaleLowerCase("id") === trimmed.toLocaleLowerCase("id"))
      : trimmed;
  }

  function optionMarkup(values, firstLabel, selectedValue = "") {
    const first = firstLabel ? `<option value="">${escapeHtml(firstLabel)}</option>` : "";
    return first + values.map((value) => `<option value="${escapeHtml(value)}"${value === selectedValue ? " selected" : ""}>${escapeHtml(value)}</option>`).join("");
  }

  function renderFilters() {
    const oldCategory = elements.categoryFilter.value;
    const oldColor = elements.colorFilter.value;
    elements.categoryFilter.innerHTML = optionMarkup(state.categories, "Semua kategori");
    elements.colorFilter.innerHTML = optionMarkup(state.colors, "Semua warna");
    if (state.categories.includes(oldCategory)) elements.categoryFilter.value = oldCategory;
    if (state.colors.includes(oldColor)) elements.colorFilter.value = oldColor;
    elements.itemCategory.innerHTML = optionMarkup(state.categories, "");
    elements.itemColor.innerHTML = optionMarkup(state.colors, "");
  }

  function renderOutfit() {
    const categories = state.categories
      .map((category, index) => ({ category, index, order: OUTFIT_ORDER.indexOf(category.toLocaleLowerCase("id")) }))
      .sort((a, b) => {
        const orderA = a.order === -1 ? OTHER_CATEGORY_ORDER : a.order;
        const orderB = b.order === -1 ? OTHER_CATEGORY_ORDER : b.order;
        return orderA - orderB || a.index - b.index;
      })
      .map(({ category }) => category);
    elements.outfitGrid.innerHTML = categories.map((category) => {
      const item = items.find((entry) => entry.id === state.outfit[category]);
      if (!item) {
        return `<div class="outfit-slot"><div class="slot-empty"><span class="slot-empty-icon" aria-hidden="true">+</span><span class="slot-label">${escapeHtml(category)}</span></div></div>`;
      }
      const imageUrl = getImageUrl(item);
      return `<div class="outfit-slot"><div class="slot-filled"><img src="${imageUrl}" alt="${escapeHtml(item.name || category)}"><div class="slot-details"><span class="slot-category">${escapeHtml(category)}</span><span class="slot-caption">${escapeHtml(item.name || category)}</span></div><button class="slot-remove" type="button" data-clear-slot="${escapeHtml(category)}" aria-label="Hapus ${escapeHtml(category)} dari outfit">×</button></div></div>`;
    }).join("");
    elements.clearOutfit.hidden = !Object.values(state.outfit).some(Boolean);
  }

  function renderWardrobe() {
    const category = elements.categoryFilter.value;
    const color = elements.colorFilter.value;
    const visibleItems = items.filter((item) =>
      (!category || item.category === category) &&
      (!color || item.color === color) &&
      (!state.favoritesOnly || item.favorite)
    );
    elements.itemCount.textContent = String(items.length);
    elements.favoriteFilter.setAttribute("aria-pressed", String(state.favoritesOnly));
    if (visibleItems.length === 0) {
      const hasItems = items.length > 0;
      elements.clothingGrid.innerHTML = `<div class="empty-state"><strong>${hasItems ? "Belum ada yang cocok" : "Lemari masih kosong"}</strong><p>${hasItems ? "Coba ubah filter pakaianmu." : "Tambahkan foto pakaian untuk mulai merangkai outfit."}</p></div>`;
      return;
    }
    elements.clothingGrid.innerHTML = visibleItems.map((item) => {
      const imageUrl = getImageUrl(item);
      return `<article class="clothing-card">
        <div class="card-photo">
          <img src="${imageUrl}" alt="${escapeHtml(item.name || item.category)}" loading="lazy">
          <span class="card-tag">${escapeHtml(item.category)}</span>
          <button class="icon-button card-delete" type="button" data-delete="${escapeHtml(item.id)}" aria-label="Hapus ${escapeHtml(item.name || item.category)}">×</button>
          <button class="icon-button card-favorite${item.favorite ? " is-favorite" : ""}" type="button" data-favorite="${escapeHtml(item.id)}" aria-label="${item.favorite ? "Hapus dari" : "Tambah ke"} favorit outfit" aria-pressed="${Boolean(item.favorite)}">${item.favorite ? "♥" : "♡"}</button>
        </div>
        <div class="card-info">
          <p class="card-name" title="${escapeHtml(item.name || item.category)}">${escapeHtml(item.name || item.category)}</p>
          <p class="card-meta">${escapeHtml(item.color)}</p>
          <button class="wear-button" type="button" data-wear="${escapeHtml(item.id)}">Pakai di outfit</button>
        </div>
      </article>`;
    }).join("");
  }

  function renderCategories() {
    elements.categoryList.innerHTML = state.categories.map((category) =>
      `<div class="category-chip"><span>${escapeHtml(category)}</span><button type="button" data-remove-category="${escapeHtml(category)}" aria-label="Hapus kategori ${escapeHtml(category)}">×</button></div>`
    ).join("");
  }

  function render() {
    renderFilters();
    renderOutfit();
    renderWardrobe();
    renderCategories();
  }

  function refreshItems() {
    return databaseRequest("readonly", (store) => store.getAll()).then((rows) => {
      items = rows;
      const ids = new Set(items.map((item) => item.id));
      imageUrls.forEach((entry, id) => {
        if (!ids.has(id)) {
          URL.revokeObjectURL(entry.url);
          imageUrls.delete(id);
        }
      });
      Object.keys(state.outfit).forEach((category) => {
        if (!ids.has(state.outfit[category]) || !state.categories.includes(category)) delete state.outfit[category];
      });
      saveSettings();
      render();
    });
  }

  function closeDialog(button) {
    const dialog = button.closest("dialog");
    if (dialog) dialog.close();
  }

  function clearPreview() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = "";
    elements.photoPreview.removeAttribute("src");
    elements.photoPreview.hidden = true;
    elements.uploadPlaceholder.hidden = false;
  }

  function showNewColorInput() {
    return elements.newItemColor.value.trim();
  }

  async function compressImage(file) {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 1200 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Foto tidak dapat diproses oleh browser ini.");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.84));
    if (!blob) throw new Error("Foto tidak dapat disimpan. Coba pilih gambar lain.");
    return blob;
  }

  $("#add-item").addEventListener("click", () => {
    elements.itemForm.reset();
    elements.itemFormError.textContent = "";
    clearPreview();
    renderFilters();
    elements.itemDialog.showModal();
  });

  elements.photoInput.addEventListener("change", () => {
    const file = elements.photoInput.files && elements.photoInput.files[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      elements.itemFormError.textContent = "Pilih file foto dengan format gambar.";
      elements.photoInput.value = "";
      return;
    }
    clearPreview();
    previewUrl = URL.createObjectURL(file);
    elements.photoPreview.src = previewUrl;
    elements.photoPreview.hidden = false;
    elements.uploadPlaceholder.hidden = true;
    elements.itemFormError.textContent = "";
  });

  elements.itemForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const file = elements.photoInput.files && elements.photoInput.files[0];
    let category = elements.newItemCategory.value.trim() || elements.itemCategory.value;
    let color = showNewColorInput() || elements.itemColor.value;
    if (!file || !category || !color) {
      elements.itemFormError.textContent = "Pilih foto, kategori, dan warna pakaian.";
      return;
    }
    category = uniqueValue(state.categories, category);
    color = uniqueValue(state.colors, color);
    if (!state.categories.includes(category)) state.categories.push(category);
    if (!state.colors.includes(color)) state.colors.push(color);
    elements.itemFormError.textContent = "";
    const submitButton = elements.itemForm.querySelector('[type="submit"]');
    submitButton.disabled = true;
    submitButton.textContent = "Menyimpan…";
    try {
      const image = await compressImage(file);
      const record = {
        id: crypto.randomUUID(),
        image,
        name: elements.itemName.value.trim(),
        category,
        color,
        favorite: false,
        createdAt: Date.now()
      };
      await databaseRequest("readwrite", (store) => store.put(record));
      saveSettings();
      await refreshItems();
      elements.itemDialog.close();
      showStatus("Pakaian berhasil ditambahkan.");
    } catch (error) {
      console.error("Pakaian tidak dapat disimpan.", error);
      elements.itemFormError.textContent = error.message || "Pakaian tidak dapat disimpan di perangkat ini.";
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = "Simpan ke lemari";
    }
  });

  $("#manage-categories").addEventListener("click", () => {
    renderCategories();
    elements.categoryFormError.textContent = "";
    elements.categoryDialog.showModal();
  });

  elements.categoryForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const value = elements.newCategory.value.trim();
    if (!value) return;
    if (state.categories.some((category) => category.toLocaleLowerCase("id") === value.toLocaleLowerCase("id"))) {
      elements.categoryFormError.textContent = "Kategori tersebut sudah ada.";
      return;
    }
    state.categories.push(value);
    elements.newCategory.value = "";
    elements.categoryFormError.textContent = "";
    saveSettings();
    render();
  });

  elements.categoryList.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-remove-category]");
    if (!button) return;
    const category = button.dataset.removeCategory;
    if (state.categories.length < 2) {
      elements.categoryFormError.textContent = "Sisakan setidaknya satu kategori. Tambahkan kategori baru sebelum menghapus yang terakhir.";
      return;
    }
    const destination = state.categories.find((value) => value !== category);
    const affectedItems = items.filter((item) => item.category === category);
    if (affectedItems.length && !window.confirm(`Pindahkan ${affectedItems.length} pakaian ke kategori “${destination}” dan hapus kategori “${category}”?`)) return;
    try {
      const movedItems = affectedItems.map((item) => ({ ...item, category: destination }));
      await databaseRequest("readwrite", (store) => {
        movedItems.forEach((item) => store.put(item));
      });
      const movedById = new Map(movedItems.map((item) => [item.id, item]));
      items = items.map((item) => movedById.get(item.id) || item);
      delete state.outfit[category];
      state.categories = state.categories.filter((value) => value !== category);
      saveSettings();
      render();
      elements.categoryFormError.textContent = "";
    } catch (error) {
      console.error("Kategori pakaian tidak dapat dihapus.", error);
      elements.categoryFormError.textContent = "Kategori tidak dapat dihapus. Coba lagi.";
    }
  });

  elements.clothingGrid.addEventListener("click", async (event) => {
    const wearButton = event.target.closest("[data-wear]");
    const favoriteButton = event.target.closest("[data-favorite]");
    const deleteButton = event.target.closest("[data-delete]");
    if (wearButton) {
      const item = items.find((entry) => entry.id === wearButton.dataset.wear);
      if (!item) return;
      state.outfit[item.category] = item.id;
      saveSettings();
      renderOutfit();
      showStatus(`${item.name || item.category} dipilih untuk outfit.`);
    }
    if (favoriteButton) {
      const item = items.find((entry) => entry.id === favoriteButton.dataset.favorite);
      if (!item) return;
      item.favorite = !item.favorite;
      try {
        await databaseRequest("readwrite", (store) => store.put(item));
        await refreshItems();
      } catch (error) {
        item.favorite = !item.favorite;
        console.error("Favorit pakaian tidak dapat diperbarui.", error);
        showStatus("Favorit tidak dapat diperbarui.");
      }
    }
    if (deleteButton) {
      const item = items.find((entry) => entry.id === deleteButton.dataset.delete);
      if (!item || !window.confirm(`Hapus ${item.name || item.category} dari lemari?`)) return;
      try {
        await databaseRequest("readwrite", (store) => store.delete(item.id));
        await refreshItems();
        showStatus("Pakaian dihapus dari lemari.");
      } catch (error) {
        console.error("Pakaian tidak dapat dihapus.", error);
        showStatus("Pakaian tidak dapat dihapus. Coba lagi.");
      }
    }
  });

  elements.outfitGrid.addEventListener("click", (event) => {
    const button = event.target.closest("[data-clear-slot]");
    if (!button) return;
    delete state.outfit[button.dataset.clearSlot];
    saveSettings();
    renderOutfit();
  });

  elements.clearOutfit.addEventListener("click", () => {
    state.outfit = {};
    saveSettings();
    renderOutfit();
  });

  elements.categoryFilter.addEventListener("change", renderWardrobe);
  elements.colorFilter.addEventListener("change", renderWardrobe);
  elements.favoriteFilter.addEventListener("click", () => {
    state.favoritesOnly = !state.favoritesOnly;
    renderWardrobe();
  });

  document.querySelectorAll(".close-dialog").forEach((button) => button.addEventListener("click", () => closeDialog(button)));
  document.querySelectorAll("dialog").forEach((dialog) => {
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) dialog.close();
    });
  });
  elements.itemDialog.addEventListener("close", clearPreview);
  window.addEventListener("pagehide", () => {
    imageUrls.forEach((entry) => URL.revokeObjectURL(entry.url));
    imageUrls.clear();
  });

  if (!("indexedDB" in window) || !("createImageBitmap" in window)) {
    showStatus("Browser ini belum mendukung penyimpanan foto lokal. Gunakan browser versi terbaru.");
    $("#add-item").disabled = true;
  } else {
    openDatabase().then((db) => {
      database = db;
      return refreshItems();
    }).catch((error) => {
      console.error("Lemari lokal tidak dapat dibuka.", error);
      showStatus("Lemari lokal tidak dapat dibuka. Periksa izin penyimpanan browser.");
      $("#add-item").disabled = true;
    });
  }

  render();
})();
