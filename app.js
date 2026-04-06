// State
let users = JSON.parse(localStorage.getItem('fakturaTracker_users')) || [{ username: 'omega', password: 'MamHlad123', role: 'Admin' }];
let currentUser = localStorage.getItem('fakturaTracker_loggedUser') || null;
let invoices = [];
let subscriptions = [];
let currentFilteredInvoices = [];
let chartInstance = null;
let doughnutChartInstance = null;
let currentDetailInvoiceId = null;
let editingInvoiceId = null;

function seedData() {
    let localUsers = JSON.parse(localStorage.getItem('fakturaTracker_users'));

    if (!localStorage.getItem('fakturaTracker_force_seed_v5')) {
        const timestamp = Date.now();
        localUsers = [
            { username: 'omega', password: 'MamHlad123', role: 'Admin' },
            { username: 'pupek', password: 'pupek123', role: 'Uživatel' }
        ];
        localStorage.setItem('fakturaTracker_users', JSON.stringify(localUsers));

        const omegaInvoices = Array.from({ length: 10 }, (_, i) => ({
            id: timestamp + i,
            amount: Math.floor(Math.random() * 8000) + 200,
            vendor: `Dodavatel Omega ${i + 1}`,
            date: new Date(timestamp - i * 86400000).toISOString().split('T')[0],
            category: ['kancelar', 'sluzby', 'hardware', 'ostatni'][i % 4]
        }));
        localStorage.setItem('fakturaTracker_invoices_omega', JSON.stringify(omegaInvoices));

        const omegaSubs = Array.from({ length: 5 }, (_, i) => ({
            id: timestamp + 100 + i,
            vendor: `Služba Omega ${i + 1}`,
            amount: Math.floor(Math.random() * 1500) + 100,
            frequency: i % 2 === 0 ? 'monthly' : 'yearly',
            nextPayment: new Date(timestamp + (i + 1) * 86400000 * 5).toISOString().split('T')[0],
            category: ['sluzby', 'ostatni'][i % 2]
        }));
        localStorage.setItem('fakturaTracker_subs_omega', JSON.stringify(omegaSubs));

        const pupekInvoices = Array.from({ length: 10 }, (_, i) => ({
            id: timestamp + 200 + i,
            amount: Math.floor(Math.random() * 3000) + 100,
            vendor: `Dodavatel Pupek ${i + 1}`,
            date: new Date(timestamp - i * 86400000 * 2).toISOString().split('T')[0],
            category: ['kancelar', 'sluzby', 'hardware', 'ostatni'][(i + 1) % 4]
        }));
        localStorage.setItem('fakturaTracker_invoices_pupek', JSON.stringify(pupekInvoices));

        const pupekSubs = Array.from({ length: 5 }, (_, i) => ({
            id: timestamp + 300 + i,
            vendor: `Služba Pupek ${i + 1}`,
            amount: Math.floor(Math.random() * 500) + 50,
            frequency: i % 2 === 0 ? 'monthly' : 'yearly',
            nextPayment: new Date(timestamp + (i + 1) * 86400000 * 3).toISOString().split('T')[0],
            category: ['sluzby', 'ostatni'][(i + 1) % 2]
        }));
        localStorage.setItem('fakturaTracker_subs_pupek', JSON.stringify(pupekSubs));

        localStorage.setItem('fakturaTracker_force_seed_v5', '1');
        
        // Update loaded users
        users = localUsers;
    }
}
seedData();

const CATEGORY_COLORS = {
    'kancelar': '#3b82f6', // blue-500
    'sluzby': '#10b981',   // emerald-500
    'hardware': '#f59e0b', // amber-500
    'ostatni': '#6b7280'   // gray-500
};

const CATEGORY_LABELS = {
    'kancelar': 'Kancelář',
    'sluzby': 'Služby',
    'hardware': 'Hardware',
    'ostatni': 'Ostatní'
};

// DOM Elements
const views = {
    dashboard: document.getElementById('view-dashboard'),
    invoices: document.getElementById('view-invoices'),
    subscriptions: document.getElementById('view-subscriptions')
};
const modal = {
    overlay: document.getElementById('invoice-modal'),
    form: document.getElementById('invoice-form')
};
const subModal = {
    overlay: document.getElementById('subscription-modal'),
    form: document.getElementById('subscription-form')
};
const detailModal = {
    overlay: document.getElementById('detail-modal'),
    // fields
    vendor: document.getElementById('detail-vendor'),
    amount: document.getElementById('detail-amount'),
    date: document.getElementById('detail-date'),
    dueDate: document.getElementById('detail-dueDate'),
    vs: document.getElementById('detail-vs'),
    account: document.getElementById('detail-account'),
    ico: document.getElementById('detail-ico'),
    dic: document.getElementById('detail-dic'),
    paymentMethod: document.getElementById('detail-paymentMethod'),
    orderNumber: document.getElementById('detail-orderNumber'),
    internalNumber: document.getElementById('detail-internalNumber'),
    category: document.getElementById('detail-category'),
    deleteBtn: document.getElementById('btn-delete-invoice')
};

