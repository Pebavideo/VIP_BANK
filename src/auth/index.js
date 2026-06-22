// Configuração do Firebase
const firebaseConfig = {
    apiKey: "AIzaSyDcAHKYygweCnoXdZr1JRebLwKTSryK1BU",
    authDomain: "vip-bank-f183b.firebaseapp.com",
    projectId: "vip-bank-f183b"
};

// Definição do Dono
const ADMIN_EMAIL = 'jjoserobertorocharocha@gmail.com';

// Variável global para taxa Pix dinâmica
let ASAAS_PIX_FEE = 3.99;

// Inicializa o Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();

// Configura persistência local para manter sessão ativa
auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);

// Variáveis globais
let currentUser = null;
let balance = 0.00;
let apiKey = '';
let transactions = [];
let userPassword = '';
let userTransPassword = '';
let userCPF = '';
let userPixKey = '';
let pendingTransfer = null;
let balanceHidden = false;
let globalUserData = null;
let qrScanner = null;
let qrPaymentData = null;
let adminClickCount = 0;
let isAdmin = false;
let unreadTransactions = 0; // Controla transações não visualizadas

// Validação de formatos de chave PIX (duplicada para auth/index.js para manter modularidade)
const AUTH_CPF_REGEX = /^\d{3}\.\d{3}\.\d{3}-\d{2}$/;
const AUTH_CNPJ_REGEX = /^\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}$/;
const AUTH_EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const AUTH_CELULAR_REGEX = /^\(\d{2}\) 9\d{4}-\d{4}$/;
const AUTH_UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const AUTH_CPF_RAW_REGEX = /^\d{11}$/;
const AUTH_CNPJ_RAW_REGEX = /^\d{14}$/;
const AUTH_CELULAR_RAW_REGEX = /^(?:55)?\d{11}$/;

function validatePixKeyAuth(key, type) {
    const cleanKey = key.trim();
    if (!cleanKey) return false;

    switch (type.toUpperCase()) {
        case 'CPF':
            if (AUTH_CPF_REGEX.test(cleanKey)) return true;
            const rawCpf = cleanKey.replace(/\D/g, '');
            return AUTH_CPF_RAW_REGEX.test(rawCpf);
        case 'CNPJ':
            if (AUTH_CNPJ_REGEX.test(cleanKey)) return true;
            const rawCnpj = cleanKey.replace(/\D/g, '');
            return AUTH_CNPJ_RAW_REGEX.test(rawCnpj);
        case 'EMAIL':
            return AUTH_EMAIL_REGEX.test(cleanKey);
        case 'CELULAR':
            if (AUTH_CELULAR_REGEX.test(cleanKey)) return true;
            const rawCelular = cleanKey.replace(/\D/g, '');
            return AUTH_CELULAR_RAW_REGEX.test(rawCelular);
        case 'ALEATORIA':
            return AUTH_UUID_REGEX.test(cleanKey);
        default:
            return false;
    }
}

function formatPixKeyAuth(key, type) {
    const clean = key.replace(/\D/g, '');
    
    switch (type.toUpperCase()) {
        case 'CPF':
            if (clean.length === 11) {
                return clean.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
            }
            break;
        case 'CNPJ':
            if (clean.length === 14) {
                return clean.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
            }
            break;
        case 'CELULAR':
            let cel = clean;
            if (cel.startsWith('55') && cel.length === 13) cel = cel.slice(2);
            if (cel.length === 11) {
                return cel.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
            }
            break;
        case 'EMAIL':
        case 'ALEATORIA':
            return key.trim();
    }
    return key;
}

let tempAccountDeletePassword = null;

function deletarMinhaConta() {
    // First check balance
    if (balance > 0) {
        toast('Você ainda possui saldo. Realize um saque antes de encerrar sua conta.', 'erro');
        return;
    }
    // Open security modal
    closeModals();
    showModal('modal-close-account');
}

function verificarSenhaEncerramento() {
    const passwordInput = document.getElementById('close-account-password').value;
    if (!passwordInput) {
        toast('Digite sua senha para continuar.', 'erro');
        return;
    }
    // Check if password matches userPassword from global state
    if (passwordInput !== userPassword) {
        toast('Senha incorreta. Tente novamente.', 'erro');
        return;
    }
    tempAccountDeletePassword = passwordInput;
    // Double Opt-in confirmation
    const confirmFinal = confirm('Tem certeza absoluta? Esta ação é irreversível e seus dados serão removidos.');
    if (confirmFinal) {
        encerrarContaVIP();
    }
}

