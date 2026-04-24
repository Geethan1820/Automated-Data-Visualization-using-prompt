# How to Run the Project (Demo-Ready)

The most reliable way to run the complete DataNova stack (Frontend, Backend, Database, Redis) is using **Docker Compose**. This ensures everything works perfectly for your demo.

## 🚀 The Docker Way (Recommended)
Open a terminal in the project root folder and run:

```powershell
# Start everything in the background
docker compose up -d
```

### Access URLs:
- **Main App**: [http://localhost](http://localhost) (Port 80)
- **Backend Docs**: [http://localhost:8001/docs](http://localhost:8001/docs)
- **pgAdmin**: [http://localhost:5052](http://localhost:5052) (Login: `admin@local.test` / `admin`)

---

## 🛠️ Maintenance Commands

**To see logs (Check if AI is working):**
```powershell
docker logs datanova-backend --tail 50 -f
```

**To stop the project:**
```powershell
docker compose down
```

**To reset and rebuild (If you change code):**
```powershell
docker compose up -d --build
```