// Init
document.addEventListener('DOMContentLoaded', () => {
    lucide.createIcons();
    initializeTheme();

    if (currentUser) {
        loadUserData();
        showApp();
    } else {
        showLogin();
    }

    // Login Form Submit
    document.getElementById('login-form').addEventListener('submit', (e) => {
        e.preventDefault();
        handleLogin();
    });

    // Register Form Submit
    document.getElementById('register-form').addEventListener('submit', (e) => {
        e.preventDefault();
        handleRegister();
    });

    checkDueSubscriptions();
    renderApp();

    // Invoice Form Submit
    modal.form.addEventListener('submit', (e) => {
        e.preventDefault();
        addInvoice();
    });

    // Subscription Form Submit
    subModal.form.addEventListener('submit', (e) => {
        e.preventDefault();
        addSubscription();
    });

    // Filters
    const renderOnChange = () => renderLists();
    document.getElementById('search-input').addEventListener('input', renderOnChange);
    const filterCatEl = document.getElementById('filter-category');
    if (filterCatEl) filterCatEl.addEventListener('change', renderOnChange);
    const filterMonthEl = document.getElementById('filter-month');
    if (filterMonthEl) filterMonthEl.addEventListener('change', renderOnChange);

    // File Input (OCR)
    document.getElementById('invoice-file').addEventListener('change', handleFileUpload);

    // Date default to today
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('date').value = today;
    document.getElementById('sub-nextPayment').value = today;
});

// Navigation
function switchView(viewName) {
    // Nav active state
    document.querySelectorAll('.nav-links li').forEach(li => {
        li.classList.toggle('active', li.dataset.view === viewName);
    });

    // Hide all views
    Object.values(views).forEach(el => el.style.display = 'none');
    Object.values(views).forEach(el => el.classList.remove('active'));

    // Show selected
    views[viewName].style.display = 'block';

    // Toggle button visibility in header
    const btnNewInvoice = document.getElementById('btn-new-invoice');
    const btnNewSub = document.getElementById('btn-new-sub-header');

    if (btnNewInvoice && btnNewSub) {
        if (viewName === 'subscriptions') {
            btnNewInvoice.style.display = 'none';
            btnNewSub.style.display = 'flex';
        } else {
            btnNewInvoice.style.display = 'flex';
            btnNewSub.style.display = 'none';
        }
    }

    // Re-render incase of updates
    renderApp();
}

// Modals
function openModal() {
    editingInvoiceId = null;
    modal.overlay.classList.add('open');
    document.getElementById('scan-status').textContent = '';
    const modalTitle = document.querySelector('#invoice-modal .modal-header h2');
    if (modalTitle) modalTitle.textContent = 'Nová faktura';
}

function closeModal() {
    modal.overlay.classList.remove('open');
    modal.form.reset();
    document.getElementById('date').value = new Date().toISOString().split('T')[0];
    document.getElementById('scan-status').textContent = '';
}

function openSubModal() {
    subModal.overlay.classList.add('open');
}

function closeSubModal() {
    subModal.overlay.classList.remove('open');
    subModal.form.reset();
    document.getElementById('sub-nextPayment').value = new Date().toISOString().split('T')[0];
}

function openDetailModal(id) {
    const inv = invoices.find(i => i.id === id);
    if (!inv) return;
    
    currentDetailInvoiceId = id;

    detailModal.vendor.textContent = inv.vendor;
    detailModal.amount.textContent = formatCurrency(inv.amount);
    detailModal.date.textContent = formatDate(inv.date);
    detailModal.dueDate.textContent = inv.dueDate ? formatDate(inv.dueDate) : '-';
    detailModal.vs.textContent = inv.vs || '-';
    detailModal.account.textContent = inv.accountNumber || '-';
    detailModal.ico.textContent = inv.ico || '-';
    detailModal.dic.textContent = inv.dic || '-';
    detailModal.paymentMethod.textContent = inv.paymentMethod || '-';
    detailModal.orderNumber.textContent = inv.orderNumber || '-';
    detailModal.internalNumber.textContent = inv.internalNumber || '-';
    detailModal.category.textContent = CATEGORY_LABELS[inv.category] || inv.category;

    detailModal.deleteBtn.onclick = () => deleteInvoice(id);

    detailModal.overlay.classList.add('open');
}

function closeDetailModal() {
    detailModal.overlay.classList.remove('open');
}

function editInvoiceFromDetail() {
    const inv = invoices.find(i => i.id === currentDetailInvoiceId);
    if (!inv) return;
    
    closeDetailModal();
    editingInvoiceId = inv.id;
    
    document.getElementById('amount').value = inv.amount;
    document.getElementById('vendor').value = inv.vendor || '';
    document.getElementById('date').value = inv.date;
    document.getElementById('dueDate').value = inv.dueDate || '';
    document.getElementById('vs').value = inv.vs || '';
    document.getElementById('accountNumber').value = inv.accountNumber || '';
    document.getElementById('ico').value = inv.ico || '';
    document.getElementById('dic').value = inv.dic || '';
    document.getElementById('paymentMethod').value = inv.paymentMethod || '';
    document.getElementById('orderNumber').value = inv.orderNumber || '';
    document.getElementById('internalNumber').value = inv.internalNumber || '';
    document.getElementById('category').value = inv.category || 'ostatni';
    
    const modalTitle = document.querySelector('#invoice-modal .modal-header h2');
    if (modalTitle) modalTitle.textContent = 'Upravit fakturu';
    
    modal.overlay.classList.add('open');
}

// --- Auth Logic ---

