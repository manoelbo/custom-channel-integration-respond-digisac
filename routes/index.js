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

const SANDBOX_MODE = process.env.SANDBOX_MODE === 'true';
const SANDBOX_NUMBERS = (process.env.SANDBOX_NUMBERS || '')
  .split(',')
  .map((n) => n.trim())
  .filter(Boolean);

/**
 * Função helper para logs condicionais
 * Só mostra logs detalhados quando estiver no modo sandbox e para números autorizados
 * @param {string} phoneNumber - Número de telefone
 * @param {string} message - Mensagem do log
 * @param {any} data - Dados adicionais (opcional)
 */
function conditionalLog(phoneNumber, message, data = null) {
  // Sempre mostrar logs de erro
  if (message.includes('❌') || message.includes('⚠️')) {
    if (data) {
      console.log(message, data);
    } else {
      console.log(message);
    }
    return;
  }

  // Se não estiver no modo sandbox, só mostrar logs essenciais
  if (!SANDBOX_MODE) {
    if (
      message.includes('🚀') ||
      message.includes('✅') ||
      message.includes('📤')
    ) {
      if (data) {
        console.log(message, data);
      } else {
        console.log(message);
      }
    }
    return;
  }

  // Se estiver no modo sandbox, verificar se o número está autorizado
  if (SANDBOX_NUMBERS.includes(phoneNumber)) {
    if (data) {
      console.log(`[SANDBOX] ${message}`, data);
    } else {
      console.log(`[SANDBOX] ${message}`);
    }
  }
}

/**
 * Função helper para logs sempre visíveis (erros, health check, etc.)
 * @param {string} message - Mensagem do log
 * @param {any} data - Dados adicionais (opcional)
 */
function alwaysLog(message, data = null) {
  if (data) {
    console.log(message, data);
  } else {
    console.log(message);
  }
}

/**
 * Função para validar autenticação
 * @param {Object} req - Request object
 * @param {string} phoneNumber - Número de telefone para logs
 * @returns {Object} - { success: boolean, error?: Object }
 */
function validateAuthentication(req, phoneNumber) {
  const bearerToken = req.headers.authorization;
  conditionalLog(phoneNumber, '🔑 Bearer token recebido:', bearerToken);
  conditionalLog(
    phoneNumber,
    '🔑 CHANNEL_API_TOKEN configurado:',
    CHANNEL_API_TOKEN
  );

  if (!bearerToken) {
    alwaysLog('❌ Erro: Bearer token não encontrado');
    return {
      success: false,
      error: {
        status: 401,
        message: '401: UNAUTHORIZED - Bearer token não encontrado',
      },
    };
  }

  const token = bearerToken.substring(7, bearerToken.length);
  conditionalLog(phoneNumber, '🔑 Token extraído:', token);
  conditionalLog(phoneNumber, '🔑 Token esperado:', CHANNEL_API_TOKEN);
  conditionalLog(
    phoneNumber,
    '🔑 Tokens são iguais?',
    token === CHANNEL_API_TOKEN
  );

  if (token !== CHANNEL_API_TOKEN) {
    alwaysLog('❌ Erro: Token inválido');
    return {
      success: false,
      error: {
        status: 401,
        message: '401: UNAUTHORIZED - Token inválido',
      },
    };
  }

  conditionalLog(phoneNumber, '✅ Autenticação bem-sucedida');
  return { success: true };
}

/**
 * Função para validar dados da mensagem
 * @param {string} phoneNumber - Número de telefone
 * @param {Object} messageData - Dados da mensagem
 * @returns {Object} - { success: boolean, error?: Object }
 */
function validateMessageData(phoneNumber, messageData) {
  // Validar número de telefone brasileiro
  if (!phoneNumber || !isValidBrazilianPhone(phoneNumber)) {
    alwaysLog('❌ Erro: Número de telefone inválido:', phoneNumber);
    return {
      success: false,
      error: {
        status: 400,
        message: 'Número de telefone brasileiro inválido',
      },
    };
  }

  // Validar mensagem
  if (!messageData || !messageData.type) {
    alwaysLog('❌ Erro: Dados da mensagem inválidos');
    return {
      success: false,
      error: {
        status: 400,
        message: 'Dados da mensagem são obrigatórios',
      },
    };
  }

  conditionalLog(phoneNumber, '✅ Validações passaram');
  return { success: true };
}

