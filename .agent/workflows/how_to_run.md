---
description: How to run the client and server
---
# How to Run the Project

## 1. Start the Server (Backend)
Open a terminal and run:
```powershell
cd server
pip install -r requirements.txt
uvicorn main:app --reload
```
The server will start at `http://127.0.0.1:8000`.

## 2. Start the Client (Frontend)
Open a new terminal and run:
```powershell
cd client
npm install
npm run dev
```
The client will start at `http://localhost:5173` (or similar).
