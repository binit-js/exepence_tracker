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

    // Theme Toggle (Dual bindings for Desktop & Mobile)
    const themeToggleMobile = document.getElementById('theme-toggle-mobile');
    const toggleFunc = () => {
        state.darkMode = !state.darkMode;
        const theme = state.darkMode ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('theme', theme);
        updateChartTheme();
    };
    if (themeToggle) themeToggle.addEventListener('click', toggleFunc);
    if (themeToggleMobile) themeToggleMobile.addEventListener('click', toggleFunc);

    // Mobile Sidebar Navigation Menu Drawer
    const sidebar = document.querySelector('.sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    const openBtn = document.getElementById('menu-toggle-btn');
    const closeBtn = document.getElementById('menu-close-btn');

    if (sidebar && overlay) {
        const openMenu = () => {
            sidebar.classList.add('active');
            overlay.classList.add('active');
        };
        const closeMenu = () => {
            sidebar.classList.remove('active');
            overlay.classList.remove('active');
        };

        if (openBtn) openBtn.addEventListener('click', openMenu);
        if (closeBtn) closeBtn.addEventListener('click', closeMenu);
        overlay.addEventListener('click', closeMenu);

        // Close sidebar drawer after selecting a navigation menu link
        const links = sidebar.querySelectorAll('.nav-links li');
        links.forEach(link => {
            link.addEventListener('click', closeMenu);
        });
    }

    // Modals
    if (addExpenseBtn) {
        addExpenseBtn.addEventListener('click', () => {
            expenseModal.classList.add('active');
            const catSelect = document.getElementById('category');
            if (catSelect) delete catSelect.dataset.userOverridden;
            const confSpan = document.getElementById('ai-category-confidence');
            if (confSpan) confSpan.style.display = 'none';
        });
    }
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

    // Import Data
    const importBtn = document.getElementById('import-data-btn');
    const importFile = document.getElementById('import-csv-file');
    if (importBtn && importFile) {
        importBtn.addEventListener('click', async () => {
            if (!importFile.files || importFile.files.length === 0) {
                alert('Please select a CSV file first.');
                return;
            }

            const file = importFile.files[0];
            const formData = new FormData();
            formData.append('file', file);

            const originalHtml = importBtn.innerHTML;
            importBtn.disabled = true;
            importBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Importing...';

            try {
                const res = await fetch('/api/expenses/import', {
                    method: 'POST',
                    body: formData
                });

                const data = await res.json();
                if (res.ok) {
                    alert(data.message);
                    importFile.value = ''; // clear input
                    
                    // Reload current statistics
                    loadDashboardData();
                } else {
                    let errMsg = data.message || 'Failed to import CSV';
                    if (data.errors) {
                        errMsg += '\nErrors:\n' + data.errors.slice(0, 5).join('\n') + (data.errors.length > 5 ? '\n...' : '');
                    }
                    alert(errMsg);
                }
            } catch (err) {
                console.error(err);
                alert('Failed to import CSV: ' + err.message);
            } finally {
                importBtn.disabled = false;
                importBtn.innerHTML = originalHtml;
            }
        });
    }

    // Filter Listeners
    const filterCat = document.getElementById('filter-category');
    if (filterCat) filterCat.addEventListener('change', loadAllExpenses);

    // ==========================================
    // 🤖 AI/ML AUTOCOMPLETE CATEGORY & SCAN WIDGETS
    // ==========================================
    const descInput = document.getElementById('description');
    const categorySelect = document.getElementById('category');
    let predictTimeout;
    
    if (descInput) {
        descInput.addEventListener('input', () => {
            clearTimeout(predictTimeout);
            const val = descInput.value.trim();
            if (val.length < 3) {
                const confSpan = document.getElementById('ai-category-confidence');
                if (confSpan) confSpan.style.display = 'none';
                return;
            }
            predictTimeout = setTimeout(async () => {
                try {
                    const res = await fetch('/api/ml/predict-category', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ description: val })
                    });
                    if (res.ok) {
                        const data = await res.json();
                        const confSpan = document.getElementById('ai-category-confidence');
                        if (confSpan) {
                            confSpan.innerText = `🤖 AI Suggestion: ${data.category} (${data.confidence}% confidence)`;
                            confSpan.style.display = 'block';
                        }
                        
                        // Select category if not manually locked by user
                        if (categorySelect && !categorySelect.dataset.userOverridden) {
                            const option = Array.from(categorySelect.options).find(o => o.text.toLowerCase() === data.category.toLowerCase());
                            if (option) {
                                categorySelect.value = option.value;
                            }
                        }
                    }
                } catch (err) {
                    console.error('Category prediction failed', err);
                }
            }, 500);
        });
    }

    if (categorySelect) {
        categorySelect.addEventListener('change', () => {
            categorySelect.dataset.userOverridden = 'true';
        });
    }

    // Receipt OCR Scanning
    const scanBtn = document.getElementById('scan-receipt-btn');
    const imageInput = document.getElementById('image');
    if (scanBtn && imageInput) {
        scanBtn.addEventListener('click', async () => {
            if (!imageInput.files || imageInput.files.length === 0) {
                alert('Please select a receipt image first.');
                return;
            }
            
            const file = imageInput.files[0];
            const formData = new FormData();
            formData.append('file', file);
            
            const originalHtml = scanBtn.innerHTML;
            scanBtn.disabled = true;
            scanBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Scanning...';
            
            try {
                const res = await fetch('/api/ml/ocr', {
                    method: 'POST',
                    body: formData
                });
                
                if (!res.ok) {
                    throw new Error(await res.text());
                }
                
                const data = await res.json();
                
                // Populate expense form
                const amountInput = document.getElementById('amount');
                const dateInput = document.getElementById('date');
                
                if (amountInput && data.amount > 0) amountInput.value = data.amount;
                if (descInput && data.merchant) descInput.value = data.merchant;
                if (dateInput && data.date) dateInput.value = data.date;
                
                if (categorySelect && data.category) {
                    const option = Array.from(categorySelect.options).find(o => o.text.toLowerCase() === data.category.toLowerCase());
                    if (option) {
                        categorySelect.value = option.value;
                        // Reset override state on automatic OCR
                        delete categorySelect.dataset.userOverridden;
                    }
                }
                
                const confSpan = document.getElementById('ai-category-confidence');
                if (confSpan) confSpan.style.display = 'none';
                
                alert('Receipt scanned successfully! Form populated.');
                
            } catch (err) {
                console.error(err);
                alert('Failed to scan receipt: ' + err.message);
            } finally {
                scanBtn.disabled = false;
                scanBtn.innerHTML = originalHtml;
            }
        });
    }

    // AI Chatbot Widget toggles & input handlers
    const chatTrigger = document.getElementById('chatbot-trigger');
    const chatContainer = document.getElementById('chatbot-container');
    const closeChatBtn = document.getElementById('close-chat');
    const chatForm = document.getElementById('chatbot-form');
    const chatInput = document.getElementById('chatbot-input');
    const chatMessages = document.getElementById('chatbot-messages');
    
    if (chatTrigger && chatContainer) {
        chatTrigger.addEventListener('click', () => {
            chatContainer.classList.toggle('active');
            if (chatContainer.classList.contains('active')) {
                loadChatHistory();
            }
        });
    }
    
    if (closeChatBtn && chatContainer) {
        closeChatBtn.addEventListener('click', () => {
            chatContainer.classList.remove('active');
        });
    }

    if (chatForm && chatInput && chatMessages) {
        chatForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const text = chatInput.value.trim();
            if (!text) return;

            // Clear input
            chatInput.value = '';

            await sendChatQuery(text);
        });
    }

    // Click handler for chatbot suggestions
    const suggestionsContainer = document.getElementById('chatbot-suggestions');
    if (suggestionsContainer) {
        suggestionsContainer.addEventListener('click', async (e) => {
            const chip = e.target.closest('.suggestion-chip');
            if (!chip) return;
            const query = chip.textContent.trim();
            if (query) {
                await sendChatQuery(query);
            }
        });
    }

    // Modal CSV Import
    const modalImportBtn = document.getElementById('modal-import-data-btn');
    const modalImportFile = document.getElementById('modal-import-csv-file');
    if (modalImportBtn && modalImportFile) {
        modalImportBtn.addEventListener('click', () => {
            modalImportFile.click();
        });

        modalImportFile.addEventListener('change', async () => {
            if (!modalImportFile.files || modalImportFile.files.length === 0) return;

            const file = modalImportFile.files[0];
            const formData = new FormData();
            formData.append('file', file);

            const originalHtml = modalImportBtn.innerHTML;
            modalImportBtn.disabled = true;
            modalImportBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Importing...';

            try {
                const res = await fetch('/api/expenses/import', {
                    method: 'POST',
                    body: formData
                });

                const data = await res.json();
                if (res.ok) {
                    alert(data.message);
                    modalImportFile.value = '';
                    
                    // Close the modal and reset form
                    if (expenseModal) expenseModal.classList.remove('active');
                    if (expenseForm) expenseForm.reset();

                    // Reload page widgets
                    loadDashboardData();
                    loadAllExpenses();
                } else {
                    let errMsg = data.message || 'Failed to import CSV';
                    if (data.errors) {
                        errMsg += '\nErrors:\n' + data.errors.slice(0, 5).join('\n') + (data.errors.length > 5 ? '\n...' : '');
                    }
                    alert(errMsg);
                    modalImportFile.value = '';
                }
            } catch (err) {
                console.error(err);
                alert('Failed to import CSV: ' + err.message);
                modalImportFile.value = '';
            } finally {
                modalImportBtn.disabled = false;
                modalImportBtn.innerHTML = originalHtml;
            }
        });
    }
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
        const [budgetRes, expensesRes, summaryRes, predictionRes] = await Promise.all([
            fetch('/api/budget'),
            fetch('/api/expenses/recent'),
            fetch('/api/expenses/summary'),
            fetch('/api/ml/predict-budget-risk')
        ]);

        const budgetData = await budgetRes.json();
        const expensesData = await expensesRes.json();
        const summary = await summaryRes.json();
        
        let predictionData = null;
        if (predictionRes.ok) {
            predictionData = await predictionRes.json();
        }

        state.budget = budgetData.amount || 0;
        const totalSpent = summary.totalSpent || 0;

        updateDashboardUI(state.budget, totalSpent, expensesData);
        if (predictionData) {
            updatePredictionUI(predictionData);
        }
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
        const summaryData = await res.json();

        renderCategoryChart(summaryData.categoryBreakdown);
        renderTrendChart(summaryData.dailyTrend);
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

