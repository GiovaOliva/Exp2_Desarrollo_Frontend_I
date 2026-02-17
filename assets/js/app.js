(() => {
  "use strict";

  const $ = (sel) => document.querySelector(sel);

  /**
   * Estado de la aplicación:
   * - products: productos cargados desde JSON
   * - filtered: productos filtrados por búsqueda
   * - cart: carrito con items { id:number, qty:number }
   */
  const state = {
    products: [],
    filtered: [],
    cart: [],
  };

  /**
   * Promociones 2x por categoría:
   * - por cada 2 productos de la misma categoría, se aplica precio fijo promo
   * - si hay impares, el restante se cobra normal
   */
  const PROMOS = {
    figuras: 50000,
    poleras: 35000,
    posters: 14000,
  };

  // ====== DOM refs
  const grids = {
    figuras: $("#grid-figuras"),
    poleras: $("#grid-poleras"),
    posters: $("#grid-posters"),
  };

  const alertBox = $("#appAlert");
  const searchForm = $("#searchForm");
  const searchInput = $("#searchInput");
  const clearSearchBtn = $("#clearSearch");

  const cartCount = $("#cartCount");
  const cartList = $("#cartList");
  const cartEmpty = $("#cartEmpty");
  const cartTotal = $("#cartTotal");
  const cartClear = $("#cartClear");
  const cartSubtotal = $("#cartSubtotal");
  const cartDiscounts = $("#cartDiscounts");

  /**
   * Guard simple para fallar con mensaje claro si falta un elemento importante del HTML.
   * Esto evita errores silenciosos y facilita depuración.
   */
  function requireEl(el, name) {
    if (!el) throw new Error(`Falta el elemento #${name} en el HTML`);
    return el;
  }

  // Si falta algo crítico, detenemos la app con un error claro.
  try {
    requireEl(grids.figuras, "grid-figuras");
    requireEl(grids.poleras, "grid-poleras");
    requireEl(grids.posters, "grid-posters");
    requireEl(alertBox, "appAlert");
    requireEl(searchForm, "searchForm");
    requireEl(searchInput, "searchInput");
    requireEl(clearSearchBtn, "clearSearch");
    requireEl(cartCount, "cartCount");
    requireEl(cartList, "cartList");
    requireEl(cartEmpty, "cartEmpty");
    requireEl(cartTotal, "cartTotal");
    requireEl(cartClear, "cartClear");
    requireEl(cartSubtotal, "cartSubtotal");
    requireEl(cartDiscounts, "cartDiscounts");
  } catch (e) {
    console.error(e);
    return;
  }

  // ====== Utils
  const formatCLP = (value) =>
    new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP" }).format(value);

  const showError = (msg) => {
    alertBox.textContent = msg;
    alertBox.classList.remove("d-none");
  };

  const hideError = () => {
    alertBox.classList.add("d-none");
    alertBox.textContent = "";
  };

  /**
   * Normaliza el producto para que el proyecto sea tolerante a variaciones en el JSON.
   * Permite aceptar claves alternativas (ej: nombre/descripcion/categoria).
   */
  function normalizeProduct(p) {
    return {
      id: Number(p.id),
      title: p.title ?? p.nombre ?? "Producto",
      description: p.description ?? p.descripcion ?? "",
      category: (p.category ?? p.categoria ?? "").toLowerCase(),
      price: Number(p.price ?? p.precio ?? 0),
      image: p.image ?? p.imagen ?? "",
      alt: p.alt ?? p.altText ?? p.descripcion ?? p.title ?? p.nombre ?? "Producto",
    };
  }

  // ====== Render
  function productCardHTML(p) {
    return `
      <div class="col-12 col-md-6 col-lg-4">
        <article class="card product-card h-100 shadow-sm">
          <div class="product-img-wrap">
            <img src="./assets/${p.image}" class="card-img-top product-img" alt="${p.alt}">
          </div>
          <div class="card-body text-center">
            <h4 class="h5 card-title">${p.title}</h4>
            <p class="card-text text-secondary mb-2">${p.description}</p>
            <p class="fw-bold mb-3">${formatCLP(p.price)}</p>

            <button class="btn btn-dark w-100 js-add-to-cart" type="button" data-id="${p.id}">
              <i class="bi bi-cart-plus me-1"></i> Agregar al carrito
            </button>
          </div>
        </article>
      </div>
    `;
  }

  /**
   * Renderiza los productos en el DOM:
   * - Limpia los grids
   * - Agrupa por categoría (figuras/poleras/posters)
   * - Inserta cards dinámicamente (DOM)
   */
  function renderProducts(list) {
    Object.values(grids).forEach((grid) => (grid.innerHTML = ""));

    const byCat = { figuras: [], poleras: [], posters: [] };
    list.forEach((p) => {
      if (byCat[p.category]) byCat[p.category].push(p);
    });

    byCat.figuras.forEach((p) => (grids.figuras.innerHTML += productCardHTML(p)));
    byCat.poleras.forEach((p) => (grids.poleras.innerHTML += productCardHTML(p)));
    byCat.posters.forEach((p) => (grids.posters.innerHTML += productCardHTML(p)));
  }

  /**
   * Calcula subtotal, descuentos y total final aplicando promociones 2x por categoría.
   *
   * Regla:
   * - Por cada 2 unidades de la misma categoría, el par se cobra a precio PROMO.
   * - Si hay 3 unidades: 2 entran en promo, 1 se cobra normal.
   * - Si hay 4 unidades: 2 promos (dos pares).
   *
   * Estrategia:
   * - Expandimos precios por unidad
   * - Ordenamos de mayor a menor
   * - Aplicamos la promo a los "pares" más caros primero (beneficio máximo para el cliente)
   */
  function computePromoTotals(items) {
    const subtotal = items.reduce((acc, it) => acc + it.price * it.qty, 0);

    // Expandimos por unidad
    const byCat = { figuras: [], poleras: [], posters: [] };
    items.forEach((it) => {
      if (!byCat[it.category]) return;
      for (let i = 0; i < it.qty; i++) byCat[it.category].push(it.price);
    });

    const discountLines = [];
    let totalDiscount = 0;

    Object.entries(PROMOS).forEach(([cat, promoPrice]) => {
      const prices = (byCat[cat] || []).slice();
      if (prices.length < 2) return;

      prices.sort((a, b) => b - a); // más caros primero
      const pairs = Math.floor(prices.length / 2);
      if (pairs <= 0) return;

      const countInPromo = pairs * 2;
      const promoItemsSum = prices.slice(0, countInPromo).reduce((a, v) => a + v, 0);
      const promoTotal = pairs * promoPrice;
      const discount = promoItemsSum - promoTotal;

      if (discount > 0) {
        totalDiscount += discount;

        const label = cat === "figuras" ? "Figuras" : cat === "poleras" ? "Poleras" : "Pósters";

        discountLines.push({
          label: `${label} (Promo 2x ${formatCLP(promoPrice)}) × ${pairs}`,
          amount: discount,
        });
      }
    });

    const totalPayable = Math.max(0, subtotal - totalDiscount);
    return { subtotal, totalDiscount, totalPayable, discountLines };
  }

  /**
   * Renderiza el carrito:
   * - Construye la lista desde state.cart
   * - Actualiza contador del badge
   * - Calcula subtotal, descuentos por promo y total final
   * - Muestra desglose de descuentos (si aplica)
   */
  function renderCart() {
    const items = state.cart
      .map((ci) => {
        const p = state.products.find((x) => x.id === ci.id);
        return p ? { ...p, qty: ci.qty } : null;
      })
      .filter(Boolean);

    // Badge de cantidad total
    const count = items.reduce((acc, it) => acc + it.qty, 0);
    cartCount.textContent = String(count);

    // Estado vacío
    if (items.length === 0) {
      cartEmpty.classList.remove("d-none");
      cartList.classList.add("d-none");
      cartList.innerHTML = "";

      cartSubtotal.textContent = formatCLP(0);
      cartDiscounts.innerHTML = `<span class="text-secondary">Sin descuentos aplicados</span>`;
      cartTotal.textContent = formatCLP(0);
      return;
    }

    // Estado con items
    cartEmpty.classList.add("d-none");
    cartList.classList.remove("d-none");

    // Lista de items (UI)
    cartList.innerHTML = items
      .map(
        (it) => `
          <li class="list-group-item d-flex justify-content-between align-items-start">
            <div class="me-2">
              <div class="fw-semibold">${it.title}</div>
              <div class="text-secondary small">${formatCLP(it.price)} • Cant: ${it.qty}</div>
            </div>

            <button class="btn btn-sm btn-outline-danger js-remove-one" type="button" data-id="${it.id}" aria-label="Quitar uno">
              <i class="bi bi-dash"></i>
            </button>
          </li>
        `
      )
      .join("");

    // Cálculo de promos + totales
    const { subtotal, totalPayable, discountLines } = computePromoTotals(items);

    // Subtotal (sin descuento)
    cartSubtotal.textContent = formatCLP(subtotal);

    // Descuentos (si aplica)
    if (discountLines.length === 0) {
      cartDiscounts.innerHTML = `<span class="text-secondary">Sin descuentos aplicados</span>`;
    } else {
      cartDiscounts.innerHTML = `
        <div class="text-success fw-semibold mb-1">Descuentos:</div>
        <ul class="list-unstyled mb-0">
          ${discountLines
            .map(
              (d) => `
                <li class="d-flex justify-content-between">
                  <span>${d.label}</span>
                  <span>- ${formatCLP(d.amount)}</span>
                </li>
              `
            )
            .join("")}
        </ul>
      `;
    }

    // Total final a pagar (con descuento)
    cartTotal.textContent = formatCLP(totalPayable);
  }

  // ====== Cart logic
  function addToCart(id) {
    const pid = Number(id);
    if (!Number.isFinite(pid)) return;

    const exists = state.cart.find((x) => x.id === pid);
    if (exists) exists.qty += 1;
    else state.cart.push({ id: pid, qty: 1 });

    renderCart();
  }

  function removeOneFromCart(id) {
    const pid = Number(id);
    const idx = state.cart.findIndex((x) => x.id === pid);
    if (idx === -1) return;

    state.cart[idx].qty -= 1;
    if (state.cart[idx].qty <= 0) state.cart.splice(idx, 1);

    renderCart();
  }

  /**
   * Vincula eventos principales:
   * - Delegación de eventos para botones creados dinámicamente ("Agregar" / "Quitar")
   * - Búsqueda con validación mínima
   * - Limpiar búsqueda
   * - Vaciar carrito
   */
  function bindEvents() {
    const productosSection = $("#productos");
    if (productosSection) {
      productosSection.addEventListener("click", (e) => {
        const btn = e.target.closest(".js-add-to-cart");
        if (!btn) return;
        addToCart(btn.getAttribute("data-id"));
      });
    }

    cartList.addEventListener("click", (e) => {
      const btn = e.target.closest(".js-remove-one");
      if (!btn) return;
      removeOneFromCart(btn.getAttribute("data-id"));
    });

    cartClear.addEventListener("click", () => {
      state.cart = [];
      renderCart();
    });

    searchForm.addEventListener("submit", (e) => {
      e.preventDefault();

      const q = (searchInput.value || "").trim().toLowerCase();

      // Validación simple
      if (q.length > 0 && q.length < 2) {
        showError("Ingresa al menos 2 caracteres para buscar.");
        return;
      }

      hideError();

      if (!q) {
        state.filtered = [...state.products];
      } else {
        state.filtered = state.products.filter((p) => {
          return (
            p.title.toLowerCase().includes(q) ||
            p.description.toLowerCase().includes(q) ||
            p.category.toLowerCase().includes(q)
          );
        });
      }

      renderProducts(state.filtered);
    });

    clearSearchBtn.addEventListener("click", () => {
      searchInput.value = "";
      hideError();
      state.filtered = [...state.products];
      renderProducts(state.filtered);
    });
  }

  /**
   * Carga los productos desde un archivo JSON usando Fetch API.
   * Incluye:
   * - Manejo de errores HTTP
   * - Validación básica de estructura
   * - Normalización del modelo
   * - Render inicial de productos y carrito
   */
  async function loadProducts() {
    hideError();

    try {
      const res = await fetch("./assets/data/productos.json", { cache: "no-store" });
      if (!res.ok) throw new Error(`Error HTTP ${res.status}`);

      const raw = await res.json();
      if (!Array.isArray(raw) || raw.length === 0) {
        throw new Error("El JSON no contiene productos válidos.");
      }

      const data = raw.map(normalizeProduct);

      // Validación de categorías esperadas
      const allowed = new Set(["figuras", "poleras", "posters"]);
      const bad = data.find((p) => !allowed.has(p.category));
      if (bad) {
        throw new Error(`Categoría inválida en producto id=${bad.id}. Usa: figuras | poleras | posters`);
      }

      state.products = data;
      state.filtered = [...data];

      renderProducts(state.filtered);
      renderCart();
    } catch (err) {
      console.error(err);
      showError("No se pudieron cargar los productos. Revisa la ruta ./assets/data/productos.json y el formato del JSON.");
    }
  }

  // ====== Init
  document.addEventListener("DOMContentLoaded", () => {
    bindEvents();
    loadProducts();
  });
})();