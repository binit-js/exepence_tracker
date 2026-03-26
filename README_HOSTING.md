# 🚀 Hosting Budget Saathi for Free

Follow these steps to get your website live on the internet!

## 1. Create a Free Database
Go to [Aiven.io](https://aiven.io/mysql) or [TiDB Cloud](https://pingcap.com/tidb-cloud) and create a free MySQL instance. 
*   Once created, copy the **Connection URI** (it looks like `mysql://user:pass@host:port/db`).

## 2. Push to GitHub
1. Create a new repository on [GitHub](https://github.com).
2. Open your terminal in this project folder and run:
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin YOUR_GITHUB_REPO_URL
   git push -u origin main
   ```

## 3. Deploy on Render
1. Go to [Render.com](https://render.com) and sign up.
2. Click **New +** > **Web Service**.
3. Connect your GitHub repository.
4. Set the following settings:
   *   **Runtime**: Node
   *   **Build Command**: `npm install`
   *   **Start Command**: `npm start`
5. Click **Advanced** > **Add Environment Variable**:
   *   `DATABASE_URL` = (The URI you copied in Step 1)
   *   `SESSION_SECRET` = (Any random string)
   *   `PORT` = 3000
6. Click **Deploy**!

In 2-3 minutes, your website will be live at a URL like `https://budget-saathi.onrender.com`.
