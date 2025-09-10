/**
 * DigiSac API Service
 * Serviço para integração com a API do DigiSac
 * Documentação: https://documenter.getpostman.com/view/24605757/2sA3BhfaDg
 */

const axios = require('axios');
const https = require('https');
const { conditionalLog, apiLog, errorLog } = require('../utils/logger');
const { formatBrazilianPhoneNumber } = require('../utils/formatters');

// Configurações da API DigiSac
const DIGISAC_API_BASE_URL =
  process.env.DIGISAC_API_URL || 'https://api.sac.digital/v1';
const DIGISAC_API_TOKEN = process.env.DIGISAC_API_TOKEN || 'YOUR_DIGISAC_TOKEN';

/**
 * Classe para representar uma mensagem do DigiSac
 */
class DigiSacMessage {
  constructor() {
    this.to = ''; // Número do destinatário
    this.type = 'text'; // Tipo da mensagem (text, image, document, audio)
    this.text = ''; // Texto da mensagem (opcional para áudio)
    this.file = null; // Arquivo (base64, mimetype, name)
    this.service_id = null; // Será definido dinamicamente
    this.user_id = null; // Será definido dinamicamente
  }
}

/**
 * Classe para coleção de mensagens DigiSac
 */
class DigiSacMessageCollection {
  constructor() {
    this.messages = [];
  }
}

/**
 * Cliente da API DigiSac
 */
