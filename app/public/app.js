const API = "/api";
let token = localStorage.getItem("campusbite_token") || "";
let currentUser = null;
let menuItems = [];
let cart = [];

const $ = (selector) => document.querySelector(selector);

async function api(url, options = {}) {
    const headers = { ...(options.headers || {}) };

    if (token) headers.Authorization = `Bearer ${token}`;
    if (options.body) headers["Content-Type"] = "application/json";

    const response = await fetch(API + url, { ...options, headers });
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
        throw new Error(data.message || "Something went wrong.");
    }

    return data;
}

function notify(message) {
    const element = $("#toast");
    if (!element) {
        alert(message);
        return;
    }

    element.textContent = message;
    element.classList.add("show");
    setTimeout(() => element.classList.remove("show"), 3200);
}

function money(value) {
    return "₹" + Number(value).toFixed(2);
}

function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[character]);
}

function showSection(id) {
    document.querySelectorAll(".page-section").forEach(section => {
        section.hidden = section.id !== id;
    });

    window.scrollTo({ top: 0, behavior: "smooth" });
}

function saveToken(value) {
    token = value;
    localStorage.setItem("campusbite_token", value);
}

function logout() {
    token = "";
    currentUser = null;
    localStorage.removeItem("campusbite_token");
    updateNavigation();
    showSection("home");
    notify("You have been logged out.");
}

function updateNavigation() {
    const authLinks = $("#auth-links");
    const accountLinks = $("#account-links");

    if (currentUser) {
        authLinks.hidden = true;
        accountLinks.hidden = false;
        $("#welcome-user").textContent = `Hi, ${currentUser.name}`;

        $("#admin-nav").hidden = currentUser.role !== "admin";
        $("#customer-nav").hidden = currentUser.role !== "customer";
    } else {
        authLinks.hidden = false;
        accountLinks.hidden = true;
        $("#admin-nav").hidden = true;
        $("#customer-nav").hidden = true;
    }
}

function renderMenu(items, container = "#menu-grid") {
    const grid = $(container);
    if (!grid) return;

    if (!items.length) {
        grid.innerHTML = "<p>No items found.</p>";
        return;
    }

    grid.innerHTML = items.map(item => `
        <article class="food-card">
            <div class="food-emoji">${escapeHTML(item.emoji)}</div>
            <div class="food-card-body">
                <span class="food-category">${escapeHTML(item.category)}</span>
                <h3>${escapeHTML(item.name)}</h3>
                <p>${escapeHTML(item.description)}</p>
                <div class="food-card-footer">
                    <strong>${money(item.price)}</strong>
                    <button class="btn btn-primary add-item"
                        data-id="${escapeHTML(item.id)}">Add +</button>
                </div>
            </div>
        </article>
    `).join("");
}

async function loadMenu() {
    const data = await api("/menu");
    menuItems = data.items;
    renderMenu(menuItems);
}

function renderCart() {
    const container = $("#cart-items");
    if (!container) return;

    container.innerHTML = cart.length ? cart.map(item => `
        <div class="cart-row">
            <div>
                <strong>${escapeHTML(item.name)}</strong>
                <small>${money(item.price)} each</small>
            </div>
            <div class="quantity-control">
                <button data-action="decrease" data-id="${item.id}">−</button>
                <span>${item.quantity}</span>
                <button data-action="increase" data-id="${item.id}">+</button>
            </div>
            <strong>${money(item.price * item.quantity)}</strong>
        </div>
    `).join("") : "<p>Your cart is empty. Add something delicious!</p>";

    const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
    $("#cart-total").textContent = money(total);
    $("#cart-count").textContent = cart.reduce((sum, item) => sum + item.quantity, 0);
}

