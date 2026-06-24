

// TODOS OS ACESSOS SÃO DIRETOS VIA VIPBANK (sem redeclarações!)
const ADMIN_EMAIL = VIPBANK.ADMIN_EMAIL;

// Helper functions for HTML events
function maskName(input) {
    input.value = input.value.replace(/[^a-zA-ZÀ-ÿ\s]/g, '').replace(/\b\w/g, l => l.toUpperCase());
}

function validateEmail(input) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(input.value)) {
        toast('E-mail inválido', 'erro');
        input.style.borderColor = 'var(--danger-color)';
    } else {
        input.style.borderColor = '';
    }
}

function maskTransactionPassword(input) {
    input.value = input.value.replace(/\D/g, '');
}

function handleTransferClick() {
    const valueInput = document.getElementById('transfer-value');
    const keyInput = document.getElementById('transfer-key');
    const value = parseFloat(valueInput.value.replace(/[^\d,]/g, '').replace(',', '.'));
    const key = keyInput.value.trim();
    
    if (window.openSecurityModal) {
        window.openSecurityModal(value, key);
    }
}

function toggleBalanceVisibility() {
    VIPBANK.balanceHidden = !VIPBANK.balanceHidden;
    const eyeIcon = document.getElementById('balance-eye');
    const balanceText = document.getElementById('txt-saldo');
    
    if (VIPBANK.balanceHidden) {
        eyeIcon.className = 'fas fa-eye-slash';
        balanceText.innerText = '•••';
    } else {
        eyeIcon.className = 'fas fa-eye';
        balanceText.innerText = VIPBANK.balance.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    }
    
    renderTransactions();
    
    // Mostra botão admin apenas para o dono
    const adminBtn = document.getElementById('admin-btn');
    if (adminBtn) {
        if (VIPBANK.currentUser && VIPBANK.currentUser.uid === VIPBANK.OWNER_UID) {
            adminBtn.style.display = 'flex';
        } else {
            adminBtn.style.display = 'none';
        }
    }
}

function detectarTipoDocumento(valor) {
    const cleanValue = valor.replace(/\D/g, '');
    if (cleanValue.length === 11) {
        return 'PESSOA_FISICA';
    } else if (cleanValue.length === 14) {
        return 'EMPRESA_CNPJ';
    } else {
        return null;
    }
}

function maskDocumento(input) { 
    const displayElement = document.getElementById('documento-tipo-display'); 
    
    // SEGURANÇA: Se o elemento não existir, para a execução aqui para não travar o restante do JS 
    if (!displayElement) return; 
 
    let value = input.value.replace(/\D/g, ''); 
    
    // Detect document type 
    const tipo = detectarTipoDocumento(value); 
    
    if (tipo === 'PESSOA_FISICA') { 
        displayElement.style.display = 'block'; 
        displayElement.innerText = 'Tipo de conta detectado: [PESSOA FÍSICA]'; 
        displayElement.style.color = 'var(--accent-color)'; 
    } else if (tipo === 'EMPRESA_CNPJ') { 
        displayElement.style.display = 'block'; 
        displayElement.innerText = 'Tipo de conta detectado: [EMPRESA/CNPJ]'; 
        displayElement.style.color = 'var(--accent-color)'; 
    } else if (value.length > 0 && value.length !== 11 && value.length !== 14) { 
        displayElement.style.display = 'block'; 
        displayElement.innerText = 'Documento inválido'; 
        displayElement.style.color = 'var(--danger-color)'; 
    } else { 
        displayElement.style.display = 'none'; 
    } 
    
    // Apply mask 
    if (value.length <= 11) { 
        value = value.replace(/(\d{3})(\d)/, '$1.$2'); 
        value = value.replace(/(\d{3})(\d)/, '$1.$2'); 
        value = value.replace(/(\d{3})(\d{1,2})$/, '$1-$2'); 
    } else { 
        value = value.replace(/^(\d{2})(\d)/, '$1.$2'); 
        value = value.replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3'); 
        value = value.replace(/\.(\d{3})(\d)/, '.$1/$2'); 
        value = value.replace(/(\d{4})(\d{1,2})$/, '$1-$2'); 
    } 
    input.value = value; // Garante que o valor mascarado apareça no input 
}

// Keep maskCPF for backwards compatibility
function maskCPF(input) {
    maskDocumento(input);
}

