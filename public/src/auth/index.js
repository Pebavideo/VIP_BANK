// Arquivo migrado para usar VIPBANK namespace EXCLUSIVO!

// Todos os acessos são DIRETOS via VIPBANK.nome (sem redeclarações const/let)
// Exemplo de uso: VIPBANK.db, VIPBANK.auth, VIPBANK.isAdmin


async function loadPixFee() {
    try {
        const adminDoc = await VIPBANK.db.collection('admin').doc('configuracoes').get();
        if (adminDoc.exists && adminDoc.data().valor_taxa_pix) {
            VIPBANK.ASAAS_PIX_FEE = adminDoc.data().valor_taxa_pix;
        } else {
            VIPBANK.ASAAS_PIX_FEE = 3.99;
        }
    } catch (error) {

        VIPBANK.ASAAS_PIX_FEE = 3.99;
    }
}

function validatePixKeyAuth(key, type) {
    const cleanKey = key.trim();
    if (!cleanKey) return false;

    switch (type.toUpperCase()) {
        case 'CPF':
            if (VIPBANK.regex.CPF.test(cleanKey)) return true;
            const rawCpf = cleanKey.replace(/\D/g, '');
            return VIPBANK.regex.CPF_RAW.test(rawCpf);
        case 'CNPJ':
            if (VIPBANK.regex.CNPJ.test(cleanKey)) return true;
            const rawCnpj = cleanKey.replace(/\D/g, '');
            return VIPBANK.regex.CNPJ_RAW.test(rawCnpj);
        case 'EMAIL':
            return VIPBANK.regex.EMAIL.test(cleanKey);
        case 'CELULAR':
            if (VIPBANK.regex.CELULAR.test(cleanKey)) return true;
            const rawCelular = cleanKey.replace(/\D/g, '');
            return VIPBANK.regex.CELULAR_RAW.test(rawCelular);
        case 'ALEATORIA':
            return VIPBANK.regex.UUID.test(cleanKey);
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

async function encerrarContaSegura() {
    if (VIPBANK.balance > 0) {
        toast('Erro: Você ainda possui saldo. Saque tudo antes de encerrar.', 'erro');
        return;
    }

    // Abre o modal de confirmação de senha
    showModal('modal-close-account');
}

async function verificarSenhaEncerramento() {
    const passwordInput = document.getElementById('close-account-password').value;
    if (!passwordInput) {
        toast('Digite sua senha para continuar.', 'erro');
        return;
    }

    const user = VIPBANK.auth.currentUser;
    if (!user) {
        toast('Usuário não autenticado. Faça login novamente.', 'erro');
        return;
    }

    try {
        // Reautentica o usuário com a senha fornecida
        const credential = firebase.auth.EmailAuthProvider.credential(user.email, passwordInput);
        await user.reauthenticateWithCredential(credential);

        const confirmFinal = confirm('Deseja realmente encerrar sua conta? Todos os seus dados serão apagados.');
        if (confirmFinal) {
            await encerrarContaVIP();
        } else {
            toast('Encerramento de conta cancelado.', 'info');
        }
    } catch (error) {

        if (error.code === 'auth/wrong-password') {
            toast('Senha incorreta. Tente novamente.', 'erro');
        } else {
            toast('Erro de segurança. Tente novamente mais tarde.', 'erro');
        }
    } finally {
        closeModals();
    }
}

async function encerrarContaVIP() {
    try {
        // Step 1: Re-VIPBANK.authenticate user (if using email login)
        const user = VIPBANK.auth.currentUser;
        if (!user) {
            toast('Usuário não autenticado.', 'erro');
            return;
        }

        // Step 2: Delete via Cloud Function
        const deletarConta = VIPBANK.functions.httpsCallable('deletarContaUsuario');
        await deletarConta();

        // Step 3: Clear local storage
        localStorage.clear();
        sessionStorage.clear();

        // Step 4: Show success and refresh to login screen
        toast('Conta encerrada com sucesso. Até logo!', 'sucesso');
        setTimeout(() => {
            location.reload();
        }, 2000);
    } catch (error) {

        toast('Ocorreu um erro. Tente novamente mais tarde.', 'erro');
    }
}

// Função para gerar VIPBANK.authCode único para comprovantes
function gerarAuthCode() {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 10);
    return `${timestamp}-${random}`.toUpperCase();
}

// Validação de campos obrigatórios para transações
function validarTransacaoObrigatoria(transacao) {
    const camposObrigatorios = [
        'valor', 'dataHora', 'tipo', 'metodo', 
        'status', 'VIPBANK.authCode', 'idTransacaoAsaas',
        'usuarioId', 'id'
    ];
    
    const camposFaltantes = [];
    camposObrigatorios.forEach(campo => {
        if (transacao[campo] === undefined || transacao[campo] === null || transacao[campo] === '') {
            camposFaltantes.push(campo);
        }
    });
    
    if (camposFaltantes.length > 0) {
        return false;
    }
    
    return true;
}

// Função para verificar se é admin
VIPBANK.isAdmin = function() {
    return VIPBANK.currentUser && VIPBANK.currentUser.email === VIPBANK.ADMIN_EMAIL;
}

// Função para abrir painel admin e carregar dados
async function showAdminPanel() {
    if (!VIPBANK.isAdmin()) {
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
        const snapshot = await VIPBANK.db.collection('transacoes')
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

        return null;
    }
}

// Função para auditar precisão do saldo
async function auditarPrecisaoSaldo() {
    if (!VIPBANK.currentUser) return;
    
    try {
        const saldoCalculado = await calcularSaldoAtualizado(VIPBANK.currentUser.uid);
        const userDoc = await VIPBANK.db.collection('usuarios').doc(VIPBANK.currentUser.uid).get();
        
        if (!userDoc.exists || saldoCalculado === null) {
            return;
        }
        
        const saldoSalvo = parseFloat(userDoc.data().balance) || 0;
        
        // Compara com precisão de 2 casas decimais
        const saldoCalculadoArredondado = Math.round(saldoCalculado * 100);
        const saldoSalvoArredondado = Math.round(saldoSalvo * 100);
        
        if (saldoCalculadoArredondado !== saldoSalvoArredondado) {
            // Registrar erro na coleção logs_erro via Cloud Function
            const registrarLog = VIPBANK.functions.httpsCallable('registrarLogErro');
            await registrarLog({
                log: {
                    tipo: 'precisao_saldo',
                    saldoCalculado: saldoCalculado,
                    saldoSalvo: saldoSalvo,
                    mensagem: `Divergência de saldo: Calculado R$ ${saldoCalculado.toFixed(2)} vs Salvo R$ ${saldoSalvo.toFixed(2)}`
                }
            });
            
            toast('Aviso: Verificação de saldo detectou inconsistência.', 'erro');
        }
    } catch (error) {
    }
}




// Função para carregar dados do painel admin
async function loadAdminData() {
    try {
        // Carregar todos os usuários
        const usersSnapshot = await VIPBANK.db.collection('usuarios').get();
        const users = usersSnapshot.docs.map(doc => doc.data());
        
        // Atualizar contador de usuários
        const countElement = document.getElementById('user-count-display');
        if (countElement) {
            countElement.textContent = users.length;
        }
        
        // Atualizar contador de clientes (apenas para admin)
        const clientesElement = document.getElementById('contagem-clientes');
        const clientesValorElement = document.getElementById('contagem-clientes-valor');
        if (clientesElement && clientesValorElement) {
            if (VIPBANK.currentUser && VIPBANK.currentUser.email === VIPBANK.ADMIN_EMAIL) {
                clientesElement.style.display = 'block';
                clientesValorElement.textContent = 'Total de clientes: ' + usersSnapshot.size;
            } else {
                clientesElement.style.display = 'none';
            }
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

        toast('Erro ao carregar painel.', 'erro');
    }
}

// Carrega dados do usuário logado
async function loadUserData() {
    VIPBANK.auth.onAuthStateChanged(async (user) => {
        const loginButtons = document.getElementById('login-buttons');
        const createForm = document.getElementById('create-account-form');
        
        if (user) {
            VIPBANK.currentUser = user;
            
            // Carrega taxa Pix dinâmica do Firestore
            await loadPixFee();
            
            try {
                // Primeiro, carrega transações do usuário
                const transacoesSnapshot = await VIPBANK.db.collection('transacoes')
                    .where('usuarioId', '==', user.uid)
                    .orderBy('createdAt', 'desc')
                    .get();
                
                // Carrega dados do usuário
                const userDoc = await VIPBANK.db.collection('usuarios').doc(user.uid).get();
                if (userDoc.exists) {
                    const userData = userDoc.data();
                    VIPBANK.globalUserData = userData; // Salva dados na variável global
                    
                    // Carrega saldo diretamente do Firestore (apenas servidor pode alterar!)
            VIPBANK.balance = userData.balance || 0;
            
            // Carrega transações do Firestore (coleção separada)
            VIPBANK.transactions = [];
            transacoesSnapshot.forEach(doc => {
                VIPBANK.transactions.push(doc.data());
            });
                    
                    VIPBANK.userCPF = userData.cpf || '';
                    VIPBANK.userPixKey = userData.chave_ativa || '';
                    VIPBANK.apiKey = userData.VIPBANK.apiKey || '';
                    
                    // Timer de 3 segundos para estabilizar sessão antes de verificar admin
                    setTimeout(() => {
                        // Mostra botão admin apenas para o dono (verificação explícita do e-mail)
                        const adminBtn = document.getElementById('admin-btn');
                        if (adminBtn) {
                            adminBtn.style.display = (VIPBANK.currentUser && VIPBANK.currentUser.uid === VIPBANK.OWNER_UID) ? 'flex' : 'none';
                        }
                    }, 3000);
                    
                    // Listener para monitorar mudanças no documento do usuário (incluindo saldo)
                    VIPBANK.db.collection('usuarios').doc(user.uid).onSnapshot(doc => {
                        if (doc.exists) {
                            const updatedData = doc.data();
                            VIPBANK.balance = updatedData.balance || 0;
                            VIPBANK.globalUserData = updatedData;
                            updateUI();
                        }
                    });
                    
                    // Listener para monitorar novas transações e confirmações
                    VIPBANK.db.collection('transacoes')
                        .where('usuarioId', '==', user.uid)
                        .onSnapshot(snapshot => {
                            snapshot.docChanges().forEach(change => {
                                const data = change.doc.data();
                                
                                if (change.type === 'added' || change.type === 'modified') {
                                    if (data.status === 'CONFIRMADO') {
                                        // Atualizar a transação na lista local
                                        const transIndex = VIPBANK.transactions.findIndex(t => t.id === data.id);
                                        if (transIndex !== -1) {
                                            VIPBANK.transactions[transIndex] = data;
                                        } else {
                                            VIPBANK.transactions.unshift(data);
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
                    
                    // DEIXAR OS BOTÕES ORIGINAIS INTACTOS! Não limpar o container!
                    const container = document.getElementById('login-buttons');
                    
                    // Apenas adicionar o botão de acesso sem remover os outros
                    const btnAcessar = document.createElement('button');
                    btnAcessar.innerHTML = 'ACESSAR MEU BANCO VIP';
                    btnAcessar.className = 'btn-confirm';
                    btnAcessar.style.cssText = 'background:#00c851 !important; color:white; width:100%; max-width:350px; height:56px; border-radius:16px; font-weight:bold; cursor:pointer; margin: 15px auto !important; display:block; border:none; z-index:9999; position:relative;';
                    
                    // Como o ID já foi validado, entra direto
                    btnAcessar.onclick = () => { 

                        entrar(); 
                        updateUI(); 
                    };
                    
                    // Adicionar o botão no início do container (sem remover os originais)
                    container.insertBefore(btnAcessar, container.firstChild);
                    
                    document.getElementById('create-account-form').style.display = 'none';
                } else {
                    if (loginButtons) loginButtons.style.display = 'none';
                    if (createForm) createForm.style.display = 'block';
                }
                updateUI();
            } catch (error) { }
        } else {
            document.getElementById('login-screen').style.display = 'flex';
            document.getElementById('main-content').style.display = 'none';
        }
    });
}

// Vincula loadUserData ao window
window.loadUserData = loadUserData;

// Salva dados do usuário no Firestore via Cloud Function
async function saveUserData() {
    if (!VIPBANK.currentUser) return;
    
    try {
        const atualizarUsuario = VIPBANK.functions.httpsCallable('atualizarUsuario');
        await atualizarUsuario({
            dados: {
                apiKey: VIPBANK.apiKey,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            }
        });
    } catch (error) {

        toast('Erro ao salvar dados no servidor', 'erro');
    }
}

// Função principal de verificação de login
async function verificarLogin() {


    // Loading state: disable btn-entrar-google
    const loginBtn = document.getElementById('btn-entrar-google');
    if (loginBtn) {
        loginBtn.disabled = true;
        loginBtn.style.opacity = '0.6';
        loginBtn.style.pointerEvents = 'none';
        loginBtn.innerText = 'Carregando...';
    }

    // Wait 1.5 seconds to avoid race condition
    await new Promise(resolve => setTimeout(resolve, 1500));


    
    try {
        // 1. Verifica se já tem usuário logado no Firebase Auth
        let user = firebase.auth().currentUser;
        
        if (!user) {
            // 2. Se não tem usuário logado, abre o popup do Google

            const provider = new firebase.auth.GoogleAuthProvider();
            provider.setCustomParameters({ prompt: 'select_account' });
            const result = await VIPBANK.auth.signInWithPopup(provider);
            user = result.user;
        }
        
        
        
        if (user) {
            // Se já tem usuário logado, exibe o modal de confirmação de senha
            document.getElementById('manual-login-id').value = user.email;
            showModal('modal-login-manual');
            return;
        }
    } catch (error) {
        toast('Erro ao acessar conta. Tente novamente.', 'erro');
    } finally {
        // Always re-enable the button, even if there's an error
        if (loginBtn) {
            loginBtn.disabled = false;
            loginBtn.style.opacity = '1';
            loginBtn.style.pointerEvents = 'auto';
            loginBtn.innerText = 'ENTRAR NA MINHA CONTA';
        }
    }
}

// Função iniciarLogin (wrapper para verificarLogin)
async function iniciarLogin() {

    await verificarLogin();
}

// Função abrirConta
async function abrirConta() {

    await verificarAntesDeCriar();
}

// Função de login com Google (mantida para compatibilidade)
async function signInWithGoogle() {
    await verificarLogin();
}

async function handleForgotPassword() {
    const identifier = document.getElementById('manual-login-id').value.trim();
    
    if (!identifier) {
        toast('Digite seu e-mail para recuperar a senha', 'erro');
        return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    
    if (emailRegex.test(identifier)) {
        try {
            await VIPBANK.auth.sendPasswordResetEmail(identifier);
            toast('Enviamos um link de redefinição para seu e-mail. Verifique sua caixa de entrada.', false);
            VIPBANK.auth.signOut(); // Desloga o usuário após enviar o e-mail
            closeModals();
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

    const user = VIPBANK.auth.currentUser;
    if (!user) {
        toast('Sessão expirada. Faça login novamente.', 'erro');
        VIPBANK.auth.signOut();
        return;
    }

    try {
        const credential = firebase.auth.EmailAuthProvider.credential(user.email, loginPass);
        await user.reauthenticateWithCredential(credential);

        // Reautenticação bem-sucedida, agora carrega os dados do usuário
        const userDoc = await VIPBANK.db.collection('usuarios').doc(user.uid).get();
        if (userDoc.exists) {
            const userData = userDoc.data();
            VIPBANK.globalUserData = userData;
            VIPBANK.currentUser = user;
            VIPBANK.balance = userData.balance || 0;
            VIPBANK.transactions = userData.transactions || [];
            entrar();
            updateUI();
            updateProfitDisplay();
            initializeNotifications();
            toast('Acesso VIP Confirmado!', false);
            closeModals();
        } else {
            // Se o documento do usuário não existe após reautenticação, algo está errado ou é um novo usuário
            toast('Nenhuma conta VIP encontrada. Cadastre-se primeiro.', 'erro');
            showCreateAccountForm();
        }
    } catch (error) {
        if (error.code === 'auth/wrong-password') {
            toast('Senha incorreta. Tente novamente.', 'erro');
        } else {
            toast('Erro de segurança. Tente novamente mais tarde.', 'erro');
        }
        VIPBANK.auth.signOut(); // Desloga em caso de erro
    }
}

function entrar() {
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('main-content').style.display = 'block';
}

function sairComSeguranca() {
    // 1. Limpa variáveis sensíveis da memória imediatamente
    VIPBANK.balance = 0;
    VIPBANK.transactions = [];
    VIPBANK.currentUser = null;
    VIPBANK.userPassword = '';
    VIPBANK.userTransPassword = '';
    VIPBANK.userCPF = '';
    VIPBANK.userPixKey = '';
    VIPBANK.isAdmin = false;
    VIPBANK.adminClickCount = 0;
    VIPBANK.balanceHidden = false;
    VIPBANK.apiKey = '';
    VIPBANK.pendingTransfer = null;
    VIPBANK.globalUserData = null; // Limpa dados globais

    // 2. Limpa conteúdo HTML de listas de transações
    const transList = document.getElementById('trans-list');
    const fullTransList = document.getElementById('full-VIPBANK.transactions-list');
    if (transList) transList.innerHTML = '';
    if (fullTransList) fullTransList.innerHTML = '';

    // 3. Atualiza o texto da UI para saldo zerado
    const balanceDisplay = document.getElementById('txt-saldo');
    if (balanceDisplay) balanceDisplay.innerText = 'R$ 0,00';

    // 4. Encerra sessão no Firebase, oculta dashboard e mostra login
    VIPBANK.auth.signOut().then(() => {
        document.getElementById('main-content').style.display = 'none';
        document.getElementById('login-screen').style.display = 'flex';
        
        // 5. Confirmação visual
        toast('Sessão encerrada com segurança', false);
    }).catch((error) => {
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
        const result = await VIPBANK.auth.signInWithPopup(provider);
        const user = result.user;
        
        // Exibe o modal de confirmação de senha
        document.getElementById('manual-login-id').value = user.email;
        showModal('modal-login-manual');
    } catch (error) {
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
    const confirmarSenha = document.getElementById('confirmar-senha-field').value.trim();
    const senhaTransacional = document.getElementById('senha-transacional-field').value.trim();
    
    // Trava de segurança: se algum campo estiver vazio, não abre o Google
    if (!nome || !cpf || !email || !celular || !senha || !confirmarSenha || !senhaTransacional) {
        toast('ERRO: Preencha TODOS os campos para continuar!', true);
        return;
    }

    if (senha !== confirmarSenha) {
        toast('ERRO: As senhas de acesso não coincidem!', true);
        return;
    }
    
    const btn = document.getElementById('btn-finalizar-cadastro');
    try {
        btn.disabled = true;
        btn.innerText = 'Validando Identidade Google...';
        
        // 1. Cria o ID primeiro
        const provider = new firebase.auth.GoogleAuthProvider();
        const result = await VIPBANK.auth.signInWithPopup(provider);
        const user = result.user;
        
        // 2. Verifica se uid já existe antes de salvar
        const userDoc = await VIPBANK.db.collection('usuarios').doc(user.uid).get();
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
        
        // GRAVAÇÃO VIA CLOUD FUNCTION
        const criarConta = VIPBANK.functions.httpsCallable('criarContaUsuario');
        await criarConta({ dadosUsuario });
        
        // DELAY DE GRAVAÇÃO: Aguarda Firestore estabilizar
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        VIPBANK.userPixKey = pixFormatado;
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
        toast('Erro: ' + error.message, true);
    } finally {
        btn.disabled = false;
        btn.innerText = 'FINALIZAR CADASTRO';
    }
}

// VINCULA TODAS AS FUNÇÕES AO WINDOW (AGORA DEPOIS DE TODAS AS DECLARAÇÕES!)
window.verificarLogin = verificarLogin;
window.iniciarLogin = iniciarLogin;
window.abrirConta = abrirConta;
window.signInWithGoogle = signInWithGoogle;
window.entrarComCredenciais = entrarComCredenciais;
window.entrar = entrar;
window.sairComSeguranca = sairComSeguranca;
window.showCreateAccountForm = showCreateAccountForm;
window.verificarAntesDeCriar = verificarAntesDeCriar;
window.backToLogin = backToLogin;
window.handleRegistration = handleRegistration;
window.finalizeAccount = finalizeAccount;
window.togglePixInput = togglePixInput;
window.loadUserData = loadUserData;
window.saveUserData = saveUserData;
window.gerarAuthCode = gerarAuthCode;
window.validarTransacaoObrigatoria = validarTransacaoObrigatoria;
window.loadAdminData = loadAdminData;
window.calcularSaldoAtualizado = calcularSaldoAtualizado;
window.auditarPrecisaoSaldo = auditarPrecisaoSaldo;
window.encerrarContaSegura = encerrarContaSegura;
window.verificarSenhaEncerramento = verificarSenhaEncerramento;
window.encerrarContaVIP = encerrarContaVIP;
window.loadPixFee = loadPixFee;
window.validatePixKeyAuth = validatePixKeyAuth;
window.formatPixKeyAuth = formatPixKeyAuth;
