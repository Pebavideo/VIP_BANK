console.log('✅ src/api/asaas.js carregado');

// TODOS OS ACESSOS DIRETOS VIA VIPBANK (sem redeclarações!)
let qrCodeInstance = null;
let pixCopiaCola = '';

async function gerarCobrancaPix() {
    const valueInput = document.getElementById('deposit-value');
    const value = parseFloat(valueInput.value.replace(/[^\d,]/g, '').replace(',', '.')) || 0;
    
    if (value <= 0) {
        toast('Valor inválido!', 'erro');
        return;
    }

    // Obter a API key do Asaas (primeiro tenta do admin, pois deve ser uma chave de produção/sanVIPBANK.dbox)
    let asaasApiKey;
    try {
        const adminDoc = await VIPBANK.db.collection('admin').doc('configuracoes').get();
        if (adminDoc.exists && adminDoc.data().asaas_api_key) {
            asaasApiKey = adminDoc.data().asaas_api_key;
        }
    } catch (e) {
        console.error('Erro ao buscar API key:', e);
    }

    if (!asaasApiKey) {
        toast('API Key do Asaas não configurada!', 'erro');
        return;
    }

    const btnGerar = document.getElementById('btn-gerar-pix');
    btnGerar.disabled = true;
    btnGerar.innerText = 'GERANDO...';

    try {
        // Requisição para API do Asaas para gerar cobrança Pix
        const response = await fetch('https://www.asaas.com/api/v3/payments', {
            method: 'POST',
            headers: {
                'accept': 'application/json',
                'content-type': 'application/json',
                'access_token': asaasApiKey
            },
            body: JSON.stringify({
                billingType: 'PIX',
                value: value,
                dueDate: new Date().toISOString().split('T')[0],
                description: `Depósito VIP BANK - ${VIPBANK.currentUser.email}`,
                customer: VIPBANK.currentUser.uid // opcional: se você pode criar clientes no Asaas
            })
        });

        if (!response.ok) {
            throw new Error('Erro ao gerar cobrança');
        }

        const data = await response.json();

        // Obter o QR Code e Pix Copia e Cola
        const pixResponse = await fetch(`https://www.asaas.com/api/v3/payments/${data.id}/pixQrCode`, {
            headers: {
                'accept': 'application/json',
                'access_token': asaasApiKey
            }
        });

        if (!pixResponse.ok) {
            throw new Error('Erro ao obter QR Code');
        }

        const pixData = await pixResponse.json();
        pixCopiaCola = pixData.payload;

        // Gerar authCode único
        const authCode = gerarAuthCode();
        const transactionId = Date.now();

        // Criar registro de transação PENDENTE no Firestore com campos obrigatórios
        const newTransaction = {
            id: transactionId,
            valor: value,
            dataHora: firebase.firestore.FieldValue.serverTimestamp(),
            tipo: 'ENTRADA',
            metodo: 'PIX',
            status: 'PENDENTE',
            idTransacaoAsaas: data.id,
            authCode: authCode,
            remetente: null, // Será preenchido via Webhook Asaas
            destinatario: null,
            nomeBanco: null,
            // Campos complementares (mantidos para compatibilidade)
            type: 'Depósito Pix',
            amount: value,
            dest: 'Depósito em Conta',
            date: new Date().toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' }),
            isCredit: true,
            paymentId: data.id,
            asaasId: data.id,
            asaasStatus: data.status,
            asaasInvoiceUrl: data.invoiceUrl,
            pixPayload: pixData.payload,
            pixQrCode: pixData.encodedImage,
            usuarioId: VIPBANK.currentUser.uid
        };

        // Validar campos obrigatórios
        if (!validarTransacaoObrigatoria(newTransaction)) {
            throw new Error('Validação de transação falhou');
        }

        VIPBANK.transactions.unshift(newTransaction);

        // Salvar transação via Cloud Function
        const criarTransacao = VIPBANK.functions.httpsCallable('criarTransacao');
        await criarTransacao({ transacao: newTransaction });

        await saveUserData();

        // Exibir passo 2 do modal
        document.getElementById('deposit-step-1').style.display = 'none';
        document.getElementById('deposit-step-2').style.display = 'block';

        // Exibir Pix Copia e Cola
        document.getElementById('pix-copia-cola').innerText = pixCopiaCola;

        // Gerar QR Code
        const qrCodeDiv = document.getElementById('pix-qr-code');
        qrCodeDiv.innerHTML = '';
        if (qrCodeInstance) {
            qrCodeInstance.clear();
        }
        qrCodeInstance = new QRCode(qrCodeDiv, {
            text: pixCopiaCola,
            width: 200,
            height: 200,
            colorDark: '#000000',
            colorLight: '#ffffff',
            correctLevel: QRCode.CorrectLevel.H
        });

        toast('QR Code gerado com sucesso!', false);

    } catch (error) {
        console.error('Erro:', error);
        toast('Erro ao gerar cobrança Pix. Tente novamente.', 'erro');
    } finally {
        btnGerar.disabled = false;
        btnGerar.innerText = 'GERAR QR CODE PIX';
    }
}

function copiarPix() {
    if (!pixCopiaCola) {
        toast('Nenhum código Pix disponível!', 'erro');
        return;
    }

    try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(pixCopiaCola).then(() => {
                toast('Código Pix copiado com sucesso!', false);
            }).catch(() => {
                fallbackCopyPix();
            });
        } else {
            fallbackCopyPix();
        }
    } catch (error) {
        fallbackCopyPix();
    }
}

function fallbackCopyPix() {
    try {
        const textArea = document.createElement('textarea');
        textArea.value = pixCopiaCola;
        textArea.style.position = 'fixed';
        textArea.style.opacity = '0';
        document.body.appendChild(textArea);
        textArea.select();
        const successful = document.execCommand('copy');
        document.body.removeChild(textArea);
        
        if (successful) {
            toast('Código Pix copiado com sucesso!', false);
        } else {
            throw new Error('execCommand failed');
        }
    } catch (error) {
        prompt('Copie manualmente o código Pix:', pixCopiaCola);
    }
}

function resetarModalDeposito() {
    document.getElementById('deposit-step-1').style.display = 'block';
    document.getElementById('deposit-step-2').style.display = 'none';
    document.getElementById('deposit-value').value = '';
    pixCopiaCola = '';
    if (qrCodeInstance) {
        qrCodeInstance.clear();
        qrCodeInstance = null;
    }
}
