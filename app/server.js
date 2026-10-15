const express = require("express");
const path = require("path");
const { MongoClient, ObjectId } = require("mongodb");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const clientMetrics = require("prom-client");
require("dotenv").config();

const metricsRegistry = new clientMetrics.Registry();
clientMetrics.collectDefaultMetrics({ register: metricsRegistry });

const httpRequests = new clientMetrics.Counter({
    name: "campusbite_http_requests_total",
    help: "Total HTTP requests handled by CampusBite",
    labelNames: ["method", "route", "status"],
    registers: [metricsRegistry]
});

const httpDuration = new clientMetrics.Histogram({
    name: "campusbite_http_request_duration_seconds",
    help: "HTTP request duration in seconds",
    labelNames: ["method", "route", "status"],
    buckets: [0.1, 0.3, 0.5, 1, 2, 5],
    registers: [metricsRegistry]
});

const app = express();
const PORT = process.env.PORT || 3000;

if (!process.env.MONGODB_URI || !process.env.JWT_SECRET) {
    console.error("MONGODB_URI and JWT_SECRET must be configured.");
    process.exit(1);
}

const client = new MongoClient(process.env.MONGODB_URI);
let db;

const menu = [
    { id: "CB01", name: "Classic Veg Burger", category: "Burgers", price: 70, image: "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=900&q=85", emoji: "\u{1F354}", description: "Crispy patty with fresh vegetables" },
    { id: "CB02", name: "Paneer Wrap", category: "Wraps", price: 90, image: "https://images.unsplash.com/photo-1626700051175-6818013e1d4f?auto=format&fit=crop&w=900&q=85", emoji: "\u{1F32F}", description: "Spiced paneer wrapped in a soft tortilla" },
    { id: "CB03", name: "Masala Dosa", category: "South Indian", price: 80, image: "https://images.unsplash.com/photo-1589301760014-d929f3979dbc?auto=format&fit=crop&w=900&q=85", emoji: "\u{1F95E}", description: "Golden dosa served with chutney" },
    { id: "CB04", name: "Veg Sandwich", category: "Sandwiches", price: 60, image: "https://images.unsplash.com/photo-1528735602780-2552fd46c7af?auto=format&fit=crop&w=900&q=85", emoji: "\u{1F96A}", description: "Toasted sandwich with fresh vegetables" },
    { id: "CB05", name: "French Fries", category: "Snacks", price: 50, image: "https://images.unsplash.com/photo-1573080496219-bb080dd4f877?auto=format&fit=crop&w=900&q=85", emoji: "\u{1F35F}", description: "Golden, crispy potato fries" },
    { id: "CB06", name: "Cold Coffee", category: "Drinks", price: 65, image: "https://images.unsplash.com/photo-1461023058943-07fcbe16d735?auto=format&fit=crop&w=900&q=85", emoji: "\u{1F964}", description: "Chilled coffee with creamy milk" },
    { id: "CB07", name: "Veg Hakka Noodles", category: "Meals", price: 100, image: "https://images.unsplash.com/photo-1569718212165-3a8278d5f624?auto=format&fit=crop&w=900&q=85", emoji: "\u{1F35C}", description: "Stir-fried noodles with vegetables" },
    { id: "CB08", name: "Fresh Fruit Bowl", category: "Healthy", price: 75, image: "https://images.unsplash.com/photo-1490474418585-ba9bad8fd0ea?auto=format&fit=crop&w=900&q=85", emoji: "\u{1F34C}", description: "Seasonal fresh fruit selection" }
];

const orderStatuses = [
    "Pending",
    "Accepted",
    "Rejected",
    "Preparing",
    "Ready",
    "Completed"
];

app.disable("x-powered-by");
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            imgSrc: ["'self'", "data:", "https://images.unsplash.com"]
        }
    }
}));
app.use(express.json({ limit: "100kb" }));
app.use(express.urlencoded({ extended: false }));

app.use((req, res, next) => {
    if (req.path === "/metrics") return next();

    const start = process.hrtime.bigint();
    res.on("finish", () => {
        const route = req.route?.path
            ? `${req.baseUrl || ""}${req.route.path}`
            : "unmatched";
        const labels = {
            method: req.method,
            route,
            status: String(res.statusCode)
        };
        httpRequests.inc(labels);
        httpDuration.observe(
            labels,
            Number(process.hrtime.bigint() - start) / 1e9
        );
    });
    next();
});

app.use("/api/auth", rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 30,
    standardHeaders: true,
    legacyHeaders: false
}));

app.use(express.static(path.join(__dirname, "public")));