function validatePixKey(key, type) {
    const cleanKey = key.trim();
    if (!cleanKey) return false;

    switch (type.toUpperCase()) {
        case 'CPF':
            // Valida tanto formatado quanto cru
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

function formatPixKey(key, type) {
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

function smartPixMask(input) {
    const key = input.value;
    let type = null;
    
    // Tenta detectar o tipo automaticamente
    if (VIPBANK.regex.UUID.test(key)) {
        type = 'ALEATORIA';
    } else if (VIPBANK.regex.EMAIL.test(key)) {
        type = 'EMAIL';
    } else {
        const clean = key.replace(/\D/g, '');
        if (clean.length === 11) {
            type = 'CPF';
        } else if (clean.length === 14) {
            type = 'CNPJ';
        } else if (clean.length === 11 || clean.length === 13) {
            type = 'CELULAR';
        }
    }

    if (type) {
        input.value = formatPixKey(key, type);
    }
}

function maskPixKey(input, typeId) {
    const type = document.getElementById(typeId).value;
    if (type === 'CELULAR') {
        input.maxLength = 15;
        maskCelular(input);
    } else if (type === 'CPF') {
        input.maxLength = 18;
        maskCPF(input);
    } else if (type === 'CNPJ') {
        input.maxLength = 18;
        maskCNPJ(input);
    } else {
        input.maxLength = 100; // Reset para email/aleatória
    }
}

function maskCNPJ(input) {
    let value = input.value.replace(/\D/g, '');
    if (value.length > 14) value = value.slice(0, 14);
    value = value.replace(/^(\d{2})(\d)/, '$1.$2');
    value = value.replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3');
    value = value.replace(/\.(\d{3})(\d)/, '.$1/$2');
    value = value.replace(/(\d{4})(\d{1,2})$/, '$1-$2');
    input.value = value;
}

function maskCelular(input) {
    let value = input.value.replace(/\D/g, '');
    
    if (value.length > 11) value = value.slice(0, 11);
    
    // Aplica o DDD: (99) 999...
    value = value.replace(/^(\d{2})(\d)/g, '($1) $2');
    
    // Aplica o hífen: (99) 99999-9999 ou (99) 9999-9999
    if (value.length > 13) {
        // Para 11 dígitos: (99) 99999-9999
        value = value.replace(/(\d{5})(\d)/, '$1-$2');
    } else {
        // Para 10 dígitos: (99) 9999-9999
        value = value.replace(/(\d{4})(\d)/, '$1-$2');
    }
    
    input.value = value;
}

function togglePixInput() {
    const type = document.getElementById('reg-pix-type').value;
    const container = document.getElementById('pix-value-container');
    const input = document.getElementById('reg-pix-value');
    
    if (type === 'ALEATORIA') {
        container.style.display = 'block';
        input.value = '';
        input.required = true;
    } else {
        container.style.display = 'none';
        input.required = false;
        
        // Mapeia os valores automaticamente
        if (type === 'CPF' || type === 'CNPJ') input.value = document.getElementById('cpf-field').value;
        if (type === 'EMAIL') input.value = document.getElementById('email-field').value;
        if (type === 'CELULAR') input.value = document.getElementById('celular-field').value;
    }
}

window.togglePixInput = togglePixInput;

function toggleAdminMode() {
    // Removido: acesso por clique múltiplo
    // Apenas o ADMIN_EMAIL pode acessar funções admin
    if (VIPBANK.currentUser && VIPBANK.currentUser.email === ADMIN_EMAIL) {
        VIPBANK.isAdmin = true;
        toast('Acesso administrativo confirmado!', 'sucesso');
    } else {
        toast('Acesso administrativo negado!', 'erro');
        VIPBANK.isAdmin = false;
    }
}

function showModal(id) {
    if (id === 'modal-config' && VIPBANK.currentUser && VIPBANK.currentUser.email !== ADMIN_EMAIL) {
        toast('Acesso negado! Apenas administradores podem acessar configurações.', 'erro');

        return;
    }
    
    const overlay = document.getElementById('modal-overlay');
    const modal = document.getElementById(id);
    
    if (overlay) overlay.style.display = 'block';
    if (modal) modal.style.display = 'block';
    
    if (id === 'modal-register-pix') {
        const statusDiv = document.getElementById('pix-key-status');
        const display = document.getElementById('active-pix-key-display');
        const keyInput = document.getElementById('new-pix-key');
        
        if (VIPBANK.userPixKey) {
            statusDiv.style.display = 'block';
            display.innerText = VIPBANK.userPixKey;
            keyInput.value = VIPBANK.userPixKey; // Mostra chave atual no campo
        } else {
            statusDiv.style.display = 'none';
            keyInput.value = '';
        }
    }
    
    if (id === 'modal-transfer-pix') {
        const today = new Date().toISOString().split('T')[0];
        document.getElementById('transfer-date').value = today;
        document.getElementById('transfer-date').setAttribute('min', today);
    }
    
    if (id === 'modal-full-extract') {
        renderFullExtract();
    }
}

function closeModals() {
    const modalLoginManual = document.getElementById('modal-login-manual');
    const isLoginManualOpen = modalLoginManual && modalLoginManual.style.display === 'block';

    document.querySelectorAll('.modal').forEach(m => m.style.display = 'none');
    document.getElementById('modal-overlay').style.display = 'none';
    
    // Resetar modal de depósito
    resetarModalDeposito();
    
    // Limpa campos dos modais ao fechar
    const fieldsToClear = [
        'transfer-key', 'transfer-value', 'transfer-date', 'transfer-description',
        'new-pix-key', 'asaas-key', 'security-password', 'deposit-value',
        'manual-login-id', 'manual-login-pass'
    ];
    
    fieldsToClear.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    
    VIPBANK.pendingTransfer = null;

    // Se o modal de login manual foi fechado e o usuário está logado via Google mas não reautenticado
    if (isLoginManualOpen && VIPBANK.auth.currentUser && !VIPBANK.globalUserData) {
        VIPBANK.auth.signOut();
        toast('Sessão encerrada por segurança.', 'info');
    }
}

async function registerPixKey() {
    const keyInput = document.getElementById('new-pix-key');
    const typeSelect = document.getElementById('pix-key-type');
    const novaChave = keyInput.value.trim();
    const novoTipo = typeSelect.value;
    const btn = document.getElementById('btn-save-pix-key');

    if (!novaChave) { toast('Digite a nova chave!', 'erro'); return; }
    if (!VIPBANK.currentUser) { toast('Sessão expirada. Relogue.', 'erro'); return; }

    // Validação de chave PIX
    if (!validatePixKey(novaChave, novoTipo)) {
        let mensagemErro = 'Chave PIX inválida! ';
        switch (novoTipo.toUpperCase()) {
            case 'CPF': mensagemErro += 'Formato esperado: 000.000.000-00'; break;
            case 'CNPJ': mensagemErro += 'Formato esperado: 00.000.000/0001-00'; break;
            case 'EMAIL': mensagemErro += 'Formato esperado: email@dominio.com'; break;
            case 'CELULAR': mensagemErro += 'Formato esperado: (DD) 9XXXX-XXXX'; break;
            case 'ALEATORIA': mensagemErro += 'Formato esperado: XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX'; break;
        }
        toast(mensagemErro, 'erro');
        return;
    }

    const confirmar = confirm('Deseja substituir sua chave atual por: ' + novaChave + '?');
    if (!confirmar) return;

    btn.disabled = true;
    btn.innerText = 'ATUALIZANDO...';

    try {
        // Formata a chave antes de salvar
        const chaveFormatada = formatPixKey(novaChave, novoTipo);
        // Atualiza via Cloud Function
        const atualizarUsuario = VIPBANK.functions.httpsCallable('atualizarUsuario');
        await atualizarUsuario({
            dados: {
                chave_ativa: chaveFormatada,
                chave_tipo: novoTipo
            }
        });
        
        VIPBANK.userPixKey = chaveFormatada; // Atualiza na memória com a chave formatada
        toast('Chave PIX atualizada com sucesso!', false);
        closeModals();
        updateUI();
    } catch (error) {

        toast('Erro ao atualizar banco de dados.', 'erro');
    } finally {
        btn.disabled = false;
        btn.innerText = 'CADASTRAR';
    }
}

function openSecurityModal(valor, chave) {
    if(!valor || valor <= 0) {
        toast('Digite um valor válido!', 'erro');
        return;
    }
    
    if(valor > VIPBANK.balance) {
        toast('Saldo insuficiente!', 'erro');
        return;
    }
    
    if(!chave) {
        toast('Digite a chave PIX!', 'erro');
        return;
    }
    
    const data = document.getElementById('transfer-date').value;
    const descricao = document.getElementById('transfer-description').value;
    
    const cpfCnpjRegex = /^[0-9]{11,14}$/;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const celularRegex = /^(?:55)?(?:\d{11}|\d{13})$/;
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    
    let chaveParaProcessar = chave.replace(/\D/g, '');
    
    // Validação e formatação automática de celular brasileiro (11 dígitos para 13 com prefixo 55)
    if (/^\d{11}$/.test(chaveParaProcessar)) {
        chaveParaProcessar = '55' + chaveParaProcessar;
    }
    
    if (!cpfCnpjRegex.test(chaveParaProcessar) && !emailRegex.test(chave) && !celularRegex.test(chaveParaProcessar) && !uuidRegex.test(chave)) {
        toast('Chave PIX inválida', 'erro');
        return;
    }
    
    const dynamicFee = calculatePixFee();
    VIPBANK.pendingTransfer = { valor, chave: chaveParaProcessar, data, descricao, fee: dynamicFee };
    
    document.getElementById('modal-transfer-pix').style.display = 'none';
    document.getElementById('modal-security').style.display = 'block';
    
    const totalAmount = dynamicFee > 0 ? valor + dynamicFee : valor;
    const feeText = dynamicFee > 0 ? ` (taxa de ${dynamicFee.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })})` : '';
    document.getElementById('security-message').innerText = `Digite sua senha para autorizar ${totalAmount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}${feeText}`;
    
    document.getElementById('security-password').value = '';
    document.getElementById('security-password').focus();
}

function closeSecurityModal() {
    document.getElementById('modal-security').style.display = 'none';
    document.getElementById('security-password').value = '';
    VIPBANK.pendingTransfer = null;
}

async function finalizePayment() {
    const passwordInput = document.getElementById('security-password').value;
    const btn = document.getElementById('btn-finalize-payment');
    
    // Verificação Final: Senha Transacional e Saldo
    if (passwordInput !== VIPBANK.userTransPassword) {
        toast('Senha Transacional Inválida!', 'erro');
        document.getElementById('security-password').value = '';
        document.getElementById('security-password').focus();
        return;
    }
    
    if (!VIPBANK.pendingTransfer) {
        toast('Erro na transferência. Tente novamente.', 'erro');
        closeSecurityModal();
        return;
    }

    const totalAmountToDeduct = VIPBANK.pendingTransfer.valor + (VIPBANK.pendingTransfer.fee || 0);
    if (VIPBANK.balance < totalAmountToDeduct) {
        toast('Saldo insuficiente!', 'erro');
        closeSecurityModal();
        return;
    }
    
    btn.disabled = true;
    btn.innerText = 'PROCESSANDO...';
    
    try {
        await new Promise(resolve => setTimeout(resolve, 1500));
        
        const transactionType = VIPBANK.pendingTransfer.isQRPayment ? 'Pagamento QR Code' : 'Transferência PIX';
        const beneficiary = VIPBANK.pendingTransfer.isQRPayment ? VIPBANK.pendingTransfer.beneficiary : VIPBANK.pendingTransfer.chave;
        const amount = VIPBANK.pendingTransfer.isQRPayment ? VIPBANK.pendingTransfer.originalAmount : VIPBANK.pendingTransfer.valor;

        // Gerar authCode único
        const authCode = gerarAuthCode();
        const transactionId = Date.now();

        // Cria transação de saída (já confirmada) com campos obrigatórios
        const newTransaction = {
            id: transactionId,
            valor: amount,
            dataHora: firebase.firestore.FieldValue.serverTimestamp(),
            tipo: 'SAIDA',
            metodo: 'PIX',
            status: 'CONFIRMADO', // Transferências são confirmadas imediatamente
            idTransacaoAsaas: `LOCAL-${transactionId}`, // Para transações locais, prefixo LOCAL-
            authCode: authCode,
            remetente: null,
            destinatario: beneficiary,
            nomeBanco: null,
            // Campos complementares (mantidos para compatibilidade)
            type: transactionType,
            amount: amount,
            dest: beneficiary,
            date: VIPBANK.pendingTransfer.data || new Date().toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' }),
            description: VIPBANK.pendingTransfer.descricao || '',
            isCredit: false,
            fee: VIPBANK.pendingTransfer.fee || 0,
            usuarioId: VIPBANK.currentUser.uid
        };

        // Validar campos obrigatórios
        if (!validarTransacaoObrigatoria(newTransaction)) {
            throw new Error('Validação de transação falhou');
        }
        
        // Salva a transação via Cloud Function
        const criarTransacao = VIPBANK.functions.httpsCallable('criarTransacao');
        await criarTransacao({ transacao: newTransaction });
        
        // Adiciona a transação à lista local
        VIPBANK.transactions.unshift(newTransaction);
        
        if (VIPBANK.pendingTransfer.fee && VIPBANK.pendingTransfer.fee > 0) {
            // Grava taxa no cofre central via Cloud Function (apenas admin)
            try {
                const atualizarConfig = VIPBANK.functions.httpsCallable('atualizarConfiguracoesAdmin');
                await atualizarConfig({
                    configs: {
                        lucro_total: firebase.firestore.FieldValue.increment(VIPBANK.pendingTransfer.fee)
                    }
                });
                await updateProfitDisplay();
            } catch (error) {
        
            }
        }
        
        saveUserData();
        updateUI();
        
        // Atualiza sininho em tempo real
        initializeNotifications();
        
        closeSecurityModal();
        document.getElementById('modal-transfer-pix').style.display = 'none';
        
        const transactionDate = VIPBANK.pendingTransfer.data || new Date().toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }).replace(',', '');
        
        // Show receipt immediately
        showReceipt(transactionType, amount, beneficiary, transactionDate, VIPBANK.pendingTransfer.description, authCode);
        toast('Transferência concluída com sucesso!', 'sucesso');
        
    } catch (e) {
        toast('Erro no servidor. Tente mais tarde.', 'erro');
    } finally {
        btn.disabled = false;
        btn.innerText = 'FINALIZAR PAGAMENTO';
        VIPBANK.pendingTransfer = null;
    }
}

function maskMoney(i) {
    let v = i.value.replace(/\D/g, "");
    v = (v / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    
    if (!v || v === 'R$ NaN' || v === 'R$ 0,00') {
        v = 'R$ 0,00';
    }
    
    i.value = v;
}

function toast(msg, err = true) {
    const t = document.getElementById('error-toast');
    t.innerText = msg;
    t.style.background = err ? "var(--danger-color)" : "var(--success-color)";
    t.style.display = "block";
    setTimeout(() => t.style.display = "none", 3000);
}

function renderTransactions() {
    const list = document.getElementById('trans-list');
    if (!list) return;
    
    if (VIPBANK.transactions.length === 0) {
        list.innerHTML = `
            <div style="text-align: center; padding: 40px 20px;">
                <div style="font-size: 14px; color: var(--text-secondary); margin-bottom: 10px;">
                    Nenhuma atividade recente encontrada
                </div>
                <div style="font-size: 12px; color: var(--text-secondary); opacity: 0.7;">
                    Suas transações aparecerão aqui
                </div>
            </div>
        `;
        return;
    }
    
    const recentTransactions = VIPBANK.transactions.slice(0, 3);
    
    const groupedTransactions = {};
    const today = new Date().toLocaleDateString('pt-BR');
    
    recentTransactions.forEach(t => {
        const date = t.date.split(' ')[0];
        
        if (!groupedTransactions[date]) {
            groupedTransactions[date] = [];
        }
        groupedTransactions[date].push(t);
    });
    
    let html = '';
    Object.keys(groupedTransactions).forEach(date => {
        const dateLabel = date === today ? 'Hoje' : date;
        html += `
            <div style="margin-bottom: 20px;">
                <div style="color: var(--text-secondary); font-size: 12px; font-weight: 600; margin-bottom: 8px; text-transform: uppercase;">
                    ${dateLabel}
                </div>
        `;
        
        groupedTransactions[date].forEach(t => {
            const displayAmount = VIPBANK.balanceHidden ? '•••' : `${t.isCredit ? '+' : '-'} R$ ${t.amount.toFixed(2).replace('.', ',')}`;
            const displayDest = VIPBANK.balanceHidden ? '•••' : t.dest;
            const amountColor = t.isCredit ? 'var(--success-color)' : 'var(--text-primary)';
            
            html += `
                <div class="trans-item" onclick="exibirComprovante(${t.id})" style="display: flex; justify-content: space-between; align-items: center; padding: 16px 12px; border-radius: 12px;">
                    <div class="trans-details">
                        <div class="text-primary" style="font-weight: 600;">${t.type}</div>
                        <div class="text-secondary" style="font-size: 14px;">${displayDest}</div>
                    </div>
                    <div style="text-align: right;">
                        <div style="font-weight: 700; color: ${amountColor};">${displayAmount}</div>
                    </div>
                </div>
            `;
        });
        
        html += '</div>';
    });
    
    list.innerHTML = html;
}

// Exibir comprovante a partir de ID de transação no Firestore
async function exibirComprovante(transacaoId) {
    try {
        const doc = await VIPBANK.db.collection('transacoes').doc(transacaoId.toString()).get();
        
        if (!doc.exists) {
            toast('Comprovante não encontrado!', 'erro');
            return;
        }
        
        const transacao = doc.data();
        
        // Formatar tipo de transação
        const tipoTransacao = transacao.tipo === 'ENTRADA' ? 'Depósito PIX' : 'Transferência PIX';
        
        // Formatar data/hora
        let dataHoraFormatada;
        if (transacao.dataHora) {
            const data = transacao.dataHora.toDate ? transacao.dataHora.toDate() : new Date(transacao.dataHora);
            dataHoraFormatada = data.toLocaleString('pt-BR');
        } else {
            dataHoraFormatada = new Date().toLocaleString('pt-BR');
        }
        
        // Obter destinatário/remetente
        const participante = transacao.tipo === 'ENTRADA' 
            ? (transacao.remetente || 'Depósito') 
            : (transacao.destinatario || '-');
        
        // Obter nome do banco
        const banco = transacao.nomeBanco || '-';
        
        // Usar showReceipt existente para exibir
        showReceipt(tipoTransacao, parseFloat(transacao.valor), participante, dataHoraFormatada, banco, transacao.authCode);
        
    } catch (error) {

        toast('Erro ao carregar comprovante!', 'erro');
    }
}

function showReceipt(type, amount, dest, date = null, description = null, authCode = null) {
    document.getElementById('receipt-amount').innerText = amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    document.getElementById('receipt-type').innerText = type;
    document.getElementById('receipt-dest').innerText = dest;
    document.getElementById('receipt-date').innerText = date || new Date().toLocaleString('pt-BR');
    
    // Usar authCode real se disponível, caso contrário gerar um temporário
    if (authCode) {
        document.getElementById('receipt-auth').innerText = authCode;
    } else {
        document.getElementById('receipt-auth').innerText = Math.random().toString(36).substr(2, 12).toUpperCase();
    }
    
    if (description) {
        document.getElementById('receipt-description').innerText = description;
    } else {
        document.getElementById('receipt-description').innerText = 'Pagamento via VIP BANK';
    }
    
    showModal('modal-receipt');
}

function newTransferFromReceipt() {
    closeModals();
    showModal('modal-transfer-pix');
}

function closeReceiptAndGoHome() {
    closeModals();
    // No dashboard principal já está visível, só precisa de fechar os modais
}

function shareReceipt() {
    const text = `🏦 VIP BANK | COMPROVANTE\nValor: ${document.getElementById('receipt-amount').innerText}\nDestino: ${document.getElementById('receipt-dest').innerText}\nAutenticação: ${document.getElementById('receipt-auth').innerText}`;
    if (navigator.share) {
        navigator.share({ title: 'Comprovante VIP', text: text }).catch(() => copyReceiptText(text));
    } else {
        copyReceiptText(text);
    }
}

function copyReceiptText(text) {
    try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(() => {
                toast('Comprovante copiado para a área de transferência!', 'sucesso');
            }).catch(() => {
                fallbackCopy(text);
            });
        } else {
            fallbackCopy(text);
        }
    } catch (error) {
        prompt('Copie manualmente o comprovante:', text);
    }
}