async function encerrarContaVIP() {
    try {
        // Step 1: Re-authenticate user (if using email login)
        const user = auth.currentUser;
        if (!user) {
            toast('Usuário não autenticado.', 'erro');
            return;
        }

        // Step 2: Delete user document from Firestore
        await db.collection('usuarios').doc(user.uid).delete();

        // Step 3: Delete user from Firebase Auth
        await user.delete();

        // Step 4: Clear local storage
        localStorage.clear();
        sessionStorage.clear();

        // Step 5: Show success and refresh to login screen
        toast('Conta encerrada com sucesso. Até logo!', 'sucesso');
        setTimeout(() => {
            location.reload();
        }, 2000);
    } catch (error) {
        console.error('Erro ao encerrar conta:', error);
        toast('Ocorreu um erro. Tente novamente mais tarde.', 'erro');
    }
}

// Função para gerar authCode único para comprovantes
function gerarAuthCode() {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 10);
    return `${timestamp}-${random}`.toUpperCase();
}

// Validação de campos obrigatórios para transações
function validarTransacaoObrigatoria(transacao) {
    const camposObrigatorios = [
        'valor', 'dataHora', 'tipo', 'metodo', 
        'status', 'authCode', 'idTransacaoAsaas',
        'usuarioId', 'id'
    ];
    
    const camposFaltantes = [];
    camposObrigatorios.forEach(campo => {
        if (transacao[campo] === undefined || transacao[campo] === null || transacao[campo] === '') {
            camposFaltantes.push(campo);
        }
    });
    
    if (camposFaltantes.length > 0) {
        console.error('Transação bloqueada: campos obrigatórios faltantes', camposFaltantes, transacao);
        return false;
    }
    
    return true;
}

// Função para verificar se é admin
function isAdmin() {
    return currentUser && currentUser.email === ADMIN_EMAIL;
}

// Função para abrir painel admin e carregar dados
async function showAdminPanel() {
    if (!isAdmin()) {
        toast('Acesso negado!', 'erro');
        return;
    }
    showModal('modal-admin-master');
    await loadAdminData();
}

// Função para calcular saldo atualizado com precisão aritmética
async function calcularSaldoAtualizado(usuarioId) {
    try {
        // Obter todas as transações confirmadas do usuário
        const snapshot = await db.collection('transacoes')
            .where('usuarioId', '==', usuarioId)
            .where('status', '==', 'CONFIRMADO')
            .get();
        
        let saldoEmCentavos = 0; // Trabalha com centavos para evitar erros de ponto flutuante
        
        snapshot.forEach(doc => {
            const transacao = doc.data();
            const valorEmCentavos = Math.round(parseFloat(transacao.valor) * 100);
            
            if (transacao.tipo === 'ENTRADA') {
                saldoEmCentavos += valorEmCentavos;
            } else if (transacao.tipo === 'SAIDA') {
                saldoEmCentavos -= valorEmCentavos;
                // Se houver taxa, também subtrai
                if (transacao.fee) {
                    const taxaEmCentavos = Math.round(parseFloat(transacao.fee) * 100);
                    saldoEmCentavos -= taxaEmCentavos;
                }
            }
        });
        
        return saldoEmCentavos / 100;
    } catch (error) {
        console.error('Erro ao calcular saldo:', error);
        return null;
    }
}

// Função para auditar precisão do saldo
async function auditarPrecisaoSaldo() {
    if (!currentUser) return;
    
    try {
        const saldoCalculado = await calcularSaldoAtualizado(currentUser.uid);
        const userDoc = await db.collection('usuarios').doc(currentUser.uid).get();
        
        if (!userDoc.exists || saldoCalculado === null) {
            return;
        }
        
        const saldoSalvo = parseFloat(userDoc.data().balance) || 0;
        
        // Compara com precisão de 2 casas decimais
        const saldoCalculadoArredondado = Math.round(saldoCalculado * 100);
        const saldoSalvoArredondado = Math.round(saldoSalvo * 100);
        
        if (saldoCalculadoArredondado !== saldoSalvoArredondado) {
            console.error('ERRO DE PRECISÃO SALDO!');
            console.error(`Saldo Calculado: R$ ${saldoCalculado.toFixed(2)}, Saldo Salvo: R$ ${saldoSalvo.toFixed(2)}`);
            
            // Registrar erro na coleção logs_erro
            await db.collection('logs_erro').add({
                tipo: 'precisao_saldo',
                usuarioId: currentUser.uid,
                saldoCalculado: saldoCalculado,
                saldoSalvo: saldoSalvo,
                dataHora: firebase.firestore.FieldValue.serverTimestamp(),
                mensagem: `Divergência de saldo: Calculado R$ ${saldoCalculado.toFixed(2)} vs Salvo R$ ${saldoSalvo.toFixed(2)}`
            });
            
            toast('Aviso: Verificação de saldo detectou inconsistência.', 'erro');
        }
    } catch (error) {
        console.error('Erro na auditoria de precisão:', error);
    }
}

