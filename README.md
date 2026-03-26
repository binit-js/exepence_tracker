# Budget Saathi 💰

Budget Saathi is a premium, glassmorphism-styled Expense Management Web Application designed to help you track your finances with style.

## Features ✨

- **Dashboard**: Visual Overview of your monthly budget, total spent, and remaining balance.
- **Visual Analytics**: Interactive charts for category breakdown and daily trends.
- **Expense Tracking**: Add expenses with categories, dates, payment modes, and receipt images.
- **Budgeting**: Set monthly limits and track your progress with dynamic progress bars.
- **Secure**: User authentication with password hashing and session management.
- **Responsive**: Fully responsive design for Desktop and Mobile.
- **Dark Mode**: Toggle between sleek Light and Dark themes.

## Tech Stack 🛠️

- **Frontend**: HTML5, Vanilla CSS (Glassmorphism), JavaScript (ES6+), Chart.js
- **Backend**: Node.js, Express.js
- **Database**: MySQL
- **Security**: bcrypt, express-session

## Setup Instructions 🚀

### 1. Prerequisites
- Node.js installed
- MySQL Server installed and running

### 2. Database Setup
1. Open your MySQL client (Workbench, Command Line, etc.).
2. Create the database and tables using the `schema.sql` file provided.
   ```sql
   source schema.sql;
   ```
   *Alternatively, you can manually copy-paste the SQL commands from `schema.sql`.*

### 3. Application Config
1. Open `.env` file.
2. Update the `DB_USER` and `DB_PASSWORD` to match your MySQL credentials.
   ```
   DB_HOST=localhost
   DB_USER=root
   DB_PASSWORD=your_password_here
   ```

### 4. Installation
Install the dependencies:
```bash
npm install
```

### 5. Run the App
Start the development server:
```bash
npm start
```
*or*
```bash
node server.js
```

Visit `http://localhost:3000` in your browser.

## Screenshots 📸
*Launch the app to see the beautiful glassmorphism UI in action!*