function fallbackCopy(text) {
    try {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.opacity = '0';
        document.body.appendChild(textArea);
        textArea.select();
        const successful = document.execCommand('copy');
        document.body.removeChild(textArea);
        
        if (successful) {
            toast('Comprovante copiado!', 'sucesso');
        } else {
            throw new Error('execCommand failed');
        }
    } catch (error) {
        prompt('Copie manualmente o comprovante:', text);
    }
}

function printReceipt() {
    const originalTitle = document.title;
    document.title = "Comprovante_VIP_BANK_" + document.getElementById('receipt-auth').innerText;
    window.print();
    document.title = originalTitle;
}

function updateUI() {
    const balanceText = document.getElementById('txt-saldo');
    if (balanceText) {
        if (VIPBANK.balanceHidden) {
            balanceText.innerText = '•••';
        } else {
            balanceText.innerText = VIPBANK.balance.toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'});
        }
    }
    renderTransactions();
}

function startQRScanner() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        toast('Seu navegador não suporta acesso à câmera', 'erro');
        return;
    }
    
    showModal('modal-qr-scanner');
    
    VIPBANK.qrScanner = new Html5Qrcode("qr-reader");
    
    const config = { 
        fps: 10, 
        qrbox: { width: 250, height: 250 },
        aspectRatio: 1.0
    };
    
    VIPBANK.qrScanner.start(
        { facingMode: "environment" },
        config,
        (decodedText, decodedResult) => {
            processQRCode(decodedText);
        },
        (errorMessage) => {
        }
    ).catch((err) => {

        
        stopQRScanner();
    });
}