function showLogin() {
    document.getElementById('login-screen').classList.remove('hidden');
    document.querySelector('.app-container').classList.add('hidden');
}

function showApp() {
    document.getElementById('login-screen').classList.add('hidden');
    document.querySelector('.app-container').classList.remove('hidden');

    // Update User Info in Sidebar
    const userDisplay = document.getElementById('user-display-name');
    const roleDisplay = document.getElementById('user-role');
    const avatar = document.querySelector('.user-profile .avatar');

    if (userDisplay && currentUser) {
        const userObj = users.find(u => u.username === currentUser);
        userDisplay.textContent = currentUser;
        if (roleDisplay) roleDisplay.textContent = userObj ? userObj.role : 'Uživatel';
        if (avatar) avatar.textContent = currentUser.charAt(0).toUpperCase();
    }

    renderApp();
}

function loadUserData() {
    if (!currentUser) return;
    invoices = JSON.parse(localStorage.getItem(`fakturaTracker_invoices_${currentUser}`)) || [];
    subscriptions = JSON.parse(localStorage.getItem(`fakturaTracker_subs_${currentUser}`)) || [];
}

function toggleAuthMode(mode) {
    const loginView = document.getElementById('auth-login');
    const registerView = document.getElementById('auth-register');
    const loginError = document.getElementById('login-error');
    const registerError = document.getElementById('register-error');

    loginError.textContent = '';
    registerError.textContent = '';

    if (mode === 'register') {
        loginView.classList.add('hidden');
        registerView.classList.remove('hidden');
    } else {
        loginView.classList.remove('hidden');
        registerView.classList.add('hidden');
    }
}

function handleLogin() {
    const user = document.getElementById('login-username').value.trim();
    const pass = document.getElementById('login-password').value;
    const errorEl = document.getElementById('login-error');

    const foundUser = users.find(u => u.username.toLowerCase() === user.toLowerCase() && u.password === pass);

    if (foundUser) {
        currentUser = foundUser.username; // Use proper casing
        localStorage.setItem('fakturaTracker_loggedUser', currentUser);
        loadUserData();
        errorEl.textContent = '';
        showApp();
    } else {
        errorEl.textContent = 'Nesprávné jméno nebo heslo.';
    }
}

function handleRegister() {
    const user = document.getElementById('register-username').value.trim();
    const pass = document.getElementById('register-password').value;
    const confirmPass = document.getElementById('register-confirm-password').value;
    const errorEl = document.getElementById('register-error');

    if (pass !== confirmPass) {
        errorEl.textContent = 'Hesla se neshodují.';
        return;
    }

    if (users.find(u => u.username === user)) {
        errorEl.textContent = 'Uživatel s tímto jménem již existuje.';
        return;
    }

    if (user.length < 3) {
        errorEl.textContent = 'Jméno musí mít alespoň 3 znaky.';
        return;
    }

    const newUser = { username: user, password: pass, role: 'Uživatel' };
    users.push(newUser);
    localStorage.setItem('fakturaTracker_users', JSON.stringify(users));

    currentUser = user;
    localStorage.setItem('fakturaTracker_loggedUser', user);
    loadUserData(); // Ensure isolated data is loaded (will be empty for new user)
    errorEl.textContent = '';
    showApp();
}

function handleLogout() {
    localStorage.removeItem('fakturaTracker_loggedUser');
    currentUser = null;
    location.reload();
}

function deleteInvoice(id) {
    if (confirm('Opravdu chcete smazat tuto fakturu?')) {
        invoices = invoices.filter(i => i.id !== id);
        saveData();
        closeDetailModal();
        renderApp();
    }
}

// --- Data Logic: Invoices ---

function addInvoice() {
    const amount = parseFloat(document.getElementById('amount').value);
    const vendor = document.getElementById('vendor').value;
    const date = document.getElementById('date').value;
    const dueDate = document.getElementById('dueDate').value;
    const accountNumber = document.getElementById('accountNumber').value;
    const vs = document.getElementById('vs').value;
    const ico = document.getElementById('ico').value;
    const dic = document.getElementById('dic').value;
    const paymentMethod = document.getElementById('paymentMethod').value;
    const orderNumber = document.getElementById('orderNumber').value;
    const internalNumber = document.getElementById('internalNumber').value;
    const category = document.getElementById('category').value;

    if (!amount || !vendor || !date) return;

    const invoiceData = {
        amount, vendor, date, dueDate, accountNumber, vs, ico, dic, paymentMethod, orderNumber, internalNumber, category
    };

    if (editingInvoiceId) {
        const index = invoices.findIndex(i => i.id === editingInvoiceId);
        if (index > -1) {
            invoices[index] = { ...invoices[index], ...invoiceData };
            saveData();
            renderApp();
        }
    } else {
        createInvoice(invoiceData);
    }

    closeModal();
}

function createInvoice(data) {
    const newInvoice = {
        id: Date.now(),
        isPaid: false,
        ...data
    };
    invoices.unshift(newInvoice); // Add to top
    saveData();
    renderApp();
}

function togglePaymentStatus(id) {
    const inv = invoices.find(i => i.id === id);
    if (inv) {
        inv.isPaid = !inv.isPaid;
        saveData();
        renderApp();
    }
}

