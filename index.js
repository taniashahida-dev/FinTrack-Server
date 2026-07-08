require("dotenv").config();
const express = require("express");
const { getYearMonthStr } = require("./utils/date");
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

let db,
  incomeCollection,
  userCollection,
  expenseCollection,
  budgetCollection,
  notificationCollection;

// Common Helper Functions

const isValidObjectId = (id) => ObjectId.isValid(id);

const sendServerError = (res, error, message = "Internal server error") => {
  console.error(error);
  return res.status(500).json({
    success: false,
    message,
  });
};

// Validate email
const validateEmail = (email, res) => {
  if (!email) {
    return res.status(400).json({
      success: false,
      message: "Email is required",
    });
  }

  return true;
};

// Validate userEmail
const validateUserEmail = (userEmail, res) => {
  if (!userEmail) {
    return res.status(400).json({
      success: false,
      message: "User email is required",
    });
  }

  return true;
};

async function connectDB() {
  try {
    await client.connect();
    console.log("🎯 Successfully connected to MongoDB!");

    db = client.db("finora-db");

    incomeCollection = db.collection("incomes");
    userCollection = db.collection("user");
    expenseCollection = db.collection("expenses");
    budgetCollection = db.collection("budgets");
    notificationCollection = db.collection("notifications");

    // ==================== CREATE INDEXES ====================

    await expenseCollection.createIndex({ userEmail: 1 });
    await expenseCollection.createIndex({ userEmail: 1, date: -1 });
    await expenseCollection.createIndex({ userEmail: 1, category: 1 });

    await incomeCollection.createIndex({ userEmail: 1 });
    await incomeCollection.createIndex({ userEmail: 1, date: -1 });

    await budgetCollection.createIndex({
      userEmail: 1,
      monthYear: 1,
      category: 1,
    });

    await notificationCollection.createIndex({
      userEmail: 1,
      createdAt: -1,
    });

    await userCollection.createIndex({ email: 1 }, { unique: true });
  } catch (err) {
    console.error("❌ MongoDB connection error:", err);
  }
}

app.get("/", (req, res) => {
  res.send("FinTrack Server is Running...");
});

//--------------- User Settings API --------------

app.get("/api/user-settings", async (req, res) => {
  try {
    const { email } = req.query;
    if (!validateEmail(email, res)) return;

    const userSettings = await userCollection.findOne({ email: email });

    if (!userSettings || !userSettings.settings) {
      return res.json({
        settings: {
          budgetAlerts: true,
          largeExpenseAlerts: true,
          monthlyReports: true,
          emailNotifications: false,
        },
      });
    }

    res.send({ settings: userSettings.settings });
  } catch (error) {
    return sendServerError(res, error);
  }
});

app.patch("/api/user-settings", async (req, res) => {
  try {
    const { email, settings } = req.body;
    if (!validateEmail(email, res)) return;

    const filter = { email: email };
    const updateDoc = {
      $set: { settings: settings },
      $setOnInsert: { email, createdAt: new Date() },
    };

    const result = await userCollection.updateOne(filter, updateDoc, {
      upsert: true,
    });
    res.send({ success: true, result });
  } catch (error) {
    return sendServerError(res, error);
  }
});

app.delete("/api/reset-data", async (req, res) => {
  try {
    const { email } = req.query;
    if (!validateEmail(email, res)) return;

    await expenseCollection.deleteMany({ userEmail: email });

    await incomeCollection.deleteMany({ userEmail: email });

    res.send({
      success: true,
      message: "All financial data reset successfully",
    });
  } catch (error) {
    return sendServerError(res, error);
  }
});

// --------------- Notifications API --------------

app.get("/api/notifications", async (req, res) => {
  try {
    const { email } = req.query;
    if (!validateEmail(email, res)) return;

    const notifications =
      (await notificationCollection
        .find({ userEmail: email })
        .sort({ createdAt: -1 })
        .toArray()) || [];

    res.send(notifications);
  } catch (error) {
    return sendServerError(res, error);
  }
});

app.patch("/api/notifications/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { userEmail } = req.body;

    if (!isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid ID",
      });
    }
    const filter = { _id: new ObjectId(id), userEmail };
    const updateDoc = { $set: { isRead: true } };

    const result = await notificationCollection.updateOne(filter, updateDoc);
    res.send({ success: true, result });
  } catch (error) {
    return sendServerError(res, error);
  }
});

app.patch("/api/notifications/mark-all-read", async (req, res) => {
  try {
    const { userEmail } = req.body;
    if (!validateUserEmail(userEmail, res)) return;
    const result = await notificationCollection.updateMany(
      { userEmail, isRead: false },
      { $set: { isRead: true } },
    );
    res.send({ success: true, result });
  } catch (error) {
    return sendServerError(res, error);
  }
});

app.delete("/api/notifications/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { userEmail } = req.query;
    if (!isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid ID",
      });
    }
    const filter = { _id: new ObjectId(id), userEmail };
    const result = await notificationCollection.deleteOne(filter);

    res.send(result);
  } catch (error) {
    return sendServerError(res, error);
  }
});

