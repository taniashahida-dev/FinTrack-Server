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

let db, incomeCollection, userCollection, expenseCollection, budgetCollection;

async function connectDB() {
  try {
    await client.connect();
    console.log("🎯 Successfully connected to MongoDB!");

    db = client.db("finora-db");
    incomeCollection = db.collection("incomes");
    userCollection = db.collection("user");
    expenseCollection = db.collection("expenses");
    budgetCollection = db.collection("budgets");
  } catch (err) {
    console.error("❌ MongoDB connection error:", err);
  }
}

app.get("/", (req, res) => {
  res.send("FinTrack Server is Running...");
});

//--------------- Analytics API --------------

app.get("/api/analytics-overview", async (req, res) => {
  try {
    const { email } = req.query;
    if (!email) {
      return res
        .status(400)
        .json({ error: "Email query parameter is required" });
    }

    const expenses =
      (await expenseCollection.find({ userEmail: email }).toArray()) || [];
    const incomes =
      (await incomeCollection.find({ userEmail: email }).toArray()) || [];

    let totalIncomeAllTime = 0;
    let totalExpenseAllTime = 0;

    incomes.forEach((i) => (totalIncomeAllTime += Number(i.amount) || 0));
    expenses.forEach((e) => (totalExpenseAllTime += Number(e.amount) || 0));

    const monthNames = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];
    const today = new Date();
    const currentYearMonthStr = today.toISOString().slice(0, 7); // "2026-07"

    const getYearMonthStr = (dateVal) => {
      if (!dateVal) return null;
      const d = new Date(dateVal);
      if (isNaN(d)) return null;
      return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    };

    const activeMonthsSet = new Set();
    incomes.forEach((i) => {
      const ym = getYearMonthStr(i.date);
      if (ym) activeMonthsSet.add(ym);
    });
    expenses.forEach((e) => {
      const ym = getYearMonthStr(e.date);
      if (ym) activeMonthsSet.add(ym);
    });

    let sortedMonths = Array.from(activeMonthsSet).sort().slice(-6);

    if (sortedMonths.length === 0) {
      sortedMonths = [currentYearMonthStr];
    }

    const chartData = sortedMonths.map((yearMonth) => {
      const [year, monthStr] = yearMonth.split("-");
      const monthIdx = parseInt(monthStr, 10) - 1;
      const label = `${monthNames[monthIdx]} ${year.slice(-2)}`;

      let incomeSum = incomes
        .filter((i) => getYearMonthStr(i.date) === yearMonth)
        .reduce((sum, i) => sum + (Number(i.amount) || 0), 0);

      let expenseSum = expenses
        .filter((e) => getYearMonthStr(e.date) === yearMonth)
        .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);

      if (
        yearMonth === currentYearMonthStr &&
        incomeSum === 0 &&
        expenseSum === 0
      ) {
        incomeSum = totalIncomeAllTime;
        expenseSum = totalExpenseAllTime;
      }

      return {
        month: label,
        Income: incomeSum,
        Expense: expenseSum,
        Savings: incomeSum - expenseSum > 0 ? incomeSum - expenseSum : 0,
      };
    });

    const categoryMap = {};
    expenses.forEach((e) => {
      if (e.category) {
        const cat =
          e.category.charAt(0).toUpperCase() +
          e.category.slice(1).toLowerCase();
        categoryMap[cat] = (categoryMap[cat] || 0) + (Number(e.amount) || 0);
      }
    });

    const categoryData = Object.keys(categoryMap)
      .map((cat) => ({
        name: cat,
        value: categoryMap[cat],
      }))
      .sort((a, b) => b.value - a.value);

    const avgDailySpend = Math.round(totalExpenseAllTime / 30) || 0;

    const highestExpenseItem = expenses.reduce(
      (max, e) =>
        (Number(e.amount) || 0) > (Number(max.amount) || 0) ? e : max,
      { amount: 0, title: "N/A" },
    );

    const topSpendingCategory =
      categoryData.length > 0 ? categoryData[0].name : "N/A";
    const topSpendingAmount =
      categoryData.length > 0 ? categoryData[0].value : 0;

    const savingsRate =
      totalIncomeAllTime > 0
        ? (
            ((totalIncomeAllTime - totalExpenseAllTime) / totalIncomeAllTime) *
            100
          ).toFixed(1)
        : 0;

    return res.json({
      summary: {
        totalIncome: totalIncomeAllTime,
        totalExpense: totalExpenseAllTime,
        netSavings: totalIncomeAllTime - totalExpenseAllTime,

        topSpendingCategory,
        topSpendingAmount,
        savingsRate,
        avgDailySpend,
        highestExpenseAmount: highestExpenseItem.amount,
        highestExpenseTitle:
          highestExpenseItem.title || highestExpenseItem.category || "N/A",
      },
      chartData,
      categoryData,
    });
  } catch (error) {
    console.error("❌ Backend Analytics Error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

//---------------Budget API--------------

app.post("/api/budgets", async (req, res) => {
  try {
    const { userEmail, category, amount, monthYear } = req.body;
    const filter = {
      userEmail,
      category: { $regex: new RegExp(`^${category}$`, "i") },
      monthYear,
    };

    const updateDoc = {
      $set: {
        amount: parseFloat(amount),
      },
      $setOnInsert: {
        userEmail,
        category,
        monthYear,
      },
    };

    const result = await budgetCollection.updateOne(filter, updateDoc, {
      upsert: true,
    });
    res.send({ success: true, result });
  } catch (error) {
    res.status(500).send({ message: "Error setting budget", error });
  }
});

app.get("/api/budget-overview", async (req, res) => {
  try {
    const { email, monthYear } = req.query;

    if (!email || !monthYear) {
      return res
        .status(400)
        .json({ error: "Email and monthYear are required" });
    }

    const budgets =
      (await budgetCollection
        .find({ userEmail: email, monthYear: monthYear })
        .toArray()) || [];
    const expenses =
      (await expenseCollection
        .find({
          userEmail: email,
          date: { $regex: `^${monthYear}` },
        })
        .toArray()) || [];

    const totalBudget = budgets.reduce(
      (sum, b) => sum + (Number(b.amount) || 0),
      0,
    );

    let totalSpentInBudgetedCategories = 0;

    const categoryBreakdown = budgets.map((b) => {
      const spentInCat = expenses
        .filter((e) => e.category?.toLowerCase() === b.category?.toLowerCase())
        .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);

      totalSpentInBudgetedCategories += spentInCat;

      const percentUsed =
        b.amount > 0 ? Math.round((spentInCat / b.amount) * 100) : 0;

      return {
        category: b.category,
        budgetAmount: Number(b.amount) || 0,
        spent: spentInCat,
        remaining: (Number(b.amount) || 0) - spentInCat,
        percentUsed,
        isExceeded: spentInCat > (Number(b.amount) || 0),
      };
    });

    const remaining = totalBudget - totalSpentInBudgetedCategories;

    return res.json({
      totalBudget,
      totalSpent: totalSpentInBudgetedCategories,
      remaining,
      categoryBreakdown,
    });
  } catch (error) {
    console.error("❌ Backend Budget Overview Error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
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
