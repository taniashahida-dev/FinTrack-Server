require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error("Error: MONGODB_URI is not defined in .env file");
  process.exit(1);
}

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

let db, incomeCollection, userCollection, expenseCollection;

async function connectDB() {
  try {
    await client.connect();
    console.log("🎯 Successfully connected to MongoDB!");

    db = client.db("finora-db");
    incomeCollection = db.collection("incomes");
    userCollection = db.collection("user");
    expenseCollection = db.collection("expenses");
  } catch (err) {
    console.error("❌ MongoDB connection error:", err);
  }
}

app.get("/", (req, res) => {
  res.send("FinTrack Server is Running...");
});

//---------------Expenses API--------------

app.get("/api/expenses", async (req, res) => {
  try {
    const { email, search, category } = req.query;

    if (!email) {
      return res
        .status(400)
        .json({ message: "Email query parameter is required" });
    }

    const query = { userEmail: email };

    if (search) {
      query.$or = [
        { title: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
      ];
    }

    if (category && category.toLowerCase() !== "all") {
      query.category = { $regex: new RegExp(`^${category}$`, "i") };
    }
    const userExpenses = await expenseCollection
      .find(query)
      .sort({ date: -1 })
      .toArray();

    res.send(userExpenses);
  } catch (error) {
    console.error("Database Fetch Error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

app.post("/api/expenses", async (req, res) => {
  try {
    const expenses = req.body;
    if (!expenses.userEmail) {
      return res
        .status(400)
        .json({ message: "User email is required to add an expense" });
    }
    const newExpense = {
      ...expenses,
      createdAt: new Date(),
    };
    const result = await expenseCollection.insertOne(newExpense);
    console.log(result);
    res.send({ success: true, ...result });
  } catch (error) {
    res.status(500).send({ error: true, message: error.message });
  }
});

app.patch("/api/expenses/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    if (!updateData.userEmail) {
      return res
        .status(400)
        .json({ message: "User email is required for verification" });
    }

    const { userEmail, ...allowedUpdateFields } = updateData;

    const filter = { _id: new ObjectId(id), userEmail: userEmail };

    const updateDoc = {
      $set: {
        ...allowedUpdateFields,
        updatedAt: new Date(),
      },
    };

    const result = await expenseCollection.updateOne(filter, updateDoc);

    if (result.matchedCount === 0) {
      return res
        .status(403)
        .json({ message: "Unauthorized or expense record not found" });
    }

    console.log(result, "expence updated");
    res.send({ success: true, result });
  } catch (error) {
    console.error("Database Update Error:", error);
    res
      .status(500)
      .json({ message: "Internal server error", error: error.message });
  }
});

app.delete("/api/expenses/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { userEmail } = req.query;

    if (!userEmail) {
      return res
        .status(400)
        .json({ message: "User email is required for verification" });
    }

    const filter = { _id: new ObjectId(id), userEmail: userEmail };
    const result = await expenseCollection.deleteOne(filter);

    if (result.deletedCount === 0) {
      return res
        .status(403)
        .json({ message: "Unauthorized or expense record not found" });
    }

    res.send(result);
  } catch (error) {
    console.error("Database Delete Error:", error);
    res
      .status(500)
      .json({ message: "Internal server error", error: error.message });
  }
});

//---------------Incomes API--------------

app.get("/api/incomes", async (req, res) => {
  try {
    const { email } = req.query;
    if (!email) {
      return res
        .status(400)
        .json({ message: "Email query parameter is required" });
    }
    const userIncomes = await incomeCollection
      .find({ userEmail: email })
      .sort({ date: -1 })
      .toArray();

    res.send(userIncomes);
  } catch (error) {
    console.error("Database Fetch Error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

app.post("/api/incomes", async (req, res) => {
  try {
    const incomes = req.body;
    const newIncome = {
      ...incomes,
      createdAt: new Date(),
    };
    const result = await incomeCollection.insertOne(newIncome);
    console.log(result);
    res.send(result);
  } catch (error) {
    res.status(500).send({ error: true, message: error.message });
  }
});

app.patch("/api/incomes/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    if (!updateData.userEmail) {
      return res
        .status(400)
        .json({ message: "User email is required for verification" });
    }

    const { userEmail, ...allowedUpdateFields } = updateData;

    const filter = { _id: new ObjectId(id), userEmail: userEmail };

    const updateDoc = {
      $set: {
        ...allowedUpdateFields,
        updatedAt: new Date(),
      },
    };

    const result = await incomeCollection.updateOne(filter, updateDoc);

    if (result.matchedCount === 0) {
      return res
        .status(403)
        .json({ message: "Unauthorized or income record not found" });
    }

    console.log(result, "income updated");
    res.send({ success: true, result });
  } catch (error) {
    console.error("Database Update Error:", error);
    res
      .status(500)
      .json({ message: "Internal server error", error: error.message });
  }
});

app.delete("/api/incomes/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { userEmail } = req.query;

    if (!userEmail) {
      return res
        .status(400)
        .json({ message: "User email is required for verification" });
    }

    const filter = { _id: new ObjectId(id), userEmail: userEmail };
    const result = await incomeCollection.deleteOne(filter);

    if (result.deletedCount === 0) {
      return res
        .status(403)
        .json({ message: "Unauthorized or income record not found" });
    }

    res.send(result);
  } catch (error) {
    console.error("Database Delete Error:", error);
    res
      .status(500)
      .json({ message: "Internal server error", error: error.message });
  }
});

connectDB().then(() => {
  app.listen(port, () => {
    console.log(`🚀 Server is running on port ${port}`);
  });
});