function saveData() {
    if (!currentUser) return;
    localStorage.setItem(`fakturaTracker_invoices_${currentUser}`, JSON.stringify(invoices));
    localStorage.setItem(`fakturaTracker_subs_${currentUser}`, JSON.stringify(subscriptions));
    localStorage.setItem('fakturaTracker_users', JSON.stringify(users));
}

// --- Data Logic: Subscriptions ---

function addSubscription() {
    const vendor = document.getElementById('sub-vendor').value;
    const amount = parseFloat(document.getElementById('sub-amount').value);
    const frequency = document.getElementById('sub-frequency').value;
    const nextPayment = document.getElementById('sub-nextPayment').value;
    const category = document.getElementById('sub-category').value;

    if (!vendor || !amount || !nextPayment) return;

    const newSub = {
        id: Date.now(),
        vendor,
        amount,
        frequency,
        nextPayment,
        category
    };

    subscriptions.push(newSub);
    saveData();
    closeSubModal();
    renderApp();
}

function checkDueSubscriptions() {
    // Just a visual check, specific logic handled in render
}

function paySubscription(id) {
    const subIndex = subscriptions.findIndex(s => s.id === id);
    if (subIndex === -1) return;

    const sub = subscriptions[subIndex];

    // Create Invoice
    createInvoice({
        amount: sub.amount,
        vendor: sub.vendor,
        date: new Date().toISOString().split('T')[0],
        dueDate: new Date().toISOString().split('T')[0],
        accountNumber: '',
        vs: '',
        category: sub.category
    });

    // Update Next Payment Date
    const currentNext = new Date(sub.nextPayment);
    if (sub.frequency === 'monthly') {
        currentNext.setMonth(currentNext.getMonth() + 1);
    } else if (sub.frequency === 'yearly') {
        currentNext.setFullYear(currentNext.getFullYear() + 1);
    }
    sub.nextPayment = currentNext.toISOString().split('T')[0];

    saveData();
    renderApp();
}

function deleteSubscription(id) {
    if (confirm('Opravdu zrušit toto předplatné?')) {
        subscriptions = subscriptions.filter(s => s.id !== id);
        saveData();
        renderApp();
    }
}

// --- OCR Logic ---

async function handleFileUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    const statusEl = document.getElementById('scan-status');
    statusEl.innerHTML = '<i data-lucide="loader"></i> Zpracovávám fakturu...';
    lucide.createIcons();

    try {
        let text = '';
        if (file.type === 'application/pdf') {
            text = await processPDF(file);
        } else {
            text = await processImage(file);
        }

        parseInvoiceText(text);
        statusEl.innerHTML = '<i data-lucide="check"></i> Hotovo';
        lucide.createIcons();
    } catch (err) {
        console.error(err);
        statusEl.innerText = 'Chyba při čtení faktury.';
    }
}

async function processImage(file) {
    const { data: { text } } = await Tesseract.recognize(file, 'ces');
    return text;
}

async function processPDF(file) {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument(arrayBuffer).promise;
    const page = await pdf.getPage(1); // First page only

    const viewport = page.getViewport({ scale: 2.0 }); // Higher scale for better OCR
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    canvas.height = viewport.height;
    canvas.width = viewport.width;

    await page.render({ canvasContext: context, viewport: viewport }).promise;

    const dataUrl = canvas.toDataURL('image/png');
    const { data: { text } } = await Tesseract.recognize(dataUrl, 'ces');
    return text;
}

const VENDOR_PATTERNS = [
    // Velkoobchody / Supermarkety / Jídlo
    { pattern: /(makro|billa|lidl|kaufland|albert|penny|coop|tesco|globus|jip|bidfood)/i, category: 'kancelar', type: 'wholesaler' },
    { pattern: /(restaurace|mcdonald|kfc|starbucks|costa|burger king)/i, category: 'ostatni', type: 'food' },

    // Služby
    { pattern: /(o2|t-mobile|vodafone|nordic|upc|internet|netflix|spotify|youtube|disney|hbo|gts\s*alive|isic)/i, category: 'sluzby' },
    { pattern: /(innogy|eon|pre|cez|energie|plyn)/i, category: 'sluzby' },

    // Hardware / Electro
    { pattern: /(alza|czc|datart|electroworld|smarty|istyle|mironet)/i, category: 'hardware' },

    // Mobilní hry / App Stores
    { pattern: /(steam|bioware|supercell|brawl stars|clash of clans|roblox|epic games|playstation|xbox|nintendo|google\s*play|app\s*store|apple)/i, category: 'ostatni' },
];

const GAME_PATTERNS = /(steam|bioware|supercell|brawl stars|clash of clans|roblox|epic games|playstation|xbox|nintendo|google\s*play|app\s*store|apple)/i;

