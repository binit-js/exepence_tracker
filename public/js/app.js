// State Helper
const state = {
    expenses: [],
    budget: 0,
    categories: [],
    filter: 'all',
    darkMode: localStorage.getItem('theme') === 'dark'
};

// DOM Elements
const navLinks = document.querySelectorAll('.nav-links li');
const sections = document.querySelectorAll('.page-section');
const themeToggle = document.getElementById('theme-toggle');
const addExpenseBtn = document.getElementById('add-expense-btn');
const expenseModal = document.getElementById('expense-modal');
const closeModal = document.querySelector('.close-modal');
const expenseForm = document.getElementById('expense-form');
const budgetModal = document.getElementById('budget-modal');
const editBudgetBtn = document.getElementById('edit-budget-btn');
const closeBudgetModal = document.querySelector('.close-modal-budget');
const budgetForm = document.getElementById('budget-form');
const exportBtn = document.getElementById('export-data-btn');

// Charts
let expensesWithBudgetChart;
let categoryChart;
let trendChart;

// Initialization
document.addEventListener('DOMContentLoaded', async () => {
    const auth = await checkAuth();
    if (!auth.isAuthenticated) {
        window.location.href = '/login.html'; // SPA uses .html
        return;
    }

    // Update Profile UI
    const profileName = document.querySelector('.user-info h4');
    if (profileName) profileName.innerText = `Hello, ${auth.user.username}`;

    initTheme();
    loadCategories();
    loadDashboardData();
    setupEventListeners();
});

async function checkAuth() {
    try {
        const res = await fetch('/api/auth/check');
        return await res.json();
    } catch (e) {
        return { isAuthenticated: false };
    }
}

function setupEventListeners() {
    // Logout
    const logoutBtn = document.createElement('li');
    logoutBtn.innerHTML = '<a href="#"><i class="fa-solid fa-sign-out-alt"></i> Logout</a>';
    logoutBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        await fetch('/api/auth/logout', { method: 'POST' });
        window.location.href = '/login.html';
    });

    const navUl = document.querySelector('.nav-links');
    if (navUl) navUl.appendChild(logoutBtn);

    // Navigation (SPA Logic)
    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const targetId = link.getAttribute('data-target');
            if (!targetId) return; // Skip logout or other links

            navLinks.forEach(l => l.classList.remove('active'));
            link.classList.add('active');

            sections.forEach(s => s.classList.remove('active'));
            const targetSection = document.getElementById(targetId);
            if (targetSection) targetSection.classList.add('active');

            if (targetId === 'dashboard') loadDashboardData();
            if (targetId === 'expenses') loadAllExpenses();
            if (targetId === 'budget') loadBudgetAnalytics();
        });
    });

    // Theme Toggle
    if (themeToggle) {
        themeToggle.addEventListener('click', () => {
            state.darkMode = !state.darkMode;
            document.documentElement.setAttribute('data-theme', state.darkMode ? 'dark' : 'light');
            localStorage.setItem('theme', state.darkMode ? 'dark' : 'light');
            updateChartTheme();
        });
    }

    // Modals
    if (addExpenseBtn) addExpenseBtn.addEventListener('click', () => expenseModal.classList.add('active'));
    if (closeModal) closeModal.addEventListener('click', () => expenseModal.classList.remove('active'));

    if (editBudgetBtn) editBudgetBtn.addEventListener('click', () => budgetModal.classList.add('active'));
    if (closeBudgetModal) closeBudgetModal.addEventListener('click', () => budgetModal.classList.remove('active'));

    window.addEventListener('click', (e) => {
        if (expenseModal && e.target === expenseModal) expenseModal.classList.remove('active');
        if (budgetModal && e.target === budgetModal) budgetModal.classList.remove('active');
    });

    // Forms
    if (expenseForm) expenseForm.addEventListener('submit', handleExpenseSubmit);
    if (budgetForm) budgetForm.addEventListener('submit', handleBudgetSubmit);

    // Export Data
    if (exportBtn) {
        exportBtn.addEventListener('click', async () => {
            try {
                const res = await fetch('/api/expenses');
                const data = await res.json();

                if (!data || data.length === 0) {
                    alert('No data to export');
                    return;
                }

                const headers = ['Date', 'Category', 'Description', 'Amount', 'Payment Mode'];
                const csvRows = [];
                csvRows.push(headers.join(','));

                data.forEach(row => {
                    const cat = state.categories.find(c => c.id == row.category_id)?.name || 'Unknown';
                    const date = new Date(row.date).toLocaleDateString();
                    const values = [
                        date,
                        cat,
                        `"${row.description || ''}"`,
                        row.amount,
                        row.payment_mode
                    ];
                    csvRows.push(values.join(','));
                });

                const csvContent = csvRows.join('\n');
                const blob = new Blob([csvContent], { type: 'text/csv' });
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.setAttribute('hidden', '');
                a.setAttribute('href', url);
                a.setAttribute('download', 'budget_saathi_export.csv');
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
            } catch (err) {
                console.error('Export failed', err);
                alert('Failed to export data');
            }
        });
    }

    // Filter Listeners
    const filterCat = document.getElementById('filter-category');
    if (filterCat) filterCat.addEventListener('change', loadAllExpenses);
}

