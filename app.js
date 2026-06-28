// ==========================================
// Daily Hisab Pro Ultimate - Main Application
// ==========================================

// ============ DATA STORE ============
const DB_KEY = 'hisab_pro_data';
const AUTH_KEY = 'hisab_pro_auth';
const SETTINGS_KEY = 'hisab_pro_settings';
const THEME_KEY = 'hisab_pro_theme';

let db = {
    customers: [],
    products: [],
    transactions: [],
    notifications: [],
    activityLog: []
};

let currentUser = null;
let currentPage = 'dashboard';
let currentLedgerCustomer = null;
let chartInstances = {};
let transactionFilter = 'all';
let customerFilter = 'all';

// ============ UTILITY FUNCTIONS ============
function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

function formatCurrency(amount) {
    const settings = getSettings();
    const symbol = settings.currency || '₹';
    return symbol + Number(amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function formatDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatDateTime(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) + ' ' + d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

function getTodayStr() {
    return new Date().toISOString().split('T')[0];
}

function getCustomerBalance(customerId) {
    const txns = db.transactions.filter(t => t.customerId === customerId);
    let totalPurchase = 0, totalPaid = 0;
    txns.forEach(t => {
        if (t.type === 'purchase') totalPurchase += Number(t.grandTotal) || 0;
        if (t.type === 'payment') totalPaid += Number(t.amount) || 0;
    });
    return { totalPurchase, totalPaid, balance: totalPurchase - totalPaid };
}

function getCustomerName(id) {
    const c = db.customers.find(c => c.id === id);
    return c ? c.name : 'Unknown';
}

// ============ AUTH FUNCTIONS ============
function initAuth() {
    const authData = localStorage.getItem(AUTH_KEY);
    if (authData) {
        currentUser = JSON.parse(authData);
        showMainApp();
    } else {
        showLoginPage();
    }
}

function showLoginPage() {
    document.getElementById('loginPage').classList.remove('hidden');
    document.getElementById('mainApp').classList.add('hidden');
    document.getElementById('loginForm').classList.remove('hidden');
    document.getElementById('registerForm').classList.add('hidden');
}

function showRegister() {
    document.getElementById('loginForm').classList.add('hidden');
    document.getElementById('registerForm').classList.remove('hidden');
}

function showLogin() {
    document.getElementById('loginForm').classList.remove('hidden');
    document.getElementById('registerForm').classList.add('hidden');
}

function handleLogin() {
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    if (!email || !password) { showToast('Please fill in all fields', 'error'); return; }
    
    const users = JSON.parse(localStorage.getItem('hisab_users') || '[]');
    const user = users.find(u => u.email === email && u.password === btoa(password));
    if (!user) { showToast('Invalid email or password', 'error'); return; }
    
    currentUser = { id: user.id, name: user.name, email: user.email, shopName: user.shopName };
    localStorage.setItem(AUTH_KEY, JSON.stringify(currentUser));
    showToast('Welcome back, ' + user.name + '!', 'success');
    showMainApp();
}

function handleRegister() {
    const shopName = document.getElementById('regShopName').value.trim();
    const name = document.getElementById('regName').value.trim();
    const email = document.getElementById('regEmail').value.trim();
    const password = document.getElementById('regPassword').value;
    if (!shopName || !name || !email || !password) { showToast('Please fill in all fields', 'error'); return; }
    if (password.length < 4) { showToast('Password must be at least 4 characters', 'error'); return; }
    
    const users = JSON.parse(localStorage.getItem('hisab_users') || '[]');
    if (users.find(u => u.email === email)) { showToast('Email already registered', 'error'); return; }
    
    const user = { id: generateId(), shopName, name, email, password: btoa(password), createdAt: new Date().toISOString() };
    users.push(user);
    localStorage.setItem('hisab_users', JSON.stringify(users));
    
    // Initialize settings
    const settings = getSettings();
    settings.shopName = shopName;
    settings.ownerName = name;
    settings.phone = '';
    settings.address = '';
    settings.gst = '';
    settings.currency = '₹';
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    
    currentUser = { id: user.id, name: user.name, email: user.email, shopName: user.shopName };
    localStorage.setItem(AUTH_KEY, JSON.stringify(currentUser));
    showToast('Account created successfully!', 'success');
    showMainApp();
}

function handleLogout() {
    currentUser = null;
    localStorage.removeItem(AUTH_KEY);
    showLoginPage();
    showToast('Logged out successfully', 'info');
}

function changePassword() {
    const oldPass = document.getElementById('oldPassword').value;
    const newPass = document.getElementById('newPassword').value;
    if (!oldPass || !newPass) { showToast('Please fill in all fields', 'error'); return; }
    
    const users = JSON.parse(localStorage.getItem('hisab_users') || '[]');
    const user = users.find(u => u.id === currentUser.id);
    if (!user || user.password !== btoa(oldPass)) { showToast('Current password is incorrect', 'error'); return; }
    if (newPass.length < 4) { showToast('New password must be at least 4 characters', 'error'); return; }
    
    user.password = btoa(newPass);
    localStorage.setItem('hisab_users', JSON.stringify(users));
    document.getElementById('oldPassword').value = '';
    document.getElementById('newPassword').value = '';
    showToast('Password updated successfully!', 'success');
}

function showMainApp() {
    document.getElementById('loginPage').classList.add('hidden');
    document.getElementById('mainApp').classList.remove('hidden');
    document.getElementById('userName').textContent = currentUser.name;
    document.getElementById('userEmail').textContent = currentUser.email;
    document.getElementById('userAvatar').textContent = currentUser.name.charAt(0).toUpperCase();
    loadData();
    navigateTo('dashboard');
    updateTime();
    setInterval(updateTime, 1000);
    checkLowStock();
}

// ============ DATA MANAGEMENT ============
function loadData() {
    const saved = localStorage.getItem(DB_KEY);
    if (saved) db = JSON.parse(saved);
}

function saveData() {
    localStorage.setItem(DB_KEY, JSON.stringify(db));
}

function getSettings() {
    const saved = localStorage.getItem(SETTINGS_KEY);
    return saved ? JSON.parse(saved) : { shopName: '', ownerName: '', phone: '', address: '', gst: '', currency: '₹' };
}

function saveSettings() {
    const settings = {
        shopName: document.getElementById('settShopName').value,
        ownerName: document.getElementById('settOwnerName').value,
        phone: document.getElementById('settPhone').value,
        address: document.getElementById('settAddress').value,
        gst: document.getElementById('settGST').value,
        currency: document.getElementById('settCurrency').value || '₹'
    };
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    showToast('Settings saved successfully!', 'success');
}

function loadSettingsToForm() {
    const s = getSettings();
    document.getElementById('settShopName').value = s.shopName || '';
    document.getElementById('settOwnerName').value = s.ownerName || '';
    document.getElementById('settPhone').value = s.phone || '';
    document.getElementById('settAddress').value = s.address || '';
    document.getElementById('settGST').value = s.gst || '';
    document.getElementById('settCurrency').value = s.currency || '₹';
}

function exportAllData() {
    const data = { ...db, exportDate: new Date().toISOString(), user: currentUser };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'hisab_pro_backup_' + getTodayStr() + '.json';
    a.click();
    URL.revokeObjectURL(url);
    showToast('Data exported successfully!', 'success');
}

function importData(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const imported = JSON.parse(e.target.result);
            if (imported.customers) db.customers = imported.customers;
            if (imported.products) db.products = imported.products;
            if (imported.transactions) db.transactions = imported.transactions;
            if (imported.notifications) db.notifications = imported.notifications;
            saveData();
            showToast('Data imported successfully!', 'success');
            navigateTo('dashboard');
        } catch (err) {
            showToast('Invalid file format', 'error');
        }
    };
    reader.readAsText(file);
    event.target.value = '';
}

