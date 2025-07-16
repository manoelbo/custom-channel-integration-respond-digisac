/* eslint-disable new-cap */
const express = require('express');
const axios = require('axios');

/**
 * DigiSac: API brasileira de mensageria WhatsApp
 * Documentação: https://documenter.getpostman.com/view/24605757/2sA3BhfaDg
 */
const {
  DigiSacMessage,
  DigiSacMessageCollection,
  digiSacApi,
  formatBrazilianPhoneNumber,
  isValidBrazilianPhone,
} = require('./api.js');

/**
 * Respond.io custom channel API Token
 * Obtenha seu token em: https://docs.respond.io/messaging-channels/custom-channel
 */
const CHANNEL_API_TOKEN = process.env.RESPOND_IO_TOKEN || '<API Token>';

const router = express.Router();

/**
 * Rota para envio de mensagens: FROM respond.io TO DigiSac
 * Endpoint: POST /message
 */
router.post('/message', (req, res) => {
  console.log('🚀 Endpoint /message chamado');
  console.log('📋 Headers recebidos:', req.headers);
  console.log('📦 Body recebido:', JSON.stringify(req.body, null, 2));

  /**
   * Autenticação
   * Verificar o bearer token do cabeçalho da requisição
   * Comparar com o token da API do respond.io
   */
  const bearerToken = req.headers.authorization;
  console.log('🔑 Bearer token recebido:', bearerToken);
  console.log('🔑 CHANNEL_API_TOKEN configurado:', CHANNEL_API_TOKEN);

  if (!bearerToken) {
    console.log('❌ Erro: Bearer token não encontrado');
    return res.status(401).json({
      error: {
        message: '401: UNAUTHORIZED - Bearer token não encontrado',
      },
    });
  }

  const token = bearerToken.substring(7, bearerToken.length);
  console.log('🔑 Token extraído:', token);
  console.log('🔑 Token esperado:', CHANNEL_API_TOKEN);
  console.log('🔑 Tokens são iguais?', token === CHANNEL_API_TOKEN);

  if (token !== CHANNEL_API_TOKEN) {
    console.log('❌ Erro: Token inválido');
    return res.status(401).json({
      error: {
        message: '401: UNAUTHORIZED - Token inválido',
      },
    });
  }

  console.log('✅ Autenticação bem-sucedida');

  // Extrair dados da requisição do respond.io
  const phoneNumber = req.body.contactId || req.body.number;
  const messageText = req.body.text || req.body.message?.text;

  console.log('📱 Número de telefone extraído:', phoneNumber);
  console.log('💬 Texto da mensagem extraído:', messageText);

  // Validar número de telefone brasileiro
  if (!phoneNumber || !isValidBrazilianPhone(phoneNumber)) {
    console.log('❌ Erro: Número de telefone inválido:', phoneNumber);
    return res.status(400).json({
      error: {
        message: 'Número de telefone brasileiro inválido',
      },
    });
  }

  // Validar mensagem
  if (!messageText || messageText.trim() === '') {
    console.log('❌ Erro: Texto da mensagem vazio');
    return res.status(400).json({
      error: {
        message: 'Texto da mensagem é obrigatório',
      },
    });
  }

  console.log('✅ Validações passaram');

  // Criar mensagem DigiSac
  const digiSacMessage = new DigiSacMessage();
  digiSacMessage.to = formatBrazilianPhoneNumber(phoneNumber);
  digiSacMessage.type = 'text';
  digiSacMessage.text = messageText;

  console.log('📤 Enviando mensagem para DigiSac:', {
    to: digiSacMessage.to,
    text: digiSacMessage.text,
  });

  // Enviar mensagem via DigiSac
  digiSacApi
    .sendMessage(digiSacMessage)
    .then((result) => {
      console.log('📤 Resultado do DigiSac:', result);

      if (result.success) {
        // Sucesso - retornar ID da mensagem para o respond.io
        console.log(
          '✅ Mensagem enviada com sucesso, mId:',
          result.data.message_id
        );
        res.json({
          mId: result.data.message_id,
        });
      } else {
        // Erro - retornar erro detalhado
        console.log('❌ Erro do DigiSac:', result.error);
        const statusCode = result.error.code === 401 ? 401 : 400;
        res.status(statusCode).json({
          error: {
            message: result.error.message,
            details: result.error.details,
          },
        });
      }
    })
    .catch((error) => {
      console.error('❌ Erro no endpoint /message:', error);
      res.status(500).json({
        error: {
          message: 'Erro interno do servidor',
          details: error.message,
        },
      });
    });
});

