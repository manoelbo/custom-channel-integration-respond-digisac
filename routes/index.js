/* eslint-disable new-cap */
const express = require('express');

/**
 * Importar módulos organizados
 */
const { conditionalLog, alwaysLog, errorLog } = require('../utils/logger');

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
  const { cache } = require('../utils/cache');
  const messageCache = require('../utils/messageCache');
  const retryManager = require('../utils/retryManager');

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
    process.env.LOG_LEVEL === 'debug'
      ? JSON.stringify(req.body, null, 2)
      : 'Body recebido (use LOG_LEVEL=debug para ver detalhes)'
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
    process.env.LOG_LEVEL === 'debug'
      ? JSON.stringify(messageData, null, 2)
      : { type: messageData.type, hasText: !!messageData.text }
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
 * @returns {Promise<Object|null>} - Configuração do canal ou null se não encontrado
 */
async function getChannelConfig(channelID) {
  try {
    const result = await referaApiService.callMessageTool(channelID);

    if (result.success && result.data && result.data.results) {
      // Buscar o canal específico na resposta da API
      const channel = result.data.results.find(
        (item) => item.custom_channel_id === channelID
      );
      return channel || null;
    }

    return null;
  } catch (error) {
    errorLog('❌ Erro ao buscar configuração do canal:', error);
    return null;
  }
}

/**
 * Função helper para buscar canal por service_id e user_id (para webhooks)
 * @param {string} serviceId - ID do serviço DigiSac
 * @param {string} userId - ID do usuário DigiSac
 * @returns {Promise<Object|null>} - Configuração do canal ou null se não encontrado
 */
async function getChannelByServiceAndUser(serviceId, userId) {
  try {
    // Buscar todos os canais e filtrar por service_id e user_id
    const result = await referaApiService.callMessageTool();

    if (result.success && result.data && result.data.results) {
      const channel = result.data.results.find(
        (item) =>
          item.digisac_service_id === serviceId &&
          item.digisac_user_id === userId
      );
      return channel || null;
    }

    return null;
  } catch (error) {
    errorLog('❌ Erro ao buscar canal por service_id e user_id:', error);
    return null;
  }
}

/**
 * Função helper para buscar TODOS os canais por service_id (para webhooks)
 * Um service_id pode ter múltiplos canais (custom_channel_id diferentes)
 * @param {string} serviceId - ID do serviço DigiSac
 * @returns {Promise<Array>} - Array de configurações de canais
 */