/**
 * Função para criar mensagem DigiSac
 * @param {string} phoneNumber - Número de telefone
 * @param {Object} messageData - Dados da mensagem
 * @param {string} serviceId - ID do serviço (opcional)
 * @param {string} userId - ID do usuário (opcional)
 * @returns {Promise<DigiSacMessage>} - Mensagem DigiSac criada
 */
async function createDigiSacMessage(
  phoneNumber,
  messageData,
  serviceId = null,
  userId = null
) {
  // Criar mensagem DigiSac baseada no tipo
  const digiSacMessage = new DigiSacMessage();
  digiSacMessage.to = formatBrazilianPhoneNumber(phoneNumber);

  // Usar service_id e user_id dos parâmetros se fornecidos
  if (serviceId) {
    digiSacMessage.service_id = serviceId;
  }
  if (userId) {
    digiSacMessage.user_id = userId;
  }

  // Processar diferentes tipos de mensagem
  switch (messageData.type) {
    case 'text':
      digiSacMessage.type = 'text';
      digiSacMessage.text = messageData.text || '';
      break;

    case 'attachment':
      await processAttachmentMessage(
        digiSacMessage,
        messageData.attachment,
        phoneNumber
      );
      break;

    case 'location':
      digiSacMessage.type = 'text';
      digiSacMessage.text = `📍 Localização: ${
        messageData.address || 'Localização enviada'
      }\nLatitude: ${messageData.latitude}\nLongitude: ${
        messageData.longitude
      }`;
      break;

    case 'quick_reply':
      digiSacMessage.type = 'text';
      const replies = messageData.replies?.join(', ') || 'Opções disponíveis';
      digiSacMessage.text = `${
        messageData.title || 'Selecione uma opção'
      }\n\n${replies}`;
      break;

    default:
      throw new Error(`Tipo de mensagem não suportado: ${messageData.type}`);
  }

  return digiSacMessage;
}

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
  const authResult = validateAuthentication(req, phoneNumber);
  if (!authResult.success) {
    return res.status(authResult.error.status).json({
      error: {
        message: authResult.error.message,
      },
    });
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
    return res.status(validationResult.error.status).json({
      error: {
        message: validationResult.error.message,
      },
    });
  }

  try {
    // Criar mensagem DigiSac
    const digiSacMessage = await createDigiSacMessage(
      phoneNumber,
      messageData,
      serviceId,
      userId
    );

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
    const result = await digiSacApi.sendMessage(digiSacMessage);

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
      alwaysLog('❌ Erro do DigiSac:', result.error);
      const statusCode = result.error.code === 401 ? 401 : 400;
      res.status(statusCode).json({
        error: {
          message: result.error.message,
          details: result.error.details,
        },
      });
    }
  } catch (error) {
    alwaysLog(`❌ Erro no endpoint ${routeName}:`, error);

    // Verificar se é erro de tipo não suportado
    if (error.message.includes('Tipo de mensagem não suportado')) {
      return res.status(400).json({
        error: {
          message: error.message,
          supportedTypes: ['text', 'attachment', 'location', 'quick_reply'],
        },
      });
    }

    res.status(500).json({
      error: {
        message: 'Erro interno do servidor',
        details: error.message,
      },
    });
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
  console.log(`🔔 channelID recebido na rota: ${channelID}`);
  res.json({ status: 'ok', channelID });
});

/**
 * Processar mensagem de anexo (attachment)
 * @param {DigiSacMessage} digiSacMessage - Mensagem DigiSac
 * @param {Object} attachment - Dados do anexo do respond.io
 */