function parseInvoiceText(text) {
    console.log("Raw OCR Text:", text);
    const lowerText = text.toLowerCase();

    // --- 1. Vendor & Category Detection ---
    let detectedCategory = 'ostatni'; // Default
    let detectedVendor = '';

    // Check specific lists
    /* 
    User requested NOT to fill Vendor Name automatically for these invoices, 
    but we still need detection for Category mapping.
    */
    if (GAME_PATTERNS.test(lowerText)) {
        detectedCategory = 'ostatni';
        const match = lowerText.match(GAME_PATTERNS);
        if (match) detectedVendor = match[0].charAt(0).toUpperCase() + match[0].slice(1);
    } else {
        for (const item of VENDOR_PATTERNS) {
            if (item.pattern.test(lowerText)) {
                if (item.type === 'wholesaler') {
                    detectedCategory = 'kancelar';
                } else {
                    detectedCategory = item.category;
                }

                const match = lowerText.match(item.pattern);
                if (match) detectedVendor = match[0].toUpperCase();
                break;
            }
        }
    }

    // Generic Company Detection (s.r.o., a.s.)
    if (!detectedVendor) {
        const lines = text.split('\n').map(l => l.trim());
        for (const line of lines) {
            if (/(s\.r\.o\.|spol\. s r\.o\.|a\.s\.|inc\.|ltd\.|gts alive)/i.test(line)) {
                if (line.length < 50 && !line.includes('ulice') && !line.includes('náměstí')) {
                    detectedVendor = line;
                    break;
                }
            }
        }
    }

    // Fallback: First meaningful line
    if (!detectedVendor) {
        const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 2);
        const ignoreWords = /faktura|doklad|daňový|platba|účet|objednávka|datum|strana/i;
        for (let i = 0; i < Math.min(lines.length, 5); i++) {
            if (!ignoreWords.test(lines[i])) {
                detectedVendor = lines[i];
                break;
            }
        }
    }

    // User requested: "Jen Název zanech na uživateli". 
    // So we do NOT set the vendor field value.
    // if (detectedVendor) document.getElementById('vendor').value = detectedVendor; 

    if (detectedCategory) document.getElementById('category').value = detectedCategory;


    // --- 2. Amount Extraction (Improved) ---
    let amountFound = null;

    // Strategy A: Explicit "Celkem uhrazeno" / "Total" lines
    // GTS Example: "CELKEM UHRAZENO CZK 400.00" or similar
    const totalLines = text.match(/(?:celkem|celkem uhrazeno|total|k úhradě|suma).*/gi);
    if (totalLines) {
        const lastLine = totalLines[totalLines.length - 1];
        // Look for decimals: 400.00, 1 200,50
        const numbers = lastLine.match(/(\d[\d\s]*[.,]\d{2})/g);
        if (numbers) {
            amountFound = numbers[numbers.length - 1];
        } else {
            // Sometimes it's just "400" without decimals if exact
            const simpleNums = lastLine.match(/(\d[\d\s]*)/g).filter(n => n.trim().length > 0);
            if (simpleNums.length > 0) amountFound = simpleNums[simpleNums.length - 1];
        }
    }

    // Strategy B: Fallback
    if (!amountFound) {
        const amountRegex = /(\d[\d\s]*[.,]\d{2}|\d[\d\s]*)(?=\s*(?:Kč|CZK|EUR|-))/i;
        const amountMatch = text.match(amountRegex);
        if (amountMatch) amountFound = amountMatch[0];
    }

    if (amountFound) {
        let clean = amountFound.replace(/\s/g, '').replace(',', '.');
        if (clean.endsWith('.')) clean = clean.slice(0, -1);
        document.getElementById('amount').value = parseFloat(clean) || '';
    }

    // --- 3. Date: DD.MM.YYYY or DD/MM/YYYY ---
    // GTS Example: 11/03/2025
    const dateRegex = /(\d{1,2})[./](\d{1,2})[./](\d{2,4})/;
    const dateMatch = text.match(dateRegex);
    if (dateMatch) {
        let [_, d, m, y] = dateMatch;
        if (y.length === 2) y = "20" + y;
        const fmtDate = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
        document.getElementById('date').value = fmtDate;
    }

    // --- 4. VS ---
    // GTS Example: "Variabilní symbol: 0825015588"
    const vsRegex = /(?:vs|symbol|var\.?|variabilní[:\s]*symbol)[:\s]*(\d{4,10})/i;
    const vsMatch = text.match(vsRegex);
    if (vsMatch) document.getElementById('vs').value = vsMatch[1];

    // --- 5. Account ---
    const accRegex = /(\d{0,6}-?\d{2,16}\/\d{4})/; // Strict format with slash
    const accMatch = text.match(accRegex);
    if (accMatch) document.getElementById('accountNumber').value = accMatch[0];

    // --- 6. ICO & DIC ---
    // GTS Example: "IČO 26193272"
    const icoRegex = /(?:IČ|IČO|ICO)[:\s]*(\d{8})/i;
    const icoMatch = text.match(icoRegex);
    if (icoMatch) document.getElementById('ico').value = icoMatch[1];

    const dicRegex = /(?:DIČ|DIC)[:\s]*(CZ\d{8,10})/i;
    const dicMatch = text.match(dicRegex);
    if (dicMatch) document.getElementById('dic').value = dicMatch[1];

    // --- 7. Payment Method ---
    // GTS Example: "Způsob platby: Platební karta"
    const payMethodRegex = /(?:způsob\s*platby|úhrada)[:\s]*([a-zA-ZáčďéěíňóřšťúůýžÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ\s]+)(?:\n|$)/i;
    const payMatch = text.match(payMethodRegex);
    if (payMatch) document.getElementById('paymentMethod').value = payMatch[1].trim();

    // --- 8. Order Number ---
    // GTS Example: "Číslo objednávky: 6521846"
    const orderRegex = /(?:číslo\s*objednávky|objednávka\s*č\.?)[:\s]*(\d+)/i;
    const orderMatch = text.match(orderRegex);
    if (orderMatch) document.getElementById('orderNumber').value = orderMatch[1];

    // --- 9. Internal Number ---
    // GTS Example: "Interní číslo: ACS25015591"
    const internalRegex = /(?:interní\s*číslo)[:\s]*([A-Z0-9]+)/i;
    const internalMatch = text.match(internalRegex);
    if (internalMatch) document.getElementById('internalNumber').value = internalMatch[1];
}