function signToken(user) {
    return jwt.sign(
        {
            sub: user._id.toString(),
            role: user.role,
            email: user.email
        },
        process.env.JWT_SECRET,
        { expiresIn: "8h", issuer: "campusbite" }
    );
}

function authenticate(req, res, next) {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ")
        ? header.slice(7)
        : "";

    if (!token) {
        return res.status(401).json({
            success: false,
            message: "Please log in first."
        });
    }

    try {
        req.auth = jwt.verify(token, process.env.JWT_SECRET, {
            issuer: "campusbite"
        });
        next();
    } catch {
        return res.status(401).json({
            success: false,
            message: "Your session has expired. Please log in again."
        });
    }
}

function requireAdmin(req, res, next) {
    if (req.auth.role !== "admin") {
        return res.status(403).json({
            success: false,
            message: "Administrator access is required."
        });
    }
    next();
}

function validEmail(email) {
    return typeof email === "string" &&
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) &&
        email.length <= 254;
}

function publicUser(user) {
    return {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        role: user.role,
        studentId: user.studentId || ""
    };
}

// Prometheus metrics endpoint
app.get("/metrics", async (req, res) => {
    res.set("Content-Type", metricsRegistry.contentType);
    res.end(await metricsRegistry.metrics());
});

// Health check
app.get("/api/status", (req, res) => {
    res.json({
        success: true,
        message: "CampusBite API is running",
        database: db ? "Connected" : "Disconnected"
    });
});

// Public menu
app.get("/api/menu", (req, res) => {
    res.json({ success: true, items: menu });
});

// Register a customer
app.post("/api/auth/register", async (req, res) => {
    try {
        const name = String(req.body.name || "").trim();
        const email = String(req.body.email || "").trim().toLowerCase();
        const password = req.body.password;
        const studentId = String(req.body.studentId || "").trim();

        if (name.length < 2 || name.length > 80) {
            return res.status(400).json({
                success: false,
                message: "Name must contain 2-80 characters."
            });
        }

        if (!validEmail(email)) {
            return res.status(400).json({
                success: false,
                message: "Enter a valid email address."
            });
        }

        if (typeof password !== "string" ||
            password.length < 10 ||
            password.length > 72) {
            return res.status(400).json({
                success: false,
                message: "Password must contain 10-72 characters."
            });
        }

        const existing = await db.collection("users").findOne({ email });

        if (existing) {
            return res.status(409).json({
                success: false,
                message: "An account with this email already exists."
            });
        }

        const user = {
            name,
            email,
            studentId,
            passwordHash: await bcrypt.hash(password, 12),
            role: "customer",
            createdAt: new Date()
        };

        const result = await db.collection("users").insertOne(user);
        user._id = result.insertedId;

        res.status(201).json({
            success: true,
            message: "Account created successfully.",
            token: signToken(user),
            user: publicUser(user)
        });
    } catch (error) {
        if (error.code === 11000) {
            return res.status(409).json({
                success: false,
                message: "This email is already registered."
            });
        }

        console.error("Registration error:", error.message);
        res.status(500).json({
            success: false,
            message: "Unable to create account."
        });
    }
});

// Login: customer or administrator
app.post("/api/auth/login", async (req, res) => {
    try {
        const email = String(req.body.email || "").trim().toLowerCase();
        const password = req.body.password;

        if (!validEmail(email) ||
            typeof password !== "string" ||
            password.length > 72) {
            return res.status(400).json({
                success: false,
                message: "Enter valid login details."
            });
        }

        const user = await db.collection("users").findOne({ email });

        if (!user ||
            !await bcrypt.compare(password, user.passwordHash)) {
            return res.status(401).json({
                success: false,
                message: "Incorrect email or password."
            });
        }

        res.json({
            success: true,
            token: signToken(user),
            user: publicUser(user)
        });
    } catch (error) {
        console.error("Login error:", error.message);
        res.status(500).json({
            success: false,
            message: "Unable to log in."
        });
    }
});

// Current account
app.get("/api/auth/me", authenticate, async (req, res) => {
    const user = await db.collection("users").findOne(
        { _id: new ObjectId(req.auth.sub) },
        { projection: { passwordHash: 0 } }
    );

    if (!user) {
        return res.status(404).json({
            success: false,
            message: "Account not found."
        });
    }

    res.json({ success: true, user: publicUser(user) });
});