async function processAttachmentMessage(
  digiSacMessage,
  attachment,
  phoneNumber
) {
  try {
    conditionalLog(phoneNumber, '📎 Processando anexo:', attachment);

    // Baixar o arquivo da URL
    const fileResponse = await axios.get(attachment.url, {
      responseType: 'arraybuffer',
    });

    // Converter para base64
    const base64 = Buffer.from(fileResponse.data).toString('base64');

    // Determinar o tipo de arquivo baseado no attachment.type
    let mimeType = attachment.mimeType || 'application/octet-stream';
    let fileName = attachment.fileName || 'arquivo';

    switch (attachment.type) {
      case 'image':
        digiSacMessage.type = 'image';
        if (!mimeType.startsWith('image/')) {
          mimeType = 'image/jpeg'; // fallback
        }
        break;

      case 'video':
        digiSacMessage.type = 'video';
        if (!mimeType.startsWith('video/')) {
          mimeType = 'video/mp4'; // fallback para MP4
        }
        break;

      case 'audio':
        digiSacMessage.type = 'audio';
        if (!mimeType.startsWith('audio/')) {
          mimeType = 'audio/mpeg'; // fallback
        }
        break;

      case 'file':
        digiSacMessage.type = 'document';
        if (!mimeType.startsWith('application/')) {
          mimeType = 'application/pdf'; // fallback
        }
        break;

      default:
        digiSacMessage.type = 'text';
        digiSacMessage.text = `📎 Arquivo: ${
          attachment.description || 'Arquivo enviado'
        }`;
        return;
    }

    // Configurar o arquivo
    digiSacMessage.file = {
      base64: base64,
      mimetype: mimeType,
      name: fileName,
    };

    // Adicionar texto - usar descrição se existir, senão usar nome do arquivo
    if (attachment.description && attachment.description.trim() !== '') {
      digiSacMessage.text = attachment.description;
    } else {
      digiSacMessage.text = fileName;
    }

    conditionalLog(phoneNumber, '✅ Anexo processado com sucesso');
    conditionalLog(phoneNumber, '📎 Arquivo configurado:', {
      type: digiSacMessage.type,
      hasFile: !!digiSacMessage.file,
      fileName: fileName,
      mimeType: mimeType,
      base64Length: base64.length,
    });

    // Verificar se o arquivo foi configurado corretamente
    if (!digiSacMessage.file || !digiSacMessage.file.base64) {
      conditionalLog(
        phoneNumber,
        '❌ Erro: Arquivo não foi configurado corretamente'
      );
      throw new Error('Arquivo não foi configurado corretamente');
    }
  } catch (error) {
    conditionalLog(phoneNumber, '❌ Erro ao processar anexo:', error);
    // Fallback para texto
    digiSacMessage.type = 'text';
    digiSacMessage.text = `📎 Erro ao processar anexo: ${
      attachment.description || 'Arquivo não pôde ser processado'
    }`;
  }
}

/**
 * Função para processar arquivos recebidos do DigiSac
 * @param {Object} messageData - Dados da mensagem do DigiSac
 * @param {string} phoneNumber - Número de telefone
 * @returns {Object} - Dados da mensagem processada para respond.io
 */

async function processDigiSacFile(messageData, phoneNumber) {
  const file = messageData.file;

  // Esta verificação já é feita antes de chamar esta função
  if (!file || !file.url) {
    return null;
  }

  try {
    conditionalLog(phoneNumber, '📎 Processando arquivo do DigiSac:', {
      fileName: file.name,
      mimeType: file.mimetype,
      url: file.url,
    });

    // Determinar o tipo de mensagem baseado no MIME type
    let attachmentType = 'file';

    if (file.mimetype.startsWith('image/')) {
      attachmentType = 'image';
    } else if (file.mimetype.startsWith('audio/')) {
      attachmentType = 'audio';
    } else if (file.mimetype.startsWith('video/')) {
      attachmentType = 'video';
    } else if (file.mimetype === 'application/pdf') {
      attachmentType = 'file';
    } else {
      attachmentType = 'file';
    }

    return {
      type: 'attachment',
      attachment: {
        type: attachmentType,
        url: file.url, // Usar URL diretamente do DigiSac
        fileName: file.name,
        mimeType: file.mimetype,
        description: file.name, // Usar nome do arquivo como descrição
      },
    };
  } catch (error) {
    conditionalLog(phoneNumber, '❌ Erro ao processar arquivo:', error.message);
    return null;
  }
}

/**
 * Rota para recebimento de mensagens: FROM DigiSac TO respond.io
 * Endpoint: POST /digisac/webhook
 */
