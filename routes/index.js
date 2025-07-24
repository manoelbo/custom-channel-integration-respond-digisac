/* eslint-disable new-cap */
const express = require('express');

/**
 * Importar módulos organizados
 */
const {
  conditionalLog,
  alwaysLog,
  errorLog,
  SANDBOX_MODE,
  SANDBOX_NUMBERS,
} = require('../utils/logger');

const {
  formatErrorResponse,
  formatSuccessResponse,
} = require('../utils/formatters');

const {
  validateAuthentication,
  validateMessageData,
  validateDigiSacWebhook,
} = require('../utils/validators');

const { referaApiService } = require('../services/refera');
const { digiSacApiService } = require('../services/digisac');
const {
  respondIoApiService,
  CHANNEL_API_TOKEN,
} = require('../services/respond');

const router = express.Router();

/**
 * Função para processar envio de mensagem
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @param {string} serviceId - ID do serviço (opcional)
 * @param {string} userId - ID do usuário (opcional)
 */
async function processMessageSending(
  req,
  res,
  serviceId = null,
  userId = null
) {
  const routeName =
    serviceId && userId
      ? `/service/${serviceId}/user/${userId}/message`
      : '/message';

  alwaysLog(`🚀 Endpoint ${routeName} chamado`);

  // Extrair dados da requisição do respond.io
  const phoneNumber = req.body.contactId || req.body.number;
  const messageData = req.body.message || req.body;

  conditionalLog(phoneNumber, '📋 Headers recebidos:', req.headers);
  conditionalLog(
    phoneNumber,
    '📦 Body recebido:',
    JSON.stringify(req.body, null, 2)
  );

  // Se temos parâmetros de URL, logar eles
  if (serviceId || userId) {
    conditionalLog(phoneNumber, '🔧 Parâmetros da URL:', {
      serviceId,
      userId,
    });
  }

  // Validar autenticação
  const authResult = respondIoApiService.validateAuthentication(
    req,
    phoneNumber
  );
  if (!authResult.success) {
    return res
      .status(authResult.error.status)
      .json(
        formatErrorResponse(
          authResult.error.message,
          null,
          authResult.error.status
        )
      );
  }

  conditionalLog(phoneNumber, '📱 Número de telefone extraído:', phoneNumber);
  conditionalLog(
    phoneNumber,
    '💬 Dados da mensagem:',
    JSON.stringify(messageData, null, 2)
  );

  // Validar dados da mensagem
  const validationResult = validateMessageData(phoneNumber, messageData);
  if (!validationResult.success) {
    return res
      .status(validationResult.error.status)
      .json(
        formatErrorResponse(
          validationResult.error.message,
          null,
          validationResult.error.status
        )
      );
  }

  try {
    // Criar mensagem DigiSac
    const digiSacMessage = digiSacApiService.createMessage(
      phoneNumber,
      messageData,
      serviceId,
      userId
    );

    // Processar anexo se existir
    if (messageData.type === 'attachment' && messageData.attachment) {
      await digiSacApiService.processAttachment(
        digiSacMessage,
        messageData.attachment,
        phoneNumber
      );
    }

    conditionalLog(phoneNumber, '📤 Enviando mensagem para DigiSac:', {
      to: digiSacMessage.to,
      type: digiSacMessage.type,
      text: digiSacMessage.text,
      service_id: digiSacMessage.service_id,
      user_id: digiSacMessage.user_id,
      hasFile: !!digiSacMessage.file,
      fileDetails: digiSacMessage.file
        ? {
            name: digiSacMessage.file.name,
            mimetype: digiSacMessage.file.mimetype,
            base64Length: digiSacMessage.file.base64.length,
          }
        : null,
    });

    // Enviar mensagem via DigiSac
    const result = await digiSacApiService.sendMessage(digiSacMessage);

    conditionalLog(phoneNumber, '📤 Resultado do DigiSac:', result);

    if (result.success) {
      // Sucesso - retornar ID da mensagem para o respond.io
      conditionalLog(
        phoneNumber,
        '✅ Mensagem enviada com sucesso, mId:',
        result.data.message_id
      );
      res.json({
        mId: result.data.message_id,
      });
    } else {
      // Erro - retornar erro detalhado
      errorLog('❌ Erro do DigiSac:', result.error);
      const statusCode = result.error.code === 401 ? 401 : 400;
      res
        .status(statusCode)
        .json(
          formatErrorResponse(
            result.error.message,
            result.error.details,
            statusCode
          )
        );
    }
  } catch (error) {
    errorLog(`❌ Erro no endpoint ${routeName}:`, error);

    // Verificar se é erro de tipo não suportado
    if (error.message.includes('Tipo de mensagem não suportado')) {
      return res.status(400).json(
        formatErrorResponse(error.message, {
          supportedTypes: ['text', 'attachment', 'location', 'quick_reply'],
        })
      );
    }

    res
      .status(500)
      .json(
        formatErrorResponse('Erro interno do servidor', error.message, 500)
      );
  }
}