// Customer: create an order
app.post("/api/orders", authenticate, async (req, res) => {
    try {
        if (req.auth.role !== "customer") {
            return res.status(403).json({
                success: false,
                message: "Only customer accounts can place orders."
            });
        }

        const items = req.body.items;
        const pickupPreference = String(req.body.pickupPreference || "");

        if (!Array.isArray(items) || items.length === 0 || items.length > 20) {
            return res.status(400).json({
                success: false,
                message: "Select between 1 and 20 menu items."
            });
        }

        const counts = new Map();

        for (const item of items) {
            const id = String(item.id || "");
            const quantity = Number(item.quantity);

            if (!Number.isInteger(quantity) || quantity < 1 || quantity > 20 ||
                !menu.some(food => food.id === id)) {
                return res.status(400).json({
                    success: false,
                    message: "One or more menu items are invalid."
                });
            }

            counts.set(id, (counts.get(id) || 0) + quantity);
        }

        const orderItems = [...counts.entries()].map(([id, quantity]) => {
            const food = menu.find(item => item.id === id);
            return {
                itemId: food.id,
                name: food.name,
                price: food.price,
                quantity
            };
        });

        const totalAmount = orderItems.reduce(
            (sum, item) => sum + item.price * item.quantity, 0
        );

        const user = await db.collection("users").findOne({
            _id: new ObjectId(req.auth.sub),
            role: "customer"
        });

        if (!user) {
            return res.status(401).json({
                success: false,
                message: "Customer account not found."
            });
        }

        const order = {
            orderId: "CB-" + new ObjectId().toString().slice(-8).toUpperCase(),
            userId: user._id,
            customerName: user.name,
            customerEmail: user.email,
            studentId: user.studentId || "",
            items: orderItems,
            totalAmount,
            status: "Pending",
            pickupPreference:
                ["ASAP", "12:00-12:15", "12:15-12:30", "12:30-12:45"]
                    .includes(pickupPreference) ? pickupPreference : "ASAP",
            pickupSlot: null,
            payment: {
                status: "NotRequested",
                method: null,
                transactionReference: null,
                requestedAt: null,
                verifiedAt: null
            },
            createdAt: new Date(),
            updatedAt: new Date()
        };

        await db.collection("orders").insertOne(order);

        res.status(201).json({
            success: true,
            message: "Order submitted. Awaiting canteen approval.",
            order: {
                orderId: order.orderId,
                items: order.items,
                totalAmount: order.totalAmount,
                status: order.status,
                createdAt: order.createdAt
            }
        });
    } catch (error) {
        console.error("Order error:", error.message);
        res.status(500).json({
            success: false,
            message: "Unable to submit order."
        });
    }
});

// Customer: order history
app.get("/api/orders/mine", authenticate, async (req, res) => {
    if (req.auth.role !== "customer") {
        return res.status(403).json({ success: false, message: "Customers only." });
    }

    const orders = await db.collection("orders")
        .find({ userId: new ObjectId(req.auth.sub) })
        .sort({ createdAt: -1 })
        .limit(100)
        .toArray();

    res.json({ success: true, orders });
});

// Customer: recommendations based on previous purchases
app.get("/api/recommendations", authenticate, async (req, res) => {
    if (req.auth.role !== "customer") {
        return res.status(403).json({ success: false, message: "Customers only." });
    }

    const orders = await db.collection("orders")
        .find({
            userId: new ObjectId(req.auth.sub),
            status: { $ne: "Rejected" }
        })
        .project({ items: 1 })
        .toArray();

    const frequency = {};

    for (const order of orders) {
        for (const item of order.items || []) {
            frequency[item.itemId] =
                (frequency[item.itemId] || 0) + item.quantity;
        }
    }

    const recommendations = [...menu].sort((a, b) =>
        (frequency[b.id] || 0) - (frequency[a.id] || 0) ||
        a.name.localeCompare(b.name)
    ).slice(0, 4);

    res.json({
        success: true,
        basedOnPreviousOrders: orders.length > 0,
        items: recommendations
    });
});

// Admin: see all orders
app.get("/api/admin/orders", authenticate, requireAdmin, async (req, res) => {
    const orders = await db.collection("orders")
        .find({})
        .sort({ createdAt: -1 })
        .limit(300)
        .toArray();

    res.json({ success: true, orders });
});