function stopQRScanner() {
    if (VIPBANK.qrScanner) {
        VIPBANK.qrScanner.stop().then(() => {
            VIPBANK.qrScanner.clear();
            VIPBANK.qrScanner = null;
        }).catch((err) => {

        });
    }
    
    document.getElementById('modal-qr-scanner').style.display = 'none';
    document.getElementById('modal-overlay').style.display = 'none';
    closeModals();
}

function processQRCode(qrData) {
    try {
        const isBoleto = /^\d{44,48}$/.test(qrData);
        
        if (isBoleto) {
            toast('Boleto identificado', 'sucesso');
            stopQRScanner();
            return;
        }
        
        const mockData = {
            beneficiary: 'Loja Exemplo Ltda',
            amount: 150.00,
            key: 'exemplo@pix.com.br'
        };
        
        const dynamicFee = calculateQRFee();
        
        VIPBANK.qrPaymentData = {
            ...mockData,
            totalAmount: mockData.amount + dynamicFee,
            fee: dynamicFee
        };
        
        stopQRScanner();
        
        document.getElementById('qr-beneficiary').innerText = VIPBANK.qrPaymentData.beneficiary;
        document.getElementById('qr-amount').innerText = VIPBANK.qrPaymentData.amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        document.getElementById('qr-fee').innerText = `Taxa de serviço: ${VIPBANK.qrPaymentData.fee.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`;
        
        showModal('modal-qr-payment');
        
    } catch (error) {

        stopQRScanner();
    }
}