function confirmClearData() {
    openModal(`
        <div class="p-6">
            <div class="text-center mb-6">
                <div class="w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                    <i data-lucide="alert-triangle" class="w-8 h-8 text-red-500"></i>
                </div>
                <h3 class="text-xl font-bold">Clear All Data?</h3>
                <p class="text-gray-500 dark:text-gray-400 mt-2">This will permanently delete all customers, products, and transactions. This action cannot be undone.</p>
            </div>
            <div class="flex gap-3">
                <button onclick="closeModal()" class="flex-1 py-2.5 border border-gray-200 dark:border-slate-600 rounded-xl font-medium hover:bg-gray-50 dark:hover:bg-slate-700 transition">Cancel</button>
                <button onclick="clearAllData()" class="flex-1 py-2.5 bg-red-500 hover:bg-red-600 text-white rounded-xl font-medium transition">Delete All</button>
            </div>
        </div>
    `);
}

function clearAllData() {
    db = { customers: [], products: [], transactions: [], notifications: [], activityLog: [] };
    saveData();
    closeModal();
    showToast('All data cleared', 'info');
    navigateTo('dashboard');
}

// ============ THEME MANAGEMENT ============
function initTheme() {
    const saved = localStorage.getItem(THEME_KEY) || 'light';
    applyTheme(saved);
}

function applyTheme(theme) {
    if (theme === 'auto') {
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        document.documentElement.classList.toggle('dark', prefersDark);
    } else {
        document.documentElement.classList.toggle('dark', theme === 'dark');
    }
    updateThemeButtons(theme);
}

function setTheme(theme) {
    localStorage.setItem(THEME_KEY, theme);
    applyTheme(theme);
    showToast('Theme updated', 'success');
}

function toggleTheme() {
    const current = localStorage.getItem(THEME_KEY) || 'light';
    const next = current === 'dark' ? 'light' : 'dark';
    setTheme(next);
}

function updateThemeButtons(activeTheme) {
    document.querySelectorAll('.theme-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.theme === activeTheme);
    });
}

// ============ NAVIGATION ============
function navigateTo(page) {
    currentPage = page;
    document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));
    const target = document.getElementById('page-' + page);
    if (target) {
        target.classList.remove('hidden');
        target.classList.add('animate-fade-in');
    }
    
    document.querySelectorAll('.nav-link').forEach(link => {
        link.classList.toggle('active', link.dataset.nav === page);
    });
    
    // Close sidebar on mobile
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    sidebar.classList.add('-translate-x-full');
    overlay.classList.add('hidden');
    
    // Render page content
    renderPage(page);
    lucide.createIcons();
}

function renderPage(page) {
    switch (page) {
        case 'dashboard': renderDashboard(); break;
        case 'customers': renderCustomers(); break;
        case 'customerDetail': renderCustomerLedger(); break;
        case 'products': renderProducts(); break;
        case 'newPurchase': initPurchaseForm(); break;
        case 'newPayment': initPaymentForm(); break;
        case 'transactions': renderTransactions(); break;
        case 'reports': break;
        case 'settings': loadSettingsToForm(); break;
    }
}

function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    sidebar.classList.toggle('-translate-x-full');
    overlay.classList.toggle('hidden');
}

