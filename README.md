# 📊 GVS DataNova: Chat with Your Data!

Welcome to **DataNova**! This project was built to make data analysis as easy as sending a text message.

---

## 🧐 1. What is the Problem?
Most people find data analysis hard. If you have a big Excel sheet or a CSV file, you usually need to know complex formulas or coding to understand it. 
*   **The Issue**: Creating charts and finding trends takes a long time.
*   **The Goal**: Let anyone—even people with zero coding skills—upload a file and get instant answers.

## 💡 2. What is the Solution?
DataNova is an **AI-powered analytics assistant**. Instead of writing formulas, you just talk to the app!
*   **Example**: You can ask, *"Which product sold the most in July?"* and DataNova will automatically draw a beautiful chart and give you the answer.

---

## ✨ 3. Top Features
- 🤖 **AI Chat**: A smart assistant that understands your "plain English" questions.
- 📈 **Automatic Charts**: Instant bar charts, line graphs, and pie charts.
- 💎 **Premium Design**: A high-end "Midnight Emerald" visual theme that looks state-of-the-art.
- 🔐 **Secure Logins**: Your data is private. Every user has their own secure account.
- 📂 **Session History**: The app remembers your previous files and chats, so you can pick up right where you left off.

---

## 🛠️ 4. The "Magic" (Tech Stack)
We used modern professional tools to build this:
1.  **Frontend (The Visuals)**: Built with **React** and **Tailwind CSS**. It’s fast and looks great.
2.  **Backend (The Brain)**: Built with **Python** and **FastAPI**. It handles all the heavy logic.
3.  **AI Engine**: Powered by **Google Gemini**. This is the brain that understands your language.
4.  **Database**: Uses **PostgreSQL** to securely store your data and activity logs.

---

## 🚀 5. How to Run It (Easy Steps)

### Step 1: Start the Database
The project uses Docker to keep the database separate and clean.
```bash
docker compose up -d
```

### Step 2: Start the Backend (The Brain)
Open a terminal in the `server` folder:
```bash
cd server
pip install -r requirements.txt
python main.py
```

### Step 3: Open the App
Once the server is running, open your browser and go to:
👉 **http://localhost:8000**

---

### 👨‍💻 Created for the Final Year Project
This system represents a bridge between **Artificial Intelligence** and **Business Intelligence**, making data accessible to everyone.