function confirmQRPayment() {
    if (!VIPBANK.qrPaymentData) {
        toast('Erro nos dados do pagamento', 'erro');
        return;
    }
    
    const totalRequired = VIPBANK.qrPaymentData.totalAmount;
    if (VIPBANK.balance < totalRequired) {
        toast('Saldo insuficiente para incluir taxa!', 'erro');
        return;
    }
    
    closeQRPayment();
    openSecurityModal(totalRequired, VIPBANK.qrPaymentData.key);
    
    VIPBANK.pendingTransfer = { 
        ...VIPBANK.pendingTransfer, 
        isQRPayment: true,
        beneficiary: VIPBANK.qrPaymentData.beneficiary,
        originalAmount: VIPBANK.qrPaymentData.amount,
        fee: VIPBANK.qrPaymentData.fee
    };
}

function closeQRPayment() {
    document.getElementById('modal-qr-payment').style.display = 'none';
    VIPBANK.qrPaymentData = null;
}

async function saveKey() { 
    if (!VIPBANK.isAdmin) {
        toast('Acesso negado! Apenas administradores podem alterar configurações.', 'erro');
        return;
    }
    const newApiKey = document.getElementById('asaas-key').value; 
    
    try {
        // Salvar via Cloud Function
        const atualizarConfig = VIPBANK.functions.httpsCallable('atualizarConfiguracoesAdmin');
        await atualizarConfig({
            configs: {
                asaas_api_key: newApiKey
            }
        });
        
        VIPBANK.apiKey = newApiKey;
        toast('Configuração salva com sucesso!', 'sucesso'); 
        closeModals(); 
    } catch (error) {

        toast('Erro ao salvar configuração.', 'erro');
    }
}



