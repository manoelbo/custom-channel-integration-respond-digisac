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
 * Rota para envio de mensagens: FROM respond.io TO DigiSac
 * Endpoint: POST /message
 */
router.post('/message', async (req, res) => {
  alwaysLog('🚀 Endpoint /message chamado');

  // Extrair dados da requisição do respond.io
  const phoneNumber = req.body.contactId || req.body.number;
  const messageData = req.body.message || req.body;

  conditionalLog(phoneNumber, '📋 Headers recebidos:', req.headers);
  conditionalLog(
    phoneNumber,
    '📦 Body recebido:',
    JSON.stringify(req.body, null, 2)
  );

  /**
   * Autenticação
   * Verificar o bearer token do cabeçalho da requisição
   * Comparar com o token da API do respond.io
   */
  const bearerToken = req.headers.authorization;
  conditionalLog(phoneNumber, '🔑 Bearer token recebido:', bearerToken);
  conditionalLog(
    phoneNumber,
    '🔑 CHANNEL_API_TOKEN configurado:',
    CHANNEL_API_TOKEN
  );

  if (!bearerToken) {
    alwaysLog('❌ Erro: Bearer token não encontrado');
    return res.status(401).json({
      error: {
        message: '401: UNAUTHORIZED - Bearer token não encontrado',
      },
    });
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
    return res.status(401).json({
      error: {
        message: '401: UNAUTHORIZED - Token inválido',
      },
    });
  }

  conditionalLog(phoneNumber, '✅ Autenticação bem-sucedida');

  conditionalLog(phoneNumber, '📱 Número de telefone extraído:', phoneNumber);
  conditionalLog(
    phoneNumber,
    '💬 Dados da mensagem:',
    JSON.stringify(messageData, null, 2)
  );

  // Validar número de telefone brasileiro
  if (!phoneNumber || !isValidBrazilianPhone(phoneNumber)) {
    alwaysLog('❌ Erro: Número de telefone inválido:', phoneNumber);
    return res.status(400).json({
      error: {
        message: 'Número de telefone brasileiro inválido',
      },
    });
  }

  // Validar mensagem
  if (!messageData || !messageData.type) {
    alwaysLog('❌ Erro: Dados da mensagem inválidos');
    return res.status(400).json({
      error: {
        message: 'Dados da mensagem são obrigatórios',
      },
    });
  }

  conditionalLog(phoneNumber, '✅ Validações passaram');

  // Criar mensagem DigiSac baseada no tipo
  const digiSacMessage = new DigiSacMessage();
  digiSacMessage.to = formatBrazilianPhoneNumber(phoneNumber);

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
      alwaysLog('❌ Erro: Tipo de mensagem não suportado:', messageData.type);
      return res.status(400).json({
        error: {
          message: 'Tipo de mensagem não suportado',
          supportedTypes: ['text', 'attachment', 'location', 'quick_reply'],
        },
      });
  }

  conditionalLog(phoneNumber, '📤 Enviando mensagem para DigiSac:', {
    to: digiSacMessage.to,
    type: digiSacMessage.type,
    text: digiSacMessage.text,
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
  digiSacApi
    .sendMessage(digiSacMessage)
    .then((result) => {
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
    })
    .catch((error) => {
      alwaysLog('❌ Erro no endpoint /message:', error);
      res.status(500).json({
        error: {
          message: 'Erro interno do servidor',
          details: error.message,
        },
      });
    });
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

  if (!file || !file.url) {
    conditionalLog(phoneNumber, '⚠️ Arquivo não encontrado na mensagem');
    return null;
  }

  try {
    conditionalLog(phoneNumber, '📎 Processando arquivo do DigiSac:', {
      fileName: file.name,
      mimeType: file.mimetype,
      url: file.url,
    });

    // Sempre baixar o arquivo e converter para base64 para garantir compatibilidade
    conditionalLog(phoneNumber, '🔄 Baixando arquivo para conversão base64...');

    try {
      const downloadResponse = await axios.get(file.url, {
        responseType: 'arraybuffer',
        timeout: 30000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; DigiSac-Integration/1.0)',
        },
      });

      const buffer = Buffer.from(downloadResponse.data);
      const base64 = buffer.toString('base64');

      conditionalLog(phoneNumber, '✅ Arquivo baixado com sucesso:', {
        fileName: file.name,
        size: buffer.length,
        base64Length: base64.length,
      });
    } catch (downloadError) {
      conditionalLog(
        phoneNumber,
        '❌ Falha ao baixar arquivo:',
        downloadError.message
      );

      // Se não conseguir baixar, enviar como texto com informações do arquivo
      return {
        type: 'text',
        text: `📎 ${file.name} (${file.mimetype}) - Arquivo não acessível`,
      };
    }

    // Determinar o tipo de mensagem baseado no MIME type
    let messageType = 'attachment';
    let attachmentType = 'file';

    if (file.mimetype.startsWith('image/')) {
      messageType = 'attachment';
      attachmentType = 'image';
    } else if (file.mimetype.startsWith('audio/')) {
      messageType = 'attachment';
      attachmentType = 'audio';
    } else if (file.mimetype.startsWith('video/')) {
      messageType = 'attachment';
      attachmentType = 'video';
    } else if (file.mimetype === 'application/pdf') {
      messageType = 'attachment';
      attachmentType = 'file';
    } else {
      messageType = 'attachment';
      attachmentType = 'file';
    }

    return {
      type: messageType,
      attachment: {
        type: attachmentType,
        url: `data:${file.mimetype};base64,${base64}`,
        fileName: file.name,
        mimeType: file.mimetype,
        size: buffer.length,
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
    const messageData = req.body.data;

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

    // Ignorar mensagens que enviamos (isFromMe: true)
    if (messageData.isFromMe === true) {
      conditionalLog(
        contactPhoneNumber,
        '⚠️ Webhook ignorado: mensagem enviada por nós'
      );
      return res.status(200).json({ status: 'ignored' });
    }

    // Só processar eventos de mensagem criada ou atualizada
    if (!eventType.includes('message.')) {
      conditionalLog(
        contactPhoneNumber,
        '⚠️ Webhook ignorado: não é evento de mensagem'
      );
      return res.status(200).json({ status: 'ignored' });
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
        ['image', 'video', 'audio', 'ptt', 'document'].includes(messageType)
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
              messageBody = '🎥 Vídeo';
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

    // SANDBOX: só processa se o número estiver na lista
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

    // Preparar dados para envio ao respond.io
    const webhookData = {
      channelId: process.env.RESPOND_IO_CHANNEL_ID || 'digisac_channel_001',
      contactId: contactPhoneNumber,
      events: [
        {
          type: 'message',
          mId: messageId,
          timestamp: timestamp,
          message: processedMessage,
        },
      ],
    };

    conditionalLog(
      contactPhoneNumber,
      '📤 Enviando para respond.io:',
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
      '✅ Mensagem enviada para respond.io:',
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