class DigiSacApiService {
  constructor() {
    this.baseURL = DIGISAC_API_BASE_URL;
    this.token = DIGISAC_API_TOKEN;
    this.headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.token}`,
      Accept: 'application/json',
    };

    // Criar instância axios com timeout e keep-alive
    this.http = axios.create({
      baseURL: this.baseURL,
      timeout: parseInt(process.env.HTTP_TIMEOUT_MS || '8000', 10),
      httpsAgent: new https.Agent({ 
        keepAlive: true, 
        maxSockets: 50,
        timeout: 60000 
      }),
      headers: this.headers,
    });
  }

  /**
   * Enviar mensagem via DigiSac
   * @param {DigiSacMessage} message - Mensagem a ser enviada
   * @returns {Promise<Object>}
   */
  async sendMessage(message) {
    try {
      // Construir payload baseado no tipo de mensagem
      let payload = {
        number: message.to, // Número do contato
        serviceId: message.service_id, // ID da conexão
      };

      // Adicionar userId se estiver definido
      if (message.user_id) {
        payload.userId = message.user_id;
      }

      // Adicionar texto se existir (exceto para áudio puro)
      if (message.text && message.text.trim() !== '') {
        payload.text = message.text;
      }

      // Adicionar arquivo se existir
      if (message.file) {
        payload.file = message.file;
        conditionalLog(message.to, '📎 Arquivo incluído no payload:', {
          fileName: message.file.name,
          mimeType: message.file.mimetype,
          base64Length: message.file.base64.length,
        });
      } else {
        conditionalLog(message.to, '⚠️ Nenhum arquivo encontrado na mensagem');
      }

      conditionalLog(message.to, '📤 Enviando mensagem DigiSac:', {
        payload,
        service_id: message.service_id,
        user_id: message.user_id,
      });

      const response = await this.http.post('/messages', payload);

      return {
        success: true,
        data: {
          message_id: response.data.id || `digisac_${Date.now()}`,
          status: response.data.status || 'sent',
          to: message.to,
          timestamp: new Date().toISOString(),
        },
      };
    } catch (error) {
      errorLog(
        '❌ Erro ao enviar mensagem DigiSac:',
        error.response?.data || error.message
      );

      return {
        success: false,
        error: {
          code: error.response?.status || 500,
          message: error.response?.data?.message || 'Erro ao enviar mensagem',
          details: error.response?.data || error.message,
        },
      };
    }
  }

  /**
   * Processar mensagem em lote
   * @param {DigiSacMessageCollection} messageCollection - Coleção de mensagens
   * @returns {Promise<Array>}
   */
  async sendBulkMessages(messageCollection) {
    const results = [];

    for (const message of messageCollection.messages) {
      const result = await this.sendMessage(message);
      results.push(result);
    }

    return results;
  }

  /**
   * Verificar status de uma mensagem
   * @param {string} messageId - ID da mensagem
   * @returns {Promise<Object>}
   */
  async getMessageStatus(messageId) {
    try {
      const response = await this.http.get(`/messages/${messageId}`);

      return {
        success: true,
        data: response.data,
      };
    } catch (error) {
      errorLog(
        '❌ Erro ao verificar status:',
        error.response?.data || error.message
      );

      return {
        success: false,
        error: {
          code: error.response?.status || 500,
          message: error.response?.data?.message || 'Erro ao verificar status',
        },
      };
    }
  }

  /**
   * Buscar mensagem com arquivos incluídos
   * @param {string} messageId - ID da mensagem
   * @returns {Promise<Object>}
   */
  async getMessageWithFile(messageId) {
    try {
      const url = `${this.baseURL}/messages/${messageId}?include[0]=file`;

      apiLog('🔍 [API DEBUG] Fazendo requisição para:', url);
      apiLog('🔍 [API DEBUG] Headers:', process.env.LOG_LEVEL === 'debug' ? JSON.stringify(this.headers, null, 2) : 'Headers configurados');

      const response = await this.http.get(`/messages/${messageId}?include[0]=file`);

      apiLog('✅ [API DEBUG] Resposta recebida:');
      apiLog('📋 [API DEBUG] Status:', response.status);
      apiLog(
        '📋 [API DEBUG] Headers:',
        process.env.LOG_LEVEL === 'debug' ? JSON.stringify(response.headers, null, 2) : 'Headers da resposta'
      );
      apiLog('📦 [API DEBUG] Body:', process.env.LOG_LEVEL === 'debug' ? JSON.stringify(response.data, null, 2) : 'Dados da resposta');

      return {
        success: true,
        data: response.data,
      };
    } catch (error) {
      errorLog('❌ [API DEBUG] Erro na requisição:');
      apiLog('📋 [API DEBUG] Status:', error.response?.status);
      apiLog(
        '📋 [API DEBUG] Headers:',
        process.env.LOG_LEVEL === 'debug' ? JSON.stringify(error.response?.headers, null, 2) : 'Headers do erro'
      );
      apiLog(
        '📦 [API DEBUG] Body:',
        process.env.LOG_LEVEL === 'debug' ? JSON.stringify(error.response?.data, null, 2) : 'Dados do erro'
      );
      apiLog('📦 [API DEBUG] Error:', error.message);

      return {
        success: false,
        error: {
          code: error.response?.status || 500,
          message:
            error.response?.data?.message ||
            'Erro ao buscar mensagem com arquivo',
        },
      };
    }
  }

  /**
   * Obter perfil de um contato
   * @param {string} phoneNumber - Número do telefone
   * @returns {Promise<Object>}
   */
  async getContactProfile(phoneNumber) {
    try {
      conditionalLog(
        phoneNumber,
        '🔍 DigiSac API - Buscando contato:',
        phoneNumber
      );
      conditionalLog(
        phoneNumber,
        '🔍 DigiSac API - URL:',
        `${this.baseURL}/contacts/${phoneNumber}`
      );
      conditionalLog(phoneNumber, '🔍 DigiSac API - Headers:', this.headers);

      const response = await this.http.get(`/contacts/${phoneNumber}`);

      conditionalLog(phoneNumber, '✅ DigiSac API - Resposta completa:');
      conditionalLog(phoneNumber, '📋 Status:', response.status);
      conditionalLog(
        phoneNumber,
        '📋 Headers:',
        process.env.LOG_LEVEL === 'debug' ? JSON.stringify(response.headers, null, 2) : 'Headers da resposta'
      );
      conditionalLog(
        phoneNumber,
        '📦 Body:',
        process.env.LOG_LEVEL === 'debug' ? JSON.stringify(response.data, null, 2) : 'Dados do contato'
      );

      return {
        success: true,
        data: response.data,
      };
    } catch (error) {
      errorLog('❌ DigiSac API - Erro ao obter perfil:');
      apiLog('📋 Status:', error.response?.status);
      apiLog('📋 Headers:', process.env.LOG_LEVEL === 'debug' ? JSON.stringify(error.response?.headers, null, 2) : 'Headers do erro');
      apiLog('📦 Body:', process.env.LOG_LEVEL === 'debug' ? JSON.stringify(error.response?.data, null, 2) : 'Dados do erro');
      apiLog('📦 Error:', error.message);

      return {
        success: false,
        error: {
          code: error.response?.status || 500,
          message: error.response?.data?.message || 'Erro ao obter perfil',
        },
      };
    }
  }

  /**
   * Criar mensagem DigiSac a partir de dados do respond.io
   * @param {string} phoneNumber - Número de telefone
   * @param {Object} messageData - Dados da mensagem
   * @param {string} serviceId - ID do serviço (opcional)
   * @param {string} userId - ID do usuário (opcional)
   * @returns {DigiSacMessage} - Mensagem DigiSac criada
   */
  createMessage(phoneNumber, messageData, serviceId = null, userId = null) {
    const digiSacMessage = new DigiSacMessage();
    digiSacMessage.to = formatBrazilianPhoneNumber(phoneNumber);

    // Usar service_id e user_id dos parâmetros se fornecidos
    if (serviceId) {
      digiSacMessage.service_id = serviceId;
      conditionalLog(phoneNumber, '🔧 Service ID definido:', serviceId);
    }
    if (userId) {
      digiSacMessage.user_id = userId;
      conditionalLog(phoneNumber, '🔧 User ID definido:', userId);
    }

    // Processar diferentes tipos de mensagem
    switch (messageData.type) {
      case 'text':
        digiSacMessage.type = 'text';
        digiSacMessage.text = messageData.text || '';
        break;

      case 'attachment':
        // O processamento de anexo será feito separadamente
        digiSacMessage.type = 'text'; // fallback
        digiSacMessage.text = messageData.text || '';
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
   * Processar anexo para mensagem DigiSac
   * @param {DigiSacMessage} digiSacMessage - Mensagem DigiSac
   * @param {Object} attachment - Dados do anexo
   * @param {string} phoneNumber - Número de telefone
   * @returns {Promise<void>}
   */
  async processAttachment(digiSacMessage, attachment, phoneNumber) {
    try {
      conditionalLog(phoneNumber, '📎 Processando anexo:', attachment);

      // Baixar o arquivo da URL (usar axios separado para URLs externas)
      const fileResponse = await axios.get(attachment.url, {
        responseType: 'arraybuffer',
        timeout: parseInt(process.env.HTTP_TIMEOUT_MS || '8000', 10),
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
   * Processar arquivo recebido do DigiSac
   * @param {Object} messageData - Dados da mensagem do DigiSac
   * @param {string} phoneNumber - Número de telefone
   * @returns {Object|null} - Dados da mensagem processada para respond.io
   */
  processDigiSacFile(messageData, phoneNumber) {
    // DigiSac usa campo 'files' (array) em vez de 'file' (objeto)
    const files = messageData.files;
    const file = files && Array.isArray(files) && files.length > 0 ? files[0] : null;

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
      conditionalLog(
        phoneNumber,
        '❌ Erro ao processar arquivo:',
        error.message
      );
      return null;
    }
  }
}

// Instância singleton da API DigiSac
const digiSacApiService = new DigiSacApiService();

module.exports = {
  DigiSacMessage,
  DigiSacMessageCollection,
  DigiSacApiService,
  digiSacApiService,
};
