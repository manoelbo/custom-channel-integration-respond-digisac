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
router.post('/message', async (req, res) => {
  try {
    /**
     * Autenticação
     * Verificar o bearer token do cabeçalho da requisição
     * Comparar com o token da API do respond.io
     */
    const bearerToken = req.headers.authorization;
    if (
      !bearerToken ||
      bearerToken.substring(7, bearerToken.length) !== CHANNEL_API_TOKEN
    ) {
      return res.status(401).json({
        error: {
          message: '401: UNAUTHORIZED - Token inválido',
        },
      });
    }

    // Extrair dados da requisição do respond.io
    // Suporta múltiplas estruturas conforme documentação
    const phoneNumber = req.body.contactId || req.body.number;
    const messageText = req.body.text || req.body.message?.text;

    // Log para debug
    console.log('📥 Dados recebidos do respond.io:', {
      contactId: req.body.contactId,
      number: req.body.number,
      text: req.body.text,
      message: req.body.message,
      phoneNumber,
      messageText,
    });

    // Validar número de telefone brasileiro
    if (!phoneNumber || !isValidBrazilianPhone(phoneNumber)) {
      return res.status(400).json({
        error: {
          message: 'Número de telefone brasileiro inválido',
        },
      });
    }

    // Validar mensagem
    if (!messageText || messageText.trim() === '') {
      return res.status(400).json({
        error: {
          message: 'Texto da mensagem é obrigatório',
        },
      });
    }

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
    const result = await digiSacApi.sendMessage(digiSacMessage);

    if (result.success) {
      // Sucesso - retornar ID da mensagem para o respond.io
      res.json({
        mId: result.data.message_id,
      });
    } else {
      // Erro - retornar erro detalhado
      const statusCode = result.error.code === 401 ? 401 : 400;
      res.status(statusCode).json({
        error: {
          message: result.error.message,
          details: result.error.details,
        },
      });
    }
  } catch (error) {
    console.error('❌ Erro no endpoint /message:', error);
    res.status(500).json({
      error: {
        message: 'Erro interno do servidor',
        details: error.message,
      },
    });
  }
});

/**
 * Rota para recebimento de mensagens: FROM DigiSac TO respond.io
 * Endpoint: POST /digisac/webhook
 */
router.post('/digisac/webhook', async (req, res) => {
  try {
    // console.log('📥 Webhook recebido do DigiSac:', req.body); // Log removido para limpar console

    // Verificar se é um evento de mensagem relevante
    const eventType = req.body.event;
    const messageData = req.body.data;

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

    // Extrair dados da mensagem recebida
    const messageId = messageData.id;
    const from = messageData.from || messageData.fromId;
    const messageType = messageData.type;
    const timestamp = messageData.timestamp
      ? new Date(messageData.timestamp).getTime()
      : Date.now();

    // Extrair conteúdo baseado no tipo
    let messageBody = '';
    switch (messageType) {
      case 'text':
        messageBody =
          messageData.text?.body || messageData.body || messageData.message;
        break;
      case 'document':
        messageBody = `📄 Documento: ${
          messageData.document?.filename || 'arquivo'
        }`;
        break;
      case 'ptt':
        messageBody = '🎵 Mensagem de áudio';
        break;
      case 'image':
        messageBody = '🖼️ Imagem';
        break;
      default:
        messageBody = `📎 Mídia (${messageType})`;
    }

    // Validar dados essenciais
    if (!messageId || !from) {
      console.error('❌ Webhook DigiSac: dados incompletos', {
        messageId,
        from,
        messageType,
        eventType,
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

    // Preparar dados para envio ao respond.io
    const webhookData = {
      channelId: process.env.RESPOND_IO_CHANNEL_ID || 'digisac_channel_001',
      contactId: from,
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
      url: 'https://app.respond.io/custom/webhook',
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

module.exports = router;