function addToCart(id) {
    const food = menuItems.find(item => item.id === id);
    if (!food) return;

    const existing = cart.find(item => item.id === id);

    if (existing) {
        if (existing.quantity >= 20) return notify("Maximum quantity is 20.");
        existing.quantity++;
    } else {
        cart.push({ ...food, quantity: 1 });
    }

    renderCart();
    notify(`${food.name} added to cart.`);
}

function changeQuantity(id, amount) {
    const item = cart.find(food => food.id === id);
    if (!item) return;

    item.quantity += amount;
    if (item.quantity <= 0) cart = cart.filter(food => food.id !== id);

    renderCart();
}

function statusBadge(status) {
    const safe = escapeHTML(status);
    return `<span class="status-badge status-${String(status).toLowerCase()}">${safe}</span>`;
}

function orderCard(order, admin = false) {
    const itemList = (order.items || []).map(item =>
        `${escapeHTML(item.name)} × ${item.quantity}`
    ).join(", ");

    return `
      <article class="order-card">
        <div class="order-card-heading">
          <div>
            <span class="eyebrow">${escapeHTML(order.orderId || "Order")}</span>
            <h3>${admin ? escapeHTML(order.customerName) : "Your order"}</h3>
          </div>
          ${statusBadge(order.status)}
        </div>
        ${admin ? `<p>${escapeHTML(order.customerEmail || "")}</p>` : ""}
        <p>${itemList}</p>
        <p><strong>Total: ${money(order.totalAmount)}</strong></p>
        <p>Pickup: ${escapeHTML(order.pickupSlot || order.pickupPreference || "Awaiting assignment")}</p>
        <p>Payment: ${statusBadge(order.payment?.status || "NotRequested")}</p>
        <small>${order.createdAt ? new Date(order.createdAt).toLocaleString() : ""}</small>
        ${admin ? adminOrderControls(order) : customerOrderControls(order)}
      </article>
    `;
}

function customerOrderControls(order) {
    const id = escapeHTML(order._id);

    if (order.payment?.status === "Requested") {
        return `
          <button class="btn btn-primary pay-order" data-id="${id}">
            Submit payment details
          </button>
        `;
    }

    return "";
}

function adminOrderControls(order) {
    const id = escapeHTML(order._id);
    const isOpen = !["Rejected", "Completed"].includes(order.status);

    return `
      <div class="admin-controls">
        ${order.status === "Pending" ? `
          <select id="slot-${id}" aria-label="Pickup slot">
            <option value="">Choose pickup slot</option>
            <option value="12:00-12:15">12:00–12:15</option>
            <option value="12:15-12:30">12:15–12:30</option>
            <option value="12:30-12:45">12:30–12:45</option>
            <option value="12:45-13:00">12:45–13:00</option>
            <option value="13:00-13:15">13:00–13:15</option>
          </select>
          <button class="btn btn-primary accept-order" data-id="${id}">Accept</button>
          <button class="btn btn-danger reject-order" data-id="${id}">Reject</button>
        ` : ""}

        ${["Accepted", "Preparing"].includes(order.status) ? `
          <button class="btn btn-primary prepare-order" data-id="${id}">Mark preparing</button>
          <button class="btn btn-primary ready-order" data-id="${id}">Mark ready</button>
        ` : ""}

        ${order.status === "Accepted" && order.payment?.status === "NotRequested" ||
          order.status === "Preparing" && order.payment?.status === "NotRequested" ||
          order.status === "Ready" && order.payment?.status === "NotRequested" ? `
          <button class="btn btn-secondary request-payment" data-id="${id}">Request payment</button>
        ` : ""}

        ${order.payment?.status === "Submitted" ? `
          <button class="btn btn-primary verify-payment" data-id="${id}">Verify payment</button>
          <button class="btn btn-danger reject-payment" data-id="${id}">Reject payment</button>
        ` : ""}

        ${order.status === "Ready" && order.payment?.status === "Verified" ? `
          <button class="btn btn-primary complete-order" data-id="${id}">Complete pickup</button>
        ` : ""}

        ${!isOpen ? "<p>This order is closed.</p>" : ""}
      </div>
    `;
}

