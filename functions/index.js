const functions = require("firebase-functions");
const admin = require("firebase-admin");
const crypto = require("crypto");
admin.initializeApp();
const db = admin.firestore();

// Função para validar a assinatura do webhook do Asaas
function validarAssinaturaAsaas(assinatura, body, webhookSecret) {
    try {
        const hmac = crypto.createHmac("sha256", webhookSecret);
        const calculatedSignature = hmac.update(JSON.stringify(body)).digest("hex");
        return crypto.timingSafeEqual(
            Buffer.from(assinatura),
            Buffer.from(calculatedSignature)
        );
    } catch (error) {
        console.error("Erro na validação de assinatura:", error);
        return false;
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

// Cloud Function 1: Receber webhook do Asaas (para depósitos - ENTRADAS)
exports.processarWebhookAsaas = functions.https.onRequest(
    async (request, response) => {
        try {
            if (request.method !== "POST") {
                return response.status(405).send("Método não permitido");
            }

            const assinatura = request.headers["asaas-signature"];
            if (!assinatura) {
                return response.status(400).send("Assinatura ausente");
            }

            const configDoc = await db.collection("admin").doc("configuracoes").get();
            const webhookSecret = configDoc.data()?.asaas_webhook_secret;

            if (!webhookSecret) {
                console.error("Webhook Secret não configurado");
                return response.status(500).send("Configuração incompleta");
            }

            const assinaturaValida = validarAssinaturaAsaas(
                assinatura,
                request.body,
                webhookSecret
            );

            if (!assinaturaValida) {
                console.warn("Assinatura inválida - requisição rejeitada");
                return response.status(403).send("Assinatura inválida");
            }

            const evento = request.body;
            console.log("Webhook recebido:", evento);

            if (
                evento.event === "PAYMENT_RECEIVED" ||
                evento.event === "PAYMENT_CONFIRMED"
            ) {
                const pagamento = evento.payment;
                const paymentId = pagamento.id;

                const transacoesSnapshot = await db
                    .collection("transacoes")
                    .where("paymentId", "==", paymentId)
                    .limit(1)
                    .get();

                if (transacoesSnapshot.empty) {
                    console.warn(`Transação com paymentId ${paymentId} não encontrada`);
                    return response.status(200).send("OK - Transação não encontrada");
                }

                const transacaoDoc = transacoesSnapshot.docs[0];
                const transacao = transacaoDoc.data();

                // Extrair dados do webhook para remetente e nomeBanco
                const dadosAdicionais = {};
                if (pagamento.creditCard) {
                    dadosAdicionais.remetente = pagamento.creditCard.holderName || null;
                }
                if (pagamento.bankSlip) {
                    dadosAdicionais.nomeBanco = 'Boleto';
                }
                if (pagamento.pix) {
                    dadosAdicionais.nomeBanco = 'PIX - Asaas';
                }
                
                // Atualizar transação com dados do webhook
                const transacaoAtualizada = {
                    ...transacao,
                    status: 'CONFIRMADO',
                    asaasStatus: pagamento.status,
                    dataHoraConfirmacao: admin.firestore.FieldValue.serverTimestamp(),
                    dadosWebhookAsaas: evento, // Salvar todo o JSON do webhook para auditoria
                    remetente: dadosAdicionais.remetente || transacao.remetente,
                    nomeBanco: dadosAdicionais.nomeBanco || transacao.nomeBanco
                };

                // Validar campos obrigatórios
                if (!validarTransacaoObrigatoria(transacaoAtualizada)) {
                    return response.status(400).send("Validação de transação falhou");
                }

                await db.collection("transacoes").doc(transacaoDoc.id).set(transacaoAtualizada, { merge: true });

                // Atualizar o saldo do usuário
                await db.collection("usuarios").doc(transacao.usuarioId).update({
                    balance: admin.firestore.FieldValue.increment(transacao.valor)
                });

                console.log(`Transação ${transacaoDoc.id} confirmada com sucesso! Valor: ${pagamento.value}`);
            }

            return response.status(200).send("OK");
        } catch (error) {
            console.error("Erro no processamento do webhook:", error);
            return response.status(500).send("Erro interno");
        }
    }
);

// Cloud Function 2: Processar transações de SAÍDA (transferências/Pix)
exports.processarTransacaoSaida = functions.firestore
    .document("transacoes/{transacaoId}")
    .onCreate(async (snap, context) => {
        const transacao = snap.data();

        // Apenas processar se for SAÍDA
        if (transacao.tipo !== "SAIDA") {
            return null;
        }

        // Calcular total a deduzir
        const valorTotal = transacao.valor + (transacao.fee || 0);
        console.log(`Processando transação de saída: ${context.params.transacaoId} - Valor total: ${valorTotal}`);

        // Atualizar o saldo do usuário
        await db
            .collection("usuarios")
            .doc(transacao.usuarioId)
            .update({
                balance: admin.firestore.FieldValue.increment(-valorTotal)
            });

        console.log(`Saldo atualizado para ${transacao.usuarioId} - deduzido ${valorTotal}`);
    });