// --- Rendering ---

function formatCurrency(num) {
    return new Intl.NumberFormat('cs-CZ', { style: 'currency', currency: 'CZK', maximumFractionDigits: 0 }).format(num);
}

function formatDate(dateStr) {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleDateString('cs-CZ');
}

function renderApp() {
    renderStats();
    renderChart();
    renderLists();
    renderSubscriptions();
    lucide.createIcons();
}

// Helper to get monthly cost of ALL active subscriptions
function getMonthlySubscriptionCost() {
    return subscriptions.reduce((sum, sub) => {
        if (sub.frequency === 'monthly') return sum + sub.amount;
        if (sub.frequency === 'yearly') return sum + (sub.amount / 12);
        return sum;
    }, 0);
}

function renderStats() {
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth();

    // 1. Actual Invoices
    const invoicesYear = invoices
        .filter(inv => new Date(inv.date).getFullYear() === currentYear)
        .reduce((sum, inv) => sum + inv.amount, 0);

    const invoicesMonth = invoices
        .filter(inv => {
            const d = new Date(inv.date);
            return d.getFullYear() === currentYear && d.getMonth() === currentMonth;
        })
        .reduce((sum, inv) => sum + inv.amount, 0);

    // 2. Projected / Recurring
    // For Month: Add subscriptions that are due this month (or monthly ones) IF they haven't been paid yet.
    // Simplifying assumption: User wants "Total Budgeted" = Actual + Remaining Scheduled.
    // For now, let's just show "Actual Spent + Estimated Remaining"??
    // Actually simplicity is key. "Celkem výdaje" usually implies what has been spent. 
    // BUT user said "Pravidelné platby se neukazují". 
    // Implies they want to see the Annual/Monthly BURDEN.

    // Let's add the Monthly Subscription Cost * 12 to the Year? No, that's guessing.
    // Let's just add the value of *Active Subscriptions* to the current month's stats?
    // "Tento měsíc" = Invoices + (Subscriptions that trigger this month).

    // Calculate subscriptions due in current month
    const subsThisMonth = subscriptions.reduce((sum, sub) => {
        // If monthly, it counts. If yearly, check if month matches??
        // Doing simple "Monthly Run Rate" might be better for "Budget".
        // But let's stick to "Due Date" logic.
        const nextPay = new Date(sub.nextPayment);
        const isMonthly = sub.frequency === 'monthly';
        const isYearlyDue = sub.frequency === 'yearly' && nextPay.getMonth() === currentMonth && nextPay.getFullYear() === currentYear;

        if (isMonthly || isYearlyDue) {
            return sum + sub.amount;
        }
        return sum;
    }, 0);

    // We only want to add subs that are NOT yet turned into invoices.
    // This is hard to track perfectly without linking them.
    // Let's just show "Invoiced" + "Recurring" separately? 
    // Or just Sum them and trust the user clicks "Pay". 
    // If they click Pay, it becomes an Invoice. The Sub date moves to Next Month.
    // So 'subsThisMonth' calculated above looks at 'nextPayment'.
    // If nextPayment is THIS MONTH, it hasn't been paid.
    // If nextPayment is NEXT MONTH, it has been paid (or is future).

    // Refined Logic based on `nextPayment`:
    const pendingSubsMonth = subscriptions.reduce((sum, sub) => {
        const d = new Date(sub.nextPayment);
        if (d.getFullYear() === currentYear && d.getMonth() === currentMonth) {
            return sum + sub.amount;
        }
        // If it's overdue (past month), technically it's also "Pending" for now/past.
        // Let's just catch Current Month.
        return sum;
    }, 0);

    const totalMonth = invoicesMonth + pendingSubsMonth;

    // For Year: Add invoices + pending subs for rest of year? 
    // Let's keep Year as "Real Invoices Only" to be safe, OR "Real + 12*Monthly"?
    // User complaint: "se neukazují".
    // Let's add pendingSubsMonth to year as well.
    const totalYear = invoicesYear + pendingSubsMonth; // At minimum add current month's pending.

    document.getElementById('total-year').textContent = formatCurrency(totalYear);
    document.getElementById('total-month').textContent = formatCurrency(totalMonth);
}

// --- Theme Logic ---
function toggleTheme() {
    const isDark = document.documentElement.classList.toggle('dark-mode');
    localStorage.setItem('fakturaTracker_theme', isDark ? 'dark' : 'light');
    updateThemeIcon(isDark);
    
    // Update chart colors if chart exists
    if (chartInstance) {
        chartInstance.options.scales.x.grid.color = isDark ? '#334155' : '#e2e8f0';
        chartInstance.options.scales.x.ticks.color = isDark ? '#94a3b8' : '#64748b';
        chartInstance.options.scales.y.grid.color = isDark ? '#334155' : '#e2e8f0';
        chartInstance.options.scales.y.ticks.color = isDark ? '#94a3b8' : '#64748b';
        chartInstance.options.plugins.legend.labels.color = isDark ? '#f8fafc' : '#1e293b';
        chartInstance.update();
    }
    
    if (doughnutChartInstance) {
        doughnutChartInstance.options.plugins.legend.labels.color = isDark ? '#f8fafc' : '#1e293b';
        doughnutChartInstance.update();
    }
}