// ============ TIME UPDATE ============
function updateTime() {
    const now = new Date();
    const timeEl = document.getElementById('currentTime');
    const dateEl = document.getElementById('currentDate');
    if (timeEl) timeEl.textContent = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    if (dateEl) dateEl.textContent = now.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

// ============ TOAST NOTIFICATIONS ============
function showToast(message, type = 'info') {
    const colors = {
        success: 'bg-emerald-500',
        error: 'bg-red-500',
        info: 'bg-indigo-500',
        warning: 'bg-amber-500'
    };
    const icons = {
        success: 'check-circle',
        error: 'x-circle',
        info: 'info',
        warning: 'alert-triangle'
    };
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast flex items-center gap-3 px-5 py-3 ${colors[type]} text-white rounded-xl shadow-2xl min-w-[280px]`;
    toast.innerHTML = `<i data-lucide="${icons[type]}" class="w-5 h-5 flex-shrink-0"></i><span class="font-medium text-sm">${message}</span>`;
    container.appendChild(toast);
    lucide.createIcons({ nodes: [toast] });
    setTimeout(() => {
        toast.classList.add('toast-exit');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// ============ MODAL ============
function openModal(html) {
    const overlay = document.getElementById('modalOverlay');
    const content = document.getElementById('modalContent');
    overlay.classList.remove('hidden');
    content.innerHTML = html;
    setTimeout(() => {
        content.classList.remove('scale-95', 'opacity-0');
        content.classList.add('scale-100', 'opacity-100', 'modal-enter');
    }, 50);
    lucide.createIcons({ nodes: [content] });
}

function closeModal() {
    const overlay = document.getElementById('modalOverlay');
    const content = document.getElementById('modalContent');
    content.classList.add('scale-95', 'opacity-0');
    content.classList.remove('scale-100', 'opacity-100', 'modal-enter');
    setTimeout(() => overlay.classList.add('hidden'), 200);
}

document.getElementById('modalOverlay').addEventListener('click', function(e) {
    if (e.target === this) closeModal();
});

// ============ DASHBOARD ============
function renderDashboard() {
    const today = getTodayStr();
    const now = new Date();
    const thisMonth = now.toISOString().substr(0, 7);
    const thisYear = now.getFullYear();
    
    const todaySales = db.transactions.filter(t => t.type === 'purchase' && t.date === today).reduce((s, t) => s + (Number(t.grandTotal) || 0), 0);
    const monthSales = db.transactions.filter(t => t.type === 'purchase' && t.date.startsWith(thisMonth)).reduce((s, t) => s + (Number(t.grandTotal) || 0), 0);
    const totalPending = db.customers.reduce((s, c) => {
        const bal = getCustomerBalance(c.id);
        return s + Math.max(0, bal.balance);
    }, 0);
    const totalCollected = db.transactions.filter(t => t.type === 'payment').reduce((s, t) => s + (Number(t.amount) || 0), 0);
    const lowStock = db.products.filter(p => Number(p.stock) <= Number(p.minStock || 5));
    
    document.getElementById('kpiCustomers').textContent = db.customers.length;
    document.getElementById('kpiTodaySales').textContent = formatCurrency(todaySales);
    document.getElementById('kpiPending').textContent = formatCurrency(totalPending);
    document.getElementById('kpiProducts').textContent = db.products.length;
    document.getElementById('kpiPendingCount').textContent = db.customers.filter(c => getCustomerBalance(c.id).balance > 0).length;
    document.getElementById('kpiLowStock').textContent = lowStock.length;
    document.getElementById('kpiCustomersChange').textContent = db.customers.length + ' total';
    document.getElementById('kpiSalesChange').textContent = formatCurrency(monthSales) + '/mo';
    
    // Recent Transactions
    const recent = [...db.transactions].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 7);
    const recentEl = document.getElementById('recentTransactions');
    if (recent.length === 0) {
        recentEl.innerHTML = '<div class="text-center py-8 text-gray-400"><i data-lucide="receipt" class="w-12 h-12 mx-auto mb-2 opacity-30"></i><p>No transactions yet</p></div>';
    } else {
        recentEl.innerHTML = recent.map(t => {
            const isPurchase = t.type === 'purchase';
            return `<div class="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 dark:hover:bg-slate-700/50 transition cursor-pointer" onclick="viewTransaction('${t.id}')">
                <div class="w-10 h-10 rounded-xl flex items-center justify-center ${isPurchase ? 'bg-rose-100 dark:bg-rose-900/30 text-rose-500' : 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-500'}">
                    <i data-lucide="${isPurchase ? 'shopping-cart' : 'banknote'}" class="w-5 h-5"></i>
                </div>
                <div class="flex-1 min-w-0">
                    <p class="font-medium text-sm truncate">${getCustomerName(t.customerId)}</p>
                    <p class="text-xs text-gray-500">${formatDate(t.date)} • ${t.items ? t.items.length + ' items' : t.method}</p>
                </div>
                <div class="text-right">
                    <p class="font-semibold text-sm ${isPurchase ? 'text-rose-500' : 'text-emerald-500'}">${isPurchase ? '+' : '-'}${formatCurrency(isPurchase ? t.grandTotal : t.amount)}</p>
                </div>
            </div>`;
        }).join('');
    }
    
    // Top Customers
    const topCusts = db.customers.map(c => ({ ...c, ...getCustomerBalance(c.id) })).sort((a, b) => b.totalPurchase - a.totalPurchase).slice(0, 5);
    const topEl = document.getElementById('topCustomers');
    if (topCusts.length === 0) {
        topEl.innerHTML = '<div class="text-center py-8 text-gray-400"><i data-lucide="users" class="w-12 h-12 mx-auto mb-2 opacity-30"></i><p>No customers yet</p></div>';
    } else {
        topEl.innerHTML = topCusts.map((c, i) => `
            <div class="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 dark:hover:bg-slate-700/50 transition cursor-pointer" onclick="viewCustomer('${c.id}')">
                <div class="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${i < 3 ? 'bg-gradient-to-br from-indigo-500 to-purple-600 text-white' : 'bg-gray-200 dark:bg-slate-700 text-gray-600 dark:text-gray-400'}">${i + 1}</div>
                <div class="flex-1 min-w-0">
                    <p class="font-medium text-sm truncate">${c.name}</p>
                    <p class="text-xs text-gray-500">${c.phone || 'No phone'}</p>
                </div>
                <p class="font-semibold text-sm">${formatCurrency(c.totalPurchase)}</p>
            </div>
        `).join('');
    }
    
    // Charts
    renderCharts();
    lucide.createIcons();
}

function renderCharts() {
    const now = new Date();
    // Weekly Chart
    const weekDays = [];
    const weekData = [];
    for (let i = 6; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().split('T')[0];
        weekDays.push(d.toLocaleDateString('en-IN', { weekday: 'short' }));
        weekData.push(db.transactions.filter(t => t.type === 'purchase' && t.date === dateStr).reduce((s, t) => s + (Number(t.grandTotal) || 0), 0));
    }
    
    if (chartInstances.weekly) chartInstances.weekly.destroy();
    const weeklyCtx = document.getElementById('weeklyChart');
    if (weeklyCtx) {
        chartInstances.weekly = new Chart(weeklyCtx.getContext('2d'), {
            type: 'bar',
            data: {
                labels: weekDays,
                datasets: [{
                    label: 'Sales',
                    data: weekData,
                    backgroundColor: 'rgba(99, 102, 241, 0.7)',
                    borderColor: 'rgba(99, 102, 241, 1)',
                    borderWidth: 2,
                    borderRadius: 8,
                    borderSkipped: false
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.05)' } },
                    x: { grid: { display: false } }
                }
            }
        });
    }
    
    // Monthly Chart
    const months = [];
    const monthData = [];
    for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const monthStr = d.toISOString().substr(0, 7);
        months.push(d.toLocaleDateString('en-IN', { month: 'short' }));
        monthData.push(db.transactions.filter(t => t.type === 'purchase' && t.date.startsWith(monthStr)).reduce((s, t) => s + (Number(t.grandTotal) || 0), 0));
    }
    
    if (chartInstances.monthly) chartInstances.monthly.destroy();
    const monthlyCtx = document.getElementById('monthlyChart');
    if (monthlyCtx) {
        chartInstances.monthly = new Chart(monthlyCtx.getContext('2d'), {
            type: 'line',
            data: {
                labels: months,
                datasets: [{
                    label: 'Sales',
                    data: monthData,
                    borderColor: 'rgba(139, 92, 246, 1)',
                    backgroundColor: 'rgba(139, 92, 246, 0.1)',
                    fill: true,
                    tension: 0.4,
                    borderWidth: 3,
                    pointRadius: 4,
                    pointBackgroundColor: 'rgba(139, 92, 246, 1)'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.05)' } },
                    x: { grid: { display: false } }
                }
            }
        });
    }
}

// ============ CUSTOMER MANAGEMENT ============
function renderCustomers() {
    let customers = [...db.customers];
    if (customerFilter === 'pending') customers = customers.filter(c => getCustomerBalance(c.id).balance > 0);
    if (customerFilter === 'settled') customers = customers.filter(c => getCustomerBalance(c.id).balance <= 0);
    
    const el = document.getElementById('customersList');
    if (customers.length === 0) {
        el.innerHTML = `<div class="col-span-full text-center py-16">
            <div class="w-24 h-24 bg-gray-100 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4"><i data-lucide="users" class="w-12 h-12 text-gray-300 dark:text-gray-600"></i></div>
            <h3 class="text-xl font-semibold text-gray-500 dark:text-gray-400">No customers ${customerFilter !== 'all' ? 'found' : 'yet'}</h3>
            <p class="text-gray-400 mt-1">Add your first customer to get started</p>
            <button onclick="openCustomerModal()" class="mt-4 px-6 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl font-medium shadow-md transition hover:scale-[1.02]">Add Customer</button>
        </div>`;
    } else {
        el.innerHTML = customers.map((c, i) => {
            const bal = getCustomerBalance(c.id);
            const hasBalance = bal.balance > 0;
            return `<div class="customer-card animate-fade-in-up bg-white dark:bg-slate-800/80 rounded-2xl border border-gray-200 dark:border-slate-700 p-5 hover:border-indigo-300 dark:hover:border-indigo-600 transition-all duration-300 cursor-pointer" style="animation-delay:${i * 0.05}s" onclick="viewCustomer('${c.id}')">
                <div class="flex items-start justify-between mb-3">
                    <div class="w-12 h-12 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center text-white font-bold text-lg shadow-md">${c.name.charAt(0).toUpperCase()}</div>
                    <span class="px-2.5 py-1 rounded-full text-xs font-medium ${hasBalance ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'}">${hasBalance ? 'Pending' : 'Settled'}</span>
                </div>
                <h3 class="font-semibold text-lg truncate">${c.name}</h3>
                <p class="text-sm text-gray-500 dark:text-gray-400 mt-0.5">${c.phone || 'No phone'}</p>
                <div class="mt-4 pt-3 border-t border-gray-100 dark:border-slate-700 flex justify-between">
                    <div>
                        <p class="text-xs text-gray-400">Total Purchase</p>
                        <p class="font-semibold text-sm">${formatCurrency(bal.totalPurchase)}</p>
                    </div>
                    <div class="text-right">
                        <p class="text-xs text-gray-400">Balance Due</p>
                        <p class="font-semibold text-sm ${hasBalance ? 'text-amber-500' : 'text-emerald-500'}">${formatCurrency(bal.balance)}</p>
                    </div>
                </div>
            </div>`;
        }).join('');
    }
    lucide.createIcons();
}

function filterCustomers(filter) {
    customerFilter = filter;
    document.querySelectorAll('.filter-btn[data-filter]').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.filter === filter);
        if (btn.dataset.filter === filter) {
            btn.className = btn.className.replace(/bg-gray-100 text-gray-600 dark:bg-slate-800 dark:text-gray-400/g, '').replace(/hover:bg-indigo-100 hover:text-indigo-700 dark:hover:bg-indigo-900\/50 dark:hover:text-indigo-300/g, '');
            btn.classList.add('bg-indigo-100', 'text-indigo-700', 'dark:bg-indigo-900/50', 'dark:text-indigo-300');
        } else {
            btn.classList.remove('bg-indigo-100', 'text-indigo-700', 'dark:bg-indigo-900/50', 'dark:text-indigo-300');
            btn.classList.add('bg-gray-100', 'text-gray-600', 'dark:bg-slate-800', 'dark:text-gray-400');
        }
    });
    renderCustomers();
}

function openCustomerModal(customerId) {
    const customer = customerId ? db.customers.find(c => c.id === customerId) : null;
    const isEdit = !!customer;
    openModal(`
        <div class="p-6">
            <div class="flex items-center justify-between mb-6">
                <h3 class="text-xl font-bold">${isEdit ? 'Edit Customer' : 'Add Customer'}</h3>
                <button onclick="closeModal()" class="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-slate-700 transition"><i data-lucide="x" class="w-5 h-5"></i></button>
            </div>
            <div class="space-y-4">
                <div>
                    <label class="block text-sm font-medium mb-1">Customer Name *</label>
                    <input type="text" id="custName" value="${isEdit ? customer.name : ''}" class="w-full px-4 py-2.5 bg-gray-50 dark:bg-slate-700 rounded-xl border border-gray-200 dark:border-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="Enter name">
                </div>
                <div>
                    <label class="block text-sm font-medium mb-1">Phone Number</label>
                    <input type="text" id="custPhone" value="${isEdit ? (customer.phone || '') : ''}" class="w-full px-4 py-2.5 bg-gray-50 dark:bg-slate-700 rounded-xl border border-gray-200 dark:border-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="Phone number">
                </div>
                <div>
                    <label class="block text-sm font-medium mb-1">Email</label>
                    <input type="email" id="custEmail" value="${isEdit ? (customer.email || '') : ''}" class="w-full px-4 py-2.5 bg-gray-50 dark:bg-slate-700 rounded-xl border border-gray-200 dark:border-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="Email address">
                </div>
                <div>
                    <label class="block text-sm font-medium mb-1">Address</label>
                    <textarea id="custAddress" rows="2" class="w-full px-4 py-2.5 bg-gray-50 dark:bg-slate-700 rounded-xl border border-gray-200 dark:border-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="Address">${isEdit ? (customer.address || '') : ''}</textarea>
                </div>
                <div>
                    <label class="block text-sm font-medium mb-1">GST Number</label>
                    <input type="text" id="custGST" value="${isEdit ? (customer.gstNumber || '') : ''}" class="w-full px-4 py-2.5 bg-gray-50 dark:bg-slate-700 rounded-xl border border-gray-200 dark:border-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="GST Number (optional)">
                </div>
                <div>
                    <label class="block text-sm font-medium mb-1">Notes</label>
                    <input type="text" id="custNotes" value="${isEdit ? (customer.notes || '') : ''}" class="w-full px-4 py-2.5 bg-gray-50 dark:bg-slate-700 rounded-xl border border-gray-200 dark:border-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="Any notes">
                </div>
                <button onclick="saveCustomer('${customerId || ''}')" class="w-full py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl font-semibold shadow-lg shadow-indigo-500/30 transition hover:scale-[1.02]">${isEdit ? 'Update Customer' : 'Add Customer'}</button>
            </div>
        </div>
    `);
}

function saveCustomer(customerId) {
    const name = document.getElementById('custName').value.trim();
    if (!name) { showToast('Customer name is required', 'error'); return; }
    
    const data = {
        name,
        phone: document.getElementById('custPhone').value.trim(),
        email: document.getElementById('custEmail').value.trim(),
        address: document.getElementById('custAddress').value.trim(),
        gstNumber: document.getElementById('custGST').value.trim(),
        notes: document.getElementById('custNotes').value.trim(),
    };
    
    if (customerId) {
        const idx = db.customers.findIndex(c => c.id === customerId);
        if (idx > -1) {
            db.customers[idx] = { ...db.customers[idx], ...data, updatedAt: new Date().toISOString() };
            showToast('Customer updated successfully!', 'success');
        }
    } else {
        db.customers.push({ id: generateId(), ...data, status: 'active', createdAt: new Date().toISOString() });
        showToast('Customer added successfully!', 'success');
    }
    
    saveData();
    closeModal();
    renderCustomers();
}

function editCustomer(customerId) {
    openCustomerModal(customerId);
}

function deleteCustomer(customerId) {
    openModal(`
        <div class="p-6">
            <div class="text-center mb-6">
                <div class="w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-4"><i data-lucide="trash-2" class="w-8 h-8 text-red-500"></i></div>
                <h3 class="text-xl font-bold">Delete Customer?</h3>
                <p class="text-gray-500 dark:text-gray-400 mt-2">All transactions for this customer will also be deleted. This cannot be undone.</p>
            </div>
            <div class="flex gap-3">
                <button onclick="closeModal()" class="flex-1 py-2.5 border border-gray-200 dark:border-slate-600 rounded-xl font-medium hover:bg-gray-50 dark:hover:bg-slate-700 transition">Cancel</button>
                <button onclick="confirmDeleteCustomer('${customerId}')" class="flex-1 py-2.5 bg-red-500 hover:bg-red-600 text-white rounded-xl font-medium transition">Delete</button>
            </div>
        </div>
    `);
}

function confirmDeleteCustomer(customerId) {
    db.customers = db.customers.filter(c => c.id !== customerId);
    db.transactions = db.transactions.filter(t => t.customerId !== customerId);
    saveData();
    closeModal();
    showToast('Customer deleted', 'info');
    navigateTo('customers');
}

function viewCustomer(customerId) {
    currentLedgerCustomer = customerId;
    navigateTo('customerDetail');
}

// ============ CUSTOMER LEDGER ============
function renderCustomerLedger() {
    if (!currentLedgerCustomer) { navigateTo('customers'); return; }
    const customer = db.customers.find(c => c.id === currentLedgerCustomer);
    if (!customer) { navigateTo('customers'); return; }
    
    const bal = getCustomerBalance(customer.id);
    const txns = db.transactions.filter(t => t.customerId === customer.id).sort((a, b) => new Date(a.date) - new Date(b.date) || new Date(a.createdAt) - new Date(b.createdAt));
    
    document.getElementById('ledgerCustomerName').textContent = customer.name;
    document.getElementById('ledgerCustomerPhone').textContent = customer.phone || 'No phone';
    document.getElementById('ledgerTotalPurchase').textContent = formatCurrency(bal.totalPurchase);
    document.getElementById('ledgerTotalPaid').textContent = formatCurrency(bal.totalPaid);
    document.getElementById('ledgerCurrentDue').textContent = formatCurrency(bal.balance);
    document.getElementById('ledgerTransCount').textContent = txns.length;
    
    const tbody = document.getElementById('ledgerTableBody');
    const emptyEl = document.getElementById('ledgerEmpty');
    
    if (txns.length === 0) {
        tbody.innerHTML = '';
        emptyEl.classList.remove('hidden');
    } else {
        emptyEl.classList.add('hidden');
        let runningBalance = 0;
        tbody.innerHTML = txns.map(t => {
            const isPurchase = t.type === 'purchase';
            const debit = isPurchase ? Number(t.grandTotal) || 0 : 0;
            const credit = !isPurchase ? Number(t.amount) || 0 : 0;
            runningBalance += debit - credit;
            
            return `<tr class="hover:bg-gray-50 dark:hover:bg-slate-700/50 transition">
                <td class="px-4 py-3 text-sm">${formatDate(t.date)}</td>
                <td class="px-4 py-3 text-sm">
                    <div class="flex items-center gap-2">
                        <span class="px-2 py-0.5 rounded-full text-xs font-medium ${isPurchase ? 'badge-purchase' : 'badge-payment'}">${isPurchase ? 'Purchase' : 'Payment'}</span>
                        ${t.items ? `<span class="text-gray-500">${t.items.map(i => i.name).join(', ')}</span>` : ''}
                        ${t.method ? `<span class="text-gray-500">via ${t.method}</span>` : ''}
                    </div>
                    ${t.notes ? `<p class="text-xs text-gray-400 mt-0.5">${t.notes}</p>` : ''}
                    ${t.invoiceNo ? `<p class="text-xs text-gray-400">Inv: ${t.invoiceNo}</p>` : ''}
                </td>
                <td class="px-4 py-3 text-sm text-right font-medium ${debit > 0 ? 'text-rose-500' : ''}">${debit > 0 ? formatCurrency(debit) : '-'}</td>
                <td class="px-4 py-3 text-sm text-right font-medium ${credit > 0 ? 'text-emerald-500' : ''}">${credit > 0 ? formatCurrency(credit) : '-'}</td>
                <td class="px-4 py-3 text-sm text-right font-bold ${runningBalance > 0 ? 'text-amber-500' : 'text-emerald-500'}">${formatCurrency(runningBalance)}</td>
                <td class="px-4 py-3 text-center">
                    <div class="flex items-center justify-center gap-1">
                        <button onclick="viewTransaction('${t.id}')" class="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-600 transition" title="View"><i data-lucide="eye" class="w-4 h-4 text-gray-500"></i></button>
                        <button onclick="deleteTransaction('${t.id}')" class="p-1.5 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30 transition" title="Delete"><i data-lucide="trash-2" class="w-4 h-4 text-red-500"></i></button>
                    </div>
                </td>
            </tr>`;
        }).join('');
    }
    lucide.createIcons();
}

function openPurchaseForCustomer() {
    navigateTo('newPurchase');
    setTimeout(() => {
        const sel = document.getElementById('purchaseCustomer');
        if (sel) sel.value = currentLedgerCustomer;
    }, 100);
}

function openPaymentForCustomer() {
    navigateTo('newPayment');
    setTimeout(() => {
        const sel = document.getElementById('paymentCustomer');
        if (sel && currentLedgerCustomer) sel.value = currentLedgerCustomer;
        updatePaymentBalance();
    }, 100);
}

function openStatementModal() {
    if (!currentLedgerCustomer) return;
    const customer = db.customers.find(c => c.id === currentLedgerCustomer);
    if (!customer) return;
    const bal = getCustomerBalance(customer.id);
    const txns = db.transactions.filter(t => t.customerId === customer.id).sort((a, b) => new Date(a.date) - new Date(b.date));
    const settings = getSettings();
    
    let runningBalance = 0;
    const rows = txns.map(t => {
        const isPurchase = t.type === 'purchase';
        const debit = isPurchase ? Number(t.grandTotal) || 0 : 0;
        const credit = !isPurchase ? Number(t.amount) || 0 : 0;
        runningBalance += debit - credit;
        return `<tr>
            <td style="border:1px solid #ddd;padding:6px 10px;font-size:12px">${formatDate(t.date)}</td>
            <td style="border:1px solid #ddd;padding:6px 10px;font-size:12px">${isPurchase ? 'Purchase' : 'Payment'}</td>
            <td style="border:1px solid #ddd;padding:6px 10px;font-size:12px;text-align:right">${debit > 0 ? formatCurrency(debit) : '-'}</td>
            <td style="border:1px solid #ddd;padding:6px 10px;font-size:12px;text-align:right">${credit > 0 ? formatCurrency(credit) : '-'}</td>
            <td style="border:1px solid #ddd;padding:6px 10px;font-size:12px;text-align:right;font-weight:bold">${formatCurrency(runningBalance)}</td>
        </tr>`;
    }).join('');
    
    const statementHTML = `
        <div id="statementContent" style="font-family:Inter,sans-serif;max-width:800px;margin:0 auto;padding:30px">
            <div style="text-align:center;margin-bottom:30px">
                <h2 style="font-size:24px;font-weight:800;color:#4338ca">${settings.shopName || 'Daily Hisab Pro'}</h2>
                <p style="color:#64748b;font-size:13px">${settings.address || ''}</p>
                <p style="color:#64748b;font-size:13px">${settings.phone || ''}</p>
            </div>
            <h3 style="text-align:center;font-size:18px;font-weight:700;margin-bottom:20px;border-bottom:2px solid #4338ca;padding-bottom:10px">Customer Statement</h3>
            <div style="display:flex;justify-content:space-between;margin-bottom:20px;font-size:13px">
                <div><strong>Customer:</strong> ${customer.name}<br><strong>Phone:</strong> ${customer.phone || 'N/A'}<br><strong>Address:</strong> ${customer.address || 'N/A'}</div>
                <div style="text-align:right"><strong>Date:</strong> ${formatDate(getTodayStr())}</div>
            </div>
            <table style="width:100%;border-collapse:collapse;margin-bottom:20px">
                <thead><tr style="background:#4338ca;color:white">
                    <th style="border:1px solid #ddd;padding:8px 10px;font-size:12px;text-align:left">Date</th>
                    <th style="border:1px solid #ddd;padding:8px 10px;font-size:12px;text-align:left">Type</th>
                    <th style="border:1px solid #ddd;padding:8px 10px;font-size:12px;text-align:right">Debit</th>
                    <th style="border:1px solid #ddd;padding:8px 10px;font-size:12px;text-align:right">Credit</th>
                    <th style="border:1px solid #ddd;padding:8px 10px;font-size:12px;text-align:right">Balance</th>
                </tr></thead>
                <tbody>${rows}</tbody>
            </table>
            <div style="display:flex;justify-content:flex-end;gap:30px;font-size:14px;font-weight:bold;background:#f8fafc;padding:15px;border-radius:8px">
                <span>Total Purchase: ${formatCurrency(bal.totalPurchase)}</span>
                <span>Total Paid: ${formatCurrency(bal.totalPaid)}</span>
                <span style="color:#f59e0b">Balance Due: ${formatCurrency(bal.balance)}</span>
            </div>
            <div style="display:flex;justify-content:space-between;margin-top:60px;font-size:12px;color:#94a3b8">
                <div style="border-top:1px solid #94a3b8;padding-top:5px;width:150px">Shop Signature</div>
                <div style="border-top:1px solid #94a3b8;padding-top:5px;width:150px;text-align:right">Customer Signature</div>
            </div>
        </div>
    `;
    
    openModal(`
        <div class="p-4">
            <div class="flex items-center justify-between mb-4">
                <h3 class="text-lg font-bold">Customer Statement</h3>
                <div class="flex gap-2">
                    <button onclick="printStatement()" class="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-500 transition flex items-center gap-1"><i data-lucide="printer" class="w-4 h-4"></i> Print</button>
                    <button onclick="closeModal()" class="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 transition"><i data-lucide="x" class="w-5 h-5"></i></button>
                </div>
            </div>
            <div style="max-height:400px;overflow-y:auto;border:1px solid #e2e8f0;border-radius:12px;background:white">${statementHTML}</div>
            <div id="statementHTML" class="hidden">${encodeURIComponent(statementHTML)}</div>
        </div>
    `);
}

function printStatement() {
    const encoded = document.getElementById('statementHTML').value;
    const html = decodeURIComponent(encoded);
    const win = window.open('', '_blank');
    win.document.write(`<html><head><title>Statement</title><style>body{margin:0;padding:20px;}</style></head><body>${html}</body></html>`);
    win.document.close();
    win.print();
}

// ============ PRODUCT MANAGEMENT ============
function renderProducts() {
    // Low stock alerts
    const lowStock = db.products.filter(p => Number(p.stock) <= Number(p.minStock || 5));
    const alertsEl = document.getElementById('lowStockAlerts');
    const alertListEl = document.getElementById('lowStockList');
    if (lowStock.length > 0) {
        alertsEl.classList.remove('hidden');
        alertListEl.innerHTML = lowStock.map(p => 
            `<span class="px-3 py-1 bg-amber-200 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300 rounded-full text-sm font-medium">${p.name} (${p.stock} left)</span>`
        ).join('');
    } else {
        alertsEl.classList.add('hidden');
    }
    
    const el = document.getElementById('productsList');
    if (db.products.length === 0) {
        el.innerHTML = `<div class="col-span-full text-center py-16">
            <div class="w-24 h-24 bg-gray-100 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4"><i data-lucide="package" class="w-12 h-12 text-gray-300 dark:text-gray-600"></i></div>
            <h3 class="text-xl font-semibold text-gray-500 dark:text-gray-400">No products yet</h3>
            <p class="text-gray-400 mt-1">Add your first product to get started</p>
            <button onclick="openProductModal()" class="mt-4 px-6 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl font-medium shadow-md transition hover:scale-[1.02]">Add Product</button>
        </div>`;
    } else {
        el.innerHTML = db.products.map((p, i) => {
            const isLow = Number(p.stock) <= Number(p.minStock || 5);
            return `<div class="product-card animate-fade-in-up bg-white dark:bg-slate-800/80 rounded-2xl border border-gray-200 dark:border-slate-700 p-5 hover:border-indigo-300 dark:hover:border-indigo-600 transition-all duration-300" style="animation-delay:${i * 0.05}s">
                <div class="flex items-start justify-between mb-3">
                    <div class="w-10 h-10 ${isLow ? 'bg-amber-100 dark:bg-amber-900/30' : 'bg-indigo-100 dark:bg-indigo-900/30'} rounded-xl flex items-center justify-center">
                        <i data-lucide="package" class="w-5 h-5 ${isLow ? 'text-amber-500' : 'text-indigo-500'}"></i>
                    </div>
                    <div class="flex items-center gap-1">
                        <button onclick="event.stopPropagation();openProductModal('${p.id}')" class="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 transition"><i data-lucide="edit-3" class="w-4 h-4 text-gray-500"></i></button>
                        <button onclick="event.stopPropagation();deleteProduct('${p.id}')" class="p-1.5 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30 transition"><i data-lucide="trash-2" class="w-4 h-4 text-red-500"></i></button>
                    </div>
                </div>
                <h3 class="font-semibold">${p.name}</h3>
                <p class="text-xs text-gray-500 mt-0.5">${p.category || 'Uncategorized'}</p>
                <div class="mt-3 pt-3 border-t border-gray-100 dark:border-slate-700 grid grid-cols-3 gap-2 text-center">
                    <div>
                        <p class="text-xs text-gray-400">Buy</p>
                        <p class="font-medium text-sm">${formatCurrency(p.purchasePrice)}</p>
                    </div>
                    <div>
                        <p class="text-xs text-gray-400">Sell</p>
                        <p class="font-medium text-sm text-emerald-500">${formatCurrency(p.sellingPrice)}</p>
                    </div>
                    <div>
                        <p class="text-xs text-gray-400">Stock</p>
                        <p class="font-medium text-sm ${isLow ? 'text-amber-500' : 'text-gray-700 dark:text-gray-300'}">${p.stock} ${p.unit || ''}</p>
                    </div>
                </div>
            </div>`;
        }).join('');
    }
    lucide.createIcons();
}

function openProductModal(productId) {
    const product = productId ? db.products.find(p => p.id === productId) : null;
    const isEdit = !!product;
    openModal(`
        <div class="p-6">
            <div class="flex items-center justify-between mb-6">
                <h3 class="text-xl font-bold">${isEdit ? 'Edit Product' : 'Add Product'}</h3>
                <button onclick="closeModal()" class="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-slate-700 transition"><i data-lucide="x" class="w-5 h-5"></i></button>
            </div>
            <div class="space-y-4">
                <div><label class="block text-sm font-medium mb-1">Product Name *</label><input type="text" id="prodName" value="${isEdit ? product.name : ''}" class="w-full px-4 py-2.5 bg-gray-50 dark:bg-slate-700 rounded-xl border border-gray-200 dark:border-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="Product name"></div>
                <div class="grid grid-cols-2 gap-4">
                    <div><label class="block text-sm font-medium mb-1">Category</label><input type="text" id="prodCategory" value="${isEdit ? (product.category || '') : ''}" class="w-full px-4 py-2.5 bg-gray-50 dark:bg-slate-700 rounded-xl border border-gray-200 dark:border-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="Category"></div>
                    <div><label class="block text-sm font-medium mb-1">Unit</label><select id="prodUnit" class="w-full px-4 py-2.5 bg-gray-50 dark:bg-slate-700 rounded-xl border border-gray-200 dark:border-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500"><option value="kg" ${isEdit && product.unit === 'kg' ? 'selected' : ''}>Kg</option><option value="pcs" ${isEdit && product.unit === 'pcs' ? 'selected' : ''}>Pcs</option><option value="l" ${isEdit && product.unit === 'l' ? 'selected' : ''}>Ltr</option><option value="m" ${isEdit && product.unit === 'm' ? 'selected' : ''}>Mtr</option><option value="box" ${isEdit && product.unit === 'box' ? 'selected' : ''}>Box</option><option value="pack" ${isEdit && product.unit === 'pack' ? 'selected' : ''}>Pack</option></select></div>
                </div