async function updateProfitDisplay() {
    const profitDisplay = document.getElementById('profit-display');
    if (profitDisplay) {
        try {
            // Busca lucro direto do documento mestre admin/configuracoes
            const adminDoc = await VIPBANK.db.collection('admin').doc('configuracoes').get();
            const lucroTotal = adminDoc.exists ? adminDoc.data().lucro_total || 0 : 0;
            profitDisplay.innerText = lucroTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        } catch (error) {
    
            profitDisplay.innerText = 'R$ 0,00';
        }
    }
}

function calculatePixFee() {
    if (VIPBANK.userCPF.length === 11) {
        return 0;
    } else if (VIPBANK.userCPF.length === 14) {
        return VIPBANK.ASAAS_PIX_FEE;
    } else {
        return VIPBANK.ASAAS_PIX_FEE;
    }
}

function calculateQRFee() {
    // Pagamento de boletos/contas cobra taxa para TODOS
    return VIPBANK.ASAAS_PIX_FEE;
}

async function redeemProfit() {
    if (VIPBANK.currentUser && VIPBANK.currentUser.email !== ADMIN_EMAIL) {
        toast('Acesso negado! Apenas administradores podem resgatar lucros.', 'erro');
        return;
    }
    
    try {
        const resgatarLucro = VIPBANK.functions.httpsCallable('resgatarLucroAdmin');
        const result = await resgatarLucro();
        
        if (result.data.sucesso) {
            const lucroTotal = result.data.lucroTotal;
            const newBalance = result.data.newBalance;
            
            toast(`Lucro de ${lucroTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} resgatado com sucesso!`, 'sucesso');
            
            // Atualiza displays
            await updateProfitDisplay();
            if (VIPBANK.currentUser.email === ADMIN_EMAIL) {
                VIPBANK.balance = newBalance;
                updateUI();
            }
        } else {
            toast(result.data.mensagem || 'Erro ao resgatar lucro', 'erro');
        }
    } catch (error) {


    }
}

function renderFullExtract() {
    const balanceElement = document.getElementById('extract-balance');
    const listElement = document.getElementById('full-transactions-list');
    
    if (!balanceElement || !listElement) return;
    
    balanceElement.innerText = VIPBANK.balance.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    
    let html = '';
    
    if (VIPBANK.transactions.length === 0) {
        html = '<div style="text-align: center; color: var(--text-secondary); padding: 20px;">Nenhuma transação encontrada</div>';
    } else {
        VIPBANK.transactions.forEach(t => {
            const displayAmount = VIPBANK.balanceHidden ? '•••' : `${t.isCredit ? '+' : '-'} R$ ${t.amount.toFixed(2).replace('.', ',')}`;
            const displayDest = VIPBANK.balanceHidden ? '•••' : t.dest;
            const amountColor = t.isCredit ? 'var(--success-color)' : 'var(--danger-color)';
            
            html += `
                <div style="background: var(--card-bg); padding:15px; border-radius: 12px; border: 1px solid rgba(255, 255, 255, 0.1);">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                        <div style="font-size: 14px; color: var(--text-primary); font-weight: 500;">
                            ${displayDest}
                        </div>
                        <div style="color: ${amountColor}; font-weight: 600; font-size: 16px;">
                            ${displayAmount}
                        </div>
                    </div>
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <div style="font-size: 12px; color: var(--text-secondary);">
                            ${t.type}
                        </div>
                        <div style="font-size: 12px; color: var(--text-secondary);">
                            ${t.date}
                        </div>
                    </div>
                    ${t.description ? `<div style="font-size: 11px; color: var(--text-secondary); margin-top: 5px; font-style: italic;">
                        ${t.description}
                    </div>` : ''}
                    ${t.fee && t.fee > 0 ? `<div style="font-size: 11px; color: var(--accent-color); margin-top: 5px;">
                        Taxa: R$ ${t.fee.toFixed(2).replace('.', ',')}
                    </div>` : ''}
                </div>
            `;
        });
    }
    
    listElement.innerHTML = html;
}