function updateThemeIcon(isDark) {
    const icon = document.getElementById('theme-icon');
    if (icon) {
        // Change icon based on theme
        icon.setAttribute('data-lucide', isDark ? 'sun' : 'moon');
        lucide.createIcons();
    }
}

function initializeTheme() {
    const savedTheme = localStorage.getItem('fakturaTracker_theme');
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    
    const isDark = savedTheme === 'dark' || (!savedTheme && prefersDark);
    if (isDark) {
        document.documentElement.classList.add('dark-mode');
    }
    // Icon update will happen when DOM is ready or after renderApp
}

function renderLists() {
    const searchInput = document.getElementById('search-input');
    const query = searchInput ? searchInput.value.toLowerCase() : '';
    const filterCatEl = document.getElementById('filter-category');
    const filterCat = filterCatEl ? filterCatEl.value : '';
    const filterMonthEl = document.getElementById('filter-month');
    const filterMonth = filterMonthEl ? filterMonthEl.value : '';

    const filteredInvoices = invoices.filter(inv => {
        const matchesSearch = inv.vendor.toLowerCase().includes(query) ||
            inv.amount.toString().includes(query) ||
            (inv.vs && inv.vs.includes(query));
            
        const matchesCat = filterCat ? inv.category === filterCat : true;
        
        let matchesMonth = true;
        if (filterMonth) {
            matchesMonth = inv.date.substring(0, 7) === filterMonth;
        }

        return matchesSearch && matchesCat && matchesMonth;
    });

    currentFilteredInvoices = filteredInvoices;

    const createItemHTML = (inv) => {
        const categoryLabel = CATEGORY_LABELS[inv.category] || inv.category;
        const vsInfo = inv.vs ? ` • VS: ${inv.vs}` : '';
        const paidClass = inv.isPaid ? 'paid' : '';
        const paidChecked = inv.isPaid ? 'checked' : '';

        return `
        <li class="invoice-item ${paidClass}">
            <div class="invoice-info" onclick="openDetailModal(${inv.id})" style="cursor: pointer; flex-grow: 1;">
                <div class="invoice-icon" style="color: ${CATEGORY_COLORS[inv.category] || '#64748b'}">
                    <i data-lucide="receipt"></i>
                </div>
                <div class="invoice-details">
                    <span class="vendor">${inv.vendor}</span>
                    <span class="date">${formatDate(inv.date)} • ${categoryLabel}${vsInfo}</span>
                </div>
            </div>
            <div style="display: flex; gap: 12px; align-items: center;">
                <input type="checkbox" class="payment-checkbox" ${paidChecked} onchange="togglePaymentStatus(${inv.id})" title="Označit jako zaplacené" style="width: 18px; height: 18px; cursor: pointer;">
                <div class="invoice-amount" onclick="openDetailModal(${inv.id})" style="cursor: pointer;">
                    -${formatCurrency(inv.amount)}
                </div>
            </div>
        </li>
    `};

    // Recent
    const recentListEl = document.getElementById('recent-invoices-list');
    if (recentListEl) {
        recentListEl.innerHTML = filteredInvoices
            .slice(0, 5)
            .map(createItemHTML)
            .join('');
    }

    const allListEl = document.getElementById('all-invoices-list');
    if (allListEl) {
        allListEl.innerHTML = filteredInvoices
            .map(createItemHTML)
            .join('');
    }
}

function renderSubscriptions() {
    const listEl = document.getElementById('subscriptions-list');
    if (!listEl) return;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    listEl.innerHTML = subscriptions.map(sub => {
        const nextPayment = new Date(sub.nextPayment);
        nextPayment.setHours(0, 0, 0, 0);

        const isDue = nextPayment <= today;
        const categoryLabel = CATEGORY_LABELS[sub.category] || sub.category;

        return `
        <li class="invoice-item">
            <div class="invoice-info">
                <div class="invoice-icon" style="color: ${CATEGORY_COLORS[sub.category] || '#64748b'}">
                    <i data-lucide="calendar-clock"></i>
                </div>
                <div class="invoice-details">
                    <span class="vendor">${sub.vendor}</span>
                    <span class="date">${sub.frequency === 'monthly' ? 'Měsíčně' : 'Ročně'} • Další platba: ${formatDate(sub.nextPayment)}</span>
                </div>
            </div>
            <div style="display: flex; gap: 10px; align-items: center;">
                <div class="invoice-amount" style="font-size: 0.9em;">
                    -${formatCurrency(sub.amount)}
                </div>
                ${isDue ? `
                    <button class="btn-sm btn-primary" onclick="paySubscription(${sub.id})" title="Zaplatit (Vytvořit fakturu)">
                        Zaplatit
                    </button>
                ` : `
                    <button class="btn-sm" onclick="deleteSubscription(${sub.id})" style="color: #ef4444; background: none; border: none;">
                        <i data-lucide="trash-2" style="width: 16px; height: 16px;"></i>
                    </button>
                `}
            </div>
        </li>
        `;
    }).join('');
}

