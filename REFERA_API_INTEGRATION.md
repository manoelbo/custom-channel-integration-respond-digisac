# Integração com API da Refera - Atualizações

## 🔄 Mudanças Implementadas

### 1. Autenticação Dinâmica

O serviço da Refera agora implementa **autenticação dinâmica** em vez de usar tokens estáticos:

#### Antes (Tokens Estáticos)
```javascript
// Tokens fixos no .env
REFERA_API_KEY=xxx
REFERA_API_TOKEN=xxx
REFERA_CSRF_TOKEN=xxx
```

#### Agora (Login Dinâmico)
```javascript
// Credenciais de login no .env
REFERA_USERNAME=integrations@refera.com.br
REFERA_PASSWORD=acesso@Refera
```

### 2. Sistema de Login Automático

O serviço agora:
- ✅ Faz login automaticamente quando necessário
- ✅ Detecta tokens expirados
- ✅ Renova tokens automaticamente
- ✅ Retry automático em caso de erro de token

### 3. Remoção do DataMockup

O arquivo `utils/dataMockup.js` foi **comentado** e não é mais usado. Os dados agora vêm diretamente da API da Refera.

## 🔧 Configuração Necessária

### Variáveis de Ambiente

Atualize seu arquivo `.env`:

```bash
# Antigas (remover)
# REFERA_API_KEY=xxx
# REFERA_API_TOKEN=xxx
# REFERA_CSRF_TOKEN=xxx

# Novas (adicionar)
REFERA_USERNAME=integrations@refera.com.br
REFERA_PASSWORD=acesso@Refera
```

### Render.com (Produção)

Configure as novas variáveis no painel do Render.com:
- `REFERA_USERNAME`
- `REFERA_PASSWORD`

## 🚀 Funcionalidades Implementadas

### Autenticação Inteligente
- **Login automático**: Faz login quando necessário
- **Detecção de expiração**: Verifica se o token ainda é válido
- **Renovação automática**: Renova tokens expirados
- **Retry inteligente**: Tenta novamente em caso de erro de token

### Tratamento de Erros
- **Token inválido**: `{"detail":"Given token not valid for any token type"}`
- **Token expirado**: Detecta e renova automaticamente
- **Falha de login**: Logs detalhados para debug

### Logs Melhorados
- 🔐 Logs de login/renovação de token
- 📅 Informações de expiração do token
- 🔄 Logs de retry automático
- ❌ Logs detalhados de erros

## 📊 Estrutura de Dados da API

A API da Refera retorna dados no formato:

```javascript
{
  count: 18,
  next: null,
  previous: null,
  results: [
    {
      id: 99,
      desc: 'Manoel (Teste)',
      phone: '554896227411',
      comunication_tool: 'Respond.io (Custom Channel Digisac)',
      custom_channel_id: '197ebddcc3d4d5b5512e980321177c6',
      custom_channel_token: 'ec0afa435d5e4a4b5a1b712c885f7bfcf700906e9e4bd2d802cefd84bfe9fea5',
      digisac_service_id: '8ae3028e-095a-4b72-b868-4f8a7cae9b4c',
      digisac_user_id: 'c3c4de37-afc8-4be0-96a8-4f1f606eeea3',
    }
    // ... mais canais
  ]
}
```

## 🔍 Funções Atualizadas

### `getChannelConfig(channelID)`
- **Antes**: Buscava no dataMockup
- **Agora**: Faz chamada para API da Refera
- **Retorno**: `Promise<Object|null>`

### `getChannelByServiceAndUser(serviceId, userId)`
- **Antes**: Buscava no dataMockup
- **Agora**: Faz chamada para API da Refera
- **Retorno**: `Promise<Object|null>`

### `getChannelsByServiceId(serviceId)`
- **Antes**: Buscava no dataMockup
- **Agora**: Faz chamada para API da Refera
- **Retorno**: `Promise<Array>`

## 🧪 Testando a Integração

### 1. Verificar Configuração
```bash
curl -X GET http://localhost:3030/health
```

### 2. Testar Login da API
```bash
curl -X POST https://api.refera.com.br/api/v1/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "integrations@refera.com.br",
    "password": "acesso@Refera"
  }'
```

### 3. Verificar Logs
Os logs mostrarão:
- 🔐 Processo de login
- 📅 Expiração do token
- 🔄 Renovações automáticas
- ❌ Erros e retry

## 🐛 Troubleshooting

### Erro: "Credenciais não configuradas"
- Verifique se `REFERA_USERNAME` e `REFERA_PASSWORD` estão no `.env`
- Verifique se as variáveis estão configuradas no Render.com

### Erro: "Token inválido"
- O sistema deve renovar automaticamente
- Verifique os logs para detalhes
- Pode ser necessário aguardar alguns segundos

### Erro: "Falha no login"
- Verifique se as credenciais estão corretas
- Verifique se a API da Refera está acessível
- Verifique os logs para detalhes do erro

## 📝 Próximos Passos

1. **Teste local**: Execute `npm run dev` e teste a integração
2. **Deploy**: Faça push para o repositório para deploy automático
3. **Monitoramento**: Acompanhe os logs no Render.com
4. **Validação**: Teste o envio de mensagens end-to-end

## 🔗 Referências

- [API da Refera](https://api.refera.com.br/api/v1)
- [Documentação do Projeto](./README.md)
- [Arquitetura](./ARCHITECTURE.md) 