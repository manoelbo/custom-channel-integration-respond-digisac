# Custom Channel Integration Server - DigiSac

Este é um servidor de integração para conectar a plataforma [respond.io](https://respond.io) com a API brasileira de mensageria WhatsApp **DigiSac**.

A integração permite que você use o DigiSac como um "canal customizado" dentro do respond.io, habilitando o envio e recebimento de mensagens WhatsApp através da plataforma brasileira.

## 🔗 Rotas da API

| Método | Rota | Tipo | Descrição |
| ---- | ------ | --- | ------------------ |
| POST | `/message` | Outbound | Recebe mensagens do respond.io e envia para DigiSac via API |
| POST | `/service/:serviceId/user/:userId/message` | Outbound | Recebe mensagens do respond.io e envia para DigiSac com service_id e user_id específicos |
| POST | `/digisac/webhook` | Inbound | Recebe mensagens do DigiSac e envia para respond.io via webhook |
| GET | `/message/:messageId/status` | Status | Consulta status de uma mensagem específica |
| GET | `/health` | Health Check | Verifica se o servidor está funcionando |

> **Porta**: 3030

## 📋 Pré-requisitos

- Node.js 20.17.0 ou superior
- npm 10.x ou superior
- Conta no [respond.io](https://respond.io) com token da API
- Conta no [DigiSac](https://sac.digital) com token da API

## 🚀 Configuração

### 1. Obter Token do Custom Channel

Siga os passos [aqui](https://docs.respond.io/messaging-channels/custom-channel#step-1-create-a-channel) para obter o token da API do custom channel no respond.io.

### 2. Configurar Variáveis de Ambiente

Crie um arquivo `.env` na raiz do projeto:

```bash
# Configurações do DigiSac
DIGISAC_API_URL=https://api.sac.digital/v1
DIGISAC_API_TOKEN=seu_token_digisac_aqui

# Configurações do Respond.io
RESPOND_IO_TOKEN=seu_token_respond_io_aqui
RESPOND_IO_CHANNEL_ID=digisac_channel_001

# Configurações do servidor
APP_PORT=3030
NODE_ENV=development
```

### 3. Instalar Dependências

```bash
npm install
```

### 4. Iniciar o Servidor

```bash
npm start
```

## 🔄 Como Funciona

### Mensagens Outbound (Respond.io → DigiSac)

#### Rota Padrão (`/message`)
```mermaid
sequenceDiagram
    participant respond.io
    participant Custom Integration Server
    participant DigiSac
    respond.io ->> Custom Integration Server: Envia mensagem outbound. Rota: /message
    Custom Integration Server->> DigiSac: Chama API de envio de mensagem (usa service_id e user_id padrão)
    DigiSac ->> Custom Integration Server: Resposta: 200 OK ou 4xx
    Custom Integration Server ->> respond.io: Resposta: 200 OK ou 4xx (com erro se houver)
```

#### Rota com Parâmetros (`/service/:serviceId/user/:userId/message`)
```mermaid
sequenceDiagram
    participant respond.io
    participant Custom Integration Server
    participant DigiSac
    respond.io ->> Custom Integration Server: Envia mensagem outbound. Rota: /service/SERVICE_ID/user/USER_ID/message
    Custom Integration Server->> DigiSac: Chama API de envio de mensagem (usa service_id e user_id da URL)
    DigiSac ->> Custom Integration Server: Resposta: 200 OK ou 4xx
    Custom Integration Server ->> respond.io: Resposta: 200 OK ou 4xx (com erro se houver)
```

### Mensagens Inbound (DigiSac → Respond.io)

```mermaid
sequenceDiagram
    participant respond.io
    participant Custom Integration Server
    participant DigiSac
    
    DigiSac ->> Custom Integration Server: Envia mensagem inbound. Rota: /digisac/webhook
    Custom Integration Server ->> respond.io: Chama webhook do custom channel
    
    respond.io ->> Custom Integration Server: Resposta: 200 OK ou 4xx
    Custom Integration Server ->> DigiSac: Resposta: 200 OK ou 4xx
```

## 📊 Funcionalidades

### ✅ Implementadas

- ✅ Envio de mensagens de texto do respond.io para DigiSac
- ✅ Envio de mensagens com service_id e user_id customizados
- ✅ Recebimento de mensagens do DigiSac via webhook
- ✅ Formatação automática de números de telefone brasileiros
- ✅ Validação de números de telefone brasileiros
- ✅ Autenticação via Bearer token
- ✅ Tratamento de erros e logs detalhados
- ✅ Health check endpoint
- ✅ Consulta de status de mensagens

### 🔄 Em Desenvolvimento

- 🔄 Suporte a mídias (imagens, documentos, áudios)
- 🔄 Mensagens de template
- 🔄 Webhook signature validation
- 🔄 Rate limiting
- 🔄 Retry logic para falhas

## 🛠️ Exemplos de Uso

### Enviando Mensagem com Rota Padrão

```bash
POST /message
Authorization: Bearer SEU_TOKEN_RESPOND_IO
Content-Type: application/json

{
  "contactId": "5511999999999",
  "message": {
    "type": "text",
    "text": "Olá, como posso ajudar?"
  }
}
```

### Enviando Mensagem com Service ID e User ID Específicos

```bash
POST /service/MEU_SERVICE_ID/user/MEU_USER_ID/message
Authorization: Bearer SEU_TOKEN_RESPOND_IO
Content-Type: application/json

{
  "contactId": "5511999999999",
  "message": {
    "type": "text",
    "text": "Olá, como posso ajudar?"
  }
}
```

### Diferença entre as Rotas

- **`/message`**: Usa os valores padrão de `service_id` e `user_id` configurados na classe `DigiSacMessage`
- **`/service/:serviceId/user/:userId/message`**: Usa os valores específicos fornecidos nos parâmetros da URL

Ambas as rotas têm a mesma funcionalidade, mas a segunda permite maior flexibilidade para diferentes configurações de serviço e usuário.

## 🐳 Docker

### Atualizar Dockerfile

O Dockerfile precisa ser atualizado para usar Node.js 22:

```dockerfile
FROM node:22.17

WORKDIR /app

COPY package.json /app
RUN npm install

COPY . /app

CMD ["npm", "start"]
EXPOSE 3030
```

### Executar com Docker

```bash
# Construir e executar
docker-compose up --build

# Executar em background
docker-compose up -d

# Parar
docker-compose down
```

## 🔧 Configuração no DigiSac

1. Acesse seu painel do DigiSac
2. Vá em **Webhooks/Integrações**
3. Configure a URL do webhook: `https://seu-servidor.com/digisac/webhook`
4. Defina os eventos que deseja receber (ex: mensagens recebidas)

## 🔧 Configuração no Respond.io

### Para a Rota Padrão (`/message`)
1. Acesse seu painel do respond.io
2. Vá em **Channels > Custom Channel**
3. Configure as URLs:
   - **Outbound URL**: `https://seu-servidor.com/message`
   - **Webhook URL**: Será configurada automaticamente

### Para a Rota com Parâmetros (`/service/:serviceId/user/:userId/message`)
1. Acesse seu painel do respond.io
2. Vá em **Channels > Custom Channel**
3. Configure as URLs:
   - **Outbound URL**: `https://seu-servidor.com/service/SEU_SERVICE_ID/user/SEU_USER_ID/message`
   - **Webhook URL**: Será configurada automaticamente

> **Nota**: Substitua `SEU_SERVICE_ID` e `SEU_USER_ID` pelos valores reais que você deseja usar na API do DigiSac.

## 📚 Referências

- [DigiSac API Documentation](https://documenter.getpostman.com/view/24605757/2sA3BhfaDg)
- [Respond.io: Custom Channel](https://docs.respond.io/messaging-channels/custom-channel)
- [Clientes Online - DigiSac](https://sac.digital/)

## 🆘 Solução de Problemas

### Erro: "Número de telefone brasileiro inválido"

- Verifique se o número está no formato: `5511999999999` (código do país + DDD + número)
- Use a função `formatBrazilianPhoneNumber()` para formatar automaticamente

### Erro: "401: UNAUTHORIZED"

- Verifique se o token do respond.io está correto
- Confirme se o header `Authorization: Bearer SEU_TOKEN` está sendo enviado

### Webhook não funciona

- Verifique se a URL do webhook está acessível publicamente
- Confirme se o endpoint `/digisac/webhook` está respondendo
- Verifique os logs do servidor para erros

### Diferença entre as Rotas de Envio

Se você está tendo problemas com uma rota específica:

1. **Rota `/message`**: Usa valores padrão configurados no código
2. **Rota `/service/:serviceId/user/:userId/message`**: Usa valores específicos da URL

Verifique se os valores de `service_id` e `user_id` estão corretos para sua configuração no DigiSac.

## 🤝 Contribuindo

1. Faça um fork do projeto
2. Crie uma branch para sua feature (`git checkout -b feature/AmazingFeature`)
3. Commit suas mudanças (`git commit -m 'Add some AmazingFeature'`)
4. Push para a branch (`git push origin feature/AmazingFeature`)
5. Abra um Pull Request

## 📝 Licença

Este projeto está sob a licença ISC. Veja o arquivo `LICENSE` para mais detalhes.

---

**Desenvolvido para integrar respond.io com DigiSac 🇧🇷**