function updatePredictionUI(data) {
    const riskStatus = document.getElementById('ai-risk-status');
    const confidence = document.getElementById('ai-confidence');
    const overspend = document.getElementById('ai-overspend');
    const recommendation = document.getElementById('ai-recommendation');

    if (riskStatus) {
        riskStatus.innerText = data.risk + " Risk";
        
        // Color depending on risk
        riskStatus.style.color = 'var(--text-main)';
        if (data.risk === 'High') riskStatus.style.color = 'var(--danger)';
        else if (data.risk === 'Medium') riskStatus.style.color = 'var(--warning)';
        else if (data.risk === 'Low') riskStatus.style.color = 'var(--success)';
    }

    if (confidence) confidence.innerText = `${data.confidence}%`;
    if (overspend) overspend.innerText = `₹${parseFloat(data.expectedOverspend).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    if (recommendation) recommendation.innerText = data.recommendation;
}



async function loadChatHistory() {
    const chatMessages = document.getElementById('chatbot-messages');
    if (!chatMessages) return;

    try {
        const res = await fetch('/api/ml/chat/history');
        if (!res.ok) return;

        const history = await res.json();
        
        chatMessages.innerHTML = `
            <div class="chat-message bot">
                Hi! I am Budget Saathi AI, your personal financial assistant. Ask me questions like "Where did I spend the most?" or "Will I exceed my budget?".
            </div>
        `;

        history.forEach(chat => {
            appendChatMessage(chat.message, chat.sender, false);
        });
        
        chatMessages.scrollTop = chatMessages.scrollHeight;
    } catch (err) {
        console.error('Failed to load chat logs', err);
    }
}

function appendChatMessage(text, sender, scroll = true) {
    const chatMessages = document.getElementById('chatbot-messages');
    if (!chatMessages) return;

    const msgDiv = document.createElement('div');
    msgDiv.className = `chat-message ${sender}`;
    
    let formattedText = text
        .replace(/\n/g, '<br>')
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>');
        
    msgDiv.innerHTML = formattedText;
    chatMessages.appendChild(msgDiv);

    if (scroll) {
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }
}

async function sendChatQuery(text) {
    const chatMessages = document.getElementById('chatbot-messages');
    if (!chatMessages) return;

    // Append user message
    appendChatMessage(text, 'user');

    // Show typing indicator
    const typingDiv = document.createElement('div');
    typingDiv.className = 'chat-message bot typing';
    typingDiv.innerText = 'typing...';
    chatMessages.appendChild(typingDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;

    try {
        const res = await fetch('/api/ml/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: text })
        });

        // Remove typing indicator
        chatMessages.removeChild(typingDiv);

        if (res.ok) {
            const data = await res.json();
            appendChatMessage(data.response, 'bot');
        } else {
            appendChatMessage('Sorry, I encountered an error answering your question.', 'bot');
        }
    } catch (err) {
        // Remove typing indicator if exists
        if (chatMessages.contains(typingDiv)) {
            chatMessages.removeChild(typingDiv);
        }
        appendChatMessage('Unable to reach the assistant.', 'bot');
        console.error(err);
    }
}