function checkTimeAndApplyTheme() {
    const now = new Date();
    const hour = now.getHours();
    const isNightTime = hour >= 18 || hour < 6;
    
    if (isNightTime) {
        document.documentElement.style.setProperty('--bg-color', '#1a1a1a');
        document.documentElement.style.setProperty('--text-primary', '#ffffff');
        document.documentElement.style.setProperty('--text-secondary', '#a0a0a0');
        document.documentElement.style.setProperty('--accent-color', '#ff9800');
        document.documentElement.style.setProperty('--success-color', '#00c851');
        document.documentElement.style.setProperty('--danger-color', '#ff5252');
        document.documentElement.style.setProperty('--card-bg', 'rgba(10, 10, 10, 0.8)');
        document.documentElement.style.setProperty('--glass-bg', 'rgba(10, 10, 10, 0.8)');
        
        document.querySelectorAll('.balance-card, .btn-action').forEach(el => {
            el.classList.remove('light-mode');
        });
        document.body.classList.remove('light-mode');
    } else {
        document.documentElement.style.setProperty('--bg-color', '#f8f9fa');
        document.documentElement.style.setProperty('--text-primary', '#1a1a1a');
        document.documentElement.style.setProperty('--text-secondary', '#6c757d');
        document.documentElement.style.setProperty('--accent-color', '#ff9800');
        document.documentElement.style.setProperty('--success-color', '#00c851');
        document.documentElement.style.setProperty('--danger-color', '#ff5252');
        document.documentElement.style.setProperty('--card-bg', '#ffffff');
        document.documentElement.style.setProperty('--glass-bg', 'rgba(255, 255, 255, 0.8)');
        
        document.querySelectorAll('.balance-card, .btn-action').forEach(el => {
            el.classList.add('light-mode');
        });
        document.body.classList.add('light-mode');
    }
}

setInterval(checkTimeAndApplyTheme, 60000);

// Listener direto e simples para os botões
document.addEventListener('DOMContentLoaded', () => {
    // Botão Entrar
    const btnEntrar = document.getElementById('btn-entrar-google');
    if (btnEntrar) {
        btnEntrar.addEventListener('click', async (e) => {
            e.preventDefault();
            if (window.iniciarLogin) {
                await window.iniciarLogin();
            } else if (window.verificarLogin) {
                await window.verificarLogin();
            }
        });
    }

    // Botão Abrir Conta
    const btnAbrirConta = document.getElementById('btn-abrir-conta');
    if (btnAbrirConta) {
        btnAbrirConta.addEventListener('click', async (e) => {
            e.preventDefault();
            if (window.abrirConta) {
                await window.abrirConta();
            }
        });
    }

    // Link Privacidade
    const privacyLink = document.getElementById('privacy-link');
    if (privacyLink) {
        privacyLink.addEventListener('click', (e) => {
            e.preventDefault();
            if (window.showModal) {
                window.showModal('modal-privacy');
            }
        });
    }

    if (window.loadUserData) {
        window.loadUserData();
    }
    checkTimeAndApplyTheme();
    updateUI();
    updateProfitDisplay();
});

// Segurança: Encerra sessão ao fechar ou ocultar a aba
document.addEventListener('visibilitychange', function() {
    if (document.visibilityState === 'hidden' && VIPBANK.currentUser) {
        sairComSeguranca();
    }
});

function initializeNotifications() {
    // Calcula transações não visualizadas (últimas 5)
    if (VIPBANK.transactions && VIPBANK.transactions.length > 0) {
        const recentTransactions = VIPBANK.transactions.slice(-5);
        VIPBANK.unreadTransactions = recentTransactions.length;
        
        // Mostra ponto vermelho se houver transações não visualizadas
        const notificationDot = document.getElementById('notification-dot');
        if (notificationDot) {
            notificationDot.style.display = VIPBANK.unreadTransactions > 0 ? 'block' : 'none';
        }
    }
}

function showNotifications() {
    const notificationsList = document.getElementById('notifications-list');
    
    if (VIPBANK.transactions && VIPBANK.transactions.length > 0) {
        // Pega as 5 últimas transações
        const recentTransactions = VIPBANK.transactions.slice(-5).reverse();
        
        let html = '';
        recentTransactions.forEach(t => {
            const time = new Date(t.date).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
            html += `
                <div style="background: var(--card-bg); padding: 15px; border-radius: 12px; margin-bottom: 10px; border: 1px solid rgba(255, 255, 255, 0.1);">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                        <div style="font-weight: 600; color: var(--text-primary);">${t.type}</div>
                        <div style="font-weight: 600; color: ${t.isCredit ? 'var(--success-color)' : 'var(--danger-color)'};">
                            ${t.isCredit ? '+' : '-'} R$ ${t.amount.toFixed(2).replace('.', ',')}
                        </div>
                    </div>
                    <div style="font-size: 12px; color: var(--text-secondary);">
                        ${time}
                    </div>
                </div>
            `;
        });
        
        notificationsList.innerHTML = html;
        
        // Marca como lido (remove ponto vermelho)
        const notificationDot = document.getElementById('notification-dot');
        if (notificationDot) {
            notificationDot.style.display = 'none';
        }
        VIPBANK.unreadTransactions = 0;
    } else {
        notificationsList.innerHTML = '<div style="text-align: center; color: var(--text-secondary); padding: 20px;">Nenhuma transação encontrada.</div>';
    }
    
    showModal('modal-notifications');
}

function showAdminPanel() {
    if (VIPBANK.currentUser && VIPBANK.currentUser.email !== ADMIN_EMAIL) {
        toast('Acesso negado!', 'erro');
        return;
    }
    
    showModal('modal-admin-master');
}