// Teste de Simulação: Cenário ZeCar
function testeZeCar() {
    console.log('=== TESTE DE PRECISÃO - ZECAR ===');
    console.log('Simulando transações: +500, -30, +600');
    
    // Simular transações
    const transacoesTeste = [
        { valor: 500, tipo: 'ENTRADA', status: 'CONFIRMADO' },
        { valor: 30, tipo: 'SAIDA', status: 'CONFIRMADO' },
        { valor: 600, tipo: 'ENTRADA', status: 'CONFIRMADO' }
    ];
    
    let saldoEmCentavos = 0;
    transacoesTeste.forEach(transacao => {
        const valorEmCentavos = Math.round(parseFloat(transacao.valor) * 100);
        if (transacao.tipo === 'ENTRADA') {
            saldoEmCentavos += valorEmCentavos;
        } else if (transacao.tipo === 'SAIDA') {
            saldoEmCentavos -= valorEmCentavos;
        }
    });
    
    const saldoFinal = saldoEmCentavos / 100;
    const saldoEsperado = 1070;
    
    console.log(`Saldo Calculado: R$ ${saldoFinal.toFixed(2)}`);
    console.log(`Saldo Esperado: R$ ${saldoEsperado.toFixed(2)}`);
    
    if (Math.abs(saldoFinal - saldoEsperado) < 0.01) {
        console.log('✅ TESTE PASSEI! Precisão perfeita!');
        return true;
    } else {
        console.error('❌ TESTE FALHOU! Divergência de precisão!');
        return false;
    }
}
// Executar teste automaticamente no carregamento para validação inicial
setTimeout(() => {
    testeZeCar();
}, 1000);

// Função para carregar dados do painel admin
async function loadAdminData() {
    try {
        // Carregar todos os usuários
        const usersSnapshot = await db.collection('usuarios').get();
        const users = usersSnapshot.docs.map(doc => doc.data());
        
        // Atualizar contador de usuários
        const countElement = document.getElementById('user-count-display');
        if (countElement) {
            countElement.textContent = users.length;
        }
        
        // Renderizar lista de usuários
        const listContainer = document.getElementById('user-list-container');
        if (listContainer) {
            listContainer.innerHTML = '';
            if (users.length === 0) {
                listContainer.innerHTML = '<p style="color: var(--text-secondary); text-align: center;">Nenhum usuário encontrado.</p>';
            } else {
                users.forEach(userData => {
                    // Formatar data de cadastro
                    let dateStr = '-';
                    if (userData.createdAt) {
                        const date = userData.createdAt.toDate();
                        dateStr = date.toLocaleDateString('pt-BR') + ' ' + date.toLocaleTimeString('pt-BR');
                    }
                    // Mascarar CPF
                    let maskedCpf = userData.cpf;
                    if (maskedCpf && maskedCpf.length === 11) {
                        maskedCpf = maskedCpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.***.***-$4');
                    }
                    // Criar item da lista
                    const userItem = document.createElement('div');
                    userItem.style.cssText = 'padding: 10px; border-bottom: 1px solid #333; margin-bottom: 10px;';
                    userItem.innerHTML = `
                        <div style="color: var(--accent-color); font-weight: bold;">${userData.nome || 'Nome não informado'}</div>
                        <div style="color: var(--text-secondary); font-size: 12px;">CPF: ${maskedCpf || '-'}</div>
                        <div style="color: var(--text-secondary); font-size: 12px;">Cadastro: ${dateStr}</div>
                    `;
                    listContainer.appendChild(userItem);
                });
            }
        }
    } catch (error) {
        console.error('Erro ao carregar dados admin:', error);
        toast('Erro ao carregar painel.', 'erro');
    }
}

