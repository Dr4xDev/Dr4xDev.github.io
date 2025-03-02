app.post("/generate-key", async (req, res) => {
  try {
    const userIP = req.headers["x-forwarded-for"] || req.socket.remoteAddress; // Get user IP (optional, for tracking)

    // Check if the user already claimed a key in the last 24h
    const existingKey = await Key.findOne({
      claimedByIP: userIP,
      expiresAt: { $gt: new Date() }, // Check for a key that's still valid (24 hours)
    });

    if (existingKey) {
      return res.json({ error: "You have already claimed a key. Try again later." });
    }

    // Generate and store a new 24-hour key without a clientId (HWID) at this point
    const newKey = new Key({
      key: generateRandomKey(),
      claimedByIP: userIP,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // Expire in 24 hours
      claimedByClientId: null, // No HWID until claimed
    });

    await newKey.save();
    res.json({ key: newKey.key });
  } catch (error) {
    console.error("Error generating key:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/claim-key", async (req, res) => {
  const { key, clientId } = req.body;

  if (!key || !clientId) {
    return res.status(400).json({ error: "Key and Client ID are required." });
  }

  try {
    // Find the key by its value
    const keyDoc = await Key.findOne({ key });

    if (!keyDoc) {
      return res.status(404).json({ error: "Key not found." });
    }

    if (keyDoc.claimedByClientId) {
      return res.status(400).json({ error: "This key has already been claimed." });
    }

    // Set the HWID (clientId) to the key in the database
    keyDoc.claimedByClientId = clientId;
    await keyDoc.save(); // Save the updated key with the clientId

    res.json({ message: "Key claimed successfully." });
  } catch (error) {
    console.error("Error claiming key:", error);
    res.status(500).json({ error: "Error claiming key. Details: " + error.message });
  }
});
