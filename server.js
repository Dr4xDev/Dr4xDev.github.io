require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware setup
app.use(express.json());
app.use(cors());
app.use(express.static(path.join(__dirname, 'public'))); // Serve static files (HTML, CSS, JS)

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
  .then(() => console.log("Connected to MongoDB"))
  .catch((error) => console.error("MongoDB connection error:", error));

// Define Schema
const KeySchema = new mongoose.Schema({
  key: String,
  used: { type: Boolean, default: false },
  claimedByClientId: { type: String, default: null },  // Optional field (null until claimed)
  expiresAt: Date,
});

const Key = mongoose.model("Key", KeySchema);

// Root Route - Serves the index.html page
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Generate a New 24-Hour Key (No HWID needed)
app.post("/generate-key", async (req, res) => {
  try {
    // Generate and store a new 24-hour key
    const newKey = new Key({
      key: generateRandomKey(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // Expire in 24 hours
    });

    await newKey.save();
    res.json({ key: newKey.key });
  } catch (error) {
    console.error("Error generating key:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Claim a Key (Link HWID when claiming)
app.post("/claim-key", async (req, res) => {
  try {
    const { key, clientId } = req.body; // Expecting the key and HWID (clientId) on claim

    if (!key || !clientId) {
      return res.status(400).json({ error: "Key and Client ID are required." });
    }

    // Find the key by its value
    const keyDoc = await Key.findOne({ key });

    if (!keyDoc) {
      return res.status(404).json({ error: "Key not found." });
    }

    // If key is already claimed, don't allow claiming again
    if (keyDoc.claimedByClientId) {
      return res.status(400).json({ error: "This key has already been claimed." });
    }

    // Set the HWID (clientId) to the key upon claiming
    keyDoc.claimedByClientId = clientId;
    await keyDoc.save(); // Save the updated key

    res.json({ message: "Key claimed successfully." });
  } catch (error) {
    console.error("Error claiming key:", error);
    res.status(500).json({ error: "Error claiming key. Details: " + error.message });
  }
});

// Verify Key (For Roblox or another identifier)
app.get("/verify-key", async (req, res) => {
  try {
    const { key, clientId } = req.query; // Expecting key and clientId (HWID)

    if (!key || !clientId) {
      return res.json({ valid: false, error: "No key or clientId provided" });
    }

    // Check if the key exists, is not used, and if the clientId matches
    const foundKey = await Key.findOne({
      key,
      used: false,
      expiresAt: { $gt: new Date() },
      claimedByClientId: clientId,  // Ensure the key was claimed by the correct clientId (HWID)
    });

    if (!foundKey) {
      return res.json({ valid: false, error: "Invalid key or expired." });
    }

    // If the key is valid, mark it as used (to prevent reusing it)
    foundKey.used = true;
    await foundKey.save();

    return res.json({ valid: true });
  } catch (error) {
    console.error("Error verifying key:", error);
    res.status(500).json({ valid: false, error: "Internal server error" });
  }
});

// Random Key Generator (16 characters long)
function generateRandomKey() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'; // Uppercase, lowercase, and digits
  let key = '';
  
  // Generate a 16-character random string
  for (let i = 0; i < 16; i++) {
    const randomIndex = Math.floor(Math.random() * chars.length);  // Pick a random character
    key += chars[randomIndex];
  }

  return "KEY-" + key; // Add a prefix for extra clarity
}


// Auto-delete expired keys every hour
setInterval(async () => {
  try {
    await Key.deleteMany({ expiresAt: { $lt: new Date() } });
    console.log("Expired keys deleted.");
  } catch (error) {
    console.error("Error deleting expired keys:", error);
  }
}, 60 * 60 * 1000); // Runs every hour

// Start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
