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
 * (DESATIVADA - fluxo multicanal agora é obrigatório)
 */
// router.post('/message', async (req, res) => {
//   await processMessageSending(req, res);
// });

/**
 * Função helper para buscar configuração do canal
 * @param {string} channelID - ID do canal
 * @returns {Object|null} - Configuração do canal ou null se não encontrado
 */
function getChannelConfig(channelID) {
  const dataMockup = require('../utils/dataMockup');
  return dataMockup.results.find(
    (item) => item.custom_channel_id === channelID
  );
}

/**
 * Função helper para buscar canal por service_id e user_id (para webhooks)
 * @param {string} serviceId - ID do serviço DigiSac
 * @param {string} userId - ID do usuário DigiSac
 * @returns {Object|null} - Configuração do canal ou null se não encontrado
 */
function getChannelByServiceAndUser(serviceId, userId) {
  const dataMockup = require('../utils/dataMockup');
  return dataMockup.results.find(
    (item) =>
      item.digisac_service_id === serviceId && item.digisac_user_id === userId
  );
}

/**
 * Função helper para buscar TODOS os canais por service_id (para webhooks)
 * Um service_id pode ter múltiplos canais (custom_channel_id diferentes)
 * @param {string} serviceId - ID do serviço DigiSac
 * @returns {Array} - Array de configurações de canais
 */
function getChannelsByServiceId(serviceId) {
  const dataMockup = require('../utils/dataMockup');
  return dataMockup.results.filter(
    (item) => item.digisac_service_id === serviceId
  );
}

/**
 * Função para enviar mensagem para Respond.io com token específico do canal
 * @param {Object} channelService - Configuração do serviço do canal
 * @param {Object} messageData - Dados da mensagem
 * @param {string} messageId - ID da mensagem
 * @param {string} contactPhoneNumber - Número do contato
 * @param {number} timestamp - Timestamp da mensagem
 * @param {Object} contactData - Dados do contato (opcional)
 * @param {boolean} isFromMe - Se a mensagem é do agente
 * @returns {Promise<Object>} - Resultado do envio
 */
async function sendMessageWithChannelToken(
  channelService,
  messageData,
  messageId,
  contactPhoneNumber,
  timestamp,
  contactData = null,
  isFromMe = false
) {
  try {
    const axios = require('axios');
    const {
      formatMessageForRespondIo,
      formatContactForRespondIo,
    } = require('../utils/formatters');

    // Criar webhook data
    const webhookData = formatMessageForRespondIo(
      messageData,
      messageId,
      contactPhoneNumber,
      timestamp,
      isFromMe
    );

    // Usar o channelId específico do canal (sobrescrever o padrão)
    webhookData.channelId = channelService.channelId;

    // Adicionar informações do contato se fornecidas
    if (contactData) {
      webhookData.contact = formatContactForRespondIo(
        contactData,
        contactPhoneNumber
      );
    }

    // Log do payload e headers
    alwaysLog('[RESPOND.IO] Enviando POST para Respond.io', {
      url: 'https://app.respond.io/custom/channel/webhook/',
      channelId: channelService.channelId,
      token: channelService.token,
      contactId: contactPhoneNumber,
    });

    // Log detalhado do payload
    alwaysLog(
      '[RESPOND.IO] Payload completo:',
      JSON.stringify(webhookData, null, 2)
    );

    const response = await axios({
      method: 'post',
      url: 'https://app.respond.io/custom/channel/webhook/',
      headers: {
        authorization: `Bearer ${channelService.token}`,
        'content-type': 'application/json',
        'cache-control': 'no-cache',
      },
      data: webhookData,
    });

    alwaysLog('[RESPOND.IO] Resposta do Respond.io', {
      status: response.status,
      data: response.data,
      headers: response.headers,
    });

    // Log adicional para debug
    if (response.status === 200) {
      alwaysLog(
        '[RESPOND.IO] Mensagem enviada com sucesso. Verificando se foi processada...'
      );
    } else {
      errorLog('[RESPOND.IO] Erro na resposta do Respond.io:', {
        status: response.status,
        data: response.data,
      });
    }

    // Enviar confirmação de status da mensagem
    try {
      const statusPayload = {
        channelId: channelService.channelId,
        contactId: contactPhoneNumber,
        events: [
          {
            type: 'message_status',
            mId: messageId,
            timestamp: timestamp,
            status: {
              value: 'delivered',
              message: 'Message delivered successfully',
            },
          },
        ],
      };

      alwaysLog(
        '[RESPOND.IO] Enviando confirmação de status:',
        JSON.stringify(statusPayload, null, 2)
      );

      const statusResponse = await axios({
        method: 'post',
        url: 'https://app.respond.io/custom/channel/webhook/',
        headers: {
          authorization: `Bearer ${channelService.token}`,
          'content-type': 'application/json',
          'cache-control': 'no-cache',
        },
        data: statusPayload,
      });

      alwaysLog('[RESPOND.IO] Confirmação de status enviada:', {
        status: statusResponse.status,
        data: statusResponse.data,
      });
    } catch (statusError) {
      errorLog(
        '[RESPOND.IO] Erro ao enviar confirmação de status:',
        statusError.message
      );
    }

    return {
      success: true,
      status: response.status,
      data: response.data,
    };
  } catch (error) {
    errorLog('[RESPOND.IO] Erro ao enviar mensagem para Respond.io', {
      message: error.message,
      status: error.response?.status,
      data: error.response?.data,
    });
    return {
      success: false,
      error: {
        message: error.message,
        status: error.response?.status,
        data: error.response?.data,
      },
    };
  }
}

