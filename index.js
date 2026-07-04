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


async function connectDB() {
  try {
    await client.connect();
    console.log("🎯 Successfully connected to MongoDB!");

   const  db = client.db('finora-db');
   const incomeCullection = db.collection('incomes');
   const userCullection = db.collection('user');
    
  } catch (err) {
    console.error("❌ MongoDB connection error:", err);
  }
}

app.get('/', (req, res) => {
  res.send('FinTrack Server is Running...');
});



app.post('/incomes', async (req, res) => {
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