//--------------- Complete Dashboard Overview API --------------
app.get("/api/dashboard-overview", async (req, res) => {
  try {
    const { email } = req.query;
    if (!validateEmail(email, res)) return;

    const [expenses, incomes, budgets] = await Promise.all([
      expenseCollection.find({ userEmail: email }).toArray(),
      incomeCollection.find({ userEmail: email }).toArray(),
      budgetCollection.find({ userEmail: email }).toArray(),
    ]);

    const today = new Date();
    const currentYear = today.getFullYear();
    const currentMonthIdx = today.getMonth();

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
    const currentMonthName = monthNames[currentMonthIdx];
    const prevMonthName =
      monthNames[currentMonthIdx === 0 ? 11 : currentMonthIdx - 1];

    const currentYearMonthStr = `${currentYear}-${String(currentMonthIdx + 1).padStart(2, "0")}`;
    const prevYearMonthStr =
      currentMonthIdx === 0
        ? `${currentYear - 1}-12`
        : `${currentYear}-${String(currentMonthIdx).padStart(2, "0")}`;

    const totalIncomeAllTime = incomes.reduce(
      (sum, { amount }) => sum + (Number(amount) || 0),
      0,
    );

    const totalExpenseAllTime = expenses.reduce(
      (sum, { amount }) => sum + (Number(amount) || 0),
      0,
    );

    const totalBalance = totalIncomeAllTime - totalExpenseAllTime;

    const currentMonthIncome = incomes
      .filter(({ date }) => date?.startsWith(currentYearMonthStr))
      .reduce((sum, { amount }) => sum + (Number(amount) || 0), 0);

    const prevMonthIncome = incomes
      .filter(({ date }) => date?.startsWith(prevYearMonthStr))
      .reduce((sum, { amount }) => sum + (Number(amount) || 0), 0);

    const currentMonthExpense = expenses
      .filter(({ date }) => date?.startsWith(currentYearMonthStr))
      .reduce((sum, { amount }) => sum + (Number(amount) || 0), 0);

    const prevMonthExpense = expenses
      .filter(({ date }) => date?.startsWith(prevYearMonthStr))
      .reduce((sum, { amount }) => sum + (Number(amount) || 0), 0);

    const getPercentageChange = (current, previous) => {
      if (previous === 0) return current > 0 ? 100 : 0;
      return Number((((current - previous) / previous) * 100).toFixed(1));
    };

    const incomeChange = getPercentageChange(
      currentMonthIncome,
      prevMonthIncome,
    );
    const expenseChange = getPercentageChange(
      currentMonthExpense,
      prevMonthExpense,
    );

    const currentMonthSavings = currentMonthIncome - currentMonthExpense;
    const savingsRate =
      currentMonthIncome > 0
        ? Number(((currentMonthSavings / currentMonthIncome) * 100).toFixed(1))
        : 0;

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
    if (sortedMonths.length === 0) sortedMonths = [currentYearMonthStr];

    const chartData = sortedMonths.map((ym) => {
      const [year, mStr] = ym.split("-");
      const label = `${monthNames[parseInt(mStr, 10) - 1]} ${year.slice(-2)}`;
      const incSum = incomes
        .filter((i) => getYearMonthStr(i.date) === ym)
        .reduce((sum, i) => sum + (Number(i.amount) || 0), 0);
      const expSum = expenses
        .filter((e) => getYearMonthStr(e.date) === ym)
        .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
      return { month: label, Income: incSum, Expense: expSum };
    });
    const categoryMap = {};
    expenses
      .filter((e) => e.date && e.date.startsWith(currentYearMonthStr))
      .forEach((e) => {
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

    const combinedTransactions = [
      ...incomes.map((i) => ({
        id: i._id,
        title: i.source,
        category: "Income",
        date: i.date,
        amount: Number(i.amount),
        type: "income",
      })),
      ...expenses.map((e) => ({
        id: e._id,
        title: e.title || e.category,
        category: e.category,
        date: e.date,
        amount: Number(e.amount),
        type: "expense",
      })),
    ];

    const recentTransactions = combinedTransactions
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, 5);

    const currentMonthBudgets = budgets.filter(
      (b) => b.monthYear === currentYearMonthStr,
    );
    const budgetProgress = currentMonthBudgets
      .map((b) => {
        const spentInCat = expenses
          .filter(
            (e) =>
              e.date &&
              e.date.startsWith(currentYearMonthStr) &&
              e.category?.toLowerCase() === b.category?.toLowerCase(),
          )
          .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);

        return {
          category:
            b.category.charAt(0).toUpperCase() +
            b.category.slice(1).toLowerCase(),
          spent: spentInCat,
          limit: Number(b.amount) || 0,
        };
      })
      .slice(0, 4);
    return res.json({
      user: { currentMonthName, prevMonthName },
      cards: {
        totalBalance,
        monthlyIncome: currentMonthIncome,
        incomeChange,
        totalExpense: currentMonthExpense,
        expenseChange,
        savingsRate,
      },
      chartData,
      categoryData,
      recentTransactions,
      budgetProgress,
    });
  } catch (error) {
    console.error("❌ Dashboard API Error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

//--------------- Analytics API --------------

app.get("/api/analytics-overview", async (req, res) => {
  try {
    const { email } = req.query;
    if (!validateEmail(email, res)) return;

    const [expenses, incomes] = await Promise.all([
      expenseCollection.find({ userEmail: email }).toArray(),
      incomeCollection.find({ userEmail: email }).toArray(),
    ]);

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
    const currentYearMonthStr = today.toISOString().slice(0, 7);

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
    return sendServerError(res, error);
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

    if (!validateEmail(email, res)) return;

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
    return sendServerError(res, error);
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

    const { userEmail, category, amount, date } = expenses;
    if (date && category) {
      const expenseMonthYear = date.slice(0, 7);
      const budget = await budgetCollection.findOne({
        userEmail,
        category: { $regex: new RegExp(`^${category}$`, "i") },
        monthYear: expenseMonthYear,
      });

      if (budget) {
        const allExpensesInCat = await expenseCollection
          .find({
            userEmail,
            date: { $regex: `^${expenseMonthYear}` },
            category: { $regex: new RegExp(`^${category}$`, "i") },
          })
          .toArray();

        const totalSpent = allExpensesInCat.reduce(
          (sum, e) => sum + (Number(e.amount) || 0),
          0,
        );
        const budgetAmount = Number(budget.amount) || 0;

        if (totalSpent > budgetAmount) {
          const exceededBy = totalSpent - budgetAmount;

          const userSettings = await userCollection.findOne({
            email: userEmail,
          });

          const isBudgetAlertEnabled = userSettings?.settings
            ? userSettings.settings.budgetAlerts
            : true;

          if (isBudgetAlertEnabled) {
            const existingAlert = await notificationCollection.findOne({
              userEmail,
              type: "alert",
              title: "Budget Exceeded",
              message: { $regex: category },
            });

            if (!existingAlert) {
              await notificationCollection.insertOne({
                userEmail,
                title: "Budget Exceeded",
                message: `Your ${category.charAt(0).toUpperCase() + category.slice(1).toLowerCase()} budget has been exceeded by ৳${exceededBy.toLocaleString()}`,
                type: "alert",
                isRead: false,
                createdAt: new Date(),
              });
            }
          }
        }
      }
    }

    res.send({ success: true, ...result });
  } catch (error) {
    return sendServerError(res, error);
  }
});

app.patch("/api/expenses/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    if (!validateUserEmail(updateData.userEmail, res)) return;

    const { userEmail, ...allowedUpdateFields } = updateData;
    if (!isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid ID",
      });
    }
    const filter = { _id: new ObjectId(id), userEmail };

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
    return sendServerError(res, error);
  }
});

