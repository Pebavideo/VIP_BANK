const functions = require("firebase-functions");
const admin = require("firebase-admin");
const crypto = require("crypto");
admin.initializeApp();
const db = admin.firestore();

// ==========================================
// CALLABLE CLOUD FUNCTIONS (para front-end)
// ==========================================

// 1. Criar conta de usuário
exports.criarContaUsuario = functions.https.onCall(async (data, context) => {
    // Verificar autenticação
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Usuário não autenticado');
    }

    const uid = context.auth.uid;
    const dadosUsuario = data.dadosUsuario;

    try {
        // Salvar dados do usuário no Firestore
        await db.collection('usuarios').doc(uid).set(dadosUsuario, { merge: true });
        console.log(`✅ Conta criada para usuário: ${uid}`);
        return { sucesso: true, mensagem: 'Conta criada com sucesso' };
    } catch (error) {
        console.error('❌ Erro ao criar conta:', error);
        throw new functions.https.HttpsError('internal', 'Erro ao criar conta', error);
    }
});

// 2. Atualizar dados do usuário
exports.atualizarUsuario = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Usuário não autenticado');
    }

    const uid = context.auth.uid;
    const dadosAtualizados = data.dados;

    try {
        await db.collection('usuarios').doc(uid).update(dadosAtualizados);
        console.log(`✅ Dados atualizados para usuário: ${uid}`);
        return { sucesso: true };
    } catch (error) {
        console.error('❌ Erro ao atualizar usuário:', error);
        throw new functions.https.HttpsError('internal', 'Erro ao atualizar dados', error);
    }
});

// 3. Criar transação
exports.criarTransacao = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Usuário não autenticado');
    }

    const transacao = data.transacao;
    transacao.usuarioId = context.auth.uid;

    try {
        // Salvar transação no Firestore
        await db.collection('transacoes').doc(transacao.id.toString()).set(transacao);
        console.log(`✅ Transação criada: ${transacao.id}`);
        return { sucesso: true, transacao };
    } catch (error) {
        console.error('❌ Erro ao criar transação:', error);
        throw new functions.https.HttpsError('internal', 'Erro ao criar transação', error);
    }
});

// 4. Atualizar configurações admin (apenas para dono)
exports.atualizarConfiguracoesAdmin = functions.https.onCall(async (data, context) => {
    const ADMIN_EMAIL = 'jjoserobertorocharocha@gmail.com';
    
    if (!context.auth || context.auth.token.email !== ADMIN_EMAIL) {
        throw new functions.https.HttpsError('permission-denied', 'Acesso negado');
    }

    const novasConfigs = data.configs;

    try {
        await db.collection('admin').doc('configuracoes').set(novasConfigs, { merge: true });
        console.log('✅ Configurações admin atualizadas');
        return { sucesso: true };
    } catch (error) {
        console.error('❌ Erro ao atualizar configs:', error);
        throw new functions.https.HttpsError('internal', 'Erro ao atualizar configurações', error);
    }
});

// 5. Deletar conta de usuário
exports.deletarContaUsuario = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Usuário não autenticado');
    }

    const uid = context.auth.uid;

    try {
        // Deletar dados do Firestore
        await db.collection('usuarios').doc(uid).delete();
        // Deletar usuário do Auth (opcional, se quiser manter a conta auth pode remover)
        await admin.auth().deleteUser(uid);
        console.log(`✅ Conta deletada: ${uid}`);
        return { sucesso: true };
    } catch (error) {
        console.error('❌ Erro ao deletar conta:', error);
        throw new functions.https.HttpsError('internal', 'Erro ao deletar conta', error);
    }
});

// 6. Registrar log de erro
exports.registrarLogErro = functions.https.onCall(async (data, context) => {
    const logErro = data.log;

    try {
        await db.collection('logs_erro').add({
            ...logErro,
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            usuarioId: context.auth?.uid || null
        });
        console.log('✅ Log de erro registrado');
        return { sucesso: true };
    } catch (error) {
        console.error('❌ Erro ao registrar log:', error);
        throw new functions.https.HttpsError('internal', 'Erro ao registrar log', error);
    }
});

// 7. Resgatar lucro admin
exports.resgatarLucroAdmin = functions.https.onCall(async (data, context) => {
    const ADMIN_EMAIL = 'jjoserobertorocharocha@gmail.com';
    
    if (!context.auth || context.auth.token.email !== ADMIN_EMAIL) {
        throw new functions.https.HttpsError('permission-denied', 'Acesso negado');
    }

    try {
        // Busca lucro atual do cofre central
        const adminDoc = await db.collection('admin').doc('configuracoes').get();
        const lucroTotal = adminDoc.exists ? adminDoc.data().lucro_total || 0 : 0;
        
        if (lucroTotal <= 0) {
            return { sucesso: false, mensagem: 'Não há lucro disponível para resgate' };
        }
        
        // Transfere para saldo pessoal do admin
        const adminUserDoc = await db.collection('usuarios').where('email', '==', ADMIN_EMAIL).get();
        if (!adminUserDoc.empty) {
            const adminUid = adminUserDoc.docs[0].id;
            const adminData = adminUserDoc.docs[0].data();
            const newBalance = (adminData.balance || 0) + lucroTotal;
            
            // Atualiza saldo do admin
            await db.collection('usuarios').doc(adminUid).update({ balance: newBalance });
            
            // Zera cofre central
            await db.collection('admin').doc('configuracoes').update({ lucro_total: 0 });
            
            return { sucesso: true, lucroTotal: lucroTotal, newBalance: newBalance };
        } else {
            return { sucesso: false, mensagem: 'Conta administrativa não encontrada' };
        }
    } catch (error) {
        console.error('❌ Erro ao resgatar lucro:', error);
        throw new functions.https.HttpsError('internal', 'Erro ao resgatar lucro', error);
    }
});

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