async function savePixFee() {
    if (VIPBANK.currentUser && VIPBANK.currentUser.email !== ADMIN_EMAIL) {
        toast('Acesso negado!', 'erro');
        return;
    }
    
    const feeInput = document.getElementById('pix-fee-input');
    const newFee = parseFloat(feeInput.value.replace(',', '.'));
    
    if (isNaN(newFee) || newFee < 0) {
        toast('Valor da taxa inválido!', 'erro');
        return;
    }
    
    try {
        const atualizarConfig = VIPBANK.functions.httpsCallable('atualizarConfiguracoesAdmin');
        await atualizarConfig({
            configs: {
                valor_taxa_pix: newFee
            }
        });
        
        VIPBANK.ASAAS_PIX_FEE = newFee;
        toast(`Taxa Pix atualizada para R$ ${newFee.toFixed(2)}`, 'sucesso');
        feeInput.value = '';
    } catch (error) {
        toast('Erro ao salvar taxa. Tente novamente.', 'erro');
    }
}

async function deletarMinhaConta() {
    // Regra 1: Verificar saldo é 0
    if (VIPBANK.balance > 0) {
        toast('Saque todo o saldo antes de encerrar!', 'erro');
        return;
    }

    // Regra 2: Confirmação inicial
    const confirmar = confirm("ATENÇÃO: Esta ação é irreversível! Seu saldo, chaves e extratos serão apagados para sempre. Deseja continuar?");
    if (!confirmar) return;

    // Regra 3: Pedir senha e validar
    const senha = prompt("Por segurança, digite sua SENHA DE ACESSO para confirmar a exclusão:");
    if (!senha) {
        toast('Senha não digitada!', 'erro');
        return;
    }
    if (senha !== VIPBANK.globalUserData.senha) {
        toast("Senha incorreta! Operação cancelada.", "erro");
        return;
    }

    // Regra 4: Deletar via Cloud Function
    try {
        const deletarConta = VIPBANK.functions.httpsCallable('deletarContaUsuario');
        await deletarConta();
        
        // Limpar localStorage
        localStorage.clear();
        sessionStorage.clear();
        
        alert("Conta VIP encerrada com sucesso. Seus dados foram removidos.");
        location.reload(); // Volta para a tela de login inicial
    } catch (error) {
        toast("Erro ao encerrar conta. Tente relogar e tentar novamente.", "erro");
    }
}

function saveData() {
    if (VIPBANK.currentUser) {
        saveUserData();
    }
}

function updateBalanceAndTransactions(newBalance, newTransactions) {
    VIPBANK.balance = newBalance;
    VIPBANK.transactions = newTransactions;
    saveData();
    updateUI();
}

// Função de force login para o dono do sistema
async function forceLogin() {
    const OWNER_UID = 'Vdyk1Z2neWXNTjcsz9wzZEkQlum2';
    
    try {
        // 1. Tenta buscar o documento do dono diretamente no Firestore
        const userDoc = await VIPBANK.db.collection('usuarios').doc(OWNER_UID).get();
        
        if (userDoc.exists) {
            const userData = userDoc.data();
            
            // 2. Atualiza as variáveis globais
            VIPBANK.currentUser = {
                uid: OWNER_UID,
                email: userData.email,
                displayName: userData.nome
            };
            VIPBANK.globalUserData = userData;
            VIPBANK.balance = userData.balance || 0;
            VIPBANK.transactions = userData.transactions || [];
            
            // 3. Mostra o painel principal
            entrar();
            updateUI();
            updateProfitDisplay();
            initializeNotifications();
        } else {
            toast('Conta do dono não encontrada', 'erro');
        }
    } catch (error) {
        toast('Erro ao acessar conta do dono', 'erro');
    }
}

// Vincula funções ao objeto window para acesso global via HTML onclick
window.forceLogin = forceLogin;
window.showModal = showModal;
window.startQRScanner = startQRScanner;
window.closeModals = closeModals;
window.closeQRPayment = closeQRPayment; // Add other modal functions too
window.toggleBalanceVisibility = toggleBalanceVisibility;
window.maskDocumento = maskDocumento;
window.maskCPF = maskCPF;
window.validatePixKey = validatePixKey;
window.formatPixKey = formatPixKey;
window.smartPixMask = smartPixMask;
window.maskPixKey = maskPixKey;
window.maskCNPJ = maskCNPJ;
window.maskCelular = maskCelular;
window.togglePixInput = togglePixInput;
window.toggleAdminMode = toggleAdminMode;
window.registerPixKey = registerPixKey;
window.openSecurityModal = openSecurityModal;
window.closeSecurityModal = closeSecurityModal;
window.finalizePayment = finalizePayment;
window.maskMoney = maskMoney;
window.toast = toast;
window.renderTransactions = renderTransactions;
window.exibirComprovante = exibirComprovante;
window.showReceipt = showReceipt;
window.newTransferFromReceipt = newTransferFromReceipt;
window.closeReceiptAndGoHome = closeReceiptAndGoHome;
window.shareReceipt = shareReceipt;
window.copyReceiptText = copyReceiptText;
window.fallbackCopy = fallbackCopy;
window.printReceipt = printReceipt;
window.updateUI = updateUI;
window.checkTimeAndApplyTheme = checkTimeAndApplyTheme;
window.sairComSeguranca = sairComSeguranca;
window.showNotifications = showNotifications;
window.showAdminPanel = showAdminPanel;
window.maskName = maskName;
window.validateEmail = validateEmail;
window.maskTransactionPassword = maskTransactionPassword;
window.handleTransferClick = handleTransferClick;
window.savePixFee = savePixFee;
window.deletarMinhaConta = deletarMinhaConta;
window.saveData = saveData;
window.updateBalanceAndTransactions = updateBalanceAndTransactions;