function initTheme() {
    if (state.darkMode) {
        document.documentElement.setAttribute('data-theme', 'dark');
    }
}

async function loadCategories() {
    const defaultCategories = [
        { id: 1, name: 'Food & Dining' },
        { id: 2, name: 'Transportation' },
    ];

    try {
        const res = await fetch('/api/categories');
        const data = await res.json();
        state.categories = data.length ? data : defaultCategories;
    } catch (e) {
        state.categories = defaultCategories;
    }

    const select = document.getElementById('category');
    const filterSelect = document.getElementById('filter-category');

    if (select) {
        select.innerHTML = '';
        state.categories.forEach(cat => {
            select.innerHTML += `<option value="${cat.id}">${cat.name}</option>`;
        });
    }

    if (filterSelect) {
        filterSelect.innerHTML = '<option value="all">All Categories</option>';
        state.categories.forEach(cat => {
            filterSelect.innerHTML += `<option value="${cat.id}">${cat.name}</option>`;
        });
    }
}

// Data Handling & Graphs
async function loadDashboardData() {
    try {
        const [budgetRes, expensesRes, summaryRes] = await Promise.all([
            fetch('/api/budget'),
            fetch('/api/expenses/recent'),
            fetch('/api/expenses/summary')
        ]);

        const budgetData = await budgetRes.json();
        const expensesData = await expensesRes.json();
        const summary = await summaryRes.json();

        state.budget = budgetData.amount || 0;
        const totalSpent = summary.totalSpent || 0;

        updateDashboardUI(state.budget, totalSpent, expensesData);
        if (document.getElementById('expensesWithBudgetChart')) {
            renderOverviewChart(state.budget, totalSpent);
        }

    } catch (error) {
        console.error('Error loading dashboard:', error);
    }
}

function updateDashboardUI(budget, totalSpent, recentTransactions) {
    const remaining = budget - totalSpent;
    const percentage = budget > 0 ? (totalSpent / budget) * 100 : 0;

    if (document.getElementById('monthly-limit')) document.getElementById('monthly-limit').innerText = `₹${parseFloat(budget).toFixed(2)}`;
    if (document.getElementById('total-spent')) document.getElementById('total-spent').innerText = `₹${parseFloat(totalSpent).toFixed(2)}`;
    if (document.getElementById('remaining-amount')) document.getElementById('remaining-amount').innerText = `₹${parseFloat(remaining).toFixed(2)}`;

    const pb = document.getElementById('budget-progress');
    if (pb) {
        pb.style.width = `${Math.min(percentage, 100)}%`;
        const status = document.getElementById('budget-status');

        if (percentage < 80) {
            pb.style.background = 'var(--success)';
            if (status) status.innerText = "You're doing great!";
        } else if (percentage < 100) {
            pb.style.background = 'var(--warning)';
            if (status) status.innerText = "Careful, nearing limit.";
        } else {
            pb.style.background = 'var(--danger)';
            if (status) {
                status.innerText = "Budget exceeded!";
                status.style.color = 'var(--danger)';
            }
        }
    }

    const list = document.getElementById('recent-transactions');
    if (list) {
        list.innerHTML = '';
        if (recentTransactions.length === 0) {
            list.innerHTML = '<li class="empty-state">No recent transactions</li>';
        } else {
            recentTransactions.forEach(tx => {
                const li = document.createElement('li');
                li.className = 'transaction-item';
                const cat = state.categories.find(c => c.id == tx.category_id) || { name: 'Unknown' };
                const date = new Date(tx.date).toLocaleDateString();

                li.innerHTML = `
                    <div class="trans-icon"><i class="fa-solid fa-receipt"></i></div>
                    <div class="trans-details">
                        <h5>${tx.description || cat.name}</h5>
                        <span>${cat.name} • ${date}</span>
                    </div>
                    <div class="trans-amount expense">-₹${parseFloat(tx.amount).toFixed(2)}</div>
                `;
                list.appendChild(li);
            });
        }
    }
}