/**
 * Rota para envio de mensagens: FROM respond.io TO DigiSac
 * Endpoint: POST /message
 */
router.post('/message', async (req, res) => {
  await processMessageSending(req, res);
});

/**
 * Rota para envio de mensagens com channelID na URL
 * Endpoint: POST /:channelID/message
 */
router.post('/:channelID/message', async (req, res) => {
  const { channelID } = req.params;
  alwaysLog(`🔔 channelID recebido na rota: ${channelID}`);

  try {
    // FASE PROVISÓRIA: Usar dataMockup enquanto a API da Refera não é atualizada
    const dataMockup = require('../utils/dataMockup');

    // Buscar item no dataMockup com custom_channel_id igual ao channelID
    const mockupItem = dataMockup.results.find(
      (item) => item.custom_channel_id === channelID
    );

    if (mockupItem) {
      alwaysLog('✅ Item encontrado no dataMockup:', {
        desc: mockupItem.desc,
        custom_channel_id: mockupItem.custom_channel_id,
        phone: mockupItem.phone,
      });

      // Retornar dados do item encontrado
      res.json({
        status: 'success',
        message: 'Dados encontrados no mockup (fase provisória)',
        data: {
          desc: mockupItem.desc,
          custom_channel_id: mockupItem.custom_channel_id,
          phone: mockupItem.phone,
          digisac_service_id: mockupItem.digisac_service_id,
          digisac_user_id: mockupItem.digisac_user_id,
        },
      });
    } else {
      alwaysLog(
        '❌ Item não encontrado no dataMockup para channelID:',
        channelID
      );

      res.status(404).json({
        status: 'error',
        message: 'Channel ID não encontrado no mockup',
        channelID: channelID,
      });
    }

    // TODO: Quando a API da Refera for atualizada, descomentar o código abaixo
    // const result = await referaApiService.processMessage(channelID, req.body);
    // if (result.status === 'success') {
    //   res.json(result);
    // } else {
    //   res.status(500).json(result);
    // }
  } catch (error) {
    errorLog('❌ Erro na rota com channelID:', error);
    res
      .status(500)
      .json(
        formatErrorResponse('Erro interno do servidor', error.message, 500)
      );
  }
});

/**
 * Rota para recebimento de mensagens: FROM DigiSac TO respond.io
 * Endpoint: POST /digisac/webhook
 */