async function getChannelsByServiceId(serviceId) {
  const cacheKey = `channels:${serviceId}`;

  // Verificar cache primeiro
  const cached = cache.get(cacheKey);
  if (cached) {
    alwaysLog(
      `📦 Cache hit para serviceId: ${serviceId} - ${cached.length} canais`
    );
    return cached;
  }

  try {
    // Buscar todos os canais e filtrar por service_id
    const result = await referaApiService.callMessageTool();

    if (result.success && result.data && result.data.results) {
      const channels = result.data.results.filter(
        (item) => item.digisac_service_id === serviceId
      );

      // Cachear por 10 minutos
      cache.set(cacheKey, channels, 600000);
      alwaysLog(
        `📦 Cache set para serviceId: ${serviceId} - ${channels.length} canais`
      );

      return channels || [];
    }

    return [];
  } catch (error) {
    errorLog('❌ Erro ao buscar canais por service_id:', error);
    return [];
  }
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

    // Log para confirmar que o channelId foi sobrescrito
    alwaysLog('[RESPOND.IO] ChannelId confirmado:', webhookData.channelId);

    // Adicionar informações do contato se fornecidas
    if (contactData) {
      alwaysLog('[RESPOND.IO] Dados do contato recebidos:', {
        name: contactData.name,
        hasData: !!contactData.data,
        phoneNumber: contactPhoneNumber,
      });

      webhookData.contact = formatContactForRespondIo(
        contactData,
        contactPhoneNumber
      );

      alwaysLog(
        '[RESPOND.IO] Dados do contato formatados:',
        webhookData.contact
      );
    } else {
      alwaysLog('[RESPOND.IO] Nenhum dado de contato disponível');
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
      process.env.LOG_LEVEL === 'debug'
        ? JSON.stringify(webhookData, null, 2)
        : {
            channelId: webhookData.channelId,
            contactId: webhookData.contactId,
            eventType: webhookData.events?.[0]?.type,
          }
    );

    // Log específico para verificar se o contact está presente
    if (webhookData.contact) {
      alwaysLog('[RESPOND.IO] ✅ Dados do contato incluídos no webhook:', {
        firstName: webhookData.contact.firstName,
        lastName: webhookData.contact.lastName,
        phone: webhookData.contact.phone,
        countryCode: webhookData.contact.countryCode,
      });
    } else {
      alwaysLog('[RESPOND.IO] ⚠️ Nenhum dado de contato no webhook');
    }

    // Log comparativo com o curl que funciona
    alwaysLog('[RESPOND.IO] Comparação com curl que funciona:');
    alwaysLog('[RESPOND.IO] Headers enviados:', {
      authorization: `Bearer ${channelService.token}`,
      'content-type': 'application/json',
      'cache-control': 'no-cache',
    });
    alwaysLog(
      '[RESPOND.IO] URL:',
      'https://app.respond.io/custom/channel/webhook/'
    );
    alwaysLog('[RESPOND.IO] Method:', 'POST');

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
    const channelConfig = await getChannelConfig(channelID);

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
    conditionalLog(
      phoneNumber,
      `🔧 [CANAL ${channelID}] Valores que serão passados para createMessage:`,
      {
        service_id: channelConfig.digisac_service_id,
        user_id: channelConfig.digisac_user_id,
      }
    );

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
    const startTime = Date.now();
    const webhookId = `webhook_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    try {
      // ===== LOG COMPLETO DO WEBHOOK RECEBIDO =====
      console.log('\n' + '='.repeat(100));
      console.log(`🔔 WEBHOOK DIGISAC RECEBIDO - ${new Date().toISOString()}`);
      console.log(`🆔 Webhook ID: ${webhookId}`);
      console.log('='.repeat(100));
      
      // Log dos headers importantes
      console.log('📋 HEADERS IMPORTANTES:');
      console.log(`Content-Type: ${req.headers['content-type']}`);
      console.log(`Content-Length: ${req.headers['content-length']}`);
      console.log(`User-Agent: ${req.headers['user-agent']}`);
      console.log(`X-Forwarded-For: ${req.headers['x-forwarded-for'] || 'N/A'}`);
      console.log(`Authorization: ${req.headers['authorization'] ? 'Present' : 'Missing'}`);
      
      // Log do body completo
      console.log('\n📦 BODY COMPLETO:');
      console.log(JSON.stringify(req.body, null, 2));
      
      // Verificar se é um evento de mensagem relevante
      const eventType = req.body.event;
      let messageData = req.body.data;
      
      // Log resumido para facilitar análise
      console.log('\n📋 RESUMO DO WEBHOOK:');
      console.log(`🎯 Event Type: ${eventType}`);
      console.log(`📱 Message ID: ${messageData?.id || messageData?.messageId || messageData?._id || 'N/A'}`);
      console.log(`📞 From: ${messageData?.from || messageData?.fromId || messageData?.contactId || messageData?.number || 'N/A'}`);
      console.log(`💬 Message: ${messageData?.message || messageData?.text || messageData?.content || 'N/A'}`);
      console.log(`👤 User ID: ${messageData?.user_id || messageData?.userId || 'N/A'}`);
      console.log(`🏢 Service ID: ${messageData?.service_id || messageData?.serviceId || 'N/A'}`);
      console.log(`📝 Message Type: ${messageData?.type || messageData?.messageType || 'N/A'}`);
      console.log(`🔄 Is From Me: ${messageData?.isFromMe || false}`);
      console.log(`⏰ Timestamp: ${messageData?.timestamp || 'N/A'}`);
      
      // Log adicional para debug de estrutura
      if (Array.isArray(messageData)) {
        console.log(`📊 Message Data é array com ${messageData.length} itens`);
      } else if (typeof messageData === 'object') {
        console.log(`📊 Message Data é objeto com ${Object.keys(messageData || {}).length} propriedades`);
        console.log(`📊 Propriedades: ${Object.keys(messageData || {}).join(', ')}`);
      }
      
      // ===== VERIFICAÇÃO DE MENSAGEM DUPLICADA =====
      console.log('\n🔍 VERIFICANDO DUPLICATAS...');
      
      // Se messageData for um array, usar a primeira mensagem para verificação
      const messageToCheck = Array.isArray(messageData) ? messageData[0] : messageData;
      
      if (messageCache.isDuplicate(messageToCheck)) {
        const processingTime = Date.now() - startTime;
        console.log('⚠️ MENSAGEM DUPLICADA IGNORADA');
        console.log(`🆔 Webhook ID: ${webhookId}`);
        console.log(`⏱️ Tempo de processamento: ${processingTime}ms`);
        console.log('='.repeat(100) + '\n');
        
        return res.status(200).json(formatSuccessResponse({
          webhookId: webhookId,
          processingTime: processingTime,
          status: 'ignored',
          reason: 'Mensagem duplicada'
        }, 'Mensagem duplicada ignorada'));
      }
      
      console.log('✅ Mensagem não é duplicata - prosseguindo com processamento');

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

    // Extrair service_id e user_id da mensagem para identificar os canais
    const serviceId = messageData.service_id || messageData.serviceId;
    const userId = messageData.user_id || messageData.userId;

    // Log detalhado para debug de user_id
    conditionalLog(from, '🔍 [DEBUG] Dados extraídos do webhook:', {
      serviceId,
      userId,
      messageId,
      from,
      messageType,
      eventType,
      isFromMe: messageData.isFromMe,
      hasUserData: !!messageData.user,
      userData: messageData.user
        ? {
            id: messageData.user.id,
            name: messageData.user.name,
            username: messageData.user.username,
          }
        : null,
    });

    // Buscar TODOS os canais que usam este service_id
    let channelConfigs = [];
    if (serviceId) {
      channelConfigs = await getChannelsByServiceId(serviceId);
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

    // Log específico para debug de user_id vs canais configurados
    conditionalLog(
      from,
      '🔍 [DEBUG] Comparação user_id da mensagem vs canais configurados:',
      {
        messageUserId: userId,
        configuredUserIds: channelConfigs.map(
          (config) => config.digisac_user_id
        ),
        isMessageFromConfiguredUser: userId
          ? channelConfigs.some((config) => config.digisac_user_id === userId)
          : 'N/A',
        willProcessAllChannels: true, // Sempre processar todos os canais do service_id
      }
    );

    // Buscar o número de telefone do contato - otimizado para evitar getContactProfile desnecessário
    let contactPhoneNumber = null;
    let contactData = null; // Dados completos do contato
    let contactIdToUse = from; // ID padrão para buscar dados do contato

    // Para Messaging Echoes, usar o contactId em vez do fromId
    const isFromMe = messageData.isFromMe === true;
    if (isFromMe && messageData.contactId) {
      contactIdToUse = messageData.contactId;
      conditionalLog(
        from,
        '🔄 Messaging Echo detectado - usando contactId em vez de fromId:',
        contactIdToUse
      );
    }

    // Log adicional para debug do Messaging Echo
    if (isFromMe) {
      conditionalLog(from, '🔍 [DEBUG] Messaging Echo detalhado:', {
        fromId: messageData.fromId,
        contactId: messageData.contactId,
        contactIdToUse: contactIdToUse,
        isFromMe: messageData.isFromMe,
        messageUserId: userId,
        serviceId: serviceId,
        willProcessForAllChannels: true, // Confirmar que processará para todos os canais
      });
    }

    // Função helper para validar se um número parece ser um telefone brasileiro válido
    const isValidBrazilianPhone = (phone) => {
      if (!phone) return false;
      const cleaned = phone.replace(/\D/g, '');
      return cleaned.length >= 10 && cleaned.length <= 13;
    };

    // Função helper para normalizar número de telefone
    const normalizePhoneNumber = (phone) => {
      if (!phone) return phone;
      let normalized = phone.replace(/\D/g, '');
      if (normalized.startsWith('55')) {
        return '+' + normalized;
      } else if (normalized.length >= 10) {
        return '+55' + normalized;
      }
      return phone;
    };

    // Estratégia 1: Tentar extrair número diretamente do webhook (para mensagens normais)
    if (!isFromMe) {
      // Tentar extrair número de diferentes campos do webhook
      const possibleNumbers = [
        messageData.number,
        messageData.phone,
        messageData.contactPhone,
        messageData.from,
        messageData.fromId,
        messageData.contactId,
      ].filter(Boolean);

      for (const num of possibleNumbers) {
        if (isValidBrazilianPhone(num)) {
          contactPhoneNumber = normalizePhoneNumber(num);
          conditionalLog(
            from,
            '📱 Número extraído diretamente do webhook:',
            contactPhoneNumber
          );
          break;
        }
      }
    }

    // Estratégia 2: Se não conseguiu extrair número válido OU é Messaging Echo, buscar no cache/perfil
    const needsContactProfile =
      isFromMe ||
      !contactPhoneNumber ||
      !isValidBrazilianPhone(contactPhoneNumber);

    if (needsContactProfile) {
      conditionalLog(
        from,
        `🔍 ${
          isFromMe ? 'Messaging Echo' : 'Número inválido'
        } - buscando perfil do contato:`,
        contactIdToUse
      );

      // Verificar cache de contato primeiro
      const contactCacheKey = `contact:${contactIdToUse}`;
      contactData = cache.get(contactCacheKey);

      if (contactData) {
        conditionalLog(from, '📦 Cache hit para contato:', contactIdToUse);
        // Extrair número do telefone dos dados em cache
        contactPhoneNumber =
          contactData.data?.number ||
          contactData.number ||
          contactData.phone ||
          contactData.contactId ||
          contactIdToUse;
      } else {
         try {
           conditionalLog(
             from,
             '🔍 Buscando dados do contato na API:',
             contactIdToUse
           );
           
           // Usar retry para busca de contato
           const contactResult = await retryManager.executeHttpWithRetry(
             () => digiSacApiService.getContactProfile(contactIdToUse),
             {
               operation: 'Buscar dados do contato DigiSac',
               webhookId: webhookId,
               contactId: contactIdToUse
             }
           );
          if (contactResult.success && contactResult.data) {
            // Armazenar dados completos do contato
            contactData = contactResult.data;

            // Cachear por 15 minutos
            cache.set(contactCacheKey, contactData, 900000);
            conditionalLog(from, '📦 Cache set para contato:', contactIdToUse);

            // Extrair número do telefone da estrutura correta do DigiSac
            contactPhoneNumber =
              contactResult.data.data?.number ||
              contactResult.data.number ||
              contactResult.data.phone ||
              contactResult.data.contactId ||
              contactIdToUse;
            conditionalLog(
              from,
              '📱 Número do contato encontrado via API:',
              contactPhoneNumber
            );
            conditionalLog(
              from,
              '👤 Dados completos do contato:',
              process.env.LOG_LEVEL === 'debug'
                ? JSON.stringify(contactData, null, 2)
                : 'Dados do contato'
            );

            // Log específico para verificar o nome
            if (contactData.name) {
              conditionalLog(
                from,
                '👤 Nome do contato encontrado:',
                contactData.name
              );
            }
          } else {
            conditionalLog(
              from,
              '⚠️ Não foi possível obter dados do contato, usando ID como fallback'
            );
            contactPhoneNumber = contactIdToUse;
          }
        } catch (error) {
          conditionalLog(
            from,
            '⚠️ Erro ao buscar dados do contato, usando ID como fallback:',
            error.message
          );
          contactPhoneNumber = contactIdToUse;
        }
      }
    } else {
      conditionalLog(
        from,
        '✅ Usando número extraído do webhook - sem necessidade de buscar perfil'
      );
    }

    if (contactPhoneNumber && !contactPhoneNumber.startsWith('+')) {
      if (contactPhoneNumber.startsWith('55')) {
        contactPhoneNumber = '+' + contactPhoneNumber;
      } else if (contactPhoneNumber.length >= 10) {
        contactPhoneNumber = '+55' + contactPhoneNumber;
      }
    }

    // EARLY RETURNS OTIMIZADOS - Validações rápidas antes de processar logs pesados

    // Validação 1: Dados essenciais
    if (!eventType || !messageData) {
      conditionalLog(
        contactPhoneNumber,
        '⚠️ Webhook ignorado: sem dados relevantes'
      );
      return res.status(200).json({ status: 'ignored' });
    }

    // Validação 2: Tipo de evento
    if (!eventType.includes('message.')) {
      conditionalLog(
        contactPhoneNumber,
        '⚠️ Webhook ignorado: não é evento de mensagem'
      );
      return res.status(200).json({ status: 'ignored' });
    }

    // Logs otimizados - só executar se passar pelas validações
    conditionalLog(
      contactPhoneNumber,
      '📱 ContactId final para respond.io:',
      contactPhoneNumber
    );

    // Logs detalhados apenas em modo debug
    if (process.env.LOG_LEVEL === 'debug') {
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
    }

    // Log de Messaging Echo (sempre importante)
    if (isFromMe) {
      conditionalLog(
        contactPhoneNumber,
        '🔄 Processando mensagem do agente como Messaging Echo'
      );
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

    // VÍDEOS: Processamento otimizado - timeout reduzido e fallback mais rápido
    if (
      messageType === 'video' &&
      (!messageData.file || !messageData.file.url)
    ) {
      conditionalLog(
        contactPhoneNumber,
        '🎥 Vídeo detectado sem arquivo - processamento otimizado iniciado...'
      );

      // Timeout reduzido: 1 segundo em vez de 3
      await new Promise((resolve) => setTimeout(resolve, 1000));

         try {
         // Buscar mensagem com arquivo incluído usando retry
         const result = await retryManager.executeHttpWithRetry(
           () => digiSacApiService.getMessageWithFile(messageId),
           {
             operation: 'Buscar arquivo de vídeo DigiSac (tentativa 1)',
             webhookId: webhookId,
             messageId: messageId
           }
         );

        if (result.success && result.data) {
          conditionalLog(
            contactPhoneNumber,
            '📋 Resposta da API para vídeo (tentativa 1):',
            process.env.LOG_LEVEL === 'debug'
              ? JSON.stringify(result.data, null, 2)
              : { hasFile: !!result.data.file, hasUrl: !!result.data.file?.url }
          );

          // Verificar se o arquivo está disponível na resposta da API
          if (result.data.file && result.data.file.url) {
            conditionalLog(
              contactPhoneNumber,
              '✅ Arquivo de vídeo encontrado na primeira tentativa!'
            );
            // Atualizar dados da mensagem com os dados da API
            messageData = result.data;
          } else {
            conditionalLog(
              contactPhoneNumber,
              '⚠️ Arquivo de vídeo ainda não disponível - tentativa 2...'
            );
            // Segunda tentativa com timeout reduzido: 1 segundo em vez de 5
            await new Promise((resolve) => setTimeout(resolve, 1000));

             const retryResult = await retryManager.executeHttpWithRetry(
               () => digiSacApiService.getMessageWithFile(messageId),
               {
                 operation: 'Buscar arquivo de vídeo DigiSac (tentativa 2)',
                 webhookId: webhookId,
                 messageId: messageId
               }
             );
            if (retryResult.success && retryResult.data) {
              conditionalLog(
                contactPhoneNumber,
                '📋 Resposta da API para vídeo (tentativa 2):',
                process.env.LOG_LEVEL === 'debug'
                  ? JSON.stringify(retryResult.data, null, 2)
                  : {
                      hasFile: !!retryResult.data.file,
                      hasUrl: !!retryResult.data.file?.url,
                    }
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
                  '❌ Arquivo de vídeo não disponível após 2 tentativas - continuando com fallback'
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
    const processResult = respondIoApiService.processDigiSacMessage(
      messageData,
      messageType,
      contactPhoneNumber
    );

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

    const { messageBody, processedMessage } = processResult;

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

    // Enviar para TODOS os canais que usam este service_id - PROCESSAMENTO PARALELO
    alwaysLog(
      `[WEBHOOK][PARALLEL] Iniciando processamento paralelo para ${channelConfigs.length} canais`
    );

    // Criar array de promises para processamento paralelo
    const channelPromises = channelConfigs.map(async (channelConfig) => {
      try {
        // Criar instância temporária do serviço Respond.io com token do canal
        const channelRespondService = {
          baseURL: 'https://app.respond.io/custom/channel/webhook/',
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
          conditionalLog(
            contactPhoneNumber,
            `[WEBHOOK][ECHO] Enviando echo do vendedor para canal Respond.io`,
            {
              canal: channelConfig.custom_channel_id,
              vendedor: channelConfig.desc,
              contactId: contactPhoneNumber,
              texto: processedMessage.text,
              messageUserId: userId,
              channelUserId: channelConfig.digisac_user_id,
              isFromDifferentUser: userId !== channelConfig.digisac_user_id,
              willSendAnyway: true, // Sempre enviar independente do user_id
            }
          );

           // Para Messaging Echoes, usar os dados do contato que já foram buscados anteriormente
           respondResult = await retryManager.executeHttpWithRetry(
             () => sendMessageWithChannelToken(
               channelRespondService,
               processedMessage,
               messageId,
               contactPhoneNumber,
               timestamp,
               contactData, // Incluir dados completos do contato
               true
             ),
             {
               operation: 'Enviar Messaging Echo para respond.io',
               webhookId: webhookId,
               channelId: channelConfig.custom_channel_id,
               vendedor: channelConfig.desc
             }
           );
        } else {
          conditionalLog(
            contactPhoneNumber,
            `[WEBHOOK] Enviando mensagem do DigiSac para canal Respond.io`,
            {
              canal: channelConfig.custom_channel_id,
              vendedor: channelConfig.desc,
              contactId: contactPhoneNumber,
              texto: processedMessage.text,
              messageUserId: userId,
              channelUserId: channelConfig.digisac_user_id,
              isFromDifferentUser: userId !== channelConfig.digisac_user_id,
              willSendAnyway: true, // Sempre enviar independente do user_id
            }
          );

           respondResult = await retryManager.executeHttpWithRetry(
             () => sendMessageWithChannelToken(
               channelRespondService,
               processedMessage,
               messageId,
               contactPhoneNumber,
               timestamp,
               contactData, // Incluir dados completos do contato
               false
             ),
             {
               operation: 'Enviar mensagem DigiSac para respond.io',
               webhookId: webhookId,
               channelId: channelConfig.custom_channel_id,
               vendedor: channelConfig.desc
             }
           );
        }

        // Retornar resultado para este canal
        return {
          channelId: channelConfig.custom_channel_id,
          vendedor: channelConfig.desc,
          success: respondResult?.success || false,
          error: respondResult?.error || null,
          respondResult: respondResult,
        };
      } catch (error) {
        errorLog(`[WEBHOOK] Erro crítico ao processar canal/vendedor`, {
          canal: channelConfig.custom_channel_id,
          vendedor: channelConfig.desc,
          contactId: contactPhoneNumber,
          isEcho: isFromMe,
          messageId,
          error: error.message,
        });

        return {
          channelId: channelConfig.custom_channel_id,
          vendedor: channelConfig.desc,
          success: false,
          error: error.message,
          respondResult: null,
        };
      }
    });

    // Executar todas as promises em paralelo
    const startTime = Date.now();
    const allResults = await Promise.all(channelPromises);
    const endTime = Date.now();
    const processingTime = endTime - startTime;

    // Processar resultados
    let successCount = 0;
    let errorCount = 0;

    for (const result of allResults) {
      if (result.success) {
        alwaysLog(`[WEBHOOK] Mensagem entregue para canal/vendedor`, {
          canal: result.channelId,
          vendedor: result.vendedor,
          contactId: contactPhoneNumber,
          isEcho: isFromMe,
          messageId,
        });
        successCount++;
      } else {
        errorLog(`[WEBHOOK] Erro ao entregar mensagem para canal/vendedor`, {
          canal: result.channelId,
          vendedor: result.vendedor,
          contactId: contactPhoneNumber,
          isEcho: isFromMe,
          messageId,
          error: result.error,
        });
        errorCount++;
      }
    }

    // Log do resumo final com tempo de processamento
    alwaysLog(
      `[WEBHOOK][SERVICE ${serviceId}] Resumo do processamento paralelo:`,
      {
        totalCanais: channelConfigs.length,
        sucessos: successCount,
        erros: errorCount,
        tempoProcessamento: `${processingTime}ms`,
        messageId: messageId,
        isFromMe: isFromMe,
       }
     );

     // Marcar mensagem como processada no cache
     messageCache.markAsProcessed(messageToCheck, {
       webhookId: webhookId,
       successCount: successCount,
       errorCount: errorCount,
       channelsProcessed: channelConfigs.length
     });

     // Log de sucesso completo
     const totalProcessingTime = Date.now() - startTime;
     console.log('\n✅ WEBHOOK PROCESSADO COM SUCESSO');
     console.log(`🆔 Webhook ID: ${webhookId}`);
     console.log(`⏱️ Tempo de processamento: ${totalProcessingTime}ms`);
     console.log(`📨 Canais processados: ${successCount}/${channelConfigs.length}`);
     console.log(`✅ Sucessos: ${successCount}`);
     console.log(`❌ Erros: ${errorCount}`);
     console.log('='.repeat(100) + '\n');

     // Responder ao DigiSac que recebemos o webhook
     res
       .status(200)
       .json(formatSuccessResponse({
         webhookId: webhookId,
         processingTime: totalProcessingTime,
         channelsProcessed: channelConfigs.length,
         successCount: successCount,
         errorCount: errorCount
       }, 'Webhook processado com sucesso'));
   } catch (error) {
     const errorProcessingTime = Date.now() - startTime;
     
     // Log de erro completo
     console.error('\n❌ ERRO CRÍTICO NO WEBHOOK');
     console.error(`🆔 Webhook ID: ${webhookId}`);
     console.error(`⏱️ Tempo até erro: ${errorProcessingTime}ms`);
     console.error(`🔥 Erro: ${error.message}`);
     console.error(`📍 Stack trace:`);
     console.error(error.stack);
     console.error(`📦 Body recebido:`);
     console.error(JSON.stringify(req.body, null, 2));
     console.error('='.repeat(100) + '\n');

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
  const uptime = process.uptime();
  const memory = process.memoryUsage();
  
  res.json({
    status: 'healthy',
    service: 'DigiSac ↔ Respond.io Bridge',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    uptime: {
      seconds: Math.round(uptime),
      human: `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m ${Math.floor(uptime % 60)}s`
    },
    memory: {
      used: Math.round(memory.heapUsed / 1024 / 1024),
      total: Math.round(memory.heapTotal / 1024 / 1024),
      external: Math.round(memory.external / 1024 / 1024),
      rss: Math.round(memory.rss / 1024 / 1024)
    },
    config: {
      digiSac: digiSacApiService.getConfigInfo
        ? digiSacApiService.getConfigInfo()
        : 'N/A',
      respondIo: respondIoApiService.getConfigInfo(),
      refera: referaApiService.getConfigInfo(),
    },
    metrics: {
      cache: cache.getStats(),
      messageCache: messageCache.getStats(),
      retryManager: retryManager.getStats()
    },
    environment: {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      env: process.env.NODE_ENV || 'development'
    }
  });
});

/**
 * Endpoint para métricas detalhadas
 */
router.get('/metrics', (req, res) => {
  res.json({
    timestamp: new Date().toISOString(),
    service: 'DigiSac ↔ Respond.io Bridge',
    cache: {
      standard: cache.getStats(),
      messages: messageCache.getStats()
    },
    retry: retryManager.getStats(),
    system: {
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      cpu: process.cpuUsage(),
      platform: {
        node: process.version,
        os: process.platform,
        arch: process.arch
      }
    }
  });
});

/**
 * Endpoint para resetar métricas (útil para debug)
 */
router.post('/metrics/reset', (req, res) => {
  messageCache.resetStats();
  retryManager.resetStats();
  
  res.json({
    message: 'Métricas resetadas com sucesso',
    timestamp: new Date().toISOString()
  });
});

/**
 * Endpoint para ver status das mensagens em cache
 */
router.get('/cache/messages', (req, res) => {
  const limit = parseInt(req.query.limit) || 50;
  const messages = messageCache.listAll().slice(0, limit);
  
  res.json({
    total: messages.length,
    limit: limit,
    messages: messages,
    stats: messageCache.getStats(),
    timestamp: new Date().toISOString()
  });
});

/**
 * Endpoint para limpar cache de mensagens (útil para debug)
 */
router.post('/cache/clear', (req, res) => {
  messageCache.clear();
  
  res.json({
    message: 'Cache de mensagens limpo com sucesso',
    timestamp: new Date().toISOString()
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