async function loadHistory() {
    const data = await api("/orders/mine");
    $("#history-list").innerHTML = data.orders.length
        ? data.orders.map(order => orderCard(order)).join("")
        : "<p>Your order history will appear here.</p>";
}

async function loadRecommendations() {
    const data = await api("/recommendations");

    $("#recommendation-note").textContent = data.basedOnPreviousOrders
        ? "Selected using your previous orders."
        : "Popular picks to get you started.";

    renderMenu(data.items, "#recommendation-grid");
}

async function loadAdminOrders() {
    const data = await api("/admin/orders");

    $("#admin-orders").innerHTML = data.orders.length
        ? data.orders.map(order => orderCard(order, true)).join("")
        : "<p>No orders have been placed yet.</p>";
}

async function refreshAccount() {
    if (!token) return;

    try {
        const data = await api("/auth/me");
        currentUser = data.user;
        updateNavigation();

        if (currentUser.role === "customer") {
            await Promise.all([loadHistory(), loadRecommendations()]);
        }
    } catch {
        token = "";
        currentUser = null;
        localStorage.removeItem("campusbite_token");
        updateNavigation();
    }
}

$("#menu-grid").addEventListener("click", event => {
    const button = event.target.closest(".add-item");
    if (button) addToCart(button.dataset.id);
});

$("#recommendation-grid").addEventListener("click", event => {
    const button = event.target.closest(".add-item");
    if (button) addToCart(button.dataset.id);
});

$("#cart-items").addEventListener("click", event => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;

    changeQuantity(
        button.dataset.id,
        button.dataset.action === "increase" ? 1 : -1
    );
});

$("#register-form").addEventListener("submit", async event => {
    event.preventDefault();

    const form = new FormData(event.target);

    try {
        const data = await api("/auth/register", {
            method: "POST",
            body: JSON.stringify({
                name: form.get("name"),
                email: form.get("email"),
                studentId: form.get("studentId"),
                password: form.get("password")
            })
        });

        saveToken(data.token);
        currentUser = data.user;
        updateNavigation();
        await refreshAccount();
        showSection("customer-dashboard");
        notify("Welcome to CampusBite!");
    } catch (error) {
        notify(error.message);
    }
});

$("#login-form").addEventListener("submit", async event => {
    event.preventDefault();

    const form = new FormData(event.target);

    try {
        const data = await api("/auth/login", {
            method: "POST",
            body: JSON.stringify({
                email: form.get("email"),
                password: form.get("password")
            })
        });

        saveToken(data.token);
        currentUser = data.user;
        updateNavigation();

        if (currentUser.role === "admin") {
            await loadAdminOrders();
            showSection("admin-dashboard");
        } else {
            await refreshAccount();
            showSection("customer-dashboard");
        }

        notify("Login successful.");
    } catch (error) {
        notify(error.message);
    }
});

$("#checkout-form").addEventListener("submit", async event => {
    event.preventDefault();

    if (!currentUser || currentUser.role !== "customer") {
        showSection("login");
        return notify("Please log in as a customer before ordering.");
    }

    if (!cart.length) return notify("Your cart is empty.");

    try {
        const data = await api("/orders", {
            method: "POST",
            body: JSON.stringify({
                items: cart.map(item => ({
                    id: item.id,
                    quantity: item.quantity
                })),
                pickupPreference: $("#pickup-preference").value
            })
        });

        cart = [];
        renderCart();
        await loadHistory();
        showSection("customer-dashboard");
        notify(`Order submitted: ${data.order.orderId}`);
    } catch (error) {
        notify(error.message);
    }
});

$("#history-list").addEventListener("click", event => {
    const button = event.target.closest(".pay-order");
    if (!button) return;

    $("#payment-order-id").value = button.dataset.id;
    showSection("payment-page");
});