router.post('/digisac/webhook', async (req, res) => {
  try {
    // Verificar se é um evento de mensagem relevante
    const eventType = req.body.event;
    let messageData = req.body.data;

    // Validar dados do webhook
    const webhookValidation = validateDigiSacWebhook(req.body);
    if (!webhookValidation.success) {
      return res
        .status(400)
        .json(formatErrorResponse(webhookValidation.error.message, null, 400));
    }

    // Se messageData for um array, pegar apenas a primeira mensagem
    if (Array.isArray(messageData)) {
      conditionalLog(
        'system',
        '📋 Webhook contém array de mensagens, processando apenas a primeira'
      );
      messageData = messageData[0];
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

    // Buscar o número de telefone do contato através da API do DigiSac
    let contactPhoneNumber = null;
    try {
      conditionalLog(from, '🔍 Buscando dados do contato:', from);
      const contactResult = await digiSacApiService.getContactProfile(from);
      if (contactResult.success && contactResult.data) {
        contactPhoneNumber =
          contactResult.data.data?.number ||
          contactResult.data.number ||
          contactResult.data.phone ||
          contactResult.data.contactId;
        conditionalLog(
          from,
          '📱 Número do contato encontrado:',
          contactPhoneNumber
        );
      } else {
        conditionalLog(
          from,
          '⚠️ Não foi possível obter dados do contato, usando ID como fallback'
        );
        contactPhoneNumber = from;
      }
    } catch (error) {
      conditionalLog(
        from,
        '⚠️ Erro ao buscar dados do contato, usando ID como fallback:',
        error.message
      );
      contactPhoneNumber = from;
    }

    if (contactPhoneNumber && !contactPhoneNumber.startsWith('+')) {
      if (contactPhoneNumber.startsWith('55')) {
        contactPhoneNumber = '+' + contactPhoneNumber;
      } else if (contactPhoneNumber.length >= 10) {
        contactPhoneNumber = '+55' + contactPhoneNumber;
      }
    }

    conditionalLog(
      from,
      '📱 ContactId final para respond.io:',
      contactPhoneNumber
    );

    // SANDBOX: APLICAR FILTRO DE NÚMEROS NO INÍCIO
    // Só processa se o número estiver na lista de teste
    if (SANDBOX_MODE) {
      if (!SANDBOX_NUMBERS.includes(contactPhoneNumber)) {
        conditionalLog(
          contactPhoneNumber,
          '⚠️ [SANDBOX] Mensagem ignorada. Número não está na lista de teste:',
          contactPhoneNumber
        );
        return res.status(200).json({
          status: 'sandbox_ignored',
          message: 'Número não autorizado para teste.',
        });
      } else {
        conditionalLog(
          contactPhoneNumber,
          '✅ [SANDBOX] Número autorizado para teste:',
          contactPhoneNumber
        );
      }
    }

    // Log detalhado da estrutura completa do webhook (só para números autorizados)
    conditionalLog(
      contactPhoneNumber,
      '📥 Webhook DigiSac recebido - Estrutura completa:'
    );
    conditionalLog(
      contactPhoneNumber,
      '📋 Headers:',
      JSON.stringify(req.headers, null, 2)
    );
    conditionalLog(
      contactPhoneNumber,
      '📦 Body completo:',
      JSON.stringify(req.body, null, 2)
    );
    conditionalLog(contactPhoneNumber, '🔍 Event Type:', eventType);
    conditionalLog(
      contactPhoneNumber,
      '🔍 Message Data:',
      JSON.stringify(messageData, null, 2)
    );

    // Só processar mensagens novas ou atualizadas que não são nossas
    if (!eventType || !messageData) {
      conditionalLog(
        contactPhoneNumber,
        '⚠️ Webhook ignorado: sem dados relevantes'
      );
      return res.status(200).json({ status: 'ignored' });
    }

    // Processar mensagens enviadas pelos agentes como Messaging Echoes
    const isFromMe = messageData.isFromMe === true;
    if (isFromMe) {
      conditionalLog(
        contactPhoneNumber,
        '🔄 Processando mensagem do agente como Messaging Echo'
      );
    }

    // Só processar eventos de mensagem criada ou atualizada
    if (!eventType.includes('message.')) {
      conditionalLog(
        contactPhoneNumber,
        '⚠️ Webhook ignorado: não é evento de mensagem'
      );
      return res.status(200).json({ status: 'ignored' });
    }

    // Para mensagens de mídia, verificar se o arquivo está disponível
    // VÍDEOS: Ignorar se não tiver arquivo (DigiSac não envia URL no webhook inicial)
    if (['image', 'audio', 'ptt', 'document'].includes(messageType)) {
      if (!messageData.file || !messageData.file.url) {
        conditionalLog(
          contactPhoneNumber,
          '⚠️ Webhook ignorado: arquivo ainda não processado'
        );
        return res.status(200).json({ status: 'ignored' });
      }
    }

    // VÍDEOS: Tentar buscar arquivo via API se não estiver disponível no webhook
    if (
      messageType === 'video' &&
      (!messageData.file || !messageData.file.url)
    ) {
      conditionalLog(
        contactPhoneNumber,
        '🎥 Vídeo detectado sem arquivo - tentando buscar via API...'
      );

      // Aguardar um pouco para o processamento
      await new Promise((resolve) => setTimeout(resolve, 3000)); // 3 segundos

      try {
        // Buscar mensagem com arquivo incluído
        const result = await digiSacApiService.getMessageWithFile(messageId);

        if (result.success && result.data) {
          conditionalLog(
            contactPhoneNumber,
            '📋 Resposta completa da API para vídeo:',
            JSON.stringify(result.data, null, 2)
          );

          // Verificar se o arquivo está disponível na resposta da API
          if (result.data.file && result.data.file.url) {
            conditionalLog(
              contactPhoneNumber,
              '✅ Arquivo de vídeo encontrado via API!'
            );
            // Atualizar dados da mensagem com os dados da API
            messageData = result.data;
          } else {
            conditionalLog(
              contactPhoneNumber,
              '⚠️ Arquivo de vídeo ainda não disponível via API'
            );
            // Aguardar mais um pouco e tentar novamente
            await new Promise((resolve) => setTimeout(resolve, 5000)); // +5 segundos

            const retryResult = await digiSacApiService.getMessageWithFile(
              messageId
            );
            if (retryResult.success && retryResult.data) {
              conditionalLog(
                contactPhoneNumber,
                '📋 Resposta da segunda tentativa:',
                JSON.stringify(retryResult.data, null, 2)
              );

              if (retryResult.data.file && retryResult.data.file.url) {
                conditionalLog(
                  contactPhoneNumber,
                  '✅ Arquivo de vídeo encontrado na segunda tentativa!'
                );
                messageData = retryResult.data;
              } else {
                conditionalLog(
                  contactPhoneNumber,
                  '❌ Arquivo de vídeo não disponível após tentativas'
                );
                // Continuar com processamento normal (enviará mensagem de texto)
              }
            }
          }
        } else {
          conditionalLog(
            contactPhoneNumber,
            '❌ Erro ao buscar vídeo via API:',
            result.error
          );
        }
      } catch (error) {
        conditionalLog(
          contactPhoneNumber,
          '❌ Erro ao tentar buscar vídeo via API:',
          error.message
        );
      }
    }

    conditionalLog(contactPhoneNumber, '🔍 Dados extraídos:', {
      messageId,
      from,
      messageType,
      eventType,
      timestamp,
    });

    // Processar mensagem usando o serviço do Respond.io
    const { messageBody, processedMessage } =
      respondIoApiService.processDigiSacMessage(
        messageData,
        messageType,
        contactPhoneNumber
      );

    // Validar dados essenciais
    if (!messageId || !from) {
      errorLog('❌ Webhook DigiSac: dados incompletos', {
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

    // Enviar para o Respond.io
    let respondResult;
    if (isFromMe) {
      // Para Messaging Echoes, tentar obter dados do contato
      try {
        const contactResult = await digiSacApiService.getContactProfile(from);
        if (contactResult.success && contactResult.data) {
          const contactData = contactResult.data.data || contactResult.data;
          respondResult = await respondIoApiService.sendMessageWithContact(
            processedMessage,
            messageId,
            contactPhoneNumber,
            timestamp,
            contactData
          );
        } else {
          respondResult = await respondIoApiService.sendMessage(
            processedMessage,
            messageId,
            contactPhoneNumber,
            timestamp,
            true // isFromMe
          );
        }
      } catch (error) {
        conditionalLog(
          contactPhoneNumber,
          '⚠️ Erro ao obter dados do contato para Messaging Echo:',
          error.message
        );
        respondResult = await respondIoApiService.sendMessage(
          processedMessage,
          messageId,
          contactPhoneNumber,
          timestamp,
          true // isFromMe
        );
      }
    } else {
      respondResult = await respondIoApiService.sendMessage(
        processedMessage,
        messageId,
        contactPhoneNumber,
        timestamp,
        false // isFromMe
      );
    }

    // Responder ao DigiSac que recebemos o webhook
    res
      .status(200)
      .json(formatSuccessResponse(null, 'Webhook processado com sucesso'));
  } catch (error) {
    errorLog('❌ Erro no webhook DigiSac:', error);

    // Mesmo com erro, responder 200 ao DigiSac para evitar reenvios
    res
      .status(200)
      .json(
        formatErrorResponse('Erro ao processar webhook', error.message, 500)
      );
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
    const authResult = respondIoApiService.validateAuthentication(
      req,
      'system'
    );
    if (!authResult.success) {
      return res
        .status(authResult.error.status)
        .json(
          formatErrorResponse(
            authResult.error.message,
            null,
            authResult.error.status
          )
        );
    }

    // Consultar status na API DigiSac
    const result = await digiSacApiService.getMessageStatus(messageId);

    if (result.success) {
      res.json({
        messageId: messageId,
        status: result.data.status,
        timestamp: result.data.timestamp,
      });
    } else {
      res
        .status(404)
        .json(
          formatErrorResponse(
            'Mensagem não encontrada',
            result.error.message,
            404
          )
        );
    }
  } catch (error) {
    errorLog('❌ Erro ao verificar status:', error);
    res
      .status(500)
      .json(formatErrorResponse('Erro interno do servidor', null, 500));
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
    config: {
      digiSac: digiSacApiService.getConfigInfo
        ? digiSacApiService.getConfigInfo()
        : 'N/A',
      respondIo: respondIoApiService.getConfigInfo(),
      refera: referaApiService.getConfigInfo(),
    },
  });
});

router.all('*', (req, res) => {
  alwaysLog('🔍 Rota não encontrada:', {
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
