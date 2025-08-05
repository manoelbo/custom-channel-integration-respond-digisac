# Filtro de Mensagens do Tipo "Ticket"

## 📋 Descrição

Implementação de um filtro que ignora mensagens do tipo "ticket" recebidas do DigiSac, evitando que sejam enviadas para o respond.io.

## 🚫 Comportamento

Quando uma mensagem do tipo "ticket" é recebida via webhook do DigiSac:

1. **Log de Ignorado**: A mensagem é logada como ignorada
2. **Resposta 200**: O webhook responde com status 200 e `status: 'ignored'`
3. **Não Envio**: A mensagem não é processada nem enviada para o respond.io

## 🔧 Implementação

### 1. Filtro no Webhook (`routes/index.js`)

```javascript
// Ignorar mensagens do tipo "ticket" - não enviar para respond.io
if (messageType === 'ticket') {
  conditionalLog(
    from,
    '🚫 Mensagem do tipo "ticket" ignorada - não enviando para respond.io'
  );
  return res.status(200).json({
    status: 'ignored',
    message: 'Mensagem do tipo "ticket" ignorada',
    messageType: 'ticket',
  });
}
```

### 2. Filtro no Processamento (`services/respond.js`)

```javascript
// Ignorar mensagens do tipo "ticket"
if (messageType === 'ticket') {
  conditionalLog(
    phoneNumber,
    '🚫 Mensagem do tipo "ticket" ignorada no processamento'
  );
  return {
    messageBody: '',
    processedMessage: null,
    ignored: true,
    reason: 'ticket_message_type',
  };
}
```

### 3. Verificação de Mensagens Ignoradas

```javascript
// Verificar se a mensagem foi ignorada (ex: tipo "ticket")
if (processResult.ignored) {
  conditionalLog(
    contactPhoneNumber,
    `🚫 Mensagem ignorada: ${processResult.reason}`
  );
  return res.status(200).json({
    status: 'ignored',
    message: 'Mensagem ignorada pelo processamento',
    reason: processResult.reason,
  });
}
```

## 📊 Logs

### Mensagem Ignorada
```
🚫 Mensagem do tipo "ticket" ignorada - não enviando para respond.io
```

### Resposta do Webhook
```json
{
  "status": "ignored",
  "message": "Mensagem do tipo "ticket" ignorada",
  "messageType": "ticket"
}
```

## 🧪 Teste

Para testar a funcionalidade, envie um webhook do DigiSac com:

```json
{
  "event": "message.created",
  "data": {
    "id": "test_message_id",
    "type": "ticket",
    "from": "5511999999999",
    "text": "Conteúdo do ticket"
  }
}
```

**Resultado Esperado:**
- Status: 200
- Mensagem ignorada
- Nenhum envio para respond.io

## 🔄 Fluxo Completo

1. **DigiSac** envia webhook com `type: "ticket"`
2. **Servidor** detecta o tipo "ticket"
3. **Servidor** loga a mensagem como ignorada
4. **Servidor** responde 200 com status "ignored"
5. **Servidor** NÃO envia para respond.io
6. **DigiSac** recebe confirmação de recebimento

## 📝 Notas

- O filtro é aplicado em dois pontos para garantir robustez
- Mensagens ignoradas não consomem recursos de envio para respond.io
- Logs detalhados para facilitar debug
- Resposta 200 evita reenvios desnecessários do DigiSac 