$("#payment-form").addEventListener("submit", async event => {
    event.preventDefault();

    const form = new FormData(event.target);
    const id = form.get("orderId");

    try {
        const data = await api(`/orders/${encodeURIComponent(id)}/payment`, {
            method: "POST",
            body: JSON.stringify({
                method: form.get("method"),
                transactionReference: form.get("transactionReference")
            })
        });

        notify(data.message);
        event.target.reset();
        await loadHistory();
        showSection("customer-dashboard");
    } catch (error) {
        notify(error.message);
    }
});

$("#admin-orders").addEventListener("click", async event => {
    const button = event.target.closest("button[data-id]");
    if (!button) return;

    const id = button.dataset.id;
    const classes = button.classList;

    try {
        let data;

        if (classes.contains("accept-order")) {
            const pickupSlot = $(`#slot-${CSS.escape(id)}`).value;
            if (!pickupSlot) return notify("Choose a pickup slot first.");

            data = await api(`/admin/orders/${id}`, {
                method: "PATCH",
                body: JSON.stringify({ status: "Accepted", pickupSlot })
            });
        } else if (classes.contains("reject-order")) {
            const reason = prompt("Reason for rejection:");
            if (reason === null) return;

            data = await api(`/admin/orders/${id}`, {
                method: "PATCH",
                body: JSON.stringify({ status: "Rejected", reason })
            });
        } else if (classes.contains("prepare-order")) {
            data = await api(`/admin/orders/${id}`, {
                method: "PATCH",
                body: JSON.stringify({ status: "Preparing" })
            });
        } else if (classes.contains("ready-order")) {
            data = await api(`/admin/orders/${id}`, {
                method: "PATCH",
                body: JSON.stringify({ status: "Ready" })
            });
        } else if (classes.contains("complete-order")) {
            data = await api(`/admin/orders/${id}`, {
                method: "PATCH",
                body: JSON.stringify({ status: "Completed" })
            });
        } else if (classes.contains("request-payment")) {
            data = await api(`/admin/orders/${id}/payment-request`, {
                method: "POST",
                body: JSON.stringify({})
            });
        } else if (classes.contains("verify-payment")) {
            if (!confirm("Confirm you have checked the payment?")) return;

            data = await api(`/admin/orders/${id}/payment`, {
                method: "PATCH",
                body: JSON.stringify({ decision: "Verified" })
            });
        } else if (classes.contains("reject-payment")) {
            data = await api(`/admin/orders/${id}/payment`, {
                method: "PATCH",
                body: JSON.stringify({ decision: "Rejected" })
            });
        }

        if (data) notify(data.message);
        await loadAdminOrders();
    } catch (error) {
        notify(error.message);
    }
});

document.querySelectorAll("[data-page]").forEach(button => {
    button.addEventListener("click", async () => {
        const page = button.dataset.page;

        if (page === "customer-dashboard" || page === "admin-dashboard") {
            if (!currentUser) {
                showSection("login");
                return notify("Please log in first.");
            }

            if (page === "admin-dashboard" && currentUser.role !== "admin") {
                return notify("Administrator access required.");
            }

            if (page === "customer-dashboard" && currentUser.role !== "customer") {
                return notify("Customer access required.");
            }

            if (page === "admin-dashboard") await loadAdminOrders();
            else await refreshAccount();
        }

        showSection(page);
    });
});

$("#logout-button").addEventListener("click", logout);

$("#search-menu").addEventListener("input", event => {
    const query = event.target.value.toLowerCase();

    renderMenu(menuItems.filter(item =>
        item.name.toLowerCase().includes(query) ||
        item.category.toLowerCase().includes(query)
    ));
});

async function init() {
    try {
        await loadMenu();
        renderCart();
        updateNavigation();
        await refreshAccount();
    } catch (error) {
        notify("Could not load the menu. Check the server connection.");
        console.error(error);
    }

    showSection("home");
}

init();