# Custom Channel Integration - DigiSac ↔ respond.io

## 📋 O que é este projeto?

Este é um **servidor de integração** que funciona como uma ponte entre duas plataformas de mensageria:

- **DigiSac**: API brasileira de mensageria WhatsApp (https://sac.digital)
- **respond.io**: Plataforma internacional de gestão de conversas

O projeto permite usar o DigiSac como um "canal customizado" dentro do respond.io, habilitando o envio e recebimento de mensagens WhatsApp através da plataforma brasileira.

## 🏗️ Arquitetura Modular (Nova Estrutura)

### Fluxo de Mensagens

1. **Outbound (respond.io → DigiSac)**:
   - respond.io envia mensagem para `/message`
   - Servidor processa e envia via API DigiSac
   - Retorna status para respond.io

2. **Inbound (DigiSac → respond.io)**:
   - DigiSac envia webhook para `/digisac/webhook`
   - Servidor processa e envia para respond.io
   - Inclui suporte a Messaging Echoes (mensagens dos agentes)

### Estrutura do Projeto (Reorganizada)

```
custom-channel-integration-respond-digisac/
├── server.js                    # 🚀 Servidor Express principal
├── routes/
│   └── index.js                 # 🛣️ Rotas principais (webhook, message)
├── services/                    # 🔌 Serviços de API organizados
│   ├── digisac.js              # 📱 Serviço da API DigiSac
│   ├── respond.js              # 💬 Serviço da API Respond.io
│   └── refera.js               # 🔗 Serviço da API Refera
├── utils/                       # 🛠️ Utilitários reutilizáveis
│   ├── logger.js               # 📝 Funções de log centralizadas
│   ├── formatters.js           # 🔄 Funções de formatação de dados
│   └── validators.js           # ✅ Funções de validação
├── package.json                 # 📦 Dependências e scripts
├── docker-compose.yml           # 🐳 Configuração Docker
├── README.md                    # 📚 Documentação principal
├── ARCHITECTURE.md              # 🏗️ Documentação da arquitetura
└── project-setup.md             # ⚙️ Configuração do projeto
```

## 🛠️ Ferramentas e Tecnologias

### Backend
- **Node.js 20.17.0+**: Runtime JavaScript
- **Express.js**: Framework web para APIs
- **Axios**: Cliente HTTP para chamadas à API DigiSac
- **CORS**: Middleware para Cross-Origin Resource Sharing

### APIs Integradas
- **DigiSac API**: API brasileira de WhatsApp
  - Base URL: `https://api.sac.digital/v1`
  - Autenticação: Bearer Token
  - Documentação: https://documenter.getpostman.com/view/24605757/2sA3BhfaDg

- **respond.io Custom Channel API**:
  - Autenticação: Bearer Token
  - Documentação: https://docs.respond.io/messaging-channels/custom-channel

### Desenvolvimento
- **Nodemon**: Auto-reload em desenvolvimento
- **ESLint**: Linting de código
- **Docker**: Containerização

## 🌐 Hospedagem e Deploy

### Render.com (Produção)
- **Plataforma**: Render.com
- **Deploy**: Automático via Git (branch `main`)
- **URL**: https://seu-app.onrender.com
- **Processo**: `git push origin main` → Deploy automático
- **Ambiente**: Production

### Configuração Local
- **Porta**: 3030 (configurável via `APP_PORT`)
- **Ambiente**: Development/Production via `NODE_ENV`

### Docker
- **Imagem**: Node.js 22.17
- **Porta**: 3030
- **Volumes**: Hot-reload para desenvolvimento

### Variáveis de Ambiente Necessárias

#### Local (.env)
```bash
# DigiSac
DIGISAC_API_URL=https://api.sac.digital/v1
DIGISAC_API_TOKEN=seu_token_digisac

# respond.io
RESPOND_IO_TOKEN=seu_token_respond_io
RESPOND_IO_CHANNEL_ID=digisac_channel_001

# Servidor
APP_PORT=3030
NODE_ENV=development
SANDBOX_MODE=true
SANDBOX_NUMBERS=5511999999999,5511888888888
```

#### Render.com (Environment Variables)
Configure as mesmas variáveis no painel do Render.com:
- `DIGISAC_API_URL`
- `DIGISAC_API_TOKEN`
- `RESPOND_IO_TOKEN`
- `RESPOND_IO_CHANNEL_ID`
- `NODE_ENV=production`
- `SANDBOX_MODE=false`

## 🔄 Funcionalidades Principais

### ✅ Implementadas
- Envio de mensagens de texto
- Recebimento de webhooks do DigiSac
- Suporte a imagens, documentos, áudios
- Formatação automática de números brasileiros
- Autenticação via Bearer token
- Logs condicionais (sandbox mode)
- Health check endpoint
- Messaging Echoes (mensagens dos agentes)
- **Arquitetura modular organizada**
- **Logs centralizados e condicionais**
- **Validações padronizadas**
- **Formatação de dados consistente**

### 🔄 Em Desenvolvimento
- Suporte completo a vídeos (problema conhecido: DigiSac demora para processar)
- Polling e cache para arquivos de vídeo
- Retry logic para falhas
- Rate limiting

## 🚀 Como Executar

### Desenvolvimento Local
```bash
npm install
npm run dev
```

### Deploy para Produção (Render.com)
```bash
# Fazer commit das mudanças
git add .
git commit -m "Descrição das mudanças"

# Fazer push para deploy automático
git push origin main
```

### Docker (Local)
```bash
docker-compose up --build
```

## 📡 Endpoints da API

| Método | Rota | Descrição |
|-----|---|-----|
| POST | `/message` | Envia mensagem do respond.io para DigiSac |
| POST | `/service/:serviceId/user/:userId/message` | Envia mensagem com service_id e user_id específicos |
| POST | `/digisac/webhook` | Recebe webhooks do DigiSac |
| GET | `/message/:messageId/status` | Consulta status de uma mensagem |
| GET | `/health` | Health check do servidor |

## 🔧 Configurações Especiais

### Modo Sandbox
- Ativa logs detalhados para números específicos
- Útil para desenvolvimento e debug
- Controlado por `SANDBOX_MODE` e `SANDBOX_NUMBERS`
- **Local**: `SANDBOX_MODE=true`
- **Render.com**: `SANDBOX_MODE=false` (produção)

### Workflow de Desenvolvimento
1. **Desenvolvimento local**: Teste com `npm run dev`
2. **Commit e push**: `git push origin main`
3. **Deploy automático**: Render.com faz deploy automaticamente
4. **Teste em produção**: Verificar logs no painel do Render.com

### Tratamento de Vídeos
- Problema conhecido: DigiSac demora para processar vídeos
- Implementação de polling com cache
- Timeout de até 2-3 minutos para aguardar arquivo
- Fallback para mensagem de texto se arquivo não disponível

### Messaging Echoes
- Suporte a mensagens enviadas pelos agentes
- Inclui dados do contato quando disponível
- Tipo de evento diferenciado no respond.io

## 🏗️ Arquitetura dos Módulos

### 📁 Services/
- **`digisac.js`**: Serviço completo para integração com a API DigiSac
- **`respond.js`**: Serviço para integração com a API Respond.io
- **`refera.js`**: Serviço para integração com a API Refera

### 📁 Utils/
- **`logger.js`**: Sistema de logs centralizado com modo sandbox
- **`formatters.js`**: Funções para formatação de dados e respostas
- **`validators.js`**: Validações padronizadas para dados de entrada

### 📁 Routes/
- **`index.js`**: Rotas principais da aplicação (refatoradas e otimizadas)

## 🐛 Problemas Conhecidos

1. **Vídeos**: DigiSac não envia URL do arquivo imediatamente
2. **Processamento**: Demora maior para vídeos vs outras mídias
3. **API Limitações**: Alguns campos podem não estar disponíveis via API

## 📚 Documentação Adicional

- [README.md](./README.md): Documentação completa
- [ARCHITECTURE.md](./ARCHITECTURE.md): Documentação detalhada da arquitetura
- [DigiSac API](https://documenter.getpostman.com/view/24605757/2sA3BhfaDg)
- [respond.io Custom Channel](https://docs.respond.io/messaging-channels/custom-channel)

## 🚀 Benefícios da Nova Arquitetura

### 1. **Modularidade**
- Cada módulo tem responsabilidade específica
- Fácil manutenção e extensão
- Baixo acoplamento entre componentes

### 2. **Reutilização**
- Utilitários podem ser usados em diferentes partes
- Serviços são independentes e reutilizáveis
- Padrões consistentes em todo o projeto

### 3. **Testabilidade**
- Módulos isolados facilitam testes unitários
- Dependências claras e injetáveis
- Fácil mock de serviços externos

### 4. **Manutenibilidade**
- Código organizado e legível
- Responsabilidades bem definidas
- Fácil localização de problemas

### 5. **Performance**
- Imports diretos e eficientes
- Menos overhead de dependências
- Carregamento otimizado de módulos 