/**
 * Rota para recebimento de mensagens: FROM DigiSac TO respond.io
 * Endpoint: POST /digisac/webhook
 */
router.post('/digisac/webhook', async (req, res) => {
  try {
    // Log detalhado da estrutura completa do webhook
    console.log('📥 Webhook DigiSac recebido - Estrutura completa:');
    console.log('📋 Headers:', JSON.stringify(req.headers, null, 2));
    console.log('📦 Body completo:', JSON.stringify(req.body, null, 2));

    // Verificar se é um evento de mensagem relevante
    const eventType = req.body.event;
    const messageData = req.body.data;

    console.log('🔍 Event Type:', eventType);
    console.log('🔍 Message Data:', JSON.stringify(messageData, null, 2));

    // Só processar mensagens novas ou atualizadas que não são nossas
    if (!eventType || !messageData) {
      console.log('⚠️ Webhook ignorado: sem dados relevantes');
      return res.status(200).json({ status: 'ignored' });
    }

    // Ignorar mensagens que enviamos (isFromMe: true)
    if (messageData.isFromMe === true) {
      console.log('⚠️ Webhook ignorado: mensagem enviada por nós');
      return res.status(200).json({ status: 'ignored' });
    }

    // Só processar eventos de mensagem criada ou atualizada
    if (!eventType.includes('message.')) {
      console.log('⚠️ Webhook ignorado: não é evento de mensagem');
      return res.status(200).json({ status: 'ignored' });
    }

    // Extrair dados da mensagem recebida com mais flexibilidade
    const messageId =
      messageData.id || messageData.messageId || messageData._id;
    const from =
      messageData.from ||
      messageData.fromId ||
      messageData.contactId ||
      messageData.number;
    const messageType = messageData.type || messageData.messageType || 'text';
    const timestamp = messageData.timestamp
      ? new Date(messageData.timestamp).getTime()
      : Date.now();

    console.log('🔍 Dados extraídos:', {
      messageId,
      from,
      messageType,
      eventType,
      timestamp,
    });

    // Extrair conteúdo baseado no tipo com mais opções
    let messageBody = '';

    // Para mensagens do tipo 'chat', o texto está diretamente no campo 'text'
    if (messageType === 'chat' || messageType === 'text') {
      messageBody =
        messageData.text ||
        messageData.body ||
        messageData.message ||
        messageData.content ||
        '';
    } else {
      switch (messageType) {
        case 'document':
          messageBody = `📄 Documento: ${
            messageData.document?.filename || messageData.filename || 'arquivo'
          }`;
          break;
        case 'ptt':
        case 'audio':
          messageBody = '🎵 Mensagem de áudio';
          break;
        case 'image':
          messageBody = '🖼️ Imagem';
          break;
        case 'video':
          messageBody = '🎥 Vídeo';
          break;
        case 'location':
          messageBody = '📍 Localização';
          break;
        case 'contact':
          messageBody = '👤 Contato';
          break;
        case 'sticker':
          messageBody = '😀 Sticker';
          break;
        default:
          messageBody = `📎 Mídia (${messageType})`;
      }
    }

    console.log('🔍 Message Body extraído:', messageBody);

    // Validar dados essenciais
    if (!messageId || !from) {
      console.error('❌ Webhook DigiSac: dados incompletos', {
        messageId,
        from,
        messageType,
        eventType,
        rawData: messageData,
      });
      return res.status(200).json({
        status: 'error',
        message: 'Dados incompletos no webhook',
      });
    }

    // Se não há conteúdo de texto, usar descrição do tipo
    if (!messageBody || messageBody.trim() === '') {
      messageBody = `📎 Mídia (${messageType})`;
    }

    // Buscar o número de telefone do contato através da API do DigiSac
    let contactPhoneNumber = null;
    try {
      console.log('🔍 Buscando dados do contato:', from);

      // Tentar obter o número de telefone do contato
      const contactResult = await digiSacApi.getContactProfile(from);

      if (contactResult.success && contactResult.data) {
        // O número está em body.data.number conforme os logs
        contactPhoneNumber =
          contactResult.data.data?.number ||
          contactResult.data.number ||
          contactResult.data.phone ||
          contactResult.data.contactId;
        console.log('📱 Número do contato encontrado:', contactPhoneNumber);
      } else {
        console.log(
          '⚠️ Não foi possível obter dados do contato, usando ID como fallback'
        );
        contactPhoneNumber = from;
      }
    } catch (error) {
      console.log(
        '⚠️ Erro ao buscar dados do contato, usando ID como fallback:',
        error.message
      );
      contactPhoneNumber = from;
    }

    // Formatar o número de telefone se necessário
    if (contactPhoneNumber && !contactPhoneNumber.startsWith('+')) {
      // Se não tem o +, adicionar
      if (contactPhoneNumber.startsWith('55')) {
        contactPhoneNumber = '+' + contactPhoneNumber;
      } else if (contactPhoneNumber.length >= 10) {
        // Assumir que é um número brasileiro
        contactPhoneNumber = '+55' + contactPhoneNumber;
      }
    }

    console.log('📱 ContactId final para respond.io:', contactPhoneNumber);

    // Preparar dados para envio ao respond.io
    const webhookData = {
      channelId: process.env.RESPOND_IO_CHANNEL_ID || 'digisac_channel_001',
      contactId: contactPhoneNumber,
      events: [
        {
          type: 'message',
          mId: messageId,
          timestamp: timestamp,
          message: {
            type: messageType === 'text' ? 'text' : 'text', // Respond.io espera 'text' por enquanto
            text: messageBody,
          },
        },
      ],
    };

    console.log('📤 Enviando para respond.io:', webhookData);

    // Enviar para o webhook do respond.io
    const respondIoResponse = await axios({
      method: 'post',
      url: ' https://app.respond.io/custom/channel/webhook/',
      headers: {
        authorization: `Bearer ${CHANNEL_API_TOKEN}`,
        'content-type': 'application/json',
        'cache-control': 'no-cache',
      },
      data: webhookData,
    });

    console.log(
      '✅ Mensagem enviada para respond.io:',
      respondIoResponse.status
    );

    // Responder ao DigiSac que recebemos o webhook
    res.status(200).json({
      status: 'success',
      message: 'Webhook processado com sucesso',
    });
  } catch (error) {
    console.error('❌ Erro no webhook DigiSac:', error);

    // Mesmo com erro, responder 200 ao DigiSac para evitar reenvios
    res.status(200).json({
      status: 'error',
      message: 'Erro ao processar webhook',
      error: error.message,
    });
  }
});