// Admin: accept/reject, set pickup time, or update progress
app.patch("/api/admin/orders/:id", authenticate, requireAdmin, async (req, res) => {
    try {
        const id = String(req.params.id);
        const status = String(req.body.status || "");
        const pickupSlot = String(req.body.pickupSlot || "");

        if (!ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, message: "Invalid order ID." });
        }

        const allowedSlots = [
            "12:00-12:15",
            "12:15-12:30",
            "12:30-12:45",
            "12:45-13:00",
            "13:00-13:15"
        ];

        if (!orderStatuses.includes(status)) {
            return res.status(400).json({ success: false, message: "Invalid status." });
        }

        if (status === "Accepted" &&
            !allowedSlots.includes(pickupSlot)) {
            return res.status(400).json({
                success: false,
                message: "Select a valid pickup slot before accepting."
            });
        }

        const order = await db.collection("orders").findOne({
            _id: new ObjectId(id)
        });

        if (!order) {
            return res.status(404).json({ success: false, message: "Order not found." });
        }

        if (order.status === "Rejected" || order.status === "Completed") {
            return res.status(409).json({
                success: false,
                message: "This order is already closed."
            });
        }

        if (status === "Preparing" &&
            !["Accepted", "Preparing"].includes(order.status)) {
            return res.status(409).json({
                success: false,
                message: "Accept the order before preparing it."
            });
        }

        if (status === "Ready" &&
            !["Accepted", "Preparing", "Ready"].includes(order.status)) {
            return res.status(409).json({
                success: false,
                message: "The order must be accepted before it can be ready."
            });
        }

        if (status === "Completed" &&
            (order.status !== "Ready" || order.payment.status !== "Verified")) {
            return res.status(409).json({
                success: false,
                message: "Mark the order ready and verify payment before completing it."
            });
        }

        const update = {
            status,
            updatedAt: new Date()
        };

        if (status === "Accepted") {
            update.pickupSlot = pickupSlot;
        }

        if (status === "Rejected") {
            update.rejectionReason =
                String(req.body.reason || "Not available").slice(0, 200);
        }

        if (status === "Ready") {
            update.readyAt = new Date();
        }

        await db.collection("orders").updateOne(
            { _id: order._id },
            { $set: update }
        );

        res.json({ success: true, message: "Order updated." });
    } catch (error) {
        console.error("Admin order update:", error.message);
        res.status(500).json({ success: false, message: "Unable to update order." });
    }
});

// Admin: request payment for an accepted order
 // Admin: update the pickup slot without changing the order status.
app.patch("/api/admin/orders/:id/pickup", authenticate, requireAdmin, async (req, res) => {
    try {
        if (!ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ success: false, message: "Invalid order ID." });
        }

        const pickupSlot = String(req.body.pickupSlot || "");
        const allowedSlots = [
            "12:00-12:15",
            "12:15-12:30",
            "12:30-12:45",
            "12:45-13:00",
            "13:00-13:15"
        ];

        if (!allowedSlots.includes(pickupSlot)) {
            return res.status(400).json({ success: false, message: "Choose a valid pickup slot." });
        }

        const result = await db.collection("orders").updateOne(
            {
                _id: new ObjectId(req.params.id),
                status: { $in: ["Accepted", "Preparing", "Ready"] }
            },
            { $set: { pickupSlot, updatedAt: new Date() } }
        );

        if (!result.matchedCount) {
            return res.status(409).json({
                success: false,
                message: "Pickup time can only be updated for accepted, preparing, or ready orders."
            });
        }

        res.json({ success: true, message: "Pickup slot updated." });
    } catch (error) {
        console.error("Pickup slot update error:", error.message);
        res.status(500).json({ success: false, message: "Unable to update pickup slot." });
    }
});
app.post("/api/admin/orders/:id/payment-request", authenticate, requireAdmin, async (req, res) => {
    try {
        if (!ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ success: false, message: "Invalid order ID." });
        }

        const result = await db.collection("orders").updateOne(
            {
                _id: new ObjectId(req.params.id),
                status: { $in: ["Accepted", "Preparing", "Ready"] },
                "payment.status": { $in: ["NotRequested", "Rejected"] }
            },
            {
                $set: {
                    "payment.status": "Requested",
                    "payment.requestedAt": new Date(),
                    updatedAt: new Date()
                }
            }
        );

        if (!result.modifiedCount) {
            return res.status(409).json({
                success: false,
                message: "Payment cannot be requested for this order right now."
            });
        }

        res.json({ success: true, message: "Payment requested." });
    } catch (error) {
        console.error("Payment request error:", error.message);
        res.status(500).json({ success: false, message: "Unable to request payment." });
    }
});