router.post('/digisac/webhook', async (req, res) => {
  try {
    // Verificar se é um evento de mensagem relevante
    const eventType = req.body.event;
    let messageData = req.body.data;

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
      const contactResult = await digiSacApi.getContactProfile(from);
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
        const result = await digiSacApi.getMessageWithFile(messageId);

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

            const retryResult = await digiSacApi.getMessageWithFile(messageId);
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

    // Processar mensagem baseada no tipo
    let messageBody = '';
    let processedMessage = null;

    // Para mensagens do tipo 'chat', o texto está diretamente no campo 'text'
    if (messageType === 'chat' || messageType === 'text') {
      messageBody =
        messageData.text ||
        messageData.body ||
        messageData.message ||
        messageData.content ||
        '';

      processedMessage = {
        type: 'text',
        text: messageBody,
      };
    } else {
      // Para tipos de mídia, sempre tentar processar como attachment
      if (
        ['image', 'audio', 'ptt', 'document', 'video'].includes(messageType)
      ) {
        conditionalLog(contactPhoneNumber, '📎 Processando mídia do DigiSac');
        processedMessage = await processDigiSacFile(
          messageData,
          contactPhoneNumber
        );

        if (processedMessage) {
          messageBody = `📎 ${processedMessage.attachment.fileName}`;
        } else {
          // Fallback se não conseguir processar
          switch (messageType) {
            case 'document':
              messageBody = `📄 Documento: arquivo`;
              break;
            case 'ptt':
            case 'audio':
              messageBody = '🎵 Mensagem de áudio';
              break;
            case 'image':
              messageBody = '🖼️ Imagem';
              break;
            case 'video':
              messageBody =
                '🎥 Vídeo: abrir no digisac ou no whatsapp para ver o vídeo';
              break;
            default:
              messageBody = `📎 Mídia (${messageType})`;
          }

          processedMessage = {
            type: 'text',
            text: messageBody,
          };
        }
      } else {
        // Para outros tipos (location, contact, sticker), usar texto
        switch (messageType) {
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

        processedMessage = {
          type: 'text',
          text: messageBody,
        };
      }
    }

    conditionalLog(
      contactPhoneNumber,
      '🔍 Message Body extraído:',
      messageBody
    );

    conditionalLog(
      contactPhoneNumber,
      '🔍 Mensagem processada:',
      processedMessage
    );

    // Validar dados essenciais
    if (!messageId || !from) {
      alwaysLog('❌ Webhook DigiSac: dados incompletos', {
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

    // Preparar dados para envio ao respond.io
    const webhookData = {
      channelId: process.env.RESPOND_IO_CHANNEL_ID || 'digisac_channel_001',
      contactId: contactPhoneNumber,
      events: [
        {
          type: isFromMe ? 'message_echo' : 'message',
          mId: messageId,
          timestamp: timestamp,
          message: processedMessage,
        },
      ],
    };

    // Adicionar informações do contato se disponíveis (para Messaging Echoes)
    if (isFromMe) {
      try {
        const contactResult = await digiSacApi.getContactProfile(from);
        if (contactResult.success && contactResult.data) {
          const contactData = contactResult.data.data || contactResult.data;
          webhookData.contact = {
            firstName: contactData.firstName || contactData.name || '',
            lastName: contactData.lastName || '',
            profilePic: contactData.profilePic || contactData.avatar || '',
            countryCode: contactData.countryCode || 'BR',
            email: contactData.email || '',
            phone: contactPhoneNumber,
            language: contactData.language || 'pt-BR',
          };
          conditionalLog(
            contactPhoneNumber,
            '👤 Dados do contato adicionados para Messaging Echo:',
            webhookData.contact
          );
        }
      } catch (error) {
        conditionalLog(
          contactPhoneNumber,
          '⚠️ Erro ao obter dados do contato para Messaging Echo:',
          error.message
        );
      }
    }

    conditionalLog(
      contactPhoneNumber,
      `📤 Enviando para respond.io (${
        isFromMe ? 'MESSAGING ECHO' : 'MESSAGE'
      }):`,
      webhookData
    );

    // Enviar para o webhook do respond.io
    const respondIoResponse = await axios({
      method: 'post',
      url: 'https://app.respond.io/custom/channel/webhook/',
      headers: {
        authorization: `Bearer ${CHANNEL_API_TOKEN}`,
        'content-type': 'application/json',
        'cache-control': 'no-cache',
      },
      data: webhookData,
    });

    conditionalLog(
      contactPhoneNumber,
      `✅ ${isFromMe ? 'Messaging Echo' : 'Mensagem'} enviada para respond.io:`,
      respondIoResponse.status
    );

    // Responder ao DigiSac que recebemos o webhook
    res.status(200).json({
      status: 'success',
      message: 'Webhook processado com sucesso',
    });
  } catch (error) {
    alwaysLog('❌ Erro no webhook DigiSac:', error);

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
    alwaysLog('❌ Erro ao verificar status:', error);
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