function renderChart() {
    const ctx = document.getElementById('expenseChart');
    if (!ctx) return;

    // Prepare Jan-Dec labels for current year
    const labels = [];
    const monthsData = [];
    const currentYear = new Date().getFullYear();

    for (let i = 0; i < 12; i++) {
        const d = new Date(currentYear, i, 1);
        labels.push(d.toLocaleDateString('cs-CZ', { month: 'long' })); // or 'short'
        monthsData.push({ month: i, year: currentYear });
    }

    // Dataset structure: One dataset per category
    const validCategories = Object.keys(CATEGORY_COLORS);
    const datasets = validCategories.map(cat => {
        const data = monthsData.map(timePoint => {
            // 1. Invoices
            const invSum = invoices
                .filter(inv => {
                    const invDate = new Date(inv.date);
                    return inv.category === cat &&
                        invDate.getMonth() === timePoint.month &&
                        invDate.getFullYear() === timePoint.year;
                })
                .reduce((s, inv) => s + inv.amount, 0);

            // 2. Pending Subscriptions (Visualized only for Current/Future months)
            // If we are in the past, we assume they were paid (invoiced) or ignored.
            // If TimePoint >= CurrentMonth, show Subscriptions that correspond to that month.
            // This gives a "Future View".
            let subSum = 0;
            const now = new Date();
            const isFutureOrCurrent = (timePoint.year > now.getFullYear()) ||
                (timePoint.year === now.getFullYear() && timePoint.month >= now.getMonth());

            if (isFutureOrCurrent) {
                // Find subs that fall on this month
                subSum = subscriptions.reduce((s, sub) => {
                    if (sub.category !== cat) return s;

                    // If monthly, it hits every future month
                    if (sub.frequency === 'monthly') return s + sub.amount;

                    // If yearly, checks month
                    const d = new Date(sub.nextPayment);
                    if (sub.frequency === 'yearly' && d.getMonth() === timePoint.month) return s + sub.amount;

                    return s;
                }, 0);
            }

            // Note: This matches "Total Month" logic roughly.
            // But if a user *already paid* this month (created invoice), subscription is moved to next month.
            // So `subSum` will be 0 for this month (correct).
            // But for Next Month, it will show up (correct).

            return invSum + subSum;
        });

        return {
            label: CATEGORY_LABELS[cat],
            data: data,
            backgroundColor: CATEGORY_COLORS[cat],
            borderRadius: 4,
            stack: 'Stack 0',
        };
    });

    if (chartInstance) {
        chartInstance.destroy();
    }

    chartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    grid: { display: false },
                    stacked: true
                },
                x: {
                    grid: { display: false },
                    stacked: true
                }
            },
            plugins: {
                legend: {
                    display: true,
                    position: 'bottom',
                    labels: { usePointStyle: true, boxWidth: 6 }
                },
                tooltip: {
                    mode: 'index',
                    intersect: false
                }
            }
        }
    });

    // Doughnut Chart
    const doughnutCtx = document.getElementById('categoryChart');
    if (doughnutCtx) {
        const doughnutData = validCategories.map(cat => {
            return invoices
                .filter(inv => inv.category === cat && new Date(inv.date).getFullYear() === currentYear)
                .reduce((s, inv) => s + inv.amount, 0);
        });

        if (doughnutChartInstance) {
            doughnutChartInstance.destroy();
        }

        const isDark = document.documentElement.classList.contains('dark-mode');

        doughnutChartInstance = new Chart(doughnutCtx, {
            type: 'doughnut',
            data: {
                labels: validCategories.map(c => CATEGORY_LABELS[c]),
                datasets: [{
                    data: doughnutData,
                    backgroundColor: validCategories.map(c => CATEGORY_COLORS[c]),
                    borderWidth: 0,
                    hoverOffset: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            usePointStyle: true,
                            boxWidth: 6,
                            color: isDark ? '#f8fafc' : '#1e293b'
                        }
                    }
                },
                cutout: '65%'
            }
        });
    }
}

function exportToCSV() {
    const dataToExport = currentFilteredInvoices.length > 0 ? currentFilteredInvoices : invoices;
    if (invoices.length === 0) {
        alert("Žádná data k exportu.");
        return;
    }

    let csvContent = "data:text/csv;charset=utf-8,\uFEFF";
    csvContent += "ID;Datum;Dodavatel;Kategorie;Částka;Splatnost;VS;IČO;DIČ;Způsob Platby;Zaplaceno\r\n";

    dataToExport.forEach(inv => {
        const id = inv.id;
        const date = inv.date || '';
        const vendor = `"${(inv.vendor || '').replace(/"/g, '""')}"`;
        const category = inv.category || '';
        const amount = inv.amount || 0;
        const dueDate = inv.dueDate || '';
        const vs = inv.vs || '';
        const ico = inv.ico || '';
        const dic = inv.dic || '';
        const paymentMethod = `"${(inv.paymentMethod || '').replace(/"/g, '""')}"`;
        const isPaid = inv.isPaid ? 'Ano' : 'Ne';
        
        const row = [id, date, vendor, category, amount, dueDate, vs, ico, dic, paymentMethod, isPaid].join(";");
        csvContent += row + "\r\n";
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `faktury_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}