// Customer: submit payment information for manual verification
app.post("/api/orders/:id/payment", authenticate, async (req, res) => {
    try {
        if (req.auth.role !== "customer" || !ObjectId.isValid(req.params.id)) {
            return res.status(403).json({ success: false, message: "Invalid request." });
        }

        const method = String(req.body.method || "");
        const reference = String(req.body.transactionReference || "").trim();

        if (!["UPI", "Cash"].includes(method)) {
            return res.status(400).json({ success: false, message: "Choose UPI or Cash." });
        }

        if (method === "UPI" && (reference.length < 6 || reference.length > 100)) {
            return res.status(400).json({
                success: false,
                message: "Enter a valid transaction reference."
            });
        }

        const order = await db.collection("orders").findOne({
            _id: new ObjectId(req.params.id),
            userId: new ObjectId(req.auth.sub),
            "payment.status": "Requested"
        });

        if (!order) {
            return res.status(404).json({
                success: false,
                message: "Order not found or payment has not been requested."
            });
        }

        await db.collection("orders").updateOne(
            { _id: order._id },
            {
                $set: {
                    "payment.status": "Submitted",
                    "payment.method": method,
                    "payment.transactionReference": method === "UPI" ? reference : null,
                    "payment.submittedAt": new Date(),
                    updatedAt: new Date()
                }
            }
        );

        res.json({
            success: true,
            message: "Payment details submitted for canteen verification."
        });
    } catch (error) {
        console.error("Payment submission error:", error.message);
        res.status(500).json({ success: false, message: "Unable to submit payment." });
    }
});

// Admin: verify or reject a payment submission
app.patch("/api/admin/orders/:id/payment", authenticate, requireAdmin, async (req, res) => {
    try {
        if (!ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ success: false, message: "Invalid order ID." });
        }

        const decision = String(req.body.decision || "");

        if (!["Verified", "Rejected"].includes(decision)) {
            return res.status(400).json({
                success: false,
                message: "Decision must be Verified or Rejected."
            });
        }

        const result = await db.collection("orders").updateOne(
            {
                _id: new ObjectId(req.params.id),
                "payment.status": "Submitted"
            },
            {
                $set: {
                    "payment.status": decision,
                    "payment.verifiedAt": decision === "Verified" ? new Date() : null,
                    updatedAt: new Date()
                }
            }
        );

        if (!result.modifiedCount) {
            return res.status(409).json({
                success: false,
                message: "No submitted payment was found for verification."
            });
        }

        res.json({ success: true, message: `Payment ${decision.toLowerCase()}.` });
    } catch (error) {
        console.error("Payment verification error:", error.message);
        res.status(500).json({ success: false, message: "Unable to update payment." });
    }
});

// API fallback
app.use("/api", (req, res) => {
    res.status(404).json({ success: false, message: "API endpoint not found." });
});

async function startServer() {
    await client.connect();
    const databaseName = process.env.MONGODB_DATABASE || "campusbite";
    db = client.db(databaseName);

    await db.collection("users").createIndex({ email: 1 }, { unique: true });
    await db.collection("orders").createIndex({ userId: 1, createdAt: -1 });
    await db.collection("orders").createIndex({ status: 1, createdAt: -1 });

    // Configure owner and manager admin accounts from environment variables.
    const admins = [
        {
            name: "CampusBite Owner",
            email: String(process.env.ADMIN_EMAIL || "").trim().toLowerCase(),
            password: process.env.ADMIN_PASSWORD || ""
        },
        {
            name: "CampusBite Manager",
            email: String(process.env.MANAGER_ADMIN_EMAIL || "").trim().toLowerCase(),
            password: process.env.MANAGER_ADMIN_PASSWORD || ""
        }
    ];

    if (admins.some(admin => !admin.email || !admin.password)) {
        throw new Error(
            "Both admin accounts are required. Configure ADMIN_EMAIL, ADMIN_PASSWORD, MANAGER_ADMIN_EMAIL, and MANAGER_ADMIN_PASSWORD."
        );
    }

    for (const admin of admins) {
        if (!validEmail(admin.email) || admin.password.length < 12 || admin.password.length > 72) {
            throw new Error("Each admin needs a valid email and a password between 12 and 72 characters.");
        }
    }

    if (new Set(admins.map(admin => admin.email)).size !== admins.length) {
        throw new Error("Owner and manager admin emails must be different.");
    }

    for (const admin of admins) {
        await db.collection("users").updateOne(
            { email: admin.email },
            {
                $set: {
                    name: admin.name,
                    role: "admin",
                    passwordHash: await bcrypt.hash(admin.password, 12)
                },
                $setOnInsert: {
                    email: admin.email,
                    studentId: "",
                    createdAt: new Date()
                }
            },
            { upsert: true }
        );
    }

    console.log("Owner and manager admin accounts configured.");
    app.listen(PORT, "0.0.0.0", () => {
        console.log(`CampusBite running on port ${PORT}`);
        console.log("MongoDB Atlas connected.");
    });
}

startServer().catch(error => {
    console.error("Startup failed:", error.message);
    process.exit(1);
});
