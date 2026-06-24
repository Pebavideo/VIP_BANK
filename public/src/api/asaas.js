

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

    const btnGerar = document.getElementById('btn-gerar-pix');
    btnGerar.disabled = true;
    btnGerar.innerText = 'GERANDO...';

    try {
// Chamar Cloud Function segura
        const gerarCobranca = VIPBANK.functions.httpsCallable('gerarCobrancaPixAsaas');
        const response = await gerarCobranca({ value: value });
        const result = response.data;

        if (!result.sucesso) {

        }

        pixCopiaCola = result.pixPayload;

        // Adicionar transação à lista local
        const newTransaction = {
            id: result.transactionId,
            valor: value,
            dataHora: new Date(), // Será atualizado pelo Firestore
            tipo: 'ENTRADA',
            metodo: 'PIX',
            status: 'PENDENTE',
            idTransacaoAsaas: result.paymentId,
            authCode: result.authCode,
            paymentId: result.paymentId,
            pixPayload: result.pixPayload,
            pixQrCode: result.pixQrCode,
            usuarioId: VIPBANK.currentUser.uid
        };

        VIPBANK.transactions.unshift(newTransaction);
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

// Vincula funções ao window para acesso global
window.gerarCobrancaPix = gerarCobrancaPix;
window.copiarPix = copiarPix;
window.fallbackCopyPix = fallbackCopyPix;
window.resetarModalDeposito = resetarModalDeposito;