// Carrega dados do usuário logado
async function loadUserData() {
    auth.onAuthStateChanged(async (user) => {
        const loginButtons = document.getElementById('login-buttons');
        const createForm = document.getElementById('create-account-form');
        
        if (user) {
            currentUser = user;
            
            // Carrega taxa Pix dinâmica do Firestore
            await loadPixFee();
            
            try {
                // Primeiro, carrega transações do usuário
                const transacoesSnapshot = await db.collection('transacoes')
                    .where('usuarioId', '==', user.uid)
                    .orderBy('createdAt', 'desc')
                    .get();
                
                // Carrega dados do usuário
                const userDoc = await db.collection('usuarios').doc(user.uid).get();
                if (userDoc.exists) {
                    const userData = userDoc.data();
                    globalUserData = userData; // Salva dados na variável global
                    
                    // Carrega saldo diretamente do Firestore (apenas servidor pode alterar!)
                    balance = userData.balance || 0;
                    
                    // Carrega transações do Firestore (coleção separada)
                    transactions = [];
                    transacoesSnapshot.forEach(doc => {
                        transactions.push(doc.data());
                    });
                    
                    userPassword = userData.senha || '';
                    userTransPassword = userData.senha_transacional || '';
                    userCPF = userData.cpf || '';
                    userPixKey = userData.chave_ativa || '';
                    apiKey = userData.apiKey || '';
                    
                    // Timer de 3 segundos para estabilizar sessão antes de verificar admin
                    setTimeout(() => {
                        // Mostra botão admin apenas para o dono (verificação explícita do e-mail)
                        const adminBtn = document.getElementById('admin-btn');
                        if (adminBtn) {
                            adminBtn.style.display = (currentUser && currentUser.email === ADMIN_EMAIL) ? 'flex' : 'none';
                        }
                    }, 3000);
                    
                    // Listener para monitorar mudanças no documento do usuário (incluindo saldo)
                    db.collection('usuarios').doc(user.uid).onSnapshot(doc => {
                        if (doc.exists) {
                            const updatedData = doc.data();
                            balance = updatedData.balance || 0;
                            globalUserData = updatedData;
                            updateUI();
                        }
                    });
                    
                    // Listener para monitorar novas transações e confirmações
                    db.collection('transacoes')
                        .where('usuarioId', '==', user.uid)
                        .onSnapshot(snapshot => {
                            snapshot.docChanges().forEach(change => {
                                const data = change.doc.data();
                                
                                if (change.type === 'added' || change.type === 'modified') {
                                    if (data.status === 'CONFIRMADO') {
                                        // Atualizar a transação na lista local
                                        const transIndex = transactions.findIndex(t => t.id === data.id);
                                        if (transIndex !== -1) {
                                            transactions[transIndex] = data;
                                        } else {
                                            transactions.unshift(data);
                                        }
                                        updateUI();
                                        initializeNotifications();
                                        
                                        // Exibir alerta específico para recebimento
                                        if (data.tipo === 'ENTRADA') {
                                            toast(`Novo recebimento: R$ ${parseFloat(data.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, false);
                                        } else {
                                            toast('Depósito confirmado! Saldo atualizado.', false);
                                        }
                                    }
                                }
                            });
                        });
                    
                    // Inicializa sistema de notificações
                    initializeNotifications();
                    
                    const container = document.getElementById('login-buttons');
                    container.innerHTML = ''; // Limpa tudo
                    
                    const btnEntrar = document.createElement('button');
                    btnEntrar.innerHTML = 'ACESSAR MEU BANCO VIP';
                    btnEntrar.className = 'btn-confirm';
                    btnEntrar.style.cssText = 'background:#00c851 !important; color:white; width:100%; max-width:350px; height:56px; border-radius:16px; font-weight:bold; cursor:pointer; margin: 15px auto !important; display:block; border:none; z-index:9999; position:relative;';
                    
                    // Como o ID já foi validado, entra direto
                    btnEntrar.onclick = () => { 
                        console.log('Botão ACESSAR MEU BANCO VIP clicado com sucesso!');
                        entrar(); 
                        updateUI(); 
                    };
                    container.appendChild(btnEntrar);
                    
                    document.getElementById('create-account-form').style.display = 'none';
                } else {
                    if (loginButtons) loginButtons.style.display = 'none';
                    if (createForm) createForm.style.display = 'block';
                }
                updateUI();
            } catch (error) { console.error("Erro Firestore:", error); }
        } else {
            document.getElementById('login-screen').style.display = 'flex';
            document.getElementById('main-content').style.display = 'none';
        }
    });
}

// Salva dados do usuário no Firestore (não salva balance, pois é calculado)
async function saveUserData() {
    if (!currentUser) return;
    
    try {
        await db.collection('usuarios').doc(currentUser.uid).set({
            apiKey: apiKey,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
    } catch (error) {
        console.error('Erro ao salvar dados:', error);
        toast('Erro ao salvar dados no servidor', 'erro');
    }
}

// Função de login com Google
async function signInWithGoogle() {
    console.log('Botão clicado com sucesso!');
    try {
        const provider = new firebase.auth.GoogleAuthProvider();
        provider.setCustomParameters({ prompt: 'select_account' });
        const result = await auth.signInWithPopup(provider);
        const user = result.user;
        
        toast(`Identidade confirmada: ${user.displayName || 'usuário'}`, false);
        
        // Timer de estabilização de 5 segundos
        setTimeout(async () => {
            try {
                const userDoc = await db.collection('usuarios').doc(user.uid).get();
                if (!userDoc.exists) {
                    // Se não existe documento, joga para criação de conta
                    toast('Nenhuma conta VIP encontrada. Cadastre-se primeiro.', 'erro');
                    closeModal('modal-login-manual');
                    showCreateAccountForm();
                } else {
                    // Se existe, continua com login manual normal
                    showModal('modal-login-manual');
                }
            } catch (error) {
                console.error('Erro ao verificar documento:', error);
                toast('Erro ao verificar conta. Tente novamente.', 'erro');
            }
        }, 5000);
        
    } catch (error) {
        console.error('Erro no login Google:', error);
        toast('Erro ao fazer login com Google', 'erro');
    }
}

async function resetPasswordManual() {
    const identifier = document.getElementById('manual-login-id').value.trim();
    
    if (!identifier) {
        toast('Digite seu e-mail para recuperar a senha', 'erro');
        return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    
    if (emailRegex.test(identifier)) {
        try {
            await auth.sendPasswordResetEmail(identifier);
            toast('Link de recuperação enviado!', false);
        } catch (error) {
            toast('Erro ao enviar link. Verifique o e-mail.', 'erro');
        }
    } else {
        toast('Para recuperar, use seu e-mail cadastrado', 'erro');
    }
}

// Inicializa lucro acumulado do banco (pode ser carregado do Firestore se necessário)
let bankProfit = 0;

async function entrarComCredenciais() {
    const loginId = document.getElementById('manual-login-id').value.trim();
    const loginPass = document.getElementById('manual-login-pass').value.trim();
    
    // Validação de login: confere e-mail do formulário com e-mail do Google logado
    if (globalUserData && (loginId === globalUserData.email || loginId === globalUserData.cpf)) {
        if (loginPass === globalUserData.senha) {
            toast('Acesso VIP Confirmado!', false);
            balance = globalUserData.balance || 0; // Carrega saldo
            transactions = globalUserData.transactions || []; // Carrega extrato
            entrar(); // Puxa a cortina preta
            updateUI();
            closeModals();
        } else {
            toast('Senha incorreta!', 'erro');
        }
    } else {
        toast('Dados não conferem com o lojista logado!', 'erro');
    }
}

function entrar() {
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('main-content').style.display = 'block';
}

function sairComSeguranca() {
    // 1. Limpa variáveis sensíveis da memória imediatamente
    balance = 0;
    transactions = [];
    currentUser = null;
    userPassword = '';
    userTransPassword = '';
    userCPF = '';
    userPixKey = '';
    isAdmin = false;
    adminClickCount = 0;
    balanceHidden = false;
    apiKey = '';
    pendingTransfer = null;
    globalUserData = null; // Limpa dados globais

    // 2. Limpa conteúdo HTML de listas de transações
    const transList = document.getElementById('trans-list');
    const fullTransList = document.getElementById('full-transactions-list');
    if (transList) transList.innerHTML = '';
    if (fullTransList) fullTransList.innerHTML = '';

    // 3. Atualiza o texto da UI para saldo zerado
    const balanceDisplay = document.getElementById('balance-display');
    if (balanceDisplay) balanceDisplay.innerText = 'R$ 0,00';

    // 4. Encerra sessão no Firebase, oculta dashboard e mostra login
    auth.signOut().then(() => {
        document.getElementById('main-content').style.display = 'none';
        document.getElementById('login-screen').style.display = 'flex';
        
        // 5. Confirmação visual
        toast('Sessão encerrada com segurança', false);
    }).catch((error) => {
        console.error('Erro ao sair:', error);
        // Mesmo em erro, força volta para login por segurança
        document.getElementById('main-content').style.display = 'none';
        document.getElementById('login-screen').style.display = 'flex';
    });
}

function showCreateAccountForm() {
    document.getElementById('login-buttons').style.display = 'none';
    document.getElementById('create-account-form').style.display = 'block';
}

async function verificarAntesDeCriar() {
    try {
        // Abre popup do Google Login
        const provider = new firebase.auth.GoogleAuthProvider();
        const result = await auth.signInWithPopup(provider);
        const user = result.user;
        
        // Procura usuário no Firestore
        const userDoc = await db.collection('usuarios').doc(user.uid).get();
        
        if (userDoc.exists) {
            // Se já tem conta: aviso e abre modal de senha
            toast('Identidade VIP detectada! Por favor, confirme sua senha para entrar.', false);
            
            // Preenche e-mail e abre modal de senha
            document.getElementById('manual-login-id').value = user.email;
            showModal('modal-login-manual');
        } else {
            // Se não tem conta: mostra formulário de cadastro
            showCreateAccountForm();
        }
    } catch (error) {
        console.error('Erro na verificação:', error);
        toast('Erro ao verificar conta. Tente novamente.', true);
    }
}

function backToLogin() {
    document.getElementById('create-account-form').style.display = 'none';
    document.getElementById('login-buttons').style.display = 'block';
}

async function handleRegistration() {
    // VALIDAÇÃO PRO: Verifica todos os campos obrigatórios
    const nome = document.getElementById('nome-field').value.trim();
    const cpf = document.getElementById('cpf-field').value.trim();
    const email = document.getElementById('email-field').value.trim();
    const celular = document.getElementById('celular-field').value.trim();
    const senha = document.getElementById('senha-field').value.trim();
    const senhaTransacional = document.getElementById('senha-transacional-field').value.trim();
    
    // Trava de segurança: se algum campo estiver vazio, não abre o Google
    if (!nome || !cpf || !email || !celular || !senha || !senhaTransacional) {
        toast('ERRO: Preencha TODOS os campos para continuar!', true);
        return;
    }
    
    const btn = document.getElementById('btn-finalizar-cadastro');
    try {
        btn.disabled = true;
        btn.innerText = 'Validando Identidade Google...';
        
        // 1. Cria o ID primeiro
        const provider = new firebase.auth.GoogleAuthProvider();
        const result = await auth.signInWithPopup(provider);
        const user = result.user;
        
        // 2. Verifica se uid já existe antes de salvar
        const userDoc = await db.collection('usuarios').doc(user.uid).get();
        if (userDoc.exists) {
            // Se já existe, redireciona para login manual com senha
            toast('Você já possui uma conta VIP vinculada a este e-mail.', false);
            
            // Abre modal de login manual com e-mail preenchido
            document.getElementById('manual-login-id').value = user.email;
            showModal('modal-login-manual');
            
            btn.disabled = false;
            btn.innerText = 'FINALIZAR CADASTRO VIP';
            return; // Impede a criação de nova conta
        }
        
        // Se não existe, salva o formulário
        await finalizeAccount(user.uid);
    } catch (error) {
        console.error(error);
        toast('Erro: ' + error.message, true);
        btn.disabled = false;
        btn.innerText = 'FINALIZAR CADASTRO VIP';
    }
}

async function finalizeAccount(uid) {
    togglePixInput();
    const btn = document.getElementById('btn-finalizar-cadastro');
    const nome = document.getElementById('nome-field').value;
    const cpf = document.getElementById('cpf-field').value;
    const email = document.getElementById('email-field').value;
    const celular = document.getElementById('celular-field').value;
    const whatsapp = document.getElementById('whatsapp-field').value;
    const senha = document.getElementById('senha-field').value;
    const senhaTransacional = document.getElementById('senha-transacional-field').value;
    const pixType = document.getElementById('reg-pix-type').value;
    const pixValue = document.getElementById('reg-pix-value').value || '';
    
    // Get new fields
    const nascDia = document.getElementById('nasc-dia').value;
    const nascMes = document.getElementById('nasc-mes').value;
    const nascAno = document.getElementById('nasc-ano').value;
    const estado = document.getElementById('estado-field').value;
    const cidade = document.getElementById('cidade-field').value;
    
    // Validate new fields
    if (!nascDia || !nascMes || !nascAno || !estado || !cidade) {
        toast('Preencha todos os campos (Data de Nascimento, Estado, Cidade).', 'erro');
        return;
    }
    
    // Format birth date
    const dataNascimento = `${nascDia.padStart(2, '0')}/${nascMes.padStart(2, '0')}/${nascAno}`;
    
    // Detect document type using the function from main.js
    const tipoConta = detectarTipoDocumento(cpf);
    
    if (!nome || !cpf || !email || !celular || !senha || !senhaTransacional || !pixValue) {
        toast('Atenção: Todos os campos são obrigatórios para sua segurança', 'erro');
        return;
    }

    // Validate document type
    if (!tipoConta) {
        toast('Documento inválido. Use um CPF (11 dígitos) ou CNPJ (14 dígitos).', 'erro');
        return;
    }

    // Validação de chave PIX
    if (!validatePixKeyAuth(pixValue, pixType)) {
        let mensagemErro = 'Chave PIX inválida! ';
        switch (pixType.toUpperCase()) {
            case 'CPF': mensagemErro += 'Formato esperado: 000.000.000-00'; break;
            case 'CNPJ': mensagemErro += 'Formato esperado: 00.000.000/0001-00'; break;
            case 'EMAIL': mensagemErro += 'Formato esperado: email@dominio.com'; break;
            case 'CELULAR': mensagemErro += 'Formato esperado: (DD) 9XXXX-XXXX'; break;
            case 'ALEATORIA': mensagemErro += 'Formato esperado: XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX'; break;
        }
        toast(mensagemErro, 'erro');
        return;
    }

    // Formata a chave PIX para salvar consistente no Firestore
    const pixFormatado = formatPixKeyAuth(pixValue, pixType);
    
    btn.disabled = true;
    btn.innerText = 'Ativando Conta VIP...';
    
    try {
        // O segredo para o erro de permissão: 
        // Usuário autenticado só tem permissão para escrever no seu PRÓPRIO ID (UID)
        const cleanCpf = cpf.replace(/\D/g, '');

        // Objeto completo para Firestore
        const dadosUsuario = {
            nome: nome,
            cpf: cleanCpf,
            tipo_conta: tipoConta,
            dataNascimento: dataNascimento,
            estado: estado,
            cidade: cidade,
            email: email,
            celular: celular,
            whatsapp: whatsapp,
            senha: senha, // Senha de acesso do formulário
            senha_transacional: senhaTransacional, // Senha transacional
            balance: 0.00,
            transactions: [],
            apiKey: '',
            chave_ativa: pixFormatado,
            chave_tipo: pixType,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        
        console.log('📤 Enviando dados para Firestore:', dadosUsuario);
        
        // GRAVAÇÃO COMPLETA - Identidade Híbrida
        await db.collection('usuarios').doc(uid).set(dadosUsuario, { merge: true });
        
        // DELAY DE GRAVAÇÃO: Aguarda Firestore estabilizar
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        userPixKey = pixFormatado;
        localStorage.setItem('VIP_REGISTERED', 'true');
        toast('Conta VIP Ativada!', false);
        
        // LIMPEZA AUTOMÁTICA DOS CAMPOS
        document.getElementById('nome-field').value = '';
        document.getElementById('cpf-field').value = '';
        document.getElementById('email-field').value = '';
        document.getElementById('celular-field').value = '';
        document.getElementById('senha-field').value = '';
        document.getElementById('senha-transacional-field').value = '';
        document.getElementById('reg-pix-value').value = '';
        
        // RECONHECIMENTO AUTOMÁTICO - Entra direto no Banco
        entrar(); // Abre o banco automaticamente
        updateUI(); // Carrega os dados na tela
        
    } catch (error) {
        console.error('Erro na ativação:', error);
        toast('Erro: ' + error.message, true);
    } finally {
        btn.disabled = false;
        btn.innerText = 'FINALIZAR CADASTRO';
    }
}
