require('dotenv').config(); 
const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

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
  }
});


let db ,incomeCullection,userCullection

async function connectDB() {
  try {
    await client.connect();
    console.log("🎯 Successfully connected to MongoDB!");

     db = client.db('finora-db');
    incomeCullection = db.collection('incomes');
    userCullection = db.collection('user');
    
  } catch (err) {
    console.error("❌ MongoDB connection error:", err);
  }
}

app.get('/', (req, res) => {
  res.send('FinTrack Server is Running...');
});


app.get('/api/incomes',async(req,res)=>{
   try {
    const { email } = req.query; 
    if (!email) {
      return res.status(400).json({ message: "Email query parameter is required" });
    }
    const userIncomes = await incomeCullection.find({ userEmail: email }) 
      .sort({ date: -1 })        
      .toArray();                

    res.send(userIncomes);
  } catch (error) {
    console.error("Database Fetch Error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
})

app.post('/api/incomes', async (req, res) => {
   try {
        const incomes = req.body;
        const newIncome = {
          ...incomes,
          createdAt: new Date(),
        };
        const result = await incomeCullection.insertOne(newIncome);
        console.log(result);
        res.send(result);
      } catch (error) {
        res.status(500).send({ error: true, message: error.message });
      }

});




connectDB().then(() => {
  app.listen(port, () => {
    console.log(`🚀 Server is running on port ${port}`);
  });
});