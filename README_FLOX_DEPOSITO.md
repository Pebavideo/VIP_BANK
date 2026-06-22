# VIP Bank - Fluxo Real de Depósito via Asaas

## Visão Geral

Este documento descreve o fluxo de depósito real implementado no VIP Bank, com integração com o Asaas e validação de webhook.

## Alterações Realizadas

### 1. Estrutura de Pastas
```
VIP_BANK/
├── src/
│   ├── auth/
│   │   └── index.js      # Lógica de autenticação (INTACTA)
│   ├── api/
│   │   └── asaas.js      # Integração com Asaas
│   ├── main.js           # Lógica principal
│   └── styles.css        # Estilos
├── functions/
│   └── index.js          # Cloud Function para webhook
└── firestore.rules       # Regras de segurança
```

### 2. Funcionamento do Fluxo de Depósito

#### Passo 1: Gerar Cobrança PIX
- O usuário insere o valor e clica em "Gerar QR Code"
- O front-end chama a API do Asaas via `gerarCobrancaPix()` em `src/api/asaas.js`
- Uma transação com status `PENDENTE` é salva na coleção `transacoes` do Firestore
- O QR Code e o Pix Copia e Cola são exibidos

#### Passo 2: Usuário Efetua Pagamento
- O usuário paga via Pix usando o QR Code ou código Copia e Cola

#### Passo 3: Webhook Recebe Confirmação
- O Asaas envia um webhook para a Cloud Function `processarWebhookAsaas`
- A função valida a assinatura HMAC SHA256 do Asaas para garantir autenticidade
- Se o evento for `PAYMENT_RECEIVED` ou `PAYMENT_CONFIRMED`, a transação é marcada como `CONFIRMADO` no Firestore

#### Passo 4: Saldo Atualizado
- O front-end escuta mudanças na coleção `transacoes` via listener real-time
- Quando uma transação é marcada como `CONFIRMADO`, o saldo é recalculado LOCALMENTE (apenas transações confirmadas)
- O saldo nunca é alterado diretamente pelo front-end (segurança máxima)

## Configuração Necessária no Asaas e Firebase

### 1. Asaas
1. Obtenha sua **API Key** no painel do Asaas
2. Crie um **Webhook** no Asaas apontando para a URL da Cloud Function
3. Gere um **Webhook Secret** para validação da assinatura

### 2. Firebase
1. Configure o Firestore e o Authentication (Google)
2. Salve as configurações no Firestore na coleção `admin/configuracoes`:
   ```javascript
   {
     asaas_api_key: "SUA_CHAVE_API_ASAAS",
     asaas_webhook_secret: "SEU_SEGREDO_WEBHOOK",
     valor_taxa_pix: 3.99,
     lucro_total: 0
   }
   ```
3. Implemente as Security Rules do arquivo `firestore.rules`
4. Deploy da Cloud Function:
   ```bash
   cd functions
   npm install
   firebase deploy --only functions
   ```

## Segurança

### Principais Medidas
1. **Nenhuma alteração de saldo pelo front-end**: O saldo é calculado localmente apenas com transações confirmadas
2. **Validação de assinatura no webhook**: Garante que a requisição vem realmente do Asaas
3. **Security Rules**: Apenas a Cloud Function (Admin SDK) pode marcar transações como `CONFIRMADO`
4. **API Key do Asaas armazenada no Firestore**: Não exposta no front-end

## Arquivos Principais

| Arquivo                           | Descrição                                  |
|-----------------------------------|--------------------------------------------|
| `src/auth/index.js`               | Lógica de autenticação e cálculo de saldo  |
| `src/api/asaas.js`                | Integração com API Asaas                   |
| `functions/index.js`              | Cloud Function para processar webhook      |
| `firestore.rules`                 | Regras de segurança do Firestore           |
