const express = require("express");
const path = require("path");
const { MongoClient } = require("mongodb");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;

const client = new MongoClient(process.env.MONGODB_URI);

let db;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

// Server status
app.get("/api/status", (req, res) => {
    res.json({
        success: true,
        message: "CampusBite server is running!",
        database: db ? "Connected" : "Not connected"
    });
});

// Place order
app.post("/api/orders", async (req, res) => {
    try {
        const {
            studentName,
            studentId,
            email,
            items,
            pickupSlot,
            totalAmount
        } = req.body;

        // Basic validation
        if (
            !studentName ||
            !studentId ||
            !email ||
            !items ||
            items.length === 0 ||
            !pickupSlot
        ) {
            return res.status(400).json({
                success: false,
                message: "Please provide all required order details."
            });
        }

        // Generate order ID
        const orderId =
            "CB-" +
            Date.now().toString().slice(-6);

        const order = {
            orderId,
            studentName,
            studentId,
            email,
            items,
            pickupSlot,
            totalAmount,
            status: "Pending",
            createdAt: new Date()
        };

        // Save order to MongoDB
        const result = await db.collection("orders").insertOne(order);

        res.status(201).json({
            success: true,
            message: "Order placed successfully!",
            orderId,
            databaseId: result.insertedId
        });

    } catch (error) {
        console.error("❌ Order error:", error);

        res.status(500).json({
            success: false,
            message: "Failed to place order."
        });
    }
});

// Connect MongoDB
async function connectDB() {
    try {
        await client.connect();

        db = client.db("campusbite");

        console.log("✅ MongoDB Atlas connected successfully!");
    } catch (error) {
        console.error("❌ MongoDB connection failed:", error.message);
        process.exit(1);
    }
}

// Start server
async function startServer() {
    await connectDB();

    app.listen(PORT, () => {
        console.log(
            `🚀 CampusBite running at http://localhost:${PORT}`
        );
    });
}

startServer();