app.delete("/api/expenses/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { userEmail } = req.query;

    if (!validateUserEmail(userEmail, res)) return;
    if (!isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid ID",
      });
    }
    const filter = { _id: new ObjectId(id), userEmail };
    const result = await expenseCollection.deleteOne(filter);

    if (result.deletedCount === 0) {
      return res
        .status(403)
        .json({ message: "Unauthorized or expense record not found" });
    }

    res.send(result);
  } catch (error) {
    return sendServerError(res, error);
  }
});

//---------------Incomes API--------------

app.get("/api/incomes", async (req, res) => {
  try {
    const { email } = req.query;
    if (!validateEmail(email, res)) return;
    const userIncomes = await incomeCollection
      .find({ userEmail: email })
      .sort({ date: -1 })
      .toArray();

    res.send(userIncomes);
  } catch (error) {
    return sendServerError(res, error);
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

    const { userEmail, source, amount } = incomes;
    if (userEmail && amount) {
      const formattedSource = source
        ? source.charAt(0).toUpperCase() + source.slice(1).toLowerCase()
        : "New Source";

      await notificationCollection.insertOne({
        userEmail: userEmail,
        title: "Income Recorded",
        message: `৳${Number(amount).toLocaleString()} has been credited to your account from ${formattedSource}.`,
        type: "success",
        isRead: false,
        createdAt: new Date(),
      });
    }

    res.send(result);
  } catch (error) {
    return sendServerError(res, error);
  }
});

app.patch("/api/incomes/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;
    if (!validateUserEmail(updateData.userEmail, res)) return;

    const { userEmail, ...allowedUpdateFields } = updateData;
    if (!isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid ID",
      });
    }
    const filter = { _id: new ObjectId(id), userEmail };

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
    return sendServerError(res, error);
  }
});

app.delete("/api/incomes/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { userEmail } = req.query;

    if (!validateUserEmail(userEmail, res)) return;
    if (!isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid ID",
      });
    }
    const filter = { _id: new ObjectId(id), userEmail };
    const result = await incomeCollection.deleteOne(filter);

    if (result.deletedCount === 0) {
      return res
        .status(403)
        .json({ message: "Unauthorized or income record not found" });
    }

    res.send(result);
  } catch (error) {
    return sendServerError(res, error);
  }
});

connectDB().then(() => {
  app.listen(port, () => {
    console.log(`🚀 Server is running on port ${port}`);
  });
});