/**
 * Rota para envio de mensagens com channelID na URL
 * Endpoint: POST /:channelID/message
 */
router.post('/:channelID/message', async (req, res) => {
  const { channelID } = req.params;
  alwaysLog(`🔔 [CANAL ${channelID}] Requisição de envio recebida`);

  try {
    // Buscar configuração do canal
    const channelConfig = getChannelConfig(channelID);

    if (!channelConfig) {
      alwaysLog(`❌ [CANAL ${channelID}] Canal não encontrado`);
      return res.status(404).json({
        status: 'error',
        message: 'Channel ID não encontrado',
        channelID: channelID,
      });
    }

    // Log da configuração do canal encontrada
    alwaysLog(`✅ [CANAL ${channelID}] Configuração encontrada:`, {
      desc: channelConfig.desc,
      phone: channelConfig.phone,
      digisac_service_id: channelConfig.digisac_service_id,
      digisac_user_id: channelConfig.digisac_user_id,
    });

    // Extrair dados da requisição
    const phoneNumber = req.body.contactId || req.body.number;
    const messageData = req.body.message || req.body;

    conditionalLog(
      phoneNumber,
      `📋 [CANAL ${channelID}] Headers:`,
      req.headers
    );
    conditionalLog(
      phoneNumber,
      `📦 [CANAL ${channelID}] Body:`,
      JSON.stringify(req.body, null, 2)
    );

    // Validar autenticação com o token específico do canal
    const bearerToken = req.headers.authorization;
    if (!bearerToken) {
      return res
        .status(401)
        .json(
          formatErrorResponse(
            '401: UNAUTHORIZED - Bearer token não encontrado',
            null,
            401
          )
        );
    }

    const token = bearerToken.substring(7, bearerToken.length);
    if (token !== channelConfig.custom_channel_token) {
      conditionalLog(phoneNumber, `🔑 [CANAL ${channelID}] Token inválido:`, {
        received: token,
        expected: channelConfig.custom_channel_token,
      });
      return res
        .status(401)
        .json(
          formatErrorResponse(
            '401: UNAUTHORIZED - Token inválido para este canal',
            null,
            401
          )
        );
    }

    conditionalLog(
      phoneNumber,
      `✅ [CANAL ${channelID}] Autenticação bem-sucedida`
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

    // Criar mensagem DigiSac com os dados específicos do canal
    const digiSacMessage = digiSacApiService.createMessage(
      phoneNumber,
      messageData,
      channelConfig.digisac_service_id,
      channelConfig.digisac_user_id
    );

    // Processar anexo se existir
    if (messageData.type === 'attachment' && messageData.attachment) {
      await digiSacApiService.processAttachment(
        digiSacMessage,
        messageData.attachment,
        phoneNumber
      );
    }

    conditionalLog(
      phoneNumber,
      `📤 [CANAL ${channelID}] Enviando para DigiSac:`,
      {
        vendedor: channelConfig.desc,
        to: digiSacMessage.to,
        type: digiSacMessage.type,
        text: digiSacMessage.text,
        service_id: digiSacMessage.service_id,
        user_id: digiSacMessage.user_id,
        hasFile: !!digiSacMessage.file,
      }
    );

    // Enviar mensagem via DigiSac
    const result = await digiSacApiService.sendMessage(digiSacMessage);

    if (result.success) {
      conditionalLog(
        phoneNumber,
        `✅ [CANAL ${channelID}] Mensagem enviada pelo vendedor ${channelConfig.desc}:`,
        {
          messageId: result.data.message_id,
          to: phoneNumber,
          vendedor: channelConfig.desc,
        }
      );

      res.json({
        mId: result.data.message_id,
      });
    } else {
      errorLog(`❌ [CANAL ${channelID}] Erro do DigiSac:`, result.error);
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
    errorLog(`❌ [CANAL ${channelID}] Erro na rota:`, error);
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

    // Extrair service_id da mensagem para identificar os canais
    const serviceId = messageData.service_id || messageData.serviceId;

    // Buscar TODOS os canais que usam este service_id
    let channelConfigs = [];
    if (serviceId) {
      channelConfigs = getChannelsByServiceId(serviceId);
    }

    if (!channelConfigs || channelConfigs.length === 0) {
      conditionalLog(from, '⚠️ Nenhum canal encontrado para este service_id:', {
        serviceId,
      });
      return res.status(200).json({
        status: 'ignored',
        message: 'Nenhum canal configurado para este service_id',
      });
    }

    // Log dos canais identificados
    alwaysLog(
      `📨 [SERVICE ${serviceId}] Mensagem recebida - ${channelConfigs.length} canal(is) encontrado(s):`,
      channelConfigs.map((config) => ({
        channelId: config.custom_channel_id,
        vendedor: config.desc,
        userId: config.digisac_user_id,
      }))
    );

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

    // Enviar para TODOS os canais que usam este service_id
    let allResults = [];
    let successCount = 0;
    let errorCount = 0;

    for (const channelConfig of channelConfigs) {
      try {
        // Criar instância temporária do serviço Respond.io com token do canal
        const channelRespondService = {
          ...respondIoApiService,
          token: channelConfig.custom_channel_token,
          channelId: channelConfig.custom_channel_id,
          headers: {
            authorization: `Bearer ${channelConfig.custom_channel_token}`,
            'content-type': 'application/json',
            'cache-control': 'no-cache',
          },
        };

        let respondResult;

        if (isFromMe) {
          alwaysLog(
            `[WEBHOOK][ECHO] Enviando echo do vendedor para canal Respond.io`,
            {
              canal: channelConfig.custom_channel_id,
              vendedor: channelConfig.desc,
              contactId: contactPhoneNumber,
              texto: processedMessage.text,
            }
          );

          // Para Messaging Echoes, tentar obter dados do contato
          try {
            const contactResult = await digiSacApiService.getContactProfile(
              from
            );
            if (contactResult.success && contactResult.data) {
              const contactData = contactResult.data.data || contactResult.data;
              respondResult = await sendMessageWithChannelToken(
                channelRespondService,
                processedMessage,
                messageId,
                contactPhoneNumber,
                timestamp,
                contactData,
                true
              );
            } else {
              respondResult = await sendMessageWithChannelToken(
                channelRespondService,
                processedMessage,
                messageId,
                contactPhoneNumber,
                timestamp,
                null,
                true
              );
            }
          } catch (error) {
            conditionalLog(
              contactPhoneNumber,
              '[ECHO] Erro ao obter dados do contato para Messaging Echo:',
              error.message
            );
            respondResult = await sendMessageWithChannelToken(
              channelRespondService,
              processedMessage,
              messageId,
              contactPhoneNumber,
              timestamp,
              null,
              true
            );
          }
        } else {
          alwaysLog(
            `[WEBHOOK] Enviando mensagem do DigiSac para canal Respond.io`,
            {
              canal: channelConfig.custom_channel_id,
              vendedor: channelConfig.desc,
              contactId: contactPhoneNumber,
              texto: processedMessage.text,
            }
          );

          respondResult = await sendMessageWithChannelToken(
            channelRespondService,
            processedMessage,
            messageId,
            contactPhoneNumber,
            timestamp,
            null,
            false
          );
        }

        // Log do resultado para este canal
        if (respondResult && respondResult.success) {
          alwaysLog(`[WEBHOOK] Mensagem entregue para canal/vendedor`, {
            canal: channelConfig.custom_channel_id,
            vendedor: channelConfig.desc,
            contactId: contactPhoneNumber,
            isEcho: isFromMe,
            messageId,
          });
          successCount++;
        } else {
          errorLog(`[WEBHOOK] Erro ao entregar mensagem para canal/vendedor`, {
            canal: channelConfig.custom_channel_id,
            vendedor: channelConfig.desc,
            contactId: contactPhoneNumber,
            isEcho: isFromMe,
            messageId,
            error: respondResult?.error,
          });
          errorCount++;
        }

        allResults.push({
          channelId: channelConfig.custom_channel_id,
          vendedor: channelConfig.desc,
          success: respondResult?.success || false,
          error: respondResult?.error || null,
        });
      } catch (error) {
        errorLog(`[WEBHOOK] Erro crítico ao processar canal/vendedor`, {
          canal: channelConfig.custom_channel_id,
          vendedor: channelConfig.desc,
          contactId: contactPhoneNumber,
          isEcho: isFromMe,
          messageId,
          error: error.message,
        });
        errorCount++;
        allResults.push({
          channelId: channelConfig.custom_channel_id,
          vendedor: channelConfig.desc,
          success: false,
          error: error.message,
        });
      }
    }

    // Log do resumo final
    alwaysLog(`[WEBHOOK][SERVICE ${serviceId}] Resumo do processamento:`, {
      totalCanais: channelConfigs.length,
      sucessos: successCount,
      erros: errorCount,
      messageId: messageId,
      isFromMe: isFromMe,
    });

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