/**
 * Rota para verificação de status da mensagem
 * Endpoint: GET /message/:messageId/status
 */
router.get('/message/:messageId/status', async (req, res) => {
  try {
    const { messageId } = req.params;

    // Verificar autenticação
    const bearerToken = req.headers.authorization;
    if (
      !bearerToken ||
      bearerToken.substring(7, bearerToken.length) !== CHANNEL_API_TOKEN
    ) {
      return res.status(401).json({
        error: {
          message: '401: UNAUTHORIZED',
        },
      });
    }

    // Consultar status na API DigiSac
    const result = await digiSacApi.getMessageStatus(messageId);

    if (result.success) {
      res.json({
        messageId: messageId,
        status: result.data.status,
        timestamp: result.data.timestamp,
      });
    } else {
      res.status(404).json({
        error: {
          message: 'Mensagem não encontrada',
          details: result.error.message,
        },
      });
    }
  } catch (error) {
    console.error('❌ Erro ao verificar status:', error);
    res.status(500).json({
      error: {
        message: 'Erro interno do servidor',
      },
    });
  }
});

/**
 * Rota de health check
 * Endpoint: GET /health
 */
router.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'DigiSac ↔ Respond.io Bridge',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
  });
});

router.all('*', (req, res) => {
  console.log('🔍 Rota não encontrada:', {
    method: req.method,
    url: req.url,
    headers: req.headers,
    body: req.body,
  });

  res.status(404).json({
    error: 'Rota não encontrada',
    method: req.method,
    url: req.url,
  });
});

module.exports = router;