async function handleExpenseSubmit(e) {
    e.preventDefault();
    const formData = new FormData(expenseForm);
    try {
        const res = await fetch('/api/expenses', {
            method: 'POST',
            body: formData
        });
        if (res.ok) {
            expenseModal.classList.remove('active');
            expenseForm.reset();
            loadDashboardData();
            loadAllExpenses(); // Update list if visible
        } else {
            alert('Failed to save expense');
        }
    } catch (err) {
        console.error(err);
    }
}

async function handleBudgetSubmit(e) {
    e.preventDefault();
    const amount = document.getElementById('budget-amount').value;
    try {
        const res = await fetch('/api/budget', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ amount })
        });
        if (res.ok) {
            budgetModal.classList.remove('active');
            loadDashboardData();
        }
    } catch (err) {
        console.error(err);
    }
}

async function loadAllExpenses() {
    const tbody = document.getElementById('all-expenses-list');
    if (!tbody) return;

    let url = '/api/expenses';
    const filterCat = document.getElementById('filter-category');
    if (filterCat && filterCat.value !== 'all') {
        url += `?category=${filterCat.value}`;
    }

    const res = await fetch(url);
    const expenses = await res.json();

    tbody.innerHTML = '';

    expenses.forEach(tx => {
        const cat = state.categories.find(c => c.id == tx.category_id) || { name: 'Unknown' };
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${cat.name}</td>
            <td>${tx.description}</td>
            <td>${new Date(tx.date).toLocaleDateString()}</td>
            <td>₹${tx.amount}</td>
            <td><button class="btn-sm btn-outline text-danger delete-btn" data-id="${tx.id}">Delete</button></td>
        `;
        tbody.appendChild(tr);
    });

    document.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            if (!confirm('Are you sure you want to delete this expense?')) return;
            const id = e.target.getAttribute('data-id');
            try {
                const res = await fetch(`/api/expenses/${id}`, { method: 'DELETE' });
                if (res.ok) {
                    loadAllExpenses();
                    loadDashboardData();
                }
            } catch (err) {
                console.error(err);
            }
        });
    });
}

function renderOverviewChart(budget, spent) {
    const ctx = document.getElementById('expensesWithBudgetChart');
    if (!ctx) return;

    if (expensesWithBudgetChart) expensesWithBudgetChart.destroy();

    const remaining = Math.max(0, budget - spent);

    expensesWithBudgetChart = new Chart(ctx.getContext('2d'), {
        type: 'doughnut',
        data: {
            labels: ['Spent', 'Remaining'],
            datasets: [{
                data: [spent, remaining],
                backgroundColor: ['#6366F1', '#E5E7EB'],
                borderWidth: 0
            }]
        },
        options: { cutout: '70%', plugins: { legend: { position: 'bottom' } } }
    });
}

async function loadBudgetAnalytics() {
    try {
        const res = await fetch('/api/expenses/summary');
        const data = await res.json();

        renderCategoryChart(data.categoryBreakdown);
        renderTrendChart(data.dailyTrend);
    } catch (err) {
        console.error(err);
    }
}

function renderCategoryChart(data) {
    const ctx = document.getElementById('categoryChart');
    if (!ctx) return;

    if (categoryChart) categoryChart.destroy();

    const labels = data.map(d => d.name);
    const values = data.map(d => d.total);
    const backgroundColors = ['#F59E0B', '#3B82F6', '#EC4899', '#8B5CF6', '#EF4444', '#10B981', '#6366F1', '#0EA5E9', '#6B7280'];

    categoryChart = new Chart(ctx.getContext('2d'), {
        type: 'pie',
        data: {
            labels: labels,
            datasets: [{
                data: values,
                backgroundColor: backgroundColors.slice(0, labels.length),
                borderWidth: 2,
                borderColor: state.darkMode ? '#1F2937' : '#FFFFFF'
            }]
        },
        options: { responsive: true, plugins: { legend: { position: 'right' } } }
    });
}

function renderTrendChart(data) {
    const ctx = document.getElementById('trendChart');
    if (!ctx) return;

    if (trendChart) trendChart.destroy();

    const labels = data.map(d => new Date(d.day).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }));
    const values = data.map(d => d.total);

    trendChart = new Chart(ctx.getContext('2d'), {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Daily Spending',
                data: values,
                borderColor: '#6366F1',
                backgroundColor: 'rgba(99, 102, 241, 0.2)',
                tension: 0.4,
                fill: true
            }]
        },
        options: { responsive: true, scales: { y: { beginAtZero: true } } }
    });
}

function updateChartTheme() {
    // Re-render handled by updates
    loadDashboardData();
    loadBudgetAnalytics();
}
