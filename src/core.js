// ==========================================
// VIP BANK - ARQUIVO CENTRAL (ÚNICA FONTE DE VERDADE)
// ==========================================
console.log('✅ VIP BANK - Core carregado');

// Configuração do Firebase (apenas aqui!)
const firebaseConfig = {
    apiKey: "AIzaSyDcAHKYygweCnoXdZr1JRebLwKTSryK1BU",
    authDomain: "vip-bank-f183b.firebaseapp.com",
    projectId: "vip-bank-f183b"
};

// Inicialização do Firebase (apenas aqui!)
try {
    firebase.initializeApp(firebaseConfig);
    console.log('✅ Firebase inicializado com sucesso');
} catch (e) {
    // Se já inicializou (hot reload), ignora erro
    if (!e.message.includes('already exists')) {
        console.error('❌ Erro ao inicializar Firebase:', e);
    }
}

// Namespace global VIPBANK (para evitar poluição)
window.VIPBANK = {
    // Instâncias Firebase
    db: firebase.firestore(),
    auth: firebase.auth(),
    functions: firebase.functions(),

    // Variáveis globais centralizadas
    ADMIN_EMAIL: 'jjoserobertorocharocha@gmail.com',
    ASAAS_PIX_FEE: 3.99,
    currentUser: null,
    balance: 0.00,
    apiKey: '',
    transactions: [],
    userPassword: '',
    userTransPassword: '',
    userCPF: '',
    userPixKey: '',
    pendingTransfer: null,
    balanceHidden: false,
    globalUserData: null,
    qrScanner: null,
    qrPaymentData: null,
    adminClickCount: 0,
    isAdmin: false,
    unreadTransactions: 0,

    // Regex para validação
    regex: {
        CPF: /^\d{3}\.\d{3}\.\d{3}-\d{2}$/,
        CNPJ: /^\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}$/,
        EMAIL: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
        CELULAR: /^\(\d{2}\) 9\d{4}-\d{4}$/,
        UUID: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
        CPF_RAW: /^\d{11}$/,
        CNPJ_RAW: /^\d{14}$/,
        CELULAR_RAW: /^(?:55)?\d{11}$/
    },

    // Função para SINCRONIZAR variáveis locais de volta ao namespace
    sync: function(vars) {
        Object.assign(this, vars);
    }
};

// Configura persistência de autenticação
VIPBANK.auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
console.log('✅ Namespace VIPBANK criado com sucesso');
